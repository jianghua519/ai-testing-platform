---
title: control-plane PostgreSQL持久化骨架测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane PostgreSQL 存储骨架的执行证据、运行信息和追溯关系。
---

# control-plane PostgreSQL持久化骨架测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：architecture
- 任务：control-plane PostgreSQL持久化骨架
- 环境：本机宿主环境，Node.js v22.22.0，npm 10.9.4，`pg-mem` PostgreSQL 兼容引擎

## 证据内容

- Run ID：`control-plane-postgres-smoke-20260307`
- 命令：
- `npm install`
- `npm run typecheck`
- `npm run smoke:control-plane:postgres`
- `bash ./scripts/validate_docs.sh`
- `bash ./scripts/validate_contracts.sh`
- 产物位置：
- 运行脚本：[run_control_plane_postgres_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_postgres_smoke.mjs)
- SQL schema：[001_control_plane_postgres.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/001_control_plane_postgres.sql)
- 关键结果：
- `overrideAccepted=true`
- `decisionAction="replace"`
- `duplicatePostStatus=200`
- `duplicateBody.duplicate=true`
- `restoredEventCount=2`
- `pendingDecisionCount=0`
- 结论：control-plane PostgreSQL 存储骨架已接入真实服务代码路径，并完成了幂等、决策消费和重启恢复验证。

## 追溯关系

- 测试报告：[20260307-100206-control-plane-postgresql-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-100206-control-plane-postgresql-test-report.md)
- 相关任务：[20260307-100206-control-plane-postgresql-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-100206-control-plane-postgresql-project-task.md)
- 设计说明：[20260307-100206-control-plane-postgresql-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-100206-control-plane-postgresql-design-task.md)
