---
title: control-plane 公开 POST /api/v1/runs测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录公开 `POST /api/v1/runs` 的实现验证、鉴权结果以及对现有调度链的回归检查。
---

# control-plane 公开 POST /api/v1/runs测试报告

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
3. `docker compose down -v`
4. `docker compose up -d postgres minio --wait`
5. `docker compose run --rm tools npm run control-plane:migrate:postgres`
6. `docker compose up -d control-plane --wait`
7. `docker compose run --rm tools npm run smoke:control-plane:compose`
8. `docker compose run --rm tools npm run smoke:scheduler:compose`
9. 文档更新后执行 `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 结果

### 公开 `POST /api/v1/runs`

- `smoke:control-plane:compose` 通过，并新增公开创建验证。
- 关键结果：
  - `publicRunCreate.status=201`
  - `publicRunCreate.runId="80ed8934-5ab1-460c-a825-afc4e9482f23"`
  - `publicRunCreate.runStatus="queued"`
  - `publicRunCreate.runItemCount=1`
- 说明公开创建入口已经能用 Bearer token 成功创建 run，并且通过公开 `GET /api/v1/run-items?run_id=...` 读回对应 `run_item`。

### principal 项目授权

- 同一 smoke 中，未授权 project 创建验证通过：
  - `forbiddenPublicRunCreate.status=403`
  - `forbiddenPublicRunCreate.errorCode="PROJECT_ACCESS_DENIED"`
- 说明创建入口已经接入当前 principal/membership 授权模型，不再只是 tenant 范围校验。

### 回归验证

- `smoke:control-plane:postgres` 通过，`override -> decide -> runner-results` 链路未回退。
- `smoke:scheduler:compose` 通过，真实调度 run 继续完成：
  - `run_id="275101d3-f0ce-41ac-8af8-df6aa09264a0"`, `status="succeeded"`
  - `run_id="481811d3-5154-4b87-b1c8-a8aee9214dbe"`, `status="succeeded"`
  - `run_id="4115fd0c-5fcd-4ce9-81e3-6f0a8290c61e"`, `status="canceled"`
- 这说明公开创建入口的 server 改动没有破坏现有 internal enqueue 和调度闭环。

### 契约与文档

- `contracts/openapi.yaml` 已补充 `RunSelection` 与 `RunExecutionPolicy` 的最小可执行描述。
- 本轮任务、设计、测试计划、测试报告、证据记录已回填真实结果。

## 结论

- 这轮已经把 `POST /api/v1/runs` 从“只有契约、没有实现”推进到“可公开创建、可授权拒绝、可公开读回”的可用状态。
- 当前实现是最小公开 facade，内部仍复用成熟的 `enqueueWebRun` 调度链，因此改动面小、验证链完整。

## 残余风险

- `Idempotency-Key` 仍未落地真正的去重存储，当前只是契约预留。
- 公开创建暂时只支持 `selection.kind=inline_web_plan`。

## 关联证据

- [20260307-191725-control-plane-post-api-v1-runs-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260307-191725-control-plane-post-api-v1-runs-evidence.md)
