from __future__ import annotations

import subprocess
from typing import Optional


def _run(cmd: list[str], cwd: str) -> str:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=30)
    return r.stdout.strip() if r.returncode == 0 else ""


def get_branch(repo_root: str) -> str:
    return _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], repo_root) or "unknown"


def get_status(repo_root: str) -> str:
    return _run(["git", "status", "--short"], repo_root) or ""


def get_diff(repo_root: str) -> str:
    return _run(["git", "diff", "HEAD"], repo_root) or ""


def ensure_clean_or_warn(repo_root: str) -> Optional[str]:
    status = get_status(repo_root)
    if status.strip():
        return f"Working tree has uncommitted changes:\n{status[:500]}"
    return None
