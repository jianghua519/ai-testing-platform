---
title: 外部 PostgreSQL 实例验证测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane 真实 PostgreSQL 进程 smoke 的执行结果和关键观察。
---

# 外部 PostgreSQL 实例验证测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- Node.js：v22.22.0
- npm：10.9.4
- 数据库验证环境：`embedded-postgres` 启动的真实 PostgreSQL 18.3 进程

## 执行检查

1. `npm install`
2. `npm run typecheck`
3. `npm run smoke:control-plane:postgres:real`
4. `bash ./scripts/validate_docs.sh`
5. `bash ./scripts/validate_contracts.sh`
6. `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`

执行结果：

- `npm install` 通过，并完成 `embedded-postgres` 依赖安装
- `typecheck` 通过
- 真实 PostgreSQL smoke 通过
- 文档校验通过
- 契约校验通过
- 仓库内未发现 `docker-compose`、`compose*.yml`、`compose*.yaml`、`Dockerfile*`，因此没有容器内验证

## 结果

真实 smoke 输出如下：

```json
{
  "health": {
    "status": "ok"
  },
  "databaseSummary": {
    "current_database": "aiwtp_smoke",
    "server_version": "18.3",
    "data_directory": "/tmp/aiwtp-postgres-real-smoke-0kXemY/db",
    "server_port": 41971,
    "version_string": "PostgreSQL 18.3 on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 7.5.0-3ubuntu1~18.04) 7.5.0, 64-bit"
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
    "runLastEventId": "77fbf28a-a1c4-4143-8de4-626c567daf36",
    "runItemStatus": "passed",
    "runItemLastEventId": "77fbf28a-a1c4-4143-8de4-626c567daf36",
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
    "runLastEventId": "77fbf28a-a1c4-4143-8de4-626c567daf36",
    "runItemStatus": "passed",
    "runItemLastEventId": "77fbf28a-a1c4-4143-8de4-626c567daf36",
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
  "restoredDatabaseSummary": {
    "current_database": "aiwtp_smoke",
    "server_version": "18.3",
    "data_directory": "/tmp/aiwtp-postgres-real-smoke-0kXemY/db",
    "server_port": 41971,
    "version_string": "PostgreSQL 18.3 on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 7.5.0-3ubuntu1~18.04) 7.5.0, 64-bit"
  },
  "snapshotJobIds": [
    "11111111-1111-1111-1111-111111111111"
  ],
  "pendingDecisionCount": 0
}
```

通过项：

- 结果已经能直接证明是真实 PostgreSQL 进程，而不是 `pg-mem`
- control-plane API 和 PostgreSQL store 在真库上联调通过
- 重复投递仍然被幂等处理
- 数据库和 control-plane 重启后，事件和领域表投影均可恢复

限制：

- 这轮验证是宿主机嵌入式 PostgreSQL 进程，不是远程托管数据库
- 本轮没有容器内验证
- 本轮没有覆盖迁移框架或生产级连接池参数

## 关联证据

- [20260307-102523-postgresql-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-102523-postgresql-evidence.md)
