---
title: control-plane、agent、worker 与 PostgreSQL 调度系统测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 定义最小调度系统的验证范围、主要风险、容器化检查项和退出标准。
---

# control-plane、agent、worker 与 PostgreSQL 调度系统测试计划

## 测试范围

- `003_control_plane_scheduler.sql` 能被 migration runner 应用。
- control-plane 调度接口可用于入队、agent 注册、心跳、租约获取、续租和完成。
- `PollingWebAgent` 能真实执行至少 2 个 job，并在 compose 栈里完成状态收口。
- OpenAPI、README 和本轮文档与实现一致。

## 覆盖风险

- 调度 SQL 与现有投影表或 migration runner 不兼容。
- agent 获取租约后，结果回传与 lease 完成状态不一致。
- compose 栈中服务虽然可启动，但 agent/worker/control-plane/PG 之间链路不闭合。
- 文档仍停留在模板状态，无法追溯真实验证。

## 测试项

1. 运行 `npm run typecheck`。
2. 运行 `bash ./scripts/validate_contracts.sh`。
3. 运行 `docker compose build`。
4. 运行 `docker compose up -d postgres --wait`。
5. 运行 `docker compose run --rm tools npm run typecheck`。
6. 运行 `docker compose run --rm tools bash ./scripts/validate_docs.sh`。
7. 运行 `docker compose run --rm tools bash ./scripts/validate_contracts.sh`。
8. 运行 `docker compose run --rm tools npm run control-plane:migrate:postgres`。
9. 运行 `docker compose up -d control-plane --wait`。
10. 运行 `docker compose run --rm tools npm run smoke:scheduler:compose`。
11. 运行宿主机 `bash ./scripts/validate_docs.sh`。

## 通过标准

- 所有命令退出码为 0。
- migration 结果显示已应用 3 个 migration。
- compose smoke 输出 2 个 job 执行成功、1 次 idle 轮询、2 条 completed lease。
- PostgreSQL 查询结果证明：
  - 所有 `runs` 为 `passed`
  - 所有 `run_items` 为 `passed`
  - `assigned_agent_id` 和 `lease_token` 已清空
  - `agents` 表存在在线 agent 记录
- 文档和契约校验通过。
