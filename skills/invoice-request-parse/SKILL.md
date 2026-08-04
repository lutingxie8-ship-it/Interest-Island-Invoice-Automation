---
name: invoice-request-parse
description: 读取 handoff 交接目录里由 invoice-mail-monitor 写出的发票邮件侧车（xlsx 附件），用 openpyxl 直读《开票申请汇总表》，提取金额/订单号/备注/发票抬头/税号，校验订单号合法性并去重，最终生成 .md + .xlsx 双报告（供下游兴趣岛开票流水线 invoice-pipeline 消费）。不连邮箱、不碰凭证。当 automation 检测到 pending 有侧车、或用户说"解析发票申请""生成开票报告"时使用。
---

# invoice-request-parse（发票请求解析）

## 职责边界
- ✅ 读 handoff/pending 侧车 → 解析 xlsx → 校验订单号 → 去重 → 生成 .md/.xlsx 报告 → 移走侧车
- ❌ 不连邮箱、不取邮件（那是 `invoice-mail-monitor` 的职责）

## 运行方式
在 skill 根目录执行（配置文件位于 `skill/config.yaml`，无凭证）：

```bash
cd ~/.workbuddy/skills/invoice-request-parse
venv/Scripts/python.exe -m skill.src.parse
```

Windows Git Bash 路径：`/c/Users/EDY/.workbuddy/skills/invoice-request-parse`。

## 输入（交接产物）
`<handoff.dir>/pending/*.json` 侧车（由 monitor 写出），每个附带同名 `.xlsx` 附件。

## 输出
- `<handoff.dir>/reports/<日期>_发票邮件报告.md` —— 给 AI / invoice-pipeline 消费
- `<handoff.dir>/reports/<日期>_发票邮件报告.xlsx` —— 5 个 Sheet，给人看
- 成功处理的侧车移到 `<handoff.dir>/processed/`
- 解析失败的侧车保留在 pending/，下次重试

## 下游衔接
`invoice-pipeline`（兴趣岛开票流水线）直接读取本 skill 生成的 `.md`：
加急订单在前、正常订单次之、异常订单单列，订单号已清洗为纯数字、抬头/税号齐全。

## 注意事项
- 表格解析用 openpyxl 直读，**不经过 HTML 中转**，列序变化也能按表头别名自适应。
- `config.yaml` 的 `keywords.table_parser.field_mapping` / `column_indices` 控制字段提取；模板列序变了改这里即可。
- 历史去重：已开票订单号记录在 `<handoff.dir>/processed_emails.json`，跨轮不重复开票。
