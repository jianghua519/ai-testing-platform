---
title: test asset phase2 compose smoke 测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 Phase 2 recording 资产、分析发布、执行提取与 MinIO artifact 的真实 compose smoke 验证。
---

# test asset phase2 compose smoke 测试报告

## 环境

- 日期：2026-03-07
- 执行者：squad
- 仓库：/home/jianghua519/ai-testing-platform
- 环境：宿主机 Linux + Docker Compose 本地栈
- 数据库：PostgreSQL 18.3
- 对象存储：MinIO（S3 兼容）

## 执行检查

1. `docker compose run --rm --build tools npm run build`
2. `docker compose run --rm tools npm run control-plane:migrate:postgres`
3. `docker compose up -d --build control-plane`
4. `docker compose run --rm --build tools node ./scripts/run_test_asset_phase2_compose_smoke.mjs`
5. `docker compose run --rm --build tools node ./scripts/run_test_asset_phase1_compose_smoke.mjs`
6. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_contracts.sh`
7. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 结果

### Phase 2 recording 资产接口

- smoke 真实调用并通过了以下接口：
  - `POST /api/v1/recordings`
  - `GET /api/v1/recordings/{recording_id}`
  - `POST /api/v1/recordings/{recording_id}/events`
  - `POST /api/v1/recordings/{recording_id}:analyze-dsl`
  - `POST /api/v1/recordings/{recording_id}:publish-test-case`
  - `POST /api/v1/run-items/{run_item_id}:extract-test-case`
- `analyze-dsl` 已真实产出 DSL 计划与模板草稿：
  - `analysisJobId="ccb9eee2-3084-455d-bbf0-eca977eedc3a"`
  - `recordingId="13a0c1de-708d-44c1-bebf-e271c5c05efc"`
  - `dsl_plan.steps.length=7`
  - `data_template_draft.fields=["avatarFilePath:file_ref:file","displayName:variable_ref:string"]`

### 发布、执行与反提闭环

- recording 发布成功：
  - `testCaseId="dd780da1-5dbd-4cb2-bcb5-795f0cded624"`
  - `publishedVersionId="38729875-9f90-4b9d-aab7-114eebd64e27"`
  - `version.status="published"`
  - `version.source_recording_id="13a0c1de-708d-44c1-bebf-e271c5c05efc"`
- 真实执行成功：
  - `runId="f05ccbcf-59d7-4af1-8d93-49af11062443"`
  - `runItemId="da8f1766-0bfe-40ca-a733-1c854038255d"`
  - `runStatus="succeeded"`
  - `selectionKind="case_version"`
  - 目标站点真实收到 `displayName="Recorded Default User"`、`fileName="avatar-recording.txt"`
- 从执行结果反提成功：
  - `derivation_mode="new_version"`
  - `extractedVersionId="b3ccbecf-6da3-4b2e-87b7-5012ffb0a365"`
  - `source_run_id="f05ccbcf-59d7-4af1-8d93-49af11062443"`
  - `derived_from_case_version_id="38729875-9f90-4b9d-aab7-114eebd64e27"`
  - `default_dataset_row.values` 回填为执行时的 `input_snapshot`

### 落库与对象存储

- `009_test_asset_phase2.sql` 已真实应用，`appliedAt="2026-03-07T13:36:38.649Z"`。
- tenant schema 已真实写入：
  - `recordings.status='published'`
  - `recording_events` 共 `7` 条
  - `recording_analysis_jobs.status='succeeded'`
  - `run_items.source_recording_id='13a0c1de-708d-44c1-bebf-e271c5c05efc'`
  - `test_case_versions` 第二个版本带有 `source_run_id` 和 `derived_from_case_version_id`
- artifact 已真实上传到 MinIO，例如：
  - `s3://aiwtp-artifacts/artifacts/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/f05ccbcf-59d7-4af1-8d93-49af11062443/da8f1766-0bfe-40ca-a733-1c854038255d/attempt-0/traces/recording-step-7-passed.zip`
  - `s3://aiwtp-artifacts/artifacts/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/f05ccbcf-59d7-4af1-8d93-49af11062443/da8f1766-0bfe-40ca-a733-1c854038255d/attempt-0/steps/recording-step-7-passed.png`
- MinIO HeadObject 校验通过：
  - `trace.sizeBytes=34887`
  - `screenshot.sizeBytes=23087`

### 回归

- Phase 1 compose smoke 在本轮变更后再次执行通过：
  - `runId="4bcb0766-73f6-4797-b833-7059bb5ebee4"`
  - `runItemId="bcc8dc16-7aef-4dd8-88e7-fe95d7222ae2"`
  - `runStatus="succeeded"`
  - `selectionKind="case_version"`
- 说明 Phase 2 没有破坏既有 `test-case / dataset / case_version` 执行闭环。

### 实际修复点

- 真实迁移执行暴露了 `009_test_asset_phase2.sql` 中 JSON 默认值转义错误，已修复后成功应用。
- recording 分析产出的 DSL 现在默认带 `artifactPolicy.screenshot/trace=always`，保证发布后首次执行就有可追溯证据。

## 结论

- Phase 2 已从设计稿推进到真实可运行状态：recording 资产、事件分析、发布 case、执行落库、artifact 入 MinIO、从 run item 反提 draft version 全部打通。
- 剩余主缺口收敛到 Phase 3 范围，例如 compare/report 运行时和更完整的 recording 工作台。

## 关联证据

- [20260307-235900-test-asset-phase2-compose-smoke-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260307-235900-test-asset-phase2-compose-smoke-evidence.md)
