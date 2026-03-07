---
title: 真实浏览器smoke run设计说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 说明本轮如何把 fake browser 验证替换成真实 Playwright Chromium smoke run，并沉淀为仓库内可复用脚本。
---

# 真实浏览器smoke run设计说明

## 背景

到上一轮为止，worker 与 control-plane 的主链路已经跑通，但运行验证仍然有一个明显短板：

- 浏览器层依赖 fake browser 对象

这意味着虽然编译器、worker、control-plane、step override、结果回传都走了真实代码，但最关键的浏览器执行层还没有被真实 Playwright 浏览器证明。

## 设计目标

- 把 smoke run 固化为仓库内脚本，而不是临时命令
- 使用真实 `PlaywrightBrowserLauncher`
- 使用真实 Chromium 浏览器，而不是 fake browser
- 继续保留 control-plane step patch 与结果回传链路
- 让后续任何人都能用一条命令复现这次验证

## 一、依赖和命令入口

### 1.1 依赖版本统一

本轮将以下版本统一到 `1.58.2`：

- 根仓库 `playwright`
- `apps/web-worker` 的 `playwright-core`
- `packages/playwright-adapter` 的 `playwright-core`

这样可以避免 CLI 下载的浏览器 revision 和运行时代码期望的 revision 不一致。

### 1.2 根命令入口

[root package.json](/home/jianghua519/ai-web-testing-platform-v2/package.json) 新增：

- `npm run playwright:install`
- `npm run smoke:web:real`

这让真实浏览器验证从“临时手工命令”变成“仓库标准命令”。

## 二、smoke 脚本

### 2.1 位置

新增脚本：[run_real_browser_smoke.mjs](/home/jianghua519/ai-web-testing-platform-v2/scripts/run_real_browser_smoke.mjs)

### 2.2 运行结构

这个脚本会启动三部分：

1. 本地目标站点
2. 仓库内真实 `control-plane`
3. 使用真实 `PlaywrightBrowserLauncher` 的 `WebJobRunner`

### 2.3 本地目标站点

脚本内置一个最小 HTTP server，提供：

- `/home`
- `/dashboard-original`
- `/dashboard-patched`

这样 smoke run 不依赖任何外部网站，完全在本机闭环完成。

同时它会记录：

- 访问路径
- `user-agent`

这点很关键，因为 `user-agent` 能直接证明发起请求的是实际浏览器进程，而不是 fake object。

## 三、真实执行链路

smoke run 的真实执行过程是：

1. 启动本地目标站点
2. 启动仓库内真实 `control-plane`
3. 准备 worker fixture，把 step URL 指向本地目标站点
4. 先通过 override API 给 `open-dashboard` 预置一次 `pause`
5. 启动 `WebJobRunner.run()`，这次使用真实 `PlaywrightBrowserLauncher`
6. 当 control-plane 观察到 `open-home` 的 step 结果后，再通过 override API 提交一个 `replace`
7. worker 实际导航到 `/dashboard-patched`
8. 收集 event types、step ids、目标站点命中路径、浏览器 `user-agent`

## 四、关键验证标准

本轮把“真实浏览器”定义成两个证据同时成立：

- `targetHits` 中出现真实 HTTP 请求路径
- `user-agent` 中出现真实 `HeadlessChrome/...`

这比仅仅看到 `resultStatus=executed` 更严格，因为只有真实 Chromium 进程访问目标站点，才会在目标 server 上留下这样的请求证据。

## 五、README 更新

[README.md](/home/jianghua519/ai-web-testing-platform-v2/README.md) 已补充：

- `npm run playwright:install`
- `npm run smoke:web:real`

后续这条路径已经是仓库标准操作，不再需要临时拼命令。

## 六、真实运行结果

本轮真实 smoke run 已执行成功，关键结果为：

- `resultStatus=executed`
- `eventTypes=["step.result_reported","step.result_reported","job.result_reported"]`
- `targetHits=["/home","/dashboard-patched"]`
- `firstUserAgent=Mozilla/5.0 ... HeadlessChrome/145.0.7632.6 ...`
- `finalStepUrlPatched=true`

这说明：

- 真实浏览器已经访问到本地目标站点
- step1 后远程 patch step2 的链路仍然成立
- 之前的 fake browser 验证已经被真实浏览器 smoke run 替换

## 风险

- 当前 smoke run 只覆盖 Chromium headless，没有覆盖 Firefox 和 WebKit
- 当前 smoke run 仍是本地开发级验证，不是容器或生产环境验证
- 真实浏览器已验证导航链路，但还没有覆盖 click/input/assert/upload 等更复杂动作

## 验证计划

- 运行 `npm install`
- 运行 `npm run typecheck`
- 运行 `npm run playwright:install`
- 运行 `npm run smoke:web:real`
- 运行 `bash ./scripts/validate_docs.sh` 和 `bash ./scripts/validate_contracts.sh`
- 检查容器入口缺失情况
