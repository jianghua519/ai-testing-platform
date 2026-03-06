---
title: 测试策略
status: active
owner: qa
last_updated: 2026-03-06
summary: 架构文档、接口契约、事件契约和文档完整性的基础测试策略。
---

# 测试策略

## 校验层次

- 静态校验：Markdown 完整性检查、YAML 合同可解析性检查。
- 契约校验：OpenAPI 和 AsyncAPI 的结构存在性与语法检查。
- 规范校验：租户隔离、幂等和状态机规则是否能追溯到规范文档。
- 运行校验：当实现代码出现后，必须执行容器内真实链路验证并保存证据。

## 对重要交付的证据要求

- 在 `docs/testing/test-plans/` 中有测试计划。
- 在 `docs/testing/test-reports/` 中有测试报告。
- 在 `docs/evidence/records/` 中有证据记录。
- 在 `docs/evidence/evidence-index.md` 中有索引登记。

## 当前仓库说明

当前仓库主要包含规范文档和校验脚本，不是完整的运行时服务。一旦引入服务实现，运行级验证就变成发布门槛。
