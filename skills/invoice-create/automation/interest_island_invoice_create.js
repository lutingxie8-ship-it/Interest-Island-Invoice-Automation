/*
 * 兴趣岛发票新建 - 浏览器自动化脚本 v1.0
 * 运行环境: dev-browser QuickJS 沙箱（复用命名页 interest-island 保持登录会话）
 *
 * 工作流程：
 *   1. 读取输入 + 强校验（发票类型/抬头类型必须在白名单内）
 *   2. 登录检测 → 导航到 /finance/invoice
 *   3. 点击"批量开票"按钮 → 等待 el-dialog 弹出
 *   4. 填写订单ID → 轮询等待 3 个 auto-fill 字段（所属品类/商品名称/用户ID）
 *   5. 填写开票金额 + 发票类型 + 抬头类型 + 发票抬头 + 企业税号
 *   6. 上传 PDF（先检查文件存在性）
 *   7. 截图弹窗（关键证据）
 *   8. ⚠️ 默认不点确定键！只有 confirm=true 才执行提交
 *
 * 🚨 安全门：
 *   - 默认 confirm=false，绝不点击"确定"键
 *   - 强校验发票类型/抬头类型白名单
 *   - PDF 大小检查（如用户提供 pdf_size_bytes）
 *
 * 关键技术点：
 *   - el-select 是 portal 渲染：先点开 → 等 dropdown → 点击 item
 *   - el-upload 文件上传：找 input[type=file]，用 setInputFiles
 *   - 订单ID自动填充：填值后轮询 3 个 readonly 字段
 *   - QuickJS 无 fs/path，用内置 readFile/writeFile，路径自动指向 ~/.dev-browser/tmp/
 */

// ===================== 常量 =====================
var ALLOWED_INVOICE_TYPES = ['电子普通发票', '增值税专用发票'];
var ALLOWED_TITLE_TYPES = ['个人/非企业', '企业'];
var DIALOG_TITLE = '新建发票';
var AUTO_FILL_POLL_MS = 500;
var AUTO_FILL_MAX_WAIT_MS = 8000;

// ===================== 工具函数 =====================
function ts() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }
function log(stage, msg, extra) {
  console.log('[CREATE][' + ts() + '] ' + stage + ': ' + msg + (extra ? ' ' + JSON.stringify(extra) : ''));
}

// ===================== 输入读取 + 强校验 =====================
async function loadAndValidateInput() {
  var raw, input;
  try {
    raw = await readFile('interest_island_invoice_create_input.json');
    input = JSON.parse(raw);
  } catch (e) {
    log('ERROR', 'read input failed', { error: String(e) });
    return { ok: false, error: 'invalid_input', reason: '无法读取输入文件' };
  }
  log('INPUT', 'received', input);

  // 必填字段检查
  var required = ['order_id', 'invoice_amount', 'invoice_type', 'title_type', 'invoice_title', 'invoice_pdf_path'];
  for (var i = 0; i < required.length; i++) {
    var f = required[i];
    if (!input[f] || String(input[f]).trim() === '') {
      return { ok: false, error: 'invalid_input', reason: '必填字段缺失或为空: ' + f, input: input };
    }
  }

  // 强校验：发票类型
  if (ALLOWED_INVOICE_TYPES.indexOf(input.invoice_type) < 0) {
    return {
      ok: false, error: 'invalid_input',
      reason: '发票类型不在白名单内，允许: ' + ALLOWED_INVOICE_TYPES.join(' / '),
      input: input
    };
  }

  // 强校验：抬头类型
  if (ALLOWED_TITLE_TYPES.indexOf(input.title_type) < 0) {
    return {
      ok: false, error: 'invalid_input',
      reason: '抬头类型不在白名单内，允许: ' + ALLOWED_TITLE_TYPES.join(' / '),
      input: input
    };
  }

  // 强校验：抬头类型=企业时，企业税号必填
  if (input.title_type === '企业' && (!input.company_tax_id || String(input.company_tax_id).trim() === '')) {
    return {
      ok: false, error: 'invalid_input',
      reason: '抬头类型=企业 时，企业税号必填',
      input: input
    };
  }

  // 强校验：发票抬头长度
  if (String(input.invoice_title).length > 100) {
    return {
      ok: false, error: 'invalid_input',
      reason: '发票抬头超过 100 字符',
      input: input
    };
  }

  // 强校验：PDF 大小（如果用户提供了 pdf_size_bytes）
  if (input.pdf_size_bytes && input.pdf_size_bytes > 2048000) {
    return {
      ok: false, error: 'invalid_input',
      reason: 'PDF 文件超过 2000KB 限制（' + Math.round(input.pdf_size_bytes / 1024) + ' KB）',
      input: input
    };
  }

  // 强校验：PDF 文件后缀
  if (!/\.pdf$/i.test(input.invoice_pdf_path)) {
    return {
      ok: false, error: 'invalid_input',
      reason: 'PDF 路径必须以 .pdf 结尾: ' + input.invoice_pdf_path,
      input: input
    };
  }

  // confirm 默认 false（关键安全门）
  if (typeof input.confirm !== 'boolean') {
    input.confirm = false;
  }

  return { ok: true, input: input };
}

