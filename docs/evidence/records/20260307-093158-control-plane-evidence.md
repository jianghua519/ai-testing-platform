---
title: control-plane持久化和结果幂等测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 保存本轮 control-plane 文件持久化、runner-results 幂等、重启恢复和 step patch 主链路验证的客观证据。
---

# control-plane持久化和结果幂等测试举证

## 执行元数据

- Date: 2026-03-07
- Operator: Codex
- Scope: control-plane持久化和结果幂等
- Environment: /home/jianghua519/ai-web-testing-platform-v2

## 证据内容

- Run ID: control-plane-persistence-idempotency-20260307
- Commands:
  - `npm run typecheck`
  - `node --input-type=module <<'EOF' ... FileBackedControlPlaneStore + startControlPlaneServer() + duplicate replay + restart recovery ... EOF`
  - `bash ./scripts/validate_docs.sh`
  - `bash ./scripts/validate_contracts.sh`
  - `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`
- Artifact locations:
  - `apps/control-plane/src/types.ts`
  - `apps/control-plane/src/runtime/control-plane-state.ts`
  - `apps/control-plane/src/runtime/file-backed-control-plane-store.ts`
  - `apps/control-plane/src/runtime/create-control-plane-store.ts`
  - `apps/control-plane/src/runtime/control-plane-server.ts`
  - `apps/web-worker/src/testing/fixture.ts`
  - `contracts/openapi.yaml`
  - `docs/project/tasks/20260307-093158-control-plane-project-task.md`
  - `docs/design/tasks/20260307-093158-control-plane-design-task.md`
  - `docs/testing/test-plans/20260307-093158-control-plane-test-plan.md`
  - `docs/testing/test-reports/20260307-093158-control-plane-test-report.md`
  - `docs/evidence/records/20260307-093158-control-plane-evidence.md`
- Key observed result:
  - 重复投递同一结果 envelope 时，接口返回 `duplicate=true`，事件数保持 3。
  - control-plane 重启后，事件数仍然恢复为 3。
  - 状态文件中已持久化 `receivedEventIds`。
  - worker 最终执行的第二个 URL 为 `https://example.com/dashboard-persisted-patched`。
  - 仓库无容器入口，未执行容器内或真实浏览器 E2E。

## 追溯关系

- Test report: docs/testing/test-reports/20260307-093158-control-plane-test-report.md
- Related change: docs/project/tasks/20260307-093158-control-plane-project-task.md
