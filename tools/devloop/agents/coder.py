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
- Inside hunks, every unchanged/context line MUST start with a single leading space. Even blank lines must be written as a line containing exactly one space.

If no changes are needed, return an empty string.
"""


def generate_patch(
    task: str,
    plan: Dict[str, Any],
    file_map: Dict[str, str],
    models: Dict[str, str],
    hybrid_cfg: Dict[str, Any],
) -> str:
    files_blob = "\n\n---\n\n".join(f"=== {k} ===\n{v}" for k, v in file_map.items())
    prompt = CODER_PROMPT.format(task=task, plan=plan, files_blob=files_blob or "(no files)")
    resp = chat_hybrid(task, prompt, models, hybrid_cfg)
    return resp.content.strip()
