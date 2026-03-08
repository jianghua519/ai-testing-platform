---
title: apps console 最小工作台 UI 设计说明
status: active
owner: architecture
last_updated: 2026-03-08
summary: 为 apps/console 定义第一阶段最小工作台 UI，聚焦 Overview、Assets、Runs、AI Workspace 四个入口，只保留操作、一览、详情和必要编辑。
---

# apps console 最小工作台 UI 设计说明

## 背景

当前平台已经有较完整的后端对象和工作流：

- `control-plane`：run、run item、artifact、recording、test case、dataset 等系统事实
- `web-worker`：确定性执行和证据采集
- `ai-orchestrator`：thread、exploration、录屏转 case、自愈、evaluation

当前缺的是一个真正能用的控制台。

上一个详细设计的问题不是信息不够，而是功能欲望过强，带入了太多“也许以后方便”的元素，导致：

- 页面负担过重
- 优先级不清
- 一阶段实现成本过高

这次重设计的原则是：

- 用户能做操作
- 用户能看到一览
- 用户能看到详情
- 只有必要的地方能修改编辑
- 便利性功能先不做

## 设计目标

为 `apps/console` 设计一个第一阶段就能落地的最小工作台，只覆盖四个入口：

- `Overview`
- `Assets`
- `Runs`
- `AI Workspace`

第一阶段不追求：

- 万能首页
- 多层快捷操作
- saved views
- command palette
- 个性化布局
- 大量图表
- 大量批量操作
- 为了“显得智能”而加入的 prompt chips、推荐动作、辅助面板

## 设计边界

### 保留

- 顶层导航
- 页面标题和主动作
- 列表
- 详情
- 少量筛选
- 少量必要编辑

### 暂不做

- 全局搜索
- 保存视图
- 自定义列管理
- bulk action
- 报表中心
- Admin
- Inbox
- 右侧多功能上下文栏
- AI provider 用量面板
- 页面内智能推荐动作
- 命令面板

## 核心产品规则

整个控制台只服务四件事：

1. 发起一个动作
2. 看当前对象列表
3. 看选中对象详情
4. 在必要位置修改元数据

如果某个 UI 元素不能服务这四件事，就不进入第一阶段。

## 数据覆盖范围

第一阶段 UI 要覆盖当前底座已经落在 DB / MinIO 的核心对象，但不要求每个表都独立成页：

- `control-plane`：
  - `test_cases`
  - `test_case_versions`
  - `data_template_versions`
  - `dataset_rows`
  - `recordings`
  - `recording_events`
  - `recording_analysis_jobs`
  - `runs`
  - `run_items`
  - `step_events`
  - `artifacts`
- `ai-orchestrator`：
  - `assistant_threads`
  - `assistant_messages`
  - `assistant_memory_facts`
  - `exploration_sessions`
  - `self_heal_attempts`
  - `run_evaluations`
- MinIO / 对象存储：
  - 所有由 `artifacts` 和 exploration artifact 元数据指向的文件对象

原则：

- 每个对象至少要在某个页面里可被查看、追踪或触发相关动作
- 不为单个底层表强行拆新页面，优先放入最贴近业务闭环的详情区
- 不能映射到这些对象的数据块，不进入第一阶段

## route 结构

第一阶段只保留四个一级入口：

- `/overview`
- `/assets`
- `/runs`
- `/ai-workspace`

二级切换只在页面内部做，不新增更多一级路由。

## 全局壳层

### 页面结构

```text
+-------------------------------------------------------------------------------------------+
| Logo | Project Switcher | Environment | System Status | User Menu                         |
+----------------------+------------------------------------------------+--------------------+
| Left Navigation      | Page Header                                    |                    |
| Overview             | title + subtitle + primary action              |                    |
| Assets               +------------------------------------------------+                    |
| Runs                 | Main Content                                   |                    |
| AI Workspace         |                                                |                    |
|                      |                                                |                    |
+----------------------+------------------------------------------------+--------------------+
```

### 壳层元素

- `S01 Logo`
  - 文本：`AIWTP Console`
  - 点击返回 `/overview`
- `S02 Project Switcher`
  - 形式：下拉
  - 显示当前 `tenant / project`
- `S03 Environment`
  - 形式：只读 badge
  - 显示当前环境或 provider 概览
  - 示例：`staging`、`google`
- `S04 System Status`
  - 只显示最少系统状态：
    - `agents online`
    - `queue`
  - 示例：`2 agents · queue 1`
- `S05 User Menu`
  - 菜单只保留：
    - `Preferences`
    - `Sign out`
