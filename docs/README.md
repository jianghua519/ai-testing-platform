---
title: Documentation Map
status: active
owner: docs
last_updated: 2026-03-06
summary: 仓库文档目录、必备交付物和自动化校验流程说明。
---

# 文档地图

这个仓库把文档视为交付物，而不是副产物。

## 标准目录

- `docs/project/`：项目目标、范围、任务说明和交付背景。
- `docs/design/`：设计索引、设计说明、ADR 和技术决策。
- `docs/testing/`：测试策略、测试计划、测试报告。
- `docs/evidence/`：测试举证索引和每次执行的证据记录。
- `docs/standards/`：治理规则，供校验脚本执行。
- `docs/templates/`：项目文档、设计文档、测试文档、举证文档模板。
- `docs/v2/`：V2 规范性架构与契约配套说明。

## 必备基线文档

- `docs/standards/documentation-governance.md`
- `docs/project/project-overview.md`
- `docs/project/tasks/README.md`
- `docs/design/design-index.md`
- `docs/design/tasks/README.md`
- `docs/testing/test-strategy.md`
- `docs/testing/test-plans/README.md`
- `docs/testing/test-reports/README.md`
- `docs/evidence/evidence-index.md`

## 自动化入口

- 初始化一套中文交付文档：
  - `bash ./scripts/create_delivery_bundle.sh "请做xxx"`
- 生成后自动提交：
  - `bash ./scripts/create_delivery_bundle.sh "请做xxx" --git`
- 生成后自动提交并推送：
  - `bash ./scripts/create_delivery_bundle.sh "请做xxx" --git --push`

脚本会自动创建：

- 项目任务说明
- 设计说明
- 测试计划
- 测试报告
- 测试举证

同时自动更新任务索引和举证索引。

## 更新规则

- `docs/` 下所有非模板 Markdown 文档都必须包含 YAML front matter，至少包含 `title`、`status`、`owner`、`last_updated`、`summary`。
- 模板文件可以保留占位片段；正式文档不能保留未完成占位标记。
- 测试计划必须放在 `docs/testing/test-plans/`。
- 测试报告必须放在 `docs/testing/test-reports/`。
- 测试证据必须放在 `docs/evidence/records/`，并登记到 `docs/evidence/evidence-index.md`。

## 校验

- 本地：`make validate`
- 直接运行：`bash ./scripts/validate_docs.sh`
- CI：`.github/workflows/ci.yml`
