---
title: apps console 最小工作台 UI 开发任务说明
status: active
owner: pm
last_updated: 2026-03-08
summary: 基于既有 PostgreSQL、MinIO 和公开 API 能力，为 apps/console 落地最小业务闭环工作台。
---

# apps console 最小工作台 UI 开发任务说明

## 目标

把 [20260308-085207-apps-console-minimal-ui-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260308-085207-apps-console-minimal-ui-design-task.md) 中定义的最小工作台 UI 落到代码里，提供可实际启动、可浏览、可执行最小编辑动作的 `apps/console`。

## 范围

- 包含：
  - 新增 `apps/console` 服务端渲染工作台
  - 提供 `Overview`、`Assets`、`Runs`、`AI Workspace` 四个入口
  - 仅展示当前 DB / MinIO / 既有 API 已持有或已支持的对象与动作
  - 接入 workspace 构建、Docker 镜像、Compose 本地栈和 smoke 脚本
- 不包含：
  - 新增脱离现有底座的数据模型
  - 引入新的前端框架或复杂前端构建体系
  - 做没有明确业务语义的“待处理”“推荐”“最近 N 条”一类功能

## 依赖

- 设计说明：
  - [20260308-085207-apps-console-minimal-ui-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260308-085207-apps-console-minimal-ui-design-task.md)
- 既有服务：
  - `apps/control-plane`
  - `apps/ai-orchestrator`
  - PostgreSQL
  - MinIO
- 验证脚本：
  - [run_ai_orchestrator_workflow_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_ai_orchestrator_workflow_smoke.mjs)

## 决策 / 待确认项

- 当前采用最小 SSR/BFF 方案，避免在没有稳定前端基础设施前引入 React/Next.js。
- 只保留能由现有持久化对象和 API 支撑的一览、筛选、详情、编辑、动作。
- 鉴权当前复用服务端配置的 `CONTROL_PLANE_JWT_SECRET` 和默认 subject，后续如果面向真实用户，再补正式登录和权限边界。
