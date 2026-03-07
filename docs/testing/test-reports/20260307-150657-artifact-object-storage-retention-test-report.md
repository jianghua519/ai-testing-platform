---
title: artifact 对象存储、下载与保留策略测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录对象存储上传、artifact 下载/保留策略和 Dockerfile 层缓存优化的容器化验证结果。
---

# artifact 对象存储、下载与保留策略测试报告

## 环境

- 日期：2026-03-07
- 执行者：squad
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- 环境：宿主机 Linux + Docker Compose 本地栈
- 对象存储：MinIO（S3 兼容）
- 浏览器：容器内 Headless Chromium 145.0.7632.6

## 执行检查

1. `docker compose build tools control-plane`
2. `docker compose down -v`
3. `docker compose up -d postgres minio --wait`
4. `docker compose run --rm tools npm run typecheck`
5. `docker compose run --rm tools bash ./scripts/validate_contracts.sh`
6. `docker compose run --rm tools npm run control-plane:migrate:postgres`
7. `docker compose up -d control-plane --wait`
8. `docker compose run --rm tools npm run smoke:control-plane:compose`
9. `docker compose run --rm tools npm run smoke:scheduler:compose`
10. 文档更新后再次执行 `docker compose build tools control-plane`
11. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 结果

### 构建、类型与契约

- 首次 `docker compose build tools control-plane` 通过。
- `typecheck` 通过。
- 契约校验通过。

### migration 与 control-plane compose smoke

- migration 通过，关键结果：
  - `appliedCount=6`
  - 新增 `006_artifact_object_storage_retention.sql`
- `smoke:control-plane:compose` 通过。
- 关键结果：
  - `migrations.length=6`
  - `runsPageSizes=[2,1]`
  - `runItemsPageSizes=[2,1]`
  - `runStepEventsPageSizes=[2,1]`
  - `runArtifactRetentions=["2026-03-14T00:00:00.000Z"]`

### scheduler compose smoke

- `smoke:scheduler:compose` 通过。
- 调度与运行控制结果没有回退：
  - `firefoxCycle.status="idle"`
  - `observedActiveLeases=2`
  - `pauseResponseStatus=202`
  - `pausedRunItemState="paused"`
  - `resumeResponseStatus=202`
  - `resumedRunItemState="active"`
  - `cancelResponseStatus=202`
  - `workerStatus` 为 `executed, executed, canceled`

### 对象存储、下载与保留策略

- 每个 `run_item` 的 artifact API 都返回 `s3://aiwtp-artifacts/...` URI。
- 抽样对象在 MinIO 中真实存在：
  - `video.sizeBytes=83530`
  - `trace.sizeBytes=30527`
  - `screenshot.sizeBytes=23574`
- 每条 artifact 都返回了 `retention_expires_at`。
- 下载策略验证通过：
  - `redirectStatus=302`
  - `redirectLocation` 含 `X-Amz-Algorithm=AWS4-HMAC-SHA256`
  - `streamStatus=200`
  - `streamContentType="image/png"`
  - `streamSizeBytes=23574`
- 保留期清理验证通过：
  - `scannedCount=1`
  - `deletedCount=1`
  - `deletedStreamStatus=404`

### Dockerfile layer caching

- 文档变更后再次执行 `docker compose build tools control-plane`，`npm ci` 与 `npx playwright install --with-deps chromium` 命中缓存。
- 说明依赖层已与源码/文档层解耦，达到了本轮缓存优化目标。

## 结论

- 这轮已经把 artifact 从“本地文件 + 数据库投影”推进到“对象存储 + 下载 + 保留期清理”的可验证闭环。
- 同时 `Dockerfile` 已完成依赖层前置，重复构建不会因文档改动重新执行 `npm ci` 和浏览器安装。

## 关联证据

- [20260307-150657-artifact-object-storage-retention-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-150657-artifact-object-storage-retention-evidence.md)
