---
title: control-plane PostgreSQL持久化骨架任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 为 control-plane 增加 PostgreSQL 持久化模型、存储骨架和专用 smoke run，同时保留现有 file/inmemory 模式。
---

# control-plane PostgreSQL持久化骨架任务说明

## 目标

把当前 `control-plane` 从“只有文件和内存存储原型”推进到“具备 PostgreSQL 持久化骨架”，并满足以下要求：

- 有明确的 PostgreSQL 数据模型
- 有可实例化的 `PostgresControlPlaneStore`
- `createControlPlaneStoreFromEnv()` 支持 `postgres` 模式
- 有仓库内可执行的 PostgreSQL smoke run

## 范围

- `apps/control-plane` 存储层
- PostgreSQL schema 定义
- 控制面环境变量装配
- PostgreSQL smoke 验证脚本
- 本轮中文任务、设计、测试、举证文档

## 验收标准

- 仓库内存在 PostgreSQL schema 和 store 实现
- `CONTROL_PLANE_STORE_MODE=postgres` 能实例化 PostgreSQL store
- `npm run smoke:control-plane:postgres` 能跑通控制面 API 链路
- 验证结果中能看到 override、decision、结果回传、幂等、重启后恢复
- 文档校验和契约校验通过

## 约束

- 当前仓库没有 `docker-compose` / `Dockerfile`，无法做容器内 PostgreSQL 验证
- 当前环境没有外部 PostgreSQL 实例，本轮只能用宿主机上的 PostgreSQL 兼容引擎做 smoke
- 本轮是“持久化骨架”，不是最终生产级数据库实现
