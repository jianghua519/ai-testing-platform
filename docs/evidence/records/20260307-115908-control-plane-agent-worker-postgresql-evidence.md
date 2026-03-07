---
title: control-plane、agent、worker 与 PostgreSQL 调度系统测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录最小调度系统在宿主机与 compose 栈中的验证命令、关键输出、修复项和追溯关系。
---

# control-plane、agent、worker 与 PostgreSQL 调度系统测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：architecture
- 任务：control-plane、agent、worker 与 PostgreSQL 调度系统
- Run ID：scheduler-compose-20260307
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

1. `npm run typecheck`
2. `bash ./scripts/validate_contracts.sh`
3. `docker compose build`
4. `docker compose up -d postgres --wait`
5. `docker compose run --rm tools npm run typecheck`
6. `docker compose run --rm tools bash ./scripts/validate_docs.sh`
7. `docker compose run --rm tools bash ./scripts/validate_contracts.sh`
8. `docker compose run --rm tools npm run control-plane:migrate:postgres`
9. `docker compose up -d control-plane --wait`
10. `docker compose run --rm tools npm run smoke:scheduler:compose`
11. `bash ./scripts/validate_docs.sh`

## 关键结果

- migration：
  - `appliedCount=3`
  - `items=["001_control_plane_postgres.sql","002_control_plane_runtime_extensions.sql","003_control_plane_scheduler.sql"]`
- compose 调度 smoke：
  - `enqueueStatusCodes=[201,201]`
  - `queuedJobIds=["7c360415-8ff0-49ac-bd5d-079132a04fd1","aa295e63-ae4d-4579-b7a3-aeeff2dae2b9"]`
  - `cycleResults=[{"status":"executed"},{"status":"executed"},{"status":"idle"}]`
  - `stepEventCountsByRun=[2,2]`
  - `jobEventTypesByJob=[["step.result_reported","step.result_reported","job.result_reported"],["step.result_reported","step.result_reported","job.result_reported"]]`
  - `agentRows=[{"agent_id":"88888888-8888-8888-8888-888888888881","status":"online"}]`
  - `leaseRows` 两条记录均为 `completed`
  - `runRows` 两条记录均为 `passed`
  - `runItemRows` 两条记录均为 `passed`，且未残留租约绑定字段
- 容器镜像修复：
  - 初次失败：`python3: command not found`
  - 第二次失败：`missing file: docs/v2/c4.md`
  - 第三次失败：`ModuleNotFoundError: No module named 'yaml'`
  - 修复后容器校验链路全部通过

## 产物位置

- 调度 migration：
  - [003_control_plane_scheduler.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/003_control_plane_scheduler.sql)
- control-plane：
  - [control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts)
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/types.ts)
- worker agent：
  - [http-control-plane-client.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/agent/http-control-plane-client.ts)
  - [polling-web-agent.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/agent/polling-web-agent.ts)
  - [types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/agent/types.ts)
- smoke 与启动脚本：
  - [run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_scheduler_compose_smoke.mjs)
  - [start_polling_web_agent.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/start_polling_web_agent.mjs)
  - [Dockerfile](/home/jianghua519/ai-web-testing-platform-v2/Dockerfile)
  - [docker-compose.yml](/home/jianghua519/ai-web-testing-platform-v2/docker-compose.yml)
- 报告：
  - [20260307-115908-control-plane-agent-worker-postgresql-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-115908-control-plane-agent-worker-postgresql-test-report.md)

## 追溯关系

- 任务说明：[20260307-115908-control-plane-agent-worker-postgresql-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-115908-control-plane-agent-worker-postgresql-project-task.md)
- 设计说明：[20260307-115908-control-plane-agent-worker-postgresql-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-115908-control-plane-agent-worker-postgresql-design-task.md)
- 测试计划：[20260307-115908-control-plane-agent-worker-postgresql-test-plan.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-plans/20260307-115908-control-plane-agent-worker-postgresql-test-plan.md)
