---
title: 通用测试平台工作台 UI/UX 设计说明
status: active
owner: architecture
last_updated: 2026-03-08
summary: 为当前 AI Web Testing Platform V2 设计一个面向多测试类型的工作台 UI/UX 方案，覆盖信息架构、页面模型、AI 交互原则、通用对象视图和分阶段落地路径。
---

# 通用测试平台工作台 UI/UX 设计说明

## 背景

当前仓库已经具备：

- `control-plane` 作为系统事实源，承载 run / run_item / artifact / recording / test case / dataset / report 等核心对象
- `web-worker` 作为确定性执行器，支持真实 Playwright 执行、artifact 采集和 step 级控制
- `ai-orchestrator` 作为 AI 编排层，支持 assistant thread、Playwright MCP 探索录屏、录屏转 case、自愈执行和 run evaluation

但当前仓库仍然没有正式前端工作台。现状有两个问题：

- 用户必须靠脚本、HTTP API 和 evidence 文档理解系统状态，使用门槛高
- 当前后端能力已经超出“单次 smoke 演示”，但缺少一个统一入口来管理录制、资产、执行、比对、报告和 AI 交互

同时，平台定位不能只围绕 web 测试。虽然当前执行主链以 web 为先，但领域模型已经在向通用测试平台演进，后续应能容纳：

- web UI
- API
- mobile
- desktop
- CLI / batch
- performance / synthetic
- manual / exploratory

因此这份设计的重点不是“做一个 web 测试专用页面”，而是定义一套可扩展到多测试类型的工作台结构。

## 问题定义

如果直接沿用“按测试类型分 silo 的管理台”，会出现三个问题：

- 导航会被 `Web / API / Mobile / Report / AI` 这类分类撕裂，用户很难追踪同一业务对象
- AI 聊天容易被错误做成首页主入口，掩盖真正的资产、执行和证据对象
- 后续新增测试类型时，必须重复造一整套页面，而不是复用统一的对象视图

如果反过来把所有对象都塞进一个万能列表，也会出现：

- 页面目标不清
- 信息密度失控
- 关键操作没有明确上下文

所以本设计采用三条根原则：

- 对象优先于测试类型
- 任务优先于聊天
- 证据优先于总结

## 设计目标

- 为平台提供一个清晰、好用、可扩展的桌面优先工作台
- 用统一信息架构承载 recording、case、suite、dataset、run、compare、report、thread、evaluation 等对象
- 让 `test_type` 成为横向维度，而不是顶层信息架构的切割轴
- 让 AI 成为“操作和解释层”，而不是系统真相本身
- 为后续新增 `apps/console` 一类前端应用提供明确的页面蓝图和组件边界

## 非目标

- 不在这轮直接实现前端页面代码
- 不为每个测试类型单独设计一套视觉系统
- 不做移动端完整操作台；移动端只考虑轻量查看和审批
- 不把 AI 聊天历史当作平台的系统事实存储

## 外部设计依据

这份方案参考了几类更稳的官方或设计系统来源：

- Microsoft Human-AI Interaction Guidelines
  - https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/
- Google PAIR Guidebook
  - explainability / trust: https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/
  - feedback / controls: https://pair.withgoogle.com/guidebook-v2/chapters/feedback-controls/
- Microsoft Principles for Responsible Agent Design
  - https://microsoft.design/articles/principles-for-responsible-agent-design/
- Carbon for AI
  - https://carbondesignsystem.com/guidelines/carbon-for-ai/
- Carbon Data Table Usage
  - https://carbondesignsystem.com/components/data-table/usage/
- U.S. Web Design System Data Visualizations
  - https://designsystem.digital.gov/components/data-visualizations/
- Tableau Dashboard Best Practices
  - https://help.tableau.com/current/pro/desktop/en-us/dashboards_best_practices.htm

从这些来源抽取到、并适用于本平台的共识是：

- AI 能力必须有清晰标识、可解释路径和人工纠正入口
- 高影响动作不能无摩擦自动执行
- 数据密集型页面应优先使用表格、时间线和上下文面板，而不是堆砌图表
- 页面数量可以多于一个，但每个页面只能服务一个主要决策

