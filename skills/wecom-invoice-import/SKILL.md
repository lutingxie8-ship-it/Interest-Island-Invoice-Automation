---
name: wecom-invoice-import
description: "把税务局导出的Excel发票记录批量录入到企微在线表格。当用户说'把发票录入企微'、'导入发票到企微文档'、'Excel发票导入在线表格'、'批量录入开票记录'、'发票登记'时使用此skill。通过dev-browser浏览器自动化+剪贴板TSV粘贴技术，绕过企微无API权限/无企业认证的限制，实现自动读取Excel→导航到空行→粘贴提交的完整流程。"
agent_created: true
---

# 企微发票录入

把税务局导出的Excel发票记录，自动录入到企微在线表格末尾。

## 核心原理（必须理解）

企微在线表格是 **canvas渲染 + 协同编辑(mutation)** 架构：
- 引擎层 `setCellDataAtPosition` 只改内存，**不会提交到服务器**（刷新即丢）
- `keyboard.type()` 在canvas表格里**不响应**键盘事件
- `page.locator().click()` 被 `operate-board` 覆盖层**拦截**

**唯一可靠的写入方式**：`page.cua.click` 聚焦 → `navigator.clipboard.writeText` 写TSV → `Ctrl+V` 粘贴。粘贴走表格的正常paste事件处理，自动触发mutation提交到服务器。

## 前提条件

1. **首次使用运行环境检查**：`python "<skill目录>/scripts/setup.py"`，自动检查并安装缺失依赖（openpyxl 等）。WorkBuddy 用户通常 dev-browser 和 Python 都自带，只需补装 openpyxl（脚本会自动装）
2. **首次需扫码登录**：dev-browser 打开企微文档后用户扫码，登录态保持在 profile 里

## 初始化配置（首次使用时向用户确认以下信息）

| # | 信息 | 说明 |
|---|------|------|
| 1 | 企微文档分享链接 | `https://doc.weixin.qq.com/sheet/xxx`，从链接提取docid |
| 2 | Excel文件夹路径 | 如 `D:\开票记录\` |
| 3 | Excel文件名规则 | `{当天MMDD}全量发票查询导出结果.xlsx`（如今天7/28→`0728全量发票查询导出结果.xlsx`）。可能带` (1)`后缀（重复下载），查找时用glob `{MMDD}全量发票查询导出结果*.xlsx` |

**文件查找逻辑**：取当天日期格式化为 MMDD（如7月28日→`0728`），在文件夹里查找匹配 `{MMDD}全量发票查询导出结果*.xlsx` 的文件。注意：文件内容是**昨天的开票记录**，但文件名里的日期是**当天的**（导出日期）。

## 执行流程（6步）

### 第1步：读取Excel生成TSV

运行脚本读取Excel并输出TSV：

```bash
python "<skill目录>/scripts/read_excel_to_tsv.py" "<excel文件路径>"
```

脚本读取「信息汇总表」sheet，跳过表头和合计行，按映射提取7个字段，输出TSV到stdout。

**字段映射**（Excel信息汇总表 → 企微表格）：

| 企微列 | Excel列(序号) | Excel列名 | 处理 |
|--------|-------------|-----------|------|
| 开票日期 | 9 | 开票日期 | `2026-07-24 18:22:02` → `2026/7/24` |
| (空) | — | 发票代码 | 企微此列留空（用连续两个\t） |
| 发票号码 | 4 | 数电发票号码 | 直接取 |
| 发票类型 | 22 | 发票票种 | 直接取 |
| 开票名称 | 8 | 购买方名称 | 直接取 |
| 纳税人识别号 | 7 | 购方识别号 | None→空字符串 |
| 开票金额 | 20 | 价税合计 | 直接取 |
| 订单ID | 27 | 备注 | 直接取 |

TSV每行一条记录，列用`\t`分隔。将输出保存到临时文件供后续使用。

### 第2步：dev-browser打开企微文档并确认登录

```bash
dev-browser --browser wecom --idle-timeout 30m --timeout 120 <<'EOF'
const page = await browser.getPage("wecom-doc");
await page.goto("<文档链接>", { waitUntil: "domcontentloaded" });

