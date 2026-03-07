---
title: 测试资产领域模型与版本化执行任务说明
status: active
owner: squad
last_updated: 2026-03-07
summary: 为测试 case、case version、数据模板、默认测试数据、执行结果、artifact 和从结果反提 case 建立统一领域边界与实施约束。
---

# 测试资产领域模型与版本化执行任务说明

## 目标

围绕“测试资产化执行”补齐一份可实施的领域模型草案，明确以下能力如何在当前仓库中落地：

- 测试 case 的增删改查与执行。
- 测试 case 版本管理。
- 将 case 中的可变量提取为独立数据模板。
- 按数据模板结构管理数据行，并为 case version 绑定默认测试数据。
- 执行结果落库、artifact 落 MinIO。
- 支持按执行结果反提测试 case。

## 范围

- 文档设计与领域边界定义：
  - `test_cases`
  - `test_case_versions`
  - `data_templates`
  - `data_template_versions`
  - `dataset_rows`
  - `case_default_dataset_bindings`
  - `recordings`
  - `runs / run_items / step_events / artifacts`
  - `report_jobs`
- API 边界建议：
  - case CRUD / version / diff / publish
  - data template / dataset row CRUD
  - case 执行入口
  - 从 run / recording 派生 case

本轮不直接实现数据库 migration、运行时 API 或前端页面。

## 验收标准

- 文档明确区分 `test_case` 与 `test_case_version` 的边界，并要求版本不可变。
- 文档明确默认测试数据必须绑定到 `case_version`，而不是仅绑定到 `case`。
- 文档明确执行结果与 artifact 采用 append-only + 对象存储的原则，不允许修改结果事实。
- 文档给出最小可落地的 API 草案，并说明如何兼容现有 `inline_web_plan` 入口。
- 文档给出“从执行结果反提 case”的正确语义：只生成 draft，不直接覆盖现有发布版本。

## 约束

- 保持与 [docs/v2/c4.md](/home/jianghua519/ai-testing-platform/docs/v2/c4.md) 中 control plane / worker / artifact 的职责边界一致。
- 保持与 [contracts/openapi.yaml](/home/jianghua519/ai-testing-platform/contracts/openapi.yaml) 现有 `runs`、`report-jobs` 契约兼容，新增能力优先采用扩展而不是推翻。
- 运行结果仍然以 [apps/control-plane/src/runtime/postgres-control-plane-store.ts](/home/jianghua519/ai-testing-platform/apps/control-plane/src/runtime/postgres-control-plane-store.ts) 的事件投影思路为基础。
- artifact 存储仍然以 [apps/web-worker/src/session/artifact-storage.ts](/home/jianghua519/ai-testing-platform/apps/web-worker/src/session/artifact-storage.ts) 的 S3/MinIO 模式为基线。
