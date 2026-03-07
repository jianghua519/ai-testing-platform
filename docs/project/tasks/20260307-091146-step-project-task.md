---
title: 远程step控制协议任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 在 web-worker 中落地远程 step 控制协议，支持控制面在每个 step 执行前返回 execute、pause、skip 或 replace 决策。
---

# 远程step控制协议任务说明

## 目标

把当前只能依赖 in-memory controller 的 step 控制模型，推进成可远程接入控制面的运行时协议，至少完成以下最小闭环：

- worker 在每个 step 执行前向远程控制端请求决策
- 控制端可以返回 `execute`、`pause`、`skip`、`replace`
- 在 step1 结果回传后，控制端可以修改 step2 的定义，再让 worker 执行修改后的 step2

## 范围

- `apps/web-worker/src/control/*` 远程控制模块
- `web-worker` 装配入口与 `WebJobRunner`
- `OpenAPI` 内部控制决策接口契约
- 中文任务说明、设计说明、测试计划、测试报告、测试举证

## 验收标准

- `createWebWorker()` 支持按环境变量装配远程 step controller
- `WebJobRunner.run()` 支持按 job metadata 创建每次运行专属的 controller
- 至少完成一次真实运行流，验证“step1 回传后，控制端通过远程协议替换 step2，再执行 step2”
- `npm run typecheck`、文档校验、契约校验通过

## 约束

- 当前仓库没有 `docker-compose` / `Dockerfile`，无法按容器方式验证
- 当前没有真实控制面服务，本轮用本地 HTTP server 模拟远程控制端
- 当前没有真实浏览器环境，本轮运行验证仍使用 fake browser 对象
