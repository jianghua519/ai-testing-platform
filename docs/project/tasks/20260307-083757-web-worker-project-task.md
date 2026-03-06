---
title: web-worker 代码骨架任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 在现有 schema、compiler 和 playwright-adapter 基础上落地 web-worker 代码骨架，形成最小任务执行闭环。
---

# web-worker 代码骨架任务说明

## 目标

把前几轮拆好的 `web-dsl-schema`、`dsl-compiler`、`playwright-adapter` 串成一个真实的 `web-worker` 骨架，让仓库里第一次出现“任务输入 -> 编译 -> 会话 -> 执行 -> 结果发布”的完整路径。

## 范围

- `apps/web-worker` workspace 包。
- job model、job runner、browser launcher、session manager、result publisher、bootstrap。
- 根 workspace 更新到 `apps/*`。
- 中文任务文档、测试计划、测试报告、测试举证。

## 验收标准

- 仓库中存在 `apps/web-worker` 并通过 `npm run typecheck`。
- `web-worker` 能调用 `dsl-compiler` 和 `playwright-adapter`。
- 至少完成一次真实的 `WebJobRunner.run()` 运行流验证。
- 文档校验和契约校验通过。

## 约束

- 当前仓库没有容器运行入口，无法按容器方式验证。
- 当前仓库没有真实服务编排和浏览器二进制管理，本轮不做真实浏览器 E2E。
- 本轮不实现 API worker，不改动现有 OpenAPI / AsyncAPI 契约。
