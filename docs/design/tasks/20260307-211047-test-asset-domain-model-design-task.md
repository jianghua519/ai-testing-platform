---
title: 测试资产领域模型与版本化执行设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 定义测试 case、case version、数据模板、默认测试数据、执行结果和从结果反提 case 的领域模型边界，作为录制到报告能力建设的下一阶段设计基线。
---

# 测试资产领域模型与版本化执行设计说明

## 背景

当前仓库已经有一条可运行的执行闭环：

- `control-plane` 能处理 `runs / run_items / step_events / artifacts` 结果投影。
- `web-worker` 能执行 `WebStepPlanDraft`，并真实采集 `screenshot / trace / video`。
- artifact 已支持 S3/MinIO 上传与下载。

但当前仓库还没有正式的“测试资产层”。现状在 [contracts/openapi.yaml](/home/jianghua519/ai-testing-platform/contracts/openapi.yaml#L843) 和 [录屏能力 GAP 文档](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-221500-recording-capability-gap-design-task.md#L64) 已经很明确：

- 执行入口只有 `inline_web_plan`
- 没有 `test_case / test_case_version / dataset_row`
- `dataset` 仍是编译器占位类型，尚未接入变量解析

因此下一阶段的重点不是重写 runner，而是补齐“测试资产化执行”的领域模型。

## 设计原则

### 1. `test_case` 是稳定身份，`test_case_version` 是不可变快照

- `test_case` 负责名称、状态、归属、标签、最新版本指针。
- `test_case_version` 负责 `dsl_plan`、结构化步骤、变量槽位、模板快照和来源关系。
- 编辑 case 的行为本质上是“创建新版本”，不是原地修改执行内容。

### 2. 数据模板和默认测试数据必须按版本绑定

- 数据模板属于执行内容的一部分，因此不能只挂在 `test_case` 上。
- 最小正确做法是：
  - `test_case_version -> data_template_version`
  - `test_case_version -> default_dataset_row`
- 否则 case 升版后，旧数据行可能与新变量结构不兼容。

### 3. 执行结果是事实，采用 append-only

- `runs / run_items / step_events / artifacts` 只追加写，不修改结果事实。
- 允许：
  - create
  - list / get / download
  - cancel / retry / compare
  - retention / archive / delete
- 不允许：
  - 修改已完成 run 的状态
  - 改写 step 结果
  - 修改 artifact 元数据来伪造执行事实

### 4. artifact 落对象存储，元数据落数据库

- 二进制内容存 MinIO/S3。
- 元数据、关联关系、保留期、下载策略存 PostgreSQL。
- 这与当前仓库已有实现一致：
  - [apps/web-worker/src/session/artifact-storage.ts](/home/jianghua519/ai-testing-platform/apps/web-worker/src/session/artifact-storage.ts)
  - [apps/control-plane/src/runtime/postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts)

### 5. 从执行结果反提 case 只能生成草稿，不直接覆盖正式版本

- `video / trace / screenshot` 是执行证据，不是测试资产主编辑源。
- 从 `run / run_item / recording` 派生 case 时，应当创建：
  - 新 case draft
  - 或现有 case 的新 draft version
- 同时写入 lineage：
  - `source_recording_id`
  - `source_run_id`
  - `derived_from_case_version_id`

## 推荐领域模型

### 1. Recording 域

#### `recordings`

用途：

- 承载人工录制或自动探索录制的会话头信息。

关键字段：

- `recording_id`
- `tenant_id`
- `project_id`
- `name`
- `status`
- `source_type` (`manual` | `auto_explore` | `run_replay`)
- `started_at`
- `finished_at`
- `created_by`

#### `recording_events`

用途：

- 持久化用户操作事件、页面上下文和分析输入素材。

关键字段：

- `recording_event_id`
- `recording_id`
- `seq_no`
- `event_type`
- `page_url`
- `locator_json`
- `payload_json`
- `captured_at`

#### `recording_analysis_jobs`

用途：

- 异步分析录制，产出 DSL、结构化步骤和模板草稿。

关键字段：

- `recording_analysis_job_id`
- `recording_id`
- `status`
- `dsl_plan_json`
- `structured_plan_json`
- `data_template_draft_json`
- `started_at`
- `finished_at`

### 2. Test Asset 域

#### `test_cases`

用途：

- case 的稳定身份和管理头信息。

关键字段：

- `test_case_id`
- `tenant_id`
- `project_id`
- `name`
- `status` (`draft` | `active` | `archived`)
- `latest_version_id`
- `latest_published_version_id`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

#### `test_case_versions`

用途：

- 执行内容不可变快照。

关键字段：

- `test_case_version_id`
- `test_case_id`
- `version_no`
- `version_label`
- `status` (`draft` | `published` | `archived`)
- `dsl_plan_json`
- `structured_plan_json`
- `browser_profile_json`
- `data_template_version_id`
- `source_recording_id`
- `source_run_id`
- `derived_from_case_version_id`
- `change_summary`
- `created_by`
- `created_at`

说明：

- run item 只能绑定 `test_case_version_id`。
- 允许“从 draft 发布”，但发布后版本不可修改。

### 3. Data Template 域

#### `data_templates`

用途：

- 模板的稳定身份，用于表达“这组数据槽位属于哪个 case”。

关键字段：

- `data_template_id`
- `test_case_id`
- `name`
- `status`
- `latest_version_id`
- `created_at`
- `updated_at`

#### `data_template_versions`

用途：

- 保存变量槽位和校验规则的不可变快照。

关键字段：

- `data_template_version_id`
- `data_template_id`
- `version_no`
- `schema_json`
- `validation_rules_json`
- `created_by`
- `created_at`

建议：

- P1 阶段可以先保持 `test_case_version` 与 `data_template_version` 1:1 生成，降低复杂度。

#### `dataset_rows`

用途：

- 按模板结构保存测试数据行。

关键字段：

- `dataset_row_id`
- `data_template_version_id`
- `test_case_id`
- `name`
- `status` (`active` | `archived`)
- `values_json`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

说明：

- `values_json` 必须通过模板版本校验。
- 同一条数据行被修改后，历史 run 不应受影响，因此 run item 必须保存输入快照。

#### `case_default_dataset_bindings`

用途：

- 绑定某个 case version 的默认数据行。

关键字段：

- `test_case_version_id`
- `dataset_row_id`
- `bound_at`
- `bound_by`

说明：

- 默认数据是版本级绑定，不是 case 级全局设置。

### 4. Execution 域

#### `runs`

沿用当前表，但建议扩展：

- `selection_kind`
- `baseline_run_id`
- `report_policy_json`

#### `run_items`

沿用当前表，但建议新增：

- `test_case_id`
- `test_case_version_id`
- `data_template_version_id`
- `dataset_row_id`
- `input_snapshot_json`
- `source_recording_id`

说明：

- `input_snapshot_json` 保存执行时实际注入变量，保证后续追溯和复跑不受数据行变更影响。

#### `step_events`

继续沿用当前模型。

建议补充：

- `assertion_summary_json`
- `extracted_variables_json`

#### `artifacts`

继续沿用当前模型，不新增业务语义，只补关联使用规范：

- step 级 artifact：截图、trace、失败 DOM、网络包
- run / run_item 级 artifact：video、报告、导出文件

### 5. Report 域

#### `report_jobs`

用途：

- 异步生成执行报告、比对报告、case 覆盖报告。

关键字段：

- `report_job_id`
- `tenant_id`
- `project_id`
- `report_type`
- `source_kind`
- `source_ref_id`
- `status`
- `artifact_id`
- `started_at`
- `finished_at`

说明：

- 该域与 [contracts/openapi.yaml](/home/jianghua519/ai-testing-platform/contracts/openapi.yaml) 中已有 `report-jobs` 契约对齐。

## 生命周期建议

### 1. 从录制发布为 case

1. 创建 `recording`
2. 写入 `recording_events`
3. 创建 `recording_analysis_job`
4. 产出 `dsl_plan_json + structured_plan_json + data_template_draft_json`
5. 发布为：
   - `test_case`
   - `test_case_version`
   - `data_template`
   - `data_template_version`
   - 默认 `dataset_row`
   - `case_default_dataset_binding`

### 2. 手工编辑 case

1. 读取最新 draft 或 published version
2. 基于当前版本内容创建新 draft version
3. 重新校验模板与默认数据绑定
4. 发布后将 `latest_published_version_id` 指向新版本

### 3. 执行 case

建议在公开 API 上兼容两种选择：

- `selection.kind = inline_web_plan`
- `selection.kind = case_version`

可选扩展：

- `selection.kind = test_case`
  - 由 control-plane 在提交时解析为 `latest_published_version_id`

执行展开规则：

1. 解析 `test_case_version_id`
2. 解析 `dataset_row_id`，未显式指定时取默认绑定
3. 校验该数据行属于当前模板版本
4. 将 `dataset_row.values_json` 注入 `variableContext`
5. 同时把解析后的输入写入 `run_items.input_snapshot_json`

### 4. 从执行结果反提 case

建议支持两个入口：

- `POST /api/v1/run-items/{run_item_id}:extract-test-case`
- `POST /api/v1/runs/{run_id}:extract-test-case`

输出语义：

- 默认生成新 draft version
- 若未绑定既有 case，则生成新 case draft

禁止行为：

- 直接覆盖已发布版本
- 直接把 run 中采集的视频当成录制事实源

## API 草案

### 1. Case

- `POST /api/v1/test-cases`
- `GET /api/v1/test-cases`
- `GET /api/v1/test-cases/{test_case_id}`
- `PATCH /api/v1/test-cases/{test_case_id}`
- `DELETE /api/v1/test-cases/{test_case_id}`

### 2. Case Version

- `GET /api/v1/test-cases/{test_case_id}/versions`
- `POST /api/v1/test-cases/{test_case_id}/versions`
- `GET /api/v1/test-case-versions/{test_case_version_id}`
- `POST /api/v1/test-case-versions/{test_case_version_id}:publish`
- `POST /api/v1/test-case-versions/{test_case_version_id}:archive`
- `GET /api/v1/test-cases/{test_case_id}/versions:diff?base_version_id=...&target_version_id=...`

### 3. Data Template / Dataset

- `GET /api/v1/test-case-versions/{test_case_version_id}/data-template`
- `GET /api/v1/data-template-versions/{data_template_version_id}`
- `GET /api/v1/test-case-versions/{test_case_version_id}/dataset-rows`
- `POST /api/v1/test-case-versions/{test_case_version_id}/dataset-rows`
- `PATCH /api/v1/dataset-rows/{dataset_row_id}`
- `DELETE /api/v1/dataset-rows/{dataset_row_id}`
- `POST /api/v1/test-case-versions/{test_case_version_id}:bind-default-dataset`

### 4. Recording / Derivation

- `POST /api/v1/recordings`
- `GET /api/v1/recordings/{recording_id}`
- `POST /api/v1/recordings/{recording_id}/events`
- `POST /api/v1/recordings/{recording_id}:analyze-dsl`
- `POST /api/v1/recordings/{recording_id}:publish-test-case`
- `POST /api/v1/run-items/{run_item_id}:extract-test-case`

### 5. Execution

- 继续保留 `POST /api/v1/runs`
- 扩展 `RunSelection.kind`：
  - `inline_web_plan`
  - `case_version`

不建议第一阶段直接暴露 suite / execution plan；先把 case version 执行打稳。

## 不建议的做法

- 把默认数据绑在 `test_case` 上，而不是 `test_case_version`
- 让 run 只记录 `dataset_row_id`，不记录输入快照
- 允许修改已完成 run 的结果内容
- 从执行结果直接覆盖当前 published version
- 把 `video` 等执行 artifact 当成录制资产主来源

## 与当前仓库的衔接方式

### 已可复用

- `web-worker -> dsl-compiler -> playwright-adapter`
- `runner-results -> runs / run_items / step_events / artifacts`
- `artifact -> MinIO/S3 + PostgreSQL metadata`

相关实现与证据：

- [apps/control-plane/src/runtime/postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
- [apps/web-worker/src/session/artifact-storage.ts](/home/jianghua519/ai-testing-platform/apps/web-worker/src/session/artifact-storage.ts)
- [docs/testing/test-reports/20260307-150657-artifact-object-storage-retention-test-report.md](/home/jianghua519/ai-testing-platform/docs/testing/test-reports/20260307-150657-artifact-object-storage-retention-test-report.md)

### 需要新增

- 测试资产表与 API
- case version diff
- dataset 校验与绑定
- run 反提 case 流程
- report job 运行时实现

## 分阶段建议

### Phase 1

- 新增 `test_cases / test_case_versions`
- 新增 `data_templates / data_template_versions / dataset_rows / case_default_dataset_bindings`
- 扩展 `RunSelection.kind=case_version`
- 扩展 `run_items` 关联字段和 `input_snapshot_json`

### Phase 2

- 新增 `recordings / recording_events / recording_analysis_jobs`
- 支持从 recording 发布 case
- 支持从 run item 反提 case draft

### Phase 3

- 新增 `report_jobs` 实现
- 新增 `runs:compare`
- 补前端 case / dataset / compare / report 工作台

## 结论

用户提出的方向本身是对的，但要成立为“最佳实践”，必须把以下四条作为硬约束：

- case 内容版本不可变
- 默认数据按版本绑定
- 执行结果 append-only
- 从结果反提只生成 draft

按这套模型推进，可以在不推翻现有执行底座的前提下，把平台从“inline plan 执行器”演进为“正式测试资产平台”。
