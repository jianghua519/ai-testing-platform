---
title: control-plane、agent、worker 与 PostgreSQL 调度系统任务说明
status: active
owner: architecture
last_updated: 2026-03-07
summary: 将 control-plane、轮询式 agent、web worker 与 PostgreSQL 串成最小可运行调度系统，并在容器化本地栈中完成真实验证。
---

# control-plane、agent、worker 与 PostgreSQL 调度系统任务说明

## 目标

把仓库从“有控制面、有 worker、有 PostgreSQL 存储”推进到“真正可调度”的下一阶段底座：

- control-plane 能接受 web run 入队。
- agent 能向 control-plane 注册、心跳并获取 job lease。
- worker 能消费租约中的 web job，执行后回传 step 与 job 结果。
- PostgreSQL 能保存租约、run、run_item、step event 和原始结果事件。
- 这条链路能在容器化本地栈里真实跑通。

## 范围

- `apps/control-plane` 的调度数据模型、存储实现和 HTTP API
- `apps/web-worker` 的 agent 客户端与轮询主循环
- `apps/control-plane/sql/003_control_plane_scheduler.sql`
- `contracts/openapi.yaml`
- 容器化本地栈 smoke 脚本与仓库命令入口
- 本轮任务对应的设计、测试计划、测试报告和举证文档

## 验收标准

- PostgreSQL migration runner 能应用 `001`、`002`、`003` 三个 migration。
- control-plane 支持 web run 入队、agent 注册/心跳、租约获取/续租/完成。
- 轮询式 agent 能真实拉取至少 2 个 job 并在完成后回传结果。
- compose 栈中的 smoke 输出能证明：
  - 2 个 run 成功执行完成。
  - 2 条 lease 进入 `completed` 且已释放。
  - `run_items` 最终状态为 `passed`，并清空 `assigned_agent_id` 与 `lease_token`。
- 中文文档、测试计划、测试报告、举证记录和 README 更新齐全并通过校验。

## 约束

- 本轮只做最小调度系统，不引入真正的消息队列。
- agent 采用 HTTP 轮询模型，不做长连接控制通道替换。
- 调度 smoke 以 fake browser launcher 证明调度闭环，不替代真实浏览器 smoke。
- 容器化验证限定在本地 `docker compose` 栈，不扩展到远程集群或 CI 平台。
