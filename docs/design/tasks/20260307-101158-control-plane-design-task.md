---
title: control-plane领域模型表扩展设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明如何在不改控制面 HTTP API 的前提下，把 PostgreSQL 存储推进到 runs、run_items、step_events、step_decisions 领域表投影。
---

# control-plane领域模型表扩展设计说明

## 背景

上一轮已经有 PostgreSQL store，但它本质上仍然是“控制面运行表”：

- `control_plane_runner_events`
- `step_decisions` 队列能力还不完整

这还不足以支撑后续系统能力，因为你下一阶段一定会需要：

- run 级状态追踪
- run item 级重试与 attempt 追踪
- step 级历史结果查询
- step 决策的领域审计

所以本轮目标不是改接口，而是把现有事件驱动数据同步投影成更稳定的领域表。

## 一、领域表模型

本轮新增或明确的 PostgreSQL 领域表如下：

### 1. `runs`

用途：

- 表示一次 run 的聚合状态
- 保存租户、项目、状态、开始/结束时间、最后事件 ID

### 2. `run_items`

用途：

- 表示 run 下的执行项
- 与 `job_id` 一一对应
- 保存 `attempt_no`、状态、开始/结束时间、最后事件 ID

### 3. `step_events`

用途：

- 落 step 级执行结果
- 保存 `compiled_step_id`、`source_step_id`、状态、时长、错误、artifacts、提取变量

### 4. `step_decisions`

用途：

- 既做 step override 队列
- 也做领域审计记录
- 保存 `replace/pause/skip` 等控制指令和消费状态

对应实现文件：

- [postgres-schema.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-schema.ts)
- [001_control_plane_postgres.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/001_control_plane_postgres.sql)

## 二、投影写入策略

### 2.1 原始事件表仍保留

`control_plane_runner_events` 继续保留，原因是：

- 它是控制面的原始事实表
- 调试和事件重放更直接
- 现有 `listJobEvents()` 逻辑不需要回退

### 2.2 `recordRunnerEvent()` 现在会同时做三类事

在 [postgres-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts) 中：

1. 先写原始事件表并做幂等判重
2. 再 upsert `runs`
3. 再 upsert `run_items`
4. 如果是 `step.result_reported`，额外插入 `step_events`
5. 同步回填已有 `step_decisions` 上缺失的 `run_id/run_item_id`

这样可以保证现有 API 不变，但数据库里已经有更适合后续业务的结构化数据。

## 三、状态推进规则

### 3.1 `step.result_reported`

写入规则：

- `runs.status = running`
- `run_items.status = running`
- `step_events` 插入一条完整 step 记录

### 3.2 `job.result_reported`

写入规则：

- `runs.status = passed|failed|canceled`
- `run_items.status = passed|failed|canceled`
- `started_at/finished_at` 用 job payload 的时间收口

### 3.3 状态不回退

如果 `runs/run_items` 已经进入最终态：

- `passed`
- `failed`
- `canceled`

后续 `running` 投影不会把它们回退回中间态。

## 四、step 决策关联补齐

`step_decisions` 可能先于 `run_item` 建立，因为 override API 只带：

- `job_id`
- `source_step_id`

所以本轮做了一个补齐动作：

- enqueue 时，若已能按 `job_id` 找到 `run_item`，就直接写入 `run_id/run_item_id`
- 若当时找不到，则在后续 `recordRunnerEvent()` 中反向补齐

这样可以避免 `step_decisions` 永久挂在“只有 job_id，没有 run_item_id”的半残状态。

## 五、验证策略

本轮 smoke 不只验证原始事件表，而是明确验证领域表投影结果。脚本：

- [run_control_plane_postgres_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_postgres_smoke.mjs)

验证内容：

- `override -> decide -> runner-results -> events` API 链路
- `runs.status`
- `run_items.status`
- `step_events` 数量和 `source_step_id`
- `step_decisions` 的总数、消费数、`run_id/run_item_id` 回填
- 服务重启后领域表数据仍可读取

## 风险

- 本轮验证仍基于 `pg-mem`，不是外部 PostgreSQL 实例
- 当前 `runs/run_items` 还是事件驱动投影，不是完整领域仓储
- 还没有 `agents`、`leases`、`artifacts`、`reports` 等后续表

## 验证计划

- 运行 `npm run typecheck`
- 运行 `npm run smoke:control-plane:postgres`
- 检查 `domainSummary` 和 `restoredDomainSummary`
- 运行 `bash ./scripts/validate_docs.sh`
- 运行 `bash ./scripts/validate_contracts.sh`
- 检查容器入口缺失情况
