---
title: 录屏到报告能力调研与 GAP 分析设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 基于参考仓库拆解录制、分析、资产化、执行、比对和报告链路，评估当前 V2 原型的能力缺口，并给出适配现有架构的落地建议。
---

# 录屏到报告能力调研与 GAP 分析设计说明

## 背景

当前仓库已经完成一条比较扎实的最小执行闭环：

- `control-plane` 能接收 `inline_web_plan` 形式的运行请求，负责任务入队、agent lease、运行控制和结果投影。
- `web-worker` 能编译 `WebStepPlanDraft`，驱动 Playwright 执行，并真实采集 `screenshot / trace / video`。
- artifact 已支持对象存储上传、下载和保留期清理。

但用户要实现的目标不是“继续增强执行闭环”这么简单，而是把平台推进到“从录制到测试资产，再到执行、对比、报告”的完整链路。参考仓库 `/home/jianghua519/ai-web-testing-platform` 已经覆盖了这条链路的大部分能力，因此本次重点不是重新发明概念，而是回答两个问题：

1. 当前仓库已经具备哪些底座，可以直接复用？
2. 哪些能力在当前仓库里仍是空白、占位契约或设计缺口？

## 调研样本

本次主要对照了以下实现和契约：

- 当前仓库
  - [contracts/openapi.yaml](/home/jianghua519/ai-testing-platform/contracts/openapi.yaml)
  - [docs/v2/c4.md](/home/jianghua519/ai-testing-platform/docs/v2/c4.md)
  - [apps/control-plane/src/runtime/control-plane-server.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-server.ts)
  - [apps/control-plane/src/runtime/postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [apps/web-worker/src/job-runner/web-job-runner.ts](/home/jianghua519/ai-testing-platform/apps/web-worker/src/job-runner/web-job-runner.ts)
  - [packages/web-dsl-schema/src/source/types.ts](/home/jianghua519/ai-testing-platform/packages/web-dsl-schema/src/source/types.ts)
  - [packages/dsl-compiler/src/resolvers/variable-resolver.ts](/home/jianghua519/ai-testing-platform/packages/dsl-compiler/src/resolvers/variable-resolver.ts)
- 参考仓库
  - [services/orchestrator/internal/handler/recording_handler.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/handler/recording_handler.go)
  - [services/orchestrator/internal/domain/test_case.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/domain/test_case.go)
  - [services/orchestrator/internal/repository/ddt_repository.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/repository/ddt_repository.go)
  - [services/orchestrator/internal/handler/run_handler.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/handler/run_handler.go)
  - [services/orchestrator/internal/handler/report_job_handler.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/handler/report_job_handler.go)
  - [services/reporting-service/src/index.ts](/home/jianghua519/ai-web-testing-platform/services/reporting-service/src/index.ts)
  - [services/reporting-service/src/run-events.ts](/home/jianghua519/ai-web-testing-platform/services/reporting-service/src/run-events.ts)
  - [services/runner/recorder.py](/home/jianghua519/ai-web-testing-platform/services/runner/recorder.py)
  - [local-agent/src/recorderServer.ts](/home/jianghua519/ai-web-testing-platform/local-agent/src/recorderServer.ts)

## 当前仓库基线判断

### 1. 已有能力

当前仓库已经有三块很有价值的底座，可以直接承接后续建设：

- 执行内核已经存在：
  - `web-worker -> dsl-compiler -> playwright-adapter` 这一层可以真正跑起来，不是纸面设计。
- 结果与 artifact 闭环已经存在：
  - step 级结果、run / run_item 投影、artifact 上传下载与保留期都已经打通。
- 多租户和运行控制约束已经存在：
  - 当前 `control-plane` 已经围绕 tenant / project、pause / resume / cancel、agent capability 做了正式化处理。

这意味着后续实现“资产化执行、结果对比、报告生成”时，不需要再重建执行引擎。

### 2. 关键缺口

### 2.1 当前仓库只有“执行输入”，没有“测试资产”

[contracts/openapi.yaml](/home/jianghua519/ai-testing-platform/contracts/openapi.yaml) 中 `RunSelection.kind` 目前只有 `inline_web_plan`。这说明当前控制面只接受“把计划内联提交上来然后直接执行”，没有以下正式实体：

- recording
- test case
- test case version
- suite / plan item
- dataset / data row

这会直接导致“录制后沉淀为测试 case”和“按 case / 数据行执行”两件事都无处落地。

### 2.2 当前仓库的 `video` 是执行 artifact，不是录制能力

README 和 worker 代码里已经支持 `video` 采集，但它的语义是“执行过程录像证据”，不是“把用户操作录成事件并转成测试资产”。

两者的差别是：

- 执行视频：
  - 在测试运行时由 runner 自动产出，用于取证和失败回放。
- 录制能力：
  - 需要把交互事件、页面上下文、截图、可选 trace 持久化为 recording。
  - recording 还要经过 AI / 规则分析，才能生成测试 case 与测试数据模板。

如果把这两件事混为一谈，后续的数据模型和 API 设计会走偏。

### 2.3 数据集类型是“占位”，还没有真正接入执行链路

[packages/web-dsl-schema/src/source/types.ts](/home/jianghua519/ai-testing-platform/packages/web-dsl-schema/src/source/types.ts) 定义了 `DatasetRecord`，但：

- [packages/dsl-compiler/src/resolvers/variable-resolver.ts](/home/jianghua519/ai-testing-platform/packages/dsl-compiler/src/resolvers/variable-resolver.ts) 当前只会注入：
  - `sourcePlan.variables`
  - `envProfile.variables`
  - `variableContext`
- `dataset` 没有参与变量种子合并。
- [apps/web-worker/src/job-runner/web-job-runner.ts](/home/jianghua519/ai-testing-platform/apps/web-worker/src/job-runner/web-job-runner.ts) 也只把 `variableContext` 传给编译器。

这说明“测试数据”在当前仓库里只是 schema 级预留，并没有成为真正的数据驱动执行能力。

### 2.4 报告契约已经写入 OpenAPI，但运行时未实现

[contracts/openapi.yaml](/home/jianghua519/ai-testing-platform/contracts/openapi.yaml) 已经定义：

- `POST /api/v1/report-jobs`
- `GET /api/v1/report-jobs/{report_job_id}`
- `GET /api/v1/report-jobs/{report_job_id}/download`

但在 [apps/control-plane/src/runtime/control-plane-server.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-server.ts) 和 `postgres-control-plane-store` 中没有对应路由和存储实现。

这不是“完全没有报告设计”，而是“契约先行了，但实现还空着”。这是一个明确的 P0 GAP，因为它已经形成了契约/实现漂移。

### 2.5 当前仓库没有录制工作台、资产管理 UI 和报告中心 UI

当前仓库没有 `web-app` 一类前端应用。即使后端补齐 recording / case / report API，用户仍然没有：

- 录制页面
- 分析结果确认页
- case / dataset 管理页
- compare 页
- report center

因此如果目标是“平台功能可用”，前端本身也是独立能力缺口，而不是纯后端补几个接口就能完成。

## 参考仓库能力拆解

### 1. 录制能力

参考仓库实际上有两套录制入口：

- 本地 agent 手工录制
  - [local-agent/src/recorderServer.ts](/home/jianghua519/ai-web-testing-platform/local-agent/src/recorderServer.ts)
  - 提供 `/start`、`/action`、`/stop`、`/events/{session}` 接口。
  - 能采集事件、截图、HTML、trace。
- 服务端自动探索录制
  - [services/runner/recorder.py](/home/jianghua519/ai-web-testing-platform/services/runner/recorder.py)
  - 提供 `/auto-explore/start` 等能力。
  - 基于 Playwright 自动探索页面，生成事件、截图和 trace。

这说明参考仓库并没有把“录制”简化成单一形态，而是区分了：

- 本机真实操作录制
- 云端自动探索录制

这两种形态的成本和依赖完全不同。

### 2. 录制分析提取测试 case / 测试数据

参考仓库的主入口是：

- `POST /api/v1/recordings/{id}/analyze-dsl`

[services/orchestrator/internal/handler/recording_handler.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/handler/recording_handler.go) 会：

- 读取 recording events
- 调用 AI 服务 `generate_dsl_from_recording`
- 持久化 `dsl_plan + structured_plan + data_template`
- 通过 recording analysis events 输出分析进度

同时：

- [services/reporting-service/src/run-events.ts](/home/jianghua519/ai-web-testing-platform/services/reporting-service/src/run-events.ts)
- [services/reporting-service/src/index.ts](/home/jianghua519/ai-web-testing-platform/services/reporting-service/src/index.ts)

提供了：

- `GET /api/v1/recordings/{recordingId}/analysis/events`
- `GET /api/v1/recordings/{recordingId}/analysis/stream`

也就是说，参考仓库把“录制分析”做成了一个异步、可追踪的流水线，而不是同步返回一个大 JSON。

### 3. 测试 case 资产化与版本

[services/orchestrator/internal/domain/test_case.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/domain/test_case.go) 中，测试 case 已经是正式领域对象，包含：

- case 基本元数据
- version
- `dsl_plan`
- `structured_plan`
- `data_template`
- `source_recording_id`

同时有：

- `test_case_versions`
- 版本 diff
- 版本恢复
- 审批状态流

这使得“录制生成的用例”和“人工继续修改的用例”可以被纳入同一个资产体系。

### 4. 测试数据模板与数据行

参考仓库把测试数据拆成两层：

- case 级 `data_template`
- case 级 `data rows`

[services/orchestrator/internal/repository/ddt_repository.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/repository/ddt_repository.go) 和对应 handler 支持：

- 模板读取
- 数据行 CRUD
- CSV 模板导出 / 导入校验 / 导入提交

并且 recording 发布为 case 时，会自动创建默认模板和默认数据行。

### 5. 执行能力

参考仓库的执行已经不是“只跑 inline plan”，而是“围绕资产执行”：

- 按 case 执行
- 按 suite 执行
- 按 execution plan 执行
- run_item 带有 `case_version_id / dataset_row_id`

[services/orchestrator/internal/service/parallel_executor.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/service/parallel_executor.go) 里会从 case 的 `data_template.default_row` 生成运行时数据，再交给 runner。

这意味着执行结果天然可追溯到：

- 是哪个 case 版本
- 用的是哪条数据
- 来自哪个 recording

### 6. 结果对比

参考仓库至少有两类比对能力：

- run compare
  - [services/orchestrator/internal/handler/run_handler.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/handler/run_handler.go)
  - `POST /api/v1/runs/compare`
  - 支持 baseline / candidate 对齐，区分 `regression / fixed / unchanged_failed / changed_failed / new_item / missing_item`
- case version diff
  - `GET /api/v1/test-cases/{id}/versions/diff`

这让平台不仅能展示“这次跑挂了没有”，还能展示“相比上次到底变差了还是变好了”。

### 7. 报告生成

参考仓库的报告链路包含：

- report definitions
- report jobs
- report artifacts
- reporting-service 渲染与下载

[services/orchestrator/internal/handler/report_job_handler.go](/home/jianghua519/ai-web-testing-platform/services/orchestrator/internal/handler/report_job_handler.go) 负责 report job 生命周期，[services/reporting-service/src/index.ts](/home/jianghua519/ai-web-testing-platform/services/reporting-service/src/index.ts) 负责汇总 `run / run_items / step_results` 并生成 xlsx artifact。

这里的关键不是 xlsx 本身，而是它已经形成了：

- 输入对象选择
- 生成任务
- 存储 artifact
- 下载入口

这与当前仓库 OpenAPI 中已经定义但尚未实现的 `report-jobs` 契约是能对上的。

## GAP 总结

| 能力域 | 参考仓库现状 | 当前仓库现状 | GAP 级别 | 建议落点 |
| --- | --- | --- | --- | --- |
| 录制接入 | 有本地 agent 手工录制，也有云端 auto-explore | 没有 recording 领域、没有 recorder service、没有本地 agent | P0 | 新增 `recordings` 领域；第一阶段优先服务端录制，后续再评估本地 agent |
| 录制持久化 | recording 持久化 events、截图、trace、状态、analysis meta | 只有执行 artifact，没有 recording 表和状态机 | P0 | control-plane 新增 recording 表、analysis events 表、artifact 关联 |
| 录制分析 | `analyze-dsl` 调 AI 生成 `dsl_plan + structured_plan + data_template`，支持 SSE | 没有 recording 分析 API，也没有异步分析进度流 | P0 | 新增 analysis job / event 流；初期可先用 control-plane + DB 事件流，不必先引入 MQ |
| 测试 case 资产化 | case、version、source_recording、审批、diff、restore 完整 | 只有 inline plan 执行，没有 case 领域 | P0 | control-plane 新增 `test_cases / test_case_versions`，并以当前 `WebStepPlanDraft` 作为源格式 |
| 测试数据资产化 | `data_template` + data rows + import/export/validate | `DatasetRecord` 只停留在 schema，占位未接通 | P0 | 新增 `case_data_templates / case_data_rows`，并把数据行真正接入变量解析 |
| 资产化执行入口 | 支持按 case / suite / plan 执行，run_item 绑定 case_version / dataset_row | `RunSelection.kind` 只有 `inline_web_plan` | P0 | 扩展 run selection 和 run_item 投影，优先支持 `case_version` |
| 结果对比 | run compare + compare history + case version diff | 没有 compare API、没有 compare 结果存档 | P1 | 增加 `/api/v1/runs/compare` 和 compare snapshot 持久化 |
| 报告任务与渲染 | report job + artifact + xlsx 下载可用 | OpenAPI 已有 `report-jobs`，但运行时未实现 | P0 | 先补齐现有 `report-jobs` 契约，再扩展格式和模板 |
| 前端工作台 | recording、case、suite、report、compare 全有 UI | 当前仓库没有 web UI | P1 | 需要新增前端应用或管理控制台，至少补录制、case、report 三个入口 |
| 技术栈与服务拆分 | Go + Python + Node + local-agent | 当前仓库是 TS monorepo + Node runtime | P0 | 只借鉴行为和数据模型，不直接照搬服务栈 |

## 适配当前仓库的设计建议

### 1. 不要直接照搬参考仓库的数据模型

参考仓库保留了 `dsl_plan + structured_plan` 双表示，是因为它自己的 runner 依赖这套结构。当前仓库已经有：

- [packages/web-dsl-schema/src/source/types.ts](/home/jianghua519/ai-testing-platform/packages/web-dsl-schema/src/source/types.ts)
- [packages/dsl-compiler](/home/jianghua519/ai-testing-platform/packages/dsl-compiler)

因此更适合的做法是：

- `test_case.source_plan_json`
  - 使用当前仓库的 `WebStepPlanDraft`
- `test_case.data_template_json`
  - 存 extracted variables schema / default row
- `test_case.analysis_meta_json`
  - 存录制分析的中间结果、置信度、候选步骤等
- `compiled_plan`
  - 只做缓存或执行时即时生成，不必作为主资产格式

换句话说，参考仓库要学的是“录制 -> 分析 -> 资产化”的业务流程，不是它那套 DSL 表示法本身。

### 2. 报告能力优先补齐现有契约，不建议再起一套新接口

当前仓库 OpenAPI 已经定义了 `report-jobs`。因此报告的第一阶段建议是：

- 直接兑现现有契约
- 用当前已有的 `runs / run_items / step_events / artifacts` 做渲染输入
- 先产出 `json` 和 `xlsx`
- 下载沿用当前 artifact blob store / signed URL 机制

这样既能尽快交付，也能消除契约漂移。

### 3. 录制能力建议分两阶段

### 阶段 A：先做服务端录制 / 自动探索

原因：

- 当前仓库没有桌面 agent 和浏览器插件体系。
- 当前仓库技术栈以 TypeScript 为主，更适合新增一个 TS 的 `apps/recording-service`，直接复用 Playwright。
- 这一步就足以打通“录制 -> 分析 -> case”主链路。

### 阶段 B：如果确实需要录制用户本机真实操作，再补 local-agent

这一步的成本明显更高，需要额外解决：

- agent 注册与发现
- 浏览器本地权限
- 插件 / bridge
- 网络回传与安全边界

因此它不应该作为第一阶段的前置条件。

### 4. 数据驱动执行不要再停留在 schema 预留

后续实现时至少要打通下面这条链路：

1. case 绑定 `data_template`
2. 录制分析默认生成 `default_row`
3. data rows 持久化为正式实体
4. 执行前按 `case_version x dataset_row` 展开 run_item
5. 将 `dataset_row.values` 注入 `variableContext`
6. 编译器真正合并这部分变量

如果做不到第 5 步，所谓“提取测试数据”和“数据驱动执行”都只是静态文档字段。

## 分阶段落地建议

### Phase 1：补齐业务资产与报告最小闭环

目标：

- 不做录制，先把“资产化执行 + 报告任务”基础设施补齐。

范围：

- `test_cases`
- `test_case_versions`
- `case_data_templates`
- `case_data_rows`
- `report_jobs`
- `report_artifacts`
- `RunSelection.kind` 扩展到 `case_version`
- 报告 job 运行时实现

结果：

- 当前仓库从“只能跑 inline plan”升级到“能跑正式 case 资产，并能生成报告”。

### Phase 2：接入 recording 与 analyze-dsl

目标：

- 打通“录制 -> AI 提取 -> 发布成 case”。

范围：

- `recordings`
- recording analysis events
- `POST /api/v1/recordings`
- `POST /api/v1/recordings/{id}/analyze`
- `POST /api/v1/recordings/{id}/publish-case`
- 默认数据模板 / 默认数据行自动创建

结果：

- 用户可以从 recording 直接生成 case 和测试数据模板。

### Phase 3：补 run compare 与版本差异

目标：

- 把“跑完一批”提升到“知道和基线相比发生了什么变化”。

范围：

- `POST /api/v1/runs/compare`
- compare history
- case version diff
- 报告中引用 compare 结果

结果：

- 可以识别 regression / fixed，而不只是看 pass / fail。

### Phase 4：补前端工作台

目标：

- 把后端能力变成可操作的平台。

范围：

- recording center
- case & dataset center
- compare page
- report center

结果：

- 平台具备接近参考仓库的完整操作链路。

## 风险与注意事项

- 最大风险不是单个 API，而是领域模型升级：
  - 一旦引入 `recordings / test_cases / data_rows / report_jobs`，当前仓库就从“运行时原型”升级为“资产平台”，数据模型和租户隔离都要同步升级。
- 参考仓库的多服务拆分不宜直接照搬：
  - 当前仓库没有 RabbitMQ、Web UI、Go orchestrator、Python recorder/runner 体系，照搬会让演进成本显著抬高。
- 当前仓库的 tenant schema 策略必须继续沿用：
  - 新增 recording、case、dataset、report 相关表时，也要遵守现有 tenant 边界，而不是回退到共享 public 表。
- 录制分析一定要保留人工确认环节：
  - AI 从 recording 提取 case / 数据模板天然存在误差，不建议直接“自动发布为可执行正式用例”。

## 结论

如果只看执行引擎，当前仓库已经不弱；真正缺的是“测试资产层”和“作者工作台”。

最关键的三个结论是：

1. 当前仓库已经有执行、artifact、租户和运行控制底座，不需要重做 runner。
2. 当前仓库缺失 recording / case / dataset / compare / report runtime，大部分目标能力仍然停留在占位或契约层。
3. 实现时应复用当前仓库的 `WebStepPlanDraft + compiler + worker` 体系，只借鉴参考仓库的业务流程，不直接照搬它的 Go/Python/Node 多服务栈。

这意味着后续真正的实现顺序应是：

- 先补资产域和报告契约落地
- 再接 recording 与 analyze-dsl
- 再补 compare 和 UI

而不是反过来先做一个很重的录制前端，再回头补数据模型。
