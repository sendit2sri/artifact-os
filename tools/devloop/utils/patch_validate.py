from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class PatchValidation:
    ok: bool
    reason: str
    cleaned: str


def _strip_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        # Remove leading and trailing fences (common model behavior)
        s = re.sub(r"^```[a-zA-Z0-9_-]*\n", "", s)
        s = re.sub(r"\n```$", "", s)
    return s.strip()


def validate_unified_diff(patch_text: str) -> PatchValidation:
    if not patch_text or not patch_text.strip():
        return PatchValidation(ok=False, reason="empty", cleaned="")

    cleaned = _strip_fences(patch_text)

    # A minimal unified diff should contain at least one diff header.
    if "diff --git " not in cleaned:
        return PatchValidation(
            ok=False,
            reason="missing diff --git header (not a unified diff)",
            cleaned=cleaned,
        )

    # Prevent common hallucination: explanations inside patch
    bad_markers = ["Here is", "Explanation:", "```", "PATCH:"]
    if any(m in cleaned for m in bad_markers):
        # Not always fatal, but we keep it strict for v1 safety
        return PatchValidation(ok=False, reason="patch contains non-diff prose/markers", cleaned=cleaned)

    return PatchValidation(ok=True, reason="ok", cleaned=cleaned)
