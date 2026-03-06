---
title: web-worker 结果回传协议与 HTTP publisher测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 保存本轮结果回传 envelope、HTTP publisher、本地 HTTP 发布验证以及文档与契约校验的客观证据。
---

# web-worker 结果回传协议与 HTTP publisher测试举证

## 执行元数据

- Date: 2026-03-07
- Operator: Codex
- Scope: web-worker 结果回传协议与 HTTP publisher
- Environment: /home/jianghua519/ai-web-testing-platform-v2

## 证据内容

- Run ID: web-worker-http-publisher-20260307
- Commands:
  - `npm install`
  - `npm run typecheck`
  - `node --input-type=module <<'EOF' ... HttpResultPublisher + WebJobRunner.run(createWebWorkerJobFixture()) ... EOF`
  - `bash ./scripts/validate_docs.sh`
  - `bash ./scripts/validate_contracts.sh`
  - `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`
- Artifact locations:
  - `apps/web-worker/src/job-runner/types.ts`
  - `apps/web-worker/src/reporting/types.ts`
  - `apps/web-worker/src/reporting/result-envelope.ts`
  - `apps/web-worker/src/reporting/http-publisher.ts`
  - `apps/web-worker/src/reporting/create-publisher.ts`
  - `docs/project/tasks/20260307-084405-web-worker-http-publisher-project-task.md`
  - `docs/design/tasks/20260307-084405-web-worker-http-publisher-design-task.md`
  - `docs/testing/test-plans/20260307-084405-web-worker-http-publisher-test-plan.md`
  - `docs/testing/test-reports/20260307-084405-web-worker-http-publisher-test-report.md`
  - `docs/evidence/records/20260307-084405-web-worker-http-publisher-evidence.md`
- Key observed result:
  - worker 可生成 `job.result_reported` envelope。
  - `HttpResultPublisher` 可向本地接收端成功 POST。
  - 本地接收端收到 `tenantId/projectId/runItemId/stepCount` 等关键字段。
  - 仓库无容器入口，未执行容器内或真实控制面验证。

## 追溯关系

- Test report: docs/testing/test-reports/20260307-084405-web-worker-http-publisher-test-report.md
- Related change: docs/project/tasks/20260307-084405-web-worker-http-publisher-project-task.md
