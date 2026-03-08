---
title: console 操作台信息架构与 compose 入口修正测试计划
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录本次 control-plane 根路由修正、console UI 重构和真实 Google smoke 的测试范围与退出标准。
---

# console 操作台信息架构与 compose 入口修正测试计划

## 测试目标

- 确认 `control-plane` 根路由不再误导为 UI 入口。
- 确认 `apps/console` 新信息架构可打开并支撑最小业务闭环。
- 确认 workflow 与 UI 验证链路使用真实 Google 模型。

## 覆盖范围

1. API / compose 入口
   - `GET /` on `18080`
   - `GET /healthz` on `18081`
2. UI 页面
   - `/overview`
   - `/assets`
   - `/runs`
   - `/ai-workspace`
3. 真实 workflow
   - thread message
   - exploration -> recording -> publish case
   - broken run -> self-heal -> evaluation

## 执行方式

- 镜像重建：
  - `docker compose build control-plane ai-orchestrator console tools`
- 服务启动：
  - `docker compose up -d --force-recreate control-plane ai-orchestrator console tools --wait`
- 容器内构建：
  - `docker compose exec -T tools npm run build`
- 运行验证：
  - `curl http://127.0.0.1:18080/`
  - `curl http://127.0.0.1:18081/healthz`
  - `docker compose exec -T tools npm run smoke:console:compose`
- 文档校验：
  - `bash ./scripts/validate_docs.sh`

## 重点风险

- 真实 Google 模型引入非确定性，可能导致 smoke 对 action kind 的假设失效。
- UI 断言可能落后于新信息架构。
- compose 镜像若未重建，容易验证到旧代码。

## 退出标准

- 所有关键命令执行成功。
- `smoke:console:compose` 输出 workflow ID、evaluation verdict 和 UI visited 页面。
- 未发现阻塞性交互回归。
