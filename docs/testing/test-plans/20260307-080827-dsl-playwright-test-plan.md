---
title: DSL 编译器模块设计与 Playwright 适配层包结构测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证本轮模块设计是否覆盖编译器分层、核心接口、适配层包结构和执行边界。
---

# DSL 编译器模块设计与 Playwright 适配层包结构测试计划

## 测试范围

验证本轮新增文档是否完整覆盖以下内容：

1. `dsl-compiler` 模块分层和核心入口。
2. `CompileContext`、resolver、lowering、diagnostics、emitter 设计。
3. `playwright-adapter` 包结构、执行引擎、注册表和结果归口。
4. 编译器与适配层之间的稳定契约。
5. 任务文档、测试报告和证据记录的追溯关系。

## 覆盖风险

- 模块拆分仍然停留在概念层，无法直接指导实现。
- 编译器和适配层边界模糊，后续 Worker 容易重复实现逻辑。
- 文档没有明确调用时序和失败处理边界。
- 索引、证据或治理校验遗漏。

## 测试用例

1. 检查设计文档是否包含总体分层、目录结构、核心接口和时序图。
2. 检查设计文档是否包含 `DslCompiler`、`PlaywrightAdapter`、`StepExecutorRegistry` 等关键接口。
3. 检查设计文档是否覆盖 `phases`、`resolvers`、`lowering`、`artifacts`、`result` 等包职责。
4. 运行 `bash ./scripts/validate_docs.sh`。
5. 运行 `bash ./scripts/validate_contracts.sh`。
6. 检查仓库中是否存在容器或服务启动入口，以判断能否做真实运行验证。

## 通过标准

- 关键接口和模块划分都能在设计文档中定位。
- 文档校验和契约校验通过。
- 运行时验证限制被明确记录，没有用静态检查替代真实 E2E。
- 测试报告和证据记录完整回填。
