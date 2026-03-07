---
title: control-plane tenant schema隔离与最小身份token测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 围绕 control-plane tenant schema 隔离、最小身份 token 和实时 membership 授权解析的测试范围与退出标准说明。
---

# control-plane tenant schema隔离与最小身份token测试计划

## 测试范围

验证以下能力：

1. tenant schema migration、locator 和 membership 表是否正确建立。
2. `override -> decide -> runner-results` 链路在 tenant schema 下是否仍然成立。
3. 公开 API 是否按 Bearer token 的 `tenant_id` 和数据库 membership 做授权。
4. 调度、pause / resume / cancel、artifact 下载与清理是否在真实 compose 环境下无回退。
5. 本轮设计、测试和证据文档是否完成回填并可通过文档校验。

## 覆盖风险

- tenant schema 路由漏改，导致查询仍访问 public 表或跨 tenant 读写。
- token 设计与实时授权模型不一致，导致 project/role 变更无法及时生效。
- `override -> decide` 在 run 尚未落库时因外键或 locator 缺失而失效。
- compose smoke 脚本继续读旧表、未携带 token 或未 seed membership，导致误报。
- 文档仍保留“project/role 放入 token”的旧说法。

## 测试项

1. `docker compose run --build --rm tools npm run smoke:control-plane:postgres`
2. `docker compose build tools control-plane`
3. `docker rm -f ai-testing-platform-worker-agent`
4. `docker compose down -v`
5. `docker compose up -d postgres minio --wait`
6. `docker compose run --rm tools npm run control-plane:migrate:postgres`
7. `docker compose up -d control-plane --wait`
8. `docker compose run --rm tools npm run smoke:control-plane:compose`
9. `docker compose run --rm tools npm run smoke:scheduler:compose`
10. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 通过标准

- 所有容器内命令执行通过。
- 至少一条真实 compose 调度 run 成功完成，并有可引用的 `run_id`、`job_id`、artifact 下载/清理结果。
- tenant schema 业务表与 membership 授权链路有明确测试证据。
- 测试报告和证据记录已回填真实命令、输出和残余风险。
