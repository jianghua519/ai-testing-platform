---
title: control-plane 公开 POST /api/v1/runs任务说明
status: active
owner: squad
last_updated: 2026-03-07
summary: 为 control-plane 落地正式公开的 run 创建入口，并补齐鉴权、契约和容器化验证的任务说明。
---

# control-plane 公开 POST /api/v1/runs任务说明

## 目标

把 OpenAPI 已声明但尚未实现的 `POST /api/v1/runs` 落成正式公开入口，并满足当前 control-plane 的 principal / tenant schema 模型：

- Bearer token 提供 `subject_id/sub` 与 `tenant_id`
- `project` 授权来自数据库实时 membership
- 创建 run 时复用现有 `enqueueWebRun` 调度链
- 调用者可通过公开 `GET /api/v1/runs/{run_id}` 和 `GET /api/v1/run-items?run_id=...` 继续读取新建结果

## 范围

- `contracts/openapi.yaml`
- `apps/control-plane/src/runtime/control-plane-server.ts`
- `scripts/run_control_plane_compose_smoke.mjs`
- 本轮任务、设计、测试计划、测试报告、测试举证文档
- 相关索引文档自动更新

## 验收标准

- `POST /api/v1/runs` 在公开 API 可返回 `201` 和新建 `Run`。
- 服务端要求 `selection.kind=inline_web_plan`，并把 `selection.plan`、`selection.env_profile`、`execution_policy.*` 正确映射到 `enqueueWebRun`。
- token `tenant_id` 与 body `tenant_id` 不一致时拒绝；`project_id` 未授权时返回 `403 PROJECT_ACCESS_DENIED`。
- 新建后的 run 可通过公开查询接口读回，并能看到对应 `run_item`。
- 容器内校验通过：`smoke:control-plane:postgres`、`control-plane:migrate:postgres`、`smoke:control-plane:compose`、`smoke:scheduler:compose`、`validate_docs.sh`。

## 约束

- 先做最小公开 facade，不重写现有内部 `enqueue-web` 链路。
- 不把 `project` 和 `role` 放进 token。
- `Idempotency-Key` 契约保留，但本轮不额外引入幂等存储表。
