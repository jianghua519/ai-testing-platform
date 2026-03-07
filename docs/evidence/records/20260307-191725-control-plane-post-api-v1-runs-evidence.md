---
title: control-plane 公开 POST /api/v1/runs测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录公开 `POST /api/v1/runs` 的容器化验证命令、真实 run 证据和关键输出。
---

# control-plane 公开 POST /api/v1/runs测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：squad
- 基线提交：`8c67b9bcc4f75849e1b14d3a9d5c4ac9ce0ca8da`
- 任务：control-plane 公开 POST /api/v1/runs
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

1. `docker compose run --build --rm tools npm run smoke:control-plane:postgres`
2. `docker compose build tools control-plane`
3. `docker compose down -v`
4. `docker compose up -d postgres minio --wait`
5. `docker compose run --rm tools npm run control-plane:migrate:postgres`
6. `docker compose up -d control-plane --wait`
7. `docker compose run --rm tools npm run smoke:control-plane:compose`
8. `docker compose run --rm tools npm run smoke:scheduler:compose`
9. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 关键输出

### 公开创建

- `publicRunCreate={"status":201,"runId":"80ed8934-5ab1-460c-a825-afc4e9482f23","runStatus":"queued","runItemCount":1}`
- `forbiddenPublicRunCreate={"status":403,"errorCode":"PROJECT_ACCESS_DENIED"}`
- `runsPageSizes=[2,2]`
- `domainCounts={"runs_count":4,"run_items_count":6,"step_events_count":5}`

### pg-mem 回归

- `overrideAccepted=true`
- `decisionAction="replace"`
- `stepDecisionTotal=1`
- `stepDecisionConsumed=1`

### scheduler compose 回归

- `queuedRunIds=["275101d3-f0ce-41ac-8af8-df6aa09264a0","481811d3-5154-4b87-b1c8-a8aee9214dbe","4115fd0c-5fcd-4ce9-81e3-6f0a8290c61e"]`
- `runsApiStatuses=[{"id":"4115fd0c-5fcd-4ce9-81e3-6f0a8290c61e","status":"canceled"},{"id":"481811d3-5154-4b87-b1c8-a8aee9214dbe","status":"succeeded"},{"id":"275101d3-f0ce-41ac-8af8-df6aa09264a0","status":"succeeded"}]`
- `pauseResponseStatus=202`
- `resumeResponseStatus=202`
- `cancelResponseStatus=202`

## 产物位置

- 实现与契约：
  - [control-plane-server.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-server.ts)
  - [openapi.yaml](/home/jianghua519/ai-testing-platform/contracts/openapi.yaml)
- smoke：
  - [run_control_plane_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_control_plane_compose_smoke.mjs)
  - [run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_scheduler_compose_smoke.mjs)
  - [run_control_plane_postgres_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_control_plane_postgres_smoke.mjs)

## 追溯关系

- 测试报告：[20260307-191725-control-plane-post-api-v1-runs-test-report.md](/home/jianghua519/ai-testing-platform/docs/testing/test-reports/20260307-191725-control-plane-post-api-v1-runs-test-report.md)
- 相关任务：[20260307-191725-control-plane-post-api-v1-runs-project-task.md](/home/jianghua519/ai-testing-platform/docs/project/tasks/20260307-191725-control-plane-post-api-v1-runs-project-task.md)
