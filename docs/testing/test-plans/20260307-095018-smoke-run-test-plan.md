---
title: 真实浏览器交互 smoke run 扩展测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证真实 Chromium 是否已覆盖 open、click、input、upload、assert 交互链路，并保持 control-plane step patch 主线成立。
---

# 真实浏览器交互 smoke run 扩展测试计划

## 测试范围

- `upload` action executor
- `scripts/run_real_browser_smoke.mjs`
- `npm run smoke:web:real`
- 本地目标站点 `/home`、`/profile-form`、`/submit`
- control-plane 的 `pause + replace` step override 流程

## 覆盖风险

- `upload` 只存在 DSL 类型中，执行时仍失败
- smoke run 没有真正触发浏览器 DOM 交互
- 上传文件名没有通过浏览器提交到本地服务
- 远程 step 替换在复杂交互场景中回退

## 测试项

1. 运行 `npm run typecheck`
2. 运行 `npm run smoke:web:real`
3. 检查结果中是否出现 7 个 `step.result_reported`
4. 检查 `targetHits` 是否包含 `/home`、`/profile-form`、`/submit`
5. 检查 `firstUserAgent` 是否包含 `HeadlessChrome`
6. 检查 `submissionPayloads[0]` 是否含 `Smoke User` 和 `avatar-smoke.txt`
7. 检查 `finalAssertPatched=true`
8. 运行文档校验
9. 运行契约校验
10. 检查容器入口缺失情况

## 通过标准

- 真实 Chromium 交互链路执行成功
- `upload` action 已经真实通过
- 交互提交结果被目标站点接收并记录
- 最终 assert step 远程替换后通过
