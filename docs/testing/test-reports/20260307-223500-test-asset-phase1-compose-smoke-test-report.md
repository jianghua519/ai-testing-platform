---
title: test asset phase1 compose smoke 测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 Phase 1 测试资产域在 Docker Compose 本地栈中的真实创建、版本化执行、结果落库和 MinIO artifact 验证。
---

# test asset phase1 compose smoke 测试报告

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
4. `docker compose run --rm --build tools node ./scripts/run_test_asset_phase1_compose_smoke.mjs`
5. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_contracts.sh`
6. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 结果

### Phase 1 资产接口

- smoke 真实调用了以下接口并全部通过：
  - `POST /api/v1/test-cases`
  - `PATCH /api/v1/test-cases/{test_case_id}`
  - `GET /api/v1/test-cases`
  - `GET /api/v1/test-cases/{test_case_id}`
  - `POST /api/v1/test-cases/{test_case_id}/versions`
  - `GET /api/v1/test-cases/{test_case_id}/versions`
  - `GET /api/v1/test-case-versions/{test_case_version_id}`
  - `POST /api/v1/test-case-versions/{test_case_version_id}:publish`
  - `GET /api/v1/test-case-versions/{test_case_version_id}/data-template`
  - `POST /api/v1/test-case-versions/{test_case_version_id}/dataset-rows`
  - `PATCH /api/v1/dataset-rows/{dataset_row_id}`
  - `DELETE /api/v1/dataset-rows/{dataset_row_id}`
  - `POST /api/v1/test-case-versions/{test_case_version_id}:bind-default-dataset`
- `data-template` 响应已经按外部契约输出 `source_type/value_type`，不再暴露内部 camelCase 字段。

### case_version 执行闭环

- 真实执行成功：
  - `runId="dc4d1ece-160d-4879-a547-458139e31018"`
  - `runItemId="048279f6-426d-413d-ac73-bb000a72aae2"`
  - `runStatus="succeeded"`
  - `selectionKind="case_version"`
- run 使用了绑定后的默认数据：
  - `testCaseId="9f133eb2-c059-442a-b0ed-de8b37193307"`
  - `version2Id="c16a0e58-3997-4f84-a31c-5bf2f85b5a80"`
  - `datasetRowId="4be27876-5ff0-493a-ad50-d737ea5835e2"`
  - 提交到目标站点的数据为 `displayName="Final Bound User"`、`fileName="avatar-run.txt"`
- `GET /api/v1/run-items/{run_item_id}` 能读回：
  - `summary.test_case_version_id`
  - `summary.dataset_row_id`
  - `summary.input_snapshot`

### 落库与对象存储

- `runs.selection_kind='case_version'` 已真实写入 tenant schema。
- `run_items` 已真实写入 `test_case_id / test_case_version_id / data_template_version_id / dataset_row_id / input_snapshot_json`。
- artifact 已真实上传到 MinIO，例如：
  - `s3://aiwtp-artifacts/artifacts/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/dc4d1ece-160d-4879-a547-458139e31018/048279f6-426d-413d-ac73-bb000a72aae2/attempt-0/traces/assert-result-passed.zip`
  - `s3://aiwtp-artifacts/artifacts/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/dc4d1ece-160d-4879-a547-458139e31018/048279f6-426d-413d-ac73-bb000a72aae2/attempt-0/steps/assert-result-passed.png`
- MinIO HeadObject 校验通过：
  - `trace.sizeBytes=32691`
  - `screenshot.sizeBytes=20959`

### schema 兼容补丁

- 这轮实现额外修复了两个真实问题：
  - `publish test case version` 的锁查询改为只锁主表行，避免 `LEFT JOIN ... FOR UPDATE` 在 PostgreSQL 下报错。
  - control-plane 启动时会自动 reconcile 已存在 tenant schema，补齐 `runs.selection_kind` 和 `run_items` 的 Phase 1 新列，避免老租户 schema 漏列导致 `case_version` 执行失败。

## 结论

- Phase 1 已经从设计稿推进到真实可运行状态：测试资产 CRUD、版本化、默认数据绑定、`case_version` 执行、结果落库和 artifact 入 MinIO 全部打通。
- 当前缺口已经收敛到 Phase 2/3 范围，例如 recording 分析、compare/report 运行时和从 run 反提 case。

## 关联证据

- [20260307-223500-test-asset-phase1-compose-smoke-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260307-223500-test-asset-phase1-compose-smoke-evidence.md)
