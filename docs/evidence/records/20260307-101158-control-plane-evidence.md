---
title: control-plane领域模型表扩展测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录 control-plane PostgreSQL 领域表扩展的执行证据、运行信息和追溯关系。
---

# control-plane领域模型表扩展测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：architecture
- 任务：control-plane领域模型表扩展
- 环境：本机宿主环境，Node.js v22.22.0，npm 10.9.4，`pg-mem` PostgreSQL 兼容引擎

## 证据内容

- Run ID：`control-plane-domain-projection-smoke-20260307`
- 命令：
- `npm run typecheck`
- `npm run smoke:control-plane:postgres`
- `bash ./scripts/validate_docs.sh`
- `bash ./scripts/validate_contracts.sh`
- 产物位置：
- 运行脚本：[run_control_plane_postgres_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_control_plane_postgres_smoke.mjs)
- SQL schema：[001_control_plane_postgres.sql](/home/jianghua519/ai-web-testing-platform-v2/apps/control-plane/sql/001_control_plane_postgres.sql)
- 关键结果：
- `domainSummary.runStatus="passed"`
- `domainSummary.runItemStatus="passed"`
- `domainSummary.stepEventCount=1`
- `domainSummary.stepDecisionConsumed=1`
- `domainSummary.stepDecisionRunId` 和 `stepDecisionRunItemId` 均已回填
- `restoredDomainSummary` 与运行期汇总一致
- 结论：control-plane PostgreSQL 模式已经从原始事件存储推进到正式领域表投影。

## 追溯关系

- 测试报告：[20260307-101158-control-plane-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-101158-control-plane-test-report.md)
- 相关任务：[20260307-101158-control-plane-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-101158-control-plane-project-task.md)
- 设计说明：[20260307-101158-control-plane-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-101158-control-plane-design-task.md)
