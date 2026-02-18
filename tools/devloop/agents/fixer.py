from __future__ import annotations

from typing import Dict, Any

from tools.devloop.utils.llm import chat_hybrid


FIXER_PROMPT = """You are DevLoop Fixer.

A verification step failed. You must produce a minimal unified diff patch that fixes the failure.

Failure:
{failure}

Relevant files:
{files_blob}

Rules:
- Return ONLY a valid unified diff.
- MUST start with diff --git.
- Do not use ``` fences.
- Do not include explanations.
- Prefer the smallest change that fixes the failure.
- Do not refactor unrelated code.
- Inside hunks, every unchanged/context line MUST start with a single leading space. Even blank lines must be written as a line containing exactly one space.

Example (format matters):
diff --git a/foo.py b/foo.py
--- a/foo.py
+++ b/foo.py
@@ -1,2 +1,3 @@
  from x import y
+ # comment
"""


def generate_fix(
    failure: Dict[str, Any],
    files_map: Dict[str, str],
    models: Dict[str, str],
    hybrid_cfg: Dict[str, Any],
) -> str:
    files_blob = "\n\n---\n\n".join(f"=== {k} ===\n{v}" for k, v in files_map.items())
    prompt = FIXER_PROMPT.format(failure=failure, files_blob=files_blob or "(no files)")
    resp = chat_hybrid("fix", prompt, models, hybrid_cfg)
    return resp.content.strip()