## 关键用户与任务

### 1. QA / Test Engineer

主要任务：

- 录制或探索流程
- 审核生成的 case
- 跑回归并分析失败
- 对比最近两次结果

### 2. SET / Test Developer

主要任务：

- 编辑和维护 case / suite / dataset
- 查看 step 级执行证据
- 处理 flaky、自愈建议和环境漂移

### 3. Release Owner / Product QA

主要任务：

- 快速知道当前项目是否可放行
- 看失败分布、回归变化和报告输出
- 审核 AI 生成和自愈沉淀的资产

### 4. Platform Operator

主要任务：

- 看 agent / provider / integration / storage 健康
- 管控租户、配额、连接器和审计
- 排查工作流异常

## 信息架构总原则

### 1. 顶层导航按对象域组织，不按测试类型组织

推荐一级导航：

- `Overview`
- `Inbox`
- `Assets`
- `Runs`
- `Reports`
- `AI Workspace`
- `Admin`

原因：

- recording、case、suite、dataset、run、report 这些对象对所有测试类型都成立
- `test_type` 更适合作为筛选器、标签和适配器入口
- 用户更常按“我要管理什么对象”而不是“我要做哪种测试”思考

### 2. `test_type` 作为横向维度

每个核心对象都应带 `test_type`：

- `web`
- `api`
- `mobile`
- `desktop`
- `cli`
- `performance`
- `manual`
- `custom`

UI 行为：

- 顶层不做 `Web / API / Mobile` 一级导航
- 在列表、详情页和创建流程中显示 `test_type` badge
- 用 detail adapter 处理不同测试类型的特定字段和证据视图

### 3. AI 对象单独成域，但不能吞掉其它域

AI 相关对象：

- `assistant_threads`
- `explorations`
- `run_evaluations`
- `self_heal_attempts`
- memory facts

这些对象应归到 `AI Workspace` 和关联详情中展示，而不是替代：

- recording
- case
- run
- report

## 工作台总布局

推荐桌面端采用稳定三栏布局：

```text
+----------------------------------------------------------------------------------+
| Project Switcher | Global Search | Quick Actions | Provider | Agent/Queue Status |
+-------------------+------------------------------------------+-------------------+
| Left Nav          | Main Surface                              | Context Rail      |
| Overview          | object list / detail / timeline / editor | AI actions        |
| Inbox             |                                          | memory            |
| Assets            |                                          | evidence links    |
| Runs              |                                          | audit log         |
| Reports           |                                          | approvals         |
| AI Workspace      |                                          |                   |
| Admin             |                                          |                   |
+----------------------------------------------------------------------------------+
```

含义：

- 左侧导航稳定，不跟当前对象变化
- 中间主面板只承载一个当前任务
- 右侧始终存在上下文栏，放 AI 建议、快捷动作、关联对象和审计

## 一级页面设计

### 1. Overview

目标：

- 回答“这个项目现在怎么样，哪里需要我处理”

核心模块：

- 发布风险摘要
- 最近运行健康度
- 待审核资产
- 失败热点
- 最近 AI 活动
- 报告生成状态

不建议：

- 在首页放一个空白大聊天框
- 把首页做成 BI 大屏

### 2. Inbox

目标：

- 汇总需要人工处理的事项

对象类型：

- 待审核 `case draft`
- 待确认 `self-heal draft version`
- `failed_unexpectedly` run evaluation
- 报告生成失败
- integration 异常

这页的价值是减少用户在多个列表之间跳转。

### 3. Assets

目标：

- 承载平台中的长期资产

二级标签：

- `Cases`
- `Suites`
- `Datasets`
- `Recordings`
- `Explorations`
- `Connections`

统一列表列建议：

- 名称
- `test_type`
- 状态
- 来源
- 最近版本 / 最近运行
- 所属项目
- 更新时间

### 4. Runs

目标：

- 承载执行事实和问题排查

二级标签：

