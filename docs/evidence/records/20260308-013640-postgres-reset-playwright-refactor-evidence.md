---
title: postgres reset、playwright 镜像切换与大文件重构测试举证
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录默认 PostgreSQL 基线重建、官方 Playwright 镜像验证、control-plane/ai-orchestrator smoke 和大文件重构后的容器化验证结果。
---

# postgres reset、playwright 镜像切换与大文件重构测试举证

## 执行元数据

- 日期：2026-03-08
- 执行者：squad
- 任务：删库重建修复 checksum、切换官方 Playwright 镜像、清理旧兼容路径、重构超大源文件
- 环境：宿主机 Linux + Docker Compose 本地栈 + PostgreSQL 18 + MinIO + `.env` 默认 Google provider

## 命令

1. `docker compose build control-plane ai-orchestrator`
2. `docker compose run --rm --build tools npm run typecheck`
3. `npm run compose:postgres:reset`
4. `docker compose run --rm tools npm run control-plane:migrate:postgres`
5. `docker compose run --rm --build tools npm run smoke:control-plane:compose`
6. `docker compose exec -T tools npm run smoke:web:real`
7. `env AI_PROVIDER=mock docker compose up -d --force-recreate ai-orchestrator --wait`
8. `docker compose run --rm --build tools npm run smoke:ai-orchestrator:postgres:persistence`
9. `env AI_PROVIDER=mock docker compose up -d --force-recreate ai-orchestrator --wait`
10. `docker compose run --rm --build tools env AI_ORCHESTRATOR_VERIFY_THREAD_ID=13aee5c8-7f0a-4837-8a84-6eb69762b59e npm run smoke:ai-orchestrator:postgres:persistence`
11. `docker compose up -d --force-recreate ai-orchestrator tools --wait`
12. `docker compose exec -T tools node -e "const response=await fetch('http://ai-orchestrator:8081/healthz'); console.log(JSON.stringify({status:response.status, body:await response.json()}, null, 2));"`
13. `docker compose exec -T control-plane bash ./scripts/validate_docs.sh`

## 关键输出

### reset 与 migration

- `compose:postgres:reset` 返回：
  - `status="ok"`
  - `controlPlaneDatabase="aiwtp"`
  - `aiOrchestratorDatabase="aiwtp"`
  - `removedLegacyDatabases=["aiwtp_ai_orch_persist"]`
- `control-plane:migrate:postgres` 在默认库上再次执行通过：
  - `appliedCount=9`
  - 最新版本包含 `009_test_asset_phase2.sql`

### control-plane compose smoke

- `health.status="ok"`
- `databaseSummary.current_database="aiwtp"`
- `publicRunCreate.runId="8cf48c2d-7aa2-4feb-b485-761d5eae3259"`
- `publicRunCreate.runStatus="queued"`
- `jobEventTypes=["step.result_reported","job.result_reported"]`
- `runtimeTables=["agents","artifacts","job_leases"]`

### 真实浏览器 smoke

- `resultStatus="executed"`
- `submissionCount=1`
- `submissionPayloads[0].displayName="Smoke User"`
- `submissionPayloads[0].fileName="avatar-smoke.txt"`
- `firstUserAgent` 包含 `HeadlessChrome/145.0.7632.6`

### ai-orchestrator PostgreSQL persistence

- seed：
  - `status="seeded"`
  - `threadId="13aee5c8-7f0a-4837-8a84-6eb69762b59e"`
  - `provider="mock"`
  - `storeMode="postgres"`
  - `factCount=1`
  - `messageCount=4`
- restart verify：
  - `status="verified"`
  - `threadId="13aee5c8-7f0a-4837-8a84-6eb69762b59e"`
  - `factCount=1`
  - `messageCount=4`
- 恢复默认 provider 后：
  - `provider="google"`
  - `model="gemini-2.5-pro"`
  - `storeMode="postgres"`

### 大文件重构

- `apps/control-plane/src/runtime/control-plane-server.ts` 当前大小 `59054` bytes
- `apps/control-plane/src/runtime/postgres-control-plane-store.ts` 当前大小 `138880` bytes
- 新拆出：
  - `apps/control-plane/src/runtime/control-plane-api-requests.ts` `20163` bytes
  - `apps/control-plane/src/runtime/control-plane-api-responses.ts` `10066` bytes
  - `apps/control-plane/src/runtime/postgres-control-plane-store-support.ts` `21610` bytes

### docs validation

- `[validate-docs] markdown structure ok`
- `[validate-docs] ok`

## 说明

- 这轮不再使用独立数据库绕过 checksum；默认 `aiwtp` 库已重建并作为唯一验证基线。
- 为兼容旧验证留下的独立数据库 `aiwtp_ai_orch_persist` 已被 reset 脚本主动删除。
- `tools` 服务已切到官方 `mcr.microsoft.com/playwright:v1.58.2-noble`，浏览器能力由基础镜像直接提供，不再执行 `playwright install`。
- `control-plane` 的 compose smoke 已改为动态读取 SQL migration 目录数量，避免后续 migration 增加后再次出现假失败。

## 产物位置

- 基础设施：
  - [Dockerfile](/home/jianghua519/ai-testing-platform/Dockerfile)
  - [docker-compose.yml](/home/jianghua519/ai-testing-platform/docker-compose.yml)
  - [.dockerignore](/home/jianghua519/ai-testing-platform/.dockerignore)
  - [reset_compose_postgres.mjs](/home/jianghua519/ai-testing-platform/scripts/reset_compose_postgres.mjs)
- control-plane 重构：
  - [control-plane-server.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-server.ts)
  - [control-plane-api-requests.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-api-requests.ts)
  - [control-plane-api-responses.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/control-plane-api-responses.ts)
  - [postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts)
  - [postgres-control-plane-store-support.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store-support.ts)
- smoke：
  - [run_control_plane_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_control_plane_compose_smoke.mjs)
  - [run_ai_orchestrator_postgres_persistence_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_ai_orchestrator_postgres_persistence_smoke.mjs)
  - [run_real_browser_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_real_browser_smoke.mjs)

## 追溯关系

- 上一轮持久化 smoke：[20260308-021500-ai-orchestrator-postgres-persistence-smoke-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260308-021500-ai-orchestrator-postgres-persistence-smoke-evidence.md)
- 设计任务：[20260307-235950-langgraph-ai-orchestrator-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260307-235950-langgraph-ai-orchestrator-design-task.md)
