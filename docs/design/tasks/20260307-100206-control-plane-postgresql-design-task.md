---
title: control-plane PostgreSQL持久化骨架设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明 control-plane PostgreSQL 存储模型、环境装配和 smoke 验证方案。
---

# control-plane PostgreSQL持久化骨架设计说明

## 背景

到上一轮为止，`control-plane` 只有两种存储模式：

- `InMemoryControlPlaneState`
- `FileBackedControlPlaneStore`

这对原型阶段够用，但无法支撑后续目标：

- 多次运行后的事件追溯
- 结果幂等索引
- step override 审计
- 向真实数据库过渡

所以本轮目标不是把控制面一次做成生产系统，而是先把 PostgreSQL 持久化模型和代码边界落下来。

## 一、存储模式扩展

[create-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/create-control-plane-store.ts) 现在支持三种模式：

- `inmemory`
- `file`
- `postgres`

当 `CONTROL_PLANE_STORE_MODE=postgres` 时，会读取：

- `CONTROL_PLANE_DATABASE_URL`
- `CONTROL_PLANE_AUTO_MIGRATE`

这让控制面可以继续保留现有开发模式，同时给后续数据库部署留出接口。

## 二、PostgreSQL 数据模型

本轮数据模型只覆盖当前控制面已经真实使用到的两类对象：

1. runner 结果事件
2. step 决策队列

对应的 SQL schema 位于：

- [postgres-schema.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-schema.ts)
- [001_control_plane_postgres.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/001_control_plane_postgres.sql)

### 2.1 `control_plane_runner_events`

用途：

- 保存 `job.result_reported`
- 保存 `step.result_reported`
- 以 `event_id` 作为幂等主键

关键字段：

- `event_id`
- `event_type`
- `tenant_id`
- `project_id`
- `trace_id`
- `job_id`
- `run_id`
- `run_item_id`
- `attempt_no`
- `source_step_id`
- `status`
- `envelope_json`
- `received_at`

### 2.2 `control_plane_step_decisions`

用途：

- 保存待消费的 step 决策
- 保留 override 的审计轨迹
- 支持 `replace` / `pause` / `skip` 这类指令的队列化

关键字段：

- `decision_id`
- `job_id`
- `source_step_id`
- `action`
- `reason`
- `replacement_step_json`
- `resume_after_ms`
- `enqueued_at`
- `consumed_at`

## 三、PostgreSQL Store 设计

[postgres-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts) 提供 `PostgresControlPlaneStore`，对外仍然实现既有 `ControlPlaneStore` 接口。

本轮关键决策：

- 保持与现有 server 层接口兼容，不改 HTTP 路由
- `recordRunnerEvent()` 直接依赖主键冲突异常做幂等判重
- `dequeueStepDecision()` 用事务读写，消费后写 `consumed_at`
- `snapshot()` 保留，方便与 file/inmemory 模式一致地做调试和验证

## 四、验证策略

本轮没有外部 PostgreSQL 实例，也没有容器入口，因此不能做真正的 PostgreSQL 进程级验证。

所以验证策略分两层：

1. 代码层使用真实 `pg` 协议接口和 SQL 查询
2. 运行层使用 `pg-mem` 提供 PostgreSQL 兼容引擎

对应脚本是：[run_control_plane_postgres_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_postgres_smoke.mjs)

这条 smoke 会真实启动：

- 仓库内 `control-plane` HTTP 服务
- PostgreSQL store
- override / decide / runner-results / events 这整条 API 链路

并验证：

- step override 入队
- step decision 出队
- runner-results 写入
- 重复事件幂等
- 服务重启后事件恢复

## 五、边界和不足

这轮是“PostgreSQL 持久化骨架”，不是生产完工态，主要还缺：

- 真正的 PostgreSQL 实例验证
- migration 管理工具
- 更完整的领域表：`runs`、`run_items`、`agents`、`leases`
- 更强的一致性和事务语义
- 高吞吐下的索引和分页设计

## 验证计划

- 运行 `npm install`
- 运行 `npm run typecheck`
- 运行 `npm run smoke:control-plane:postgres`
- 运行 `bash ./scripts/validate_docs.sh`
- 运行 `bash ./scripts/validate_contracts.sh`
- 检查容器入口缺失情况