- `Runs`
- `Run Items`
- `Compare`
- `Evaluations`
- `Artifacts`

这页必须优先支持高密度筛选、批量操作和时间线回看。

### 5. Reports

目标：

- 汇总可分发输出和对外表达结果

二级标签：

- `Report Jobs`
- `Generated Reports`
- `Templates`
- `Exports`

### 6. AI Workspace

目标：

- 为 assistant thread、browser assist、探索编排、自愈建议和 memory 提供正式入口

二级标签：

- `Threads`
- `Explorations`
- `Memory`
- `Approvals`
- `Provider Usage`

这页不等于首页。它应该是“AI 工作空间”，而不是整站唯一入口。

### 7. Admin

目标：

- 管理租户、项目、权限、integration、provider、agent、审计和配额

## 核心详情页模板

### 1. Recording / Exploration Detail

主问题：

- 这次录制记录了什么，能不能产出可用测试资产

布局建议：

- 左：步骤时间线
- 中：视频 / 截图 / DOM snapshot / 关键字段摘要
- 右：AI 摘要、记忆命中、生成 case 操作

必须有的动作：

- 重放
- 生成 case draft
- 标记无效片段
- 添加业务注释

### 2. Case Detail / Editor

主问题：

- 这个 case 的结构、数据、来源和风险是什么

布局建议：

- 顶部：case meta、`test_type`、状态、来源 recording
- 中部标签：
  - `Steps`
  - `Datasets`
  - `Versions`
  - `Runs`
  - `Diff`
- 右侧：AI 建议、审批动作、最近失败摘要

通用要求：

- 对所有测试类型共享 case meta 和版本流
- 用 adapter 区分不同类型 step 结构

### 3. Run Detail

主问题：

- 这次执行发生了什么，为什么通过或失败

布局建议：

- 顶部摘要：status、duration、test type、selection kind、environment、dataset
- 中部时间线：run -> run item -> step events
- 下部证据：artifact、日志、network、trace、screenshots
- 右侧：evaluation、自愈尝试、重跑动作

这页必须支持从“摘要”一跳到“失败 step 原始事件”，不能只给大段 AI 总结。

### 4. Compare Detail

主问题：

- 相比 baseline，到底变好了、变坏了还是只是变了

通用 compare 结构：

- baseline 对象
- candidate 对象
- 维度选择
  - status
  - duration
  - assertion delta
  - artifact delta
  - data delta

这页必须是平台级能力，不能只服务 web 测试。

### 5. Report Detail

主问题：

- 给别人看的最终结论是什么，证据来自哪里

结构建议：

- 顶部摘要
- 覆盖范围
- 结果统计
- 风险事项
- 关联 compare / evaluation
- 下载与分发

### 6. Thread / AI Detail

主问题：

- 当前 AI 帮我做了什么，它的依据是什么，我下一步该批准或修正什么

布局建议：

- 左：聊天记录和动作卡片
- 中：关联对象视图
- 右：memory、审批、证据、可执行动作

这页里 assistant 回复应尽量卡片化，而不是长段落文本。

## AI 交互原则

### 1. AI 只是“助手层”，不是“真相层”

系统事实仍然来自：

- case version
- run / run item
- step event
- artifact
- report job

assistant 只负责：

- 发起动作
- 解释结果
- 给建议
- 汇总上下文

### 2. 所有 AI 参与都必须有明确标识

需要显式显示：

- `AI generated`
- `AI suggested`
- `AI healed`
- `AI evaluated`

并允许用户查看：

- 来源 thread
- 触发时间
- 关联对象
- 最终是否被人工确认

### 3. 高影响动作必须经过人

至少以下动作应设计为人工确认：

- 发布 case 版本
- 接受自愈生成的 draft version
- 批量重跑
- 写入 project 级长期 memory
- 触发外部系统动作

### 4. Chat 应以动作模板驱动

不建议让用户每次都从零写 prompt。应提供动作模板：

- 探索一个入口
- 根据最新录屏生成 case
- 解释这次失败
- 对这个 run 执行自愈
- 比较最近两次 nightly
- 生成测试报告

