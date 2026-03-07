---
title: control-plane API接入测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 保存本轮最小 control-plane 应用、worker 与 control-plane 真实联调、override API 和结果回传桥接的客观证据。
---

# control-plane API接入测试举证

## 执行元数据

- Date: 2026-03-07
- Operator: Codex
- Scope: control-plane API接入
- Environment: /home/jianghua519/ai-web-testing-platform-v2

## 证据内容

- Run ID: control-plane-api-integration-20260307
- Commands:
  - `npm install`
  - `npm run typecheck`
  - `node --input-type=module <<'EOF' ... startControlPlaneServer() + WebJobRunner.run(...) + override API ... EOF`
  - `bash ./scripts/validate_docs.sh`
  - `bash ./scripts/validate_contracts.sh`
  - `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`
- Artifact locations:
  - `apps/control-plane/src/types.ts`
  - `apps/control-plane/src/runtime/control-plane-state.ts`
  - `apps/control-plane/src/runtime/control-plane-server.ts`
  - `apps/web-worker/src/control/http-step-controller.ts`
  - `apps/web-worker/src/job-runner/web-job-runner.ts`
  - `contracts/openapi.yaml`
  - `README.md`
  - `docs/project/tasks/20260307-092221-control-plane-api-project-task.md`
  - `docs/design/tasks/20260307-092221-control-plane-api-design-task.md`
  - `docs/testing/test-plans/20260307-092221-control-plane-api-test-plan.md`
  - `docs/testing/test-reports/20260307-092221-control-plane-api-test-report.md`
  - `docs/evidence/records/20260307-092221-control-plane-api-evidence.md`
- Key observed result:
  - 仓库内真实 `control-plane` 服务已启动并返回 `healthz=ok`。
  - control-plane 成功接收两条 `step.result_reported` 和一条 `job.result_reported`。
  - `open-home` 完成后，通过 override API 远程提交了 `replace` 指令。
  - worker 最终执行的第二个 URL 为 `https://example.com/dashboard-control-plane-patched`。
  - 仓库没有容器入口，未执行容器内或真实浏览器 E2E。

## 追溯关系

- Test report: docs/testing/test-reports/20260307-092221-control-plane-api-test-report.md
- Related change: docs/project/tasks/20260307-092221-control-plane-api-project-task.md
