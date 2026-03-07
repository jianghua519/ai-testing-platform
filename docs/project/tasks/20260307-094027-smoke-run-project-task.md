---
title: 真实浏览器smoke run任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 把当前 fake browser 验证替换成真实 Playwright 浏览器 smoke run，并将其固化为仓库内可复用脚本与命令入口。
---

# 真实浏览器smoke run任务说明

## 目标

把当前依赖 fake browser 对象的运行验证，替换成真实 Playwright 浏览器 smoke run，并满足以下要求：

- 使用真实 Chromium 启动浏览器
- 通过仓库内真实 `control-plane` API 完成 step patch 链路
- 用真实本地目标站点完成导航
- 将这条链路固化为仓库内可重复执行的命令

## 范围

- 根 `package.json` 的 Playwright 依赖和脚本入口
- 真实浏览器 smoke 脚本
- README 命令入口说明
- 本轮中文任务/设计/测试/举证文档

## 验收标准

- 能执行 `npm run playwright:install`
- 能执行 `npm run smoke:web:real`
- smoke run 结果中能看到真实浏览器访问目标站点
- 控制面 step patch 链路仍成立
- 文档校验和契约校验通过

## 约束

- 当前仓库没有 `docker-compose` / `Dockerfile`，无法按容器方式验证
- 当前 smoke run 仍是本地开发级验证，不是生产部署验证
- 当前 smoke run 使用本地临时目标站点，不是外部业务系统
