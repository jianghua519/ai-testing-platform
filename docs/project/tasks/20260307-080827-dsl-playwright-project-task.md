---
title: DSL 编译器模块设计与 Playwright 适配层包结构任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 细化 Web step DSL 的编译器模块边界、包结构、核心接口以及 Playwright 适配层职责划分。
---

# DSL 编译器模块设计与 Playwright 适配层包结构任务说明

## 目标

把上一轮的“DSL 编译规则 + Playwright 执行映射表”继续推进到模块设计层，输出可直接指导实现的包结构、职责边界、核心接口和编排关系。

## 范围

- `dsl-compiler` 模块的分层设计。
- `playwright-adapter` 适配层的包结构与接口。
- 编译器与 Worker、报告域、证据采集之间的交互边界。
- 与既有 `WebStepPlan`、`CompiledWebPlan`、`StepResult` 设计的衔接关系。

## 验收标准

- 给出明确的模块边界、目录结构和职责划分。
- 给出核心接口、输入输出模型和调用时序。
- 说明编译器如何向 Playwright 适配层下发可执行指令。
- 补齐测试计划、测试报告和证据记录，并通过现有校验脚本。

## 约束

- 保持与现有 DSL 设计、控制面分层和技术选型一致。
- 不直接改写现有 `contracts/openapi.yaml` 与 `contracts/asyncapi.yaml`。
- 当前仓库无运行时服务和容器入口，本轮只做静态设计验证。
