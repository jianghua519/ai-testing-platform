---
title: 文档自动化测试计划
status: active
owner: qa
last_updated: 2026-03-06
summary: 用于验证文档治理、模板和完整性自动化能力的测试计划。
---

# 文档自动化测试计划

## 测试范围

验证仓库是否已经具备基线文档结构、中文模板和自动完整性校验能力。

## 覆盖风险

- 必备文档类别缺失。
- Markdown 文档缺少元数据。
- 正式文档残留未完成占位片段。
- 证据文档生成后未登记到索引。
- CI 未执行新的文档校验步骤。

## 测试用例

1. 运行 `bash ./scripts/validate_contracts.sh`。
2. 运行 `bash ./scripts/validate_docs.sh`。
3. 确认 `Makefile` 同时包含两个校验脚本。
4. 确认 `.github/workflows/ci.yml` 仍然执行 `make validate`。
5. 确认测试报告和证据记录已落盘并形成交叉引用。

## 通过标准

- 两个校验脚本都成功退出。
- 必备文档存在于标准目录。
- 证据索引已登记对应证据记录。
