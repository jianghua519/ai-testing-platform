---
title: control-plane、agent、worker 与 PostgreSQL 调度系统设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明最小调度系统的架构边界、数据库模型、调度 API、agent 轮询流程与容器化验证策略。
---

# control-plane、agent、worker 与 PostgreSQL 调度系统设计说明

## 背景

前几轮已经分别完成了这些能力：

- `control-plane` 的 PostgreSQL migration、领域表投影与分页查询接口
- `web-worker` 的 DSL 编译、step 执行和结果回传
- step 级控制接口、真实浏览器 smoke、容器化本地栈

真正缺的不是更多单点能力，而是把这些部件串成一条调度链路。没有调度链路，就无法回答下面三个核心问题：

1. run 如何进入待执行队列。
2. agent 如何在不同节点上领取任务。
3. job 执行完成后如何把租约和运行状态正确收口到 PostgreSQL。

## 方案设计

### 1. PostgreSQL schema 扩展

新增 [003_control_plane_scheduler.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/003_control_plane_scheduler.sql)，补齐调度必需字段：

- `runs` 新增 `name`、`mode`
- `run_items` 新增：
  - `job_kind`
  - `job_payload_json`
  - `assigned_agent_id`
  - `lease_token`

设计目标：

- `run_items` 直接承载最小 job 队列语义，不再额外引入单独 `jobs` 表。
- `job_payload_json` 用于保存 worker 可直接消费的 `WebWorkerJob` 载荷。
- `assigned_agent_id` 与 `lease_token` 让租约状态和 run_item 状态保持一致。

### 2. ControlPlaneStore 调度边界

在 [types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/types.ts) 中新增 `ControlPlaneSchedulingStore`，并由 PostgreSQL store 实现这些核心能力：

- `enqueueWebRun()`：创建 `runs`、`run_items` 和 job payload
- `registerAgent()`：创建或更新 `agents`
- `heartbeatAgent()`：更新 agent 心跳
- `acquireLease()`：从 `run_items` 中领取一个待执行 job
- `heartbeatLease()`：续租
- `completeLease()`：完成、失败或取消租约

设计选择：

- 只有 `postgres` 模式实现调度能力。
- `inmemory` / `file` 模式继续保留结果接收和查询能力，但调度 API 会返回 `501 NOT_SUPPORTED`。
- 这样可以避免在低价值存储模式上复制复杂事务逻辑。

### 3. 租约获取与释放

[PostgresControlPlaneStore](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts) 的租约流程采用事务化 SQL：

1. `reclaimExpiredLeases()` 先回收超时租约，把相关 `run_items` 重新放回 `pending`。
2. 用 `for update skip locked` 选择最早创建、且状态为 `pending` 的 `run_items`。
3. 写入 `job_leases`，状态为 `leased`。
4. 把 `run_items` 更新为 `dispatched`，同时写入 `assigned_agent_id` 和 `lease_token`。
5. 把 `runs` 推进为 `running`。

租约收口分两条路径：

- worker 主动调用 `completeLease()`
- `job.result_reported` 到达时，`recordRunnerEvent()` 通过 `releaseLeaseForCompletedJob()` 兜底回收活跃租约

这样做的原因是：

- worker 网络中断时，结果可能已经回传，但 `completeLease()` 未必成功。
- 只靠显式完成接口不够稳，需要结果入库路径做兜底幂等收口。

### 4. Control-plane HTTP API

[control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts) 新增最小调度接口：

- `POST /api/v1/internal/runs:enqueue-web`
- `POST /api/v1/internal/agents:register`
- `POST /api/v1/internal/agents/{agent_id}:heartbeat`
- `POST /api/v1/internal/agents/{agent_id}:acquire-lease`
- `POST /api/v1/internal/leases/{lease_token}:heartbeat`
- `POST /api/v1/internal/leases/{lease_token}:complete`

接口约束：

