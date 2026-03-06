#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[validate-docs] start"

python3 - <<'PY'
from __future__ import annotations

import pathlib
import re
ROOT = pathlib.Path(".")

required_files = [
    pathlib.Path("README.md"),
    pathlib.Path("docs/README.md"),
    pathlib.Path("docs/standards/documentation-governance.md"),
    pathlib.Path("docs/project/project-overview.md"),
    pathlib.Path("docs/project/tasks/README.md"),
    pathlib.Path("docs/design/design-index.md"),
    pathlib.Path("docs/design/tasks/README.md"),
    pathlib.Path("docs/testing/test-strategy.md"),
    pathlib.Path("docs/testing/test-plans/README.md"),
    pathlib.Path("docs/testing/test-reports/README.md"),
    pathlib.Path("docs/evidence/evidence-index.md"),
    pathlib.Path("docs/evidence/records/README.md"),
    pathlib.Path("docs/templates/project-doc-template.md"),
    pathlib.Path("docs/templates/design-doc-template.md"),
    pathlib.Path("docs/templates/test-plan-template.md"),
    pathlib.Path("docs/templates/test-report-template.md"),
    pathlib.Path("docs/templates/evidence-record-template.md"),
]

missing = [str(path) for path in required_files if not path.is_file()]
if missing:
    raise SystemExit("[validate-docs][FAIL] missing required files:\n- " + "\n- ".join(missing))

front_matter_required = ("title", "status", "owner", "last_updated", "summary")
allowed_status = {"draft", "active", "deprecated", "template"}
placeholder_patterns = (
    re.compile(r"\{\{[^}]+\}\}"),
    re.compile(r"\[TODO\]"),
    re.compile(r"\bTBD\b"),
)

docs_dir = ROOT / "docs"
md_files = sorted(docs_dir.rglob("*.md"))

def parse_front_matter(text: str, path: pathlib.Path) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        raise SystemExit(f"[validate-docs][FAIL] {path} missing YAML front matter")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise SystemExit(f"[validate-docs][FAIL] {path} has unterminated YAML front matter")
    block = text[4:end]
    body = text[end + len("\n---\n"):]
    result: dict[str, str] = {}
    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if ":" not in line:
            raise SystemExit(f"[validate-docs][FAIL] {path} has invalid front matter line: {raw_line}")
        key, value = line.split(":", 1)
        result[key.strip()] = value.strip()
    return result, body

for path in md_files:
    text = path.read_text(encoding="utf-8")
    front_matter, body = parse_front_matter(text, path)
    for field in front_matter_required:
        if not front_matter.get(field):
            raise SystemExit(f"[validate-docs][FAIL] {path} missing front matter field: {field}")
    if front_matter["status"] not in allowed_status:
        raise SystemExit(f"[validate-docs][FAIL] {path} has invalid status: {front_matter['status']}")
    if "templates" in path.parts:
        continue
    for pattern in placeholder_patterns:
        if pattern.search(body):
            raise SystemExit(
                f"[validate-docs][FAIL] {path} contains unresolved placeholder matching {pattern.pattern}"
            )

evidence_index = (ROOT / "docs/evidence/evidence-index.md").read_text(encoding="utf-8")
evidence_dir = ROOT / "docs/evidence/records"
for record in sorted(evidence_dir.glob("*.md")):
    if record.name == "README.md":
        continue
    if record.name not in evidence_index:
        raise SystemExit(
            f"[validate-docs][FAIL] docs/evidence/evidence-index.md does not reference {record.name}"
        )

print("[validate-docs] markdown structure ok")
PY

echo "[validate-docs] ok"
