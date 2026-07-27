# Interest Island Invoice Checker - 使用说明

> 兴趣岛订单开票核验模块 · 只读查询 · Vue 直驱 · 通过浏览器自动化判断订单能否开票

---

## 1. 项目背景

本 Skill 是 AI 辅助开票流程中的"订单核验模块"。它只负责：
- 查询订单是否存在
- 检查订单状态（已支付 / 其他）
- 检查详情页是否已有发票信息

**本 Skill 不会**：修改订单、新建订单、进入兴趣岛后台创建备案、进入税务局开票、发送发票邮件。

---

## 2. 首次使用：扫码登录

兴趣岛只支持企业微信扫码登录。

### 步骤

```bash
# 1. 启动可见浏览器
dev-browser --browser interest-island --idle-timeout 0 --timeout 60 <<'EOF'
const page = await browser.getPage('main');
await page.goto('https://edu-admin.qlchat.com/finance/invoice');
await page.waitForTimeout(3000);
console.log('请在弹出的浏览器窗口中扫码登录企业微信');
EOF
```

### 用户操作

1. 浏览器窗口弹出
2. 用手机企业微信扫描页面二维码
3. 在企业微信手机端点击"确认登录"
4. 网页跳转到兴趣岛管理系统

**登录态被 daemon 持久化**：后续核验任务复用同一浏览器实例，无需再次扫码。

---

## 3. 调用 Skill（核验订单）

### 步骤 1：准备输入

```bash
cat > ~/.dev-browser/tmp/interest_island_input.json <<EOF
{"order_id":"9000000783104504","task_id":"INV-20260727-002"}
EOF
```

### 步骤 2：运行核验

```bash
# 从项目路径直接运行（推荐）
dev-browser --browser interest-island --idle-timeout 0 --timeout 120 run "C:\Users\EDY\WorkBuddy\2026-07-27-10-31-48\interest_island_invoice_checker\automation\interest_island_order_check.js"
```

> ⚠️ 路径必须是单反斜杠格式 `"C:\Users\..."`，双反斜杠会静默崩溃。不要用 heredoc 方式运行长脚本（JS 中的单引号会破坏 bash 解析）。

### 步骤 3：读取输出

```bash
cat ~/.dev-browser/tmp/interest_island_output.json
```

---

## 4. 输出示例

### 示例 1：已开票（企业）

```json
{
  "task_id": "INV-20260727-001",
  "order_id": "9000000619462400",
  "query_status": "success",
  "result_status": "invoiced",
  "order_found": true,
  "order_status": "已支付",
  "invoice_record": "{\"发票类型\":\"增值税专用发票\",\"抬头类型\":\"企业\",\"发票抬头\":\"湖南金格建筑科技有限公司\",\"企业税号\":\"914301057328728592\",\"操作人\":\"黄思婷-离职\",\"操作时间\":\"2026-03-11\"}",
  "can_invoice": true,
  "decision_reason": "已开票：增值税专用发票 - 湖南金格建筑科技有限公司",
  "evidence_screenshot": "C:\\Users\\EDY\\.dev-browser\\tmp\\detail_9000000619462400_....png",
  "invoice_data": {
    "发票类型": "增值税专用发票",
    "抬头类型": "企业",
    "发票抬头": "湖南金格建筑科技有限公司",
    "企业税号": "914301057328728592",
    "操作人": "黄思婷-离职",
    "操作时间": "2026-03-11"
  }
}
```

### 示例 2：已开票（个人）

```json
{
  "task_id": "INV-20260727-002",
  "order_id": "9000000783104504",
  "query_status": "success",
  "result_status": "invoiced",
  "order_found": true,
  "invoice_record": "{\"发票类型\":\"电子普通发票\",\"抬头类型\":\"个人\",\"发票抬头\":\"党霄霞\",\"操作人\":\"鲍敏馨\",\"操作时间\":\"2026-07-13 21:32:16\"}",
  "can_invoice": true,
  "decision_reason": "已开票：电子普通发票 - 党霄霞",
  "invoice_data": {
    "发票类型": "电子普通发票",
    "抬头类型": "个人",
    "发票抬头": "党霄霞",
    "操作人": "鲍敏馨",
    "操作时间": "2026-07-13 21:32:16"
  }
}
```

