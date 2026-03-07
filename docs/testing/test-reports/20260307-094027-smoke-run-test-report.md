---
title: 真实浏览器smoke run测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录“真实浏览器smoke run”的测试执行情况和关键结果。
---

# 真实浏览器smoke run测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- Node.js：v22.22.0
- npm：10.9.4
- 浏览器：Playwright Chromium 145.0.7632.6

## 执行命令

1. `npm install`
2. `npm run typecheck`
3. `npm run playwright:install`
4. `npm run smoke:web:real`
5. `bash ./scripts/validate_docs.sh`
6. `bash ./scripts/validate_contracts.sh`
7. `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`

## 执行检查

- `npm install` 通过，最终依赖树无安全告警。
- `npm run typecheck` 通过。
- `npm run playwright:install` 通过，已安装 Chromium revision `1208` 和对应 headless shell。
- `npm run smoke:web:real` 通过，实际启动了仓库内 `control-plane` 服务、本地目标站点和真实 Chromium 浏览器。
- 文档校验通过。
- 契约校验通过。
- 仓库内未发现 `docker-compose`、`compose*.yml`、`compose*.yaml`、`Dockerfile*`，因此没有容器内验证。

## 结果

- 本轮真实 smoke run 关键输出如下：

```json
{
  "health": { "status": "ok" },
  "resultStatus": "executed",
  "replacePosted": true,
  "eventTypes": [
    "step.result_reported",
    "step.result_reported",
    "job.result_reported"
  ],
  "stepIds": [
    "open-home",
    "open-dashboard"
  ],
  "targetHits": [
    "/home",
    "/dashboard-patched"
  ],
  "firstUserAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.7632.6 Safari/537.36",
  "finalStepUrlPatched": true
}
```

- 通过项：
- 真实 Chromium 已经发起对本地目标站点的 HTTP 请求。
- `open-home` 执行后，`open-dashboard` 成功被远程替换为 patched URL。
- 结果回传链路仍然是 `step.result_reported -> step.result_reported -> job.result_reported`。
- 风险与限制：
- 本轮只验证 Chromium headless。
- 本轮仍然是 smoke run，不覆盖复杂交互动作。
- 本轮没有容器化验证。

## 关联证据

- [20260307-094027-smoke-run-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-094027-smoke-run-evidence.md)
