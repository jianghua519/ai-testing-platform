---
title: 真实浏览器smoke run测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证真实 Playwright Chromium 安装、真实浏览器 smoke run 执行、目标站点命中记录和 control-plane step patch 主链路。
---

# 真实浏览器smoke run测试计划

## 测试范围

- Playwright CLI 与浏览器版本对齐
- Chromium 浏览器安装
- `scripts/run_real_browser_smoke.mjs`
- `npm run smoke:web:real` 命令入口
- control-plane step patch 与结果回传主链路

## 关键风险

- CLI 下载的浏览器 revision 与 `playwright-core` 版本不一致
- 真实浏览器启动失败
- smoke run 仍然走 fake browser 而不是 `PlaywrightBrowserLauncher`
- 目标站点没有留下真实浏览器请求证据

## 测试项

1. 运行 `npm install`
2. 运行 `npm run typecheck`
3. 运行 `npm run playwright:install`
4. 运行 `npm run smoke:web:real`
5. 检查结果中是否出现：
   - `resultStatus=executed`
   - `targetHits` 命中 `/home` 和 `/dashboard-patched`
   - `firstUserAgent` 含 `HeadlessChrome`
   - `finalStepUrlPatched=true`
6. 运行文档校验
7. 运行契约校验
8. 检查容器入口缺失情况

## 通过标准

- Playwright 浏览器安装成功
- smoke run 成功执行
- 目标站点留下真实 Chromium 请求证据
- control-plane step patch 链路未回退
