---
title: 外部 PostgreSQL 实例验证测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane 真实 PostgreSQL 进程 smoke 的执行证据、关键输出和追溯关系。
---

# 外部 PostgreSQL 实例验证测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：architecture
- 任务：外部 PostgreSQL 实例验证
- 环境：本机宿主环境，Node.js v22.22.0，npm 10.9.4，`embedded-postgres` 启动的真实 PostgreSQL 18.3 进程

## 证据内容

- Run ID：`control-plane-postgres-real-smoke-20260307`
- 命令：
- `npm install`
- `npm run typecheck`
- `npm run smoke:control-plane:postgres:real`
- `bash ./scripts/validate_docs.sh`
- `bash ./scripts/validate_contracts.sh`
- 产物位置：
- 运行脚本：[run_control_plane_postgres_real_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_postgres_real_smoke.mjs)
- PostgreSQL schema：[001_control_plane_postgres.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/001_control_plane_postgres.sql)
- 关键结果：
- `databaseSummary.server_version="18.3"`
- `databaseSummary.current_database="aiwtp_smoke"`
- `overrideAccepted=true`
- `duplicateBody={"accepted":true,"duplicate":true}`
- `domainSummary.runStatus="passed"`
- `domainSummary.runItemStatus="passed"`
- `restoredDomainSummary.stepDecisionConsumed=1`
- `pendingDecisionCount=0`
- 结论：当前 control-plane PostgreSQL 验证已经具备真实数据库进程 smoke，不再只依赖 `pg-mem`。

## 追溯关系

- 测试报告：[20260307-102523-postgresql-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-102523-postgresql-test-report.md)
- 相关任务：[20260307-102523-postgresql-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-102523-postgresql-project-task.md)
- 设计说明：[20260307-102523-postgresql-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-102523-postgresql-design-task.md)
