#!/usr/bin/env bash
# 主题外的硬编码色值一律不许进：颜色只走 MaterialTheme.colorScheme。
# 允许的白名单只有 ui/CampusNavTheme.kt 里的种子色与回落方案。
set -euo pipefail
cd "$(dirname "$0")/.."

offenders=$(grep -R --include='*.kt' -nE '0x[0-9A-Fa-f]{8}' app/src/main/java \
  | grep -v 'ui/CampusNavTheme.kt' || true)

if [ -n "$offenders" ]; then
  echo "发现主题外的硬编码色值，请改用 MaterialTheme.colorScheme：" >&2
  echo "$offenders" >&2
  exit 1
fi

echo "ok: 主题外无硬编码色值"
