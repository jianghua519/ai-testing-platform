---
title: control-plane 002 migration、分页查询接口和容器化本地栈测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 定义 002 migration、分页读模型和容器化本地栈的验证范围、风险和退出标准。
---

# control-plane 002 migration、分页查询接口和容器化本地栈测试计划

## 测试范围

- `002_control_plane_runtime_extensions.sql` 能被正式 migration runner 应用。
- `runs`、`run_items`、`run step events`、`run_item step events` 的分页查询可用。
- 容器化本地栈中能完成 migration、control-plane 启动和 smoke 验证。
- `OpenAPI`、README 和任务文档与实现一致。

## 覆盖风险

- 002 migration 与既有 `001` 不兼容。
- 分页 cursor 实现错误导致翻页重复或漏项。
- `run_id` 级 step events 查询没有真实覆盖。
- 容器镜像能构建但服务或 migration 无法在容器网络中运行。

## 测试项

1. 运行 `npm run typecheck`。
2. 运行 `bash ./scripts/validate_contracts.sh`。
3. 运行 `npm run smoke:control-plane:postgres`。
4. 运行 `npm run smoke:control-plane:postgres:real`。
5. 运行 `docker compose build`。
6. 运行容器化链路：PostgreSQL 启动、migration、control-plane 启动、compose smoke。
7. 运行 `bash ./scripts/validate_docs.sh`。

## 通过标准

- 所有命令退出码为 0。
- compose smoke 输出 2 个 migration、分页结果和 `agents/job_leases/artifacts` 表验证结果。
- 文档和契约校验通过。
