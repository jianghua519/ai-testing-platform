---
title: control-plane 002 migration、分页查询接口和容器化本地栈测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 002 migration、分页读模型和容器化本地栈验证的运行证据与关键输出。
---

# control-plane 002 migration、分页查询接口和容器化本地栈测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：architecture
- 任务：control-plane 002 migration、分页查询接口和容器化本地栈
- Run ID：control-plane-002-compose-20260307
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

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

## 关键结果

- 宿主机真实 PostgreSQL smoke：
  - `server_version="18.3"`
  - `migrationsCount=2`
  - `stepEventApiStepIds=["open-home"]`
- 容器化 compose smoke：
  - `runsPageIds.page1=["44444444-4444-4444-4444-444444444443","44444444-4444-4444-4444-444444444442"]`
  - `runsPageIds.page2=["44444444-4444-4444-4444-444444444441"]`
  - `runItemIds.page1=["55555555-5555-5555-5555-555555555443","55555555-5555-5555-5555-555555555442"]`
  - `runItemIds.page2=["55555555-5555-5555-5555-555555555441"]`
  - `runStepEventsPageSizes=[2,1]`
  - `duplicateBody={"accepted":true,"duplicate":true}`
  - `runtimeTableCounts={"agents_count":1,"job_leases_count":1,"artifacts_count":1}`
- 容器化失败修复：
  - 初次失败报错：`sleep: invalid time interval 'npm'`
  - 修复后同一链路通过

## 产物位置

- 代码：
  - [002_control_plane_runtime_extensions.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/002_control_plane_runtime_extensions.sql)
  - [pagination.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/pagination.ts)
  - [control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts)
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [docker-compose.yml](/home/jianghua519/ai-web-testing-platform-v2/docker-compose.yml)
  - [run_control_plane_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_compose_smoke.mjs)
- 报告：
  - [20260307-111112-control-plane-002-migration-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-111112-control-plane-002-migration-test-report.md)

## 追溯关系

- 任务说明：[20260307-111112-control-plane-002-migration-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-111112-control-plane-002-migration-project-task.md)
- 设计说明：[20260307-111112-control-plane-002-migration-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-111112-control-plane-002-migration-design-task.md)
- 测试计划：[20260307-111112-control-plane-002-migration-test-plan.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-plans/20260307-111112-control-plane-002-migration-test-plan.md)
