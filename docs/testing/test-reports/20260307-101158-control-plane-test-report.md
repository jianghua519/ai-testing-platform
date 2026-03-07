---
title: control-plane领域模型表扩展测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane PostgreSQL 领域表扩展的测试执行情况和关键结果。
---

# control-plane领域模型表扩展测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- Node.js：v22.22.0
- npm：10.9.4
- 数据库验证环境：`pg-mem` PostgreSQL 兼容引擎

## 执行检查

1. `npm run typecheck`
2. `npm run smoke:control-plane:postgres`
3. `bash ./scripts/validate_docs.sh`
4. `bash ./scripts/validate_contracts.sh`
5. `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`

- `typecheck` 通过
- PostgreSQL 领域表 smoke run 通过
- 文档校验通过
- 契约校验通过
- 仓库内未发现 `docker-compose`、`compose*.yml`、`compose*.yaml`、`Dockerfile*`，因此没有容器内验证

## 结果

- 本轮 control-plane PostgreSQL 领域表 smoke 输出如下：

```json
{
  "health": {
    "status": "ok"
  },
  "overrideAccepted": true,
  "decisionAction": "replace",
  "replacementSourceStepId": "open-dashboard",
  "firstPostStatus": 202,
  "duplicatePostStatus": 200,
  "duplicateBody": {
    "accepted": true,
    "duplicate": true
  },
  "jobPostStatus": 202,
  "eventTypes": [
    "step.result_reported",
    "job.result_reported"
  ],
  "domainSummary": {
    "runStatus": "passed",
    "runLastEventId": "43be7174-1320-4844-9d6a-0008e873997c",
    "runItemStatus": "passed",
    "runItemLastEventId": "43be7174-1320-4844-9d6a-0008e873997c",
    "stepEventCount": 1,
    "stepEventStepIds": [
      "open-home"
    ],
    "stepDecisionTotal": 1,
    "stepDecisionConsumed": 1,
    "stepDecisionRunId": "44444444-4444-4444-4444-444444444444",
    "stepDecisionRunItemId": "55555555-5555-5555-5555-555555555555",
    "rawEventCount": 2
  },
  "restoredEventCount": 2,
  "restoredDomainSummary": {
    "runStatus": "passed",
    "runLastEventId": "43be7174-1320-4844-9d6a-0008e873997c",
    "runItemStatus": "passed",
    "runItemLastEventId": "43be7174-1320-4844-9d6a-0008e873997c",
    "stepEventCount": 1,
    "stepEventStepIds": [
      "open-home"
    ],
    "stepDecisionTotal": 1,
    "stepDecisionConsumed": 1,
    "stepDecisionRunId": "44444444-4444-4444-4444-444444444444",
    "stepDecisionRunItemId": "55555555-5555-5555-5555-555555555555",
    "rawEventCount": 2
  },
  "snapshotJobIds": [
    "11111111-1111-1111-1111-111111111111"
  ],
  "pendingDecisionCount": 0
}
```

- 通过项：
- `runs`、`run_items`、`step_events`、`step_decisions` 都已真实落库
- 最终 run 和 run item 状态已收口为 `passed`
- step decision 已被消费且保留了 run/run_item 关联
- 服务重启后原始事件和领域表汇总都能恢复
- 限制：
- 本轮仍然使用 `pg-mem`，不是外部 PostgreSQL 实例
- 本轮没有容器内验证，也没有 migration 工具级验证

## 关联证据

- [20260307-101158-control-plane-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-101158-control-plane-evidence.md)
