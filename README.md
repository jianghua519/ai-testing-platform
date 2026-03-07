# AI Web Testing Platform V2

这个仓库当前以架构、契约和交付文档治理为先。

当前代码骨架：

- `apps/web-worker`：Web 执行 worker，负责编译 DSL、启动浏览器会话、执行 step、回传结果
- `apps/control-plane`：最小控制面 API，负责接收 runner 结果、提供 step 决策接口，并支持 `inmemory`、`file`、`postgres` 三种存储模式；PostgreSQL 模式已具备正式 migration runner、`runs`、`run_items`、`step_events`、`step_decisions` 领域表投影，以及最小查询接口骨架
- `packages/web-dsl-schema`：源 DSL、编译后模型、执行结果类型
- `packages/dsl-compiler`：DSL 编译器骨架
- `packages/playwright-adapter`：Playwright 执行适配层与 step 执行引擎

优先阅读：

- `docs/README.md`：文档地图、治理规则、模板和自动化入口
- `docs/v2/c4.md`：V2 架构与部署边界
- `docs/v2/tenancy-policy.md`：租户隔离策略
- `docs/v2/execution-state-machine.md`：执行状态机与幂等规则
- `contracts/openapi.yaml`：REST API 契约
- `contracts/asyncapi.yaml`：事件契约

实现不得与上述规范文档冲突。

常用命令：

- `make validate`
- `make typecheck`
- `bash ./scripts/validate_contracts.sh`
- `bash ./scripts/validate_docs.sh`
- `npm install`
- `npm run typecheck`
- `npm run control-plane:migrate:postgres`
- `npm run playwright:install`
- `npm run smoke:web:real`：真实 Chromium 覆盖 `open`、`click`、`input`、`upload`、`assert`
- `npm run smoke:control-plane:postgres`：control-plane PostgreSQL 存储链路快路径 smoke（`pg-mem`）
- `npm run smoke:control-plane:postgres:real`：真实外部 PostgreSQL 实例 smoke（嵌入式 PostgreSQL 进程），覆盖 migration、query API 和恢复验证
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造"`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git --push`
