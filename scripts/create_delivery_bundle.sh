#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
usage:
  bash ./scripts/create_delivery_bundle.sh "请做xxx" [--owner <name>] [--git] [--push]

options:
  --owner <name>  文档 owner，默认 codex
  --git           生成文档后自动 git add + git commit
  --push          在 --git 基础上继续 git push
EOF
}

TASK_INPUT="${1:-}"
if [[ -z "$TASK_INPUT" ]]; then
  usage
  exit 1
fi
shift || true

OWNER="codex"
DO_GIT=0
DO_PUSH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner)
      OWNER="${2:-}"
      if [[ -z "$OWNER" ]]; then
        echo "[bundle][FAIL] --owner requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    --git)
      DO_GIT=1
      shift
      ;;
    --push)
      DO_GIT=1
      DO_PUSH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[bundle][FAIL] unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

DATE_ONLY="$(date '+%Y-%m-%d')"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"

normalize_task() {
  local raw="$1"
  raw="${raw#请做}"
  raw="${raw#做}"
  raw="${raw#请}"
  raw="${raw# }"
  printf '%s' "$raw"
}

TASK_TITLE="$(normalize_task "$TASK_INPUT")"
if [[ -z "$TASK_TITLE" ]]; then
  TASK_TITLE="$TASK_INPUT"
fi

SLUG="$(printf '%s' "$TASK_TITLE" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//')"
if [[ -z "$SLUG" ]]; then
  SLUG="task"
fi

BASE_NAME="${TIMESTAMP}-${SLUG}"
PROJECT_DOC="docs/project/tasks/${BASE_NAME}-project-task.md"
DESIGN_DOC="docs/design/tasks/${BASE_NAME}-design-task.md"
TEST_PLAN_DOC="docs/testing/test-plans/${BASE_NAME}-test-plan.md"
TEST_REPORT_DOC="docs/testing/test-reports/${BASE_NAME}-test-report.md"
EVIDENCE_DOC="docs/evidence/records/${BASE_NAME}-evidence.md"

mkdir -p docs/project/tasks docs/design/tasks docs/testing/test-plans docs/testing/test-reports docs/evidence/records

if [[ -e "$PROJECT_DOC" || -e "$DESIGN_DOC" || -e "$TEST_PLAN_DOC" || -e "$TEST_REPORT_DOC" || -e "$EVIDENCE_DOC" ]]; then
  echo "[bundle][FAIL] target files already exist for ${BASE_NAME}" >&2
  exit 1
fi

cat > "$PROJECT_DOC" <<EOF
---
title: ${TASK_TITLE}任务说明
status: draft
owner: ${OWNER}
last_updated: ${DATE_ONLY}
summary: 围绕“${TASK_TITLE}”的任务目标、范围、验收和约束说明。
---

# ${TASK_TITLE}任务说明

## 目标

完成“${TASK_TITLE}”相关交付，并保证代码、文档、测试和证据同步更新。

## 范围

- 本次任务直接涉及的功能、脚本、文档和校验流程。
- 本次任务关联的设计、测试和举证文档。

## 验收标准

- 目标功能或变更已完成。
- 文档、测试计划、测试报告和证据记录已补齐。
- 必要校验脚本执行通过。

## 约束

- 保持与现有规范文档一致。
- 不修改与当前任务无关的内容。
EOF

cat > "$DESIGN_DOC" <<EOF
---
title: ${TASK_TITLE}设计说明
status: draft
owner: ${OWNER}
last_updated: ${DATE_ONLY}
summary: 说明“${TASK_TITLE}”的背景、方案、风险和验证计划。
---

# ${TASK_TITLE}设计说明

## 背景

需要针对“${TASK_TITLE}”形成可执行的实现和交付方案。

## 方案设计

- 明确本次任务影响的模块和文档。
- 优先采用最小完整变更，避免无关重构。
- 保证输出可追溯到测试和证据记录。

## 风险

- 任务理解不完整导致文档与实现偏移。
- 缺少运行环境时，验证可能只能停留在静态检查。

## 验证计划

- 运行相关校验脚本。
- 按需补充运行级验证。
- 将结果回填到测试报告和证据记录。
EOF

