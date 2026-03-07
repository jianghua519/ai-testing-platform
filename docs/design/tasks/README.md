---
title: 任务设计说明索引
status: active
owner: architecture
last_updated: 2026-03-07
summary: 任务级设计说明文档的存放位置和索引规则。
---

# 任务设计说明索引

每个正式任务都应在这里生成一份设计说明，记录背景、方案、风险和验证计划。

推荐命名：

- `YYYY-MM-DD-<scope>-design-task.md`

可以通过 `bash ./scripts/create_delivery_bundle.sh "请做xxx"` 自动生成。

- `2026-03-07`: `docs/design/tasks/20260307-000210-task-design-task.md` - 中文交付流程示例

- `2026-03-07`: `docs/design/tasks/20260307-000321-task-design-task.md` - 二次生成回归验证

- `2026-03-07`: `docs/design/tasks/20260307-001530-ai-design-task.md` - AI自动化测试工具架构设计

- `2026-03-07`: `docs/design/tasks/20260307-003354-ai-design-task.md` - AI自动化测试工具主要技术选型

- `2026-03-07`: `docs/design/tasks/20260307-004439-go-agent-web-step-dsl-design-task.md` - Go控制面Agent协议Web step DSL接口和数据模型设计

- `2026-03-07`: `docs/design/tasks/20260307-005156-web-step-dsl-design-task.md` - Web step DSL字段约束状态机示例集合设计

- `2026-03-07`: `docs/design/tasks/20260307-075804-web-step-dsl-playwright-design-task.md` - Web step DSL编译规则Playwright执行映射表设计

- `2026-03-07`: `docs/design/tasks/20260307-080827-dsl-playwright-design-task.md` - DSL 编译器模块设计与 Playwright 适配层包结构

- `2026-03-07`: `docs/design/tasks/20260307-082310-web-dsl-schema-dsl-compiler-design-task.md` - web-dsl-schema 与 dsl-compiler 代码骨架

- `2026-03-07`: `docs/design/tasks/20260307-083028-playwright-adapter-design-task.md` - playwright-adapter 代码骨架

- `2026-03-07`: `docs/design/tasks/20260307-083757-web-worker-design-task.md` - web-worker 代码骨架

- `2026-03-07`: `docs/design/tasks/20260307-084405-web-worker-http-publisher-design-task.md` - web-worker 结果回传协议与 HTTP publisher

- `2026-03-07`: `docs/design/tasks/20260307-085850-step-design-task.md` - step级执行控制与回传

- `2026-03-07`: `docs/design/tasks/20260307-091146-step-design-task.md` - 远程step控制协议

- `2026-03-07`: `docs/design/tasks/20260307-092221-control-plane-api-design-task.md` - control-plane API接入

- `2026-03-07`: `docs/design/tasks/20260307-093158-control-plane-design-task.md` - control-plane持久化和结果幂等

- `2026-03-07`: `docs/design/tasks/20260307-094027-smoke-run-design-task.md` - 真实浏览器smoke run

- `2026-03-07`: `docs/design/tasks/20260307-095018-smoke-run-design-task.md` - 真实浏览器交互 smoke run 扩展

- `2026-03-07`: `docs/design/tasks/20260307-100206-control-plane-postgresql-design-task.md` - control-plane PostgreSQL持久化骨架

- `2026-03-07`: `docs/design/tasks/20260307-101158-control-plane-design-task.md` - control-plane领域模型表扩展

- `2026-03-07`: `docs/design/tasks/20260307-102523-postgresql-design-task.md` - 外部 PostgreSQL 实例验证

- `2026-03-07`: `docs/design/tasks/20260307-103640-control-plane-migration-design-task.md` - control-plane正式migration体系和查询接口骨架

- `2026-03-07`: `docs/design/tasks/20260307-111112-control-plane-002-migration-design-task.md` - control-plane 002 migration、分页查询接口和容器化本地栈

- `2026-03-07`: `docs/design/tasks/20260307-115908-control-plane-agent-worker-postgresql-design-task.md` - 把 control-plane + agent + worker + PostgreSQL 做成真正的调度系统

- `2026-03-07`: `docs/design/tasks/20260307-124416-playwright-agent-capability-lease-design-task.md` - 真实 Playwright 调度执行与 agent capability/lease 正式化

- `2026-03-07`: `docs/design/tasks/20260307-133052-cancel-pause-resume-artifact-design-task.md` - 并发槽位、cancel/pause/resume 与 artifact 真采集闭环

- `2026-03-07`: `docs/design/tasks/20260307-150657-artifact-object-storage-retention-design-task.md` - artifact 对象存储、下载与保留策略

- `2026-03-07`: `docs/design/tasks/20260307-173247-control-plane-tenant-schema-token-design-task.md` - control-plane tenant schema隔离与token租户上下文
