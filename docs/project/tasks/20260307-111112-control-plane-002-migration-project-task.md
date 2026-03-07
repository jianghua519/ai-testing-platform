---
title: control-plane 002 migration、分页查询接口和容器化本地栈任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 将 control-plane PostgreSQL schema 扩展到 agents、job_leases、artifacts，并把查询接口推进到分页读模型，同时补齐容器化本地栈验证。
---

# control-plane 002 migration、分页查询接口和容器化本地栈任务说明

## 目标

把 control-plane 从“已有 migration 和单对象查询”推进到下一阶段可用底座：

- 新增 `002_control_plane_runtime_extensions.sql`，把 `agents`、`job_leases`、`artifacts` 纳入正式表。
- 把查询接口从骨架推进到可用读模型，补齐列表分页和按 `run_id` 聚合的 step events 查询。
- 提供一套可重复执行的容器化本地栈，用于在真实 PostgreSQL 容器和 control-plane 容器中运行 migration 与 smoke 验证。

## 范围

- `apps/control-plane/sql/002_control_plane_runtime_extensions.sql`
- `apps/control-plane/src/runtime/*` 中的分页、投影、PostgreSQL 查询实现
- `contracts/openapi.yaml`
- `Dockerfile`、`docker-compose.yml` 以及容器启动和 smoke 脚本
- 本轮任务对应的设计、测试计划、测试报告和举证文档

## 验收标准

- PostgreSQL migration runner 能识别并应用 `001`、`002` 两个 migration。
- `GET /api/v1/runs`、`GET /api/v1/run-items`、`GET /api/v1/internal/runs/{run_id}/step-events`、`GET /api/v1/internal/run-items/{run_item_id}/step-events` 支持 `limit` 和 `cursor`。
- 容器化本地栈中可完成：PostgreSQL 启动、migration 执行、control-plane 启动、读模型 smoke 验证。
- 中文文档、测试计划、测试报告和举证记录齐全并通过校验。

## 约束

- 保持与现有 V2 规范、OpenAPI/AsyncAPI 契约一致。
- 不在本轮引入 `agents`、`job_leases`、`artifacts` 的完整写接口，只先收敛表结构和容器内验证。
- 容器化验证以本地 `docker compose` 为边界，不扩展到远程部署或 CI 平台。
