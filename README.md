# AI Web Testing Platform V2

这个仓库当前以架构、契约和交付文档治理为先。

当前代码骨架：

- `apps/web-worker`：Web 执行 worker，负责编译 DSL、启动浏览器会话、执行 step、回传结果
- `apps/control-plane`：最小控制面 API，负责接收 runner 结果、提供 step 决策接口，并默认把状态持久化到文件仓储
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
- `npm run playwright:install`
- `npm run smoke:web:real`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造"`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git --push`
