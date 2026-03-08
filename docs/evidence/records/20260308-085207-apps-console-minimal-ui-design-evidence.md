---
title: apps console 最小工作台 UI 设计交付举证
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录 apps/console 最小工作台 UI 设计文档落地、文档校验通过和现有 AI workflow 基线验证结果。
---

# apps console 最小工作台 UI 设计交付举证

## 执行元数据

- 日期：2026-03-08
- 执行者：squad
- 任务：撤回过于复杂的详细 UI 设计，重新设计 apps/console 的最小工作台
- 环境：宿主机 Linux + Docker Compose 本地栈 + PostgreSQL + MinIO + `AI_PROVIDER=mock` workflow smoke

## 命令

1. `git reset --mixed HEAD~1`
2. `env AI_PROVIDER=mock docker compose up -d --force-recreate ai-orchestrator --wait`
3. `docker compose exec -T control-plane bash ./scripts/validate_docs.sh`
4. `docker compose exec -T tools node -e "const response=await fetch('http://ai-orchestrator:8081/healthz'); console.log(JSON.stringify({status:response.status, body:await response.json()}, null, 2));"`
5. `docker compose exec -T tools npm run smoke:ai-orchestrator:workflow`
6. `docker compose up -d --force-recreate ai-orchestrator --wait`
7. `docker compose exec -T tools node -e "const response=await fetch('http://ai-orchestrator:8081/healthz'); console.log(JSON.stringify({status:response.status, body:await response.json()}, null, 2));"`

## 关键输出

### docs validation

- `[validate-docs] markdown structure ok`
- `[validate-docs] ok`

### mock workflow health

- `status=200`
- `provider="mock"`
- `model="mock-deterministic"`
- `storeMode="postgres"`

### workflow smoke

- `status="ok"`
- `threadId="d829f1c8-5049-42b7-852e-550f6d2c6a47"`
- `explorationId="83dd8293-5987-447e-98cb-7ef3a7e4cc16"`
- `recordingId="aa3655d7-8ee5-45fa-814b-2f7cd52b3c63"`
- `testCaseId="44e674c3-44d3-45da-9e29-2fa86a62be76"`
- `brokenRunId="e6e6f44b-3989-4c23-bb77-ffcd0c14ff49"`
- `replayRunId="c6c50172-d9c5-4870-ac87-ae16179a764f"`
- `evaluationId="c1bf2762-984c-499f-957a-982764cf35b8"`
- `evaluationVerdict="passed_with_runtime_self_heal"`
- `submissionCount=2`

### restored default provider

- `status=200`
- `provider="google"`
- `model="gemini-2.5-pro"`
- `storeMode="postgres"`

## 说明

- 本轮主动撤回了上一个未推送的详细 UI 设计提交，重新收敛为最小工作台。
- 新设计只保留四类能力：
  - 操作
  - 一览
  - 详情
  - 必要编辑
- 明确去掉了：
  - saved views
  - 全局搜索以外的便利功能堆叠
  - 右侧多用途上下文栏
  - provider usage、recommendation、prompt chips 等非必要元素

## 产物位置

- 最小工作台设计：
  - [20260308-085207-apps-console-minimal-ui-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260308-085207-apps-console-minimal-ui-design-task.md)
- 上一层平台方针：
  - [20260308-081533-platform-workbench-ui-ux-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260308-081533-platform-workbench-ui-ux-design-task.md)
- workflow smoke：
  - [run_ai_orchestrator_workflow_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_ai_orchestrator_workflow_smoke.mjs)

## 追溯关系

- 平台方针举证：[20260308-081829-platform-workbench-ui-ux-design-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260308-081829-platform-workbench-ui-ux-design-evidence.md)
- workflow 自愈举证：[20260308-030435-ai-orchestrator-workflow-self-heal-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260308-030435-ai-orchestrator-workflow-self-heal-evidence.md)
