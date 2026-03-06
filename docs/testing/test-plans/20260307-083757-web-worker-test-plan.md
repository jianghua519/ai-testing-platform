---
title: web-worker 代码骨架测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证本轮 web-worker workspace、执行主链路和根 workspace 接线是否建立完成，并至少完成一次真实运行流。
---

# web-worker 代码骨架测试计划

## 测试范围

- `apps/web-worker` 目录结构与核心文件。
- `WebWorkerJob`、`WebWorkerResult`、`WebJobRunner`、`BrowserLauncher`、`ResultPublisher`。
- 根 workspace `typecheck`。
- 一次真实 `WebJobRunner.run()` 运行流。
- 文档校验、契约校验和运行入口检查。

## 覆盖风险

- worker 包存在但没有真实主执行链路。
- compile、launch、session、adapter、publish 之间没有串通。
- 运行验证只有静态检查，没有代码运行证据。
- 文档未同步更新。

## 测试用例

1. 检查 `apps/web-worker` 是否存在 `job-runner`、`session`、`reporting`、`bootstrap`、`testing`。
2. 检查 `WebJobRunner.run()` 是否调用 compiler 和 adapter。
3. 执行 `npm install`。
4. 执行 `npm run typecheck`。
5. 执行一次 `node --input-type=module` 运行流，验证 `WebJobRunner.run()` 输出。
6. 执行 `bash ./scripts/validate_docs.sh`。
7. 执行 `bash ./scripts/validate_contracts.sh`。
8. 检查仓库是否存在 `docker-compose` / `Dockerfile` 等运行入口。

## 通过标准

- `apps/web-worker` 代码骨架存在并通过 typecheck。
- 至少一次真实 `WebJobRunner.run()` 已执行并产生结果。
- 文档校验和契约校验通过。
- 容器和真实浏览器验证的限制被明确记录。
