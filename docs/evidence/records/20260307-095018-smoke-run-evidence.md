---
title: 真实浏览器交互 smoke run 扩展测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录“真实浏览器交互 smoke run 扩展”的执行证据、运行信息和追溯关系。
---

# 真实浏览器交互 smoke run 扩展测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：architecture
- 任务：真实浏览器交互 smoke run 扩展
- 环境：本机宿主环境，Node.js v22.22.0，npm 10.9.4，Playwright Chromium 145.0.7632.6

## 证据内容

- Run ID：`real-browser-interaction-smoke-20260307`
- 命令：
- `npm run typecheck`
- `npm run smoke:web:real`
- `bash ./scripts/validate_docs.sh`
- `bash ./scripts/validate_contracts.sh`
- 产物位置：
- 运行脚本：[run_real_browser_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_real_browser_smoke.mjs)
- 测试报告：[20260307-095018-smoke-run-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-095018-smoke-run-test-report.md)
- 关键结果：
- 7 个 step 均已真实执行并上报
- `targetHits=["/home","/profile-form","/submit"]`
- `submissionPayloads[0].displayName="Smoke User"`
- `submissionPayloads[0].fileName="avatar-smoke.txt"`
- `firstUserAgent` 含 `HeadlessChrome/145.0.7632.6`
- `finalAssertPatched=true`
- 结论：真实浏览器 smoke run 已经覆盖主要交互能力，不再只是导航验证。

## 追溯关系

- 测试报告：[20260307-095018-smoke-run-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-095018-smoke-run-test-report.md)
- 相关任务：[20260307-095018-smoke-run-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-095018-smoke-run-project-task.md)
- 设计说明：[20260307-095018-smoke-run-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-095018-smoke-run-design-task.md)
