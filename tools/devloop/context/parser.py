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

    # ruff
    if stage == "backend_lint" and "ruff" in text.lower():
        # Common formats:
        # path/to/file.py:12:5: F401 `x` imported but unused
        # Found 1 error.
        m = re.search(r"^(.*?\.py):(\d+):(\d+):\s*([A-Z]\d{3,4}.*)$", text, flags=re.MULTILINE)
        if m:
            return ParsedFailure(stage, "ruff", m.group(1), int(m.group(2)), m.group(4), [m.group(1)])
        # fallback: pick any python filename mentioned
        m2 = re.search(r"([^\s]+?\.py)", text)
        file_guess = m2.group(1) if m2 else None
        relevant = [file_guess] if file_guess else []
        # Always yield at least one relevant file: use selected_files when parse fails
        if not relevant and selected:
            return ParsedFailure(
                stage, "ruff", file_guess, None,
                "Ruff failure (fallback to selected files)",
                selected,
            )
        return ParsedFailure(stage, "ruff", file_guess, None, "Ruff failure (unparsed)", relevant)

    # pytest
    if stage == "backend_unit":
        m = re.search(r"^(.*?\.py):(\d+):\s*(AssertionError|E\s+.*|.*FAILED.*)$", text, flags=re.MULTILINE)
        if m:
            return ParsedFailure(stage, "pytest", m.group(1), int(m.group(2)), m.group(3), [m.group(1)])
        relevant = selected if selected else []
        return ParsedFailure(stage, "pytest", None, None, "Pytest failure", relevant)

    # playwright / make gate
    if stage == "gate":
        m = re.search(r"›\s+(.*?\.spec\.(ts|js)):(\d+):(\d+)", text)
        if m:
            return ParsedFailure(stage, "playwright", m.group(1), int(m.group(3)), "Playwright failure", [m.group(1)])
        relevant = selected if selected else []
        return ParsedFailure(stage, "gate", None, None, "Gate failure", relevant)

    relevant = selected if selected else []
    return ParsedFailure(stage, "unknown", None, None, "Unknown failure", relevant)
