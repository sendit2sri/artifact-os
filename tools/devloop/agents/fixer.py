from __future__ import annotations

from typing import Dict, Any

from tools.devloop.utils.llm import chat_hybrid


FIXER_PROMPT = """You are DevLoop Fixer.

A verification step failed. You must produce a minimal unified diff patch that fixes the failure.

Failure:
{failure}

ALLOWED FILES (you may edit ONLY these exact repo-relative paths):
{allowed_files}

Relevant files (current contents):
{files_blob}

Rules:
- Return ONLY a valid unified diff.
- MUST start with: diff --git a/<path> b/<path>
- The diff MUST touch ONLY paths from ALLOWED FILES. If you touch any other path, your patch will be rejected.
- NEVER invent placeholder paths like: your_script.py, file.py, example.py, path/to/file.py
- Do not use ``` fences.
- Do not include explanations.
- Prefer the smallest change that fixes the failure.
- Do not refactor unrelated code.
- Do NOT add # devloop noop (or any noop comment) unless the failure explicitly requires it.
- Fix only what the failure indicates (lint/test).
- For Ruff E402 (imports not at top): MOVE imports to the top of the file. Do NOT delete logic or config code.
- Inside hunks, every unchanged/context line MUST start with a single leading space.
  Blank lines must be output as a single space ' ' (one space). Never output an empty line.
- Include at least 6-10 context lines around the edit so the @@ hunk counts are correct.

Example hunk (correct; include 6-10 context lines so @@ counts match):
@@ -1,6 +1,7 @@
 from __future__ import annotations

+import os
  import sys
  import json
  import time
  from pathlib import Path
"""

FIXER_RETRY_PROMPT = """FORMAT FIX REQUIRED.
Your last response was invalid or rejected.

You MUST output ONLY a unified diff that:
- starts with: diff --git a/... b/...
- includes --- and +++ and valid @@ hunks
- touches ONLY paths from ALLOWED FILES shown below

NO markdown fences. NO prose.
"""


def generate_fix(
    failure: Dict[str, Any],
    files_map: Dict[str, str],
    models: Dict[str, str],
    hybrid_cfg: Dict[str, Any],
    retry_mode: bool = False,
    return_llm: bool = False,
):
    allowed_files = "\n".join(f"- {k}" for k in files_map.keys()) or "(none)"
    files_blob = "\n\n---\n\n".join(f"=== {k} ===\n{v}" for k, v in files_map.items())
    prompt = FIXER_PROMPT.format(
        failure=failure,
        files_blob=files_blob or "(no files)",
        allowed_files=allowed_files,
    )
    if retry_mode:
        prompt = FIXER_RETRY_PROMPT + "\n\n" + prompt
    if failure.get("format_error"):
        prompt = (
            "Your previous patch was REJECTED. Reason:\n\n"
            f"{failure['format_error']}\n\n"
            "You MUST produce a valid unified diff with: diff --git, ---, +++, and correct @@ hunks.\n\n"
            + prompt
        )
    if failure.get("apply_error"):
        prompt = (
            "Your previous patch did NOT apply. The apply error:\n\n"
            f"{failure['apply_error']}\n\n"
            "Re-read the file content below and produce a new patch that matches the ACTUAL current file.\n\n"
            + prompt
        )
    resp = chat_hybrid("fix", prompt, models, hybrid_cfg)
    if return_llm:
        return {"llm": resp}
    return resp.content.strip()