cat > "$TEST_PLAN_DOC" <<EOF
---
title: ${TASK_TITLE}测试计划
status: draft
owner: qa
last_updated: ${DATE_ONLY}
summary: 围绕“${TASK_TITLE}”的测试范围、风险和退出标准说明。
---

# ${TASK_TITLE}测试计划

## 测试范围

验证“${TASK_TITLE}”涉及的功能、文档、脚本和交付流程。

## 覆盖风险

- 需求实现不完整。
- 文档未同步更新。
- 测试或举证缺失。
- 自动化脚本执行失败。

## 测试项

1. 验证相关文档是否生成齐全。
2. 验证关键校验脚本是否执行通过。
3. 验证任务关联的设计、测试和证据是否可追溯。

## 通过标准

- 本次任务的核心检查全部完成。
- 发现的问题已修复或明确记录。
- 有可引用的测试报告和证据记录。
EOF

cat > "$TEST_REPORT_DOC" <<EOF
---
title: ${TASK_TITLE}测试报告
status: draft
owner: qa
last_updated: ${DATE_ONLY}
summary: 记录“${TASK_TITLE}”的测试执行情况和关键结果。
---

# ${TASK_TITLE}测试报告

## 环境

- 日期：${DATE_ONLY}
- 执行者：${OWNER}
- 仓库：$(pwd)

## 执行检查

- 尚未执行，待任务实现完成后补充实际命令和结果。

## 结果

- 当前为初始化草稿，由自动化脚本生成。
- 任务完成后应补充通过项、失败项和关键观察。

## 关联证据

- ${EVIDENCE_DOC}
EOF

cat > "$EVIDENCE_DOC" <<EOF
---
title: ${TASK_TITLE}测试举证
status: draft
owner: qa
last_updated: ${DATE_ONLY}
summary: 记录“${TASK_TITLE}”的执行证据、运行信息和追溯关系。
---

# ${TASK_TITLE}测试举证

## 执行元数据

- 日期：${DATE_ONLY}
- 执行者：${OWNER}
- 任务：${TASK_TITLE}
- 环境：待补充实际执行环境

## 证据内容

- Run ID：待补充
- 命令：待补充
- 产物位置：待补充
- 关键结果：初始化草稿，待回填真实结果

## 追溯关系

- 测试报告：${TEST_REPORT_DOC}
- 相关任务：${PROJECT_DOC}
EOF

append_if_missing() {
  local file="$1"
  local line="$2"
  if ! grep -Fqx -- "$line" "$file"; then
    printf '\n%s\n' "$line" >> "$file"
  fi
}

append_if_missing "docs/project/tasks/README.md" "- \`${DATE_ONLY}\`: \`${PROJECT_DOC}\` - ${TASK_TITLE}"
append_if_missing "docs/design/tasks/README.md" "- \`${DATE_ONLY}\`: \`${DESIGN_DOC}\` - ${TASK_TITLE}"
append_if_missing "docs/evidence/evidence-index.md" "- \`${DATE_ONLY}\`: \`${EVIDENCE_DOC}\` - ${TASK_TITLE} 的测试举证记录。"

echo "[bundle] created:"
echo "  - ${PROJECT_DOC}"
echo "  - ${DESIGN_DOC}"
echo "  - ${TEST_PLAN_DOC}"
echo "  - ${TEST_REPORT_DOC}"
echo "  - ${EVIDENCE_DOC}"

if [[ $DO_GIT -eq 1 ]]; then
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[bundle][FAIL] current directory is not a git worktree" >&2
    exit 1
  fi

  git add "$PROJECT_DOC" "$DESIGN_DOC" "$TEST_PLAN_DOC" "$TEST_REPORT_DOC" "$EVIDENCE_DOC" \
    docs/project/tasks/README.md docs/design/tasks/README.md docs/evidence/evidence-index.md
  git commit -m "docs: 初始化任务交付文档 ${TASK_TITLE}"

  if [[ $DO_PUSH -eq 1 ]]; then
    current_branch="$(git branch --show-current)"
    if ! git remote get-url origin >/dev/null 2>&1; then
      echo "[bundle][FAIL] git push requested but remote 'origin' is missing" >&2
      exit 1
    fi
    git push -u origin "$current_branch"
  fi
fi
