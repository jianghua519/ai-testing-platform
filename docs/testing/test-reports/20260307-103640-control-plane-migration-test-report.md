---
title: control-plane正式migration体系和查询接口骨架测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane migration runner、查询接口骨架和真实验证链路的执行结果。
---

# control-plane正式migration体系和查询接口骨架测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- Node.js：v22.22.0
- npm：10.9.4
- 快速 smoke 环境：`pg-mem`
- 真实 smoke 环境：`embedded-postgres` 启动的 PostgreSQL 18.3

## 执行检查

1. `npm run typecheck`
2. `npm run smoke:control-plane:postgres`
3. `npm run smoke:control-plane:postgres:real`
4. `CONTROL_PLANE_DATABASE_URL=... node ./scripts/migrate_control_plane_postgres.mjs`
5. `bash ./scripts/validate_docs.sh`
6. `bash ./scripts/validate_contracts.sh`
7. `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`

执行结果：

- `typecheck` 通过
- `pg-mem` 快速 smoke 通过
- 真实 PostgreSQL smoke 通过
- migration CLI 在临时真实 PostgreSQL 进程上执行通过
- 文档校验通过
- 契约校验通过
- 仓库内未发现 `docker-compose`、`compose*.yml`、`compose*.yaml`、`Dockerfile*`，因此容器内验证无法执行

## 结果

### 快速 smoke

`npm run smoke:control-plane:postgres` 输出关键结果：

- `overrideAccepted=true`
- `decisionAction="replace"`
- `duplicatePostStatus=200`
- `domainSummary.runStatus="passed"`
- `restoredDomainSummary.stepDecisionConsumed=1`

结论：migration runner 改造后，`pg-mem` 快速回归路径没有回退。

### 真实 PostgreSQL smoke

`npm run smoke:control-plane:postgres:real` 输出关键结果：

```json
{
  "databaseSummary": {
    "current_database": "aiwtp_smoke",
    "server_version": "18.3"
  },
  "appliedMigrationVersions": [
    "001_control_plane_postgres.sql"
  ],
  "migrationsCount": 1,
  "runApiStatus": "succeeded",
  "runItemApiStatus": "passed",
  "stepEventApiCount": 1,
  "restoredMigrationsCount": 1,
  "restoredRunApiStatus": "succeeded",
  "restoredRunItemApiStatus": "passed",
  "restoredStepEventApiCount": 1,
  "pendingDecisionCount": 0
}
```

通过项：

- 真实 PostgreSQL 进程已启动并完成 migration
- `migrate_control_plane_postgres.mjs` 可直接输出已应用 migration 列表
- `control_plane_schema_migrations` 已可通过接口读取
- `GET /api/v1/runs/{run_id}` 返回 `succeeded`
- `GET /api/v1/run-items/{run_item_id}` 返回 `passed`
- `GET /api/v1/internal/run-items/{run_item_id}/step-events` 返回 1 条 step event
- PostgreSQL 与 control-plane 重启后，migration 状态和读接口结果仍然成立

限制：

- 真实 smoke 仍是宿主机验证，不是容器环境
- `control-plane:migrate:postgres` 命令本轮已提供，但未单独在独立外部 PostgreSQL 服务上执行
- 查询接口目前只覆盖单对象读取和 step events 列表

## 关联证据

- [20260307-103640-control-plane-migration-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-103640-control-plane-migration-evidence.md)