## 视觉与交互语言

### 1. 风格定位

推荐方向：

- `operator console`
- `evidence first`
- `dense but calm`

不建议：

- 过度发光或装饰性的 AI 视觉
- 偏营销 landing page 的大留白
- 紫色偏见和“万能 Copilot 首页”套路

### 2. 视觉基础

建议字体：

- UI：`IBM Plex Sans`
- 数据与代码：`IBM Plex Mono`

建议色彩角色：

- 主背景：深石墨或冷灰
- 交互强调：偏蓝绿，不用紫
- 成功：绿色
- 警告 / 自愈：琥珀色
- 失败：红色
- AI 辅助：蓝色，不做夸张发光

### 3. 组件约束

优先组件：

- 数据表
- 时间线
- split view
- tabs
- side panel
- command palette
- result summary card

减少使用：

- 大面积图表
- 无意义 carousel
- 浮动 chat 气泡覆盖全站

## 通用测试类型适配策略

为了让平台不只服务 web，建议所有对象页面都分成两层：

- 公共壳层
  - 名称、状态、来源、版本、负责人、项目、标签、最近运行、审批
- 类型适配层
  - web：step timeline、video、trace、DOM
  - api：request / response、schema diff、contract assertion
  - mobile：device、build、gesture、video
  - performance：scenario、baseline、latency / throughput 分布
  - manual：checklist、evidence note、approval chain

这样 UI 不需要为每个测试类型重写整站，只要在对象详情内部切换适配器。

## 设计守门规则

所有新增 UI 功能必须能回答两个问题：

1. 它让哪个决策更快？
2. 它降低了哪种错误或风险？

如果答不出来，就不应该进入当前版本。

进一步的产品准入标准：

- 是否能指向明确对象
- 是否能产生可追溯操作
- 是否存在成功与失败状态
- 是否会引入新的审批负担

## 可访问性与响应式要求

- 颜色不是唯一状态来源，状态必须有 label / icon / 文本
- 关键时间线和数据表要支持键盘导航
- 图表必须有文字摘要和可访问表格替代
- 小屏只做查看和审批，不做复杂编辑
- chat、表格、时间线都要支持复制链接和深链

## 前端应用边界建议

推荐新增 `apps/console`，职责：

- 承载平台 UI
- 直接消费 `control-plane` 和 `ai-orchestrator` API
- 提供对象级深链和权限控制

不建议：

- 把 UI 混进 `control-plane`
- 在第一阶段把 console 和 AI assistant 做成一个单体大页

## 分阶段落地

### Phase 1：最小工作台

目标：

- 让用户能进入项目、看到运行情况、查看资产、发起 AI 动作

范围：

- `Overview`
- `Assets > Cases / Recordings`
- `Runs > Runs / Run Detail`
- `AI Workspace > Threads`

### Phase 2：资产工作流

目标：

- 让 recording -> case review -> publish 形成完整 UI

范围：

- Exploration / Recording Detail
- Case Editor
- Dataset 管理
- 审批队列

### Phase 3：分析与恢复

目标：

- 让 compare、evaluation、自愈在 UI 上可理解、可审核

范围：

- Compare Detail
- Run Evaluation Detail
- Self-heal Review
- Report Center

### Phase 4：多测试类型扩展

目标：

- 在不重做导航的前提下接入 API / mobile / performance

范围：

- test type adapter
- 通用 compare 维度
- integration / environment 管理

## 结论

这套工作台不应被做成“会聊天的 web 测试工具”，而应被做成：

- 以对象为中心
- 以证据为中心
- 以决策为中心
- 可扩展到多测试类型

具体落地时应坚持：

- 顶层导航按对象域，不按测试类型
- AI 是操作和解释层，不是系统真相
- 页面围绕用户决策组织，而不是围绕模型能力组织
- 所有高影响动作都保留人工确认

如果后续进入实现阶段，建议先从 `apps/console` 的 `Overview / Runs / Assets / AI Workspace` 四个入口开始，而不是直接做一个“大而全”的统一助手首页。
