---
title: Web step DSL编译规则Playwright执行映射表设计任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 将 Web step DSL 进一步细化为编译规则和 Playwright 执行映射表的设计任务定义。
---

# Web step DSL编译规则Playwright执行映射表设计任务说明

## 目标

把已经定义好的 Web step DSL 和字段约束继续往执行层推进，形成“DSL 如何被编译成可执行计划”以及“每个 step 如何映射到 Playwright 操作”的明确规则，供后续编译器和 worker 实现使用。

## 范围

- 定义 DSL 从 `draft` 到 `compiled` 的编译阶段和产物结构。
- 定义字段校验、默认值注入、变量解析、控制流展开和环境绑定规则。
- 定义 Web step action 到 Playwright API 的映射表。
- 定义编译错误、执行错误和 step 结果回填规则。
- 补齐本次任务的测试计划、测试报告和测试举证文档。

## 验收标准

- 设计文档明确给出：
  - 编译阶段划分
  - 编译输入 / 输出模型
  - 默认值和变量解析规则
  - 控制流和分组的编译规则
  - Playwright 执行映射表
  - 结果回填与错误处理建议
- 测试与举证文档齐全。
- `bash ./scripts/validate_docs.sh` 和 `bash ./scripts/validate_contracts.sh` 执行通过。

## 约束

- 保持与前两轮 DSL 设计一致：
  - [20260307-004439-go-agent-web-step-dsl-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-004439-go-agent-web-step-dsl-design-task.md)
  - [20260307-005156-web-step-dsl-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-005156-web-step-dsl-design-task.md)
- 本轮只输出设计和规则，不直接改动 Playwright worker 实现。
- 设计必须可直接转成编译器逻辑和映射代码。
