---
title: 并发槽位、cancel/pause/resume 与 artifact 真采集闭环测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录运行控制、并发槽位和 artifact 真采集闭环的容器化命令与关键输出。
---

# 并发槽位、cancel/pause/resume 与 artifact 真采集闭环测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：squad
- 任务：并发槽位、cancel/pause/resume 与 artifact 真采集闭环
- Run ID：scheduler-runtime-controls-20260307
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

1. `docker compose build tools control-plane`
2. `docker compose down -v`
3. `docker compose up -d postgres --wait`
4. `docker compose run --rm tools npm run typecheck`
5. `docker compose run --rm tools bash ./scripts/validate_contracts.sh`
6. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`
7. `docker compose run --rm tools npm run control-plane:migrate:postgres`
8. `docker compose up -d control-plane --wait`
9. `docker compose run --rm tools npm run smoke:control-plane:compose`
10. `docker compose run --rm tools npm run smoke:scheduler:compose`

## 关键输出

### migration

- `appliedCount=5`
- `items=["001_control_plane_postgres.sql","002_control_plane_runtime_extensions.sql","003_control_plane_scheduler.sql","004_control_plane_capability_requirements.sql","005_control_plane_runtime_controls.sql"]`

### control-plane compose smoke

- `runsPageSizes=[2,1]`
- `runItemsPageSizes=[2,1]`
- `runStepEventsPageSizes=[2,1]`
- `runtimeTableCounts={"agents_count":1,"job_leases_count":1,"artifacts_count":1}`

### scheduler compose smoke

- `firefoxCycle={"status":"idle"}`
- `observedActiveLeases=2`
- `pauseResponseStatus=202`
- `pausedRunItemState="paused"`
- `resumeResponseStatus=202`
- `resumedRunItemState="active"`
- `cancelResponseStatus=202`
- `cycleResults=[{"status":"executed","workerStatus":"executed"},{"status":"executed","workerStatus":"executed"},{"status":"executed","workerStatus":"canceled"},{"status":"idle"}]`
- `runsApiStatuses=[{"status":"canceled"},{"status":"succeeded"},{"status":"succeeded"}]`
- `leaseRows=[{"status":"completed"},{"status":"completed"},{"status":"canceled"}]`
- `targetHits=["/home","/home","/profile-form","/profile-form","/submit","/submit","/home","/profile-form"]`
- `firstUserAgent="Mozilla/5.0 ... HeadlessChrome/145.0.7632.6 ..."`
- `submissions=[{"displayName":"Smoke User Two","fileName":"avatar-smoke.txt"},{"displayName":"Smoke User One","fileName":"avatar-smoke.txt"}]`
- `stepEventStatusesByRun[2]=["assert-submit-result:skipped","click-submit:skipped","upload-avatar:skipped","input-display-name:canceled","wait-control-window:passed","assert-profile-form-visible:passed","click-open-profile-form:passed","open-home:passed"]`

### artifact 抽样

- `video`
  - `file:///tmp/aiwtp-scheduler-real-3EPt7g/artifacts/688ebcac-f372-4f4a-80fd-8e09ce2fb577/84795581-96b1-43ac-af22-dd67eedbfff3/attempt-0/videos/1887c7a9-9d57-4be9-b3b3-9a8927b9741e-84795581-96b1-43ac-af22-dd67eedbfff3.webm`
  - `sizeBytes=87451`
- `trace`
  - `file:///tmp/aiwtp-scheduler-real-3EPt7g/artifacts/688ebcac-f372-4f4a-80fd-8e09ce2fb577/84795581-96b1-43ac-af22-dd67eedbfff3/attempt-0/traces/assert-submit-result-passed.zip`
  - `sizeBytes=46809`
- `screenshot`
  - `file:///tmp/aiwtp-scheduler-real-3EPt7g/artifacts/688ebcac-f372-4f4a-80fd-8e09ce2fb577/84795581-96b1-43ac-af22-dd67eedbfff3/attempt-0/steps/assert-submit-result-passed.png`
  - `sizeBytes=23574`

## 产物位置

- schema 与 store：
  - [005_control_plane_runtime_controls.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/005_control_plane_runtime_controls.sql)
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts)
- worker / agent / artifact：
  - [polling-web-agent.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/agent/polling-web-agent.ts)
  - [http-step-controller.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/control/http-step-controller.ts)
  - [session-manager.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/session-manager.ts)
  - [playwright-artifact-collector.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/playwright-artifact-collector.ts)
- Playwright 执行层：
  - [execution-engine.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/execution-engine.ts)
  - [artifact-collector.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/artifacts/artifact-collector.ts)
- smoke：
  - [run_control_plane_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_compose_smoke.mjs)
  - [run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_scheduler_compose_smoke.mjs)
- 报告：
  - [20260307-133052-cancel-pause-resume-artifact-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-133052-cancel-pause-resume-artifact-test-report.md)

## 追溯关系

- 任务说明：[20260307-133052-cancel-pause-resume-artifact-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-133052-cancel-pause-resume-artifact-project-task.md)
- 设计说明：[20260307-133052-cancel-pause-resume-artifact-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-133052-cancel-pause-resume-artifact-design-task.md)
- 测试计划：[20260307-133052-cancel-pause-resume-artifact-test-plan.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-plans/20260307-133052-cancel-pause-resume-artifact-test-plan.md)
