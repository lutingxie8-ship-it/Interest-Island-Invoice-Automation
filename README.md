# Interest Island Invoice Automation

> 兴趣岛开票自动化 Skill 集合 · 基于 dev-browser 浏览器自动化 · 绕过企微无 API 权限限制

---

## 包含的 Skill

| Skill | 目录 | 功能 |
|-------|------|------|
| 订单开票核验 | [skills/order-invoice-checker](skills/order-invoice-checker/SKILL.md) | 查询订单是否已开票（Vue 直驱 + 只读查询） |
| 发票新建 | [skills/invoice-create](skills/invoice-create/SKILL.md) | 在开票审核页填写"新建发票"弹窗（**默认不提交，需显式 confirm=true**） |
| 企微发票查询 | [skills/wecom-invoice-query](skills/wecom-invoice-query/SKILL.md) | 在企微文档内查询订单号是否已存在开票记录（只读） |
| 企微发票录入 | [skills/wecom-invoice-import](skills/wecom-invoice-import/SKILL.md) | 把税务局导出的 Excel 发票记录批量录入企微在线表格 |

---

## 环境依赖

三个 skill 共用以下环境：

1. **dev-browser**（浏览器自动化工具）：WorkBuddy 自带，其他环境 `npm install -g dev-browser && dev-browser install`
2. **Python 3.8+**：WorkBuddy 自带
3. **openpyxl**：仅发票录入 skill 需要，运行 `python skills/wecom-invoice-import/scripts/setup.py` 自动安装
4. **首次扫码登录**：各 skill 首次使用时需要在弹出的浏览器窗口扫码登录

---

## Skill 1：订单开票核验

**位置**：`skills/order-invoice-checker/`

查询兴趣岛系统中的订单是否已开票，返回开票状态和发票信息。

- 查询方式：Vue 组件直驱（`listQuery` + `fetchData`），非 DOM 操作
- 运行环境：QuickJS 沙箱兼容
- 输入：订单号
- 输出：JSON（订单状态 + 发票信息 + 是否可开票）

详见 [skills/order-invoice-checker/SKILL.md](skills/order-invoice-checker/SKILL.md)

---

## Skill 2：发票新建

**位置**：`skills/invoice-create/`

在兴趣岛"开票审核"页面填写"新建发票"弹窗，**默认安全模式不提交**。

- 流程：导航到 `/finance/invoice` → 点击"批量开票"按钮 → 弹出 el-dialog → 填写订单ID → 自动填充所属品类/商品名称/用户ID → 填写开票金额/发票类型/抬头类型/发票抬头/企业税号 → 上传 PDF → 截图
- **🚨 安全门**：默认 `confirm=false`，只填到弹窗可提交状态，不点"确定"键；只有显式传 `confirm=true` 才执行提交
- 强校验：发票类型白名单（电子普通发票/增值税专用发票）、抬头类型白名单（个人/非企业/企业）、PDF ≤2000KB
- 输入：JSON 文件（含订单ID、开票金额、发票PDF路径等）
- 输出：JSON（弹窗填写状态 + auto-fill 字段值 + 弹窗截图路径 + safety_check 审计）

详见 [skills/invoice-create/SKILL.md](skills/invoice-create/SKILL.md)

---

## Skill 3：企微发票录入

**位置**：`skills/wecom-invoice-import/`

把税务局导出的 Excel 发票记录，自动录入到企微在线表格末尾。

- 读取 Excel「信息汇总表」→ 生成 TSV → 剪贴板写入 → Ctrl+V 粘贴
- 6 步流程：读 Excel → 登录确认 → 重复检查 → 导航到空行 → 粘贴 → 刷新验证
- 核心原理：粘贴走表格正常 paste 事件，自动触发 mutation 提交到服务器

详见 [skills/wecom-invoice-import/SKILL.md](skills/wecom-invoice-import/SKILL.md)

---

## Skill 4：企微发票查询

**位置**：`skills/wecom-invoice-query/`

在企微在线表格内查询订单号是否已存在开票记录（只读，不录入）。

- 用引擎 API 遍历"订单ID"列查询，不用 Ctrl+F（canvas 键盘不响应）
- 3 步流程：打开文档 → 登录确认 → 引擎 API 查询
- 输入：订单号；输出：找到/找不到

详见 [skills/wecom-invoice-query/SKILL.md](skills/wecom-invoice-query/SKILL.md)

---

## 目录结构

```
Interest-Island-Invoice-Automation/
├── README.md                              ← 本文件（总览）
├── .gitignore
├── skills/
│   ├── order-invoice-checker/             ← Skill 1：订单开票核验（步骤 5）
│   │   ├── SKILL.md
│   │   ├── automation/                    ← dev-browser 自动化脚本
│   │   │   └── interest_island_order_check.js
│   │   └── config/                        ← 配置文件
│   │       ├── settings.json
│   │       └── selectors.json
│   ├── invoice-create/                    ← Skill 2：发票新建（步骤 7，新增）
│   │   ├── SKILL.md
│   │   ├── automation/
│   │   │   └── interest_island_invoice_create.js
│   │   └── config/
│   │       ├── settings.json
│   │       └── selectors.json
│   ├── wecom-invoice-import/              ← Skill 3：企微发票录入（步骤 8）
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── setup.py                   ← 环境检查与依赖安装
│   │       └── read_excel_to_tsv.py       ← Excel 转 TSV
│   └── wecom-invoice-query/               ← Skill 4：企微发票查询（步骤 4）
│       ├── SKILL.md
│       └── scripts/
│           └── setup.py                   ← 环境检查
├── logs/                                  ← 运行日志（gitignore）
└── screenshots/                           ← 截图（gitignore）
```

---

## 版本

- **v5.0.0** (2026-07-29)：新增发票新建 skill（开票审核页"新建发票"弹窗填写，**默认不提交**，需显式 confirm=true）
- **v4.0.0** (2026-07-28)：新增企微发票查询 skill（只读查询订单号是否已开票）
- **v3.0.0** (2026-07-28)：重构为多 skill 仓库结构，新增企微发票录入 skill
- **v2.0.0** (2026-07-27)：订单核验 skill 全面重写为 QuickJS 兼容 + Vue 直驱
- **v1.0.0** (2026-07-27)：订单核验 skill 初版
