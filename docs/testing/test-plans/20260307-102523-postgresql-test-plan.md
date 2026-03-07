---
title: 外部 PostgreSQL 实例验证测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 规划 control-plane 在真实 PostgreSQL 进程上的 smoke 验证范围、风险和退出标准。
---

# 外部 PostgreSQL 实例验证测试计划

## 测试范围

验证 `control-plane` PostgreSQL store 在真实 PostgreSQL 进程上的宿主机 smoke：

- PostgreSQL 真实进程启动
- schema 初始化
- `override` / `decide` / `runner-results` / `events` HTTP 链路
- `runs`、`run_items`、`step_events`、`step_decisions` 领域表投影
- `runner-results` 幂等判重
- PostgreSQL 和 control-plane 重启后的恢复

## 覆盖风险

- 真实 PostgreSQL 与 `pg-mem` 行为不一致
- 连接串、schema 初始化或重连过程失败
- 事件持久化与幂等逻辑在真库上回退
- 仓库没有容器入口，导致无法补容器内验证

## 测试项

1. 运行 `npm run typecheck`
2. 运行 `npm run smoke:control-plane:postgres:real`
3. 检查输出中的 `server_version`、`version_string`、`data_directory`
4. 检查领域表投影结果和重复投递结果
5. 运行 `bash ./scripts/validate_docs.sh`
6. 运行 `bash ./scripts/validate_contracts.sh`
7. 检查 `docker-compose*` / `compose*.yml` / `compose*.yaml` / `Dockerfile*`

## 通过标准

- 真实 PostgreSQL smoke 命令退出码为 0
- 输出明确证明使用了真实 PostgreSQL 进程
- `domainSummary` 和 `restoredDomainSummary` 关键字段一致
- 文档校验和契约校验通过
- 无未说明的验证缺口
