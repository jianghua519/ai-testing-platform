---
title: step级执行控制与回传任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 在执行引擎和 web-worker 中落地 step 级控制与回传能力，支持在执行过程中动态替换下一个 step 并继续运行。
---

# step级执行控制与回传任务说明

## 目标

把当前只支持 job 级回传的 worker，推进到 step 级执行控制和 step 级结果回传，至少实现以下最小闭环：

- 每个 step 完成后即时回传
- 在前一个 step 完成后，动态替换下一个 step
- 修改后的下一个 step 继续执行

## 范围

- `playwright-adapter` 执行引擎中的 step 控制钩子与 step 生命周期观察器。
- `web-worker` 的 step 级 publisher 与 step 级 envelope。
- `AsyncAPI` 契约扩展。
- 中文任务文档、测试计划、测试报告、测试举证。

## 验收标准

- 执行引擎支持在 step 执行前应用 skip / replace 控制。
- worker 支持逐 step 发布结果事件。
- 至少完成一次真实运行流，验证“step1 完成后替换 step2，再执行 step2”。
- `npm run typecheck`、文档校验、契约校验通过。

## 约束

- 当前没有容器运行入口，无法按容器方式验证。
- 当前没有真实控制面双向控制通道，本轮用 in-memory controller 实现最小控制闭环。
- 当前没有真实浏览器执行环境，本轮运行验证仍使用 fake browser 对象。