// 等待引擎就绪：轮询 SpreadsheetApp.workbook，就绪即返回。
// ⚠️ 不要用固定 waitForTimeout(10000)——那是盲等，引擎通常 3-5s 就绪，盲等白等 5-7s。
async function waitForAppReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page.evaluate(() =>
      typeof window.SpreadsheetApp !== 'undefined'
      && window.SpreadsheetApp
      && !!window.SpreadsheetApp.workbook
      && !!window.SpreadsheetApp.worksheetManager
    );
    if (ok) return { ok: true, elapsed: Date.now() - start };
    await page.waitForTimeout(300);
  }
  return { ok: false, elapsed: timeoutMs };
}
const appReady = await waitForAppReady(20000);
const ready = appReady.ok
  ? await page.evaluate(() => ({ hasApp: true, hasWorkbook: true, title: document.title, elapsed_ms: appReady.elapsed }))
  : { hasApp: false, hasWorkbook: false, title: document.title, timeout: true, elapsed_ms: appReady.elapsed };
console.log(JSON.stringify(ready));
EOF
```

- `hasApp: true` → 已登录，继续第3步
- `hasApp: false` 或 `timeout: true` 或 title 含"登录" → 需扫码，截图给用户：
  ```js
  const buf = await page.screenshot();
  const path = await saveScreenshot(buf, "login.png");
  ```
  用Read读截图，提示用户在弹出的浏览器窗口扫码（企业身份或个人身份）。用户说"登录好了"后重新执行此步确认。

### 第3步：重复检查（录入前必做）

录入前先查企微文档内**最近两个不同开票日期**的记录，用发票号码对比，防止跨天补录重复。

**为什么要查两个日期**：文档里不一定每天都有记录（如周末没开票），所以不是固定查"昨天和前天"，而是查文档内**实际存在的最近两个日期**。比如要录0724的票，文档里最近的是0723和0720（0722没开票），就查这两个日期。

```bash
dev-browser --browser wecom --idle-timeout 30m --timeout 60 <<'EOF'
const page = await browser.getPage("wecom-doc");

// 1. 读取企微文档所有记录的开票日期(col 2)和发票号码(col 4)
const docData = await page.evaluate(() => {
  const app = window.SpreadsheetApp;
  const sheet = app.workbook.worksheetManager.getSheetBySheetId(app.workbook.worksheetManager.activeSheetId);
  const records = [];
  for (let r = 1; r < sheet.getRowCount(); r++) {
    const dCell = sheet.getCellDataAtPosition(r, 2);
    const nCell = sheet.getCellDataAtPosition(r, 4);
    const date = dCell && dCell.formattedValue ? dCell.formattedValue.value : '';
    const num = nCell && nCell.formattedValue ? nCell.formattedValue.value : '';
    if (date || num) records.push({ date, num });
  }
  return records;
});

// 2. 找distinct日期并排序（"2026/7/24"→Date对象排序）
const dateSet = new Set(docData.map(r => r.date).filter(Boolean));
const sortedDates = [...dateSet].sort((a, b) => {
  const pa = a.split('/').map(Number);
  const pb = b.split('/').map(Number);
  return new Date(pa[0], pa[1]-1, pa[2]) - new Date(pb[0], pb[1]-1, pb[2]);
});
const recentDates = sortedDates.slice(-2);

// 3. 读取这两个日期的所有发票号码
const existingNums = new Set(
  docData.filter(r => recentDates.includes(r.date)).map(r => r.num).filter(Boolean)
);

// 4. 从TSV提取Excel的发票号码（TSV第3列，split('\t')[2]）
const tsv = `<TSV内容（第1步输出）>`;
const excelNums = tsv.trim().split('\n').map(line => line.split('\t')[2]).filter(Boolean);

// 5. 对比找重复
const duplicates = excelNums.filter(n => existingNums.has(n));

console.log(JSON.stringify({
  docRecordCount: docData.length,
  recentDates,
  existingNumsInRecentDates: existingNums.size,
  excelNumsCount: excelNums.length,
  duplicatesCount: duplicates.length,
  duplicates: duplicates.slice(0, 20),
}));
EOF
```

**判断逻辑**：
- `duplicatesCount > 0` → **停止录入**，向用户报告重复的发票号码列表，让用户确认是否仍要录入
- `duplicatesCount === 0` → 无重复，继续第4步

### 第4步：导航到最后一行之后的空行

```bash
dev-browser --browser wecom --idle-timeout 30m --timeout 180 <<'EOF'
const page = await browser.getPage("wecom-doc");

