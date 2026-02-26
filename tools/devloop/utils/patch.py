from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass
class ApplyResult:
    ok: bool
    message: str


def _normalize_hunk_blank_lines(patch_text: str) -> str:
    """Convert empty lines inside hunks to single-space context lines (defense-in-depth)."""
    out: list[str] = []
    in_hunk = False

    for line in patch_text.splitlines():
        if line.startswith("diff --git "):
            in_hunk = False
            out.append(line)
            continue
        if line.startswith("@@ "):
            in_hunk = True
            out.append(line)
            continue

        # Treat "blank looking" lines as blank (handles NBSP / zero-width)
        if in_hunk and re.fullmatch(r"[ \t\u00a0\u200b]*", line):
            out.append(" ")
        else:
            out.append(line)

    return "\n".join(out) + "\n"


def apply_unified_diff(repo_root: str, patch_text: str) -> ApplyResult:
    """Apply a unified diff via git apply. Runs --check first to avoid corrupt apply."""
    if not patch_text.strip():
        return ApplyResult(ok=False, message="Empty patch")

    patch_text = patch_text.replace("\r\n", "\n").replace("\r", "\n")
    patch_text = _normalize_hunk_blank_lines(patch_text)

    # Already-applied safety: if reverse --check succeeds, patch is a no-op
    r_reverse = subprocess.run(
        ["git", "apply", "--reverse", "--check", "--whitespace=nowarn", "--", "-"],
        input=patch_text,
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r_reverse.returncode == 0:
        return ApplyResult(ok=True, message="Patch already applied (reverse --check succeeded)")

    # Pre-flight: git apply --check catches corrupt hunks, missing headers, etc.
    # Use "--" "-" so patch is read from stdin explicitly (not -p0 as filename)
    r_check = subprocess.run(
        ["git", "apply", "--check", "--whitespace=nowarn", "--", "-"],
        input=patch_text,
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r_check.returncode != 0:
        err = (r_check.stderr or r_check.stdout or "Unknown error").strip()
        preview_lines = patch_text.splitlines()[:60]
        preview = "\n".join(preview_lines)
        return ApplyResult(
            ok=False,
            message=(
                f"git apply --check failed:\n{err}\n\n"
                "Patch preview (first 60 lines, AFTER normalization):\n"
                f"{preview}"
            ),
        )

    r = subprocess.run(
        ["git", "apply", "--whitespace=nowarn", "--", "-"],
        input=patch_text,
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if r.returncode == 0:
        return ApplyResult(ok=True, message="Patch applied successfully")
    return ApplyResult(ok=False, message=(r.stderr or r.stdout or "Unknown error").strip())
