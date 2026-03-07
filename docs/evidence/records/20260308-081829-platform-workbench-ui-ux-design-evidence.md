---
title: 平台工作台 UI/UX 设计交付举证
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录通用测试平台工作台 UI/UX 设计文档落地、文档校验和现有 AI workflow 基线验证结果。
---

# 平台工作台 UI/UX 设计交付举证

## 执行元数据

- 日期：2026-03-08
- 执行者：squad
- 任务：基于已总结的方针，为通用测试平台设计工作台 UI/UX
- 环境：宿主机 Linux + Docker Compose 本地栈 + PostgreSQL + MinIO + `AI_PROVIDER=mock` workflow smoke

## 命令

1. `env AI_PROVIDER=mock docker compose up -d --force-recreate ai-orchestrator --wait`
2. `docker compose exec -T control-plane bash ./scripts/validate_docs.sh`
3. `docker compose exec -T tools node -e "const response=await fetch('http://ai-orchestrator:8081/healthz'); console.log(JSON.stringify({status:response.status, body:await response.json()}, null, 2));"`
4. `docker compose exec -T tools npm run smoke:ai-orchestrator:workflow`
5. `docker compose up -d --force-recreate ai-orchestrator --wait`
6. `docker compose exec -T tools node -e "const response=await fetch('http://ai-orchestrator:8081/healthz'); console.log(JSON.stringify({status:response.status, body:await response.json()}, null, 2));"`

## 关键输出

### docs validation

- `[validate-docs] markdown structure ok`
- `[validate-docs] ok`

### mock workflow health

- `status=200`
- `provider="mock"`
- `model="mock-deterministic"`
- `storeMode="postgres"`
- `capabilities=["assistant","exploration","self-heal","run-evaluation","browser-assist"]`

### workflow smoke

- `status="ok"`
- `threadId="9c96904d-6e3a-4343-a548-2edecccec41c"`
- `explorationId="c9c1049d-1106-4440-8ca5-1bb466beeb5b"`
- `recordingId="231edd7c-0423-4dc2-b104-a0ef5d90c8e0"`
- `testCaseId="0e140aef-88fb-4f8b-90a5-53bb049e49d4"`
- `brokenRunId="1ad93b38-2b4d-4b7a-980b-ec52921eccd5"`
- `replayRunId="39c17ce8-56bc-4bd5-a576-817503e4b526"`
- `evaluationId="190b0237-3889-4943-b93d-390d09ab7999"`
- `evaluationVerdict="passed_with_runtime_self_heal"`
- `submissionCount=2`

### restored default provider

- `status=200`
- `provider="google"`
- `model="gemini-2.5-pro"`
- `storeMode="postgres"`

## 说明

- 本轮是设计交付，没有新增前端运行时代码；验证重点是：
  - UI/UX 设计文档已纳入正式设计索引
  - 文档结构校验通过
  - 当前仓库的 AI workflow 基线仍然可运行，没有被设计交付扰动
- workflow smoke 继续覆盖：
  - assistant 发起探索
  - Playwright MCP 探索录屏
  - 录屏转 case
  - 故障注入后的 runtime self-heal
  - run evaluation 输出 `passed_with_runtime_self_heal`

## 产物位置

- 设计文档：
  - [20260308-081533-platform-workbench-ui-ux-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260308-081533-platform-workbench-ui-ux-design-task.md)
  - [README.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/README.md)
- 基线 smoke：
  - [run_ai_orchestrator_workflow_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_ai_orchestrator_workflow_smoke.mjs)

## 追溯关系

- AI 编排设计：[20260307-235950-langgraph-ai-orchestrator-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-235950-langgraph-ai-orchestrator-design-task.md)
- workflow self-heal 基线：[20260308-030435-ai-orchestrator-workflow-self-heal-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260308-030435-ai-orchestrator-workflow-self-heal-evidence.md)
