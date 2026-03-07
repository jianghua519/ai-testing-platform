---
title: 外部 PostgreSQL 实例验证设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明如何在没有系统级 PostgreSQL 和容器入口的前提下，为 control-plane 落一条基于真实 PostgreSQL 进程的宿主机 smoke。
---

# 外部 PostgreSQL 实例验证设计说明

## 背景

上一轮 `control-plane` 的 PostgreSQL 验证虽然已经覆盖了真实 HTTP API 和 PostgreSQL store 代码路径，但数据库层仍使用 `pg-mem`。这对 SQL 兼容性、主键冲突、进程级重启恢复只能提供有限信心。

当前环境还有两个现实约束：

- 没有系统级 `postgres` / `initdb` / `psql`
- 仓库内没有 `docker-compose` / `Dockerfile`

所以这轮不能简单依赖系统数据库或容器，而要在宿主机上自己拉起一个真实 PostgreSQL 进程。

## 方案

### 1. 保留两条 smoke 路径

为了不让快速回归退化，本轮采用双轨方式：

- `npm run smoke:control-plane:postgres`：继续保留 `pg-mem` 快速回归路径
- `npm run smoke:control-plane:postgres:real`：新增真实 PostgreSQL 进程验证路径

这样可以同时兼顾：

- 日常快速回归速度
- 真库兼容性验证强度

### 2. 真实数据库实例来源

本轮引入 `embedded-postgres`，由脚本在宿主机拉起一个独立 PostgreSQL 进程。它不是 `pg-mem`，也不是 mock，而是通过 TCP 提供连接的真实 PostgreSQL 服务。

这样做的原因很直接：

- 当前环境没有系统级 PostgreSQL 二进制
- 不能依赖容器
- 但仍然需要真实数据库进程语义

### 3. 脚本设计

新增脚本：

- [run_control_plane_postgres_real_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_postgres_real_smoke.mjs)

执行链路如下：

1. 在宿主机临时目录初始化并启动真实 PostgreSQL 进程
2. 创建 `aiwtp_smoke` 数据库
3. 以真实 connection string 打开 `PostgresControlPlaneStore`
4. 启动仓库内真实 `control-plane` HTTP 服务
5. 发送 `override` / `decide` / `runner-results` / `events` 请求
6. 直接查询 `runs`、`run_items`、`step_events`、`step_decisions`
7. 关闭 `control-plane` 和 PostgreSQL 进程
8. 重新启动 PostgreSQL 和 `control-plane`
9. 再次查询事件和领域表，验证重启恢复

### 4. 为什么这次能证明是真库

脚本额外查询了：

- `current_database()`
- `current_setting('server_version')`
- `current_setting('data_directory')`
- `version()`

这些结果直接写入 smoke 输出。运行结果里已经出现：

- `server_version = 18.3`
- `version_string = PostgreSQL 18.3 ...`
- `data_directory = /tmp/.../db`

这类字段不是 `pg-mem` 的目标证据，而是 PostgreSQL 真进程的直接响应。

## 风险

- 当前验证仍然是“宿主机嵌入式 PostgreSQL 进程”，不是远程托管 PostgreSQL 服务
- 当前 schema 初始化仍依赖 `autoMigrate` 执行 SQL 常量，不是完整迁移体系
- 当前没有容器内验证，因此不能覆盖镜像、卷挂载、容器用户等部署问题

## 验证计划

- 运行 `npm run typecheck`
- 运行 `npm run smoke:control-plane:postgres:real`
- 运行 `bash ./scripts/validate_docs.sh`
- 运行 `bash ./scripts/validate_contracts.sh`
- 检查仓库是否存在容器运行入口

## 结果摘要

本轮真实 smoke 已通过，关键结果如下：

- `health.status = ok`
- `databaseSummary.current_database = aiwtp_smoke`
- `databaseSummary.server_version = 18.3`
- `overrideAccepted = true`
- `decisionAction = replace`
- `duplicatePostStatus = 200`
- `domainSummary.runStatus = passed`
- `domainSummary.runItemStatus = passed`
- `restoredDomainSummary.stepDecisionConsumed = 1`

结论：当前 `control-plane` PostgreSQL 存储已经有一条基于真实 PostgreSQL 进程的宿主机验证链路，不再只依赖 `pg-mem`。
