---
title: 并发槽位、cancel/pause/resume 与 artifact 真采集闭环设计说明
status: active
owner: squad
last_updated: 2026-03-07
summary: 说明运行控制状态、agent 并发槽位、Playwright artifact 真采集和容器化调度 smoke 的实现方式。
---

# 并发槽位、cancel/pause/resume 与 artifact 真采集闭环设计说明

## 背景

上一轮已经具备：

- `control-plane -> agent -> worker -> PostgreSQL` 调度链路
- step 级控制协议雏形
- 容器内真实 Chromium 调度执行

但仍有三个关键缺口：

1. agent 虽然保存了 `max_parallel_slots`，但没有被真实 smoke 验证。
2. `pause`、`resume`、`cancel` 还没有收敛成 run / run_item 控制状态和 step 边界执行闭环。
3. runner 还没有真正采集 `screenshot`、`trace`、`video`，artifact 只有数据模型，没有运行时证据。

## 方案设计

### 1. 005 migration 与运行控制字段

新增 [005_control_plane_runtime_controls.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/005_control_plane_runtime_controls.sql)，扩展正式 schema：

- `agents.max_parallel_slots`
- `run_items.control_state`
- `run_items.control_reason`

目标是把“并发能力”和“运行控制”从内存约定变成正式存储字段。

### 2. control-plane 运行控制模型

[PostgresControlPlaneStore](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts) 新增了三类能力：

- `pauseRun(runId)`：把活跃 `run_items` 置为 `pause_requested`
- `resumeRun(runId)`：把 `pause_requested/paused` 恢复为 `active`
- `cancelRun(runId)`：
  - 未开始的 `run_items` 直接标记为 `canceled`
  - 已执行中的 `run_items` 标记为 `cancel_requested`
  - `run` 在仍有活跃项时进入 `canceling`，否则直接 `canceled`

同时增加 `resolveStepControlDecision()`：

- 先检查 `run_items.control_state`
- 再消费显式 step override 队列
- 返回 `execute / pause / cancel / replace / skip`

这让 step 控制从“单纯 step override”扩展成“run 级控制 + step 级 override”的统一决策入口。

### 3. agent 并发槽位

[PollingWebAgent](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/agent/polling-web-agent.ts) 现在在一次轮询里：

- 先注册/心跳，并上报 `maxParallelSlots`
- 连续领取最多 `maxParallelSlots` 个 lease
- 并发执行这些 lease
- 全部完成后再回到下一轮轮询

`acquireLease()` 在 control-plane 侧额外约束：

- agent 当前未释放 lease 数必须小于 `max_parallel_slots`
- `run_items.control_state` 必须为 `active`
- capability 必须匹配

当前实现刻意保持简单：

- 一个轮询批次中会尽量填满所有槽位
- 但不会在单个 lease 完成后立即补位
- 这足以证明多槽位调度成立，但不是最终并发调度器形态

### 4. worker 侧 pause / resume / cancel

worker 侧的关键点有三个：

- [HttpStepController](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/control/http-step-controller.ts) 负责在每个 step 执行前请求 control-plane 决策
- [ExecutionEngine](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/execution-engine.ts) 真正解释 `pause / cancel / replace / skip`
- [WebJobRunner](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/job-runner/web-job-runner.ts) 负责把 plan 级 `canceled` 映射成 worker 结果状态并最终回传

控制语义：

- `pause`：当前 step 还没执行，worker 在 step 边界等待并周期性重试控制请求
- `resume`：control-plane 把 `run_item.control_state` 改回 `active`，下一次控制请求返回 `execute`
- `cancel`：当前待执行 step 直接生成 `canceled` 结果，剩余未执行 step 生成 `skipped` 结果，plan 状态收口为 `canceled`

### 5. Playwright artifact 真采集

新增 [playwright-artifact-collector.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/playwright-artifact-collector.ts)，取代原先的空 collector。

采集策略：

- step 前：如果配置需要 trace，则开启 trace chunk
- step 后：按 `artifactPolicy` 采集 screenshot 和 step trace
- context 关闭后：保存 plan 级 video

产物布局：

- `steps/*.png`
- `traces/*.zip`
- `videos/*.webm`

每个 artifact 都会计算：

- `storage_uri`
- `content_type`
- `size_bytes`
- `sha256`
- `metadata_json`

[session-manager.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/session-manager.ts) 会为每个 attempt 生成独立目录，并在 browser context 上配置 `recordVideo`。

### 6. artifact 存储与查询

control-plane 在消费 runner 结果时会把 artifact 投影写入 `artifacts` 表。

新增查询接口：

- `GET /api/v1/internal/runs/{run_id}/artifacts`
- `GET /api/v1/internal/run-items/{run_item_id}/artifacts`

这让 artifact 从“worker 本地文件”变成“control-plane 可追踪读模型”。

### 7. compose 验证策略

两条 smoke 都被收敛成正式容器化验证：

- [run_control_plane_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_compose_smoke.mjs)
  - 改成每次运行使用独立 tenant/project/job/run 作用域
  - 避免固定 ID 污染分页断言
- [run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_scheduler_compose_smoke.mjs)
  - Firefox agent 先验证 capability 不匹配
  - Chromium agent 以 `maxParallelSlots=2` 并发领取两个 lease
  - 在真实浏览器场景里验证 `pause -> paused -> resume -> active`
  - 在第三个 run 上验证 `cancel`
  - 通过 artifact API 和磁盘文件同时证明 `screenshot/trace/video` 已真实产出

为避免控制指令错过下一 step 边界，plan 中加入了更长的 `wait-control-window`。

## 风险与边界

- artifact 仍落本地文件系统，没有对象存储、清理策略和下载鉴权。
- `pause` 目前是 step 边界级暂停，不支持中断正在运行的 Playwright action。
- 并发槽位当前是批处理模型，不是长期驻留 worker pool。
- `control_state` 当前仍然挂在 `run_items`，未来如果要支持更细粒度控制，可能要引入单独的 control command 表。

## 验证计划

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
