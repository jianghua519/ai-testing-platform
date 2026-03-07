---
title: control-plane正式migration体系和查询接口骨架任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 将 control-plane PostgreSQL 初始化收敛成正式 migration runner，并补齐最小查询接口骨架与真实验证链路。
---

# control-plane正式migration体系和查询接口骨架任务说明

## 目标

把 control-plane 的 PostgreSQL 初始化从“启动时直接执行 schema SQL”推进到正式 migration 体系，同时补最小查询接口骨架，使控制面已经落库的投影数据可被读取和验证。

## 范围

- PostgreSQL migration runner
- migration 元表和 SQL 文件加载机制
- `PostgresControlPlaneStore` 与 env 装配调整
- `run`、`run_item`、`step_events`、`migrations` 查询接口骨架
- OpenAPI、README、中文任务/设计/测试/举证文档

## 验收标准

- control-plane PostgreSQL 模式不再依赖内嵌 schema 常量建表
- `npm run control-plane:migrate:postgres` 提供正式 migration 入口
- 真实 PostgreSQL smoke 能验证 migration、查询接口和原有结果回传链路
- `npm run smoke:control-plane:postgres` 快速回归路径不回退
- 文档校验和契约校验通过

## 约束

- 当前仓库没有 `docker-compose` / `Dockerfile`，无法做容器内验证
- 当前 migration runner 仍从仓库内 `apps/control-plane/sql/` 加载 SQL 文件，不是独立发布包
- 为保住 `pg-mem` 快速 smoke，本轮对 migration 元表 DDL 增加了兼容 fallback
