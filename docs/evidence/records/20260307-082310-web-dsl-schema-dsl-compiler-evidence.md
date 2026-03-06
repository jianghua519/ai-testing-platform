---
title: web-dsl-schema 与 dsl-compiler 代码骨架测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 保存本轮 workspace 初始化、typecheck、文档校验和契约校验的客观执行证据。
---

# web-dsl-schema 与 dsl-compiler 代码骨架测试举证

## 执行元数据

- Date: 2026-03-07
- Operator: Codex
- Scope: web-dsl-schema 与 dsl-compiler 代码骨架
- Environment: /home/jianghua519/ai-web-testing-platform-v2

## 证据内容

- Run ID: code-skeleton-schema-compiler-20260307
- Commands:
  - `node --version`
  - `npm --version`
  - `npm install`
  - `npm run typecheck`
  - `bash ./scripts/validate_docs.sh`
  - `bash ./scripts/validate_contracts.sh`
  - `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`
- Artifact locations:
  - `package.json`
  - `tsconfig.base.json`
  - `packages/web-dsl-schema/`
  - `packages/dsl-compiler/`
  - `docs/project/tasks/20260307-082310-web-dsl-schema-dsl-compiler-project-task.md`
  - `docs/design/tasks/20260307-082310-web-dsl-schema-dsl-compiler-design-task.md`
  - `docs/testing/test-plans/20260307-082310-web-dsl-schema-dsl-compiler-test-plan.md`
  - `docs/testing/test-reports/20260307-082310-web-dsl-schema-dsl-compiler-test-report.md`
  - `docs/evidence/records/20260307-082310-web-dsl-schema-dsl-compiler-evidence.md`
- Key observed result:
  - TypeScript workspace 已建立。
  - `npm run typecheck` 在修复 `baseUrl` 后通过。
  - 文档校验与契约校验通过。
  - 仓库无运行时容器或服务入口，未执行真实 E2E。

## 追溯关系

- Test report: docs/testing/test-reports/20260307-082310-web-dsl-schema-dsl-compiler-test-report.md
- Related change: docs/project/tasks/20260307-082310-web-dsl-schema-dsl-compiler-project-task.md
