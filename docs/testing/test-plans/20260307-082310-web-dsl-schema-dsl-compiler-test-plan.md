---
title: web-dsl-schema 与 dsl-compiler 代码骨架测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证本轮 TypeScript workspace、schema 包和 compiler 包骨架是否建立完成并可通过类型检查。
---

# web-dsl-schema 与 dsl-compiler 代码骨架测试计划

## 测试范围

- 根 workspace 与 TypeScript 配置。
- `packages/web-dsl-schema` 的类型定义导出。
- `packages/dsl-compiler` 的最小 compile pipeline。
- 文档与契约校验脚本。
- 运行入口缺失情况记录。

## 覆盖风险

- 包结构建立了，但包间引用不可编译。
- compiler pipeline 文件存在，但入口未真正串起来。
- 根脚本和说明未同步，后续开发无法直接使用。
- 缺少证据和追溯信息。

## 测试用例

1. 检查根目录是否存在 `package.json`、`tsconfig.base.json`、`.gitignore`。
2. 检查 `packages/web-dsl-schema` 是否包含 source / compiled / result / errors / versioning 模型。
3. 检查 `packages/dsl-compiler` 是否包含 compiler 入口、phase、resolver、binder、diagnostics。
4. 执行 `npm install`。
5. 执行 `npm run typecheck`。
6. 执行 `bash ./scripts/validate_docs.sh`。
7. 执行 `bash ./scripts/validate_contracts.sh`。
8. 检查仓库是否存在 `docker-compose` / `Dockerfile` 等运行入口。

## 通过标准

- TypeScript workspace 可以完成 typecheck。
- 关键包和文件都已建立。
- 文档校验和契约校验通过。
- 运行时验证限制被明确记录。