// 1. 用引擎API找最后一行有数据的行号
const lastRow = await page.evaluate(() => {
  const app = window.SpreadsheetApp;
  const sheet = app.workbook.worksheetManager.getSheetBySheetId(app.workbook.worksheetManager.activeSheetId);
  for (let r = sheet.getRowCount() - 1; r >= 0; r--) {
    for (let c = 0; c < 10; c++) {
      const cell = sheet.getCellDataAtPosition(r, c);
      if (cell && cell.value !== undefined && cell.value !== null && cell.value !== '') return r;
    }
  }
  return 0;
});

// 2. page.cua点击A1区域聚焦表格（关键：不用locator.click，会被拦截）
await page.cua.click({ x: 25, y: 200 });
await page.waitForTimeout(800);

// 3. Ctrl+Home 回到A1
await page.keyboard.press('Control+Home');
await page.waitForTimeout(800);

// 4. ArrowDown到空行（lastRow+1次）
for (let i = 0; i < lastRow + 1; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(30);
}

// 5. Tab Tab 到开票日期列（跳过col 0空列和col 1公司列）
await page.keyboard.press('Tab');
await page.waitForTimeout(200);
await page.keyboard.press('Tab');
await page.waitForTimeout(300);

// 6. 截图确认地址栏
const shot = await page.cua.screenshot();
console.log(JSON.stringify({ shotPath: shot.path, lastRow, targetRow: lastRow + 1 }));
EOF
```

**用Read工具读截图**，确认编辑栏左侧地址栏显示正确的行号（如C25）。如果位置不对，用ArrowUp/Down微调。

### 第5步：写入剪贴板并Ctrl+V粘贴

```bash
dev-browser --browser wecom --idle-timeout 30m --timeout 120 <<'EOF'
const page = await browser.getPage("wecom-doc");
const tsv = `<TSV内容（第1步的输出）>`;

// 写入系统剪贴板
const clipOk = await page.evaluate(async (text) => {
  try { await navigator.clipboard.writeText(text); return "ok"; }
  catch(e) { return "err:" + e.message; }
}, tsv);

// Ctrl+V 粘贴
await page.keyboard.press('Control+V');
await page.waitForTimeout(3000);

// 截图看结果
const shot = await page.cua.screenshot();

// 引擎API读回验证（读取lastRow+1开始的几行）
const readBack = await page.evaluate((startRow) => {
  const app = window.SpreadsheetApp;
  const sheet = app.workbook.worksheetManager.getSheetBySheetId(app.workbook.worksheetManager.activeSheetId);
  const rows = [];
  for (let r = startRow; r < startRow + 3; r++) {
    const row = [];
    for (let c = 0; c < 12; c++) {
      const cell = sheet.getCellDataAtPosition(r, c);
      row.push(cell && cell.formattedValue ? cell.formattedValue.value : '');
    }
    rows.push(row);
  }
  return rows;
}, <targetRow>);

console.log(JSON.stringify({ clipOk, shotPath: shot.path, readBack }));
EOF
```

确认 `clipOk: "ok"` 且 readBack 数据正确。

### 第6步：刷新页面验证持久化

```bash
dev-browser --browser wecom --idle-timeout 30m --timeout 120 <<'EOF'
const page = await browser.getPage("wecom-doc");
await page.goto("<文档链接>", { waitUntil: "domcontentloaded" });

// 刷新后轮询引擎就绪（替代固定 waitForTimeout(12000)，通常 3-5s）
async function waitForAppReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page.evaluate(() =>
      typeof window.SpreadsheetApp !== 'undefined'
      && window.SpreadsheetApp
      && !!window.SpreadsheetApp.workbook
      && !!window.SpreadsheetApp.workbook.worksheetManager
    );
    if (ok) return { ok: true, elapsed: Date.now() - start };
    await page.waitForTimeout(300);
  }
  return { ok: false, elapsed: timeoutMs };
}
await waitForAppReady(20000);

