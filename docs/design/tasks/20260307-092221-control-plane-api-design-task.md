---
title: control-plane API接入设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明本轮如何在仓库内新增最小 control-plane 应用，承接 worker 结果回传、step 决策和 override，并完成真实联调。
---

# control-plane API接入设计说明

## 背景

上一轮虽然已经把 `HttpStepController` 和 step 级结果回传做出来了，但联调时仍然依赖脚本里临时启动的匿名 HTTP server。这有两个问题：

- 仓库里没有真正的 control-plane 代码可以复用或继续扩展
- 结果回传、step 决策、override 还是散落在验证脚本里，不是可维护模块

因此这轮不再扩展 worker 本身，而是把控制面对接代码正式落进仓库。

## 设计目标

- 新增一个最小 `apps/control-plane` 应用
- 把 worker 结果接收和 step 决策接口收敛成真实 API
- 让人工或 AI 可以通过单独接口写入下一个 step 的 override
- 用仓库内 control-plane 代码完成一次真实联调

## 一、最小 control-plane 应用

### 1.1 目录结构

本轮新增：

- [apps/control-plane/package.json](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/package.json)
- [apps/control-plane/tsconfig.json](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/tsconfig.json)
- [types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/types.ts)
- [control-plane-state.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-state.ts)
- [control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts)
- [index.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/index.ts)

### 1.2 职责边界

这个最小应用只做三件事：

- 接收 worker 发来的结果 envelope
- 在 step 执行前返回控制决策
- 接收外部 override 指令，并把它排队给下一个 step 使用

它暂时不做：

- 持久化数据库
- 用户认证
- 多节点同步
- 审批流或 AI 代理编排

## 二、内存状态模型

[control-plane-state.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-state.ts) 维护两类内存状态：

- `eventsByJob`：按 `job_id` 存储收到的 step/job 结果事件
- `pendingDecisionsByJob`：按 `job_id + source_step_id` 存储待消费的控制决策队列

之所以用“队列”，不是单值覆盖，有两个原因：

- step2 可能先收到一个 `pause`，后面再收到一个 `replace`
- 这更贴近真实控制面把多个控制动作串成时序决策的需求

## 三、HTTP API

### 3.1 worker -> control-plane

[control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts) 当前暴露：

- `GET /healthz`
- `POST /api/v1/internal/runner-results`
- `POST /api/v1/agent/jobs/{job_id}/steps/{source_step_id}:decide`

其中：

- `runner-results` 用于接收 `job.result_reported` 与 `step.result_reported`
- `:decide` 用于 worker 在 step 执行前查询控制决策

如果没有排队决策，`:decide` 返回 `204`，worker 按原 step 继续执行。

### 3.2 operator/AI -> control-plane

为了让人工或 AI 真正能远程改写“下一个 step”，本轮增加：

- `POST /api/v1/internal/jobs/{job_id}/steps/{source_step_id}:override`
- `GET /api/v1/internal/jobs/{job_id}/events`

前者负责把控制决策排队到控制面，后者负责查看当前 job 已接收到的事件，便于 AI 或人工基于上一个 step 的结果做下一步决策。

## 四、worker 接线

### 4.1 WebJobRunner

[web-job-runner.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/job-runner/web-job-runner.ts) 已在上一轮支持 `StepControllerProvider`。本轮不再修改协议核心，只是让它可以直接接入 control-plane 的真实 API。

### 4.2 createWebWorker

[create-worker.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/bootstrap/create-worker.ts) 继续沿用环境变量装配方式：

- `WEB_WORKER_STEP_CONTROL_MODE=http`
- `WEB_WORKER_STEP_CONTROL_ENDPOINT=http://.../api/v1/agent/jobs/{job_id}/steps/{source_step_id}:decide`

这样 worker 仍然不需要知道 control-plane 的内部实现细节，只依赖稳定的 HTTP 决策接口。

## 五、契约更新

本轮扩展 [openapi.yaml](/home/jianghua519/ai-web-testing-platform-v2/contracts/openapi.yaml) ，新增：

- `POST /api/v1/internal/runner-results`
- `POST /api/v1/internal/jobs/{job_id}/steps/{source_step_id}:override`
- `GET /api/v1/internal/jobs/{job_id}/events`

同时保留上一轮的：

- `POST /api/v1/agent/jobs/{job_id}/steps/{source_step_id}:decide`

这些接口构成当前最小 control-plane / worker 联调面。

## 六、真实联调验证

本轮真实联调不再自己手写匿名 server，而是：

1. 启动 [startControlPlaneServer()](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts)
2. 通过 `POST /api/v1/internal/jobs/{job_id}/steps/open-dashboard:override` 预置一个 `pause`
3. 启动 `WebJobRunner.run()`
4. worker 把 `open-home` 的 step 结果发到 `POST /api/v1/internal/runner-results`
5. 联调脚本轮询 `GET /api/v1/internal/jobs/{job_id}/events`
6. 看到 `open-home` 完成后，再通过 `override` API 提交一个 `replace`
7. worker 在执行 `open-dashboard` 前，调用 `:decide` 接口，先拿到 `pause`，随后拿到 `replace`
8. worker 最终执行 control-plane 改写后的 step2，并继续回传结果

关键结果：

- `storedEventTypes=["step.result_reported","step.result_reported","job.result_reported"]`
- `visitedUrls[1]=https://example.com/dashboard-control-plane-patched`
- `finalStepUrlPatched=true`

这次验证证明：

- worker 和 control-plane 的 HTTP 对接已经落在仓库内真实代码
- override 不再靠进程内直接调用 controller
- 结果回传与决策请求都走真实 control-plane API

## 风险

- control-plane 当前是内存实现，服务重启后状态丢失
- 结果接收接口目前只是 HTTP bridge，没有持久化和幂等处理
- 运行验证仍然没有真实浏览器，也没有容器化部署
- 当前 fixture 中的 `jobId` 等字段仍是普通字符串，而契约里部分字段沿用 UUID 约束，这个一致性还需要下一轮收敛

## 验证计划

- 运行 `npm install`
- 运行 `npm run typecheck`
- 启动 `startControlPlaneServer()`，完成 worker 与 control-plane 真实联调
- 运行 `bash ./scripts/validate_docs.sh` 和 `bash ./scripts/validate_contracts.sh`
- 检查容器运行入口缺失情况
