---
title: control-plane领域模型表扩展任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 在 PostgreSQL 模式下为 control-plane 增加 runs、run_items、step_events、step_decisions 领域表投影，并保持现有 API 不回退。
---

# control-plane领域模型表扩展任务说明

## 目标

把上一轮 PostgreSQL 存储从“运行表骨架”推进到“正式领域表投影”，使控制面在不改 HTTP API 的情况下，能够把现有事件和决策同步写入：

- `runs`
- `run_items`
- `step_events`
- `step_decisions`

## 范围

- PostgreSQL schema 扩展
- `PostgresControlPlaneStore` 写入逻辑扩展
- PostgreSQL smoke 脚本扩展
- 本轮中文任务、设计、测试、举证文档

## 验收标准

- PostgreSQL schema 中存在 `runs`、`run_items`、`step_events`、`step_decisions`
- `runner-results` 写入后会更新 `runs/run_items/step_events`
- `override/decide` 流程会写入 `step_decisions`
- `npm run smoke:control-plane:postgres` 能验证领域表投影结果
- 文档校验和契约校验通过

## 约束

- 当前仓库没有 `docker-compose` / `Dockerfile`，无法做容器内验证
- 当前环境没有外部 PostgreSQL 实例，本轮仍使用 PostgreSQL 兼容引擎做宿主机 smoke
- 本轮不修改 control-plane HTTP API 和 OpenAPI 契约，只演进内部存储层