- `S06 Left Navigation`
  - 固定 4 项：
    - `Overview`
    - `Assets`
    - `Runs`
    - `AI Workspace`
- `S07 Page Header`
  - 每页固定有：
    - 页面标题
    - 一句副标题
    - 1 个主动作
    - 0 到 2 个次动作
- `S08 Main Content`
  - 第一阶段不放右侧通用 context rail
  - 页面自己负责列表和详情布局

## 页面通用布局规则

### 1. Overview

- 使用“对象摘要 + 页面入口”结构
- 只汇总当前项目在 DB / MinIO 中已经持久化的对象
- 不承担待办中心、推荐动作或运营看板

### 2. Assets / Runs / AI Workspace

- 统一使用 `列表 + 详情` 双栏
- 左栏是列表
- 右栏是详情
- 这样用户在一个页面里同时完成浏览和查看

### 3. 编辑方式

- 不做内联大规模编辑
- 只在详情页内放一个 `Edit` 按钮
- 编辑字段必须直接对应对象已有字段

### 4. 数据展示规则

- 不使用没有明确业务语义的时间窗和条数，例如 `最近 24 小时`、`最近 5 条`
- 每一项摘要、列表、详情字段和动作都必须映射到明确的持久化对象
- MinIO / 对象存储中的 artifact 不单独开新页面，统一挂在关联对象详情下
- 列表只用于明确对象集合，筛选只使用对象上已有或明确计划补齐的字段

### 5. 后端补齐原则

- 为了闭环需要新增后端接口时，必须明确对应的表、对象或 MinIO 元数据来源
- 优先补齐列表、筛选、详情、编辑、动作所需接口，不补“推荐”“洞察”“智能辅助”类接口
- 页面设计允许后端为 UI 闭环补齐接口，但不允许新增没有对象来源的功能块

## Overview

### 目标

- 让用户快速知道：
  - 当前项目已经持有多少核心对象
  - 证据和存储大致规模
  - 应该进入哪个工作页继续处理

### 布局

```text
+-------------------------------------------------------------------------------------------+
| O01 Title                      | O02 New Run | O03 New Exploration                        |
+-------------------------------------------------------------------------------------------+
| O04 Summary Card | O05 Summary Card | O06 Summary Card | O07 Summary Card                |
+-------------------------------------------------------------------------------------------+
| O08 Evidence Summary                                 | O12 Entry Points                  |
| O09 evidence metric                                  | O13 navigation item               |
| O10 evidence metric                                  | O14 navigation item               |
| O11 evidence metric                                  | O15 navigation item               |
+-------------------------------------------------------------------------------------------+
```

### 元素清单

- `O01 Page Title`
  - 标题：`Overview`
  - 副标题：`Stored objects and evidence coverage`
- `O02 Primary Action`
  - `New Run`
- `O03 Secondary Action`
  - `New Exploration`
- `O04 Summary Card: Test Cases`
  - 标题：`Test Cases`
  - 内容：
    - `test_cases` 总数
    - `draft / active / archived` 分布
- `O05 Summary Card: Recordings`
  - 标题：`Recordings`
  - 内容：
    - `recordings` 总数
    - `recording_analysis_jobs` 总数和状态分布
- `O06 Summary Card: Runs`
  - 标题：`Runs`
  - 内容：
    - `runs` 总数
    - 非终态 run 数
    - `failed` run 数
- `O07 Summary Card: AI Workspace`
  - 标题：`AI Workspace`
  - 内容：
    - `assistant_threads` 总数
    - `exploration_sessions` 总数和状态分布
- `O08 Evidence Summary`
  - 汇总 `artifacts` 表和对象存储元数据
- `O09 Evidence Metric`
  - `artifact` 总数
- `O10 Evidence Metric`
  - `size_bytes` 汇总
- `O11 Evidence Metric`
  - `artifact_type` 分布
- `O12 Entry Points`
  - 固定展示三个工作页入口
- `O13 Navigation Item`
  - `Assets`
- `O14 Navigation Item`
  - `Runs`
- `O15 Navigation Item`
  - `AI Workspace`

### 不做的内容

- 不做待处理队列首页
- 不做推荐动作
- 不做趋势图和热力图
- 不做 provider 用量
- 不做 saved view

### 需要补齐的后端能力

- 为 `Overview` 提供项目级聚合查询，覆盖 `test_cases`、`recordings`、`recording_analysis_jobs`、`runs`、`artifacts`、`assistant_threads`、`exploration_sessions`
- 聚合结果必须直接来自表统计或对象存储元数据，不做 AI 推断字段

## Assets

### 目标

