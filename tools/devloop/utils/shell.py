from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import List


@dataclass
class RunResult:
    ok: bool
    cmd: str
    stdout: str
    stderr: str


def run_chain(cmds: List[str], cwd: str) -> RunResult:
    """Run commands in sequence; stop on first failure."""
    for cmd in cmds:
        r = subprocess.run(
            cmd,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=600,
        )
        if r.returncode != 0:
            return RunResult(
                ok=False,
                cmd=cmd,
                stdout=r.stdout or "",
                stderr=r.stderr or "",
            )
    return RunResult(ok=True, cmd=cmds[-1] if cmds else "", stdout="", stderr="")
