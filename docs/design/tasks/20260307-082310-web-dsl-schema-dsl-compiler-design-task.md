---
title: web-dsl-schema 与 dsl-compiler 代码骨架设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明本轮如何把 Web DSL 共享模型和编译器设计落成实际 TypeScript workspace 与最小可编译实现。
---

# web-dsl-schema 与 dsl-compiler 代码骨架设计说明

## 背景

前几轮已经完成了以下设计工作：

- Web step DSL 的字段约束、状态机和示例集合。
- DSL 编译规则和 Playwright 执行映射表。
- `dsl-compiler` 与 `playwright-adapter` 的模块边界和包结构。

当前真正的缺口不是再写一轮设计，而是把这些设计落成仓库中的真实代码骨架。没有代码骨架，后续的 Playwright adapter、worker、schema 演进和测试都无从挂靠。

## 设计目标

- 建立一个可扩展的 TypeScript workspace。
- 把共享模型沉淀到 `web-dsl-schema`。
- 把编译管线沉淀到 `dsl-compiler`。
- 让后续实现能在现有骨架上继续迭代，而不是重新搭目录。

## 一、根工作区落地

本轮新增根级配置文件：

- [package.json](/home/jianghua519/ai-web-testing-platform-v2/package.json)
- [tsconfig.base.json](/home/jianghua519/ai-web-testing-platform-v2/tsconfig.base.json)
- [.gitignore](/home/jianghua519/ai-web-testing-platform-v2/.gitignore)

设计意图：

- 用 npm workspace 管理后续多个 TypeScript 包。
- 用共享 `tsconfig` 锁定 `ES2022 + NodeNext + strict`。
- 用 `paths` 映射支撑包间类型引用。
- 只做 `typecheck`，暂时不引入 bundler、lint 和 test runner，避免过早扩张。

## 二、web-dsl-schema 包落地

### 2.1 包职责

`web-dsl-schema` 用来承载所有跨模块共享的数据结构，不依赖 Playwright、不依赖 Go 控制面。

### 2.2 当前目录

```text
packages/web-dsl-schema/
  src/source/types.ts
  src/compiled/types.ts
  src/result/types.ts
  src/errors/codes.ts
  src/versioning/schema-version.ts
  src/index.ts
```

### 2.3 当前已落模型

源 DSL 模型位于 [source/types.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/web-dsl-schema/src/source/types.ts) ，包括：

- `BrowserProfile`
- `EnvProfile`
- `DatasetRecord`
- `LocatorDraft`
- `StepInputDraft`
- `AssertionDraft`
- `RuntimeHookDraft`
- `WebStepDraft`
- `WebStepPlanDraft`

编译产物模型位于 [compiled/types.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/web-dsl-schema/src/compiled/types.ts) ，包括：

- `CompileIssue`
- `ResolvedLocator`
- `ResolvedInput`
- `CompiledAssertion`
- `RuntimeHook`
- `CompiledStep`
- `CompileDigest`
- `CompiledWebPlan`

执行结果模型位于 [result/types.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/web-dsl-schema/src/result/types.ts) ，包括：

- `ArtifactReference`
- `ExtractedVariable`
- `StepResult`
- `PlanExecutionResult`

错误码与版本位于：

- [codes.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/web-dsl-schema/src/errors/codes.ts)
- [schema-version.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/web-dsl-schema/src/versioning/schema-version.ts)

### 2.4 当前边界判断

这层已经满足“共享 schema 包”的最低要求：

- 可以给 `dsl-compiler` 使用。
- 后续可以给 `playwright-adapter` 使用。
- 还没有引入 JSON Schema 生成和版本迁移逻辑，这部分留到下一轮。

## 三、dsl-compiler 包落地

### 3.1 包职责

`dsl-compiler` 负责把 `WebStepPlanDraft` 编译为 `CompiledWebPlan`。它只处理静态语义和执行绑定，不做浏览器 I/O。

