---
title: ai orchestrator phase1 compose smoke 测试举证
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录 ai-orchestrator Phase 1 最小 assistant / memory / chat 能力的容器化 smoke 命令、输出与阻塞项。
---

# ai orchestrator phase1 compose smoke 测试举证

## 执行元数据

- 日期：2026-03-08
- 执行者：squad
- 任务：实施 LangGraph ai-orchestrator Phase 1 基础能力
- 环境：宿主机 Linux + Docker Compose 本地栈

## 命令

1. `env AI_PROVIDER=mock docker compose build tools control-plane ai-orchestrator`
2. `env AI_PROVIDER=mock docker compose run --rm tools npm run control-plane:migrate:postgres`
3. `env AI_PROVIDER=mock docker compose up -d --force-recreate ai-orchestrator tools --wait`
4. `docker compose exec -T tools npm run typecheck`
5. `docker compose exec -T tools npm run smoke:ai-orchestrator:mock`
6. `docker compose exec -T tools node -e "const base=process.env.AI_ORCHESTRATOR_BASE_URL; const response=await fetch(base + '/healthz'); console.log(JSON.stringify({status: response.status, body: await response.json()}, null, 2));"`
7. `docker compose exec -T control-plane bash ./scripts/validate_docs.sh`

## 关键输出

### ai orchestrator health

- `status=200`
- `service="ai-orchestrator"`
- `provider="mock"`
- `model="mock-deterministic"`

### ai orchestrator smoke

- `status="ok"`
- `threadId="a387b12b-5963-4ca7-8b2e-017eb3eab338"`
- `factCount=1`
- `messageCount=4`
- `assistantReply="我记得：当前项目默认 AI provider 使用 google gemini"`

### typecheck

- `tsc -b packages/web-dsl-schema packages/dsl-compiler packages/playwright-adapter apps/web-worker apps/control-plane apps/ai-orchestrator`
- 结果：通过

### docs validation

- `[validate-docs] markdown structure ok`
- `[validate-docs] ok`

## 阻塞项

- `control-plane:migrate:postgres` 在现有本地数据库上失败：
  - `Error: migration checksum mismatch for 009_test_asset_phase2.sql`
- 影响：
  - 这次 `ai-orchestrator` smoke 不依赖新 migration，因此 assistant / memory / chat 服务验证已完成
  - 但本地 PostgreSQL migration 基线需要单独清理或重建后再继续跑依赖 migration 的全链路场景

## 产物位置

- 实现：
  - [apps/ai-orchestrator](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator)
  - [start_ai_orchestrator_server.mjs](/home/jianghua519/ai-testing-platform/scripts/start_ai_orchestrator_server.mjs)
  - [run_ai_orchestrator_mock_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_ai_orchestrator_mock_smoke.mjs)
- 配置：
  - [.env.example](/home/jianghua519/ai-testing-platform/.env.example)
  - [docker-compose.yml](/home/jianghua519/ai-testing-platform/docker-compose.yml)
  - [README.md](/home/jianghua519/ai-testing-platform/README.md)

## 追溯关系

- 设计任务：[20260307-235950-langgraph-ai-orchestrator-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-235950-langgraph-ai-orchestrator-design-task.md)
