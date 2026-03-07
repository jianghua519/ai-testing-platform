---
title: artifact 对象存储、下载与保留策略测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录对象存储上传、下载/保留策略和 Dockerfile 层缓存优化的容器化命令与关键输出。
---

# artifact 对象存储、下载与保留策略测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：squad
- 基线提交：`726ae1181522f330b56d2859d444d92723c1eea3`
- 任务：artifact 对象存储、下载与保留策略 + Dockerfile layer caching
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

1. `docker compose build tools control-plane`
2. `docker compose down -v`
3. `docker compose up -d postgres minio --wait`
4. `docker compose run --rm tools npm run typecheck`
5. `docker compose run --rm tools bash ./scripts/validate_contracts.sh`
6. `docker compose run --rm tools npm run control-plane:migrate:postgres`
7. `docker compose up -d control-plane --wait`
8. `docker compose run --rm tools npm run smoke:control-plane:compose`
9. `docker compose run --rm tools npm run smoke:scheduler:compose`
10. `docker compose build tools control-plane`
11. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 关键输出

### migration

- `appliedCount=6`
- `items=["001_control_plane_postgres.sql","002_control_plane_runtime_extensions.sql","003_control_plane_scheduler.sql","004_control_plane_capability_requirements.sql","005_control_plane_runtime_controls.sql","006_artifact_object_storage_retention.sql"]`

### control-plane compose smoke

- `runsPageSizes=[2,1]`
- `runItemsPageSizes=[2,1]`
- `runStepEventsPageSizes=[2,1]`
- `runArtifactIds=["bd690271-87c8-4f46-8c61-0e11434b1015"]`
- `runArtifactRetentions=["2026-03-14T00:00:00.000Z"]`

### scheduler compose smoke

- `firefoxCycle={"status":"idle"}`
- `observedActiveLeases=2`
- `pauseResponseStatus=202`
- `resumeResponseStatus=202`
- `cancelResponseStatus=202`
- `runsApiStatuses=[{"status":"canceled"},{"status":"succeeded"},{"status":"succeeded"}]`
- `leaseRows=[{"status":"completed"},{"status":"completed"},{"status":"canceled"}]`

### 对象存储 artifact 抽样

- `video`
  - `storageUri="s3://aiwtp-artifacts/.../videos/bd8c9173-281a-43e6-ae2e-44791cb17736-596aa1b2-bebd-41a5-ba35-7af6d26f24f3.webm"`
  - `sizeBytes=83530`
- `trace`
  - `storageUri="s3://aiwtp-artifacts/.../traces/assert-submit-result-passed.zip"`
  - `sizeBytes=30527`
- `screenshot`
  - `storageUri="s3://aiwtp-artifacts/.../steps/assert-submit-result-passed.png"`
  - `sizeBytes=23574`

### 下载与清理

- `artifactDownload.redirectStatus=302`
- `artifactDownload.redirectLocation` 含：
  - `http://127.0.0.1:19000/aiwtp-artifacts/...`
  - `X-Amz-Algorithm=AWS4-HMAC-SHA256`
- `artifactDownload.streamStatus=200`
- `artifactDownload.streamContentType="image/png"`
- `artifactDownload.streamSizeBytes=23574`
- `artifactPrune={"scannedCount":1,"deletedCount":1,"deletedArtifactIds":["8e5d1eef-4bd6-42bd-9c16-c26dbbbef39c"],"failures":[]}`
- `artifactDownload.deletedStreamStatus=404`

### Dockerfile layer caching

- 第二次 `docker compose build tools control-plane` 关键缓存命中：
  - `RUN npm ci` 命中 `CACHED`
  - `RUN npx playwright install --with-deps chromium` 命中 `CACHED`

## 产物位置

- migration 与 store：
  - [006_artifact_object_storage_retention.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/006_artifact_object_storage_retention.sql)
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [artifact-blob-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/artifact-blob-store.ts)
  - [control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts)
- worker artifact 上传：
  - [artifact-storage.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/artifact-storage.ts)
  - [playwright-artifact-collector.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/playwright-artifact-collector.ts)
- smoke / 运维：
  - [run_control_plane_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_compose_smoke.mjs)
  - [run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_scheduler_compose_smoke.mjs)
  - [prune_expired_artifacts.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/prune_expired_artifacts.mjs)
  - [Dockerfile](/home/jianghua519/ai-web-testing-platform-v2/Dockerfile)
  - [docker-compose.yml](/home/jianghua519/ai-web-testing-platform-v2/docker-compose.yml)

## 追溯关系

- 任务说明：[20260307-150657-artifact-object-storage-retention-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-150657-artifact-object-storage-retention-project-task.md)
- 设计说明：[20260307-150657-artifact-object-storage-retention-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-150657-artifact-object-storage-retention-design-task.md)
- 测试计划：[20260307-150657-artifact-object-storage-retention-test-plan.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-plans/20260307-150657-artifact-object-storage-retention-test-plan.md)
- 测试报告：[20260307-150657-artifact-object-storage-retention-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-150657-artifact-object-storage-retention-test-report.md)
