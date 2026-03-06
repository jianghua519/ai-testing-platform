---
title: playwright-adapter 代码骨架设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明本轮如何把 Playwright 适配层的模块设计落成实际 TypeScript 包、执行器注册表和运行时执行骨架。
---

# playwright-adapter 代码骨架设计说明

## 背景

前一轮已经明确了 `playwright-adapter` 的目标、目录结构和关键接口，但仓库中还没有任何真实执行层代码。当前如果直接做 `web-worker`，会遇到一个明显问题：

- worker 可以拿到 `CompiledWebPlan`
- 但没有任何适配层把 `CompiledStep` 转成实际 Playwright 行为

因此本轮先把适配层单独落成包，让运行时边界先稳定下来。

## 设计目标

- 把 `playwright-adapter` 变成独立 TypeScript workspace 包。
- 落地 `registry + execution engine + action executor` 的执行模型。
- 让 `CompiledWebPlan` 已经能被一个稳定接口消费。
- 给后续 `web-worker` 和真实浏览器会话接入预留清晰边界。

## 一、包结构落地

本轮新增目录：

```text
packages/playwright-adapter/
  src/types.ts
  src/index.ts
  src/runtime/
  src/locators/
  src/actions/
  src/assertions/
  src/extractors/
  src/artifacts/
  src/result/
  src/testing/
```

关键文件：

- [package.json](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/package.json)
- [tsconfig.json](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/tsconfig.json)
- [types.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/types.ts)
- [runtime/adapter.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/adapter.ts)
- [runtime/execution-engine.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/execution-engine.ts)
- [runtime/session-factory.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/session-factory.ts)

## 二、核心接口落地

核心接口位于 [types.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/types.ts) ：

- `RuntimeVariableStore`
- `ArtifactCollector`
- `ExecutionClock`
- `ExecutionSession`
- `StepExecutionOutput`
- `PlanExecutionOutput`
- `StepExecutionDriver`
- `StepExecutor`
- `StepExecutorRegistry`
- `PlaywrightAdapter`

设计意图：

- `ExecutionSession` 统一收口 browser/context/page/variables/artifacts/clock。
- `StepExecutionDriver` 让 control-flow executor 可以递归执行子节点，而不是直接耦合引擎实现。
- `StepExecutorRegistry` 保持动作扩展能力，避免总控类膨胀。

## 三、执行引擎落地

### 3.1 RegistryBasedPlaywrightAdapter

[adapter.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/adapter.ts) 提供 `RegistryBasedPlaywrightAdapter`：

- 默认创建 `BasicStepExecutorRegistry`
- 自动注册基础 executor
- 对外暴露 `executePlan()` 和 `executeStep()`

### 3.2 ExecutionEngine

[execution-engine.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/execution-engine.ts) 负责：

- 逐 step 调用 registry resolver
- 递归执行 children
- 统一执行 assertion
- 在 branch 不满足时构造 skipped 结果树
- 构造 `PlanExecutionOutput`

这层故意不处理任务拉取、消息回传和进程生命周期，那是 `web-worker` 的职责。

## 四、运行时会话落地

### 4.1 SessionFactory

[session-factory.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/session-factory.ts) 当前提供最小实现：

- 接收 `playwright-core` 的 `Browser`
- 创建 `BrowserContext`
- 创建 `Page`
- 初始化内存变量存储、空 artifact collector 和系统时钟

这意味着后续 `web-worker` 只要负责拿到 `Browser`，就能把执行会话交给 adapter。

### 4.2 VariableStore

[variable-store.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/variable-store.ts) 当前是内存实现：

- `get`
- `set`
- `snapshot`
- `resolve`

它已经足够支撑 `input` 和 `foreach` 的运行时变量读取。

## 五、locator、assertion 与 extraction 落地

### 5.1 LocatorFactory

[locator-factory.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/locators/locator-factory.ts) 已支持这些策略：

- `role`
- `text`
- `label`
- `placeholder`
- `test_id`
- `css`
- `xpath`

[frame-resolver.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/locators/frame-resolver.ts) 提供 frame path 穿透，保证后续 iframe 场景有扩展点。

### 5.2 AssertionExecutor

[assertion-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/assertions/assertion-executor.ts) 当前支持：

- `visible`
- `hidden`
- `text_equals`
- `text_contains`
- `value_equals`
- `attr_equals`
- `url_contains`

这里没有引入 `@playwright/test` 的 `expect`，而是先用 `playwright-core` 原生 API + 显式错误，保持依赖最小。

### 5.3 BasicExtractor

[basic-extractor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/extractors/basic-extractor.ts) 是占位级实现：

- 如果有 locator，就提取 textContent
- 否则回退到页面 URL
- 结果写回 runtime variable store

当前还没有单独的 extraction schema，所以这里只提供最小运行闭环。

## 六、action executor 落地

本轮已落这些 executor：

- [open-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/open-executor.ts)
- [click-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/click-executor.ts)
- [input-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/input-executor.ts)
- [wait-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/wait-executor.ts)
- [assert-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/assert-executor.ts)
- [extract-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/extract-executor.ts)
- [group-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/group-executor.ts)
- [branch-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/branch-executor.ts)
- [loop-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/loop-executor.ts)

### 6.1 当前能力边界

已经具备的能力：

- 基础导航、点击、输入、等待、断言、提取。
- group / branch / loop 的骨架级控制流执行。
- 统一错误标准化。
- 统一 step / plan result 生成。

未覆盖的能力：

- `select`
- `hover`
- `upload`
- `press`
- screenshot / trace / video / network 的真实采集
- popup、多 tab、download、request interception

这是刻意的 Phase 1 范围控制。

## 七、结果与证据归口

[result/step-result-builder.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/result/step-result-builder.ts) 与 [result/plan-result-builder.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/result/plan-result-builder.ts) 已经把结果归口下来：

- step 结果统一含 `status`、开始结束时间、耗时、artifact、提取变量、错误码。
- plan 结果统一按 step 结果聚合 `passed/failed`。

[artifacts/artifact-collector.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/artifacts/artifact-collector.ts) 当前是 `NoopArtifactCollector`，只保留接口，不做真实采集。

## 八、根工作区更新

根 `typecheck` 脚本已纳入 `playwright-adapter`：

- [package.json](/home/jianghua519/ai-web-testing-platform-v2/package.json)

本轮新增运行时依赖：

- `playwright-core`

## 风险

- 当前 adapter 能 typecheck，但不能被误解为已完成真实 E2E 产品化。
- `extract` 还没有独立 schema，因此当前提取语义比较保守。
- artifact 采集和更多 action 还没接入，后续要继续补。
- 当前仓库无容器入口和 `web-worker`，本轮无法完成真实任务驱动验证。

## 验证计划

- 运行 `npm install`。
- 运行 `npm run typecheck`。
- 运行 `bash ./scripts/validate_docs.sh` 和 `bash ./scripts/validate_contracts.sh`。
- 检查仓库中是否存在容器和服务入口，并明确记录缺失。
