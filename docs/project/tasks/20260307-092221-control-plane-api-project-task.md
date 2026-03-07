---
title: control-plane API接入任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 在仓库内新增最小 control-plane 应用，承接 worker 结果回传和远程 step 决策，使 step 级控制不再依赖匿名临时 server。
---

# control-plane API接入任务说明

## 目标

把上一轮已经跑通的远程 step 控制协议，接到仓库内真实存在的 control-plane API 代码上，而不是继续依赖联调脚本里手写的匿名 HTTP server。最小闭环要求如下：

- control-plane 能接收 worker 的结果回传
- control-plane 能响应 worker 的 step 决策请求
- control-plane 能接收人工或 AI 提交的 step override 指令
- worker 能通过 control-plane 的真实 API，在 step1 结束后远程替换 step2 并继续执行

## 范围

- 新增 `apps/control-plane` 最小应用
- `OpenAPI` 内部桥接接口补齐
- `README` 与本轮中文任务/设计/测试/举证文档
- 真实联调验证

## 验收标准

- `apps/control-plane` 能通过 `npm run typecheck`
- `startControlPlaneServer()` 能启动健康检查、结果接收、step 决策、override、事件查询接口
- 至少完成一次真实联调：worker 把结果发给 control-plane，control-plane 返回 `pause` / `replace`，worker 最终执行更新后的 step2
- 文档校验和契约校验通过

## 约束

- 当前仓库没有 `docker-compose` / `Dockerfile`，无法按容器方式验证
- 当前 control-plane 是最小内存实现，不是完整持久化控制面
- 当前运行验证仍使用 fake browser 对象，不是真实浏览器 E2E
