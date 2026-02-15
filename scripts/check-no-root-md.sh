#!/usr/bin/env bash
# Guard: no .md files in repo root except README.md and QUICK_START.md

set -e
ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT"

OFFENDING=""
for f in *.md; do
  [ -f "$f" ] || continue
  [ "$f" = "README.md" ] && continue
  [ "$f" = "QUICK_START.md" ] && continue
  OFFENDING="${OFFENDING:+$OFFENDING }$f"
done

if [ -n "$OFFENDING" ]; then
  echo "docs:lint FAIL: .md files in repo root (only README.md and QUICK_START.md allowed):"
  for f in $OFFENDING; do echo "  - $f"; done
  exit 1
fi
echo "docs:lint OK (no extra root .md files)"
exit 0
