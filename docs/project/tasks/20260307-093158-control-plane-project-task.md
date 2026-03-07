---
title: control-plane持久化和结果幂等任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 把最小 control-plane 从纯内存状态推进到文件持久化仓储，并为 runner 结果接收接口补上按 event_id 的幂等处理。
---

# control-plane持久化和结果幂等任务说明

## 目标

在上一轮最小 control-plane API 的基础上，补齐两个最基本但不能缺的运行能力：

- 状态持久化：服务重启后仍能恢复已接收事件和待消费决策
- 结果幂等：同一个 runner 结果 envelope 重复上报时，不会被重复写入

## 范围

- `apps/control-plane` 的 store 抽象
- 文件持久化实现
- `runner-results` 接口的幂等响应
- fixture 与契约一致性收敛
- 中文任务/设计/测试/举证文档

## 验收标准

- `startControlPlaneServer()` 默认可装配文件持久化仓储
- 重复提交同一个 `event_id` 时，事件总数不增加
- 重启 control-plane 后，之前的事件仍可查询
- `npm run typecheck`、文档校验、契约校验通过
- 至少完成一次真实联调，覆盖 step patch、重复投递和重启恢复

## 约束

- 当前仓库没有 `docker-compose` / `Dockerfile`，无法按容器方式验证
- 当前持久化仓储是文件实现，不是数据库实现
- 当前运行验证仍使用 fake browser 对象，不是真实浏览器 E2E
