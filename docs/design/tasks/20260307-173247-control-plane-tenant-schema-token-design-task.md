---
title: control-plane tenant schema隔离与最小身份token设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明 control-plane tenant schema 级业务表隔离、最小身份 JWT 和实时项目授权解析的实现方案。
---

# control-plane tenant schema隔离与最小身份token设计说明

## 背景

当前 control-plane 已具备调度与执行原型，但核心状态仍落在共享 public 表中，公开接口也缺少正式的租户身份上下文。按本轮约束：

- tenant 是物理隔离边界
- project 是 tenant 内授权边界
- `project` 和 `role` 在长作业期间可能变化，因此不能冻结在 token 中

这意味着方案需要同时解决两个问题：

1. 业务状态如何在 PostgreSQL 中做到 tenant 级物理隔离。
2. 公开 API 如何在不把动态授权塞进 token 的前提下完成鉴权。

## 方案设计

### 1. tenant schema 隔离

- 业务表按 tenant schema 创建，统一形态为 `"tenant_id".table_name`。
- 目前纳入 tenant schema 的表：
  - `control_plane_runner_events`
  - `runs`
  - `agents`
  - `run_items`
  - `job_leases`
  - `step_events`
  - `step_decisions`
  - `artifacts`
- schema 由 `tenant_schemas` 注册，首次写入 tenant 数据时自动创建。

### 2. public 全局注册表

保留在 `public` 的表只承担跨 tenant 路由和授权职责：

- `tenant_schemas`
- `run_locators`
- `run_item_locators`
- `artifact_locators`
- `agent_locators`
- `lease_locators`
- `subject_project_memberships`

这样可以在不扫描所有 tenant schema 的前提下，通过实体 ID 反查所属 tenant，再路由到对应 schema。

### 3. 最小身份 JWT

新增 `auth.ts`，使用 `CONTROL_PLANE_JWT_SECRET` 做 HS256 开发态签名与验签。当前 token 只承载稳定身份：

- `sub`
- `tenant_id`
- `iat`
- `exp`
- `jti`

不包含：

- `project_id`
- `project_ids`
- `roles`
- `permissions`

这些动态授权信息由 control-plane 在每次公开请求时基于 `(tenant_id, subject_id)` 查询 `subject_project_memberships` 计算得到。

### 4. 公开 API 鉴权

公开 API 在 handler 入口统一解析 Bearer token，并把 principal 收敛成：

- `subjectId`
- `tenantId`
- `projectIds`
- `roles`
- `projectGrants`

当前已接入：

- `GET /api/v1/me`
- `GET /api/v1/runs`
- `GET /api/v1/run-items`
- `GET /api/v1/runs/{run_id}`
- `GET /api/v1/run-items/{run_item_id}`
- `POST /api/v1/runs/{run_id}:cancel`

校验规则：

- token `tenant_id` 必须匹配资源所属 tenant
- 请求目标 `project_id` 必须出现在实时 membership 查询结果中

### 5. 调度与 step control 兼容

tenant schema 改造后，`job_id`、`run_id`、`run_item_id` 的跨 schema 路由依赖 locator 表。对 `override -> decide` 这条比 run projection 更早触发的链路，采用以下兼容策略：

- 优先根据已有 locator 解析 tenant schema
- 若只有请求上下文中的 `tenant_id`，先把 decision 写入 tenant schema
- 在 run / run_item 尚未落库前，不写 `run_id` / `run_item_id` 外键，避免提前触发外键失败
- 后续在 runner result 投影阶段补齐 `run_id` / `run_item_id`

这样既保持 tenant schema 隔离，也不破坏现有控制链路。

### 6. compose 与 smoke 适配

- `docker-compose.yml` 为 `control-plane` 和 `tools` 注入统一的 `CONTROL_PLANE_JWT_SECRET`
- 新增 `scripts/lib/control_plane_auth.mjs` 统一 JWT header 构造、tenant 表名拼接和 membership seed
- 现有 smoke 脚本改为：
  - 直接查询 tenant schema 表
  - 在公开接口请求中携带 Bearer token
  - 预先 seed `subject_project_memberships`
  - 显式断言 `override` / `decide` 状态码，避免空 body 掩盖真实错误

## 风险

- 当前公开鉴权仅覆盖公开 API，`/api/v1/internal/*` 仍按内部接口假设处理，后续如需对外暴露必须补充更严格边界。
- 为兼容历史/未知路径，`step_decisions` 仍保留 public fallback 读取逻辑；它主要用于老数据或 locator 缺失场景，不应成为新路径的默认写入方式。
- schema 名直接使用 `tenant_id`，依赖输入为受控 UUID 字符串；代码已统一做 identifier quoting，但跨系统创建 tenant 时仍应维持规范 ID。

## 验证计划

1. `docker compose build tools control-plane`
2. `docker rm -f ai-testing-platform-worker-agent`
3. `docker compose down -v`
4. `docker compose up -d postgres minio --wait`
5. `docker compose run --rm tools npm run control-plane:migrate:postgres`
6. `docker compose up -d control-plane --wait`
7. `docker compose run --build --rm tools npm run smoke:control-plane:postgres`
8. `docker compose run --rm tools npm run smoke:control-plane:compose`
9. `docker compose run --rm tools npm run smoke:scheduler:compose`
10. 文档回填后执行 `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`