### 3.2 当前目录

```text
packages/dsl-compiler/
  src/index.ts
  src/types.ts
  src/context.ts
  src/compiler.ts
  src/phases/
    schema-validate.ts
    normalize.ts
    inject-defaults.ts
    resolve-references.ts
    lower-control-flow.ts
    bind-execution.ts
    finalize.ts
  src/resolvers/
    locator-resolver.ts
    variable-resolver.ts
  src/binders/
    step-binder.ts
  src/diagnostics/
    collector.ts
  src/emitters/
    build-compile-response.ts
  src/testing/
    fixture.ts
```

### 3.3 当前已落接口

关键接口位于 [types.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/dsl-compiler/src/types.ts) ：

- `CompileOptions`
- `CompileStats`
- `CompileRequest`
- `CompileResponse`
- `NormalizedPlan`
- `NormalizedStep`
- `CompileContext`
- `DslCompiler`

默认编译器位于 [compiler.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/dsl-compiler/src/compiler.ts) ：

- `DefaultDslCompiler.compile()`
- `DefaultDslCompiler.validate()`

### 3.4 当前已落 phase

当前 pipeline 已真实存在于代码中：

1. `schemaValidate`
2. `normalize`
3. `injectDefaults`
4. `resolveReferences`
5. `lowerControlFlow`
6. `bindExecution`
7. `finalize`

这些 phase 已经按独立文件拆开，便于后续逐个增强，而不是写成一个超长函数。

### 3.5 当前已落能力

已实现的最小能力：

- 基础 schema 校验：plan id、plan name、viewport、step id 唯一性、`foreach.loopSourceRef`。
- plan / step 默认值注入。
- 变量表初始化。
- locator 解析和稳定性分级。
- step 到 `CompiledStep` 的最小 binding。
- `CompiledWebPlan` 与 `CompileDigest` 生成。
- diagnostics 聚合与 `CompileResponse` 输出。

### 3.6 有意保留的空位

本轮没有试图一次做完所有编译语义，保留了这些空位：

- `if/foreach/group` 的真实 lowering 仍是骨架级 no-op。
- `secret_ref` / `file_ref` 还没有接入真实 resolver。
- 没有 JSON Schema 校验器。
- 没有插件机制。
- 没有编译快照测试。

这是刻意控制范围。现阶段先保证结构对，再逐步增强具体语义。

## 四、验证入口

本轮新增的主要验证入口有两个：

- `npm run typecheck`
- `make typecheck`

对应更新：

- [README.md](/home/jianghua519/ai-web-testing-platform-v2/README.md)
- [Makefile](/home/jianghua519/ai-web-testing-platform-v2/Makefile)

## 五、为什么这样收敛

这轮没有同时做 `playwright-adapter`、`web-worker`、`JSON Schema`、`Vitest`，原因很明确：

- 当前仓库刚从纯文档仓库切入代码，如果同时引入太多运行时模块，边界会再次失控。
- `web-dsl-schema` 和 `dsl-compiler` 是最硬的前置依赖，先落它们后，后续模块才有稳定输入输出。
- 先把 `tsc` 跑通，可以保证后续不是在不稳定基础上叠加功能。

## 风险

- 当前 compiler 仍是最小骨架，不应被误解为生产可用编译器。
- 由于没有容器入口，本轮只能用 host 侧 TypeScript 校验，不能满足 skill 中“容器内验证”的理想要求。
- 还没有 runtime 级验证，不能证明编译结果已经可被 Playwright 执行。

## 验证计划

- 运行 `npm install` 安装 TypeScript 依赖。
- 运行 `npm run typecheck` 验证 workspace 和包间引用。
- 运行 `bash ./scripts/validate_docs.sh` 和 `bash ./scripts/validate_contracts.sh`。
- 检查仓库中是否存在容器或服务启动入口，并明确记录缺失。
