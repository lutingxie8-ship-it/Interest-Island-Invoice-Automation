# Interest Island Invoice Automation

> 兴趣岛开票自动化 Skill 集合 · 基于 dev-browser 浏览器自动化 · 绕过企微无 API 权限限制

---

## 首次使用 · 初始化（必看）

本项目有两个**系统级配置**（Windows 任务计划程序 + WorkBuddy 自动化）无法纳入 Git，克隆后需在本机落地。
👉 详见 **[INIT.md](INIT.md)** —— 内含可直接发给 WorkBuddy 的「一键初始化 Prompt」与手动步骤。

## 包含的 Skill

| Skill | 目录 | 功能 |
|-------|------|------|
| 开票主编排 | [skills/invoice-pipeline](skills/invoice-pipeline/SKILL.md) | 串联 4 个子 skill 的主编排，6 阶段管道（含人工断点） |
| 企微发票查询 | [skills/wecom-invoice-query](skills/wecom-invoice-query/SKILL.md) | 在企微文档内查询订单号是否已存在开票记录（只读） |
| 订单开票核验 | [skills/order-invoice-checker](skills/order-invoice-checker/SKILL.md) | 查询订单是否已开票（Vue 直驱 + 只读查询） |
| 发票新建 | [skills/invoice-create](skills/invoice-create/SKILL.md) | 在开票审核页填写"新建发票"弹窗（**默认不提交，需显式 confirm=true**） |
| 企微发票录入 | [skills/wecom-invoice-import](skills/wecom-invoice-import/SKILL.md) | 把税务局导出的 Excel 发票记录批量录入企微在线表格 |

---

## 环境依赖

五个 skill 共用以下环境：

1. **dev-browser**（浏览器自动化工具）：WorkBuddy 自带，其他环境 `npm install -g dev-browser && dev-browser install`
2. **Python 3.8+**：WorkBuddy 自带
3. **openpyxl**：仅发票录入 skill 需要，运行 `python skills/wecom-invoice-import/scripts/setup.py` 自动安装
4. **首次扫码登录**：各 skill 首次使用时需要在弹出的浏览器窗口扫码登录
5. **构建（抽公共库后）**：4 个浏览器脚本运行前需先合并公共库——在仓库根目录执行 `python tools/build_all.py` 生成 `build/*.merged.js`，再用 `dev-browser run "build/<脚本>.merged.js"` 运行（详见各 skill 的 SKILL.md）

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

## 目录结构

```
Interest-Island-Invoice-Automation/
├── README.md                              ← 本文件（总览）
├── .gitignore
├── skills/
│   ├── _common/                           ← 公共库（单一事实来源）
│   │   └── lib.js                         ← 跨脚本公共函数：ts/fmtLog/step/waitForAppReady/waitForSheetReady
│   ├── invoice-pipeline/                  ← Skill 1：开票主编排（纯文档编排）
│   │   └── SKILL.md
│   ├── wecom-invoice-query/               ← Skill 4：企微发票查询（步骤 4）
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── setup.py                   ← 环境检查
│   │       └── wecom_invoice_query.js     ← 查询脚本（含分步日志+sheet-ready等待）
│   ├── order-invoice-checker/             ← Skill 2：订单开票核验（步骤 5）
│   │   ├── SKILL.md
│   │   ├── automation/
│   │   │   └── interest_island_order_check.js
│   │   └── config/
│   │       ├── settings.json
│   │       └── selectors.json
│   ├── invoice-create/                    ← Skill 3：发票新建（步骤 7）
│   │   ├── SKILL.md
│   │   ├── automation/
│   │   │   └── interest_island_invoice_create.js
│   │   └── config/
│   │       ├── settings.json
│   │       └── selectors.json
│   └── wecom-invoice-import/              ← Skill 5：企微发票录入（步骤 8）
│       ├── SKILL.md
│       └── scripts/
│           ├── setup.py                   ← 环境检查与依赖安装
│           ├── read_excel_to_tsv.py       ← Excel 转 TSV
│           └── wecom_invoice_import.js    ← 录入脚本（8步，含防幽灵粘贴/列对齐校验）
├── tools/                                 ← 构建/验证工具（抽公共库用）
│   ├── merge_js.py                        ← 把 lib.js 拼到业务脚本头部
│   ├── build_all.py                       ← 一键合并全部 4 个业务脚本
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

- **v7.0.0** (2026-08-04)：重构——抽公共库 `skills/_common/lib.js`，4 个业务脚本改为构建时合并（tools/merge_js.py + build_all.py），消除重复的 waitForAppReady/waitForSheetReady/step/ts/log；新增 tools/verify_lib.mjs 自检
- **v6.0.0** (2026-08-03)：复盘优化——import 重写为独立脚本（根治幽灵粘贴+列偏移）；invoice-create 状态枚举/路径/selectors 与代码对齐；wecom-query doc_url 输入化 + writeFile await
- **v5.0.0** (2026-07-29)：新增发票新建 skill + invoice-pipeline 主编排
- **v4.0.0** (2026-07-28)：新增企微发票查询 skill（只读查询订单号是否已开票）
- **v3.0.0** (2026-07-28)：重构为多 skill 仓库结构，新增企微发票录入 skill
- **v2.0.0** (2026-07-27)：订单核验 skill 全面重写为 QuickJS 兼容 + Vue 直驱
- **v1.0.0** (2026-07-27)：订单核验 skill 初版
