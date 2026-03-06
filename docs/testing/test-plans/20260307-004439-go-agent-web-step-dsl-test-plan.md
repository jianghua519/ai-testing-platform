---
title: Go控制面Agent协议Web step DSL接口和数据模型设计测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 用于验证 Go 控制面、Agent 协议和 Web step DSL 接口与数据模型设计文档完整性的测试计划。
---

# Go控制面Agent协议Web step DSL接口和数据模型设计测试计划

## 测试范围

验证设计文档是否完整覆盖：

- 控制面 REST 接口分组与 endpoint
- Agent 协议流程与消息模型
- Web step DSL 顶层结构、步骤模型、定位器模型、断言模型
- 结果模型与现有 run / job 契约的映射关系

## 覆盖风险

- 设计文档只讲概念，没有接口与字段级定义。
- Agent 协议与控制面接口边界混乱。
- DSL 结构不足以支撑 step 级执行。
- 文档校验或契约校验失败。

## 测试项

1. 检查项目任务说明、设计说明、测试计划、测试报告、测试举证是否齐全。
2. 检查设计文档是否定义了控制面接口、Agent 协议和 Web step DSL schema。
3. 检查设计文档是否说明了与现有 OpenAPI / AsyncAPI 的映射关系。
4. 运行 `bash ./scripts/validate_docs.sh`。
5. 运行 `bash ./scripts/validate_contracts.sh`。

## 通过标准

- 设计文档覆盖本次任务的三大目标主题。
- 关键数据模型已具备实现级参考价值。
- 文档与契约校验通过。
- 测试报告与证据记录可追溯。
