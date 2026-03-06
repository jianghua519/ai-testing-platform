---
title: web-worker 结果回传协议与 HTTP publisher测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证本轮 web-worker 结果回传 envelope、HTTP publisher 和本地真实发布流是否建立完成。
---

# web-worker 结果回传协议与 HTTP publisher测试计划

## 测试范围

- `WebWorkerJob` / `JobMetadata` 新增字段。
- `reporting/types.ts`、`result-envelope.ts`、`http-publisher.ts`、`create-publisher.ts`。
- `createWebWorker()` 的 publisher 装配逻辑。
- 一次本地真实 HTTP 发布流。
- 文档校验、契约校验和运行入口检查。

## 覆盖风险

- 结果结构仍然无法对应控制面回传协议。
- publisher 只是类型存在，没有真实网络发送能力。
- worker 发布的是内部模型，而不是标准 envelope。
- 只有静态检查，没有真实发布证据。

## 测试用例

1. 检查 `job-runner/types.ts` 是否包含 `runItemId`、`attemptNo`、`traceId`、`correlationId`。
2. 检查 `result-envelope.ts` 是否存在并实现结果映射。
3. 检查 `http-publisher.ts` 是否存在并执行 `fetch POST`。
4. 执行 `npm install`。
5. 执行 `npm run typecheck`。
6. 执行一次本地 `node:http` 接收端 + `WebJobRunner.run()` + `HttpResultPublisher` 的真实发布流。
7. 执行 `bash ./scripts/validate_docs.sh`。
8. 执行 `bash ./scripts/validate_contracts.sh`。
9. 检查仓库是否存在 `docker-compose` / `Dockerfile` 等运行入口。

## 通过标准

- 新字段和回传 envelope 已落到代码中。
- HTTP publisher 真实发出请求并被本地接收端收到。
- `npm run typecheck`、文档校验和契约校验通过。
- 容器内与真实控制面验证限制被明确记录。
