---
title: control-plane PostgreSQL持久化骨架测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证 control-plane PostgreSQL store 的 schema、幂等、step decision 队列和服务重启恢复行为。
---

# control-plane PostgreSQL持久化骨架测试计划

## 测试范围

- `PostgresControlPlaneStore`
- PostgreSQL schema
- `createControlPlaneStoreFromEnv()` 的 `postgres` 模式
- `npm run smoke:control-plane:postgres`
- override / decide / runner-results / events API 链路

## 覆盖风险

- PostgreSQL store 只能编译，无法真实实例化
- `recordRunnerEvent()` 幂等失效
- step override 进入数据库后无法正确消费
- 服务关闭重启后，事件和决策状态丢失

## 测试项

1. 运行 `npm install`
2. 运行 `npm run typecheck`
3. 运行 `npm run smoke:control-plane:postgres`
4. 检查 `overrideAccepted=true`
5. 检查 `decisionAction=replace`
6. 检查首次结果写入 `202`、重复写入 `200 duplicate=true`
7. 检查 `eventTypes` 包含 `step.result_reported` 和 `job.result_reported`
8. 检查 `restoredEventCount=2`
9. 检查 `pendingDecisionCount=0`
10. 运行文档校验
11. 运行契约校验
12. 检查容器入口缺失情况

## 通过标准

- PostgreSQL store 能被真实实例化并参与服务运行
- 幂等结果写入行为正确
- step decision 队列的入队和消费正确
- 服务重启后能恢复 runner 事件