- 用户能查看 `test_cases` 和 `recordings`
- 用户能查看 case 版本、数据模板、dataset 行和 recording 事件
- 用户能在必要处修改 case 元数据
- 用户能从资产详情发起生成、发布和运行动作

### 页面结构

```text
+-------------------------------------------------------------------------------------------+
| A01 Title                            | A02 New Asset                                      |
+-------------------------------------------------------------------------------------------+
| A03 Object Switcher | A04 Search | A05 Status Filter | A06 Source Type Filter            |
+-------------------------------------------------------------------------------------------+
| A07 Asset List                                          | A20 Asset Detail                 |
| A08 list row                                            | A21 detail header                |
| A09 list row                                            | A22 summary                      |
| A10 pagination                                           | A23 structure and history        |
|                                                        | A24 linked data                  |
|                                                        | A25 actions                      |
|                                                        | A26 edit section                 |
+-------------------------------------------------------------------------------------------+
```

### 顶部元素

- `A01 Page Title`
  - 标题：`Assets`
  - 副标题：`Test cases and recordings`
- `A02 Primary Action`
  - 默认文案：`New Asset`
  - 下拉只保留：
    - `New Test Case`
    - `New Recording`
- `A03 Object Switcher`
  - 形式：segmented control
  - 选项：
    - `Test Cases`
    - `Recordings`
- `A04 Search`
  - 搜索名称或 ID
- `A05 Status Filter`
  - 使用对象自己的状态字段
  - `Test Cases`：`All / Draft / Active / Archived`
  - `Recordings`：按实际 `status` 枚举显示
- `A06 Source Type Filter`
  - 只在 `Recordings` 下显示
  - `All / manual / auto_explore / run_replay`

### 左栏列表

- `A07 Asset List`
  - 默认宽度约 `420px`
  - 行高固定
- `A08 Asset Row`
  - `Test Cases` 行元素：
    - 名称
    - 状态
    - `latest_version_id`
    - 更新时间
- `A09 Asset Row`
  - `Recordings` 行元素：
    - 名称
    - `source_type`
    - 状态
    - 更新时间
- `A10 Pagination`
  - 只保留上一页 / 下一页

### 右栏详情

- `A20 Asset Detail`
  - 默认显示选中行详情
  - 未选中时显示提示：`Select an asset to view details`
- `A21 Detail Header`
  - 元素：
    - 名称
    - 类型 badge
    - 状态 badge
    - 主键 ID
    - `Edit`，仅在对象支持编辑时显示
- `A22 Summary`
  - `Test Cases` 显示：
    - `test_case_id`
    - `status`
    - `latest_version_id`
    - `latest_published_version_id`
    - `created_at`
    - `updated_at`
  - `Recordings` 显示：
    - `recording_id`
    - `status`
    - `source_type`
    - `env_profile`
    - `started_at`
    - `finished_at`
- `A23 Structure and History`
  - `Test Cases` 显示：
    - 版本列表
    - 当前版本的 `env_profile`
    - `data_template`
    - `dataset_rows`
  - `Recordings` 显示：
    - `recording_events`
    - `recording_analysis_jobs`
- `A24 Linked Data`
  - `Test Cases` 显示：
    - 来源 `recording`
    - 来源 `run`
    - 可运行的 `latest_published_version_id`
  - `Recordings` 显示：
    - 由该 recording 产出的 `test_case` / `test_case_version`
- `A25 Actions`
  - `Test Cases`：
    - `Create Version`
    - `Create Dataset Row`
    - `Bind Default Dataset Row`
    - `Publish Version`
    - `Run Latest Published Version`
    - `Archive`
  - `Recordings`：
    - `Analyze DSL`
    - `Publish as Test Case`
- `A26 Edit Section`
  - `Test Cases` 只允许修改：
    - 名称
    - 状态
  - `Dataset Rows` 只允许修改：
    - 名称
    - `values`
  - `Recordings` 第一阶段不提供字段编辑

### 可编辑字段

#### Test Case

- 名称
- 状态

不在第一阶段编辑：

- version plan
- data template schema
- dataset row values 以外的结构设计

#### Dataset Row

- 名称
- `values`

#### Recording

- 第一阶段不提供字段编辑
- 只提供查看和动作

### 不做的内容

- 不做 import / export
- 不做 bulk archive
- 不做列管理
- 不做 recording 和 test case 的统一混合批量操作
- 不做独立数据模板设计器

### 需要补齐的后端能力

- `recordings` 列表接口，支持分页、按 `status` 和 `source_type` 筛选、按名称或 ID 搜索
- `recording_events` 查询接口
- `recording_analysis_jobs` 列表和详情接口
- 从 `recording` 反查生成的 `test_case` / `test_case_version` 关联查询
- `test_cases` 列表接口补齐状态筛选和名称 / ID 搜索
- 如需在页面内编辑 `dataset_rows`，保留现有 `PATCH` 能力并补齐列表页交互所需返回字段

