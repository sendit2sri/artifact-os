from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, List, Dict, Any


@dataclass
class ParsedFailure:
    stage: str
    kind: str
    file: Optional[str]
    line: Optional[int]
    message: str
    relevant_files: List[str]


def parse_failure(
    stage: str,
    stdout: str,
    stderr: str,
    selected_files: Optional[List[str]] = None,
) -> ParsedFailure:
    text = (stdout or "") + "\n" + (stderr or "")
    selected = selected_files or []

    # ruff (also try when stage is unknown but output looks like ruff)
    if stage == "backend_lint" or (stage == "unknown" and ("-->" in text or "ruff" in text.lower())):
        _RUFF_LOC = re.compile(r"^\s*-->\s+(.+?):(\d+):(\d+)\s*$", re.MULTILINE)
        _RUFF_CODE = re.compile(r"^(?P<code>[A-Z]\d{3})\b", re.MULTILINE)

        # Try annotated format first (E402 ... --> alembic/env.py:13:1)
        m_loc = _RUFF_LOC.search(text)
        if m_loc:
            path = m_loc.group(1).strip()
            line_no = int(m_loc.group(2))
            m_code = _RUFF_CODE.search(text)
            code = m_code.group("code") if m_code else "ruff"
            # Ruff runs from apps/backend, so paths are relative to that
            file_path = f"apps/backend/{path}" if not path.startswith("apps/") else path
            return ParsedFailure(
                stage="backend_lint" if stage == "unknown" else stage,
                kind="ruff",
                file=file_path,
                line=line_no,
                message=f"Ruff {code}",
                relevant_files=[file_path],
            )

        # Fallback: old format path.py:12:5: F401 ...
        m_old = re.search(
            r"(?m)^(.*?\.py):(\d+):(\d+):\s*([A-Z]\d{3,4}.*)$",
            text,
        )
        if m_old:
            path = m_old.group(1)
            file_path = f"apps/backend/{path}" if not path.startswith("apps/") else path
            return ParsedFailure(
                stage="backend_lint" if stage == "unknown" else stage,
                kind="ruff",
                file=file_path,
                line=int(m_old.group(2)),
                message=m_old.group(4),
                relevant_files=[file_path],
            )

        # Last resort: pick any python filename (no selected_files fallback for backend_lint)
        m2 = re.search(r"([^\s]+?\.py)", text)
        file_guess = m2.group(1) if m2 else None
        if file_guess and not file_guess.startswith("apps/"):
            file_guess = f"apps/backend/{file_guess}"
        relevant = [file_guess] if file_guess else []
        return ParsedFailure(stage, "ruff", file_guess, None, "Ruff failure (unparsed)", relevant)

    # pytest
    if stage == "backend_unit":
        # Prefer stack frames, but ignore venv/site-packages
        frame_re = re.compile(r"(?m)^([a-zA-Z0-9_./-]+\.py):(\d+):\s+in\s+")
        for m in frame_re.finditer(text):
            path = m.group(1).strip()

            # skip virtualenv / deps
            if (
                "/site-packages/" in path
                or path.startswith(".venv/")
                or "/.venv/" in path
                or path.startswith("/opt/")
                or path.startswith("/usr/")
                or path.startswith("/System/")
            ):
                continue

            # normalize pytest cwd (apps/backend)
            file_path = f"apps/backend/{path}" if not path.startswith("apps/") else path

            return ParsedFailure(
                stage=stage,
                kind="pytest",
                file=file_path,
                line=int(m.group(2)),
                message="Pytest failure",
                relevant_files=[file_path],
            )

        # Fallback: "ERROR collecting tests/xxx.py"
        m2 = re.search(r"(?m)^ERROR collecting ([a-zA-Z0-9_./-]+\.py)\s*$", text)
        if m2:
            path = m2.group(1).strip()
            file_path = f"apps/backend/{path}" if not path.startswith("apps/") else path
            return ParsedFailure(stage, "pytest", file_path, None, "Pytest failure", [file_path])

        return ParsedFailure(stage, "pytest", None, None, "Pytest failure", selected or [])

    # playwright / make gate
    if stage == "gate":
        m = re.search(r"›\s+(.*?\.spec\.(ts|js)):(\d+):(\d+)", text)
        if m:
            return ParsedFailure(stage, "playwright", m.group(1), int(m.group(3)), "Playwright failure", [m.group(1)])
        relevant = selected if selected else []
        return ParsedFailure(stage, "gate", None, None, "Gate failure", relevant)

    relevant = selected if selected else []
    return ParsedFailure(stage, "unknown", None, None, "Unknown failure", relevant)
