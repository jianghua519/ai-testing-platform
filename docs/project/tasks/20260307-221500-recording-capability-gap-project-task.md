---
title: 录屏到报告能力调研与 GAP 分析任务说明
status: active
owner: squad
last_updated: 2026-03-07
summary: 基于参考仓库调研录制、分析、测试资产化、执行、结果比对和报告能力，并输出当前 V2 原型的差距与分阶段落地建议。
---

# 录屏到报告能力调研与 GAP 分析任务说明

## 目标

围绕以下目标先完成文档调研，不在本轮直接进入实现：

- 参考 `/home/jianghua519/ai-web-testing-platform` 中已经存在的录制、分析、测试资产、执行、比对和报告能力。
- 评估当前仓库 `/home/jianghua519/ai-testing-platform` 已有基线是否足以承接上述能力。
- 输出一份可落地的 GAP 分析，明确哪些能力可以复用现有 `control-plane + worker + DSL + artifact` 骨架，哪些需要新增领域模型、API、服务或 UI。
- 给出后续实现的推荐顺序，避免直接照搬参考仓库的技术栈和服务拆分。

## 范围

- 当前仓库：
  - `apps/control-plane`
  - `apps/web-worker`
  - `packages/web-dsl-schema`
  - `packages/dsl-compiler`
  - `contracts/openapi.yaml`
  - `contracts/asyncapi.yaml`
  - `docs/v2/*`
- 参考仓库：
  - `services/orchestrator`
  - `services/runner`
  - `services/reporting-service`
  - `local-agent`
  - `services/web-app`

本轮只做代码与架构调研、文档整理和差距拆解，不修改运行时业务逻辑。

## 验收标准

- 文档能明确区分“现有执行视频 artifact”与“录制生成测试资产”不是同一能力。
- 文档能按能力域拆出至少以下 GAP：
  - 录制接入
  - 录制分析提取测试 case / 测试数据
  - 测试资产管理与版本
  - 数据驱动执行
  - 结果比较
  - 测试报告生成
- 文档能指出当前仓库中已有但未落地的契约，例如报告相关 OpenAPI 与实际实现之间的差距。
- 文档给出分阶段建议，并明确哪些参考实现可以借鉴行为，哪些不建议直接搬运。

## 约束

- 不与 [docs/v2/c4.md](/home/jianghua519/ai-testing-platform/docs/v2/c4.md) 和 [docs/v2/execution-state-machine.md](/home/jianghua519/ai-testing-platform/docs/v2/execution-state-machine.md) 的边界规则冲突。
- 保持当前仓库以 TypeScript monorepo 为主的实现方向，不因为参考仓库包含 Go / Python 服务就直接引入同等复杂度的技术栈。
- 新能力的领域归属必须遵守当前仓库“Control Plane 管业务状态，Data Plane 管执行与 artifact”的边界。
- 文档统一使用中文。