- 全部使用 JSON 请求体。
- job 结果仍通过既有 `POST /api/v1/internal/runner-results` 写回。
- step 决策和 override 接口保持不变，可与调度流程并行使用。
- OpenAPI 在 [openapi.yaml](/home/jianghua519/ai-web-testing-platform-v2/contracts/openapi.yaml) 中同步新增了 internal schema。

### 5. PollingWebAgent

在 [apps/web-worker/src/agent/](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/agent) 中新增三层：

- `HttpAgentControlPlaneClient`：面向 control-plane 的 HTTP client
- `PollingWebAgent`：轮询主循环
- `types.ts`：agent/lease 边界模型

轮询执行流程：

1. 注册 agent
2. 上报 `online` 心跳
3. 获取 lease
4. 如果没有 lease，返回 `idle`
5. 如果获取到 lease，切到 `busy`
6. 后台定时心跳续租
7. 调用 `WebJobRunner.run(job)` 执行任务
8. 根据结果调用 `completeLease()`
9. 回到 `online` 并继续下一轮

当前实现选择轮询，而不是消息推送，原因很直接：

- 仓库现状已经有稳定的 HTTP API 和 PostgreSQL 事务能力。
- 轮询更容易在 Windows、Linux、macOS 和容器里落地。
- 先把调度状态机跑通，比过早引入消息总线更重要。

### 6. Worker 与调度链路的拼接

worker 侧没有新增新的执行内核，而是复用已有能力：

- `DefaultDslCompiler`
- `RegistryBasedPlaywrightAdapter`
- `WebJobRunner`
- `HttpResultPublisher`

这意味着新链路本质上是：

`enqueue-web -> acquire-lease -> WebJobRunner.run() -> runner-results -> run/run_item/lease 收口`

优势是边界清晰：

- control-plane 负责排队、租约和状态收口
- worker 负责执行和结果回传
- PostgreSQL 负责事实存储和幂等

### 7. 容器化调度验证

新增：

- [run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_scheduler_compose_smoke.mjs)
- [start_polling_web_agent.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/start_polling_web_agent.mjs)

验证顺序：

1. `docker compose build`
2. `docker compose up -d postgres --wait`
3. `docker compose run --rm tools npm run control-plane:migrate:postgres`
4. `docker compose up -d control-plane --wait`
5. `docker compose run --rm tools npm run smoke:scheduler:compose`

`scheduler smoke` 做的是真实链路，不是静态检查：

- 调用入队 API 连续创建 2 个 web run
- 启动 `PollingWebAgent` 拉租约
- 通过 `WebJobRunner` 执行 2 个 job
- 通过 `HttpResultPublisher` 回传 step / job 结果
- 直接查询 PostgreSQL，验证 `agents`、`job_leases`、`runs`、`run_items` 的最终状态

### 8. 边界与后续

本轮已经证明“调度系统能跑”，但有明确边界：

- 浏览器层在调度 smoke 中仍使用 fake browser launcher，目标是验证调度，而不是替代真实浏览器交互验证。
- agent 仍是单进程轮询模型，没有多槽位并发和跨 job backpressure。
- 没有 `job cancellation`、`pause/resume` 和 `agent capabilities` 的正式匹配算法。
- 没有消息总线，也没有分布式 scheduler leader 选举。

## 风险与边界

- `run_items` 兼任 job 队列是当前阶段的务实选择，但后续如果引入 API worker、report worker、AI worker，可能需要独立 job 抽象。
- 租约到期回收依赖数据库时间和轮询周期，当前只适合最小系统，不代表生产级调度器已经完成。
- 当前 OpenAPI 是 internal API 边界，不代表外部产品 API 已经定稿。

## 验证计划

- 宿主机：`npm run typecheck`、`bash ./scripts/validate_contracts.sh`
- 容器化：`docker compose build`、`docker compose run --rm tools ...`
- 调度闭环：`npm run smoke:scheduler:compose`
- 文档校验：`bash ./scripts/validate_docs.sh`
