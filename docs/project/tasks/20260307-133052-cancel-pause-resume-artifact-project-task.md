---
title: 并发槽位、cancel/pause/resume 与 artifact 真采集闭环任务说明
status: active
owner: squad
last_updated: 2026-03-07
summary: 把 agent 并发槽位、运行控制和 runner 的 screenshot/trace/video 真采集收敛成可验证的容器化闭环。
---

# 并发槽位、cancel/pause/resume 与 artifact 真采集闭环任务说明

## 目标

把当前调度系统从“能跑最小链路”推进到“可验证运行控制闭环”：

- agent 支持并发槽位，并能在同一轮轮询中同时领取多个 lease。
- control-plane 能对 run 发出 `pause`、`resume`、`cancel` 控制指令。
- worker 能在 step 边界真正执行这些控制指令，而不是只停留在 API 设计层。
- runner 真正采集 `screenshot`、`trace`、`video`，并把 artifact 落库和暴露为查询接口。
- compose 本地栈能用真实 Playwright Chromium 证明上述能力都成立。

## 范围

- `apps/control-plane/sql/005_control_plane_runtime_controls.sql`
- `apps/control-plane/src/runtime/*`
- `apps/control-plane/src/types.ts`
- `apps/web-worker/src/agent/*`
- `apps/web-worker/src/control/*`
- `apps/web-worker/src/job-runner/*`
- `apps/web-worker/src/session/*`
- `packages/playwright-adapter/src/*`
- `packages/web-dsl-schema/src/result/types.ts`
- `contracts/openapi.yaml`
- `contracts/asyncapi.yaml`
- `scripts/run_control_plane_compose_smoke.mjs`
- `scripts/run_scheduler_compose_smoke.mjs`
- `scripts/start_polling_web_agent.mjs`
- `README.md`
- 本轮任务对应的设计、测试计划、测试报告和举证文档

## 验收标准

- migration runner 能应用到 `005_control_plane_runtime_controls.sql`。
- Chromium agent 可配置 `max_parallel_slots=2`，并在 compose smoke 中观测到 2 个同时活跃 lease。
- `POST /api/v1/internal/runs/{run_id}:pause`、`POST /api/v1/internal/runs/{run_id}:resume`、`POST /api/v1/runs/{run_id}:cancel` 能驱动真实 step 级控制结果。
- compose smoke 中 run1 能进入 `paused` 后恢复，run3 能在 step 边界被取消。
- runner 能真实产出 `screenshot`、`trace`、`video`，artifact 记录可通过 API 查到，且文件真实存在。
- 容器内 `typecheck`、契约校验、文档校验、control-plane smoke、scheduler smoke 全部通过。

## 约束

- artifact 当前落本地文件系统，并通过 `file://` URI 记录；本轮不接对象存储。
- 并发槽位当前按“单次轮询批量领取 lease”实现，不做更复杂的工作窃取或长期 worker pool。
- 浏览器矩阵本轮仍以 Chromium 为主，Firefox agent 只用于 capability 不匹配验证。