## Runs

### 目标

- 用户能看到 run 列表
- 用户能查看 run、run item、step event、artifact
- 用户能查看与 run item 关联的 self-heal 和 evaluation
- 用户能在 run 和 run item 上发起必要动作

### 页面结构

```text
+-------------------------------------------------------------------------------------------+
| R01 Title                              | R02 New Run                                      |
+-------------------------------------------------------------------------------------------+
| R03 Search | R04 Status Filter | R05 Selection Kind Filter                              |
+-------------------------------------------------------------------------------------------+
| R07 Run List                                            | R20 Run Detail                   |
| R08 run row                                             | R21 detail header                |
| R09 run row                                             | R22 summary                      |
| R10 pagination                                           | R23 run items                    |
|                                                        | R24 step events                  |
|                                                        | R25 evidence                     |
|                                                        | R26 ai diagnostics               |
|                                                        | R27 actions                      |
+-------------------------------------------------------------------------------------------+
```

### 顶部元素

- `R01 Page Title`
  - 标题：`Runs`
  - 副标题：`Runs, items, events, and evidence`
- `R02 Primary Action`
  - `New Run`
- `R03 Search`
  - 搜索 run 名称或 ID
- `R04 Status Filter`
  - `All / Queued / Running / Passed / Failed / Cancelled`
- `R05 Selection Kind Filter`
  - `All / inline_web_plan / case_version`

### 左栏列表

- `R07 Run List`
  - 默认宽度约 `440px`
- `R08 Run Row`
  - 元素：
    - run 名称
    - `selection_kind`
    - status
    - 更新时间
- `R09 Run Row`
- `R10 Pagination`

### 右栏详情

- `R20 Run Detail`
  - 未选中时显示提示：`Select a run to view details`
- `R21 Detail Header`
  - 元素：
    - run 名称
    - status
    - run ID
- `R22 Summary`
  - 只显示关键事实：
    - run id
    - mode
    - `selection_kind`
    - `started_at`
    - `finished_at`
    - `last_event_id`
- `R23 Run Items`
  - 一个简短表格，列：
    - item
    - status
    - `job_kind`
    - `test_case_version_id`
    - `dataset_row_id`
    - `assigned_agent_id`
- `R24 Step Events`
  - 显示选中 `run_item` 的 `step_events`
  - 字段：
    - `source_step_id`
    - `status`
    - `started_at`
    - `finished_at`
    - `duration_ms`
    - `error_code`
- `R25 Evidence`
  - 显示关联 `artifacts`
  - 字段：
    - `artifact_type`
    - `content_type`
    - `size_bytes`
    - `created_at`
    - `download`
- `R26 AI Diagnostics`
  - 显示与 `run_item` 关联的：
    - `self_heal_attempts`
    - `run_evaluations`
  - 字段：
    - 状态 / verdict
    - explanation
    - replay run
    - derived version
    - linked artifact ids
- `R27 Actions`
  - run 级动作：
    - `Cancel`
  - run item 级动作：
    - `Evaluate`
    - `Self-heal`
    - `Extract Test Case`

### 可编辑字段

- 第一阶段 run 页面不做字段编辑
- 只允许动作，不允许改 run 元数据

### 不做的内容

- 不做 compare 页
- 不做 artifact 专页
- 不做 bulk rerun
- 不做高级统计图

### 需要补齐的后端能力

- `runs` 列表接口补齐 `status`、`selection_kind`、名称 / ID 搜索
- `run_items` 查询接口补齐按 run 内嵌展示所需字段
- 把当前内部 `step_events` / `artifacts` 查询能力整理为 console 可直接使用的接口
- 为 `run_item` 补齐 `self_heal_attempts` 列表和 `run_evaluations` 列表接口
- `Cancel` 以外不新增 run 级“便利动作”

## AI Workspace

### 目标

- 用户能看到 thread / exploration 列表
- 用户能看到 thread 消息、memory facts 和 exploration 详情
- 用户能在一个会话里继续发送消息
- 用户能查看 exploration 生成的 recording、artifact 和 case
- 用户能在必要时修改 thread 标题和 exploration 名称

### 页面结构