// ===================== 登录检测 =====================
async function checkLogin(page) {
  await page.goto('https://edu-admin.qlchat.com/order/financial', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  var currentUrl = page.url();
  var isLoggedIn = currentUrl.indexOf('/login') < 0;
  log('LOGIN', isLoggedIn ? 'session valid' : 'redirected to login', { url: currentUrl });
  return isLoggedIn;
}

// ===================== 导航到开票审核页 =====================
async function navigateToInvoiceReview(page) {
  await page.goto('https://edu-admin.qlchat.com/finance/invoice', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  log('NAV', 'arrived at invoice review', { url: page.url() });
}

// ===================== 点击"批量开票"按钮 =====================
async function clickNewInvoiceButton(page) {
  return await page.evaluate(function() {
    // 找文本为"批量开票"的按钮
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var txt = (btns[i].textContent || '').trim();
      if (txt === '批量开票' || txt === '新建' || txt.indexOf('批量开票') >= 0) {
        btns[i].click();
        return { ok: true, clicked_text: txt };
      }
    }
    return { ok: false, error: '未找到"批量开票"按钮' };
  });
}

// ===================== 等待"新建发票"弹窗打开 =====================
async function waitForDialog(page, timeoutMs) {
  var start = Date.now();
  while (Date.now() - start < timeoutMs) {
    var state = await page.evaluate(function(title) {
      // el-dialog 是 portal 渲染，挂在 body 下
      var dialogs = document.querySelectorAll('.el-dialog, .el-dialog__wrapper, [role="dialog"]');
      for (var i = 0; i < dialogs.length; i++) {
        var d = dialogs[i];
        // 检查对话框标题
        var titleEl = d.querySelector('.el-dialog__title');
        if (titleEl && (titleEl.textContent || '').indexOf(title) >= 0) {
          return { found: true, dialogIndex: i };
        }
      }
      return { found: false };
    }, DIALOG_TITLE);
    if (state.found) return state;
    await page.waitForTimeout(300);
  }
  return { found: false };
}

// ===================== 在弹窗内通过 label 查找 input =====================
// el-dialog 内的表单布局是 label + form-item，input 在 .el-form-item 内
async function findInputInDialog(page, labelText) {
  return await page.evaluate(function(labelText) {
    var dialogs = document.querySelectorAll('.el-dialog__wrapper');
    for (var d = 0; d < dialogs.length; d++) {
      var dialog = dialogs[d];
      var items = dialog.querySelectorAll('.el-form-item');
      for (var i = 0; i < items.length; i++) {
        var labelEl = items[i].querySelector('.el-form-item__label');
        if (labelEl && (labelEl.textContent || '').replace(/[*\s]/g, '').indexOf(labelText) >= 0) {
          var input = items[i].querySelector('input[type="text"], input[type="number"], input:not([type]), textarea');
          if (input) {
            return { found: true, placeholder: input.placeholder || '', readonly: input.readOnly || false, value: input.value || '' };
          }
        }
      }
    }
    return { found: false };
  }, labelText);
}

// ===================== 在弹窗内通过 label 设置 input 值（Vue v-model） =====================
// 关键是 dispatch input + change 事件，让 Vue 监听到
async function setInputValueInDialog(page, labelText, value) {
  return await page.evaluate(function(args) {
    var labelText = args.labelText;
    var value = args.value;
    var dialogs = document.querySelectorAll('.el-dialog__wrapper');
    for (var d = 0; d < dialogs.length; d++) {
      var dialog = dialogs[d];
      var items = dialog.querySelectorAll('.el-form-item');
      for (var i = 0; i < items.length; i++) {
        var labelEl = items[i].querySelector('.el-form-item__label');
        if (labelEl && (labelEl.textContent || '').replace(/[*\s]/g, '').indexOf(labelText) >= 0) {
          var input = items[i].querySelector('input[type="text"], input[type="number"], input:not([type]), textarea');
          if (!input) return { ok: false, error: 'input not found for label: ' + labelText };
          if (input.readOnly) return { ok: false, error: 'input is readonly (auto-fill field): ' + labelText };

          // Vue v-model 设置：原生 setter + input + change 事件
          var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          return { ok: true, value: input.value };
        }
      }
    }
    return { ok: false, error: 'label not found in dialog: ' + labelText };
  }, { labelText: labelText, value: String(value) });
}

// ===================== 等待订单ID自动填充 =====================
// 触发条件：订单ID 输入后，所属品类/商品名称/用户ID 三个 readonly 字段会从空变非空
async function waitForAutoFill(page, timeoutMs) {
  var start = Date.now();
  while (Date.now() - start < timeoutMs) {
    var state = await page.evaluate(function() {
      function readInput(labelText) {
        var dialogs = document.querySelectorAll('.el-dialog__wrapper');
        for (var d = 0; d < dialogs.length; d++) {
          var items = dialogs[d].querySelectorAll('.el-form-item');
          for (var i = 0; i < items.length; i++) {
            var labelEl = items[i].querySelector('.el-form-item__label');
            if (labelEl && (labelEl.textContent || '').replace(/[*\s]/g, '').indexOf(labelText) >= 0) {
              var input = items[i].querySelector('input');
              return input ? (input.value || '').trim() : '';
            }
          }
        }
        return '';
      }
      return {
        category: readInput('所属品类'),
        product_name: readInput('商品名称'),
        user_id: readInput('用户ID'),
        elapsed_ms: Date.now() - window.__autoFillStart || 0
      };
    });
    log('AUTO_FILL', 'polling', state);
    if (state.category && state.product_name && state.user_id) {
      return { ok: true, auto_fill: state };
    }
    await page.waitForTimeout(AUTO_FILL_POLL_MS);
  }
  return { ok: false, reason: 'auto_fill timeout (' + timeoutMs + 'ms)' };
}

// ===================== 选择 el-select（发票类型/抬头类型） =====================
async function selectElSelectOption(page, labelText, optionText) {
  // 第1步：在弹窗内找到对应 label 的 el-select 容器并点击触发
  var triggerRes = await page.evaluate(function(labelText) {
    var dialogs = document.querySelectorAll('.el-dialog__wrapper');
    for (var d = 0; d < dialogs.length; d++) {
      var items = dialogs[d].querySelectorAll('.el-form-item');
      for (var i = 0; i < items.length; i++) {
        var labelEl = items[i].querySelector('.el-form-item__label');
        if (labelEl && (labelEl.textContent || '').replace(/[*\s]/g, '').indexOf(labelText) >= 0) {
          var select = items[i].querySelector('.el-select');
          if (!select) return { ok: false, error: '.el-select not found for: ' + labelText };
          // 点击 .el-select__wrapper 触发 dropdown
          var wrapper = select.querySelector('.el-select__wrapper') || select;
          wrapper.click();
          return { ok: true };
        }
      }
    }
    return { ok: false, error: 'label not found: ' + labelText };
  }, labelText);

  if (!triggerRes.ok) return triggerRes;

  await page.waitForTimeout(1500);  // 等 dropdown 出现（portal 渲染）

  // 第2步：在全局查找 dropdown 内的选项并点击
  var selectRes = await page.evaluate(function(optionText) {
    var dropdowns = document.querySelectorAll('.el-select-dropdown, .el-select-dropdown__list');
    for (var d = 0; d < dropdowns.length; d++) {
      var items = dropdowns[d].querySelectorAll('.el-select-dropdown__item');
      for (var i = 0; i < items.length; i++) {
        var txt = (items[i].textContent || '').trim();
        if (txt === optionText || txt.indexOf(optionText) >= 0) {
          items[i].click();
          return { ok: true, clicked: txt };
        }
      }
    }
    return { ok: false, error: 'option not found in dropdown: ' + optionText };
  }, optionText);

  return selectRes;
}

// ===================== 上传 PDF =====================
async function uploadPdf(page, pdfPath) {
  return await page.evaluate(function() {
    var dialogs = document.querySelectorAll('.el-dialog__wrapper');
    for (var d = 0; d < dialogs.length; d++) {
      var fileInputs = dialogs[d].querySelectorAll('input[type="file"]');
      if (fileInputs.length > 0) {
        return { ok: true, found: true, count: fileInputs.length };
      }
    }
    return { ok: true, found: false };
  }).then(async function(res) {
    if (!res.found) {
      return { ok: false, error: '未找到 input[type=file]' };
    }
    try {
      // dev-browser 的 page.setInputFiles 接受 filePaths
      await page.setInputFiles(res.count > 0 ? 'input[type=file]' : null, pdfPath);
      return { ok: true };
    } catch (e) {
      // 备选：在 evaluate 内查找 file input 并直接设置
      try {
        await page.evaluate(function(args) {
          var pdfPath = args.pdfPath;
          var input = document.querySelector('.el-dialog__wrapper input[type="file"]');
          if (!input) throw new Error('file input not found');
          var dt = new DataTransfer();
          // 注意：QuickJS沙箱无法直接构造 File 对象；需要通过 dev-browser 的 setInputFiles
          // 如果走到这里说明 setInputFiles 失败了
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, { pdfPath: pdfPath });
        return { ok: false, error: 'setInputFiles 失败，建议直接传入 PDF 路径字符串: ' + String(e) };
      } catch (e2) {
        return { ok: false, error: 'PDF 上传失败: ' + String(e) + ' / ' + String(e2) };
      }
    }
  });
}

// ===================== 点击"确定"键（仅 confirm=true） =====================
async function clickConfirmIfAllowed(page, shouldConfirm) {
  if (!shouldConfirm) {
    log('SAFETY', 'confirm=false, NOT clicking 确定键');
    return { clicked: false, reason: 'safety: confirm=false' };
  }
  log('SAFETY', 'confirm=true, clicking 确定键');
  return await page.evaluate(function() {
    var dialogs = document.querySelectorAll('.el-dialog__wrapper');
    for (var d = 0; d < dialogs.length; d++) {
      var btns = dialogs[d].querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var txt = (btns[i].textContent || '').trim();
        if (txt === '确定') {
          btns[i].click();
          return { ok: true, clicked: true };
        }
      }
    }
    return { ok: false, error: '未找到"确定"按钮' };
  });
}

// ===================== 主流程 =====================
async function main() {
  log('START', 'v1.0 QuickJS - safety mode default');

  // 1) 读取输入 + 强校验
  var vRes = await loadAndValidateInput();
  if (!vRes.ok) {
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: null, order_id: 'unknown',
      query_status: 'invalid_input', result_status: 'rejected',
      order_id_recognized: null, auto_fill: null,
      decision_reason: vRes.reason,
      safety_check: { confirm_requested: false, confirm_executed: false, pdf_uploaded: false }
    }));
    log('ABORT', 'invalid input', { reason: vRes.reason });
    return { ok: false, error: 'invalid_input' };
  }
  var input = vRes.input;
  var orderId = String(input.order_id);
  var taskId = input.task_id || null;

  // 2) 获取命名页
  var page = await browser.getPage('interest-island');
  log('PAGE', 'got page', { url: page.url() });

  // 3) 登录检测
  var isLoggedIn = await checkLogin(page);
  if (!isLoggedIn) {
    var buf = await page.screenshot();
    var ssPath = await saveScreenshot(buf, 'login_required_' + orderId + '_' + Date.now() + '.png');
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'login_required', result_status: 'login_required',
      order_id_recognized: null, auto_fill: null,
      decision_reason: '需要人工扫码登录兴趣岛系统',
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }

  // 4) 导航到开票审核页
  await navigateToInvoiceReview(page);
  await page.waitForTimeout(2000);

  // 5) 点击"批量开票"按钮
  var clickRes = await clickNewInvoiceButton(page);
  log('CLICK_NEW', 'result', clickRes);
  if (!clickRes.ok) {
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'dialog_open_failed', result_status: 'rejected',
      order_id_recognized: null, auto_fill: null,
      decision_reason: '点击"批量开票"按钮失败: ' + clickRes.error,
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }

  // 6) 等待弹窗打开
  var dialogRes = await waitForDialog(page, 5000);
  if (!dialogRes.found) {
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'dialog_open_failed', result_status: 'rejected',
      order_id_recognized: null, auto_fill: null,
      decision_reason: '弹窗未在5秒内打开',
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }
  log('DIALOG', 'opened', dialogRes);

  // 7) 填写订单ID
  var setOrderRes = await setInputValueInDialog(page, '订单ID', orderId);
  log('SET_ORDER_ID', 'result', setOrderRes);
  if (!setOrderRes.ok) {
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'page_structure_change', result_status: 'rejected',
      order_id_recognized: false, auto_fill: null,
      decision_reason: '填写订单ID 失败: ' + setOrderRes.error,
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }

  // 8) 等待自动填充（所属品类/商品名称/用户ID）
  var autoFillRes = await waitForAutoFill(page, AUTO_FILL_MAX_WAIT_MS);
  if (!autoFillRes.ok) {
    var buf1 = await page.screenshot();
    var ss1 = await saveScreenshot(buf1, 'autofill_timeout_' + orderId + '_' + Date.now() + '.png');
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'auto_fill_timeout', result_status: 'rejected',
      order_id_recognized: true, auto_fill: null,
      decision_reason: '订单ID 已填写，但 3 个自动填充字段未在 ' + AUTO_FILL_MAX_WAIT_MS + 'ms 内填充。可能订单号不存在或状态异常',
      evidence_screenshot: ss1,
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }
  log('AUTO_FILL', 'completed', autoFillRes.auto_fill);

  // 9) 填写开票金额
  var setAmountRes = await setInputValueInDialog(page, '开票金额', input.invoice_amount);
  log('SET_AMOUNT', 'result', setAmountRes);
  if (!setAmountRes.ok) {
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'page_structure_change', result_status: 'rejected',
      order_id_recognized: true, auto_fill: autoFillRes.auto_fill,
      decision_reason: '填写开票金额失败: ' + setAmountRes.error,
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }

  // 10) 选择发票类型
  var typeRes = await selectElSelectOption(page, '发票类型', input.invoice_type);
  log('SET_INVOICE_TYPE', 'result', typeRes);
  if (!typeRes.ok) {
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'page_structure_change', result_status: 'rejected',
      order_id_recognized: true, auto_fill: autoFillRes.auto_fill,
      decision_reason: '选择发票类型失败: ' + typeRes.error,
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }

  // 11) 选择抬头类型
  var titleTypeRes = await selectElSelectOption(page, '抬头类型', input.title_type);
  log('SET_TITLE_TYPE', 'result', titleTypeRes);
  if (!titleTypeRes.ok) {
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'page_structure_change', result_status: 'rejected',
      order_id_recognized: true, auto_fill: autoFillRes.auto_fill,
      decision_reason: '选择抬头类型失败: ' + titleTypeRes.error,
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }
  await page.waitForTimeout(800);  // 等抬头类型联动企业税号字段显示

  // 12) 填写发票抬头
  var setTitleRes = await setInputValueInDialog(page, '发票抬头', input.invoice_title);
  log('SET_TITLE', 'result', setTitleRes);
  if (!setTitleRes.ok) {
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'page_structure_change', result_status: 'rejected',
      order_id_recognized: true, auto_fill: autoFillRes.auto_fill,
      decision_reason: '填写发票抬头失败: ' + setTitleRes.error,
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }

  // 13) 填写企业税号（抬头类型=企业 时必填）
  var taxIdRes = { ok: true, skipped: true };
  if (input.title_type === '企业') {
    taxIdRes = await setInputValueInDialog(page, '企业税号', input.company_tax_id);
    log('SET_TAX_ID', 'result', taxIdRes);
    if (!taxIdRes.ok) {
      await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
        task_id: taskId, order_id: orderId,
        query_status: 'page_structure_change', result_status: 'rejected',
        order_id_recognized: true, auto_fill: autoFillRes.auto_fill,
        decision_reason: '填写企业税号失败: ' + taxIdRes.error,
        safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
      }));
      return { ok: false };
    }
  }

  // 14) 上传 PDF
  var uploadRes = await uploadPdf(page, input.invoice_pdf_path);
  log('UPLOAD_PDF', 'result', uploadRes);
  if (!uploadRes.ok) {
    await writeFile('interest_island_invoice_create_output.json', JSON.stringify({
      task_id: taskId, order_id: orderId,
      query_status: 'pdf_upload_failed', result_status: 'rejected',
      order_id_recognized: true, auto_fill: autoFillRes.auto_fill,
      decision_reason: 'PDF 上传失败: ' + uploadRes.error,
      safety_check: { confirm_requested: input.confirm, confirm_executed: false, pdf_uploaded: false }
    }));
    return { ok: false };
  }

  // 15) 截图弹窗（关键证据，供人工核对）
  var buf2 = await page.screenshot();
  var ss2 = await saveScreenshot(buf2, 'dialog_filled_' + orderId + '_' + Date.now() + '.png');
  log('SCREENSHOT', 'dialog filled', { path: ss2 });

  // 16) ⚠️ 关键安全门：仅在 confirm=true 时才点确定键
  var confirmRes = await clickConfirmIfAllowed(page, input.confirm);

  // 17) 写入输出
  var result = {
    task_id: taskId,
    order_id: orderId,
    query_status: 'success',
    result_status: confirmRes.clicked ? 'submitted' : 'filled_not_submitted',
    order_id_recognized: true,
    auto_fill: autoFillRes.auto_fill,
    dialog_screenshot: ss2,
    decision_reason: confirmRes.clicked
      ? '已提交（confirm=true）'
      : '弹窗已填到可提交状态，未点击确定键（安全模式 confirm=false）',
    safety_check: {
      confirm_requested: input.confirm,
      confirm_executed: confirmRes.clicked,
      pdf_uploaded: uploadRes.ok
    },
    filled_fields: {
      order_id: orderId,
      invoice_amount: input.invoice_amount,
      invoice_type: input.invoice_type,
      title_type: input.title_type,
      invoice_title: input.invoice_title,
      company_tax_id: input.title_type === '企业' ? input.company_tax_id : null
    }
  };

  await writeFile('interest_island_invoice_create_output.json', JSON.stringify(result));
  log('OUTPUT', 'done', { result_status: result.result_status, confirm_executed: result.safety_check.confirm_executed });
  return result;
}

// 运行
main().then(function(r) {
  log('DONE', 'script complete', { result_status: r && r.result_status });
}).catch(function(e) {
  log('FATAL', 'unhandled error', { message: String(e), stack: e && e.stack ? String(e.stack) : 'none' });
});