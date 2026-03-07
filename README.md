# AI Web Testing Platform V2

这个仓库当前已经从纯规范仓库推进到“control-plane + agent + worker + PostgreSQL + S3 兼容对象存储”最小调度系统原型，并且容器化调度 smoke 已经能真实拉起 Playwright Chromium 与 artifact 对象存储闭环。

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
- artifact 上传到对象存储、落库、按 `run` / `run_item` 查询
- artifact 下载接口和保留期清理

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
- `npm run compose:postgres:reset`
- `npm run ai-orchestrator:serve`
- `npm run ai-orchestrator:migrate:postgres`
- `npm run control-plane:serve`
- `npm run control-plane:artifacts:prune`
- `npm run control-plane:migrate:postgres`
- `npm run worker:agent`
- `npm run playwright:install`
- `npm run smoke:ai-orchestrator:mock`：验证 assistant thread / memory / chat API 与 LangGraph 最小编排闭环
- `npm run smoke:ai-orchestrator:postgres:persistence`：验证 assistant thread / memory / chat API 已落到 PostgreSQL，并可在服务重启后继续读取
- `npm run smoke:ai-orchestrator:workflow`：验证 Playwright MCP 探索录屏、录屏转 case、自愈执行、run evaluation 和动作型 chatbot 闭环
- `npm run smoke:web:real`：真实 Chromium 覆盖 `open`、`click`、`input`、`upload`、`assert`
- `npm run smoke:control-plane:postgres`：control-plane PostgreSQL 存储链路快路径 smoke（`pg-mem`）
- `npm run smoke:control-plane:postgres:real`：真实外部 PostgreSQL 实例 smoke（嵌入式 PostgreSQL 进程），覆盖 migration、query API 和恢复验证
- `npm run smoke:control-plane:compose`：在容器化本地栈中验证 migration、分页读模型、runtime 表和 `run_id` 级 step events 查询
- `npm run smoke:scheduler:compose`：在容器化本地栈中验证 `control-plane -> agent -> real Playwright worker -> runner-results -> PostgreSQL` 调度闭环，并验证并发槽位、`pause / resume / cancel` 和 `screenshot / trace / video`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造"`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git --push`

AI Orchestrator：

- 当前新增 `apps/ai-orchestrator`，先落地 Phase 1 的最小能力：assistant thread、长期记忆提取、LangGraph turn 编排和 chat API
- compose 环境下默认启用 `AI_ORCHESTRATOR_STORE_MODE=postgres`，assistant thread、message、memory fact 会落到 PostgreSQL
- 模型提供方通过根目录 `.env` 配置，默认 `AI_PROVIDER=google`
- Docker build context 已忽略 `.env*`，运行配置只通过本地 `.env` 和 compose 环境注入，不会被打进镜像层
- 当前持久化相关环境变量：
  - `AI_ORCHESTRATOR_STORE_MODE=memory|postgres`
  - `AI_ORCHESTRATOR_DATABASE_URL`
  - `AI_ORCHESTRATOR_RUN_MIGRATIONS=true|false`
- 当 `AI_ORCHESTRATOR_STORE_MODE=postgres` 时，创建 thread 需要显式传 `tenantId` 和 `projectId`
- 当前支持：
  - `AI_PROVIDER=google`，使用 `GOOGLE_API_KEY` 和 `AI_GOOGLE_MODEL`
  - `AI_PROVIDER=openai`，使用 `OPENAI_API_KEY`、`AI_OPENAI_MODEL`，可选 `AI_OPENAI_BASE_URL`
  - `AI_PROVIDER=mock`，用于本地和容器 smoke，不依赖外部密钥
- 当前动作能力：
  - Playwright MCP 探索目标页面并生成录屏、trace、截图等 artifact
  - 根据最新 exploration/recording 自动发布 test case 与默认 dataset
  - 对失败 `run_item` 发起 runtime self-heal，并通过 step override 回放验证
  - 对执行结果做 deterministic first + LLM assisted 的 run evaluation
  - 通过 assistant chat 直接触发 exploration、browser assist、publish case、自愈和评估
