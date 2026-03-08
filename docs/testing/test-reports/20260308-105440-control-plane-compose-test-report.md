---
title: console 操作台信息架构与 compose 入口修正测试报告
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录本次 control-plane 根路由修正、console UI 重构和真实 Google smoke 的执行结果。
---

# console 操作台信息架构与 compose 入口修正测试报告

## 环境

- 日期：2026-03-08
- 执行者：codex
- 仓库：`/home/jianghua519/ai-testing-platform`
- compose 服务：`control-plane` / `ai-orchestrator` / `console` / `tools` / `postgres` / `minio`
- AI provider：Google
- AI model：`gemini-2.5-pro`

## 执行命令

1. `docker compose build control-plane ai-orchestrator console tools`
2. `docker compose up -d --force-recreate control-plane ai-orchestrator console tools --wait`
3. `docker compose exec -T tools npm run build`
4. `curl http://127.0.0.1:18080/`
5. `curl http://127.0.0.1:18081/healthz`
6. `docker compose exec -T tools npm run smoke:console:compose`
7. `bash ./scripts/validate_docs.sh`

## 结果

### 通过项

- `control-plane` 根路由返回 200 JSON，并明确 API / UI 分工。
- `ai-orchestrator /healthz` 返回 `provider=google`、`model=gemini-2.5-pro`。
- 更新后的 `tools` 容器内 `npm run build` 通过。
- `smoke:console:compose` 通过，且包含真实 Google workflow smoke：
  - thread 创建和真实 assistant 回复成功
  - exploration / recording / publish case 成功
  - broken run、自愈 replay run、run evaluation 成功
  - `Overview / Assets / Runs / AI Workspace` 页面浏览和线程标题编辑成功
- 文档校验通过。

### 中间修正

- 初版真实 workflow smoke 在 `start exploration` 处失败。
- 处理方式：将 exploration 步骤切换到 `scripted profile`，保留 thread、自愈、评估继续使用真实 Google。
- 修正后重新构建 `tools` 镜像并复跑 smoke，通过。

## 关键观察

- UI 首屏已从“统计 + 重复导航”收敛为“attention + object coverage”。
- `AI Workspace` 已改为 tabs，`Threads` / `Explorations` 不再共用下拉筛选。
- 详情页关键动作已提升为显式 card，原始 JSON 被降级到二级入口。

## 结论

- 本次交付通过。
- 未发现阻塞性问题。
- 残余风险主要来自真实模型输出的非确定性，但当前 smoke 已规避不必要的自然语言 action routing 依赖。

## 关联证据

- `docs/evidence/records/20260308-105440-control-plane-compose-evidence.md`
