---
title: console 操作台信息架构与 compose 入口修正任务说明
status: active
owner: codex
last_updated: 2026-03-08
summary: 修正 control-plane 根路由说明、重构 apps/console 操作台 UI，并要求验证链路仅使用真实 Google 模型。
---

# console 操作台信息架构与 compose 入口修正任务说明

## 目标

- 修复 `http://127.0.0.1:18080` 根路由返回 404 导致的 compose 入口误解。
- 将 `apps/console` 从“内部数据壳”收敛为面向操作者的最小工作台。
- 所有验证必须带真实 Google 模型，不允许退回 mock provider。

## 范围

- `apps/control-plane` 根路由响应和 compose / README 端口说明。
- `apps/console` 的信息架构、状态视觉、筛选表单、列表可读性、详情摘要和动作可发现性。
- `scripts/run_ai_orchestrator_workflow_smoke.mjs` 与 `scripts/run_console_compose_smoke.mjs` 的真实 Google 验证链路。
- 对应的项目、设计、测试和举证文档。

## 非范围

- 不引入新的前端框架。
- 不增加超出现有 DB / MinIO / API 底座的新业务对象。
- 不改动与当前交付无关的历史任务文档。

## 验收标准

- `GET /` on `control-plane` 返回 200 JSON，并明确 UI 入口在 `18082`。
- `apps/console` 的 `Overview / Assets / Runs / AI Workspace` 满足最小闭环：
  - 一览、筛选、详情、编辑、动作都基于现有持久化对象和接口。
  - 不再依赖拍脑袋的“最近 X 条”“Entry Points”“待处理推荐”。
  - UUID、原始 JSON、内部字段名降为二级信息。
- 容器内构建通过。
- 用真实 Google 模型跑通 workflow + console smoke，并留下可追溯证据。

## 约束

- 保持 `main` 工作区中的用户改动不被回滚。
- 运行和测试命令在项目容器内执行。
- 文档必须满足 `docs/README.md` 和 `scripts/validate_docs.sh` 的规则。
