---
title: control-plane持久化和结果幂等测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 本轮已完成 control-plane 文件持久化和结果幂等，验证了重复投递不重复写入、重启后事件恢复，以及 step patch 主链路仍然成立。
---

# control-plane持久化和结果幂等测试报告

## 环境

- 日期：2026-03-07
- 执行者：Codex
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- 分支：main

## 执行检查

1. 类型检查：
   - `npm run typecheck`
2. 真实运行流验证：
   - `node --input-type=module <<'EOF' ... FileBackedControlPlaneStore + startControlPlaneServer() + WebJobRunner.run(...) ... EOF`
3. 文档校验：
   - `bash ./scripts/validate_docs.sh`
4. 契约校验：
   - `bash ./scripts/validate_contracts.sh`
5. 运行入口检查：
   - `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`

## 结果

- `npm run typecheck` 执行通过。
- 真实运行流验证成功，关键结果：
  - `health.status=ok`
  - `resultStatus=executed`
  - `initialEventCount=3`
  - `duplicateStatus=200`
  - `duplicateBody={"accepted":true,"duplicate":true}`
  - `dedupedEventCount=3`
  - `restoredEventCount=3`
  - `persistedFileHasEventIds=true`
  - `visitedUrls[0]=https://example.com/home`
  - `visitedUrls[1]=https://example.com/dashboard-persisted-patched`
  - `finalStepUrlPatched=true`
- `bash ./scripts/validate_docs.sh` 执行通过。
- `bash ./scripts/validate_contracts.sh` 执行通过。
- 仓库内未发现 `docker-compose` / `compose*.yml` / `compose*.yaml` / `Dockerfile*`，无法进行容器内验证。
- 本轮已启动仓库内真实 `control-plane` 服务，并使用文件仓储完成一次完整运行、重复投递和重启恢复验证。
- 本轮未执行真实浏览器 E2E；执行路径仍使用 fake browser 对象。

## 关联证据

- [20260307-093158-control-plane-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-093158-control-plane-evidence.md#L1)
