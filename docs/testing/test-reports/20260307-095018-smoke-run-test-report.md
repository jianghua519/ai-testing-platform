---
title: 真实浏览器交互 smoke run 扩展测试报告
status: active
owner: qa
last_updated: 2026-03-07
summary: 记录“真实浏览器交互 smoke run 扩展”的测试执行情况和关键结果。
---

# 真实浏览器交互 smoke run 扩展测试报告

## 环境

- 日期：2026-03-07
- 执行者：architecture
- 仓库：/home/jianghua519/ai-web-testing-platform-v2
- Node.js：v22.22.0
- npm：10.9.4
- 浏览器：Playwright Chromium 145.0.7632.6

## 执行检查

1. `npm run typecheck`
2. `npm run smoke:web:real`
3. `bash ./scripts/validate_docs.sh`
4. `bash ./scripts/validate_contracts.sh`
5. `rg --files -g 'docker-compose*' -g 'compose*.yml' -g 'compose*.yaml' -g 'Dockerfile*'`

- `typecheck` 通过
- 真实浏览器 smoke run 通过
- 文档校验通过
- 契约校验通过
- 仓库内未发现 `docker-compose`、`compose*.yml`、`compose*.yaml`、`Dockerfile*`，因此没有容器内验证

## 结果

- 本轮真实交互 smoke run 关键输出如下：

```json
{
  "health": {
    "status": "ok"
  },
  "resultStatus": "executed",
  "replacePosted": true,
  "eventTypes": [
    "step.result_reported",
    "step.result_reported",
    "step.result_reported",
    "step.result_reported",
    "step.result_reported",
    "step.result_reported",
    "step.result_reported",
    "job.result_reported"
  ],
  "stepIds": [
    "open-home",
    "click-open-profile-form",
    "assert-profile-form-visible",
    "input-display-name",
    "upload-avatar",
    "click-submit",
    "assert-submit-result"
  ],
  "targetHits": [
    "/home",
    "/profile-form",
    "/submit"
  ],
  "firstUserAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.7632.6 Safari/537.36",
  "submissionCount": 1,
  "submissionPayloads": [
    {
      "displayName": "Smoke User",
      "fileName": "avatar-smoke.txt"
    }
  ],
  "finalAssertPatched": true
}
```

- 通过项：
- 真实 Chromium 已经执行 `open`、`click`、`input`、`upload`、`assert`
- 本地服务真实收到了 `/submit` 提交
- 上传文件名和显示名称都由浏览器提交成功
- 最终 assert step 的远程替换链路保持成立
- 限制：
- 当前 smoke run 仍然只覆盖 Chromium headless
- `/submit` 使用 JSON 简化协议，不是 multipart 后端

## 关联证据

- [20260307-095018-smoke-run-evidence.md](/home/jianghua519/ai-web-testing-platform-v2/docs/evidence/records/20260307-095018-smoke-run-evidence.md)
