---
title: control-plane领域模型表扩展测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证 control-plane PostgreSQL 领域表投影是否正确落入 runs、run_items、step_events、step_decisions，并保持既有 API 链路有效。
---

# control-plane领域模型表扩展测试计划

## 测试范围

- PostgreSQL schema 扩展
- `PostgresControlPlaneStore.recordRunnerEvent()`
- `PostgresControlPlaneStore.enqueueStepDecision()` / `dequeueStepDecision()`
- `npm run smoke:control-plane:postgres`
- 领域表投影汇总结果

## 覆盖风险

- 只有原始事件表写入成功，领域表没有落数据
- `runs/run_items` 状态推进错误或回退
- `step_decisions` 无法回填 `run_id/run_item_id`
- 服务重启后只能恢复原始事件，不能恢复领域表结果

## 测试项

1. 运行 `npm run typecheck`
2. 运行 `npm run smoke:control-plane:postgres`
3. 检查 `domainSummary.runStatus=passed`
4. 检查 `domainSummary.runItemStatus=passed`
5. 检查 `domainSummary.stepEventCount=1`
6. 检查 `domainSummary.stepDecisionConsumed=1`
7. 检查 `domainSummary.stepDecisionRunId` 和 `stepDecisionRunItemId` 不为空
8. 检查 `restoredDomainSummary` 与当前汇总一致
9. 运行文档校验
10. 运行契约校验
11. 检查容器入口缺失情况

## 通过标准

- 领域表投影写入正确
- step 决策表既可消费也能保留审计信息
- 重启后领域表和原始事件表都能恢复
