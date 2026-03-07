---
title: control-plane tenant schema隔离与最小身份token测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane tenant schema 隔离、最小身份 token 与实时 membership 授权模型的执行证据与关键输出。
---

# control-plane tenant schema隔离与最小身份token测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：squad
- 基线提交：`7e663f13321e821b736d2c300ab15eeada3ddcb1`
- 任务：control-plane tenant schema隔离与最小身份token
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

1. `docker compose run --build --rm tools npm run smoke:control-plane:postgres`
2. `docker compose build tools control-plane`
3. `docker rm -f ai-testing-platform-worker-agent`
4. `docker compose down -v`
5. `docker compose up -d postgres minio --wait`
6. `docker compose run --rm tools npm run control-plane:migrate:postgres`
7. `docker compose up -d control-plane --wait`
8. `docker compose run --rm tools npm run smoke:control-plane:compose`
9. `docker compose run --rm tools npm run smoke:scheduler:compose`
10. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 关键输出

### pg-mem smoke

- `overrideAccepted=true`
- `decisionAction="replace"`
- `firstPostStatus=202`
- `duplicatePostStatus=200`
- `jobPostStatus=202`
- `domainSummary.stepDecisionTotal=1`
- `domainSummary.stepDecisionConsumed=1`
- `domainSummary.stepDecisionRunId="44444444-4444-4444-4444-444444444444"`
- `domainSummary.stepDecisionRunItemId="55555555-5555-5555-5555-555555555555"`

### migration

- `appliedCount=7`
- `items=["001_control_plane_postgres.sql","002_control_plane_runtime_extensions.sql","003_control_plane_scheduler.sql","004_control_plane_capability_requirements.sql","005_control_plane_runtime_controls.sql","006_artifact_object_storage_retention.sql","007_control_plane_tenant_registry_auth.sql"]`

### control-plane compose smoke

- `health={"status":"ok"}`
- `databaseSummary={"current_database":"aiwtp","server_version":"18.3"}`
- `runsPageSizes=[2,1]`
- `runItemsPageSizes=[2,1]`
- `runArtifactIds=["3e328daa-2902-41fc-9595-184995abea7c"]`
- `runtimeTables=["agents","artifacts","job_leases"]`

### scheduler compose smoke

- `queuedRunIds=["92973f56-8aa9-4e25-b927-8c0921dc3670","d9b1f36f-c646-4dfd-86a1-77b69db1c4fd","a6309e07-b160-47db-8c4d-3794fe5901b2"]`
- `queuedJobIds=["1a847016-dc3f-40d8-bf9e-1bffd7522a8b","511a40c0-0381-431a-8e41-9a62207c7659","6d8e2511-fd8a-4bbd-a4ed-113073784d8c"]`
- `runsApiStatuses=[{"id":"a6309e07-b160-47db-8c4d-3794fe5901b2","status":"canceled"},{"id":"d9b1f36f-c646-4dfd-86a1-77b69db1c4fd","status":"succeeded"},{"id":"92973f56-8aa9-4e25-b927-8c0921dc3670","status":"succeeded"}]`
- `pauseResponseStatus=202`
- `resumeResponseStatus=202`
- `cancelResponseStatus=202`
- `artifactDownload.redirectStatus=302`
- `artifactDownload.streamStatus=200`
- `artifactPrune={"scannedCount":1,"deletedCount":1,"deletedArtifactIds":["ae792819-be2a-4f54-b603-4b220749be29"],"failures":[]}`

## 产物位置

- 迁移与 runtime：
  - [007_control_plane_tenant_registry_auth.sql](/home/jianghua519/ai-testing-platform/apps/control-plane/sql/007_control_plane_tenant_registry_auth.sql)
  - [auth.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/auth.ts)
  - [postgres-schema.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-schema.ts)
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [control-plane-server.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-server.ts)
- smoke 与辅助脚本：
  - [control_plane_auth.mjs](/home/jianghua519/ai-testing-platform/scripts/lib/control_plane_auth.mjs)
  - [run_control_plane_postgres_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_control_plane_postgres_smoke.mjs)
  - [run_control_plane_postgres_real_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_control_plane_postgres_real_smoke.mjs)
  - [run_control_plane_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_control_plane_compose_smoke.mjs)
  - [run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_scheduler_compose_smoke.mjs)
- 规范与说明：
  - [tenancy-policy.md](/home/jianghua519/ai-testing-platform/docs/v2/tenancy-policy.md)
  - [20260307-173247-control-plane-tenant-schema-token-project-task.md](/home/jianghua519/ai-testing-platform/docs/project/tasks/20260307-173247-control-plane-tenant-schema-token-project-task.md)
  - [20260307-173247-control-plane-tenant-schema-token-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-173247-control-plane-tenant-schema-token-design-task.md)
  - [20260307-173247-control-plane-tenant-schema-token-test-plan.md](/home/jianghua519/ai-testing-platform/docs/testing/test-plans/20260307-173247-control-plane-tenant-schema-token-test-plan.md)

## 追溯关系

- 测试报告：[20260307-173247-control-plane-tenant-schema-token-test-report.md](/home/jianghua519/ai-testing-platform/docs/testing/test-reports/20260307-173247-control-plane-tenant-schema-token-test-report.md)
- 相关任务：[20260307-173247-control-plane-tenant-schema-token-project-task.md](/home/jianghua519/ai-testing-platform/docs/project/tasks/20260307-173247-control-plane-tenant-schema-token-project-task.md)
