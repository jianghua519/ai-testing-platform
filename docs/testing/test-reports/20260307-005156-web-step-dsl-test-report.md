---
title: Web step DSL字段约束状态机示例集合设计测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: Web step DSL 字段约束、状态机和示例集合设计文档的验证结果记录。
---

# Web step DSL字段约束状态机示例集合设计测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2

## 执行检查

- 文档存在性检查
- 字段约束与状态机覆盖检查
- `rg -n "WebStepPlan|WebStep|Locator|Assertion|StepResult|stateDiagram|登录流程|创建用户表单|上传头像|首次登录处理|提取订单号|结算流程" docs/design/tasks/20260307-005156-web-step-dsl-design-task.md`
- `bash ./scripts/validate_docs.sh`
- `bash ./scripts/validate_contracts.sh`
- `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`

## 结果

- 设计文档已细化 `WebStepPlan`、`WebStep`、`Locator`、`StepInput`、`Assertion`、`StepResult` 的字段约束和互斥规则。
- 设计文档已定义 step 定义态、step 执行态和 plan 执行态状态机。
- 设计文档已提供登录、表单、上传、条件分支、数据提取、分组等示例集合。
- 仓库内未发现 `docker-compose`、`compose*.yml`、`Dockerfile*` 等运行入口文件，因此无法进行容器内服务验证。
- 文档校验和契约校验均通过。
- 当前仓库未提供可启动服务栈，本轮未执行运行时验证。

## 关联证据

- docs/evidence/records/20260307-005156-web-step-dsl-evidence.md
