---
title: playwright-adapter 代码骨架测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证本轮 Playwright 适配层包结构、执行引擎、执行器注册表和根 workspace 接线是否建立完成。
---

# playwright-adapter 代码骨架测试计划

## 测试范围

- `packages/playwright-adapter` 目录结构与核心接口。
- registry、execution engine、session factory、locator、assertion、action executor、result builder。
- 根 workspace `typecheck`。
- 文档校验与契约校验。
- 运行入口缺失情况记录。

## 覆盖风险

- 包结构存在但无法通过类型检查。
- registry 和 engine 没有真正串起来。
- 结果模型和 action executor 没有统一出口。
- 文档与实际代码偏移。

## 测试用例

1. 检查 `packages/playwright-adapter` 是否存在 `types.ts`、`runtime`、`actions`、`locators`、`assertions`、`result` 等目录和文件。
2. 检查 `RegistryBasedPlaywrightAdapter`、`ExecutionEngine`、`BasicStepExecutorRegistry` 是否存在。
3. 检查基础 action executor 和控制节点 executor 是否存在。
4. 执行 `npm install`。
5. 执行 `npm run typecheck`。
6. 执行 `bash ./scripts/validate_docs.sh`。
7. 执行 `bash ./scripts/validate_contracts.sh`。
8. 检查仓库是否存在 `docker-compose` / `Dockerfile` 等运行入口。

## 通过标准

- `playwright-adapter` 代码骨架齐全并通过 typecheck。
- 文档校验和契约校验通过。
- 运行时验证限制被明确记录。
