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
