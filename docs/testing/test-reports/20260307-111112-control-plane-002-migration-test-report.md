---
title: control-plane 002 migration、分页查询接口和容器化本地栈测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 002 migration、分页读模型和容器化本地栈的真实执行结果。
---

# control-plane 002 migration、分页查询接口和容器化本地栈测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- 宿主机：Linux
- 容器引擎：Docker Engine + Docker Compose v5.1.0

## 执行检查

1. `npm run typecheck`
2. `bash ./scripts/validate_contracts.sh`
3. `npm run smoke:control-plane:postgres`
4. `npm run smoke:control-plane:postgres:real`
5. `docker compose config -q`
6. `docker compose build`
7. `docker compose up -d postgres --wait`
8. `docker compose run --rm tools npm run control-plane:migrate:postgres`
9. `docker compose up -d control-plane --wait`
10. `docker compose run --rm tools npm run smoke:control-plane:compose`
11. `bash ./scripts/validate_docs.sh`

## 结果

### 宿主机验证

- `typecheck` 通过。
- 契约校验通过。
- `pg-mem` smoke 通过，结果包含：
  - `overrideAccepted=true`
  - `duplicatePostStatus=200`
  - `restoredEventCount=2`
- 真实 PostgreSQL smoke 通过，结果包含：
  - `server_version="18.3"`
  - `appliedMigrationVersions=["001_control_plane_postgres.sql","002_control_plane_runtime_extensions.sql"]`
  - `migrationsCount=2`
  - `restoredMigrationsCount=2`

### 容器化验证

- `docker compose build` 通过。
- `docker compose run --rm tools npm run control-plane:migrate:postgres` 通过，输出：
  - `appliedCount=2`
- `docker compose run --rm tools npm run smoke:control-plane:compose` 通过，关键结果：
  - `databaseSummary.current_database="aiwtp"`
  - `databaseSummary.server_version="18.3"`
  - `migrations=["001_control_plane_postgres.sql","002_control_plane_runtime_extensions.sql"]`
  - `runsPageSizes=[2,1]`
  - `runItemsPageSizes=[2,1]`
  - `runStepEventsPageSizes=[2,1]`
  - `runtimeTableCounts.agents_count=1`
  - `runtimeTableCounts.job_leases_count=1`
  - `runtimeTableCounts.artifacts_count=1`
  - `runtimeTables=["agents","artifacts","job_leases"]`

### 问题与修复

- 容器化第一次执行失败，原因是 `tools` 服务把 `sleep infinity` 配成了 `entrypoint`，导致 `docker compose run --rm tools ...` 被解析成 `sleep` 参数。
- 修复方式：将 `entrypoint` 改为 `command`，之后 migration 和 compose smoke 均通过。

## 结论

- `002` migration 已收敛为正式 migration 并被宿主机、容器化两条链路真实验证。
- 分页读模型已可用，`runs`、`run_items` 和按 `run_id` 聚合的 `step events` 都有真实分页验证。
- 容器化本地栈已可用于后续 control-plane 和 migration 回归。

## 关联证据

- [20260307-111112-control-plane-002-migration-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-111112-control-plane-002-migration-evidence.md)
