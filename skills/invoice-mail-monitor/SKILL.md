---
name: invoice-mail-monitor
description: 监控阿里云企业邮箱，拉取未读邮件并按关键词分类，将「开票邮件」的 xlsx 附件提取到 handoff 交接目录（pending/），并标记该邮件为已读。这是发票自动化流水线的上游第一步，只负责「获取+过滤」，不解析表格。当用户说"检查发票邮件""拉取开票邮件""监控阿里云邮箱"，或自动化触发器要启动开票流程时使用。
---

# invoice-mail-monitor（发票邮件监控）

## 职责边界
- ✅ 连 IMAP、拉未读、三分类（invoice / other / uncertain）、取 xlsx 附件、写侧车、标已读
- ❌ 不解析表格、不校验订单号、不生成报告（那些是 `invoice-request-parse` 的职责）

## 运行方式
在 skill 根目录执行（配置文件位于 `skill/config.yaml`，含邮箱凭证）：

```bash
cd ~/.workbuddy/skills/invoice-mail-monitor
venv/Scripts/python.exe -m skill.src.monitor
```

Windows 上用 Git Bash 时路径为 `/c/Users/EDY/.workbuddy/skills/invoice-mail-monitor`。

## 输出（交接产物）
每封被判定为「开票邮件」且带 xlsx 附件的邮件，会在 `<handoff.dir>/pending/` 下写出一对文件：
- `<run_id>.json` 侧车：含 subject / sender / date / message_id / is_urgent / attachment(绝对路径)
- `<run_id>.xlsx`：原始附件字节

> 非开票邮件（other）直接跳过；疑似邮件（uncertain）保持未读，等人工或下次判断。

## 下游衔接
`invoice-request-parse` 会扫描 `<handoff.dir>/pending/*.json`，解析后把报告写到 `<handoff.dir>/reports/`，并把侧车移到 `<handoff.dir>/processed/`。

## 注意事项
- 凭证只在 `skill/config.yaml` 的 `email.password`，日志自动脱敏。
- 本 skill 不常驻；由外部 automation 按间隔（建议 1h）轮询调用。
- 若邮箱连接失败，会安全退出（退出码 0，不写任何侧车），不会误标已读。
