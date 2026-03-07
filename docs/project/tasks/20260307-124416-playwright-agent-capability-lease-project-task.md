---
title: 真实 Playwright 调度执行与 agent capability/lease 正式化任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 把 compose 调度 smoke 升级成真实 Playwright 执行，并把 capability 匹配和 lease 语义收敛成正式调度约束。
---

# 真实 Playwright 调度执行与 agent capability/lease 正式化任务说明

## 目标

把上一轮“最小调度系统原型”推进到下一阶段：

- 调度 smoke 不再使用 fake browser，而是在容器中真实拉起 Playwright Chromium。
- `run_items` 明确保存 `required_capabilities`，租约获取不再只按 `job_kind` 粗匹配。
- agent 启动脚本和调度 smoke 能真实证明 capability 匹配成立。

## 范围

- `apps/control-plane/sql/004_control_plane_capability_requirements.sql`
- `apps/control-plane/src/runtime/*` 中的 capability 推导、run_item 投影和 lease 获取逻辑
- `apps/web-worker/src/session/browser-launcher.ts`
- `scripts/run_scheduler_compose_smoke.mjs`
- `scripts/start_polling_web_agent.mjs`
- `Dockerfile`、`docker-compose.yml`、`README.md`
- 本轮任务对应的设计、测试计划、测试报告和举证文档

## 验收标准

- migration runner 能应用到 `004_control_plane_capability_requirements.sql`。
- web run 入队后，`run_items.required_capabilities_json` 至少包含 `web` 和 `browser:chromium`。
- `browser:firefox` agent 无法获取 `browser:chromium` job。
- `browser:chromium` agent 能在 compose 栈里真实拉起 HeadlessChrome，并完成点击、输入、上传、提交和断言。
- 本轮文档、README、契约和验证记录齐全并通过校验。

## 约束

- 本轮只做 Chromium capability 和真实执行，不扩展到 Firefox / WebKit 调度矩阵。
- capability 推导以 `web + browser:<browser>` 为最小集合，不引入复杂调度策略。
- 调度验证仍限定在本地 `docker compose` 栈，不扩展到远程环境。
