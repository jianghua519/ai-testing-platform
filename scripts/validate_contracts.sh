#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_file() {
  local f="$1"
  [[ -f "$f" ]] || { echo "[validate][FAIL] missing file: $f" >&2; exit 1; }
}

echo "[validate] start"

require_file "docs/v2/c4.md"
require_file "docs/v2/tenancy-policy.md"
require_file "docs/v2/execution-state-machine.md"
require_file "docs/v2/api-conventions.md"
require_file "docs/v2/event-conventions.md"
require_file "contracts/openapi.yaml"
require_file "contracts/asyncapi.yaml"

python3 - <<'PY'
import pathlib
import sys

try:
    import yaml
except Exception as e:
    print("[validate][FAIL] python yaml module is required (PyYAML).", file=sys.stderr)
    raise

for path in ["contracts/openapi.yaml", "contracts/asyncapi.yaml"]:
    data = yaml.safe_load(pathlib.Path(path).read_text())
    if not isinstance(data, dict):
        raise SystemExit(f"[validate][FAIL] {path} is not a mapping")

if yaml.safe_load(pathlib.Path("contracts/openapi.yaml").read_text()).get("openapi") is None:
    raise SystemExit("[validate][FAIL] openapi.yaml missing 'openapi' field")

if yaml.safe_load(pathlib.Path("contracts/asyncapi.yaml").read_text()).get("asyncapi") is None:
    raise SystemExit("[validate][FAIL] asyncapi.yaml missing 'asyncapi' field")

print("[validate] yaml parse ok")
PY

echo "[validate] ok"
