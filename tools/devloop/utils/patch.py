from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass
class ApplyResult:
    ok: bool
    message: str


def apply_unified_diff(repo_root: str, patch_text: str) -> ApplyResult:
    """Apply a unified diff via git apply. Runs --check first to avoid corrupt apply."""
    if not patch_text.strip():
        return ApplyResult(ok=False, message="Empty patch")

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
        preview = "\n".join(patch_text.splitlines()[:60])
        return ApplyResult(
            ok=False,
            message=f"git apply --check failed:\n{err}\n\nPatch preview (first 60 lines):\n{preview}",
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
