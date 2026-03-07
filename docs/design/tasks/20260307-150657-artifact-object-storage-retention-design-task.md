---
title: artifact 对象存储、下载与保留策略设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明 worker artifact 上传到 S3 兼容对象存储、control-plane 下载与保留期清理，以及 Dockerfile 层缓存优化的实现方式。
---

# artifact 对象存储、下载与保留策略设计说明

## 背景

上一轮已经完成：

- `control-plane -> agent -> real Playwright worker -> PostgreSQL` 调度闭环
- `pause / resume / cancel`
- `screenshot / trace / video` 真采集
- artifact 落库和按 `run` / `run_item` 查询

但设计文档中明确保留了三个缺口：

1. artifact 仍落在 worker 本地文件系统。
2. 没有统一下载策略，控制面无法给出稳定下载入口。
3. 没有保留期与清理动作，artifact 只会累积不会回收。

## 方案设计

### 1. `006` migration：artifact 保留期字段

新增 [006_artifact_object_storage_retention.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/006_artifact_object_storage_retention.sql)：

- `artifacts.retention_expires_at`
- `idx_artifacts_retention_expires`

目标是把保留策略从 metadata 约定提升为可查询、可清理的正式字段。

### 2. worker 侧 artifact 存储抽象

新增 [artifact-storage.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/artifact-storage.ts)，把 artifact 落地拆成两个后端：

- `filesystem`
  - 继续返回 `file://` URI
  - 主要用于非对象存储场景和本地兜底
- `s3`
  - 使用 `@aws-sdk/client-s3`
  - 把 artifact 上传到 `ARTIFACT_S3_BUCKET`
  - 返回 `s3://bucket/key` URI

[playwright-artifact-collector.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/playwright-artifact-collector.ts) 不再直接决定 `uri`，而是在截图、trace、video 文件产生后统一交给存储抽象持久化。

对象 key 结构：

- `ARTIFACT_S3_PREFIX/{tenant_id}/{project_id}/{run_id}/{run_item_id}/attempt-{n}/steps/...`
- `.../traces/...`
- `.../videos/...`

### 3. artifact 保留策略

worker 在生成 `ArtifactReference` 时附带：

- `retentionExpiresAt`
- `metadata.retention_expires_at`

TTL 规则：

- `ARTIFACT_RETENTION_DAYS_DEFAULT`
- 可按类型覆盖：
  - `ARTIFACT_RETENTION_DAYS_SCREENSHOT`
  - `ARTIFACT_RETENTION_DAYS_TRACE`
  - `ARTIFACT_RETENTION_DAYS_VIDEO`
  - 以及 `dom_snapshot` / `network_capture`

control-plane 在消费 runner 结果时，把保留期投影到 `artifacts.retention_expires_at`。

### 4. control-plane 下载策略

新增 [artifact-blob-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/artifact-blob-store.ts)，统一处理：

- `file://` 本地文件读取
- `s3://` 对象存储读取
- S3 预签名 URL 生成
- 对象删除

[control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts) 新增：

- `GET /api/v1/internal/artifacts/{artifact_id}/download?mode=redirect|stream`

下载语义：

- `redirect`
  - 对 S3 artifact 返回 `302`
  - 由 `ARTIFACT_S3_PUBLIC_ENDPOINT` 生成外部可访问的签名 URL
- `stream`
  - control-plane 直接从对象存储回源并向客户端输出字节流
- `filesystem`
  - 统一走流式输出

这样可以同时覆盖“浏览器直连下载”和“内网/compose 环境内流式验收”两类场景。

### 5. 保留期清理命令

新增 [prune_expired_artifacts.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/prune_expired_artifacts.mjs)：

1. 查询 `retention_expires_at <= now()` 的 artifact
2. 调用 blob store 删除对象或本地文件
3. 删除对应数据库记录
4. 输出 `scannedCount / deletedCount / deletedArtifactIds / failures`

当前保留策略故意保持简单：

- 由命令触发，而不是常驻 daemon
- 删除成功后直接移除数据库记录，不保留 tombstone

### 6. compose 对象存储验证

[docker-compose.yml](/home/jianghua519/ai-web-testing-platform-v2/docker-compose.yml) 新增 `minio` 服务，并给 `control-plane`/`tools` 注入：

- `ARTIFACT_STORAGE_MODE=s3`
- `ARTIFACT_S3_ENDPOINT=http://minio:9000`
- `ARTIFACT_S3_PUBLIC_ENDPOINT=http://127.0.0.1:19000`
- `ARTIFACT_S3_BUCKET=aiwtp-artifacts`

[run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_scheduler_compose_smoke.mjs) 额外验证：

- 创建 MinIO bucket
- artifact API 返回 `s3://` URI 和 `retention_expires_at`
- `HeadObject` 能查到真实对象
- `download?mode=redirect` 返回签名 URL
- `download?mode=stream` 返回真实 `image/png` 字节
- 手工把一个 artifact 标记为过期后执行 prune，确认对象和数据库记录都被删除

### 7. Dockerfile 层缓存优化

[Dockerfile](/home/jianghua519/ai-web-testing-platform-v2/Dockerfile) 调整为：

1. 先复制根 `package.json`、`package-lock.json`、`tsconfig.base.json`
2. 再只复制各 workspace 的 `package.json`
3. 执行 `npm ci`
4. 执行 `npx playwright install --with-deps chromium`
5. 最后复制源码、脚本、契约、文档并 `npm run build`

收益是：

- 文档和源码改动不会让 `npm ci` 层失效
- Playwright 浏览器安装层也可复用

## 风险与边界

- 当前对象存储只验证 S3 兼容语义，不处理多 bucket / 多 region 路由。
- 保留期依赖外部命令定期执行，不是自动生命周期服务。
- `ARTIFACT_S3_PUBLIC_ENDPOINT` 需要按部署拓扑正确配置，否则签名 URL 可能只在内网可达。
- 清理后数据库记录会被删除，当前不保留独立审计痕迹。

## 验证计划

1. `docker compose build tools control-plane`
2. `docker compose down -v`
3. `docker compose up -d postgres minio --wait`
4. `docker compose run --rm tools npm run typecheck`
5. `docker compose run --rm tools bash ./scripts/validate_contracts.sh`
6. `docker compose run --rm tools npm run control-plane:migrate:postgres`
7. `docker compose up -d control-plane --wait`
8. `docker compose run --rm tools npm run smoke:control-plane:compose`
9. `docker compose run --rm tools npm run smoke:scheduler:compose`
10. 文档补齐后再次执行 `docker compose build tools control-plane`，确认依赖层缓存命中