// 读回写入的行范围，确认数据还在
const readBack = await page.evaluate(() => {
  // 读取目标行范围验证...
});
console.log(JSON.stringify(readBack));
EOF
```

如果刷新后数据还在 → 成功。如果数据丢了 → 粘贴没触发提交，检查是否选中了正确单元格。

## 关键技术要点（为什么这样做）

1. **page.cua.click vs page.locator.click**：企微有`operate-board`覆盖层拦截DOM点击。page.cua.click通过CDP发送原始鼠标事件，绕过拦截。

2. **Ctrl+V vs keyboard.type**：canvas表格编辑模式不响应type的键盘事件。粘贴走浏览器原生paste事件，表格有完整处理逻辑，自动触发mutation提交。

3. **navigator.clipboard.writeText**：HTTPS页面+用户手势（前面的点击）下可用，精确控制剪贴板为TSV格式。

4. **必须截图确认地址栏**：键盘导航可能不精确（Ctrl+Home可能不生效、ArrowDown可能差1），截图看编辑栏地址栏（如C25）确认。

5. **必须刷新验证**：只有刷新后数据还在，才确认提交到服务器。setCellDataAtPosition只改内存刷新即丢。

6. **引擎行号 vs UI行号**：引擎row 0 = UI row 1（表头），引擎row N = UI row N+1。导航和验证时注意换算。

## 性能优化（执行时务必遵守）

文档有 5000+ 行，每次 `getCellDataAtPosition` 全表遍历都要花几秒。以下是踩坑总结的提速规则：

1. **轮询而非盲等**：所有"等引擎就绪"用 `waitForAppReady()` 轮询 `SpreadsheetApp.workbook`，就绪即返回（通常 3-5s），**不要用固定 `waitForTimeout(10000/12000)` 盲等**——那是本 skill 早期最浪费时间的写法，每次白等 5-9s。第2/6步已改。

2. **全表只扫一次，结果复用**：重复检查（第3步）那次 `evaluate` 已经把所有行的 `date`+`num` 拉回来了。后续要抽查字段是否一致、或找最近日期，**直接用这次结果数组，不要再发新的 `evaluate` 扫表**。实测中"重复检查扫一遍、抽查又扫一遍、全量取号又扫一遍"会叠加成 3 倍耗时。

3. **合并 dev-browser 调用**：第2-6步每步一个独立 `dev-browser ... <<EOF` 进程，每次都有进程拉起 + getPage 开销。能合并就合并——把"打开+重复检查+导航+粘贴+刷新验证"写进**同一个 heredoc**，省掉 3-4 次进程拉起。命名页 `wecom-doc` 全程保持打开，`getPage` 拿到同一页面，状态连续。

4. **复用已开页面，不要重复 goto**：命名页一旦打开，后续直接 `getPage("wecom-doc")` 拿同一页面，**不要每步都 `page.goto(文档链接)` 重新加载**。只有第6步验证持久化需要刷新（goto 一次）。

5. **批量查重走"先全读后内存比对"**：单条查询可在遍历时命中即返回；批量（多条发票号）时，先一次 `evaluate` 把订单ID列全读进数组，再内存 `.some()` 比对——比"每条扫一遍表"快 N 倍。参见 wecom-invoice-query 的批量查询写法。

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| SpreadsheetApp undefined | 未登录/页面未加载完 | 等待10秒重试，或截图检查登录状态 |
| 点击无效 | 用了locator.click | 改用page.cua.click |
| clipboard返回err | 页面无焦点/非HTTPS | 确保前面有page.cua.click提供用户手势 |
| 粘贴后数据没写入 | 剪贴板失败或未选中单元格 | 检查clipOk和地址栏截图 |
| 刷新后数据丢失 | 粘贴没触发提交 | 确认选中了正确单元格再粘贴 |
| 地址栏位置不对 | 导航不准 | 截图确认，ArrowUp/Down微调 |
| ArrowDown次数不对 | lastRow计算偏差 | 截图确认后微调 |

## 批量粘贴注意事项

- TSV多行时，企微表格会自动从选中单元格开始向下填充多行
- 粘贴大量数据（如60行）后等待3-5秒让表格处理完
- 如果数据量很大（100+行），考虑分批粘贴（每批50行）
