---
title: Go控制面Agent协议Web step DSL接口和数据模型设计任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 将 Go 控制面、Agent 协议和 Web step DSL 拆解为接口与数据模型的设计任务定义。
---

# Go控制面Agent协议Web step DSL接口和数据模型设计任务说明

## 目标

把上一轮的总体架构和技术选型继续细化，形成可供后续 OpenAPI、AsyncAPI 和实现代码直接使用的接口与数据模型设计，重点覆盖 Go 控制面、Agent 协议以及 Web step DSL。

## 范围

- 定义用户侧控制面 REST 接口边界。
- 定义 Agent 注册、心跳、租约、结果回传、取消等协议。
- 定义 Web step DSL 的文档结构、步骤模型、定位器模型、断言模型和执行结果模型。
- 说明这些接口与模型如何映射到现有 `run` / `run_item` / `job` 契约。
- 补齐本次任务的测试计划、测试报告和测试举证文档。

## 验收标准

- 设计文档明确给出：
  - 控制面接口分组与关键 endpoint
  - Agent 协议的交互流程与消息模型
  - Web step DSL 的核心 schema
  - 运行结果与 step 结果数据模型
  - 与现有 OpenAPI / AsyncAPI 契约的衔接关系
- 测试与举证文档齐全。
- `bash ./scripts/validate_docs.sh` 和 `bash ./scripts/validate_contracts.sh` 执行通过。

## 约束

- 保持与现有架构设计和技术选型结论一致：
  - [20260307-001530-ai-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-001530-ai-design-task.md)
  - [20260307-003354-ai-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-003354-ai-design-task.md)
- 本轮优先输出设计文档，不在同一轮大规模改写现有 OpenAPI / AsyncAPI 正文。
- 文档必须足够具体，能直接指导下一轮契约编写。
