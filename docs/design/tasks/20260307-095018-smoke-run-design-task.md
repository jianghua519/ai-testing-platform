---
title: 真实浏览器交互 smoke run 扩展设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明如何把真实浏览器 smoke run 扩展为真实表单交互链路，并补齐 upload 执行能力。
---

# 真实浏览器交互 smoke run 扩展设计说明

## 背景

上一轮已经把 fake browser 替换成真实 Playwright Chromium，但场景只覆盖了 `open` 和远程 step patch。这个深度不够，因为它没有证明：

- `click` 是否真实生效
- `input` 是否真正写入页面
- `upload` 是否能把本地文件挂到浏览器 input
- `assert` 是否能在真实 DOM 更新后稳定通过

同时，执行层还存在一个实现缺口：

- DSL 里有 `upload` action
- `playwright-adapter` 里没有 `upload` executor

## 一、执行器补齐

在 [upload-executor.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/actions/upload-executor.ts) 新增 `UploadStepExecutor`：

- 仅处理 `executeMode=single` 且 `action=upload`
- 通过 `resolveInputValue()` 取得文件路径
- 使用 `locator.setInputFiles()` 把本地文件注入真实浏览器 input
- 与现有 action executor 保持一致的结果和错误归一化方式

并在 [adapter.ts](/home/jianghua519/ai-web-testing-platform-v2/packages/playwright-adapter/src/runtime/adapter.ts) 注册到默认 registry。

## 二、真实交互目标站点

`smoke` 脚本不再只提供两个静态页面，而是改成一个最小交互站点：

- `/home`：入口页，提供“开始填写资料”链接
- `/profile-form`：资料表单页，包含显示名称输入框、头像上传框、提交按钮、结果区域
- `/submit`：本地 JSON 接口，记录浏览器提交的 `displayName` 和 `fileName`

这样 smoke run 可以在本机闭环验证真实交互，而不依赖外部系统。

## 三、交互 smoke 场景

新的真实浏览器计划包含 7 个 step：

1. `open-home`
2. `click-open-profile-form`
3. `assert-profile-form-visible`
4. `input-display-name`
5. `upload-avatar`
6. `click-submit`
7. `assert-submit-result`

这条链路覆盖了用户要求的主要能力：

- `open`
- `click`
- `input`
- `upload`
- `assert`

## 四、远程 step 控制保持不回退

本轮没有删除已有的远程 step 控制，而是把它保留到更复杂的交互场景里：

- 初始计划中的 `assert-submit-result` 断言故意写成错误占位
- 在执行前先对该 step 预置一次 `pause`
- 当 `click-submit` 的 step 结果上报后，再通过 control-plane override API 把最终 assert step 替换成正确版本

这样本轮不仅验证了交互动作，也验证了“真实交互之后的 step 级远程控制”仍然成立。

## 五、真实浏览器判定标准

本轮把“真实浏览器交互已经发生”定义成以下证据同时成立：

- `targetHits` 包含 `/home`
- `targetHits` 包含 `/profile-form`
- `targetHits` 包含 `/submit`
- `firstUserAgent` 含 `HeadlessChrome`
- `submissionPayloads[0].displayName === "Smoke User"`
- `submissionPayloads[0].fileName === "avatar-smoke.txt"`

这比单纯看 step passed 更严格，因为它要求本地目标站点真实接收到浏览器导航和提交流量。

## 风险

- 当前 smoke run 只覆盖 Chromium headless
- `/submit` 是 JSON 模拟提交，不是 multipart 真后端
- 仍未覆盖多 tab、下载、iframe、复杂等待条件等高阶场景

## 验证计划

- 运行 `npm run typecheck`
- 运行 `npm run smoke:web:real`
- 检查 step 数量是否达到 7 个并全部 passed
- 检查目标站点命中路径和提交 payload
- 运行 `bash ./scripts/validate_docs.sh`
- 运行 `bash ./scripts/validate_contracts.sh`
- 检查容器入口缺失情况
