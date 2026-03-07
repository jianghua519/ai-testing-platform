---
title: control-plane、agent、worker 与 PostgreSQL 调度系统测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录最小调度系统的真实执行结果，包括 compose 栈中的入队、拉租约、执行、回传和 PostgreSQL 收口。
---

# control-plane、agent、worker 与 PostgreSQL 调度系统测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- 宿主机：Linux
- 容器引擎：Docker Engine + Docker Compose

## 执行检查

1. `npm run typecheck`
2. `bash ./scripts/validate_contracts.sh`
3. `docker compose build`
4. `docker compose up -d postgres --wait`
5. `docker compose run --rm tools npm run typecheck`
6. `docker compose run --rm tools bash ./scripts/validate_docs.sh`
7. `docker compose run --rm tools bash ./scripts/validate_contracts.sh`
8. `docker compose run --rm tools npm run control-plane:migrate:postgres`
9. `docker compose up -d control-plane --wait`
10. `docker compose run --rm tools npm run smoke:scheduler:compose`
11. `bash ./scripts/validate_docs.sh`

## 结果

### 宿主机验证

- `npm run typecheck` 通过。
- `bash ./scripts/validate_contracts.sh` 通过。
- 宿主机文档校验在回填真实文档后通过。

### 容器化静态校验

- `docker compose build` 通过。
- `docker compose run --rm tools npm run typecheck` 通过。
- `docker compose run --rm tools bash ./scripts/validate_docs.sh` 通过。
- `docker compose run --rm tools bash ./scripts/validate_contracts.sh` 通过。

### 容器化 migration

- `docker compose run --rm tools npm run control-plane:migrate:postgres` 通过。
- 关键输出：
  - `appliedCount=3`
  - `001_control_plane_postgres.sql`
  - `002_control_plane_runtime_extensions.sql`
  - `003_control_plane_scheduler.sql`

### 容器化调度 smoke

- `docker compose run --rm tools npm run smoke:scheduler:compose` 通过。
- 关键结果：
  - `enqueueStatusCodes=[201,201]`
  - `cycleResults=[executed,executed,idle]`
  - `visitedUrls=["https://example.com/home","https://example.com/dashboard-original","https://example.com/home","https://example.com/dashboard-original"]`
  - `runsApiStatuses=[{"id":"e12549e2-cad6-423e-b20f-ff751a1f2317","status":"succeeded"},{"id":"6efa38c2-79d8-450b-9694-88eec2c8afbe","status":"succeeded"}]`
  - `stepEventCountsByRun=[2,2]`
  - `jobEventTypesByJob=[["step.result_reported","step.result_reported","job.result_reported"],["step.result_reported","step.result_reported","job.result_reported"]]`
  - `agentRows=[{"agent_id":"88888888-8888-8888-8888-888888888881","status":"online"}]`
  - `leaseRows` 中 2 条记录均为 `status="completed"`，且 `released_at` 非空
  - `runRows` 中 2 条记录均为 `status="passed"`
  - `runItemRows` 中 2 条记录均为 `status="passed"`，且 `assigned_agent_id=null`、`lease_token=null`

## 问题与修复

- 容器化校验第一次失败，原因是镜像中缺少 `python3`，导致 `validate_docs.sh` 无法执行。
- 修复方式：在 [Dockerfile](/home/jianghua519/ai-web-testing-platform-v2/Dockerfile) 中安装 `python3`。
- 第二次失败，原因是镜像中未复制 `docs/`，导致 `validate_contracts.sh` 找不到规范文档。
- 修复方式：在 [Dockerfile](/home/jianghua519/ai-web-testing-platform-v2/Dockerfile) 中加入 `COPY docs ./docs`。
- 第三次失败，原因是镜像缺少 `PyYAML`，`validate_contracts.sh` 在容器内报 `ModuleNotFoundError: No module named 'yaml'`。
- 修复方式：在 [Dockerfile](/home/jianghua519/ai-web-testing-platform-v2/Dockerfile) 中安装 `python3-yaml`。
- 修复后，容器内文档校验、契约校验、migration 和调度 smoke 全部通过。

## 结论

- 这轮已经把 `control-plane + agent + worker + PostgreSQL` 串成真实的最小调度系统。
- 任务入队、agent 注册与心跳、租约获取与完成、worker 执行、结果回传、PostgreSQL 收口都已在 compose 栈中真实验证。
- 当前调度 smoke 证明的是系统调度链路，不是浏览器引擎能力；浏览器交互能力仍以单独的真实 Playwright smoke 为准。

## 关联证据

- [20260307-115908-control-plane-agent-worker-postgresql-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-115908-control-plane-agent-worker-postgresql-evidence.md)
