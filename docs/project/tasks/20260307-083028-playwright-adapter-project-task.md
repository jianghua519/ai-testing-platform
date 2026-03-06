---
title: playwright-adapter 代码骨架任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 在现有 schema 与 compiler 基础上落地 Playwright 适配层代码骨架，建立执行器注册表、执行引擎和运行时会话边界。
---

# playwright-adapter 代码骨架任务说明

## 目标

把前一轮的 `playwright-adapter` 设计说明落成真实 TypeScript 包，形成后续接入 `web-worker` 和真实浏览器执行的基础骨架。

## 范围

- `packages/playwright-adapter` 包结构。
- registry、execution engine、session、locator、assertion、action executor、result builder。
- 根 workspace `typecheck` 接线。
- 中文任务文档、测试计划、测试报告、测试举证。

## 验收标准

- 仓库中存在 `playwright-adapter` 包并通过 `npm run typecheck`。
- 包内有稳定的 `PlaywrightAdapter`、`StepExecutorRegistry`、`ExecutionSession` 等核心接口。
- 至少落下基础 action executor 和控制节点 executor 骨架。
- 文档校验和契约校验通过。

## 约束

- 当前仓库没有 `web-worker` 与运行服务入口，本轮不做真实任务调度。
- 当前仓库没有容器运行入口，本轮无法按容器方式验证。
- 本轮不追求完整 Playwright 功能覆盖，只做可扩展骨架。
