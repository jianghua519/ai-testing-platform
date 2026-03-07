---
title: control-plane API接入测试计划
status: active
owner: qa
last_updated: 2026-03-07
summary: 验证最小 control-plane 应用、worker 结果回传桥接、step override API 和真实联调结果。
---

# control-plane API接入测试计划

## 测试范围

- `apps/control-plane` 的 HTTP 服务启动与路由处理
- worker -> control-plane 的结果回传桥接
- control-plane -> worker 的 step 决策接口
- override API 与事件查询 API
- 文档与契约同步情况

## 关键风险

- control-plane 路由与 worker 请求路径不一致
- override 入队后，worker 没有正确消费 `pause` / `replace`
- runner result 没有被 control-plane 正确记录
- 新增 app 未纳入 workspace 编译链

## 测试项

1. 运行 `npm install`
2. 运行 `npm run typecheck`
3. 启动真实 `control-plane` 服务，验证 `GET /healthz`
4. 使用真实 `control-plane` API 完成一次联调：
   - 预置 `pause`
   - 观察 `open-home` step 结果
   - 通过 override API 提交 `replace`
   - 验证 step2 实际执行的是新 URL
5. 运行文档校验
6. 运行契约校验
7. 检查容器运行入口缺失情况

## 通过标准

- `npm install` 与 `npm run typecheck` 通过
- `control-plane` 服务可启动且 `healthz=ok`
- control-plane 存下两条 step 结果和一条 job 结果
- worker 最终访问 `https://example.com/dashboard-control-plane-patched`
- 文档校验和契约校验通过
