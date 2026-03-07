---
title: artifact 对象存储、下载与保留策略测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 规划对象存储上传、artifact 下载/保留策略和 Dockerfile 层缓存优化的容器化验证范围。
---

# artifact 对象存储、下载与保留策略测试计划

## 测试范围

- `006` migration 与 `retention_expires_at` 落库
- worker artifact 上传到 S3 兼容对象存储
- control-plane artifact 下载接口 `redirect / stream`
- 保留期清理命令删除对象与数据库记录
- `Dockerfile` 分层缓存命中情况
- compose 本地栈中的 `control-plane` smoke 和 `scheduler` smoke

## 覆盖风险

- `storage_uri` 看似改成 `s3://`，但对象实际上没有上传成功
- control-plane 只能列出 artifact，无法下载或删除对象
- 过期清理只删数据库不删对象，或者只删对象不删数据库
- MinIO 公网/内网地址配置混乱，导致签名 URL 无法使用
- `Dockerfile` 虽然改了顺序，但 `npm ci` / Playwright 安装层仍会被无关改动击穿

## 测试项

1. `docker compose build tools control-plane` 首次构建通过。
2. `docker compose down -v && docker compose up -d postgres minio --wait` 成功。
3. `docker compose run --rm tools npm run typecheck` 通过。
4. `docker compose run --rm tools bash ./scripts/validate_contracts.sh` 通过。
5. `docker compose run --rm tools npm run control-plane:migrate:postgres` 应用到 `006_artifact_object_storage_retention.sql`。
6. `docker compose run --rm tools npm run smoke:control-plane:compose` 通过，并验证：
   - `migrations.length=6`
   - artifact retention 字段能通过 API round-trip
7. `docker compose run --rm tools npm run smoke:scheduler:compose` 通过，并验证：
   - Firefox agent 继续 idle
   - Chromium agent 继续并发 2 个 lease
   - artifact `storage_uri` 为 `s3://...`
   - MinIO 中存在真实对象
   - `download?mode=redirect` 返回签名 URL
   - `download?mode=stream` 返回真实图片字节
   - prune 后对象与记录都消失
8. 文档更新后再次执行 `docker compose build tools control-plane`，确认 `npm ci` 和 Playwright 安装层命中缓存。
9. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh` 通过。

## 通过标准

- 所有容器化命令成功完成。
- 关键下载、清理和缓存命中结果有明确日志证据。
- 残余风险被记录，但不阻塞当前里程碑。
