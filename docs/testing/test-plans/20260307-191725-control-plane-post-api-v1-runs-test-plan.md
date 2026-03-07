---
title: control-plane 公开 POST /api/v1/runs测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 围绕公开 run 创建入口、principal 鉴权与现有调度链兼容性的测试范围与退出标准说明。
---

# control-plane 公开 POST /api/v1/runs测试计划

## 测试范围

验证以下能力：

1. `POST /api/v1/runs` 能把 `RunCreateRequest` 映射为现有 enqueue 输入。
2. tenant/project principal 校验能够拒绝未授权创建。
3. 新建 run 能继续通过公开查询接口读回。
4. 公开入口不会回归现有 pg-mem override/decide 与 compose scheduler 链路。
5. 契约和交付文档已同步更新。

## 覆盖风险

- `selection` 形态与现有 enqueue 输入不匹配，导致创建后任务不可调度。
- principal project 授权漏校验，导致可以创建未授权项目下的 run。
- 公开创建改动影响现有控制面 handler，导致老 smoke 回退。
- OpenAPI 仍未说明实际支持的 selection / execution_policy 结构。

## 测试项

1. `docker compose run --build --rm tools npm run smoke:control-plane:postgres`
2. `docker compose build tools control-plane`
3. `docker compose down -v`
4. `docker compose up -d postgres minio --wait`
5. `docker compose run --rm tools npm run control-plane:migrate:postgres`
6. `docker compose up -d control-plane --wait`
7. `docker compose run --rm tools npm run smoke:control-plane:compose`
8. `docker compose run --rm tools npm run smoke:scheduler:compose`
9. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 通过标准

- 公开创建返回 `201`，并能读回新建 run 与单个 run item。
- 未授权 project 创建返回 `403 PROJECT_ACCESS_DENIED`。
- 现有两条 smoke：`control-plane:postgres` 与 `scheduler:compose` 均不回退。
- 测试报告和证据记录包含真实 run_id、命令和关键输出。
