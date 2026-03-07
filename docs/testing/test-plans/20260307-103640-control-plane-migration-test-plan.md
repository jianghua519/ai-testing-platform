---
title: control-plane正式migration体系和查询接口骨架测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 规划 control-plane migration runner 与最小查询接口骨架的验证范围、风险和退出标准。
---

# control-plane正式migration体系和查询接口骨架测试计划

## 测试范围

验证以下能力：

- migration runner 能执行 SQL 文件并记录已应用 migration
- `pg-mem` 快速 smoke 仍可运行
- 真实 PostgreSQL smoke 能完成 migration、结果写入、查询接口读取和重启恢复
- OpenAPI 与文档同步更新

## 覆盖风险

- migration runner 破坏既有 `pg-mem` 快速回归
- PostgreSQL store 在真库上无法读取 migration 状态或投影表
- 新增查询接口与现有 OpenAPI 语义冲突
- 容器入口缺失导致验证范围不足

## 测试项

1. 运行 `npm run typecheck`
2. 运行 `npm run smoke:control-plane:postgres`
3. 运行 `npm run smoke:control-plane:postgres:real`
4. 检查真实 smoke 输出中的 `appliedMigrationVersions`、`runApiStatus`、`stepEventApiCount`
5. 运行 `bash ./scripts/validate_docs.sh`
6. 运行 `bash ./scripts/validate_contracts.sh`
7. 检查容器入口缺失情况

## 通过标准

- 快速 smoke 和真实 smoke 都成功
- 真实 smoke 明确显示 migration 已应用且查询接口返回预期结果
- 文档校验和契约校验通过
- 所有未覆盖风险都有明确记录
