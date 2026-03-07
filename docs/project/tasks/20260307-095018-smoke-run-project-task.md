---
title: 真实浏览器交互 smoke run 扩展任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 把真实浏览器 smoke 场景从 open 扩到 click、input、assert、upload，并保持 control-plane 远程 step 控制链路可验证。
---

# 真实浏览器交互 smoke run 扩展任务说明

## 目标

把当前真实浏览器 smoke run 从“仅导航验证”扩展成“真实交互验证”，覆盖以下能力：

- `open`
- `click`
- `input`
- `upload`
- `assert`

同时保留仓库内真实 `control-plane` 和远程 step 替换链路。

## 范围

- `packages/playwright-adapter` 的 action executor 能力补齐
- `scripts/run_real_browser_smoke.mjs` 的真实浏览器场景重写
- 根 README 的命令说明
- 本轮中文任务、设计、测试、举证文档

## 验收标准

- `upload` action 有真实 executor
- `npm run smoke:web:real` 能跑通真实 Chromium 交互表单
- 结果中能看到 `/home`、`/profile-form`、`/submit` 三类真实请求
- 提交结果中能看到 `displayName=Smoke User` 和 `fileName=avatar-smoke.txt`
- 最终 assert step 仍可被控制面远程替换并通过
- 文档校验和契约校验通过

## 约束

- 当前仓库没有 `docker-compose` / `Dockerfile`，无法做容器内验证
- 当前 smoke run 仍然是宿主机本地验证，不是生产部署验证
- 本轮优先覆盖主要交互动作，不扩展到多标签页、下载、视频录制
