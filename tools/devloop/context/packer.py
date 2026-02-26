from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Dict, Any

from tools.devloop.utils import git as git_utils


@dataclass
class PackedContext:
    branch: str
    status: str
    diff: str
    files: Dict[str, str]


def read_files(repo_root: str, paths: List[str], max_chars: int = 120_000) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for p in paths:
        abspath = os.path.join(repo_root, p)
        if not os.path.exists(abspath):
            out[p] = "<missing>"
            continue
        with open(abspath, "r", encoding="utf-8", errors="replace") as f:
            txt = f.read()
        out[p] = txt[:max_chars]
    return out


def pack_initial(repo_root: str, files: List[str]) -> PackedContext:
    branch = git_utils.get_branch(repo_root)
    status = git_utils.get_status(repo_root)
    diff = git_utils.get_diff(repo_root)
    file_map = read_files(repo_root, files)
    return PackedContext(branch=branch, status=status, diff=diff, files=file_map)
