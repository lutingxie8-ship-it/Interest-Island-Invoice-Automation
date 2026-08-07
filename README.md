# Interest Island Invoice Automation

> 兴趣岛开票自动化 Skill 集合 · 基于 dev-browser 浏览器自动化 · 绕过企微无 API 权限限制

---

## 包含的 Skill

> 共 **7 个 skill**：1 个主编排 + 2 个上游 Python 解析 + 4 个浏览器自动化，公共函数统一收敛在 `skills/_common/lib.js`。

| Skill | 目录 | 功能 |
|-------|------|------|
| 开票主编排 | [skills/invoice-pipeline](skills/invoice-pipeline/SKILL.md) | 串联「查重→核验→出卡片(人工断点)→新建」的 6 阶段主编排 |
| 邮件监控 | [skills/invoice-mail-monitor](skills/invoice-mail-monitor/SKILL.md) | 上游第①步：IMAP 拉未读开票邮件、三分类、提取 xlsx 附件、标已读（不解析） |
| 请求解析 | [skills/invoice-request-parse](skills/invoice-request-parse/SKILL.md) | 上游第②步：解析邮件 xlsx 附件，提取订单/金额/抬头/税号，产出 .md + .json 报告 |
| 企微发票查询 | [skills/wecom-invoice-query](skills/wecom-invoice-query/SKILL.md) | 企微文档内查重：订单号是否已开过票（只读） |
| 订单开票核验 | [skills/order-invoice-checker](skills/order-invoice-checker/SKILL.md) | 兴趣岛订单状态 / 是否已开票核验（Vue 直驱 + 只读） |
| 发票新建 | [skills/invoice-create](skills/invoice-create/SKILL.md) | 兴趣岛"新建发票"弹窗填写（**默认不提交，需显式 confirm=true**） |
| 企微发票录入 | [skills/wecom-invoice-import](skills/wecom-invoice-import/SKILL.md) | 税务局 Excel 批量录入企微在线表格（次日离线归档） |

---

## 环境依赖

七个 skill 共用以下运行环境：

1. **dev-browser**（浏览器自动化工具）：WorkBuddy 自带；其他环境从 GitHub 安装：`git clone https://github.com/SawyerHood/dev-browser.git && cd dev-browser && npm install -g && dev-browser install`
2. **Python 3.8+**：WorkBuddy 自带
3. **openpyxl + PyYAML**：`invoice-mail-monitor` 与 `invoice-request-parse` 是纯 Python skill，首次需在 skill 目录建 venv 并 `pip install PyYAML openpyxl`；`wecom-invoice-import` 的 `scripts/setup.py` 也会自动检查安装 openpyxl
4. **首次扫码登录**：浏览器自动化类 skill（wecom-invoice-query / wecom-invoice-import / order-invoice-checker / invoice-create）首次使用时需在弹出的浏览器窗口扫码登录
5. **构建（抽公共库后）**：4 个浏览器脚本运行前需先合并公共库——在仓库根目录执行 `python tools/build_all.py` 生成 `build/*.merged.js`，再用 `dev-browser run "build/<脚本>.merged.js"` 运行（详见各 skill 的 SKILL.md）

---

## 新用户快速上手

嗨 👋 我是接手「兴趣岛开票自动化」这套 Skill 的助手。

我能帮你把开票流程里最费手的 4 步——企微查重、订单核验、新建发票、企微归档——用浏览器自动化替你跑掉，省去手动填表。

你需要先给我两样数据（真实数据都不进仓库，只存你本机或运行时交给我）：

1. **阿里云企业邮箱账号 + 密码**　收开票邮件用，就是日常登录邮箱的账号密码。
2. **企微「开票记录表」链接**　查重 / 归档都靠它。获取：企业微信 →「文档」→ 打开那张表 → 右上点击“邀请成员加入”按键 → 点击弹窗中“邀请成员加入”文字右侧的第一个按钮即可复制链接。

另外运行这套 skill 时需要扫码登录相关平台，请留意运行时我打开的浏览器登录界面，我会提醒你让你扫一下码：

3. **兴趣岛后台登录态**　订单核验 / 新建发票用，扫码后留本机，之后当天免登。
4. **企微网页登录态**　打开企微文档用，同样首次扫码。

把 **①②** 发我，我就开始。

### 不需要你准备的东西
- **税务局账号**：第 6 步（税务局实开发票）当前是人工操作，未自动化
- **真实订单号 / 税号**：脚本示例均为占位假数据，真实值运行时由上游表格 / 输入注入

---

## Skill 1：开票主编排（invoice-pipeline）

**位置**：`skills/invoice-pipeline/`

串联 4 个子 skill，按 6 阶段管道执行开票全流程：

