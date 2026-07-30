---
name: wecom-invoice-query
description: "在企微在线表格内查询订单号是否已有开票记录（只读查询，不录入）。当用户说'查一下这个订单开没开过票'、'查询订单号是否已存在'、'检查发票是否已录入'、'核验订单开票状态'时使用此skill。通过dev-browser登录企微文档后，用引擎API遍历订单ID列查询，输出找得到/找不到。注意：此skill只查询不录入，录入请用wecom-invoice-import skill。"
agent_created: true
---

# 企微发票查询

在企微在线表格内查询订单号是否已存在开票记录。**只读查询，不录入**。

## 与 wecom-invoice-import 的区别

| | wecom-invoice-query（本skill） | wecom-invoice-import |
|--|--|--|
| 功能 | 查询订单号是否已存在 | 录入新发票记录 |
| 操作 | 只读（遍历查询） | 写入（剪贴板粘贴） |
| 输入 | 订单号 | Excel文件 |
| 输出 | 找到/找不到 | 录入成功/失败 |

## 核心原理

**用引擎 API 遍历查询，不用 Ctrl+F**。原因：
- 企微表格是 canvas 渲染，Ctrl+F 的键盘事件不响应（和 keyboard.type() 同样的问题）
- 引擎 API `getCellDataAtPosition` 已验证可靠，能精确读取每个单元格的值
- 遍历"订单ID"列，检查是否包含目标订单号

## 前提条件

1. **首次使用运行环境检查**：`python "<skill目录>/scripts/setup.py"`，检查 dev-browser 是否可用
2. **首次需扫码登录**：dev-browser 打开企微文档后用户扫码，登录态保持在 profile 里

## 初始化配置（首次使用时向用户确认）

| # | 信息 | 说明 |
|---|------|------|
| 1 | 企微文档分享链接 | `https://doc.weixin.qq.com/sheet/xxx`，从链接提取 docid |
| 2 | 首次扫码登录 | dev-browser 弹窗扫码，之后保持 |

## 执行流程（3步）

### 第1步：dev-browser打开企微文档并确认登录

```bash
dev-browser --browser wecom --idle-timeout 30m --timeout 120 <<'EOF'
const page = await browser.getPage("wecom-doc");
await page.goto("<文档链接>", { waitUntil: "domcontentloaded" });

// 等待引擎就绪：轮询 SpreadsheetApp.workbook，就绪即返回。
// ⚠️ 不要用固定 waitForTimeout(12000)——那是盲等，引擎通常 3-5s 就绪，盲等白等 7-9s。
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
const appReady = await waitForAppReady(20000);
const ready = appReady.ok
  ? await page.evaluate(() => ({ hasApp: true, hasWorkbook: true, title: document.title, elapsed_ms: appReady.elapsed }))
  : { hasApp: false, hasWorkbook: false, title: document.title, timeout: true, elapsed_ms: appReady.elapsed };
console.log(JSON.stringify(ready));
EOF
```

- `hasApp: true` → 已登录，继续第2步
- `hasApp: false` 或 `timeout: true` 或 title 含"登录" → 需扫码，截图给用户：
  ```js
  const buf = await page.screenshot();
  const path = await saveScreenshot(buf, "login.png");
  ```
  用 Read 读截图，提示用户在弹出的浏览器窗口扫码。用户说"登录好了"后重新执行此步确认。

### 第2步：引擎API查询订单号

