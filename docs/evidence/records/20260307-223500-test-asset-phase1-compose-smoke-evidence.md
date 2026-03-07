---
title: test asset phase1 compose smoke 测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 Phase 1 测试资产域真实 smoke 的命令、关键输出和产物位置。
---

# test asset phase1 compose smoke 测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：squad
- 任务：实施 test asset domain model Phase 1
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

1. `docker compose run --rm --build tools npm run build`
2. `docker compose run --rm tools npm run control-plane:migrate:postgres`
3. `docker compose up -d --build control-plane`
4. `docker compose run --rm --build tools node ./scripts/run_test_asset_phase1_compose_smoke.mjs`
5. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_contracts.sh`
6. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 关键输出

### migration

- `appliedCount=8`
- `version="008_test_asset_phase1.sql"`
- `appliedAt="2026-03-07T13:00:52.508Z"`

### smoke

- `status="ok"`
- `runId="dc4d1ece-160d-4879-a547-458139e31018"`
- `runItemId="048279f6-426d-413d-ac73-bb000a72aae2"`
- `testCaseId="9f133eb2-c059-442a-b0ed-de8b37193307"`
- `version1Id="f756976f-0ae8-4f81-a74f-ceb3ecf3fc9e"`
- `version2Id="c16a0e58-3997-4f84-a31c-5bf2f85b5a80"`
- `datasetRowId="4be27876-5ff0-493a-ad50-d737ea5835e2"`
- `runStatus="succeeded"`
- `selectionKind="case_version"`
- `submission={"displayName":"Final Bound User","fileName":"avatar-run.txt"}`
- `targetHitCount=3`

### artifact

- `trace={"artifactType":"trace","sizeBytes":32691}`
- `screenshot={"artifactType":"screenshot","sizeBytes":20959}`
- artifact URI sample:
  - `s3://aiwtp-artifacts/artifacts/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/dc4d1ece-160d-4879-a547-458139e31018/048279f6-426d-413d-ac73-bb000a72aae2/attempt-0/traces/assert-result-passed.zip`
  - `s3://aiwtp-artifacts/artifacts/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/dc4d1ece-160d-4879-a547-458139e31018/048279f6-426d-413d-ac73-bb000a72aae2/attempt-0/steps/assert-result-passed.png`

## 产物位置

- 实现：
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [control-plane-server.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-server.ts)
  - [postgres-schema.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-schema.ts)
  - [008_test_asset_phase1.sql](/home/jianghua519/ai-testing-platform/apps/control-plane/sql/008_test_asset_phase1.sql)
  - [types.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/types.ts)
  - [test-assets.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/test-assets.ts)
- 契约：
  - [openapi.yaml](/home/jianghua519/ai-testing-platform/contracts/openapi.yaml)
- smoke：
  - [run_test_asset_phase1_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_test_asset_phase1_compose_smoke.mjs)

## 追溯关系

- 测试报告：[20260307-223500-test-asset-phase1-compose-smoke-test-report.md](/home/jianghua519/ai-testing-platform/docs/testing/test-reports/20260307-223500-test-asset-phase1-compose-smoke-test-report.md)
- 设计任务：[20260307-211047-test-asset-domain-model-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-211047-test-asset-domain-model-design-task.md)
