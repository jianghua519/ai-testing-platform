---
title: web-dsl-schema 与 dsl-compiler 代码骨架测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 本轮已成功建立 TypeScript workspace、schema 包与 compiler 包骨架，typecheck、文档校验和契约校验均通过。
---

# web-dsl-schema 与 dsl-compiler 代码骨架测试报告

## 环境

- 日期：2026-03-07
- 执行者：Codex
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- 分支：main
- Node.js：v22.22.0
- npm：10.9.4

## 执行检查

1. 依赖安装：
   - `npm install`
2. TypeScript 类型检查：
   - `npm run typecheck`
3. 文档校验：
   - `bash ./scripts/validate_docs.sh`
4. 契约校验：
   - `bash ./scripts/validate_contracts.sh`
5. 运行入口检查：
   - `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`

## 结果

- 根 workspace、`web-dsl-schema` 和 `dsl-compiler` 代码骨架已建立。
- `npm run typecheck` 首次失败，原因是 `tsconfig.base.json` 缺少 `baseUrl`；修复后再次执行通过。
- `bash ./scripts/validate_docs.sh` 执行通过。
- `bash ./scripts/validate_contracts.sh` 执行通过。
- 仓库内未发现 `docker-compose` / `compose*.yml` / `compose*.yaml` / `Dockerfile*`，无法进行容器内或服务级真实运行验证。
- 本轮未启动服务，未执行真实服务 E2E。

## 关联证据

- [20260307-082310-web-dsl-schema-dsl-compiler-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-082310-web-dsl-schema-dsl-compiler-evidence.md#L1)