```bash
dev-browser --browser wecom --idle-timeout 30m --timeout 90 <<'EOF'
const page = await browser.getPage("wecom-doc");

// 查询订单号（从上游任务输入）
const orderNum = "<订单号>";

const result = await page.evaluate((num) => {
  const app = window.SpreadsheetApp;
  const sheet = app.workbook.worksheetManager.getSheetBySheetId(app.workbook.worksheetManager.activeSheetId);
  
  // 遍历所有行的"订单ID"列(col 9)，检查是否包含订单号
  for (let r = 1; r < sheet.getRowCount(); r++) {
    const cell = sheet.getCellDataAtPosition(r, 9);
    const val = cell && cell.formattedValue ? cell.formattedValue.value : '';
    if (val && val.includes(num)) {
      // 找到，读取该行的开票信息
      const dateCell = sheet.getCellDataAtPosition(r, 2);
      const invoiceNumCell = sheet.getCellDataAtPosition(r, 4);
      const nameCell = sheet.getCellDataAtPosition(r, 6);
      const amountCell = sheet.getCellDataAtPosition(r, 8);
      return {
        found: true,
        row: r,
        orderField: val,
        date: dateCell && dateCell.formattedValue ? dateCell.formattedValue.value : '',
        invoiceNumber: invoiceNumCell && invoiceNumCell.formattedValue ? invoiceNumCell.formattedValue.value : '',
        name: nameCell && nameCell.formattedValue ? nameCell.formattedValue.value : '',
        amount: amountCell && amountCell.formattedValue ? amountCell.formattedValue.value : '',
      };
    }
  }
  return { found: false };
}, orderNum);

console.log(JSON.stringify(result, null, 2));
EOF
```

### 第3步：输出结果

根据第2步的输出判断：

- **`found: true`** → 该订单号已在企微文档内找到开票记录，**已开过票，不支持继续开票**。向用户报告：
  ```
  ⚠️ 订单号 XXX 已存在开票记录：
  - 行号：row XX
  - 开票日期：2026/7/24
  - 发票号码：2644200000XXXXXXXXX
  - 开票名称：XXX公司
  - 开票金额：3280
  - 订单ID字段内容：订单号 XXX
  ```

- **`found: false`** → 该订单号在企微文档内未找到，**未开过票，可以继续开票**。向用户报告：
  ```
  ✅ 订单号 XXX 未找到开票记录，可以开票
  ```

## 查询列说明

查询的目标列是**订单ID列（col 9）**。该列的值格式多样：
- `订单号 9000000781553087`（单个订单）
- `订单号：9000000776266852\n订单号：9000000783026565`（多个订单）
- `被红冲蓝字数电发票号码：26442000007669593421 ...`（红冲记录）

使用 `includes()` 匹配，只要订单号字符串出现在值里就算找到。订单号通常16位数字，误匹配概率极低。

## 批量查询

如果上游任务输出多个订单号，循环执行第2步，每个订单号查询一次。也可以在一个脚本里批量查询：

```js
const orderNums = ["订单号1", "订单号2", "订单号3"];
const results = await page.evaluate((nums) => {
  const app = window.SpreadsheetApp;
  const sheet = app.workbook.worksheetManager.getSheetBySheetId(app.workbook.worksheetManager.activeSheetId);
  
  // 先读取所有行的订单ID列（只遍历一次）
  const allValues = [];
  for (let r = 1; r < sheet.getRowCount(); r++) {
    const cell = sheet.getCellDataAtPosition(r, 9);
    const val = cell && cell.formattedValue ? cell.formattedValue.value : '';
    if (val) allValues.push({ row: r, val });
  }
  
  // 对每个订单号查询
  return nums.map(num => ({
    orderNum: num,
    found: allValues.some(v => v.val.includes(num)),
  }));
}, orderNums);
```

## 技术要点

1. **不用 Ctrl+F**：canvas 表格键盘事件不响应，Ctrl+F 无法输入搜索词。引擎 API 遍历查询更可靠。

2. **遍历效率**：`getCellDataAtPosition` 逐行读取，5843 行约需几秒。如果数据量很大，可以限制遍历范围（如前 500 行），或先读取全部到数组再批量查询。

3. **登录态保持**：dev-browser 的 named browser profile 保持登录态，后续查询无需重新扫码。但 idle-timeout 后浏览器关闭，重新打开会恢复登录态。

4. **引擎行号 vs UI行号**：引擎 row 0 = UI row 1（表头），引擎 row N = UI row N+1。查询结果的 row 是引擎行号。

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| SpreadsheetApp undefined | 未登录/页面未加载完 | 等待12秒重试，或截图检查登录状态 |
| 查询超时 | 数据行数太多 | 限制遍历范围，或用批量查询方式 |
| 误匹配 | 订单号太短 | 确保订单号完整（通常16位数字） |
| 漏匹配 | 订单号在别的列 | 检查订单号是否在订单ID列(col 9)，或扩大扫描范围 |