### 示例 3：登录失效

```json
{
  "query_status": "login_required",
  "result_status": "login_required",
  "can_invoice": null,
  "decision_reason": "需要人工扫码登录兴趣岛系统"
}
```

---

## 5. 常见异常与处理办法

| 异常 | 原因 | 处理 |
|------|------|------|
| `login_required` | 登录过期或 daemon 重启丢失 session | 重新执行第 2 节"首次扫码登录" |
| 未找到订单 | order_id 错误或日期超限 | 确认订单号正确 |
| `page_structure_change` | 兴趣岛改版，Vue 组件路径变化 | 更新 `$children` 索引路径 |
| `detail_panel_timeout` | 详情面板加载慢 | 重试；检查网络 |
| 脚本挂起超时 | 用了 `browser.newPage()` | 改用 `browser.getPage("命名")` |
| 静默崩溃（只有一行 START） | 双反斜杠路径 | 改用单反斜杠 `"C:\Users\..."` |
| Bash heredoc 报 EOF | JS 单引号冲突 | 改用 `dev-browser run` 文件方式 |

---

## 6. 技术架构

### 查询方式：Vue 直驱

```
User Input (order_id)
  → browser.getPage("interest-island")     // 复用持久化 session
  → checkLogin()                            // URL 重定向检测
  → vueQuery()                              // 直接操作 Vue 组件状态
    ├─ delete listQuery.{dates}            // 清空日期限制
    ├─ $set(listQuery, 'orderId', ...)     // 设置订单号
    └─ target.fetchData()                  // 触发 API 查询
  → waitForQueryResult()                    // 等待表格更新
  → clickDetailOnRow()                      // 点"详情"按钮
  → waitForDetailPanel()                    // 等待 drawer 加载
  → parseAndDetect(bodyText)               // 提取字段 + 发票检测
  → writeFile("output.json", result)       // 写入结果
```

### Vue 组件路径

```
#app.__vue__                                // Vue 根实例
  .$children[2]                             // 布局层
    .$children[2]                           // 正式营订单路由组件
      .$children[0]                         // 订单列表子组件
        .listQuery    ← 查询参数对象
        .fetchData()  ← 触发 API 调用
```

### API 端点

```
GET /admin/financialActCharge/list
?page=1&limit=20&type=financial&status=&orderId={order_id}
```

不带 `startTime`/`endTime` 参数即无日期限制。

---

## 7. 测试记录

### 已验证（2026-07-27）

| 场景 | order_id | 发票类型 | 抬头 | 结果 |
|------|----------|---------|------|------|
| 企业专票 | `9000000619462400` | 增值税专用发票 | 湖南金格建筑科技有限公司 | ✅ 已开票 |
| 个人普票 | `9000000783104504` | 电子普通发票 | 党霄霞 | ✅ 已开票 |
| 登录检测 | - | - | - | ✅ URL 重定向判断正确 |
| QuickJS 沙箱 | - | - | - | ✅ readFile/writeFile/saveScreenshot 正常 |

### 待验证

| 场景 | 备注 |
|------|------|
| 未开票订单 | 需要一单"已支付但未开票"的订单验证 can_invoice: false 分支 |
| 非已支付状态 | 需要一单未支付或已退款的订单 |
| 轻课/体验营等其他订单类型 | 跨页面导航 + 不同的 listQuery.type |
| 多任务连续查询 | 验证 drawer 关闭逻辑，避免下一单读到上一单的数据 |

---

## 8. 版本

- **v2.0.0** (2026-07-27)：全面重写为 QuickJS 兼容 + Vue 直驱；登录检测改用 URL 重定向；已验证企业专票和个人普票两种场景
- **v0.3.0** (2026-07-27)：完成主要流程探索 + selector 验证 + 单一订单查询 + 详情解析（使用 DOM 操作，后废弃）
- **v0.2.0**：初版基于猜测的 selector
- **v0.1.0**：skill 框架 + config 模板
