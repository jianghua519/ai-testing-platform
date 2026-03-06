---
title: web-worker 结果回传协议与 HTTP publisher任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 在 web-worker 中补齐结果回传 envelope 与 HTTP publisher，使 worker 能将执行结果按契约化结构发布到控制面接收端。
---

# web-worker 结果回传协议与 HTTP publisher任务说明

## 目标

把上一轮 `web-worker` 的 `NoopResultPublisher` 推进为可用的结果回传协议实现，先落标准事件 envelope 和 HTTP publisher，并完成一次本地真实发布验证。

## 范围

- 扩展 `WebWorkerJob` / `JobMetadata` 的回传必需字段。
- 定义结果回传 envelope 与 payload 类型。
- 实现 `HttpResultPublisher`。
- 在 bootstrap 中接入基于环境变量的 publisher 选择。
- 中文任务文档、测试计划、测试报告、测试举证。

## 验收标准

- `web-worker` 能把执行结果映射为契约化 envelope。
- `HttpResultPublisher` 能把结果 POST 到本地接收端。
- 至少完成一次真实本地 HTTP 发布验证。
- `npm run typecheck`、文档校验、契约校验通过。

## 约束

- 当前仍无容器入口，无法按容器方式验证。
- 当前没有真实控制面接收服务，本轮使用本地 HTTP server 做发布验证。
- 本轮不实现 AMQP/Kafka publisher，只先落 HTTP 回传。
