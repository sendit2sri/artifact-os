from __future__ import annotations

from typing import Dict, Any

from tools.devloop.utils.llm import chat_hybrid


CODER_PROMPT = """You are DevLoop Coder.

Task:
{task}

Plan:
{plan}

Files (verbatim):
{files_blob}

Output:
- Return ONLY a valid unified diff.
- MUST start with diff --git.
- Do not use ``` fences.
- Do not include explanations.
- Patch must apply with `git apply`.
- Inside hunks, every unchanged/context line MUST start with a single leading space.
  Blank lines must be output as a single space ' ' (one space). Never output an empty line.
- Include at least 6-10 context lines around the edit so the @@ hunk counts are correct.

Example hunk (correct; include 6-10 context lines so @@ counts match):
@@ -1,7 +1,8 @@
  from __future__ import annotations
 
+# devloop noop
  import os
  import sys
  import json
  import time
  from pathlib import Path

If no changes are needed, return an empty string.
"""

CODER_RETRY_PROMPT = """FORMAT FIX REQUIRED.
Your last response was invalid. You MUST output ONLY a unified diff that starts with:
diff --git a/... b/...

You MUST include:
- index line (optional but ok)
- --- and +++ lines
- @@ hunk header
- all context lines prefixed with a single space

NO markdown fences. NO prose.
"""


def generate_patch(
    task: str,
    plan: Dict[str, Any],
    file_map: Dict[str, str],
    models: Dict[str, str],
    hybrid_cfg: Dict[str, Any],
    retry_mode: bool = False,
    return_llm: bool = False,
):
    files_blob = "\n\n---\n\n".join(f"=== {k} ===\n{v}" for k, v in file_map.items())
    prompt = CODER_PROMPT.format(task=task, plan=plan, files_blob=files_blob or "(no files)")
    if retry_mode:
        prompt = CODER_RETRY_PROMPT + "\n\n" + prompt
    resp = chat_hybrid(task, prompt, models, hybrid_cfg)
    if return_llm:
        return {"llm": resp}
    return resp.content.strip()
