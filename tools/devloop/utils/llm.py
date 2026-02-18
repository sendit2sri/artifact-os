from __future__ import annotations

import os
import json
import requests
from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class LLMResponse:
    provider: str
    model: str
    content: str
    raw: Dict[str, Any]


def _stub_response(prompt: str, context: str = "plan") -> LLMResponse:
    """Minimal stub when Ollama unavailable. Use DEVLOOP_STUB_LLM=true."""
    if context == "plan":
        content = json.dumps({"files": ["README.md"], "steps": ["Add comment"], "notes": "stub"})
    elif context == "patch":
        content = ""
    else:
        content = ""
    return LLMResponse(provider="stub", model="stub", content=content, raw={"response": content})


def _ollama_chat(base_url: str, model: str, prompt: str) -> LLMResponse:
    """
    Use Ollama /api/chat (preferred). Some setups do not expose /api/generate.
    """
    base_url = base_url.rstrip("/")
    url = f"{base_url}/api/chat"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }
    try:
        r = requests.post(url, json=payload, timeout=120)
        r.raise_for_status()
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(
            f"Ollama chat failed at {url} (status={r.status_code}, model={model}). "
            f"Body: {r.text[:300]}"
        ) from e
    except requests.exceptions.ConnectionError as e:
        raise RuntimeError(
            f"Ollama unreachable at {base_url} (model={model}). "
            "Start Ollama or set DEVLOOP_STUB_LLM=true for dry-run."
        ) from e
    data = r.json()
    # Expected: {"message": {"role":"assistant","content":"..."}, ...}
    msg = data.get("message") or {}
    content = (msg.get("content") or "").strip()
    return LLMResponse(provider="ollama", model=model, content=content, raw=data)


def _cloud_chat(model: str, prompt: str) -> LLMResponse:
    raise RuntimeError("Cloud LLM not wired in this skeleton. Keep HYBRID_ALLOW_CLOUD=false.")


def chat_hybrid(task: str, prompt: str, models: Dict[str, str], cfg: Dict[str, Any]) -> LLMResponse:
    if os.getenv("DEVLOOP_STUB_LLM", "").lower() == "true":
        ctx = "plan" if "DevLoop Planner" in prompt else "patch"
        return _stub_response(prompt, ctx)

    allow_cloud = os.getenv(cfg.get("allow_cloud_env", "HYBRID_ALLOW_CLOUD"), "false").lower() == "true"
    if allow_cloud:
        return _cloud_chat(models.get("cloud", "gpt-4"), prompt)
    # Allow env override so you can run from host or inside containers
    base = os.getenv("OLLAMA_BASE_URL") or cfg.get("ollama_base") or "http://localhost:11434"
    model = models.get("local") or os.getenv("OLLAMA_MODEL_CODE") or "qwen2.5-coder:7b"
    return _ollama_chat(base, model, prompt)
