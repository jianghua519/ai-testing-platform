---
title: ai orchestrator workflow self-heal smoke 测试举证
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录 Playwright MCP 探索录屏、录屏转 case、自愈执行、run evaluation 与动作型 chatbot 的容器化闭环验证结果。
---

# ai orchestrator workflow self-heal smoke 测试举证

## 执行元数据

- 日期：2026-03-08
- 执行者：squad
- 任务：继续实现 Playwright MCP 探索录屏、录屏转 case、自愈执行、run evaluation、动作型 chatbot
- 环境：宿主机 Linux + Docker Compose 本地栈 + PostgreSQL + MinIO + `AI_PROVIDER=mock`

## 命令

1. `docker compose run --rm --build tools npm run typecheck`
2. `env AI_PROVIDER=mock docker compose up -d --force-recreate control-plane ai-orchestrator tools --wait`
3. `docker compose exec -T tools node -e "const response=await fetch('http://ai-orchestrator:8081/healthz'); console.log(JSON.stringify({status:response.status, body:await response.json()}, null, 2));"`
4. `docker compose exec -T tools npm run smoke:ai-orchestrator:workflow`
5. `docker compose exec -T postgres psql -U aiwtp -d aiwtp -c "select * from \"tenant-ai-workflow\".self_heal_attempts order by created_at desc limit 1;"`
6. `docker compose exec -T postgres psql -U aiwtp -d aiwtp -c "select * from \"tenant-ai-workflow\".runs order by created_at desc limit 2;"`
7. `docker compose up -d --force-recreate ai-orchestrator --wait`
8. `docker compose exec -T tools node -e "const response=await fetch('http://ai-orchestrator:8081/healthz'); console.log(JSON.stringify({status:response.status, body:await response.json()}, null, 2));"`
9. `docker compose exec -T control-plane bash ./scripts/validate_docs.sh`

## 关键输出

### health

- `status=200`
- `service="ai-orchestrator"`
- `provider="mock"`
- `model="mock-deterministic"`
- `storeMode="postgres"`
- `capabilities=["assistant","exploration","self-heal","run-evaluation","browser-assist"]`

### workflow smoke

- `status="ok"`
- `threadId="9ca52719-dba6-4595-b216-921157836501"`
- `explorationId="6b32bc26-96cf-4d3d-b560-fcf919293120"`
- `recordingId="62a8c051-d5de-4717-bfa0-34a3f2aad670"`
- `explorationArtifactCount=25`
- `testCaseId="c52388f3-885f-4999-9b1a-38ae36c49608"`
- `originalVersionId="721b2863-5c26-47ab-854f-154cece33277"`
- `brokenVersionId="3212beef-c5bb-423c-9733-b1ef9405e2be"`
- `brokenRunId="6f211205-408d-4432-a565-48c0fffbc626"`
- `brokenRunItemId="94fafe3b-f855-44fa-b3ec-74d19e32f318"`
- `replayRunId="994ffe4c-581a-428b-b14e-f11fcb3a5fa6"`
- `replayRunItemId="c471fd20-294f-44bd-8776-334c10650315"`
- `evaluationId="23825725-60be-44e1-8287-325f1f6a1f62"`
- `evaluationVerdict="passed_with_runtime_self_heal"`
- `submissionCount=2`

### self-heal persistence

- `self_heal_attempt.self_heal_attempt_id="1a1d8555-5a5a-47ea-8637-3a808a604382"`
- `self_heal_attempt.run_id="6f211205-408d-4432-a565-48c0fffbc626"`
- `self_heal_attempt.run_item_id="94fafe3b-f855-44fa-b3ec-74d19e32f318"`
- `self_heal_attempt.replay_run_id="994ffe4c-581a-428b-b14e-f11fcb3a5fa6"`
- `self_heal_attempt.status="succeeded"`

### run status snapshot

- 最新 `runs[0]`:
  - `run_id="994ffe4c-581a-428b-b14e-f11fcb3a5fa6"`
  - `status="passed"`
- 次新 `runs[1]`:
  - `run_id="6f211205-408d-4432-a565-48c0fffbc626"`
  - `status="failed"`

### restore default provider

- 复原后 `healthz` 返回：
  - `provider="google"`
  - `model="gemini-2.5-pro"`
  - `storeMode="postgres"`

### docs validation

- `[validate-docs] markdown structure ok`
- `[validate-docs] ok`

## 说明

- 这轮 workflow smoke 覆盖了整条闭环：
  - assistant chat 发起探索
  - Playwright MCP 在目标页面执行资料编辑并生成 recording/artifact
  - 根据最新录屏发布 test case
  - 对故意注入失败 locator 的 run 发起 self-heal
  - replay run 成功后产出 `passed_with_runtime_self_heal` 评估结论
- workflow smoke 运行时临时把 `AI_PROVIDER` 置为 `mock`，避免外部模型波动影响回归；验证结束后服务已恢复到 `.env` 默认 Google provider。
- 自愈验证不是 mock 分析，而是通过 control-plane `step override` + agent replay 真实执行。
- browser assist 在同一 thread 内读取当前 MCP 浏览器上下文，验证动作型 chatbot 能基于记忆和会话状态做出回答/动作。

## 产物位置

- 编排与动作：
  - [assistant-action-router.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/assistant-action-router.ts)
  - [assistant-graph.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/assistant-graph.ts)
  - [ai-orchestrator-server.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/ai-orchestrator-server.ts)
- Playwright MCP 与探索：
  - [browser-session-broker.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/browser-session-broker.ts)
  - [exploration-service.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/exploration-service.ts)
- 自愈与评估：
  - [self-heal-service.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/self-heal-service.ts)
  - [run-evaluation-service.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/run-evaluation-service.ts)
  - [postgres-orchestration-store.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/postgres-orchestration-store.ts)
  - [002_ai_orchestrator_orchestration.sql](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/sql/002_ai_orchestrator_orchestration.sql)
- smoke：
  - [run_ai_orchestrator_workflow_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_ai_orchestrator_workflow_smoke.mjs)
  - [profile_form_target.mjs](/home/jianghua519/ai-testing-platform/scripts/lib/profile_form_target.mjs)
- 适配层修复：
  - [assertion-executor.ts](/home/jianghua519/ai-testing-platform/packages/playwright-adapter/src/assertions/assertion-executor.ts)
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts)

## 追溯关系

- 设计任务：[20260307-235950-langgraph-ai-orchestrator-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-235950-langgraph-ai-orchestrator-design-task.md)
- Phase 1 基础 smoke：[20260308-011500-ai-orchestrator-phase1-compose-smoke-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260308-011500-ai-orchestrator-phase1-compose-smoke-evidence.md)
- PostgreSQL 持久化 smoke：[20260308-021500-ai-orchestrator-postgres-persistence-smoke-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260308-021500-ai-orchestrator-postgres-persistence-smoke-evidence.md)
