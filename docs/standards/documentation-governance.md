---
title: 文档治理规范
status: active
owner: docs
last_updated: 2026-03-06
summary: 定义仓库文档类别、元数据、完整性校验和交付要求的治理规范。
---

# 文档治理规范

这份规范定义了仓库交付工作必须满足的最小文档集。

## 目标

- 保证项目文档、设计文档、测试文档和测试举证始终可发现。
- 阻止“缺文档”或“文档明显未完成”的变更进入主线。
- 让校验足够轻量，可以在每次修改后执行。

## 最低要求

- 项目：`docs/project/project-overview.md` 必须存在，任务型交付应记录到 `docs/project/tasks/`。
- 设计：`docs/design/design-index.md` 必须存在，重要变更应在 `docs/design/tasks/` 中留下设计说明。
- 测试：`docs/testing/test-strategy.md` 必须存在，测试计划放在 `docs/testing/test-plans/`，测试报告放在 `docs/testing/test-reports/`。
- 举证：`docs/evidence/evidence-index.md` 必须存在，每次有价值的验证执行都应在 `docs/evidence/records/` 下留下记录。

## 元数据要求

`docs/` 下所有非模板 Markdown 文档都必须带 YAML front matter：

```yaml
---
title: 文档标题
status: active
owner: team-or-role
last_updated: 2026-03-06
summary: 一句话说明文档用途。
---
```

允许的 `status` 值：

- `draft`
- `active`
- `deprecated`
- `template`

## 完整性规则

- 基线文档必须存在。
- 非模板文档不得保留未完成占位片段。
- `docs/evidence/records/` 下的证据文档必须登记到 `docs/evidence/evidence-index.md`。
- 对发布有影响的任务，如果只有测试报告没有证据记录，视为文档不完整。

## 流程要求

- 新功能或缺陷修复：只要行为或范围发生变化，就要更新项目说明或设计说明。
- 任何值得引用的验证执行，都要补测试报告和证据记录。
- 交付前必须运行 `make validate`。
