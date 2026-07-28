# Interest Island Invoice Automation

> 兴趣岛开票自动化 Skill 集合 · 基于 dev-browser 浏览器自动化 · 绕过企微无 API 权限限制

---

## 包含的 Skill

| Skill | 目录 | 功能 |
|-------|------|------|
| 订单开票核验 | [skills/order-invoice-checker](skills/order-invoice-checker/SKILL.md) | 查询订单是否已开票（Vue 直驱 + 只读查询） |
| 企微发票录入 | [skills/wecom-invoice-import](skills/wecom-invoice-import/SKILL.md) | 把税务局导出的 Excel 发票记录批量录入企微在线表格 |

---

## 环境依赖

两个 skill 共用以下环境：

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

## Skill 2：企微发票录入

**位置**：`skills/wecom-invoice-import/`

把税务局导出的 Excel 发票记录，自动录入到企微在线表格末尾。

- 读取 Excel「信息汇总表」→ 生成 TSV → 剪贴板写入 → Ctrl+V 粘贴
- 6 步流程：读 Excel → 登录确认 → 重复检查 → 导航到空行 → 粘贴 → 刷新验证
- 核心原理：粘贴走表格正常 paste 事件，自动触发 mutation 提交到服务器

详见 [skills/wecom-invoice-import/SKILL.md](skills/wecom-invoice-import/SKILL.md)

---

## 目录结构

```
Interest-Island-Invoice-Automation/
├── README.md                              ← 本文件（总览）
├── .gitignore
├── skills/
│   ├── order-invoice-checker/             ← 订单开票核验
│   │   ├── SKILL.md
│   │   ├── automation/                    ← dev-browser 自动化脚本
│   │   └── config/                        ← 配置文件
│   └── wecom-invoice-import/              ← 企微发票录入
│       ├── SKILL.md
│       └── scripts/
│           ├── setup.py                   ← 环境检查与依赖安装
│           └── read_excel_to_tsv.py       ← Excel 转 TSV
├── logs/                                  ← 运行日志（gitignore）
└── screenshots/                           ← 截图（gitignore）
```

---

## 版本

- **v3.0.0** (2026-07-28)：重构为多 skill 仓库结构，新增企微发票录入 skill
- **v2.0.0** (2026-07-27)：订单核验 skill 全面重写为 QuickJS 兼容 + Vue 直驱
- **v1.0.0** (2026-07-27)：订单核验 skill 初版
