from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List, Optional, Set


@dataclass
class PatchValidation:
    ok: bool
    reason: str
    cleaned: str


def _strip_fences(s: str) -> str:
    s = s.strip()
    # Remove any fence lines anywhere (``` or ```diff etc.)
    s = re.sub(r"(?m)^\s*```[a-zA-Z0-9_-]*\s*$\n?", "", s)
    return s.strip()


def _extract_diff_body(s: str) -> str:
    """Keep from first diff --git to end. Strips leading prose."""
    idx = s.find("diff --git ")
    if idx >= 0:
        return s[idx:].strip()
    return s


def validate_unified_diff(patch_text: str) -> PatchValidation:
    if not patch_text or not patch_text.strip():
        return PatchValidation(ok=False, reason="empty", cleaned="")

    cleaned = _strip_fences(patch_text)
    cleaned = _extract_diff_body(cleaned)

    # A minimal unified diff should contain at least one diff header.
    if "diff --git " not in cleaned:
        return PatchValidation(
            ok=False,
            reason="missing diff --git header (not a unified diff)",
            cleaned=cleaned,
        )

    # Must have --- and +++ (required for git apply)
    if "--- " not in cleaned or "+++ " not in cleaned:
        return PatchValidation(
            ok=False,
            reason="missing ---/+++ headers (invalid unified diff)",
            cleaned=cleaned,
        )

    # Prevent common hallucination: explanations inside patch
    bad_markers = ["Here is the patch", "Explanation:", "```", "PATCH:"]
    if any(m in cleaned for m in bad_markers):
        # Not always fatal, but we keep it strict for v1 safety
        return PatchValidation(ok=False, reason="patch contains non-diff prose/markers", cleaned=cleaned)

    # Guard: inside hunks, every line must start with ' ', '+', '-', or '\'
    # Blank context lines MUST be a single leading space + newline (" \n"), not an empty line.
    in_hunk = False
    for i, line in enumerate(cleaned.splitlines(), start=1):
        if line.startswith("@@ "):
            in_hunk = True
            continue
        # leave hunk when we hit next file header
        if line.startswith("diff --git "):
            in_hunk = False
            continue
        if not in_hunk:
            continue
        # allow metadata inside file blocks
        if line.startswith(("--- ", "+++ ")):
            continue
        if line == "":
            return PatchValidation(
                ok=False,
                reason=f"invalid hunk line (blank line without leading space) at line {i}",
                cleaned=cleaned,
            )
        if not (line.startswith(" ") or line.startswith("+") or line.startswith("-") or line.startswith("\\")):
            return PatchValidation(
                ok=False,
                reason=f"invalid hunk line prefix at line {i}: {line[:20]!r}",
                cleaned=cleaned,
            )

    return PatchValidation(ok=True, reason="ok", cleaned=cleaned)


@dataclass
class ScopeCheck:
    ok: bool
    touched: List[str]
    outside: List[str]
    reason: Optional[str] = None


_DIFF_RE = re.compile(r"^diff --git a/(.+?) b/(.+?)$", re.MULTILINE)


def extract_touched_files(patch_text: str) -> List[str]:
    touched: List[str] = []
    for a_path, b_path in _DIFF_RE.findall(patch_text):
        # Usually identical; prefer b/ path
        path = b_path.strip()
        if path and path not in touched:
            touched.append(path)
    return touched


def check_patch_scope(patch_text: str, allowed_files: Iterable[str]) -> ScopeCheck:
    allowed: Set[str] = set(allowed_files)
    touched = extract_touched_files(patch_text)

    if not touched:
        return ScopeCheck(ok=False, touched=[], outside=[], reason="No diff --git paths found (cannot scope-check)")

    outside = [p for p in touched if p not in allowed]
    if outside:
        return ScopeCheck(ok=False, touched=touched, outside=outside, reason="Patch touches files outside allowed scope")

    return ScopeCheck(ok=True, touched=touched, outside=[])
