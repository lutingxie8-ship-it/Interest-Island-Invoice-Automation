# 兴趣岛开票自动化 · 初始化指南（INIT）

克隆本仓库后，开票流程依赖**两个系统级配置**，它们无法纳入 Git（不属于代码），必须在本机落地：

1. **Windows 任务计划程序** `InvoiceMailMonitor_15min` —— 每 15 分钟监测开票邮件（纯 Python，0 token）。
2. **WorkBuddy 自动化** `发票AI接手触发（每小时）` —— 每小时读取侧车、唤醒 AI 跑解析 + 开票流程（出卡片/选择框）。

本文件提供两种落地方式：
- **方式 A（推荐）**：把下方「初始化 Prompt」直接发给 WorkBuddy，让它一次性帮你配好。
- **方式 B（手动）**：自己照着步骤跑，不依赖 Agent。

---

## 方式 A：把这段发给 WorkBuddy（一键初始化）

> 复制下面整段，在 WorkBuddy 对话里发送即可：

```
请按本仓库根目录的 INIT.md 完成「兴趣岛发票自动化」的初始化。请逐步执行并在最后简要回报结果（已就绪的步骤可跳过）：

1. 前置检查：确认以下 skill 已安装到用户级（~/.workbuddy/skills/）：
   invoice-mail-monitor、invoice-request-parse、invoice-pipeline、invoice-create、
   order-invoice-checker、wecom-invoice-query、wecom-invoice-import、_common。
   缺失则提示用户先从本仓库 skills/ 复制到用户级。

2. 依赖：确认 ~/.workbuddy/skills/invoice-mail-monitor/venv 存在且已装 PyYAML
   （用 venv 的 python 执行 `import yaml` 验证）；没有则创建 venv 并 pip install PyYAML。

3. 配置：若 invoice-mail-monitor/skill/config.yaml 与 invoice-request-parse/skill/config.yaml
   不存在，从同目录的 config.yaml.example 复制生成；把其中的 handoff.dir / output.dir
   占位路径（C:/Users/<你的用户名>/WorkBuddy/invoice_handoff）替换为用户实际的
   WorkBuddy 工作区路径。提醒用户必须设置环境变量 INVOICE_EMAIL_ACCOUNT 与
   INVOICE_EMAIL_PASSWORD（邮箱密码须为纯 ASCII，不能用全角字符），否则 monitor 无法登录。

4. Windows 定时任务：用 PowerShell 运行本仓库 scripts/setup_windows_monitor.ps1
   （默认在任务计划程序创建/更新 InvoiceMailMonitor_15min，每天 09:30–19:00 每 15 分钟运行 monitor）。
   运行后确认任务已注册。

5. WorkBuddy 自动化：用 automation 工具创建一个每小时触发的任务，名称
   「发票AI接手触发（每小时）」，scheduleType=recurring，rrule=FREQ=HOURLY，
   cwds 设为当前 WorkBuddy 工作区；prompt 使用下方「WorkBuddy 自动化定义」一节的内容
   （把其中的 <USERPROFILE> 占位符替换为本机实际路径）。

完成后简要回报每一步的结果。
```

---

## 方式 B：手动步骤

### 第 1 步 · 安装 skill 到用户级
把本仓库 `skills/` 下需要的 skill 复制到 `~/.workbuddy/skills/`（含 `_common` 共享库）。
必需：`invoice-mail-monitor` `invoice-request-parse` `invoice-pipeline` `invoice-create`
`order-invoice-checker` `wecom-invoice-query` `wecom-invoice-import` `_common`。

### 第 2 步 · 准备 Python 依赖（monitor）
```bash
cd ~/.workbuddy/skills/invoice-mail-monitor
python -m venv venv
venv/Scripts/pip install PyYAML
```

