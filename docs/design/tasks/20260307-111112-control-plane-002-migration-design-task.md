---
title: control-plane 002 migration、分页查询接口和容器化本地栈设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明 002 migration、分页读模型和容器化本地栈的设计边界、实现方式与验证策略。
---

# control-plane 002 migration、分页查询接口和容器化本地栈设计说明

## 背景

上一轮已经完成：

- 正式 migration runner
- `runs`、`run_items`、`step_events`、`step_decisions` 领域表投影
- 单对象查询和基础 PostgreSQL smoke

当前缺口有三类：

1. `agents`、`job_leases`、`artifacts` 还没有进入正式 schema。
2. 查询接口只有单对象读取，不足以支撑控制台和调试场景。
3. PostgreSQL 与 control-plane 的验证主要在宿主机完成，容器部署路径没有真实证明。

## 方案设计

### 1. 002 migration

新增 [002_control_plane_runtime_extensions.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/002_control_plane_runtime_extensions.sql)，引入三张正式表：

- `agents`
- `job_leases`
- `artifacts`

设计原则：

- `agents` 负责承载跨平台 agent 的心跳、能力与元数据。
- `job_leases` 负责承载调度租约、过期时间、心跳时间和释放时间。
- `artifacts` 负责承载 run、run_item、step_event 级别的制品关联。

本轮不引入这些表的控制面 API，只先把 schema 收敛成正式 migration，并在验证脚本中直接写入，证明约束与索引可用。

### 2. 分页读模型

分页能力在 [pagination.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/pagination.ts) 中统一处理，采用 `base64url(JSON)` cursor，结构为：

- `primary`：时间主排序键
- `secondary`：稳定的 ID 次排序键

这样做的原因是：

- 避免 offset 在事件持续写入时出现跳页和重复。
- 允许在 PostgreSQL 和内存投影上统一实现。

具体排序规则：

- `runs`：`created_at desc, run_id desc`
- `run_items`：`created_at desc, run_item_id desc`
- `step_events`：`received_at desc, event_id desc`

### 3. 查询接口

控制面新增和补齐以下读接口：

- `GET /api/v1/runs`
- `GET /api/v1/run-items`
- `GET /api/v1/internal/runs/{run_id}/step-events`
- `GET /api/v1/internal/run-items/{run_item_id}/step-events`
- `GET /api/v1/internal/migrations`

接口行为：

- 列表接口统一返回 `items` 和可选的 `next_cursor`
- 缺少必填 query 或 cursor 非法时返回 `INVALID_PAGINATION`
- step events 继续沿用 snake_case 输出，保持与现有内部契约一致

### 4. 存储实现

- [PostgresControlPlaneStore](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts) 使用 SQL 直接实现分页查询。
- [InMemoryControlPlaneState](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-state.ts) 和 [FileBackedControlPlaneStore](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/file-backed-control-plane-store.ts) 通过投影重建提供同样的查询接口。
- [projection-utils.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/projection-utils.ts) 负责从事件重建 `run -> run_items -> step_events` 视图，避免 server 层按存储模式分叉。

### 5. 容器化本地栈

新增：

- [Dockerfile](/home/jianghua519/ai-web-testing-platform-v2/Dockerfile)
- [docker-compose.yml](/home/jianghua519/ai-web-testing-platform-v2/docker-compose.yml)
- [start_control_plane_server.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/start_control_plane_server.mjs)
- [run_control_plane_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_compose_smoke.mjs)

容器职责：

- `postgres`：真实 PostgreSQL 18 容器
- `control-plane`：基于仓库代码构建的 control-plane 服务容器
- `tools`：同镜像工具容器，用于运行 migration、typecheck 和 smoke

验证顺序：

1. `docker compose up -d postgres --wait`
2. `docker compose run --rm tools npm run control-plane:migrate:postgres`
3. `docker compose up -d control-plane --wait`
4. `docker compose run --rm tools npm run smoke:control-plane:compose`

## 风险与边界

- `agents`、`job_leases`、`artifacts` 目前只进入 schema，不代表调度和制品管理已经产品化。
- 容器化验证证明了本地栈可运行，但没有覆盖生产环境网络、镜像仓库、卷权限和多副本部署。
- 列表接口目前没有鉴权、过滤组合和复杂搜索，只覆盖本轮目标的最小可用读模型。

## 验证计划

- 宿主机回归：`typecheck`、`validate_contracts.sh`、`pg-mem` smoke、真实 PostgreSQL smoke。
- 容器化验证：`docker compose` 下运行 migration 和 compose smoke。
- 文档验证：`validate_docs.sh`。
