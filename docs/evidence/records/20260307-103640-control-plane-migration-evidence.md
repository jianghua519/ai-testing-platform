---
title: control-plane正式migration体系和查询接口骨架测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane migration runner 和查询接口骨架的真实执行证据、关键输出和追溯关系。
---

# control-plane正式migration体系和查询接口骨架测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：architecture
- 任务：control-plane正式migration体系和查询接口骨架
- 环境：本机宿主环境，Node.js v22.22.0，npm 10.9.4，`pg-mem` 与 `embedded-postgres` PostgreSQL 18.3

## 证据内容

- Run ID：`control-plane-migration-query-smoke-20260307`
- 命令：
- `npm run typecheck`
- `npm run smoke:control-plane:postgres`
- `npm run smoke:control-plane:postgres:real`
- `CONTROL_PLANE_DATABASE_URL=... node ./scripts/migrate_control_plane_postgres.mjs`
- `bash ./scripts/validate_docs.sh`
- `bash ./scripts/validate_contracts.sh`
- 产物位置：
- migration runner：[postgres-migrations.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-migrations.ts)
- migration CLI：[migrate_control_plane_postgres.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/migrate_control_plane_postgres.mjs)
- 真实 smoke：[run_control_plane_postgres_real_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_postgres_real_smoke.mjs)
- 关键结果：
- `appliedMigrationVersions=["001_control_plane_postgres.sql"]`
- `migrationsCount=1`
- CLI 输出 `appliedCount=1`
- `runApiStatus="succeeded"`
- `runItemApiStatus="passed"`
- `stepEventApiCount=1`
- `restoredMigrationsCount=1`
- `pendingDecisionCount=0`
- 结论：control-plane PostgreSQL 模式已经具备正式 migration runner 和最小查询接口骨架，并完成真实 PostgreSQL smoke 验证。

## 追溯关系

- 测试报告：[20260307-103640-control-plane-migration-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-103640-control-plane-migration-test-report.md)
- 相关任务：[20260307-103640-control-plane-migration-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-103640-control-plane-migration-project-task.md)
- 设计说明：[20260307-103640-control-plane-migration-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-103640-control-plane-migration-design-task.md)
