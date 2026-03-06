---
title: 项目概览
status: active
owner: pm
last_updated: 2026-03-06
summary: AI Web Testing Platform V2 仓库的目标、用户和规范入口概览。
---

# 项目概览

## 项目目标

定义并演进一个多租户 AI Web 测试平台的 V2 架构和契约规范。

## 主要用户

- QA / 测试工程师：发起执行、查看结果、管理测试资产。
- 租户管理员：管理权限、配额和集成配置。
- CI 系统：通过 API 触发执行并获取结果。

## 仓库当前角色

- 作为架构和接口契约的规范源。
- 作为文档完整性和契约完整性的校验入口。
- 作为后续实现仓库或运行时服务的设计起点。

## 规范入口

- 架构：`docs/v2/c4.md`
- 租户隔离：`docs/v2/tenancy-policy.md`
- 执行生命周期：`docs/v2/execution-state-machine.md`
- REST 契约：`contracts/openapi.yaml`
- 事件契约：`contracts/asyncapi.yaml`
