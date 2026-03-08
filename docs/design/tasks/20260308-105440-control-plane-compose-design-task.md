---
title: console 操作台信息架构与 compose 入口修正设计说明
status: active
owner: codex
last_updated: 2026-03-08
summary: 说明本次 control-plane 根路由修正、console 操作台重构和真实 Google smoke 方案。
---

# console 操作台信息架构与 compose 入口修正设计说明

## 背景

- 用户访问 `http://127.0.0.1:18080` 时收到 `route not found`，无法区分 API 服务和 UI 服务。
- 现有 `apps/console` 页面能打开对象，但仍偏向底层调试壳：
  - 首屏项目上下文与页面标题重复。
  - `Overview` 重复导航而不是暴露要处理的对象。
  - 列表和详情过度暴露 UUID、原始时间戳、JSON 和内部字段。
  - 关键动作被统一塞进 `details`，操作路径弱。
- 既有 `console` smoke 依赖 mock 风格的 assistant action，无法稳定用真实 Google 模型验证。

## 设计决策

### 1. 入口语义修正

- 在 `control-plane` 增加 `GET /` 响应，明确该端口是 API 而不是 UI。
- 在 `README.md` 和 `docker-compose.yml` 标明：
  - `18080` = `control-plane` API
  - `18081` = `ai-orchestrator` API
  - `18082` = `apps/console` UI

### 2. Overview 改成 attention board

- 顶部只保留紧凑 scope bar，不再使用大块“项目上下文”卡片。
- `Overview` 首屏优先展示真实可行动对象：
  - 失败 runs
  - 最新版本未发布的 cases
  - draft / running / failed / stopped explorations
- 统计保留，但退到 `Object Coverage`，只说明当前项目在 DB / MinIO 已持有的对象覆盖。

### 3. 列表和详情做人类可读语义翻译

- 名称优先，ID 降为辅助元信息，统一短 ID 展示。
- 时间统一格式化，不直接堆原始 ISO 字符串。
- 详情页先给摘要字段，再把原始 JSON 放到二级 `Raw` 入口。
- `AI Workspace` 用 tabs 区分 `Threads` 和 `Explorations`，不再用下拉框切换对象类型。

### 4. 动作可发现性提升

- 页级创建动作改成可见 action card，不再收在折叠面板里。
- 详情动作按对象语义拆成显式 action card：
  - case 编辑 / 新版本 / 数据集 / 运行 / 归档
  - run 取消 / 评估 / 自愈 / 抽取
  - thread 发消息 / 改标题
  - exploration 启停 / 发布 / 改名
- 只有高级 JSON 负载保留在 `details` 内。

### 5. 真实 Google smoke 策略

- `scripts/run_ai_orchestrator_workflow_smoke.mjs` 改成：
  - 真实 Google assistant thread message 用于确认 provider/model 实际工作。
  - exploration 使用 `scripted` profile 保证浏览流程稳定。
  - publish / self-heal / evaluation 走明确 API，让模型参与真正需要模型的地方，而不是依赖自然语言 action routing 的偶然性。
- `scripts/run_console_compose_smoke.mjs` 跟随新的 UI 结构更新断言。

## 风险与折中

- exploration 改用 `scripted` profile 会减少探索阶段的 AI 不确定性，但这是为了稳定 UI smoke；真实 Google 仍参与 thread、自愈和评估链路。
- `apps/console` 仍是 SSR/BFF 页面，不包含更复杂的前端状态管理；这是有意保持最小闭环。
- 文档 bundle 文件名仍沿用最初生成的 slug，但正文已更新为实际交付内容。

## 验证计划

- 重建 `control-plane / ai-orchestrator / console / tools` 镜像。
- 在容器内执行 `npm run build`。
- 通过 `curl` 验证 `18080` 根路由和 `18081` provider 状态。
- 执行 `docker compose exec -T tools npm run smoke:console:compose`，由其联动真实 Google workflow smoke 和 console UI smoke。
- 执行 `bash ./scripts/validate_docs.sh`。
