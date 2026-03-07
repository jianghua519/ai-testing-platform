---
title: ai orchestrator postgres persistence smoke 测试举证
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录 ai-orchestrator assistant thread/message/memory fact 落库与重启后可恢复的容器化验证结果。
---

# ai orchestrator postgres persistence smoke 测试举证

## 执行元数据

- 日期：2026-03-08
- 执行者：squad
- 任务：为 ai-orchestrator 增加 PostgreSQL 持久化
- 环境：宿主机 Linux + Docker Compose 本地栈 + 独立 PostgreSQL 数据库 `aiwtp_ai_orch_persist`

## 命令

1. `docker compose build ai-orchestrator tools`
2. `docker compose exec -T postgres sh -lc "psql -U aiwtp -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='aiwtp_ai_orch_persist'\" | grep -q 1 || psql -U aiwtp -d postgres -c \"CREATE DATABASE aiwtp_ai_orch_persist\""`
3. `env AI_PROVIDER=mock AI_ORCHESTRATOR_STORE_MODE=postgres AI_ORCHESTRATOR_DATABASE_URL=postgresql://aiwtp:aiwtp-password@postgres:5432/aiwtp_ai_orch_persist docker compose up -d --force-recreate ai-orchestrator tools --wait`
4. `docker compose exec -T tools npm run typecheck`
5. `docker compose exec -T tools node -e "const response=await fetch(process.env.AI_ORCHESTRATOR_BASE_URL + '/healthz'); console.log(JSON.stringify({status: response.status, body: await response.json()}, null, 2));"`
6. `docker compose exec -T tools npm run smoke:ai-orchestrator:postgres:persistence`
7. `env AI_PROVIDER=mock AI_ORCHESTRATOR_STORE_MODE=postgres AI_ORCHESTRATOR_DATABASE_URL=postgresql://aiwtp:aiwtp-password@postgres:5432/aiwtp_ai_orch_persist docker compose up -d --force-recreate ai-orchestrator --wait`
8. `docker compose exec -T tools env AI_ORCHESTRATOR_VERIFY_THREAD_ID=0fb1cec6-3183-4b99-a45c-aaa596c8ac41 npm run smoke:ai-orchestrator:postgres:persistence`
9. `docker compose exec -T tools npm run ai-orchestrator:migrate:postgres`
10. `docker compose exec -T postgres psql -U aiwtp -d aiwtp_ai_orch_persist -c "select (select count(*) from assistant_thread_locators) as locator_count, (select count(*) from \"tenant-ai-persist\".assistant_threads) as thread_count, (select count(*) from \"tenant-ai-persist\".assistant_messages) as message_count, (select count(*) from \"tenant-ai-persist\".assistant_memory_facts) as fact_count;"`
11. `docker compose exec -T control-plane bash ./scripts/validate_docs.sh`

## 关键输出

### health

- `status=200`
- `service="ai-orchestrator"`
- `provider="mock"`
- `model="mock-deterministic"`
- `storeMode="postgres"`

### persistence seed

- `status="seeded"`
- `threadId="0fb1cec6-3183-4b99-a45c-aaa596c8ac41"`
- `factCount=1`
- `messageCount=4`

### restart verification

- `status="verified"`
- `threadId="0fb1cec6-3183-4b99-a45c-aaa596c8ac41"`
- `factCount=1`
- `messageCount=4`

### explicit migration runner

- `status="ok"`
- `appliedCount=1`
- `latestVersion="001_ai_orchestrator_global.sql"`

### direct PostgreSQL row count

- `locator_count=1`
- `thread_count=1`
- `message_count=4`
- `fact_count=1`

### docs validation

- `[validate-docs] markdown structure ok`
- `[validate-docs] ok`

## 说明

- 为避免现有本地 `aiwtp` 数据库中的 `control-plane` migration checksum 污染本轮验证，本次 smoke 使用了独立数据库 `aiwtp_ai_orch_persist`。
- 这次验证覆盖了：
  - 公共 locator 表 `assistant_thread_locators`
  - tenant schema 表 `assistant_threads`
  - tenant schema 表 `assistant_messages`
  - tenant schema 表 `assistant_memory_facts`
  - 服务重启后的 thread / message / memory 读取恢复

## 产物位置

- 实现：
  - [postgres-thread-store.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/postgres-thread-store.ts)
  - [postgres-migrations.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/postgres-migrations.ts)
  - [postgres-schema.ts](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/src/runtime/postgres-schema.ts)
  - [001_ai_orchestrator_global.sql](/home/jianghua519/ai-testing-platform/apps/ai-orchestrator/sql/001_ai_orchestrator_global.sql)
- smoke：
  - [run_ai_orchestrator_postgres_persistence_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_ai_orchestrator_postgres_persistence_smoke.mjs)
  - [migrate_ai_orchestrator_postgres.mjs](/home/jianghua519/ai-testing-platform/scripts/migrate_ai_orchestrator_postgres.mjs)

## 追溯关系

- 设计任务：[20260307-235950-langgraph-ai-orchestrator-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-235950-langgraph-ai-orchestrator-design-task.md)
- Phase 1 基础 smoke：[20260308-011500-ai-orchestrator-phase1-compose-smoke-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260308-011500-ai-orchestrator-phase1-compose-smoke-evidence.md)
