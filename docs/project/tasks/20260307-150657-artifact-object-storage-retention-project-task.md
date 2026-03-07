---
title: artifact 对象存储、下载与保留策略任务说明
status: active
owner: squad
last_updated: 2026-03-07
summary: 在现有调度与 artifact 闭环基础上，把 artifact 接入 S3 兼容对象存储，补下载与保留策略，并优化 Dockerfile 层缓存。
---

# artifact 对象存储、下载与保留策略任务说明

## 目标

基于本地最新提交 `726ae1181522f330b56d2859d444d92723c1eea3` 继续推进，不重做已经完成的原型：

- 把 worker 产出的 `screenshot`、`trace`、`video` 从本地文件系统接到 S3 兼容对象存储。
- 在 control-plane 补 artifact 下载接口，支持签名跳转和流式回源两种下载策略。
- 补 artifact 保留期字段和过期清理命令，做到“对象删掉、数据库记录也删掉”。
- 优化 `Dockerfile` 分层，让 `npm ci` 和 Playwright 浏览器安装尽量不受源码、文档改动影响。
- 所有新增/变更文档统一使用中文，并补齐项目说明、设计说明、测试计划、测试报告、测试举证。

## 范围

- `apps/web-worker/src/session/*`
- `apps/control-plane/sql/006_artifact_object_storage_retention.sql`
- `apps/control-plane/src/runtime/*`
- `apps/control-plane/src/types.ts`
- `packages/web-dsl-schema/src/result/types.ts`
- `contracts/openapi.yaml`
- `contracts/asyncapi.yaml`
- `docker-compose.yml`
- `Dockerfile`
- `scripts/prune_expired_artifacts.mjs`
- `scripts/run_control_plane_compose_smoke.mjs`
- `scripts/run_scheduler_compose_smoke.mjs`
- `README.md`
- 本轮对应设计、测试计划、测试报告、测试举证文档

## 验收标准

- migration 能新增 artifact 保留期字段，并在 compose 环境中应用到 `006_artifact_object_storage_retention.sql`。
- scheduler compose smoke 中 artifact `storage_uri` 变为 `s3://...`，且能在 MinIO 中查询到真实对象。
- `GET /api/v1/internal/artifacts/{artifact_id}/download` 支持：
  - `mode=redirect` 返回签名 URL
  - `mode=stream` 返回实际字节流
- `npm run control-plane:artifacts:prune` 能删除过期对象和对应数据库记录。
- `docker compose build tools control-plane` 在文档变更后再次执行时，`npm ci` 与 Playwright 安装层命中缓存。
- `docker compose` 容器化验证通过：`typecheck`、契约校验、migration、`smoke:control-plane:compose`、`smoke:scheduler:compose`、文档校验。

## 约束

- 不回退不相关改动，不重写既有调度主链路。
- 对象存储以 S3 兼容接口为准，本地 compose 栈使用 MinIO 验证。
- 运行控制仍保持 step 边界语义，不扩展到 action 中断。
- 保留策略当前采用固定 TTL + 定时清理命令，不引入更复杂的生命周期编排。
