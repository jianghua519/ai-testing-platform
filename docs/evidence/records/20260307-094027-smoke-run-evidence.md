---
title: 真实浏览器smoke run测试举证
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录“真实浏览器smoke run”的执行证据、运行信息和追溯关系。
---

# 真实浏览器smoke run测试举证

## 执行元数据

- 日期：2026-03-07
- 执行者：architecture
- 任务：真实浏览器smoke run
- 环境：本机宿主环境，Node.js v22.22.0，npm 10.9.4，Playwright Chromium 145.0.7632.6

## 证据内容

- Run ID：`real-browser-smoke-20260307`
- 命令：
- `npm install`
- `npm run typecheck`
- `npm run playwright:install`
- `npm run smoke:web:real`
- `bash ./scripts/validate_docs.sh`
- `bash ./scripts/validate_contracts.sh`
- 产物位置：
- 运行脚本：[run_real_browser_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_real_browser_smoke.mjs)
- 测试报告：[20260307-094027-smoke-run-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-094027-smoke-run-test-report.md)
- 关键结果：
- `resultStatus=executed`
- `eventTypes=["step.result_reported","step.result_reported","job.result_reported"]`
- `targetHits=["/home","/dashboard-patched"]`
- `firstUserAgent` 含 `HeadlessChrome/145.0.7632.6`
- `finalStepUrlPatched=true`
- 结论：本轮验证已使用真实 Playwright Chromium 访问本地目标站点，不再依赖 fake browser 对象。

## 追溯关系

- 测试报告：[20260307-094027-smoke-run-test-report.md](/home/jianghua519/ai-web-testing-platform-v2/docs/testing/test-reports/20260307-094027-smoke-run-test-report.md)
- 相关任务：[20260307-094027-smoke-run-project-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/project/tasks/20260307-094027-smoke-run-project-task.md)
- 设计说明：[20260307-094027-smoke-run-design-task.md](/home/jianghua519/ai-web-testing-platform-v2/docs/design/tasks/20260307-094027-smoke-run-design-task.md)
