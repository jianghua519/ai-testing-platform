---
title: control-plane持久化和结果幂等设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明本轮如何为最小 control-plane 引入 store 抽象、文件持久化实现、runner 结果幂等，以及重启恢复验证结果。
---

# control-plane持久化和结果幂等设计说明

## 背景

上一轮已经把最小 control-plane API 落进仓库，并完成了 worker 与 control-plane 的真实联调。但它还有两个非常直接的问题：

- 所有状态都在内存里，服务一重启就丢
- `runner-results` 重复投递时会重复写入

这两个问题不解决，control-plane 仍然只能算联调样例，不能算最小可运行骨架。

## 设计目标

- 抽出 `ControlPlaneStore`，让 server 不直接依赖某个具体实现
- 保留现有内存实现，新增文件持久化实现
- `runner-results` 按 `event_id` 做结果幂等
- 用一次真实运行流证明：
  - step patch 仍然成立
  - 重复投递不会重复入库
  - control-plane 重启后能恢复已保存状态

## 一、store 抽象

### 1.1 ControlPlaneStore

[types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/types.ts) 本轮新增了：

- `ControlPlaneStore`
- `ControlPlaneStateSnapshot`
- `RecordRunnerEventResult`

这样 control-plane server 只依赖统一接口：

- `recordRunnerEvent()`
- `listJobEvents()`
- `enqueueStepDecision()`
- `dequeueStepDecision()`
- `snapshot()`

### 1.2 InMemoryControlPlaneState

[control-plane-state.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-state.ts) 现在不仅是临时容器类，而是 `ControlPlaneStore` 的一个实现。

它新增了两个能力：

- `receivedEventIds` 集合，用于结果幂等
- `snapshot` hydrate 能力，用于从持久化快照恢复内存状态

## 二、文件持久化实现

### 2.1 FileBackedControlPlaneStore

[file-backed-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/file-backed-control-plane-store.ts) 提供了最小文件仓储实现。

设计要点：

- 启动时读取 JSON 状态文件
- 写入时先写临时文件，再 `rename` 覆盖，避免半写状态
- 所有变更操作都在内存 store 上完成，再异步串行落盘
- 持久化内容包括：
  - `eventsByJob`
  - `pendingDecisionsByJob`
  - `receivedEventIds`

这样即使服务重启，也能恢复：

- 已保存的 step/job 结果事件
- 还未被消费的 step 决策
- 已处理过的 `event_id`

### 2.2 环境变量工厂

[create-control-plane-store.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/create-control-plane-store.ts) 增加了环境变量装配：

- `CONTROL_PLANE_STORE_MODE=inmemory|file`
- `CONTROL_PLANE_STATE_FILE`

默认模式是 `file`，默认文件路径是：

- `.data/control-plane-state.json`

这让 control-plane 在不引入数据库的前提下，先具备最小的可恢复能力。

## 三、结果幂等

### 3.1 幂等键

本轮以 envelope 的 `event_id` 作为幂等键。

原因很简单：

- `event_id` 已经是事件级唯一标识
- 对 step 结果和 job 结果都适用
- 不需要额外依赖 HTTP 头或业务主键组合

### 3.2 HTTP 响应语义

[control-plane-server.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts) 里，`POST /api/v1/internal/runner-results` 当前语义为：

- 首次接收：`202`，`{ accepted: true, duplicate: false }`
- 重复接收：`200`，`{ accepted: true, duplicate: true }`

这让调用方可以区分：

- 事件已被接收并写入
- 事件已被幂等吸收，没有重复写入

## 四、server 改动

### 4.1 startControlPlaneServer

[startControlPlaneServer()](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/src/runtime/control-plane-server.ts) 现在不再默认 new 一个内存 state，而是：

- 优先使用传入的 `store`
- 否则通过 `createControlPlaneStoreFromEnv()` 自动创建 store

这让 server 本身不再关心底层是内存还是文件仓储。

### 4.2 runner-results

`runner-results` 现在会：

1. 调 `store.recordRunnerEvent()`
2. 根据返回的 `duplicate` 决定 HTTP 状态码和响应体

因此幂等已经不是文档约定，而是运行时真实行为。

## 五、契约更新与样例收敛

### 5.1 OpenAPI

本轮更新了 [openapi.yaml](/home/jianghua519/ai-web-testing-platform-v2/contracts/openapi.yaml) ：

- `POST /api/v1/internal/runner-results` 明确声明按 `event_id` 幂等
- 新增 `200 duplicate accepted` 响应
- 新增 `RunnerResultAccepted` schema

### 5.2 fixture 收敛

[fixture.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/testing/fixture.ts) 中的 `jobId` / `tenantId` / `projectId` / `runId` / `runItemId` 已改成 UUID 风格样例，避免继续和契约里的 UUID 约束打架。

## 六、真实运行验证

本轮真实运行流比上一轮多做了两件事：

- 对同一个结果 envelope 重复投递一次
- 关闭 control-plane 后，再用同一个状态文件重启 control-plane

验证过程：

1. 用 `FileBackedControlPlaneStore` 启动 control-plane
2. 预置 step2 的 `pause` override
3. 启动 worker，执行 `open-home -> open-dashboard`
4. 等 `open-home` 结果写入 control-plane 后，再通过 override API 提交 step2 的 `replace`
5. worker 实际执行更新后的 step2
6. 读取 control-plane 事件列表，确认已有 3 条事件
7. 将第一条结果 envelope 再次 `POST` 到 `runner-results`
8. 确认接口返回 `duplicate=true`，事件总数保持 3
9. 关闭 control-plane
10. 用同一状态文件重新启动 control-plane
11. 再次读取事件列表，确认仍然是 3 条

关键结果：

- `duplicateStatus=200`
- `duplicateBody={ accepted: true, duplicate: true }`
- `dedupedEventCount=3`
- `restoredEventCount=3`
- `persistedFileHasEventIds=true`
- `visitedUrls[1]=https://example.com/dashboard-persisted-patched`

这证明：

- step patch 仍然成立
- 幂等吸收已经成立
- 文件持久化恢复已经成立

## 风险

- 文件仓储只适合单实例和开发阶段，不适合多副本部署
- 现在的持久化还是全量 JSON 重写，不适合高吞吐
- 结果幂等只覆盖 `runner-results`，还没有覆盖 override API 的重复提交
- 运行验证仍然没有真实浏览器和容器环境

## 验证计划

- 运行 `npm run typecheck`
- 运行 file-backed control-plane + worker 的真实联调
- 重复投递同一结果 envelope，验证幂等吸收
- 重启 control-plane，验证状态恢复
- 运行 `bash ./scripts/validate_docs.sh` 和 `bash ./scripts/validate_contracts.sh`
- 检查容器入口缺失情况
