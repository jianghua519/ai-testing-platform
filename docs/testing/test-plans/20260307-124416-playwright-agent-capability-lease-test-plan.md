---
title: 真实 Playwright 调度执行与 agent capability/lease 正式化测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 定义 capability 匹配、真实浏览器调度 smoke、migration 和容器化校验的验证范围与退出标准。
---

# 真实 Playwright 调度执行与 agent capability/lease 正式化测试计划

## 测试范围

- `004_control_plane_capability_requirements.sql` 能被正式 migration runner 应用。
- `run_items.required_capabilities_json` 能正确写入并用于 lease 匹配。
- compose 栈中的调度 smoke 能真实拉起 Playwright Chromium。
- Firefox agent 与 Chromium job 的 capability 不匹配时，会保持 idle。
- README、OpenAPI 和本轮文档与实现一致。

## 覆盖风险

- capability 字段落库了，但 `acquireLease()` 没真正使用它。
- 浏览器镜像能构建，但 Playwright 在容器内无法启动。
- 调度 smoke 仍可能回退为假浏览器验证。
- 本轮 README 和文档未同步到真实能力边界。

## 测试项

1. `docker compose build`
2. `docker compose up -d postgres --wait`
3. `docker compose run --rm tools npm run typecheck`
4. `docker compose run --rm tools bash ./scripts/validate_contracts.sh`
5. `docker compose run --rm tools npm run control-plane:migrate:postgres`
6. `docker compose up -d control-plane --wait`
7. `docker compose run --rm tools npm run smoke:control-plane:compose`
8. `docker compose run --rm tools npm run smoke:scheduler:compose`
9. `docker compose run --rm -v "$PWD:/app" tools bash ./scripts/validate_docs.sh`

## 通过标准

- 所有命令退出码为 0。
- migration 输出 `appliedCount=4`。
- scheduler smoke 输出 `firefoxCycle.status="idle"`。
- scheduler smoke 输出 `firstUserAgent` 含 `HeadlessChrome`。
- scheduler smoke 输出两条 `submissions`，且文件名为 `avatar-smoke.txt`。
- `runItemRows.required_capabilities_json` 包含 `web` 和 `browser:chromium`。
