---
title: console 操作台信息架构与 compose 入口修正测试举证
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录本次 control-plane 根路由修正、console UI 重构和真实 Google smoke 的执行证据。
---

# console 操作台信息架构与 compose 入口修正测试举证

## 执行元数据

- 日期：2026-03-08
- 执行者：codex
- 任务：console 操作台信息架构与 compose 入口修正
- 环境：docker compose，本地 PostgreSQL + MinIO + control-plane + ai-orchestrator + console + tools

## 关键命令

- `docker compose build control-plane ai-orchestrator console tools`
- `docker compose up -d --force-recreate control-plane ai-orchestrator console tools --wait`
- `docker compose exec -T tools npm run build`
- `curl http://127.0.0.1:18080/`
- `curl http://127.0.0.1:18081/healthz`
- `docker compose exec -T tools npm run smoke:console:compose`
- `bash ./scripts/validate_docs.sh`

## 运行证据

### compose 服务状态

- `control-plane`: `healthy`
- `ai-orchestrator`: `healthy`
- `console`: `healthy`
- `tools`: `healthy`

### API 入口

- `curl http://127.0.0.1:18080/` 返回：
  - `service=control-plane`
  - `kind=api`
  - `status=ok`
  - `notes` 明确 UI 由 `apps/console` 单独提供
- `curl http://127.0.0.1:18081/healthz` 返回：
  - `provider=google`
  - `model=gemini-2.5-pro`
  - `storeMode=postgres`

### 真实 Google workflow smoke

- `threadId`: `45977480-317f-45a0-974e-942557b0571e`
- `assistantCheckPreview`: `我已确认当前由 Google 模型提供支持，且根据您当前的消息，无需触发 exploration、publish 或 self-heal 操作。`
- `explorationId`: `d1dee53d-9b72-4e29-b8fb-6f1500dba361`
- `recordingId`: `0a36166d-cd58-4f49-ba54-80e97b5012ea`
- `testCaseId`: `4b52f524-010d-4fcb-a798-ec56a5bb8b73`
- `brokenRunId`: `1607dc80-c08e-469e-a280-a7f1087a1faa`
- `brokenRunItemId`: `07fa9d9b-47db-4bf7-a4ff-367bf0e31b4f`
- `replayRunId`: `750457c2-2071-4bf4-aad8-cd0df3bd8b99`
- `replayRunItemId`: `32f19799-cf70-4919-8a7f-6fae98046ad1`
- `evaluationId`: `61d54687-ebcd-4ca5-89bf-ab3c69ff6556`
- `evaluationVerdict`: `passed_with_runtime_self_heal`
- `submissionCount`: `2`

### console smoke

- 访问页面：
  - `/overview?tenant_id=tenant-ai-workflow&project_id=project-ai-workflow`
  - `/assets?tenant_id=tenant-ai-workflow&project_id=project-ai-workflow&asset_type=test-cases`
  - `/assets?tenant_id=tenant-ai-workflow&project_id=project-ai-workflow&asset_type=recordings`
  - `/runs?tenant_id=tenant-ai-workflow&project_id=project-ai-workflow`
  - `/ai-workspace?tenant_id=tenant-ai-workflow&project_id=project-ai-workflow&workspace_view=threads`
  - `/ai-workspace?tenant_id=tenant-ai-workflow&project_id=project-ai-workflow&workspace_view=explorations`
- 线程标题更新结果：
  - `updatedThreadTitle = console smoke thread 1772936982020`

### exploration trace

- `ai-orchestrator` 日志显示 trace viewer 路径：
  - `/tmp/aiwtp-ai-orchestrator/d1dee53d-9b72-4e29-b8fb-6f1500dba361-XCZ8dN/traces/trace.json`

## 追溯关系

- 项目任务：`docs/project/tasks/20260308-105440-control-plane-compose-project-task.md`
- 设计说明：`docs/design/tasks/20260308-105440-control-plane-compose-design-task.md`
- 测试计划：`docs/testing/test-plans/20260308-105440-control-plane-compose-test-plan.md`
- 测试报告：`docs/testing/test-reports/20260308-105440-control-plane-compose-test-report.md`
