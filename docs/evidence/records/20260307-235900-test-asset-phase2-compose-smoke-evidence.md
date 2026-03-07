---
title: test asset phase2 compose smoke 测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 Phase 2 recording 资产真实 smoke 的命令、关键输出和产物位置。
---

# test asset phase2 compose smoke 测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：squad
- 任务：实施 test asset domain model Phase 2
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

1. `docker compose run --rm --build tools npm run build`
2. `docker compose run --rm tools npm run control-plane:migrate:postgres`
3. `docker compose up -d --build control-plane`
4. `docker compose ps control-plane`
5. `docker compose run --rm --build tools node ./scripts/run_test_asset_phase2_compose_smoke.mjs`
6. `docker compose run --rm --build tools node ./scripts/run_test_asset_phase1_compose_smoke.mjs`
7. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_contracts.sh`
8. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 关键输出

### migration

- `appliedCount=9`
- `version="009_test_asset_phase2.sql"`
- `appliedAt="2026-03-07T13:36:38.649Z"`

### control-plane health

- `service="ai-testing-platform-control-plane-1"`
- `status="Up 30 seconds (healthy)"`

### phase2 smoke

- `status="ok"`
- `recordingId="13a0c1de-708d-44c1-bebf-e271c5c05efc"`
- `analysisJobId="ccb9eee2-3084-455d-bbf0-eca977eedc3a"`
- `testCaseId="dd780da1-5dbd-4cb2-bcb5-795f0cded624"`
- `publishedVersionId="38729875-9f90-4b9d-aab7-114eebd64e27"`
- `extractedVersionId="b3ccbecf-6da3-4b2e-87b7-5012ffb0a365"`
- `runId="f05ccbcf-59d7-4af1-8d93-49af11062443"`
- `runItemId="da8f1766-0bfe-40ca-a733-1c854038255d"`
- `runStatus="succeeded"`
- `selectionKind="case_version"`
- `submission={"displayName":"Recorded Default User","fileName":"avatar-recording.txt"}`
- `targetHitCount=3`

### phase2 artifact

- `trace={"artifactType":"trace","sizeBytes":34887}`
- `screenshot={"artifactType":"screenshot","sizeBytes":23087}`
- artifact URI sample:
  - `s3://aiwtp-artifacts/artifacts/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/f05ccbcf-59d7-4af1-8d93-49af11062443/da8f1766-0bfe-40ca-a733-1c854038255d/attempt-0/traces/recording-step-7-passed.zip`
  - `s3://aiwtp-artifacts/artifacts/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/f05ccbcf-59d7-4af1-8d93-49af11062443/da8f1766-0bfe-40ca-a733-1c854038255d/attempt-0/steps/recording-step-7-passed.png`

### phase1 regression smoke

- `status="ok"`
- `runId="4bcb0766-73f6-4797-b833-7059bb5ebee4"`
- `runItemId="bcc8dc16-7aef-4dd8-88e7-fe95d7222ae2"`
- `runStatus="succeeded"`
- `selectionKind="case_version"`

## 产物位置

- 实现：
  - [009_test_asset_phase2.sql](/home/jianghua519/ai-testing-platform/apps/control-plane/sql/009_test_asset_phase2.sql)
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [control-plane-server.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-server.ts)
  - [postgres-schema.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-schema.ts)
  - [test-assets.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/test-assets.ts)
  - [types.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/types.ts)
- 契约：
  - [openapi.yaml](/home/jianghua519/ai-testing-platform/contracts/openapi.yaml)
- smoke：
  - [run_test_asset_phase2_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_test_asset_phase2_compose_smoke.mjs)
  - [run_test_asset_phase1_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_test_asset_phase1_compose_smoke.mjs)

## 追溯关系

- 测试报告：[20260307-235900-test-asset-phase2-compose-smoke-test-report.md](/home/jianghua519/ai-testing-platform/docs/testing/test-reports/20260307-235900-test-asset-phase2-compose-smoke-test-report.md)
- 设计任务：[20260307-211047-test-asset-domain-model-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-211047-test-asset-domain-model-design-task.md)
