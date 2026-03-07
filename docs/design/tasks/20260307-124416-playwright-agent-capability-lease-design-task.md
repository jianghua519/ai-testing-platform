---
title: 真实 Playwright 调度执行与 agent capability/lease 正式化设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明 capability 派生、lease 获取约束、真实 Playwright 容器执行和 compose 调度 smoke 的实现方式。
---

# 真实 Playwright 调度执行与 agent capability/lease 正式化设计说明

## 背景

上一轮已经把：

- `control-plane`
- 轮询式 `agent`
- `web-worker`
- PostgreSQL

串成了最小调度闭环，但仍有两个关键缺口：

1. 调度 smoke 还用的是 fake browser launcher，只能证明“调度链路”，不能证明“容器里的 worker 真能拉起浏览器”。
2. 租约获取只按 `job_kind` 过滤，无法表达“这个 web job 需要 Chromium，而 Firefox agent 不应该拿到”。

这两点不解决，调度系统仍然停留在原型级别。

## 方案设计

### 1. 004 migration

新增 [004_control_plane_capability_requirements.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/004_control_plane_capability_requirements.sql)，为 `run_items` 增加：

- `required_capabilities_json`

设计目的：

- 把“任务需要什么能力”从隐式约定变成正式数据。
- capability 匹配可以直接在 PostgreSQL 层完成，而不是落到应用层手工筛选。

### 2. capability 推导

新增 [job-capabilities.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/job-capabilities.ts)，统一两件事：

- `normalizeCapabilities()`：把 capability 统一为去重、小写、稳定格式。
- `buildWebRunRequiredCapabilities()`：从 `plan` 和 `envProfile` 派生最小 web 能力集合。

当前规则很刻意地保持简单：

- 所有 web job 至少要求 `web`
- 再加 `browser:<browser>`

例如 Chromium job 会得到：

- `web`
- `browser:chromium`

### 3. Control-plane 存储和 lease 匹配

[PostgresControlPlaneStore](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/postgres-control-plane-store.ts) 做了三件关键事：

- `enqueueWebRun()` 在插入 `run_items` 时写入 `required_capabilities_json`
- `registerAgent()` / `heartbeatAgent()` 在保存 agent 能力时统一规范化
- `acquireLease()` 通过 PostgreSQL `jsonb` 包含关系做能力匹配

核心约束是：

- `coalesce(required_capabilities_json, '[]'::jsonb) <@ $agentCapabilities::jsonb`

这意味着：

- job 要求的所有 capability 都必须包含在 agent 的 capability 集合里
- 否则该 lease 不会被该 agent 选中

### 4. API 与读模型

[control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts) 的变化：

- `POST /api/v1/internal/runs:enqueue-web` 允许可选 `required_capabilities`
- `GET /api/v1/run-items` / `GET /api/v1/run-items/{run_item_id}` 通过 `summary.required_capabilities` 暴露这组能力

OpenAPI 已同步更新 [openapi.yaml](/home/jianghua519/ai-web-testing-platform-v2/contracts/openapi.yaml)。

### 5. agent 启动约定

[start_polling_web_agent.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/start_polling_web_agent.mjs) 现在支持三层 capability 来源：

- `WEB_AGENT_SUPPORTED_JOB_KINDS`
- `WEB_AGENT_BROWSERS`
- `WEB_AGENT_CAPABILITIES`

默认行为是：

- job kind 为 `web`
- browser capability 为 `browser:chromium`

这样容器里的默认 agent 能够开箱即用地领取 Chromium web job。

### 6. 容器内真实 Playwright 执行

两处关键改动：

- [browser-launcher.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/browser-launcher.ts) 为容器内 root 运行的 Chromium 自动附加 `--no-sandbox` 和 `--disable-dev-shm-usage`
- [Dockerfile](/home/jianghua519/ai-web-testing-platform-v2/Dockerfile) 在镜像构建阶段执行 `npx playwright install --with-deps chromium`

同时 [docker-compose.yml](/home/jianghua519/ai-web-testing-platform-v2/docker-compose.yml) 给 `tools` 服务增加了 `shm_size: 1gb`，避免浏览器在默认共享内存下不稳定。

### 7. 新的 compose 调度 smoke

[run_scheduler_compose_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_scheduler_compose_smoke.mjs) 不再使用 fake browser，而是：

- 在 `tools` 容器内启动本地目标站点
- 创建真实上传文件
- 用 `PlaywrightBrowserLauncher` 启动 HeadlessChrome
- 连续入队 2 个 Chromium web run
- 先让 Firefox agent 尝试获取 lease，预期拿不到
- 再让 Chromium agent 轮询执行 2 个 job
- 查询 control-plane API 和 PostgreSQL 表，验证最终状态

真实链路证明点有三类：

- 浏览器证据：`HeadlessChrome/145.0.7632.6`
- 业务证据：点击、输入、上传、提交、断言全部完成
- 调度证据：Firefox agent idle，Chromium agent 执行成功，lease 完成且释放

## 风险与边界

- 当前 capability 仍是静态标签匹配，不是复杂调度策略。
- 镜像现在包含 Chromium 运行时，构建时间和镜像体积明显上升。
- compose 调度 smoke 只覆盖 Chromium；Firefox / WebKit 仍未进入调度矩阵。

## 验证计划

- 容器内 `typecheck`
- 容器内契约校验
- 容器内 migration
- 容器内 `smoke:control-plane:compose`
- 容器内 `smoke:scheduler:compose`
- 容器内和宿主机文档校验