### 第 3 步 · 生成 config.yaml（两份，handoff 路径必须一致）
从 `config.yaml.example` 复制为同目录 `config.yaml`，并：
- 把 `handoff.dir` / `output.dir` 里的 `C:/Users/<你的用户名>/WorkBuddy/invoice_handoff`
  改成你本机的实际 WorkBuddy 工作区路径（monitor 与 request-parse 两边必须完全相同）。
- **设置环境变量**（推荐，避免把密码写进文件）：
  ```powershell
  setx INVOICE_EMAIL_ACCOUNT "你的邮箱账号"
  setx INVOICE_EMAIL_PASSWORD "你的邮箱密码"   # ⚠️ 须纯 ASCII，禁用全角字符
  ```
  设完重启 WorkBuddy 让其读到新值。

### 第 4 步 · 创建 Windows 定时任务
```powershell
powershell -ExecutionPolicy Bypass -File <仓库根>/scripts/setup_windows_monitor.ps1
```
脚本会创建/更新 `InvoiceMailMonitor_15min`（每天 09:30–19:00 每 15 分钟）。
查看/停用：`Win+R` 输入 `taskschd.msc` → 任务计划程序库。

> 非 Windows 环境：用 cron 替代，例如每 15 分钟：
> `*/15 9-19 * * * cd ~/.workbuddy/skills/invoice-mail-monitor && venv/bin/python -m skill.src.monitor`

### 第 5 步 · 创建 WorkBuddy 自动化
在 WorkBuddy 自动化里新建一个任务：
- 名称：`发票AI接手触发（每小时）`
- 类型：recurring，rrule：`FREQ=HOURLY`
- 工作区（cwds）：你的 WorkBuddy 工作区
- prompt：见下方「WorkBuddy 自动化定义」

---

## WorkBuddy 自动化定义

新建自动化时填入的 prompt（**把 `<USERPROFILE>` 替换为本机实际路径**，如 `C:/Users/<用户名>`）：

```
你是「兴趣岛开票自动化」流水线的条件触发器。邮箱轮询已由 Windows 任务计划程序
（InvoiceMailMonitor_15min，每天 9:30–19:00 每 15 分钟）负责写入待处理侧车，
本任务只负责在检测到待处理邮件时唤醒 AI 跑后续流程。

每当被调度唤醒（每小时），按以下步骤执行：

1. 检查 <USERPROFILE>/WorkBuddy/invoice_handoff/pending/ 是否出现新的 .json 侧车文件
   （这些侧车由 15 分钟任务计划程序监测邮箱后写入）：
   - 若无（目录为空或无 .json），本轮结束，不做任何事、不打扰用户。
   - 若有，继续第 2 步。

2. 运行解析 skill（invoice-request-parse）：执行
   `cd <USERPROFILE>/.workbuddy/skills/invoice-request-parse && venv/Scripts/python.exe -m skill.src.parse`
   它读取 pending 侧车、openpyxl 直读 xlsx、校验订单号、去重，在
   <USERPROFILE>/WorkBuddy/invoice_handoff/reports/ 生成 .md 报告
   （绝对路径会打印到 stdout 最后一行），并把侧车移到 processed/。

3. 取第 2 步打印出的 .md 报告绝对路径，调用 invoice-pipeline skill 跑完整开票流程
   （企微查重→兴趣岛订单核验→[人工在税务局开票，到此必须暂停等待用户]
   →兴趣岛新建记录→归档企微文档）。按该 skill 的 SKILL.md 执行。

4. 完成后简要回报：本轮是否发现发票邮件、生成几个订单、是否已进入开票流程。

关键约束：仅在 pending 有侧车时运行 parse 与 invoice-pipeline；无侧车时静默结束。
```

---

## 架构回顾

```
[Windows 任务计划程序 15min]  →  连邮箱 / 写侧车到 handoff/pending / 标已读（0 token）
                                          │
                                          ▼
[WorkBuddy 自动化 每小时]       →  读 pending / 跑 parse / AI 出卡片跑开票流程
```

两个配置各司其职、互不重复：监测用便宜的脚本高频跑，AI 只在有活儿时每小时接手。
