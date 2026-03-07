---
title: 真实 Playwright 调度执行与 agent capability/lease 正式化测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 capability 匹配、真实 Chromium 调度 smoke 和容器化验证命令及关键输出。
---

# 真实 Playwright 调度执行与 agent capability/lease 正式化测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：architecture
- 任务：真实 Playwright 调度执行与 agent capability/lease 正式化
- Run ID：scheduler-real-browser-20260307
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

1. `docker compose build`
2. `docker compose up -d postgres --wait`
3. `docker compose run --rm tools npm run typecheck`
4. `docker compose run --rm tools bash ./scripts/validate_contracts.sh`
5. `docker compose run --rm tools npm run control-plane:migrate:postgres`
6. `docker compose up -d control-plane --wait`
7. `docker compose run --rm tools npm run smoke:control-plane:compose`
8. `docker compose run --rm tools npm run smoke:scheduler:compose`
9. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 关键结果

- migration：
  - `appliedCount=4`
  - `items=["001_control_plane_postgres.sql","002_control_plane_runtime_extensions.sql","003_control_plane_scheduler.sql","004_control_plane_capability_requirements.sql"]`
- 调度 smoke：
  - `firefoxCycle={"status":"idle"}`
  - `cycleResults=[{"status":"executed"},{"status":"executed"},{"status":"idle"}]`
  - `targetHits=["/home","/profile-form","/submit","/home","/profile-form","/submit"]`
  - `firstUserAgent="Mozilla/5.0 ... HeadlessChrome/145.0.7632.6 ..."`
  - `submissions=[{"displayName":"Smoke User One","fileName":"avatar-smoke.txt"},{"displayName":"Smoke User Two","fileName":"avatar-smoke.txt"}]`
  - `stepEventCountsByRun=[7,7]`
  - `runItemRows.required_capabilities_json=["web","browser:chromium"]`
- 首次失败与修复：
  - 初次失败：`expected 2 agents, got 3`
  - 修复：把验证脚本的数据库断言限定到本轮 job/run/agent 实体

## 产物位置

- migration：
  - [004_control_plane_capability_requirements.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/004_control_plane_capability_requirements.sql)
- control-plane：
  - [job-capabilities.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/job-capabilities.ts)
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts)
- worker / agent：
  - [browser-launcher.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/browser-launcher.ts)
  - [start_polling_web_agent.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/start_polling_web_agent.mjs)
- 容器与 smoke：
  - [Dockerfile](/home/jianghua519/ai-web-testing-platform-v2/Dockerfile)
  - [docker-compose.yml](/home/jianghua519/ai-web-testing-platform-v2/docker-compose.yml)
  - [run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_scheduler_compose_smoke.mjs)
- 报告：
  - [20260307-124416-playwright-agent-capability-lease-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-124416-playwright-agent-capability-lease-test-report.md)

## 追溯关系

- 任务说明：[20260307-124416-playwright-agent-capability-lease-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-124416-playwright-agent-capability-lease-project-task.md)
- 设计说明：[20260307-124416-playwright-agent-capability-lease-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-124416-playwright-agent-capability-lease-design-task.md)
- 测试计划：[20260307-124416-playwright-agent-capability-lease-test-plan.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-plans/20260307-124416-playwright-agent-capability-lease-test-plan.md)
