---
title: web-dsl-schema 与 dsl-compiler 代码骨架任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 在仓库中落地 Web DSL 共享 schema 包和 dsl-compiler 最小可编译代码骨架，并接入类型检查。
---

# web-dsl-schema 与 dsl-compiler 代码骨架任务说明

## 目标

把前几轮关于 Web step DSL、编译规则和模块设计的文档，推进为仓库中的真实 TypeScript 代码骨架，形成后续实现 Playwright adapter 和 web-worker 的基础。

## 范围

- 根 workspace 与 TypeScript 构建配置。
- `packages/web-dsl-schema` 共享 schema 包。
- `packages/dsl-compiler` 最小编译器实现。
- 中文任务文档、测试计划、测试报告、测试举证。

## 验收标准

- 仓库存在可用的 npm workspace 和 TypeScript 配置。
- `web-dsl-schema` 提供源 DSL、编译 DSL、执行结果和错误码类型。
- `dsl-compiler` 提供 `DslCompiler`、compile pipeline、diagnostics、最小 binding 实现。
- `npm run typecheck` 可以通过。
- 文档校验和契约校验通过。

## 约束

- 当前仓库没有容器运行入口，因此无法按容器方式执行验证。
- 本轮不实现 `playwright-adapter` 和 `web-worker` 代码，仅为其预留边界。
- 本轮不改写现有 OpenAPI / AsyncAPI 契约。
