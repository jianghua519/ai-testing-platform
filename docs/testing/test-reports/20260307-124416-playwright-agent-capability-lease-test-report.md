---
title: 真实 Playwright 调度执行与 agent capability/lease 正式化测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 capability 匹配与真实 Playwright 调度 smoke 的容器化验证结果。
---

# 真实 Playwright 调度执行与 agent capability/lease 正式化测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- 宿主机：Linux
- 容器引擎：Docker Engine + Docker Compose

## 执行检查

1. `docker compose build`
2. `docker compose up -d postgres --wait`
3. `docker compose run --rm tools npm run typecheck`
4. `docker compose run --rm tools bash ./scripts/validate_contracts.sh`
5. `docker compose run --rm tools npm run control-plane:migrate:postgres`
6. `docker compose up -d control-plane --wait`
7. `docker compose run --rm tools npm run smoke:control-plane:compose`
8. `docker compose run --rm tools npm run smoke:scheduler:compose`
9. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 结果

### migration 与静态校验

- `docker compose build` 通过。
- `docker compose run --rm tools npm run typecheck` 通过。
- `docker compose run --rm tools bash ./scripts/validate_contracts.sh` 通过。
- `docker compose run --rm tools npm run control-plane:migrate:postgres` 通过，关键输出：
  - `appliedCount=4`
  - `001_control_plane_postgres.sql`
  - `002_control_plane_runtime_extensions.sql`
  - `003_control_plane_scheduler.sql`
  - `004_control_plane_capability_requirements.sql`

### 读模型回归 smoke

- `docker compose run --rm tools npm run smoke:control-plane:compose` 通过。
- 关键结果：
  - `migrations=["001_control_plane_postgres.sql","002_control_plane_runtime_extensions.sql","003_control_plane_scheduler.sql","004_control_plane_capability_requirements.sql"]`
  - `runsPageSizes=[2,1]`
  - `runItemsPageSizes=[2,1]`
  - `runStepEventsPageSizes=[2,1]`

### 真实 Playwright 调度 smoke

- `docker compose run --rm tools npm run smoke:scheduler:compose` 通过。
- 关键结果：
  - `firefoxCycle.status="idle"`
  - `cycleResults=[executed,executed,idle]`
  - `targetHits=["/home","/profile-form","/submit","/home","/profile-form","/submit"]`
  - `firstUserAgent` 含 `HeadlessChrome/145.0.7632.6`
  - `submissions=[{"displayName":"Smoke User One","fileName":"avatar-smoke.txt"},{"displayName":"Smoke User Two","fileName":"avatar-smoke.txt"}]`
  - `stepEventCountsByRun=[7,7]`
  - 每个 job 的事件流为 `7` 条 `step.result_reported` 加 `1` 条 `job.result_reported`
  - `runItemRows.required_capabilities_json=["web","browser:chromium"]`
  - `runItemRows` 的 `assigned_agent_id` 与 `lease_token` 最终都为 `null`

### 运行期观察

- Firefox agent 已注册为在线状态，但由于缺少 `browser:chromium`，没有领取任何 lease。
- Chromium agent 在 `tools` 容器里真实拉起了 HeadlessChrome，并完成点击、输入、上传、提交和断言。
- capability 匹配和真实浏览器执行在同一条调度链路中同时被证明。

## 问题与修复

- 第一次 scheduler smoke 失败，报错为 `expected 2 agents, got 3`。
- 原因不是调度逻辑错误，而是上一条 compose smoke 往同一数据库写入了一条 agent 记录，验证脚本误把“库里全部 agent”当成“本轮 agent”。
- 修复方式：把 [run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_scheduler_compose_smoke.mjs) 的断言范围收敛到本轮创建的 `run`、`run_item`、`job` 和 `agent`。
- 修复后 scheduler smoke 通过。

## 结论

- 本轮已经把 compose 调度 smoke 从 fake browser 升级成了真实 Playwright Chromium 执行。
- capability 匹配已经从“约定”收敛成 PostgreSQL 正式字段和 lease 获取约束。
- 当前调度系统已经能回答“这个 job 需要什么能力”“哪个 agent 能拿”“worker 是否真能在容器里执行”这三个核心问题。

## 关联证据

- [20260307-124416-playwright-agent-capability-lease-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-124416-playwright-agent-capability-lease-evidence.md)
