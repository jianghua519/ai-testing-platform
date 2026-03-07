# AI Web Testing Platform V2

这个仓库当前已经从纯规范仓库推进到“control-plane + agent + worker + PostgreSQL”最小调度系统原型，并且容器化调度 smoke 已经能真实拉起 Playwright Chromium。

当前代码骨架：

- `apps/web-worker`：Web 执行 worker，负责编译 DSL、执行 step、回传结果，并提供轮询式 agent 主循环
- `apps/control-plane`：最小控制面 API，负责接收 runner 结果、step 决策、任务入队、agent 注册/心跳/租约获取与释放，并支持 `required_capabilities` 能力匹配
- `packages/web-dsl-schema`：源 DSL、编译后模型、执行结果类型
- `packages/dsl-compiler`：DSL 编译器骨架
- `packages/playwright-adapter`：Playwright 执行适配层与 step 执行引擎

当前已经支持的关键运行能力：

- agent `max_parallel_slots` 并发槽位
- run 级 `pause / resume / cancel`
- step 边界控制决策和 step 级结果回传
- runner `screenshot / trace / video` 真采集
- artifact 落库和按 `run` / `run_item` 查询

优先阅读：

- `docs/README.md`：文档地图、治理规则、模板和自动化入口
- `docs/v2/c4.md`：V2 架构与部署边界
- `docs/v2/tenancy-policy.md`：租户隔离策略
- `docs/v2/execution-state-machine.md`：执行状态机与幂等规则
- `contracts/openapi.yaml`：REST API 契约
- `contracts/asyncapi.yaml`：事件契约

实现不得与上述规范文档冲突。

常用命令：

- `make validate`
- `make typecheck`
- `bash ./scripts/validate_contracts.sh`
- `bash ./scripts/validate_docs.sh`
- `npm install`
- `npm run typecheck`
- `npm run control-plane:serve`
- `npm run control-plane:migrate:postgres`
- `npm run worker:agent`
- `npm run playwright:install`
- `npm run smoke:web:real`：真实 Chromium 覆盖 `open`、`click`、`input`、`upload`、`assert`
- `npm run smoke:control-plane:postgres`：control-plane PostgreSQL 存储链路快路径 smoke（`pg-mem`）
- `npm run smoke:control-plane:postgres:real`：真实外部 PostgreSQL 实例 smoke（嵌入式 PostgreSQL 进程），覆盖 migration、query API 和恢复验证
- `npm run smoke:control-plane:compose`：在容器化本地栈中验证 migration、分页读模型、runtime 表和 `run_id` 级 step events 查询
- `npm run smoke:scheduler:compose`：在容器化本地栈中验证 `control-plane -> agent -> real Playwright worker -> runner-results -> PostgreSQL` 调度闭环，并验证并发槽位、`pause / resume / cancel` 和 `screenshot / trace / video`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造"`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git --push`

当前控制面查询接口：

- `GET /api/v1/runs?tenant_id=...&project_id=...&limit=...&cursor=...`
- `GET /api/v1/run-items?run_id=...&limit=...&cursor=...`
- `GET /api/v1/internal/runs/{run_id}/step-events?limit=...&cursor=...`
- `GET /api/v1/internal/run-items/{run_item_id}/step-events?limit=...&cursor=...`
- `GET /api/v1/internal/runs/{run_id}/artifacts?limit=...&cursor=...`
- `GET /api/v1/internal/run-items/{run_item_id}/artifacts?limit=...&cursor=...`
- `GET /api/v1/internal/migrations`

当前控制面内部调度接口：

- `POST /api/v1/internal/runs:enqueue-web`
- `POST /api/v1/internal/runs/{run_id}:pause`
- `POST /api/v1/internal/runs/{run_id}:resume`
- `POST /api/v1/runs/{run_id}:cancel`
- `POST /api/v1/internal/agents:register`
- `POST /api/v1/internal/agents/{agent_id}:heartbeat`
- `POST /api/v1/internal/agents/{agent_id}:acquire-lease`
- `POST /api/v1/internal/leases/{lease_token}:heartbeat`
- `POST /api/v1/internal/leases/{lease_token}:complete`
- `POST /api/v1/internal/runner-results`
- `POST /api/v1/internal/jobs/{job_id}/steps/{source_step_id}:override`
- `POST /api/v1/agent/jobs/{job_id}/steps/{source_step_id}:decide`

agent 运行约定：

- `WEB_AGENT_SUPPORTED_JOB_KINDS` 控制 job kind 过滤
- `WEB_AGENT_BROWSERS` 生成 `browser:<name>` capability，默认是 `chromium`
- `WEB_AGENT_CAPABILITIES` 可显式补充额外 capability
- `WEB_AGENT_MAX_PARALLEL_SLOTS` 控制单 agent 的并发领取槽位，默认是 `1`

容器化本地栈：

- `docker compose build tools control-plane`
- `docker compose down -v`
- `docker compose up -d postgres --wait`
- `docker compose run --rm tools npm run control-plane:migrate:postgres`
- `docker compose up -d control-plane --wait`
- `docker compose run --rm tools npm run smoke:control-plane:compose`
- `docker compose run --rm tools npm run smoke:scheduler:compose`
- `docker compose down -v`