```text
+-------------------------------------------------------------------------------------------+
| W01 Title                             | W02 New Thread | W03 New Exploration               |
+-------------------------------------------------------------------------------------------+
| W04 Object Switcher | W05 Search | W06 Status Filter                                        |
+-------------------------------------------------------------------------------------------+
| W07 List                                                | W20 Detail                        |
| W08 row                                                 | W21 header                        |
| W09 row                                                 | W22 linked objects                |
| W10 pagination                                           | W23 content                       |
|                                                        | W24 facts or artifacts            |
|                                                        | W25 composer or actions           |
|                                                        | W26 edit section                  |
+-------------------------------------------------------------------------------------------+
```

### 顶部元素

- `W01 Page Title`
  - 标题：`AI Workspace`
  - 副标题：`Threads and explorations`
- `W02 Primary Action`
  - `New Thread`
- `W03 Secondary Action`
  - `New Exploration`
- `W04 Object Switcher`
  - `Threads / Explorations`
- `W05 Search`
  - 搜索标题、名称或 ID
- `W06 Status Filter`
  - 只在 `Explorations` 下显示
  - `All / Draft / Running / Succeeded / Failed / Stopped`

### 左栏列表

- `W07 List`
  - 默认宽度约 `420px`
- `W08 Row`
  - `Threads` 行显示：
    - 标题
    - 消息数
    - fact 数
    - 更新时间
    - thread ID
- `W09 Row`
  - `Explorations` 行显示：
    - 名称
    - 状态
    - `start_url`
    - `recording_id`
    - 更新时间
- `W10 Pagination`

### 右栏详情

- `W20 Detail`
  - 未选中时显示：`Select a thread or exploration`
- `W21 Header`
  - 元素：
    - 标题
    - 状态（仅 exploration）
    - 对象 ID
    - `Edit`，仅在对象支持编辑时显示
- `W22 Linked Objects`
  - `Threads` 显示：
    - 关联 `explorations`
  - `Explorations` 显示：
    - linked thread
    - linked recording
    - created test case
    - created test case version
- `W23 Content`
  - `Threads` 显示完整消息流
  - `Explorations` 显示：
    - `instruction`
    - `start_url`
    - `execution_mode`
    - `summary`
    - `last_snapshot_markdown`
    - `sample_dataset`
- `W24 Facts or Artifacts`
  - `Threads` 显示 `assistant_memory_facts`
  - `Explorations` 显示 `artifacts`
    - `kind`
    - `path`
    - `size_bytes`
- `W25 Composer or Actions`
  - `Threads`：
    - 多行输入框
    - `Send`
  - `Explorations`：
    - `Start`
    - `Stop`
    - `Open Recording`
    - `Publish as Test Case`
- `W26 Edit Section`
  - `Threads` 只允许修改：
    - 标题
  - `Explorations` 只允许修改：
    - 名称

### 必要动作

- thread：
  - `Send`
- exploration：
  - `Start`
  - `Stop`
  - `Open Recording`
  - `Publish as Test Case`

### 不做的内容

- 不做 prompt chips
- 不做 provider usage 统计
- 不做 memory 专页
- 不做 approvals 专页
- 不做 browser session 辅助面板

### 需要补齐的后端能力

- `assistant_threads` 列表接口，返回标题、消息数、fact 数、更新时间
- `assistant_threads` 标题更新接口
- `exploration_sessions` 列表接口，支持按 `status`、名称 / ID 搜索
- `exploration_sessions` 名称更新接口
- thread 与 exploration 的关联查询
- exploration 详情返回或补充查询其 `artifacts`、`sample_dataset`、产出的 `recording` / `test_case` / `version`

## 空态、加载态、错误态

### 空态

每页保留 1 个主动作，必要时保留 1 个次动作。

示例：

- Overview：
  - `New Run`
  - `New Exploration`
- Assets：
  - `New Asset`
- Runs：
  - `New Run`
- AI Workspace：
  - `New Thread`
  - `New Exploration`

### 加载态

- 保留页头
- 列表区域和详情区域使用 skeleton
- 不使用整页 spinner

### 错误态

- 页头下方出现错误条
- 提供：
  - `Retry`
  - `Copy error id`

## 可访问性

- 所有列表支持键盘上下移动
- 所有按钮支持明显 focus 态
- status 不只靠颜色，必须有文字
- 长 ID 默认截断，但 hover 可完整查看

## 第一阶段实现顺序

1. `app-shell`
2. `overview.page`
3. `assets.page`
4. `runs.page`
5. `ai-workspace.page`

建议先用假数据把这四页静态做出来，再接真实 API。

## 结论

`apps/console` 第一阶段不做“聪明”，先做“清楚”。

只要做到下面四件事，就足够支撑当前平台进入可用状态：

- 可以发起必要动作
- 可以看对象一览
- 可以看对象详情
- 可以修改必要元数据

其它一切便利性功能，延后。
