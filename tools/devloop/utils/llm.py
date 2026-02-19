from __future__ import annotations

import os
import json
import requests
import time
from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class LLMResponse:
    provider: str
    model: str
    content: str
    raw: Dict[str, Any]


def ollama_healthcheck(base_url: str, timeout: int = 5) -> str | None:
    """
    Return a short status string if Ollama is reachable, else None.
    We call /api/tags because it's cheap and available on all installs.
    """
    base_url = base_url.rstrip("/")
    try:
        r = requests.get(f"{base_url}/api/tags", timeout=timeout)
        if r.status_code != 200:
            return f"HTTP {r.status_code}"
        data = r.json()
        models = data.get("models") or []
        names = [m.get("name") for m in models if isinstance(m, dict) and m.get("name")]
        return "ok: " + ", ".join(names[:5])
    except Exception:
        return None


def _stub_response(prompt: str, context: str = "plan") -> LLMResponse:
    """Minimal stub when Ollama unavailable. Use DEVLOOP_STUB_LLM=true."""
    if context == "plan":
        content = json.dumps({"files": ["README.md"], "steps": ["Add comment"], "notes": "stub"})
    elif context == "patch":
        content = ""
    else:
        content = ""
    return LLMResponse(provider="stub", model="stub", content=content, raw={"response": content})


def _ollama_chat(base_url: str, model: str, prompt: str, timeout_s: int = 120) -> LLMResponse:
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
        r = requests.post(url, json=payload, timeout=timeout_s)
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
    except requests.exceptions.ReadTimeout as e:
        raise RuntimeError(
            f"Ollama chat timed out after {timeout_s}s at {url} (model={model}). "
            "Try a smaller model for planner, or increase timeout / add retries."
        ) from e
    data = r.json()
    # Expected: {"message": {"role":"assistant","content":"..."}, ...}
    msg = data.get("message") or {}
    content = (msg.get("content") or "").strip()
    return LLMResponse(provider="ollama", model=model, content=content, raw=data)


def _cloud_chat(model: str, prompt: str) -> LLMResponse:
    raise RuntimeError("Cloud LLM not wired in this skeleton. Keep HYBRID_ALLOW_CLOUD=false.")


def chat_hybrid(
    task: str, prompt: str, models: Dict[str, str], cfg: Dict[str, Any], role: str = "general"
) -> LLMResponse:
    if os.getenv("DEVLOOP_STUB_LLM", "").lower() == "true":
        ctx = "plan" if "DevLoop Planner" in prompt else "patch"
        return _stub_response(prompt, ctx)

    allow_cloud = os.getenv(cfg.get("allow_cloud_env", "HYBRID_ALLOW_CLOUD"), "false").lower() == "true"
    if allow_cloud:
        return _cloud_chat(models.get("cloud", "gpt-4"), prompt)
    base = os.getenv("OLLAMA_BASE_URL") or cfg.get("ollama_base") or "http://localhost:11434"
    if role == "planner":
        model = os.getenv("DEVLOOP_PLANNER_MODEL") or models.get("general") or "qwen2.5:7b-instruct"
    else:
        model = os.getenv("OLLAMA_MODEL_CODE") or models.get("local") or "qwen2.5-coder:7b"

    hc = ollama_healthcheck(base, timeout=3)
    if hc is None:
        raise RuntimeError(f"Ollama not reachable at {base}. Start Ollama or set DEVLOOP_STUB_LLM=true.")

    timeouts = cfg.get("timeouts_s") or [120, 240, 300]
    last_err: Exception | None = None
    for t in timeouts:
        try:
            return _ollama_chat(base, model, prompt, timeout_s=int(t))
        except Exception as e:
            last_err = e
            time.sleep(1.0)
            continue
    raise RuntimeError(str(last_err) if last_err else "Ollama call failed")
