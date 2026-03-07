---
title: LangGraph 驱动的 AI 测试编排与对话助手设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 基于现有 control-plane、recording、test case、run 和 step override 能力，引入 LangGraph、Playwright MCP 与记忆层，实现自动探索录屏、录屏转 case、自愈执行、结果分析和对话式助手。
---

# LangGraph 驱动的 AI 测试编排与对话助手设计说明

## 背景

当前仓库已经具备三块关键底座：

- recording / analysis / publish-test-case 主链路已存在：
  - [apps/control-plane/src/runtime/control-plane-server.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-server.ts)
  - [scripts/run_test_asset_phase2_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_test_asset_phase2_compose_smoke.mjs)
- test case version 执行、artifact 落库、对象存储与回放链路已存在：
  - [apps/control-plane/src/runtime/postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [apps/web-worker/src/job-runner/web-job-runner.ts](/home/jianghua519/ai-testing-platform/apps/web-worker/src/job-runner/web-job-runner.ts)
- step 级远程控制能力已存在，可在 step 边界执行 `pause / skip / replace / cancel`：
  - [apps/control-plane/src/runtime/control-plane-server.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-server.ts)
  - [apps/web-worker/src/control/http-step-controller.ts](/home/jianghua519/ai-testing-platform/apps/web-worker/src/control/http-step-controller.ts)
  - [docs/design/tasks/20260307-091146-step-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-091146-step-design-task.md)

所以这次设计的重点不是重写执行内核，而是补一层 AI 编排与交互能力，让平台从“可执行”升级成“可理解、可探索、可自愈、可对话”。

## 需求映射

用户目标可以拆成 6 条：

0. 理解需求，并记住。
1. 根据指示以及记忆，使用 Playwright MCP 自动探索业务画面，并录屏。
2. 分析录屏，得到测试 case。
3. 对失败 step 做自愈执行。
4. 自动分析测试结果是否符合预期。
5. 提供一个 chatbot，能基于记忆或通过 MCP 回答问题、做出动作。

本设计默认以下边界：

- AI 不直接替代 `web-worker` 的确定性执行器。
- AI 可以编排探索、分析、恢复和解释，但执行事实仍落在 `control-plane + run + run_item + step_event + artifact`。
- AI 生成或修复的 case 默认只能形成 draft，不直接覆盖已发布版本。
- 高风险动作要支持 interrupt / 人工确认，而不是全自动放行。

## 外部能力依据

本设计依赖的 LangGraph / LangChain / Playwright MCP 官方能力如下：

- LangGraph 提供 long-running、durable agent 工作流，适合把探索、分析、自愈、对话拆成持久化图执行。
  - https://docs.langchain.com/oss/javascript/langgraph/overview
  - https://docs.langchain.com/oss/javascript/langgraph/durable-execution
- LangGraph 提供 thread-level memory 与 long-term memory 机制，适合实现“记住需求”和跨会话复用事实。
  - https://docs.langchain.com/oss/javascript/langgraph/add-memory
- LangGraph 提供 interrupt / human-in-the-loop，适合在发布 case、自愈修复、高风险浏览器动作前等待确认。
  - https://docs.langchain.com/oss/javascript/langgraph/interrupts
- LangChain MCP adapters 可以把 MCP server 暴露成可调用工具，但默认是 stateless session；浏览器这类连续交互场景必须单独做 session 管理。
  - https://docs.langchain.com/oss/javascript/langchain/mcp
- Playwright MCP 官方仓库已明确其定位是让 LLM 通过结构化 snapshot 与浏览器交互。
  - https://github.com/microsoft/playwright-mcp
- LangSmith 已支持 LangGraph 评测，可用于回归验证探索图、自愈图和助手图本身。
  - https://docs.langchain.com/langsmith/evaluate-graph

## 设计目标

- 复用现有 test asset 和执行底座，不引入第二套执行事实源。
- 用 LangGraph 统一承载探索、分析、自愈、结果解释和聊天五类 AI 行为。
- 让 Playwright MCP 负责“模型可读、可操作的浏览器观察与动作”，而不是让 LLM 直接生成任意 Playwright 代码。
- 把记忆做成有作用域、有审计、有失效策略的正式能力，而不是黑盒向量堆积。
- 保持对租户、项目、版本、artifact、run lineage 的现有约束不变。

## 非目标

- 不在第一阶段重做前端工作台。
- 不在第一阶段把所有执行都切到 MCP 驱动。
- 不让 AI 自动发布正式版本或自动改写已发布 case。
- 不让“自愈成功”直接等于“产品没有问题”。

## 关键设计决策

### 1. 新增 `apps/ai-orchestrator`，但不取代 control-plane

推荐新增一个 TypeScript 服务 `apps/ai-orchestrator`，职责是：

- 承载 LangGraph runtime
- 管理 assistant thread、memory、checkpoint
- 管理 Playwright MCP 浏览器 session
- 调用 control-plane 的 recording / test-case / run / artifact / override API
- 对外暴露 assistant / exploration / evaluation API

不建议把 LangGraph runtime 直接塞进 `control-plane`，原因是：

- AI 编排链路和业务事实存储职责不同
- LangGraph checkpoint / memory 生命周期与 run projection 不同
- 后续模型、prompt、tool routing 会高频演进，不适合和控制面主路径强耦合

### 2. Playwright MCP 只负责探索和恢复，不替代正式执行

推荐分层：

- `Playwright MCP`：
  - 用于探索页面、读取结构化 snapshot、做辅助恢复动作、支持聊天式浏览器操作
- `web-worker + dsl-compiler + playwright-adapter`：
  - 继续承担 test case version 的正式执行与证据采集

原因：

- MCP 面向模型交互，天然更灵活，但可重复性和确定性弱于已编译的 DSL 执行
- 当前仓库的正式执行、artifact、租户隔离、run 投影都已经围绕 `web-worker` 建好了
- 把 MCP 留在“探索 / 调试 / 恢复 / 辅助决策”层更稳

### 3. 自愈不直接修改已发布 case，只通过 step override 或 draft version 落地

运行时自愈分两层：

- 运行时即时恢复：
  - AI 通过现有 `override` 协议给失败 step 的后续执行注入 `replace / pause / skip`
- 资产层沉淀：
  - 若自愈后的流程稳定，应通过 `extract-test-case` 或“生成新 draft version”形成待审核版本

这与当前领域模型约束一致：

- [docs/design/tasks/20260307-211047-test-asset-domain-model-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-211047-test-asset-domain-model-design-task.md)

### 4. 结果判断坚持“deterministic first, LLM second”

结果分析必须两层化：

- 第一层：确定性判断
  - step assertion、run status、artifact、业务 side effect 校验、数据回写校验
- 第二层：LLM 解释与分类
  - 环境故障、疑似定位漂移、功能回归、预期变更、需要人工审核

不建议让 LLM 直接担任唯一 judge，否则会把“解释能力”误用成“事实判定能力”。

## 目标架构

### 1. 服务拓扑

- `apps/control-plane`
  - 继续做 test asset / run / recording / artifact 的系统事实源
- `apps/web-worker`
  - 继续做正式 DSL 执行器
- `apps/ai-orchestrator`
  - 新增，做 LangGraph runtime、memory、tool routing、assistant API
- `playwright-mcp`
  - 由 `ai-orchestrator` 以 subprocess 或 sidecar 方式托管，按 thread 分配浏览器 session

### 2. 核心内部模块

`apps/ai-orchestrator` 建议拆成：

- `graphs/`
  - `exploration-graph.ts`
  - `recording-analysis-graph.ts`
  - `self-heal-graph.ts`
  - `result-evaluation-graph.ts`
  - `assistant-graph.ts`
- `memory/`
  - 记忆提取、记忆检索、冲突消解、审批策略
- `tools/`
  - `control-plane-tools.ts`
  - `playwright-mcp-tools.ts`
  - `docs-tools.ts`
  - `artifact-tools.ts`
- `sessions/`
  - `browser-session-broker.ts`
  - 管理 MCP client、生存期、浏览器上下文、录像输出目录
- `policies/`
  - 高风险动作确认、自动发布禁令、写记忆审批规则

## 五类图设计

### A. Requirement Memory Graph

目标：

- 把“理解需求，并记住”做成正式 memory 管道

输入：

- 用户聊天消息
- 项目上下文
- 已有记忆

节点：

1. `classify_memory_candidate`
2. `extract_memory_fact`
3. `dedupe_and_conflict_check`
4. `policy_gate`
5. `persist_memory_fact`

输出：

- thread 记忆
- project 级长期记忆

推荐记忆类型：

- `business_rule`
- `environment_hint`
- `account_or_role_hint`
- `known_locator_hint`
- `approval_policy`
- `user_preference`

策略：

- thread 记忆自动写
- project 长期记忆仅对低风险事实自动写入
- 涉及账号、支付、破坏性动作的记忆需要确认

### B. Exploration And Recording Graph

目标：

- 根据用户指示和记忆，自动探索业务画面，并产出 recording + 视频/trace/截图

输入：

- 目标描述
- 起始 URL 或入口页面
- 已知业务规则与环境记忆

节点：

1. `load_task_and_memory`
2. `start_browser_session`
3. `plan_exploration_goal`
4. `explore_step_loop`
5. `record_event_and_artifact`
6. `stop_condition_check`
7. `finalize_recording`
8. `summarize_exploration`

工具：

- Playwright MCP tools
- Control-plane recording APIs

设计要点：

- LLM 通过 MCP 做观察和动作
- 录像、trace、截图不依赖 MCP 生成，而由 `browser-session-broker` 直接在 Playwright context 上开启
- 每个探索 thread 绑定一个 stateful browser session
- 录制事件继续落在现有 `recordings / recording_events`

新增建议：

- 扩展 artifact 模型支持 `recording_id`
  - 方案 A：扩展现有 `artifacts` 增加 `recording_id` 和 `artifact_scope`
  - 方案 B：新增 `recording_artifacts`

### C. Recording To Case Graph

目标：

- 分析录屏，生成测试 case draft

输入：

- recording
- recording events
- recording artifacts
- 项目记忆

节点：

1. `load_recording_context`
2. `segment_business_steps`
3. `infer_assertions_and_variables`
4. `build_plan_draft`
5. `derive_data_template`
6. `confidence_review`
7. `publish_draft_case`

输出：

- `recording_analysis_job`
- draft `test_case` / `test_case_version`
- default dataset row

设计要点：

- 当前 `POST /api/v1/recordings/{id}:analyze-dsl` 可升级为调用该图
- 默认只生成 draft，不自动变成 published
- 若置信度低，使用 `interrupt` 进入人工确认

### D. Self-Heal Execution Graph

目标：

- 对失败 step 做有边界的自愈执行

输入：

- run / run_item / failed step event
- 当前页面 URL
- 截图 / trace / DOM snapshot / 最近成功 step
- 该 case version 的预期断言
- 相关记忆

节点：

1. `classify_failure`
2. `decide_if_healable`
3. `generate_recovery_strategy`
4. `simulate_or_probe_via_mcp`
5. `emit_step_override`
6. `observe_retry_result`
7. `loop_or_escalate`

可恢复类型：

- locator 漂移
- 页面加载波动
- 非关键弹窗干扰
- 轻微导航路径变化

不可自动恢复类型：

- 业务断言失败
- 支付 / 删除 / 提交等高风险动作语义变化
- 权限缺失
- 数据污染

接入点：

- 复用现有 `POST /api/v1/internal/jobs/{job_id}/steps/{source_step_id}:override`
- 复用现有 `step_decisions`
- 失败后若恢复成功，可通过 `extract-test-case` 产出 draft version，等待人工审核

新增建议：

- `self_heal_attempts`
  - 记录分类、策略、AI 结论、override 内容、结果、关联 run_item / step_event

### E. Result Evaluation Graph

目标：

- 自动分析测试结果是否符合预期

输入：

- run / run_item / step_events / artifacts
- case version 预期
- dataset row
- 可选业务验证动作

节点：

1. `load_expected_contract`
2. `run_deterministic_checks`
3. `run_optional_business_verifiers`
4. `classify_outcome`
5. `generate_explanation`
6. `persist_evaluation`

推荐结论枚举：

- `passed_as_expected`
- `failed_functional_regression`
- `failed_environment_issue`
- `failed_test_asset_issue`
- `passed_with_runtime_self_heal`
- `needs_human_review`

新增建议：

- `run_evaluations`
  - 保存 verdict、evidence、explanation、review_status、linked_artifact_ids

### F. Assistant Chat Graph

目标：

- 以对话方式支持用户提问和操作

输入：

- 用户消息
- thread 短期记忆
- project 长期记忆

节点：

1. `retrieve_memory`
2. `intent_router`
3. `tool_or_answer`
4. `interrupt_if_needed`
5. `return_response`
6. `extract_memory_updates`

意图：

- `ask_status`
- `explore_and_record`
- `generate_case_from_recording`
- `run_case`
- `explain_failure`
- `apply_self_heal`
- `remember_fact`
- `browser_assist`

工具集：

- Control-plane query/action tools
- Playwright MCP tools
- Docs / knowledge tools
- Artifact inspection tools

## 数据模型建议

### 1. 复用现有表

- `recordings`
- `recording_events`
- `recording_analysis_jobs`
- `test_cases`
- `test_case_versions`
- `dataset_rows`
- `runs`
- `run_items`
- `step_events`
- `artifacts`
- `step_decisions`

### 2. 新增表

- `assistant_threads`
  - thread 头信息，关联 tenant / project / user / graph_type
- `assistant_messages`
  - 消息历史、tool call、附件
- `assistant_memory_facts`
  - 结构化长期记忆
- `self_heal_attempts`
  - 自愈审计与效果
- `run_evaluations`
  - 自动结果判断
- `exploration_sessions`
  - 浏览器探索会话头信息

### 3. LangGraph checkpoint 存储

建议分两层：

- 业务级持久事实：
  - 继续遵守 tenant / project 边界，落到本仓库自己的业务表
- LangGraph runtime checkpoint：
  - 可放在单独 `langgraph_runtime` schema
  - `thread_id` 必须编码 tenant / project / graph type

原因：

- LangGraph checkpointer 更适合作 runtime 恢复，不适合作业务事实主表
- 当前仓库已有 tenant schema 约束，业务数据不应直接退回共享无边界表

## API 建议

新增 assistant / orchestration API：

- `POST /api/v1/assistant/threads`
- `POST /api/v1/assistant/threads/{thread_id}/messages`
- `GET /api/v1/assistant/threads/{thread_id}`
- `POST /api/v1/explorations`
- `POST /api/v1/explorations/{exploration_id}:start`
- `POST /api/v1/explorations/{exploration_id}:stop`
- `POST /api/v1/run-items/{run_item_id}:evaluate`
- `GET /api/v1/run-evaluations/{evaluation_id}`

建议扩展 control-plane API：

- `GET /api/v1/recordings/{recording_id}/artifacts`
- `GET /api/v1/run-items/{run_item_id}/self-heal-attempts`

内部 API：

- 保持复用现有 override / decide 协议
- 不建议单独新开“AI 专用执行协议”

## 端到端主流程

### 流程 1：探索并产出 case

1. 用户在 chat 中描述目标流程
2. assistant graph 读取记忆并判断需要探索
3. exploration graph 启动 Playwright MCP stateful session 并录制
4. 录制产物写入 `recordings`、`recording_events`、recording artifacts
5. recording analysis graph 产出 draft case
6. 用户审核后发布 version

### 流程 2：运行失败后自愈

1. 正式 run 由现有 case version 执行
2. 某 step 失败
3. self-heal graph 读取失败上下文并判断可否恢复
4. 若可恢复，则通过 override API 注入替换 step
5. run 继续执行并落库
6. 若恢复成功，则生成 `self_heal_attempt`
7. 若需要沉淀资产，则从 run item 提取 draft version

### 流程 3：聊天式问答与动作

1. 用户提问“为什么失败”或“帮我探索下单流程”
2. assistant graph 读取记忆，路由到问答或动作图
3. 需要浏览器时调用 Playwright MCP；需要数据时调用 control-plane tools
4. 返回答案、执行结果和证据链接

## 安全与治理

- AI 不得默认执行破坏性浏览器动作
- 记忆写入必须带来源、置信度和作用域
- 所有自愈动作都必须审计
- 已发布 case 的变更只能通过新 draft version
- 对外回答必须优先引用系统事实，再引用模型推断

## 分阶段落地

### Phase 1

- 新增 `apps/ai-orchestrator`
- 打通 assistant thread / memory / chat API
- 打通 Playwright MCP stateful session
- 打通 exploration -> recording -> draft case

### Phase 2

- 打通 self-heal graph
- 接入现有 override 协议
- 新增 `self_heal_attempts`
- 支持成功自愈后提取 draft version

### Phase 3

- 打通 run evaluation graph
- 新增 `run_evaluations`
- 给聊天助手加入“结果解释 / 风险判断 / 建议操作”

### Phase 4

- 最小前端工作台：
  - assistant chat
  - exploration review
  - self-heal review
  - evaluation review

## 风险

- Playwright MCP 与 LangChain MCP adapter 组合默认是 stateless；如果不做 session broker，浏览器探索会丢上下文。
- 自愈如果边界放太宽，会掩盖真实功能回归。
- 录屏分析到 case 仍然有 AI 误差，必须保留人工审核。
- 聊天助手如果同时具备浏览器动作和系统写操作，权限模型必须先行。
- 当前仓库没有前端工作台，聊天能力第一阶段更适合先提供 API 和最小 console。

## 验证计划

- 图级单测：
  - 记忆提取、意图路由、失败分类、结果分类
- 工具级集成：
  - MCP session 生命周期、control-plane tool 调用、artifact 读写
- 容器化 smoke：
  - exploration -> recording -> analyze -> draft case
  - case run -> step fail -> self-heal override -> final verdict
  - assistant chat -> 查询事实 / 触发动作
- LangSmith 回归集：
  - 为 exploration、自愈、问答三类图维护 gold dataset

## 结论

推荐路线不是“把现有平台改造成一个大而全的 agent”，而是：

- 继续把 `control-plane` 作为事实源
- 继续把 `web-worker` 作为正式执行器
- 在外层新增 `ai-orchestrator + LangGraph + Playwright MCP + memory`

这样既能满足“理解并记住、自动探索录屏、录屏转 case、自愈执行、结果分析、聊天支持”这 6 个目标，又不会破坏当前已经打通的测试资产与执行闭环。
