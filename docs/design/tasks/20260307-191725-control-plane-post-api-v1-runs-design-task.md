---
title: control-plane 公开 POST /api/v1/runs设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明公开 `POST /api/v1/runs` 如何复用现有 enqueue 链、接入 principal 鉴权并对齐当前 OpenAPI 契约。
---

# control-plane 公开 POST /api/v1/runs设计说明

## 背景

当前 control-plane 只有内部 `POST /api/v1/internal/runs:enqueue-web` 能真正创建 web run。OpenAPI 中公开的 `POST /api/v1/runs` 已经存在契约，但实现缺失，导致：

- 外部调用者只能走内部接口
- token principal 与项目授权无法在正式创建入口生效
- 契约与实现不一致

在现有架构下，最务实的做法不是重做创建链，而是用公开接口封装现有 `enqueueWebRun`。

## 方案设计

### 1. 公开请求到内部输入的映射

新增 `RunCreateRequest` 归一化逻辑，当前只支持一种正式创建选择：

- `selection.kind = "inline_web_plan"`
- `selection.plan`
- `selection.env_profile`

同时把 `execution_policy` 中的以下字段透传到现有 enqueue 输入：

- `required_capabilities`
- `variable_context`
- `trace_id`
- `correlation_id`

最终映射到已有的 `ControlPlaneEnqueueWebRunInput`，不改 store 层调度语义。

### 2. principal 校验

`POST /api/v1/runs` 与其他公开查询接口保持同一鉴权模型：

- 从 Bearer token 解析 `subject_id/sub` 与 `tenant_id`
- 通过 `store.resolvePrincipal()` 查实时项目授权
- 校验 body `tenant_id` 必须等于 principal `tenant_id`
- 校验 body `project_id` 必须在 principal 的授权项目集合中

这样可以保持 token 最小化，同时不把动态 project/role 信息固化在签发时刻。

### 3. 响应形态

公开创建接口按 OpenAPI 返回 `Run`，不直接暴露内部 `run_item` 和 `job` 结构。调用者如需继续读取细节，使用：

- `GET /api/v1/runs/{run_id}`
- `GET /api/v1/run-items?run_id={run_id}`

这避免把内部调度对象直接泄露为外部契约的一部分。

### 4. 契约补强

OpenAPI 中原本对 `RunCreateRequest.selection` 只给了开放对象，本轮补成最小可执行形态：

- `RunSelection`
- `RunExecutionPolicy`

这样客户端可以明确知道当前实现支持什么，而不是猜测 body 结构。

### 5. smoke 验证策略

在 `run_control_plane_compose_smoke.mjs` 中加入公开创建验证：

- 成功使用 Bearer token 创建 run
- 成功用 `GET /api/v1/runs/{run_id}` 读回
- 成功用 `GET /api/v1/run-items?run_id=...` 读到单个 `run_item`
- 用未授权 `project_id` 再创建一次，确认返回 `403 PROJECT_ACCESS_DENIED`

## 风险

- 当前 `Idempotency-Key` 仍只停留在契约层，公开创建未做真正的去重存储。
- 当前公开创建只支持 `inline_web_plan`，后续如需 case/suite/compiled plan，需要扩展 `selection.kind` 体系。
- 响应只返回 `Run`，如果前端强依赖 `job_id`，还需要后续单独设计公开暴露策略。

## 验证计划

1. `docker compose run --build --rm tools npm run smoke:control-plane:postgres`
2. `docker compose build tools control-plane`
3. `docker compose down -v`
4. `docker compose up -d postgres minio --wait`
5. `docker compose run --rm tools npm run control-plane:migrate:postgres`
6. `docker compose up -d control-plane --wait`
7. `docker compose run --rm tools npm run smoke:control-plane:compose`
8. `docker compose run --rm tools npm run smoke:scheduler:compose`
9. 文档回填后执行 `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`
