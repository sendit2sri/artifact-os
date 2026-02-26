from __future__ import annotations

import json
from typing import Dict, Any, List, Optional

from tools.devloop.utils.llm import chat_hybrid


PLANNER_PROMPT = """You are DevLoop Planner for a monorepo.

Task:
{task}
{files_constraint}

Return STRICT JSON ONLY with this shape:
{{
  "files": ["relative/path/1", "relative/path/2"],
  "steps": ["step 1", "step 2"],
  "notes": "short"
}}

Rules:
- Choose the minimal set of files needed.
- If task is "noop comment" or similar, only add a comment. Do not refactor. Do not touch imports.
- Prefer existing patterns and nearby code.
- If unsure, include the test file likely to fail.
- No prose outside JSON.
"""


def create_plan(
    task: str,
    diff: str,
    models: Dict[str, str],
    hybrid_cfg: Dict[str, Any],
    files_hint: Optional[List[str]] = None,
    return_llm: bool = False,
) -> Dict[str, Any]:
    files_constraint = ""
    if files_hint:
        files_constraint = f"\n\nYou MUST return exactly these files (no extras): {files_hint}"
    prompt = PLANNER_PROMPT.format(task=task, files_constraint=files_constraint)
    if diff:
        prompt += f"\n\nCurrent diff (for context):\n{diff[:8000]}"
    resp = chat_hybrid(task, prompt, models, hybrid_cfg, role="planner")
    try:
        plan = json.loads(resp.content)
    except json.JSONDecodeError:
        plan = {"files": [], "steps": [], "notes": "Parse failed"}
    if return_llm:
        return {"plan": plan, "llm": resp}
    return plan