- 阶段 0 解析表格 → 阶段 1 企微查重 → 阶段 2 订单核验（与阶段1并行）→ **阶段 3 渲染开票卡 + 人工断点（等税务局开票）** → 阶段 4 填弹窗（不点确定）→ 阶段 5 企微归档
- 人工断点：阶段 3 后必须暂停，等用户返回 PDF 才恢复阶段 4
- 无独立脚本，纯文档编排，由智能体按文档执行多轮对话

详见 [skills/invoice-pipeline/SKILL.md](skills/invoice-pipeline/SKILL.md)

---

## Skill 2：订单开票核验（order-invoice-checker）

**位置**：`skills/order-invoice-checker/`

查询兴趣岛系统中的订单是否已开票，返回开票状态和发票信息。

- 查询方式：Vue 组件直驱（`listQuery` + `fetchData`），非 DOM 操作
- 运行环境：QuickJS 沙箱兼容
- 输入：订单号；输出：JSON（订单状态 + 发票信息 + 是否可开票）

详见 [skills/order-invoice-checker/SKILL.md](skills/order-invoice-checker/SKILL.md)

---

## Skill 3：发票新建（invoice-create）

**位置**：`skills/invoice-create/`

在兴趣岛"开票审核"页面填写"新建发票"弹窗，**默认安全模式不提交**。

- 流程：导航到 `/finance/invoice` → 点击"新建"按钮 → 弹出 el-dialog → 填写订单ID → 自动填充所属品类/商品名称/用户ID → 填写开票金额/发票类型/抬头类型/发票抬头/企业税号 → 上传 PDF → 截图
- **🚨 安全门**：默认 `confirm=false`，只填到弹窗可提交状态，不点"确定"键；只有显式传 `confirm=true` 才执行提交
- **🚨 注意**：点"新建"按钮，**不要点"批量开票"**（那会弹出"保密承诺函"而非"新建发票"）
- PDF 上传走 base64 通路（沙箱无法读二进制）：调用方传 `invoice_pdf_base64` → 浏览器内 `atob` 还原 → `DataTransfer` → 驱动 `el-upload.handleChange`
- 输入：JSON 文件（含订单ID、开票金额、invoice_pdf_base64 等）；输出：JSON（弹窗填写状态 + auto-fill + 截图 + safety_check 审计）

详见 [skills/invoice-create/SKILL.md](skills/invoice-create/SKILL.md)

---

## Skill 4：企微发票查询（wecom-invoice-query）

**位置**：`skills/wecom-invoice-query/`

在企微在线表格内查询订单号是否已存在开票记录（只读，不录入）。

- 用引擎 API 遍历"订单ID"列查询，不用 Ctrl+F（canvas 键盘不响应）
- 独立脚本 `wecom_invoice_query.js`，含 `waitForAppReady` + `waitForSheetReady` 双重轮询 + 分步进度日志
- 输入：订单号（可选 `doc_url`）；输出：找到/找不到

详见 [skills/wecom-invoice-query/SKILL.md](skills/wecom-invoice-query/SKILL.md)

---

## Skill 5：企微发票录入（wecom-invoice-import）

**位置**：`skills/wecom-invoice-import/`

把税务局导出的 Excel 发票记录，自动录入到企微在线表格末尾。

- 2 步流程：① `read_excel_to_tsv.py` 读 Excel 生成 TSV → ② 运行独立脚本 `wecom_invoice_import.js` 录入
- 独立脚本 8 步：全新加载清残留态 → 等引擎就绪 → 全表查重 → 导航空行 → 粘贴前校验空 → 粘贴 10列TSV → 读回验列对齐 → 刷新验证持久化
- 核心原理：粘贴走表格正常 paste 事件，自动触发 mutation 提交到服务器
- 事故防护：开篇 goto 清残留态防幽灵粘贴；10列TSV从A列起粘防列偏移；粘贴前读回确认空防覆盖

详见 [skills/wecom-invoice-import/SKILL.md](skills/wecom-invoice-import/SKILL.md)

---

## Skill 6：邮件监控（invoice-mail-monitor）

**位置**：`skills/invoice-mail-monitor/`

发票自动化流水线的**上游第①步**。连阿里云企业邮箱 IMAP，拉未读邮件并按关键词三分类（开票 / 其他 / 不确定），提取「开票邮件」的 xlsx 附件到 handoff 交接目录，并标记该邮件为已读。

- 纯 Python skill（`skill/src/` 下 monitor / email_connector / email_fetcher / config / logger），**不解析表格**
- 凭证走本机环境变量 `INVOICE_EMAIL_ACCOUNT` / `INVOICE_EMAIL_PASSWORD`，不入库；连接失败会安全退出（不误标已读）
- 下游衔接 `invoice-request-parse` 解析附件

详见 [skills/invoice-mail-monitor/SKILL.md](skills/invoice-mail-monitor/SKILL.md)

---

## Skill 7：请求解析（invoice-request-parse）

**位置**：`skills/invoice-request-parse/`

