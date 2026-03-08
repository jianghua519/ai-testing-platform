---
title: apps console 最小工作台 UI 开发测试举证
status: active
owner: qa
last_updated: 2026-03-08
summary: 记录 apps/console 实现接入、容器化构建、真实 workflow 造数和 UI smoke 验证结果。
---

# apps console 最小工作台 UI 开发测试举证

## 执行元数据

- 日期：2026-03-08
- 执行者：codex
- 任务：按照最小工作台设计实现 `apps/console` 并完成真实 UI 验证
- 环境：宿主机 Linux + Docker Compose 本地栈 + PostgreSQL + MinIO + `AI_PROVIDER=mock`

## 命令

1. `docker run --rm -v "$PWD:/app" -w /app node:22-bookworm bash -lc 'npm install --package-lock-only'`
2. `docker compose build tools control-plane ai-orchestrator console`
3. `AI_PROVIDER=mock npm run compose:postgres:reset`
4. `AI_PROVIDER=mock docker compose up -d console --wait`
5. `docker compose exec -T tools npm run smoke:console:compose`
6. `docker compose ps --format json`
7. `bash ./scripts/validate_docs.sh`

## 关键输出

### console health

- `status=200`
- `service="console"`

### workflow smoke

- `status="ok"`
- `threadId="1b2eb579-55c1-430a-be66-4e32690295d2"`
- `explorationId="c9f79c3b-f6ac-4e36-8a5d-e9f3ab9d6cab"`
- `recordingId="547c683d-c2fc-4d70-a990-33347cea1568"`
- `testCaseId="0dc49f51-5935-43f2-a576-b737b65e8b08"`
- `brokenRunId="1021376d-7767-41fc-8dc4-afdf33387b95"`
- `replayRunId="7393261c-b27a-4fa2-8b3f-fd980c62c86f"`
- `evaluationVerdict="passed_with_runtime_self_heal"`

### console smoke

- `status="ok"`
- `consoleBaseUrl="http://console:8082"`
- `tenantId="tenant-ai-workflow"`
- `projectId="project-ai-workflow"`
- `visited=["/overview?...","/assets?...","/runs?...","/ai-workspace?...threads","/ai-workspace?...explorations"]`
- `updatedThreadTitle="console smoke thread 1772933232706"`

### compose service status

- `control-plane`: `Up ... (healthy)`
- `ai-orchestrator`: `Up ... (healthy)`
- `console`: `Up ... (healthy)`
- `postgres`: `Up ... (healthy)`

## 说明

- 这轮不是静态页面验收，而是先通过 `smoke:ai-orchestrator:workflow` 的真实链路生成资产，再用 Playwright 打开 console 做页面级验证。
- UI 只验证当前底座真实存在的对象和动作，没有补造“最近 N 条”“待处理”“推荐”等无业务语义模块。
- thread 标题编辑动作通过 UI 表单提交后，页面成功回显新标题，证明最小写路径可用。

## 追溯关系

- 项目任务：[20260308-103000-apps-console-minimal-ui-project-task.md](/home/jianghua519/ai-testing-platform/docs/project/tasks/20260308-103000-apps-console-minimal-ui-project-task.md)
- 设计说明：[20260308-085207-apps-console-minimal-ui-design-task.md](/home/jianghua519/ai-testing-platform/docs/design/tasks/20260308-085207-apps-console-minimal-ui-design-task.md)
- 测试计划：[20260308-103000-apps-console-minimal-ui-test-plan.md](/home/jianghua519/ai-testing-platform/docs/testing/test-plans/20260308-103000-apps-console-minimal-ui-test-plan.md)
- 测试报告：[20260308-103000-apps-console-minimal-ui-test-report.md](/home/jianghua519/ai-testing-platform/docs/testing/test-reports/20260308-103000-apps-console-minimal-ui-test-report.md)
- 相关代码：
  - [server.ts](/home/jianghua519/ai-testing-platform/apps/console/src/runtime/server.ts)
  - [store.ts](/home/jianghua519/ai-testing-platform/apps/console/src/runtime/store.ts)
  - [run_console_compose_smoke.mjs](/home/jianghua519/ai-testing-platform/scripts/run_console_compose_smoke.mjs)
