---
title: 外部 PostgreSQL 实例验证任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 为 control-plane PostgreSQL 存储增加真实外部 PostgreSQL 实例 smoke，并保留 pg-mem 快速回归路径。
---

# 外部 PostgreSQL 实例验证任务说明

## 目标

把当前基于 `pg-mem` 的 control-plane PostgreSQL smoke，补强为一条基于真实 PostgreSQL 进程的宿主机验证链路，确保以下能力在真库上成立：

- `override -> decide -> runner-results -> events` API 主链路
- `runs`、`run_items`、`step_events`、`step_decisions` 领域表投影
- `runner-results` 幂等判重
- control-plane 和数据库重启后的数据恢复

## 范围

- 新增真实 PostgreSQL smoke 脚本
- 引入用于宿主机启动真实 PostgreSQL 进程的测试依赖
- 更新根命令入口和 README
- 补齐本轮中文任务、设计、测试和举证文档

## 验收标准

- `npm run smoke:control-plane:postgres:real` 能成功启动真实 PostgreSQL 进程并完成 smoke
- 输出中能直接证明是真实 PostgreSQL，而不是 `pg-mem`
- `pg-mem` 快路径不回退，仍保留为快速回归命令
- 文档校验和契约校验通过

## 约束

- 当前仓库没有 `docker-compose` / `Dockerfile`，无法做容器内 PostgreSQL 验证
- 当前环境没有预装系统级 `postgres` / `psql`，因此本轮采用宿主机拉起的嵌入式 PostgreSQL 进程
- 本轮目标是“真实数据库实例验证”，不是引入远程托管 PostgreSQL 服务
