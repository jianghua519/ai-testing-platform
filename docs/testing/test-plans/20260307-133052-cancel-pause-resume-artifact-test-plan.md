---
title: 并发槽位、cancel/pause/resume 与 artifact 真采集闭环测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 规划并发调度、运行控制、artifact 真采集和容器化 smoke 的验证范围与退出标准。
---

# 并发槽位、cancel/pause/resume 与 artifact 真采集闭环测试计划

## 测试范围

- `005` migration 应用与控制字段落库
- `max_parallel_slots` 上报与 lease 限流
- `pause / resume / cancel` 的 control-plane API、数据库状态与 worker 执行结果
- `screenshot / trace / video` 真采集、落库和查询接口
- 容器化 `control-plane` smoke 和 `scheduler` smoke

## 覆盖风险

- schema 更新后 control-plane 读写逻辑失配
- agent 声称支持并发槽位，但实际上仍串行领取 lease
- pause / resume / cancel API 存在，但 worker 没有真正执行控制决策
- artifact 只有数据库记录，没有真实文件
- smoke 断言受固定 ID 或旧数据库污染，导致结果不稳定

## 测试项

1. 容器内 `typecheck` 和契约校验通过。
2. migration 应用到 `005_control_plane_runtime_controls.sql`。
3. `smoke:control-plane:compose` 通过，且分页、runtime 表和幂等行为不回退。
4. `smoke:scheduler:compose` 通过，并验证：
   - Firefox agent idle
   - Chromium agent `max_parallel_slots=2`
   - 观测到 2 个同时活跃 lease
   - run1 进入 `paused` 后恢复
   - run3 被取消并生成 `canceled` step 结果
   - 每个 run_item 都能查到 `screenshot/trace/video`
   - sample artifact 文件真实存在
5. 文档校验通过。

## 通过标准

- 关键 smoke、校验脚本全部通过。
- 关键运行结果有明确证据，能回填到测试报告和举证文档。
- 剩余风险被清楚记录且不影响当前里程碑验收。
