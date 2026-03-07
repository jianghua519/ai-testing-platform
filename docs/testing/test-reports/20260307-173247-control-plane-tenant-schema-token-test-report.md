---
title: control-plane tenant schema隔离与最小身份token测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane tenant schema 隔离、最小身份 token 与实时 membership 授权模型的容器化验证结果。
---

# control-plane tenant schema隔离与最小身份token测试报告

## 环境

- 日期：2026-03-07
- 执行者：squad
- 仓库：/home/jianghua519/ai-testing-platform
- 环境：宿主机 Linux + Docker Compose 本地栈
- 数据库：PostgreSQL 18.3
- 对象存储：MinIO（S3 兼容）

## 执行检查

1. `docker compose run --build --rm tools npm run smoke:control-plane:postgres`
2. `docker compose build tools control-plane`
3. `docker rm -f ai-testing-platform-worker-agent`
4. `docker compose down -v`
5. `docker compose up -d postgres minio --wait`
6. `docker compose run --rm tools npm run control-plane:migrate:postgres`
7. `docker compose up -d control-plane --wait`
8. `docker compose run --rm tools npm run smoke:control-plane:compose`
9. `docker compose run --rm tools npm run smoke:scheduler:compose`
10. 文档更新后执行 `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 结果

### pg-mem smoke 回归

- `smoke:control-plane:postgres` 通过。
- 关键结果：
  - `health.status="ok"`
  - `overrideAccepted=true`
  - `decisionAction="replace"`
  - `stepDecisionTotal=1`
  - `stepDecisionConsumed=1`
  - `stepDecisionRunId="44444444-4444-4444-4444-444444444444"`
  - `stepDecisionRunItemId="55555555-5555-5555-5555-555555555555"`
- 这证明 tenant schema 改造后，`override -> decide -> runner-results` 链路已恢复，不再因提前写外键而失败。

### migration 与 tenant registry

- `control-plane:migrate:postgres` 通过。
- 关键结果：
  - `appliedCount=7`
  - 新增 `007_control_plane_tenant_registry_auth.sql`
- 说明 tenant schema 注册、locator 和 membership 表已在真实 PostgreSQL 中应用。

### control-plane compose smoke

- `smoke:control-plane:compose` 通过。
- 关键结果：
  - `health.status="ok"`
  - `migrations.length=7`
  - `runsPageSizes=[2,1]`
  - `runItemsPageSizes=[2,1]`
  - `runStepEventsPageSizes=[2,1]`
  - `runArtifactIds=["3e328daa-2902-41fc-9595-184995abea7c"]`
  - `domainCounts={"runs_count":3,"run_items_count":5,"step_events_count":5}`
- smoke 脚本已改为在公开接口上携带 Bearer token，并通过 membership seed 获取授权，说明最小身份 token + 实时 membership 授权在真实 compose 环境中可用。

### scheduler compose smoke

- `smoke:scheduler:compose` 通过，完成真实调度闭环验证。
- 本轮真实 run / job 证据：
  - `run_id="92973f56-8aa9-4e25-b927-8c0921dc3670"`, `job_id="1a847016-dc3f-40d8-bf9e-1bffd7522a8b"`, `status="succeeded"`
  - `run_id="d9b1f36f-c646-4dfd-86a1-77b69db1c4fd"`, `job_id="511a40c0-0381-431a-8e41-9a62207c7659"`, `status="succeeded"`
  - `run_id="a6309e07-b160-47db-8c4d-3794fe5901b2"`, `job_id="6d8e2511-fd8a-4bbd-a4ed-113073784d8c"`, `status="canceled"`
- 运行控制没有回退：
  - `pauseResponseStatus=202`
  - `pausedRunItemState="paused"`
  - `resumeResponseStatus=202`
  - `resumedRunItemState="active"`
  - `cancelResponseStatus=202`
- artifact 下载与清理仍然成立：
  - `artifactDownload.redirectStatus=302`
  - `artifactDownload.streamStatus=200`
  - `artifactPrune.deletedCount=1`
  - `artifactDownload.deletedStreamStatus=404`

### 文档与规范同步

- `docs/v2/tenancy-policy.md` 已更新为当前实现口径：
  - token 仅包含 `subject_id/sub` 与 `tenant_id`
  - `project` / `role` 由数据库实时解析
- 文档 bundle、测试报告和证据记录已回填真实执行结果。

## 结论

- 本轮已经把 control-plane 从“共享表 + 无正式 principal”推进到“tenant schema 业务表隔离 + 最小身份 token + 实时 membership 鉴权”的可运行状态。
- 在真实 compose 环境中，公开查询、调度、运行控制、artifact 下载与清理均未出现回退。

## 残余风险

- `/api/v1/internal/*` 仍按内部接口假设处理，未纳入这轮公开鉴权范围。
- `step_decisions` 保留了 public fallback 读取逻辑，用于兼容 locator 缺失或历史路径；后续可在清理老路径后进一步收紧。

## 关联证据

- [20260307-173247-control-plane-tenant-schema-token-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260307-173247-control-plane-tenant-schema-token-evidence.md)
