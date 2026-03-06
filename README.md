# AI Web Testing Platform V2

这个仓库当前以架构、契约和交付文档治理为先。

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
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造"`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git`
- `bash ./scripts/create_delivery_bundle.sh "请做登录能力改造" --git --push`