- 建议从模板开始：
  - `cp .env.example .env`
  - 按需填写 `GOOGLE_API_KEY` 或 `OPENAI_API_KEY`
- 如果只是跑本地 smoke，不想依赖外部模型密钥，可把 `.env` 里的 `AI_PROVIDER` 改成 `mock`
- 本轮 assistant API：
  - `GET /healthz`
  - `POST /api/v1/assistant/threads`
  - `GET /api/v1/assistant/threads/{thread_id}`
  - `POST /api/v1/assistant/threads/{thread_id}/messages`
- 本轮 orchestration API：
  - `POST /api/v1/explorations`
  - `GET /api/v1/explorations/{exploration_id}`
  - `POST /api/v1/explorations/{exploration_id}:start`
  - `POST /api/v1/explorations/{exploration_id}:stop`
  - `POST /api/v1/explorations/{exploration_id}:publish-test-case`
  - `POST /api/v1/run-items/{run_item_id}:self-heal`
  - `POST /api/v1/run-items/{run_item_id}:evaluate`
  - `GET /api/v1/run-evaluations/{run_evaluation_id}`

当前控制面查询接口：

- `GET /api/v1/runs?tenant_id=...&project_id=...&limit=...&cursor=...`
- `GET /api/v1/run-items?run_id=...&limit=...&cursor=...`
- `GET /api/v1/internal/runs/{run_id}/step-events?limit=...&cursor=...`
- `GET /api/v1/internal/run-items/{run_item_id}/step-events?limit=...&cursor=...`
- `GET /api/v1/internal/runs/{run_id}/artifacts?limit=...&cursor=...`
- `GET /api/v1/internal/run-items/{run_item_id}/artifacts?limit=...&cursor=...`
- `GET /api/v1/internal/artifacts/{artifact_id}/download?mode=redirect|stream`
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

artifact 存储约定：

- `ARTIFACT_STORAGE_MODE` 控制 artifact 落地后端，当前支持 `filesystem` 和 `s3`
- `ARTIFACT_S3_ENDPOINT`、`ARTIFACT_S3_BUCKET`、`ARTIFACT_S3_ACCESS_KEY_ID`、`ARTIFACT_S3_SECRET_ACCESS_KEY` 控制 S3 兼容对象存储接入
- `ARTIFACT_S3_PUBLIC_ENDPOINT` 用于生成外部可访问的预签名下载地址
- `ARTIFACT_RETENTION_DAYS_DEFAULT` 和按 artifact 类型拆分的 `ARTIFACT_RETENTION_DAYS_*` 控制保留期
- `ARTIFACT_DOWNLOAD_SIGNED_URL_TTL_SECONDS` 控制下载重定向签名有效期

容器化本地栈：

- `docker compose build tools control-plane ai-orchestrator`
- `npm run compose:postgres:reset`
- `AI_PROVIDER=mock docker compose up -d control-plane ai-orchestrator --wait`
- `docker compose exec -T tools npm run smoke:ai-orchestrator:mock`
- `docker compose exec -T tools npm run smoke:ai-orchestrator:postgres:persistence`
- `docker compose exec -T tools npm run smoke:ai-orchestrator:workflow`
- `docker compose run --rm tools npm run smoke:control-plane:compose`
- `docker compose run --rm tools npm run smoke:scheduler:compose`
- `docker compose run --rm tools npm run control-plane:artifacts:prune`
- `docker compose down -v`

镜像说明：

- `control-plane` 使用 `Dockerfile` 的 `app-runtime` 目标，保持较小的 Node 运行时镜像
- `ai-orchestrator` 使用 `Dockerfile` 的 `playwright-app-runtime` 目标，内置 Playwright 浏览器依赖，供 MCP 探索和 browser assist 复用
- `tools` 使用 `Dockerfile` 的 `playwright-runtime` 目标，直接基于官方 `mcr.microsoft.com/playwright:v1.58.2-noble`
- `npm ci` 使用 BuildKit cache mount，避免每次重新下载整包依赖
