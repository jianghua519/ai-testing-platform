---
title: Web step DSL字段约束状态机示例集合设计测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 用于验证 Web step DSL 字段约束、状态机和示例集合设计文档完整性的测试计划。
---

# Web step DSL字段约束状态机示例集合设计测试计划

## 测试范围

验证设计文档是否完整覆盖：

- `WebStepPlan`、`WebStep`、`Locator`、`Assertion`、`StepResult` 的字段约束
- step 和 plan 的状态机
- 错误码建议
- 示例集合

## 覆盖风险

- 字段约束不够具体，无法落到 schema。
- 状态机缺失，无法支撑 step 级调试和报告。
- 示例不够覆盖主流业务场景。
- 文档校验或契约校验失败。

## 测试项

1. 检查项目任务说明、设计说明、测试计划、测试报告、测试举证是否齐全。
2. 检查设计文档是否显式给出字段约束、状态机和至少 5 类示例。
3. 检查设计文档是否与上一轮 Web step DSL 模型保持一致。
4. 运行 `bash ./scripts/validate_docs.sh`。
5. 运行 `bash ./scripts/validate_contracts.sh`。

## 通过标准

- 字段级规则足够支撑 schema 实现。
- 状态机和示例集合完整。
- 文档与契约校验通过。
- 测试报告与证据记录可追溯。
