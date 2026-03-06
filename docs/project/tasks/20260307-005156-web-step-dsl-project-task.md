---
title: Web step DSL字段约束状态机示例集合设计任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 将 Web step DSL 继续细化为字段约束、状态机和示例集合的设计任务定义。
---

# Web step DSL字段约束状态机示例集合设计任务说明

## 目标

把上一轮 Web step DSL 的模型级设计继续收敛，形成可供 Console 设计器、编译器和 Playwright 执行器共同遵守的字段约束、状态机和示例集合。

## 范围

- 细化 `WebStepPlan`、`WebStep`、`Locator`、`StepInput`、`Assertion`、`RetryPolicy`、`ArtifactPolicy`、`StepResult` 的字段约束。
- 定义 step 定义态、编译态、执行态、结果态的状态机。
- 定义错误码和校验规则建议。
- 提供覆盖主流场景的 DSL 示例集合。
- 补齐本次任务的测试计划、测试报告和测试举证。

## 验收标准

- 设计文档明确给出：
  - 字段级约束
  - 互斥和依赖规则
  - step 状态机和 plan 状态机
  - 至少 5 类场景示例
- 测试与举证文档齐全。
- `bash ./scripts/validate_docs.sh` 和 `bash ./scripts/validate_contracts.sh` 执行通过。

## 约束

- 保持与上一轮 Web step DSL 设计一致：[20260307-004439-go-agent-web-step-dsl-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-004439-go-agent-web-step-dsl-design-task.md)。
- 本轮是 DSL 细化设计，不引入新的运行时技术选型。
- 文档要足够细，能直接指导 schema 编写和前后端校验实现。
