---
title: control-plane PostgreSQL持久化骨架测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane PostgreSQL 存储骨架的测试执行情况和关键结果。
---

# control-plane PostgreSQL持久化骨架测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- Node.js：v22.22.0
- npm：10.9.4
- 数据库验证环境：`pg-mem` PostgreSQL 兼容引擎

## 执行检查

1. `npm install`
2. `npm run typecheck`
3. `npm run smoke:control-plane:postgres`
4. `bash ./scripts/validate_docs.sh`
5. `bash ./scripts/validate_contracts.sh`
6. `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`

- `npm install` 通过
- `typecheck` 通过
- PostgreSQL smoke run 通过
- 文档校验通过
- 契约校验通过
- 仓库内未发现 `docker-compose`、`compose*.yml`、`compose*.yaml`、`Dockerfile*`，因此没有容器内验证

## 结果

- 本轮 control-plane PostgreSQL smoke 输出如下：

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
  "restoredEventCount": 2,
  "snapshotJobIds": [
    "11111111-1111-1111-1111-111111111111"
  ],
  "pendingDecisionCount": 0
}
```

- 通过项：
- `control-plane` 已经用 PostgreSQL store 启动成功
- step override 和 decide API 已经走通
- runner 结果写入和重复写入幂等已验证
- 服务重启后能恢复已写入事件
- 限制：
- 本轮使用的是 `pg-mem`，不是外部 PostgreSQL 实例
- 本轮没有容器内验证，也没有真实数据库网络/认证配置验证

## 关联证据

- [20260307-100206-control-plane-postgresql-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-100206-control-plane-postgresql-evidence.md)
