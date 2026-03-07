---
title: control-plane tenant schema隔离与最小身份token任务说明
status: active
owner: squad
last_updated: 2026-03-07
summary: 在 control-plane 落地 tenant schema 级业务表隔离，并把 token 收敛为仅承载稳定身份上下文的任务说明。
---

# control-plane tenant schema隔离与最小身份token任务说明

## 目标

基于现有 control-plane 原型完成以下交付：

- 把 `runs`、`run_items`、`step_events`、`step_decisions`、`artifacts`、`agents`、`job_leases`、`control_plane_runner_events` 从共享 public 表改为 tenant schema 表，形态为 `"tenant_id".table_name`。
- 保留少量全局注册与鉴权表在 `public`，用于 tenant schema 注册、实体 locator 和实时授权查询。
- 为公开 API 增加 Bearer token 认证，token 仅包含稳定身份：
  - `sub` / `subject_id`
  - `tenant_id`
  - 可选 `iat`、`exp`、`jti`
- 不把 `project` 和 `role` 放进 token；每次请求基于 `(tenant_id, subject_id)` 从数据库实时解析项目授权和角色。
- 补齐实现文档、测试计划、测试报告和举证记录。

## 范围

- `apps/control-plane/sql/007_control_plane_tenant_registry_auth.sql`
- `apps/control-plane/src/runtime/auth.ts`
- `apps/control-plane/src/runtime/postgres-schema.ts`
- `apps/control-plane/src/runtime/postgres-control-plane-store.ts`
- `apps/control-plane/src/runtime/control-plane-server.ts`
- `apps/control-plane/src/types.ts`
- `apps/control-plane/src/index.ts`
- `docker-compose.yml`
- `scripts/lib/control_plane_auth.mjs`
- `scripts/run_control_plane_postgres_smoke.mjs`
- `scripts/run_control_plane_postgres_real_smoke.mjs`
- `scripts/run_control_plane_compose_smoke.mjs`
- `scripts/run_scheduler_compose_smoke.mjs`
- 本轮对应设计、测试计划、测试报告、测试举证及 tenancy 规范文档

## 验收标准

- migration 新增 tenant registry / locator / membership 表，并在真实 PostgreSQL 中应用成功。
- 业务数据能落到 tenant schema 表，公开查询接口通过 token tenant 范围和项目授权检查。
- `/api/v1/me`、`/api/v1/runs`、`/api/v1/run-items`、`/api/v1/runs/{id}`、`/api/v1/run-items/{id}`、`/api/v1/runs/{id}:cancel` 在真实 compose 环境中可用。
- 调度、pause / resume / cancel、artifact 下载与清理在真实 compose 环境中不回退。
- 文档、测试计划、测试报告、证据记录和规范文档全部同步更新。
- 容器内校验通过：`smoke:control-plane:postgres`、`control-plane:migrate:postgres`、`smoke:control-plane:compose`、`smoke:scheduler:compose`、`validate_docs.sh`。

## 约束

- `project` 和 `role` 允许在作业期间变化，因此不进入 token。
- 不回退用户现有改动，不重写无关模块。
- 运行校验必须优先在 Docker Compose 容器内完成。
