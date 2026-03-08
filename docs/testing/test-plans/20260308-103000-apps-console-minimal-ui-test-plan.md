---
title: apps console 最小工作台 UI 测试计划
status: active
owner: qa
last_updated: 2026-03-08
summary: 验证 apps/console 在容器化本地栈中能够读取真实数据并完成最小 UI 闭环操作。
---

# apps console 最小工作台 UI 测试计划

## 测试范围

- 新增 `apps/console` 是否能通过 workspace 构建和 Docker 镜像构建
- Compose 环境中 `console` 服务是否能成功启动并通过健康检查
- 页面是否覆盖 `Overview`、`Assets`、`Runs`、`AI Workspace`
- 页面是否基于真实 workflow 数据展示列表、详情和关联对象
- 至少一个真实编辑动作是否能通过 UI 提交并回写数据库

## 覆盖风险

- `apps/console` 未接入 workspace 或 Docker 构建，导致镜像不可构建
- 页面查询直接读 PostgreSQL 时，tenant/project 过滤不正确
- UI 详情页渲染了设计稿中的理想字段，但底座实际没有对应数据
- UI 动作表单调用现有 API 时，请求体或权限上下文不匹配
- smoke 只验证静态页面，未覆盖真实 workflow 数据和回写动作

## 测试用例

1. 执行 `docker compose build tools control-plane ai-orchestrator console`，确认 typecheck 和镜像构建通过。
2. 执行 `AI_PROVIDER=mock npm run compose:postgres:reset`，重建 PostgreSQL / MinIO 本地基线。
3. 执行 `AI_PROVIDER=mock docker compose up -d console --wait`，确认 `console` 服务进入 `healthy`。
4. 执行 `docker compose exec -T tools npm run smoke:console:compose`，先跑真实 AI workflow 造数，再用 Playwright 访问 console。
5. 在 smoke 中验证：
   - `/overview` 可打开并显示统计与证据摘要
   - `/assets` 可切换 `test-cases` 与 `recordings`
   - `/runs` 可展示失败 run 详情和 AI diagnostics
   - `/ai-workspace` 可展示 thread / exploration 详情
   - thread 标题编辑动作提交成功且页面回显新标题
6. 执行 `bash ./scripts/validate_docs.sh`，确认本轮补充文档通过校验。

## 通过标准

- `console` 在 compose 中成功启动，健康检查通过
- smoke 返回 `status="ok"`，且包含真实生成的 thread / exploration / recording / run / evaluation 信息
- 至少一个 UI 编辑动作成功提交并在页面回显
- 文档校验通过，新增文档都带完整 front matter 并登记索引
