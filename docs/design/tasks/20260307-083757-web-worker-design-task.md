---
title: web-worker 代码骨架设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明本轮如何把 compiler 和 Playwright adapter 串成最小 web-worker 执行闭环，并定义任务模型、运行时边界和结果发布接口。
---

# web-worker 代码骨架设计说明

## 背景

到上一轮为止，仓库里已经有三块基础能力：

- `web-dsl-schema`
- `dsl-compiler`
- `playwright-adapter`

但它们还是三个独立模块，没有一个真正的执行入口把这些能力串起来。没有 worker，就还不能回答最关键的问题：实际运行时，谁负责拿任务、编译 DSL、启动浏览器、执行 step、收集结果并发布出去。

因此本轮直接落 `apps/web-worker`，先建立最小执行骨架。

## 设计目标

- 让 `WebWorkerJob` 成为稳定的任务输入模型。
- 让 `WebJobRunner.run()` 串起 compile -> launch -> session -> execute -> publish。
- 保持与现有 `dsl-compiler` 和 `playwright-adapter` 的边界清晰。
- 先做单进程骨架，不提前引入消息队列、服务注册或守护进程复杂度。

## 一、根 workspace 更新

根 workspace 已更新为同时包含 `packages/*` 和 `apps/*`：

- [package.json](/home/jianghua519/ai-web-testing-platform-v2/package.json)

根 `typecheck` 也已纳入 `apps/web-worker`，保证后续 app 层不会游离在编译边界之外。

## 二、web-worker 包结构

本轮新增目录：

```text
apps/web-worker/
  src/job-runner/
  src/session/
  src/reporting/
  src/bootstrap/
  src/testing/
```

关键文件：

- [package.json](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/package.json)
- [tsconfig.json](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/tsconfig.json)
- [job-runner/types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/job-runner/types.ts)
- [job-runner/web-job-runner.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/job-runner/web-job-runner.ts)
- [session/browser-launcher.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/browser-launcher.ts)
- [session/session-manager.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/session-manager.ts)
- [reporting/types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/reporting/types.ts)
- [reporting/noop-publisher.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/reporting/noop-publisher.ts)
- [bootstrap/create-worker.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/bootstrap/create-worker.ts)

## 三、任务模型落地

[job-runner/types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/job-runner/types.ts) 当前定义了三类核心对象：

- `WebWorkerJob`
- `JobMetadata`
- `WebWorkerResult`

### 3.1 WebWorkerJob

当前字段覆盖：

- `jobId`
- `tenantId`
- `projectId`
- `runId`
- `plan`
- `envProfile`
- `variableContext`

这组字段已经足够支撑最小 worker 输入，而且与多租户边界兼容。

### 3.2 WebWorkerResult

当前输出统一归口为：

- `metadata`
- `status`
- `issues`
- `planResult`

状态先收敛成四种：

- `compiled`
- `executed`
- `compile_failed`
- `execution_failed`

当前代码实际会产出后三种里的两类主路径：`compile_failed` 或 `executed/execution_failed`。

## 四、执行主线落地

### 4.1 WebJobRunner

[web-job-runner.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/job-runner/web-job-runner.ts) 是本轮的核心。它负责：

1. 调用 `DefaultDslCompiler.compile()`
2. 编译失败时直接发布 `compile_failed`
3. 编译成功后调用 `BrowserLauncher.launch()`
4. 创建 `ExecutionSession`
5. 调用 `RegistryBasedPlaywrightAdapter.executePlan()`
6. 关闭 context / browser
7. 发布最终 `WebWorkerResult`

这说明 worker 层已经真正站在编译器和执行器之上，而不是重复实现它们的逻辑。

### 4.2 BrowserLauncher

[session/browser-launcher.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/browser-launcher.ts) 当前提供：

- `BrowserLauncher` 接口
- `PlaywrightBrowserLauncher` 默认实现

它会根据 `BrowserProfile.browser` 选择 `chromium`、`firefox` 或 `webkit`，并使用 `headless` 配置启动浏览器。

### 4.3 SessionManager

[session/session-manager.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/session/session-manager.ts) 负责把 `CompiledWebPlan` 转成 `ExecutionSession`：

- 传递 viewport
- 传递 storage state
- 注入 runtime variables

这保证浏览器尺寸、存储态和变量上下文不会在 worker 层丢失。

## 五、结果发布边界

### 5.1 ResultPublisher

[reporting/types.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/reporting/types.ts) 只定义一个边界：

- `publish(result: WebWorkerResult): Promise<void>`

这样后续可以替换成：

- HTTP 上报
- RabbitMQ/Kafka 事件发布
- 数据库存储
- 文件归档

### 5.2 NoopResultPublisher

[noop-publisher.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/reporting/noop-publisher.ts) 目前只是测试和骨架阶段的默认实现，用于收集已发布结果，便于运行流验证。

## 六、Bootstrap 与测试夹具

### 6.1 createWebWorker

[create-worker.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/bootstrap/create-worker.ts) 当前把默认依赖装配起来：

- `DefaultDslCompiler`
- `RegistryBasedPlaywrightAdapter`
- `NoopResultPublisher`
- `PlaywrightBrowserLauncher`

这已经构成单进程 worker 的最小装配入口。

### 6.2 Fixture

[testing/fixture.ts](/home/jianghua519/ai-web-testing-platform-v2/apps/web-worker/src/testing/fixture.ts) 提供最小 job fixture，便于后续 CLI、测试和 smoke run 复用。

## 七、本轮真实运行验证

本轮除了 `typecheck` 外，还执行了一次真实的 `WebJobRunner.run()` 运行流：

- 输入使用 `createWebWorkerJobFixture()`。
- 运行时使用 `FakeBrowserLauncher`，返回 duck-typed `browser/context/page` 对象。
- 实际执行了 compile、session 创建、adapter 调用、结果发布。
- 最终输出为：
  - `status=executed`
  - `planStatus=passed`
  - step `open-home` 为 `passed`

这个验证证明：

- worker 主链路代码已经可运行。
- compile 与 execute 之间的对象边界是通的。
- 结果发布链路是通的。

同时必须明确：

- 这不是容器内验证。
- 这也不是真实浏览器 E2E，因为本轮没有拉起真实 Playwright 浏览器二进制。

## 风险

- 当前 worker 还是单进程骨架，没有任务拉取、并发控制、心跳、取消和租约机制。
- 真实浏览器执行依赖系统环境与浏览器二进制，本轮没有覆盖。
- 当前 `ResultPublisher` 还是骨架接口，没有真正接到控制面或消息总线。

## 验证计划

- 运行 `npm install`。
- 运行 `npm run typecheck`。
- 运行一次真实 `WebJobRunner.run()` 流程，记录输出结果。
- 运行 `bash ./scripts/validate_docs.sh` 与 `bash ./scripts/validate_contracts.sh`。
- 检查仓库中是否存在容器或服务运行入口，并明确记录缺失。