读取 `invoice-mail-monitor` 写出的邮件侧车（xlsx 附件），用 openpyxl 直读《开票申请汇总表》，提取金额 / 订单号 / 备注 / 发票抬头 / 税号，校验订单号合法性并去重，最终生成 `.md`（人视图）+ `.json`（结构化，给大模型 / 下游直接消费）双报告。

- 纯 Python skill（`skill/src/` 下 parse / config / logger），**不连邮箱、不碰凭证**
- 输出供 `invoice-pipeline` 阶段 0 直接 `json.load` 消费（字段零歧义，优于解析 md 文本）

详见 [skills/invoice-request-parse/SKILL.md](skills/invoice-request-parse/SKILL.md)

---

## 目录结构

```
Interest-Island-Invoice-Automation/
├── README.md                              ← 本文件（总览）
├── .gitignore
├── skills/
│   ├── _common/                           ← 公共库（单一事实来源）
│   │   └── lib.js                         ← 跨脚本公共函数：ts/fmtLog/step/waitForAppReady/waitForSheetReady
│   ├── invoice-pipeline/                  ← 主编排（纯文档编排，无脚本）
│   │   └── SKILL.md
│   ├── invoice-mail-monitor/              ← 上游①：邮件监控（纯 Python）
│   │   ├── SKILL.md
│   │   └── skill/src/                     ← monitor / email_connector / email_fetcher / config / logger
│   ├── invoice-request-parse/             ← 上游②：附件解析（纯 Python）
│   │   ├── SKILL.md
│   │   └── skill/src/                     ← parse / config / logger
│   ├── wecom-invoice-query/               ← 企微查重（步骤 4）
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── setup.py                   ← 环境检查
│   │       └── wecom_invoice_query.js     ← 查询脚本（含分步日志+sheet-ready等待）
│   ├── order-invoice-checker/             ← 订单核验（步骤 5）
│   │   ├── SKILL.md
│   │   ├── automation/
│   │   │   └── interest_island_order_check.js
│   │   └── config/
│   │       ├── settings.json
│   │       └── selectors.json
│   ├── invoice-create/                    ← 发票新建（步骤 7）
│   │   ├── SKILL.md
│   │   ├── automation/
│   │   │   └── interest_island_invoice_create.js
│   │   └── config/
│   │       ├── settings.json
│   │       └── selectors.json
│   └── wecom-invoice-import/              ← 企微录入（步骤 8，次日离线）
│       ├── SKILL.md
│       └── scripts/
│           ├── setup.py                   ← 环境检查与依赖安装
│           ├── read_excel_to_tsv.py       ← Excel 转 TSV
│           └── wecom_invoice_import.js    ← 录入脚本（8步，含防幽灵粘贴/列对齐校验）
├── tools/                                 ← 构建/验证工具（抽公共库用）
│   ├── merge_js.py                        ← 把 lib.js 拼到业务脚本头部
│   ├── build_all.py                       ← 一键合并全部 4 个浏览器脚本
│   └── verify_lib.mjs                     ← lib.js 纯函数自检
├── build/                                 ← 合并产物（gitignore，由 tools 生成）
│   ├── wecom_invoice_query.merged.js
│   ├── wecom_invoice_import.merged.js
│   ├── interest_island_order_check.merged.js
│   └── interest_island_invoice_create.merged.js
├── logs/                                  ← 运行日志（gitignore）
└── screenshots/                           ← 截图（gitignore）
```

---

## 版本

- **v8.0.0** (2026-08-07)：文档补全——README 总览补齐 **7 个 skill**（新增 `invoice-mail-monitor` / `invoice-request-parse` 两项上游 Python skill）、更新目录结构与环境依赖、新增「新用户初始化清单」；各 skill 简介同步对齐
- **v7.0.0** (2026-08-04)：重构——抽公共库 `skills/_common/lib.js`，4 个业务脚本改为构建时合并（tools/merge_js.py + build_all.py），消除重复的 waitForAppReady/waitForSheetReady/step/ts/log；新增 tools/verify_lib.mjs 自检
- **v6.0.0** (2026-08-03)：复盘优化——import 重写为独立脚本（根治幽灵粘贴+列偏移）；invoice-create 状态枚举/路径/selectors 与代码对齐；wecom-query doc_url 输入化 + writeFile await
- **v5.0.0** (2026-07-29)：新增发票新建 skill + invoice-pipeline 主编排
- **v4.0.0** (2026-07-28)：新增企微发票查询 skill（只读查询订单号是否已开票）
- **v3.0.0** (2026-07-28)：重构为多 skill 仓库结构，新增企微发票录入 skill
- **v2.0.0** (2026-07-27)：订单核验 skill 全面重写为 QuickJS 兼容 + Vue 直驱
- **v1.0.0** (2026-07-27)：订单核验 skill 初版
