---
title: apps console 最小工作台 UI 测试报告
status: active
owner: qa
last_updated: 2026-03-08
summary: apps/console 已在容器化本地栈完成真实 workflow 造数、页面访问和最小编辑动作验证。
---

# apps console 最小工作台 UI 测试报告

## 环境

- 日期：2026-03-08
- 分支：`main`
- 环境：宿主机 Linux + Docker Compose + PostgreSQL + MinIO + `AI_PROVIDER=mock`
- 服务：
  - `control-plane`
  - `ai-orchestrator`
  - `console`
  - `tools`

## 执行检查

1. 构建镜像并跑 workspace typecheck
2. 重建 compose PostgreSQL 基线并执行 migrations
3. 启动 `console` 服务并等待健康检查通过
4. 执行 `smoke:console:compose`
5. 执行文档校验脚本

## 结果

- 结果：通过
- 关键观察：
  - `apps/console` 已成功纳入 workspace 和 Docker 构建链路
  - `console` 服务在 compose 中为 `healthy`
  - smoke 先通过真实 AI workflow 生成 thread / exploration / recording / case / run / evaluation 数据，再打开 console 页面验证 UI
  - `Overview`、`Assets`、`Runs`、`AI Workspace` 四个入口都已访问成功
  - thread 标题编辑动作成功提交并回显新标题
  - workflow 评估结论为 `passed_with_runtime_self_heal`

## 关联证据

- [20260308-103000-apps-console-minimal-ui-evidence.md](/home/jianghua519/ai-testing-platform/docs/evidence/records/20260308-103000-apps-console-minimal-ui-evidence.md)
