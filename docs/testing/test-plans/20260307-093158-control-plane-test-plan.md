---
title: control-plane持久化和结果幂等测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证 control-plane 的文件持久化仓储、runner-results 幂等行为、重启恢复，以及 step patch 主链路未回退。
---

# control-plane持久化和结果幂等测试计划

## 测试范围

- `ControlPlaneStore` 抽象与内存实现
- `FileBackedControlPlaneStore`
- `runner-results` 幂等响应
- fixture 与 UUID 契约收敛
- 持久化文件恢复后的事件查询能力

## 关键风险

- 幂等只在内存中生效，重启后失效
- 文件落盘不完整，导致恢复状态丢失
- 去重成功但误伤新事件
- 引入持久化后破坏原有 step patch 运行链路

## 测试项

1. 运行 `npm run typecheck`
2. 启动 file-backed control-plane 和 worker，验证 step patch 仍可执行
3. 读取事件列表，确认首次事件数为 3
4. 对同一 envelope 重复投递，验证返回 `duplicate=true`
5. 再次读取事件列表，确认事件数不增加
6. 重启 control-plane，确认事件数仍然保留
7. 运行文档校验和契约校验
8. 检查容器入口缺失情况

## 通过标准

- 类型检查通过
- 幂等接口重复投递返回 `duplicate=true`
- 去重前后事件数保持一致
- control-plane 重启后事件仍可查询
- step2 最终访问 URL 为持久化测试中指定的新 URL
