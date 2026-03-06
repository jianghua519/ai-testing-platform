---
title: 文档自动化测试报告
status: active
owner: qa
last_updated: 2026-03-06
summary: 文档治理、模板和完整性自动化能力的验证结果记录。
---

# 文档自动化测试报告

## 环境

- 日期：2026-03-06 23:54:15 JST
- 工作目录：`/home/jianghua519/ai-web-testing-platform-v2`
- 运行环境：本地 shell，具备 `bash` 和 `python3`

## 执行检查

- `bash ./scripts/validate_contracts.sh`
- `bash ./scripts/validate_docs.sh`
- 检查 `Makefile` 和 `.github/workflows/ci.yml` 是否已接入校验流程。

## 结果

- `validate_contracts.sh`：通过。
- `validate_docs.sh`：修复 front matter 正文解析后通过。
- `Makefile`：已同时执行契约校验和文档校验。
- `CI workflow`：仍然调用 `make validate`，现在覆盖文档完整性检查。

## 关联证据

- `docs/evidence/records/2026-03-06-documentation-automation-evidence.md`
