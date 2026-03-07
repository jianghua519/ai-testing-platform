---
title: control-plane正式migration体系和查询接口骨架设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明 control-plane PostgreSQL migration runner、查询接口骨架和真实验证链路的设计取舍。
---

# control-plane正式migration体系和查询接口骨架设计说明

## 背景

到上一轮为止，control-plane PostgreSQL 模式已经能把数据写入 `runs`、`run_items`、`step_events`、`step_decisions`，但 schema 初始化仍然依赖 `PostgresControlPlaneStore.open()` 里直接执行一坨 SQL。这不满足后续演进要求，主要问题有三类：

- 没有 migration 版本表，无法判断哪些版本已经执行
- schema 变更没有正式落点，后续新增表或索引容易失控
- 控制面虽然已落库，但没有最小查询接口，无法把写入结果稳定地暴露出来

## 一、migration runner

### 1.1 迁移入口

新增文件：

- [postgres-migrations.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-migrations.ts)
- [migrate_control_plane_postgres.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/migrate_control_plane_postgres.mjs)

设计要点：

- 从 `apps/control-plane/sql/` 按文件名顺序加载 `*.sql`
- 用 `control_plane_schema_migrations` 记录已执行 migration
- 记录 `version`、`checksum`、`applied_at`
- 对已执行 migration 做 checksum 校验，防止文件被静默改写

### 1.2 Store 启动行为

[postgres-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts) 现在不再执行 `ensureSchema()`，而是：

- 优先读取 `runMigrations`
- 向后兼容旧的 `autoMigrate`
- 最终调用 `runControlPlanePostgresMigrations()`

这意味着 PostgreSQL 启动路径已经从“schema 常量建表”收敛成“migration runner 执行 SQL 文件”。

### 1.3 `pg-mem` 兼容 fallback

真实 PostgreSQL 使用的 migration 元表 DDL包含 `primary key` / `not null` 约束；但 `pg-mem` 对这条建表语句存在解析限制。为了保住快速回归命令：

- 真实 PostgreSQL 先走正式 DDL
- 只有遇到 `pg-mem` 特定限制时，才降级到简化元表 DDL

这个 fallback 只服务于 `pg-mem` 快速 smoke。正式迁移语义仍以真实 PostgreSQL 为准。

## 二、查询接口骨架

本轮只补最小可用读接口，不做分页、过滤和权限系统，避免把范围拉散。新增接口：

- `GET /api/v1/runs/{run_id}`
- `GET /api/v1/run-items/{run_item_id}`
- `GET /api/v1/internal/run-items/{run_item_id}/step-events`
- `GET /api/v1/internal/migrations`

对应实现位于：[control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts)

### 2.1 状态映射

数据库里的 `runs.status` 当前使用：

- `running`
- `passed`
- `failed`
- `canceled`

而现有 OpenAPI `Run` schema 使用 `succeeded`。因此服务层做了最小映射：

- `passed -> succeeded`
- 其余状态保持语义对应

这样可以先让最小查询接口不违背现有契约，同时不给底层投影表强行重命名。

### 2.2 Store 查询边界

`ControlPlaneStore` 新增了：

- `listAppliedMigrations()`
- `getRun()`
- `getRunItem()`
- `listStepEvents()`

PostgreSQL 模式直接查投影表；`inmemory` / `file` 模式通过事件重建最小投影，保证 server 层不需要特判存储模式。

## 三、验证策略

### 3.1 快速回归路径

- `npm run smoke:control-plane:postgres`

这条命令继续走 `pg-mem`，目标是低成本回归，不要求完全模拟真实 PostgreSQL。

### 3.2 真实运行路径

- `npm run smoke:control-plane:postgres:real`

这条命令会：

1. 启动真实 PostgreSQL 18.3 进程
2. 执行 migration runner
3. 启动仓库内真实 control-plane 服务
4. 发送 override / decide / runner-results
5. 读取 `runs` / `run_items` / `step_events` / `migrations`
6. 重启 PostgreSQL 和 control-plane
7. 再次验证恢复结果

对应脚本：[run_control_plane_postgres_real_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_postgres_real_smoke.mjs)

## 风险

- migration SQL 仍从仓库内文件加载，还不是独立发布制品
- `pg-mem` fallback 是兼容手段，不代表真实 PostgreSQL 的完整语义
- 查询接口目前是骨架级，只支持单对象和 step event 列表，不支持列表分页和过滤
- 当前仍然没有容器内验证

## 验证计划

- `npm run typecheck`
- `npm run smoke:control-plane:postgres`
- `npm run smoke:control-plane:postgres:real`
- `bash ./scripts/validate_docs.sh`
- `bash ./scripts/validate_contracts.sh`
- `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`
