---
title: web-worker 结果回传协议与 HTTP publisher设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明本轮如何把 web-worker 的结果发布从 Noop 推进为契约化 envelope 和 HTTP publisher，并完成本地真实发布验证。
---

# web-worker 结果回传协议与 HTTP publisher设计说明

## 背景

上一轮 `web-worker` 已经能完成 compile -> execute -> publish 的主链路，但 `publish` 仍然只是 `NoopResultPublisher`。这意味着：

- worker 可以跑
- 但控制面接收不到任何结果
- 事件契约还只是文档，不是代码中的真实出口

因此本轮不再扩展执行能力，而是补齐结果回传协议。

## 设计目标

- 让 `WebWorkerResult` 能稳定映射到事件 envelope。
- 让 worker 能通过 HTTP 把结果发布到控制面接收端。
- 保持未来可替换为 AMQP/Kafka，而不推翻当前 envelope 设计。
- 完成一次本地真实发布验证，而不是停留在静态类型层。

## 一、任务与元数据模型扩展

本轮先补齐 `job.result_reported` 所需的关键字段：

- `runItemId`
- `attemptNo`
- `traceId`
- `correlationId`

相关变更位于 [job-runner/types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/job-runner/types.ts) 。

这样 `WebWorkerJob` 与 `JobMetadata` 已经能覆盖 AsyncAPI 中回传 payload 的主键和追踪字段。

## 二、结果回传协议落地

### 2.1 reporting/types.ts

[reporting/types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/reporting/types.ts) 当前新增了：

- `JobResultPayloadError`
- `JobResultPayload`
- `ResultReportedEnvelope`
- `HttpResultPublisherConfig`
- `ResultEnvelopeFactory`
- `ResultPublisherFactory`

设计原则：

- envelope 字段名直接贴近现有 AsyncAPI 文档。
- payload 使用 snake_case，避免后续回传给控制面时再做一次字段翻译。
- 发布协议与 `WebWorkerResult` 解耦，由单独 factory 负责映射。

### 2.2 ResultEnvelopeFactory

[result-envelope.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/reporting/result-envelope.ts) 实现了 `DefaultResultEnvelopeFactory`。

当前映射规则：

- `executed` -> `payload.status=passed`
- `compile_failed` / `execution_failed` -> `payload.status=failed`
- `tenantId/projectId/traceId/correlationId` 从 `JobMetadata` 进入 envelope
- `started_at/finished_at/artifacts/usage` 从 `PlanExecutionResult` 进入 payload
- error 优先取失败 step 的 `errorCode/errorMessage`，否则退回 compile issue

这样 worker 层已经具备“内部结果 -> 外部回传协议”的稳定转换层。

## 三、HTTP publisher 落地

### 3.1 HttpResultPublisher

[http-publisher.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/reporting/http-publisher.ts) 当前实现：

- 构建 envelope
- `fetch POST` 到配置 endpoint
- 支持 `timeoutMs`
- 支持 Bearer Token
- 支持附加 headers
- 对非 2xx 返回直接抛错

这是一个明确的控制面接入口，而不是临时日志输出。

### 3.2 createResultPublisherFromEnv

[create-publisher.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/reporting/create-publisher.ts) 提供环境变量装配：

- `WEB_WORKER_RESULT_PUBLISH_MODE=noop|http`
- `WEB_WORKER_RESULT_PUBLISH_ENDPOINT`
- `WEB_WORKER_RESULT_PUBLISH_TIMEOUT_MS`
- `WEB_WORKER_RESULT_PUBLISH_AUTH_TOKEN`

[create-worker.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/bootstrap/create-worker.ts) 已切换为通过这个工厂选择 publisher。

这意味着 worker 的发布策略已经从“写死 Noop”升级为“可配置”。

## 四、主链路对接点

`WebJobRunner` 本轮没有改变主结构，但其发布结果现在已经具备真实外部出口：

- 编译失败时发布 `compile_failed`
- 执行完成后发布 `executed` / `execution_failed`
- metadata 中已经带有回传协议需要的字段

相关实现位于 [web-job-runner.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/job-runner/web-job-runner.ts) 。

## 五、本轮真实发布验证

本轮除了 `typecheck`，还做了一次真实的本地 HTTP 发布流：

1. 启动本地 `node:http` server 作为结果接收端。
2. 构造 `HttpResultPublisher(endpoint)`。
3. 用 `WebJobRunner.run(createWebWorkerJobFixture())` 执行 worker。
4. 使用 fake browser 对象跑通最小执行路径。
5. 在本地 HTTP server 中接收并解析发布的 envelope。

关键结果：

- `resultStatus=executed`
- `publishedEventType=job.result_reported`
- `payloadStatus=passed`
- `tenantId=tenant-1`
- `projectId=project-1`
- `runItemId=run-item-1`
- `stepCount=1`

这证明：

- worker 可以产出标准化 envelope
- HTTP publisher 可以真实发出请求
- 接收端可以收到并解析结果

同时必须明确：

- 这不是容器内验证。
- 这不是控制面真实服务。
- 这也不是真实浏览器 E2E；执行路径仍使用 fake browser 对象。

## 风险

- 目前 HTTP publisher 仍然只是一种传输方式，尚未接 AMQP/Kafka。
- 回传 envelope 与 AsyncAPI 对齐是代码级约定，还没有自动 schema 校验。
- 控制面接收端的鉴权、重试、幂等、回执协议还没实现。

## 验证计划

- 运行 `npm install`。
- 运行 `npm run typecheck`。
- 运行一次本地 HTTP 发布验证。
- 运行 `bash ./scripts/validate_docs.sh` 与 `bash ./scripts/validate_contracts.sh`。
- 检查仓库中是否存在容器或服务运行入口，并明确记录缺失。
