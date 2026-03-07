---
title: 并发槽位、cancel/pause/resume 与 artifact 真采集闭环测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录并发槽位、运行控制和 artifact 真采集闭环的容器化验证结果。
---

# 并发槽位、cancel/pause/resume 与 artifact 真采集闭环测试报告

## 环境

- 日期：2026-03-07
- 执行者：squad
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- 环境：宿主机 Linux + Docker Compose 本地栈
- 浏览器：容器内 Headless Chromium 145.0.7632.6

## 执行检查

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

## 结果

### 静态校验与 migration

- `typecheck` 通过。
- 契约校验通过。
- 文档校验通过。
- migration 通过，关键输出：
  - `appliedCount=5`
  - `001_control_plane_postgres.sql`
  - `002_control_plane_runtime_extensions.sql`
  - `003_control_plane_scheduler.sql`
  - `004_control_plane_capability_requirements.sql`
  - `005_control_plane_runtime_controls.sql`

### control-plane compose smoke

- `smoke:control-plane:compose` 通过。
- 关键结果：
  - `migrations.length=5`
  - `runsPageSizes=[2,1]`
  - `runItemsPageSizes=[2,1]`
  - `runStepEventsPageSizes=[2,1]`
  - `runtimeTables=["agents","artifacts","job_leases"]`

### scheduler compose smoke

- `smoke:scheduler:compose` 通过。
- 关键运行结果：
  - `firefoxCycle.status="idle"`
  - `observedActiveLeases=2`
  - `pauseResponseStatus=202`
  - `pausedRunItemState="paused"`
  - `resumeResponseStatus=202`
  - `resumedRunItemState="active"`
  - `cancelResponseStatus=202`
  - `cycleResults` 为 `executed, executed, executed, idle`
  - 第三个 cycle 的 `workerStatus="canceled"`
  - `runRows` 最终为 `passed, passed, canceled`
  - `leaseRows` 最终为 `completed, completed, canceled`

### 真实浏览器与 artifact 证据

- 目标站点命中路径：
  - `/home` 3 次
  - `/profile-form` 3 次
  - `/submit` 2 次
- `firstUserAgent` 含 `HeadlessChrome/145.0.7632.6`，证明不是 fake browser。
- 提交数据：
  - `Smoke User One + avatar-smoke.txt`
  - `Smoke User Two + avatar-smoke.txt`
- 每个 `run_item` 的 artifact API 都返回了 `video`、`trace`、`screenshot`。
- 抽样文件真实存在，例如：
  - `videos/*.webm`
  - `traces/*.zip`
  - `steps/*.png`

### step 级控制结果

- run1、run2：8 个 step 全部通过。
- run3：
  - `open-home`
  - `click-open-profile-form`
  - `assert-profile-form-visible`
  - `wait-control-window`
    以上通过
  - `input-display-name` 为 `canceled`
  - `upload-avatar`、`click-submit`、`assert-submit-result` 为 `skipped`

这证明 `cancel` 在 step 边界真正生效，而不是只改最终 run 状态。

## 问题与修复

- `run_control_plane_compose_smoke.mjs` 初次失败：`expected 4 migrations, got 5`
  - 修复：断言更新为 5。
- `run_control_plane_compose_smoke.mjs` 初次还受固定 ID 污染，分页断言会读到历史数据。
  - 修复：改成每次运行使用独立 tenant/project/job/run 作用域。
- `run_scheduler_compose_smoke.mjs` 初次 pause/cancel 不生效。
  - 原因：`WebJobRunner` 没有接 `HttpStepController`，且控制窗口过短。
  - 修复：接入 controller factory，补 endpoint 模板，并把 `wait-control-window` 调整为 3000ms。
- `run_scheduler_compose_smoke.mjs` 初次在 bind mount 调试时读到了旧 `dist/`。
  - 修复：重新执行宿主机 `npm run typecheck` 生成最新产物，并最终以纯镜像 compose 验证为准。

## 结论

- 这轮已经把并发槽位、`pause / resume / cancel` 和 `screenshot / trace / video` 真采集做成了可验证闭环。
- 闭环不再停留在宿主机脚本，而是在本地 `docker compose` 栈中完整跑通。
- 当前系统已经可以用真实浏览器回答三个问题：
  - agent 是否真能并发领取 lease
  - control-plane 的运行控制是否真能影响 step 执行
  - artifact 是否真被采集、落库、可查询、文件可落地

## 关联证据

- [20260307-133052-cancel-pause-resume-artifact-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-133052-cancel-pause-resume-artifact-evidence.md)
