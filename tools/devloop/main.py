from __future__ import annotations

# devloop noop
import os
import re
import sys
import json
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

import yaml
from rich.console import Console
from rich.panel import Panel

from tools.devloop.context.packer import pack_initial, read_files
from tools.devloop.context.parser import parse_failure
from tools.devloop.agents.planner import create_plan
from tools.devloop.agents.coder import generate_patch
from tools.devloop.agents.fixer import generate_fix
from tools.devloop.utils.shell import run_chain
from tools.devloop.utils.patch import apply_unified_diff
from tools.devloop.utils.patch_validate import validate_unified_diff, check_patch_scope, extract_touched_files
from tools.devloop.utils.git import ensure_clean_or_warn
from tools.devloop.utils.llm import LLMResponse

console = Console()

_QUOTED = re.compile(r"""(["'])(.{6,}?)\1""")


def _write_llm_artifacts(run_dir: Path, name: str, resp: LLMResponse) -> None:
    """Persist raw LLM response + extracted content for debugging."""
    (run_dir / f"{name}.txt").write_text(resp.content or "", encoding="utf-8")
    try:
        (run_dir / f"{name}.json").write_text(
            json.dumps(resp.raw, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    except Exception:
        (run_dir / f"{name}.json").write_text("{}", encoding="utf-8")


def _extract_json_object(s: str) -> Dict[str, Any] | None:
    """Best-effort: find first {...} block and parse."""
    if not s:
        return None
    start = s.find("{")
    end = s.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(s[start : end + 1])
    except Exception:
        return None


def load_config(cfg_path: str) -> Dict[str, Any]:
    with open(cfg_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def repo_root_from_config(cfg: Dict[str, Any]) -> str:
    here = Path(__file__).resolve().parent
    return str((here / cfg["project_root"]).resolve())


def _normalize_backend_path(repo_root: str, stage: str, path: Optional[str]) -> Optional[str]:
    """Convert Ruff paths (relative to apps/backend) to repo-root paths."""
    if not path:
        return None
    p = Path(path)
    if p.is_absolute():
        return path
    # Ruff is run in apps/backend (see config), so its paths are relative to that.
    if stage == "backend_lint":
        candidate = Path("apps/backend") / path
        if (Path(repo_root) / candidate).exists():
            return str(candidate)
    # Otherwise keep as-is if it exists
    if (Path(repo_root) / path).exists():
        return path
    return path


def ensure_run_dir() -> Path:
    base = Path(__file__).resolve().parent / ".runs"
    base.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    run_dir = base / ts
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def verify(cfg: Dict[str, Any], repo_root: str) -> tuple[bool, str, str, str]:
    chain_keys: List[str] = cfg["verify_chain"]
    cmds = [cfg["commands"][k] for k in chain_keys]
    res = run_chain(cmds, cwd=repo_root)
    if res.ok:
        return True, "", res.stdout, res.stderr
    # find which stage failed by matching the last cmd
    failed_cmd = res.cmd
    failed_stage = None
    for k in chain_keys:
        if cfg["commands"][k] == failed_cmd:
            failed_stage = k
            break
    return False, failed_stage or "unknown", res.stdout, res.stderr


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("task", help="What you want DevLoop to implement/fix")
    ap.add_argument("--config", default=str(Path(__file__).resolve().parent / "config.yaml"))
    ap.add_argument("--shadow", action="store_true", help="Force shadow mode on for this run")
    ap.add_argument("--no-shadow", action="store_true", help="Force shadow mode off for this run")
    ap.add_argument("--files", nargs="*", default=[], help="Optional initial file hints for planner context")
    args = ap.parse_args()

    cfg = load_config(args.config)
    repo_root = repo_root_from_config(cfg)
    run_dir = ensure_run_dir()

    shadow_mode = bool(cfg.get("shadow_mode", True))
    if args.shadow:
        shadow_mode = True
    if args.no_shadow:
        shadow_mode = False

    warn = ensure_clean_or_warn(repo_root)
    if warn:
        console.print(Panel(warn, title="Warning", style="yellow"))

    # store config snapshot
    (run_dir / "config.json").write_text(json.dumps(cfg, indent=2), encoding="utf-8")

    # --- PLAN ---
    console.print(Panel(f"[bold]Task[/bold]: {args.task}\n[bold]Repo[/bold]: {repo_root}", title="DevLoop INIT"))
    diff_for_plan = pack_initial(repo_root, files=[]).diff
    plan_resp = create_plan(
        args.task, diff_for_plan, cfg["models"], cfg["hybrid"],
        files_hint=args.files or None, return_llm=True,
    )
    plan = plan_resp["plan"]
    _write_llm_artifacts(run_dir, "llm_planner", plan_resp["llm"])
    if (not plan or plan.get("notes") == "Parse failed") and args.files:
        salvaged = _extract_json_object(plan_resp["llm"].content)
        if salvaged and isinstance(salvaged, dict):
            plan = salvaged
        else:
            plan = {"files": args.files, "steps": [], "notes": "Planner parse failed; fell back to --files"}
    (run_dir / "plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
    console.print(Panel(json.dumps(plan, indent=2), title="PLAN (JSON)"))

    # If --files provided, trust it. Else use plan files filtered to existing.
    if args.files:
        files = [f for f in args.files if (Path(repo_root) / f).exists()]
        if not files:
            console.print(Panel("--files paths do not exist.", title="STOPPED", style="red"))
            return
    else:
        files = [f for f in (plan.get("files", []) or []) if (Path(repo_root) / f).exists()]
        if not files:
            console.print(
                Panel(
                    "Planner picked non-existent files. Rerun with --files <existing_path>.",
                    title="STOPPED",
                    style="red",
                )
            )
            return

    if shadow_mode:
        yn = input(f"Shadow mode is ON. Apply changes to files {files}? (y/n): ").strip().lower()
        if yn != "y":
            console.print("Stopped (shadow mode declined).")
            return

    # --- CODE ---
    file_map = read_files(repo_root, files)
    patch = ""
    pv = None

    # Idempotency guard (robust): read file from disk, not file_map
    skip_coder = False
    task_l = args.task.lower()
    looks_like_add = any(k in task_l for k in ("add", "insert", "append", "include", "put", "place"))
    # Also trigger for "noop comment" / "devloop noop" style tasks (no quoted literal)
    noop_style = (
        "devloop noop" in task_l
        or "# devloop noop" in task_l
        or ("noop" in task_l and "comment" in task_l)
    )
    if len(files) == 1 and (looks_like_add or noop_style):
        target = files[0]
        try:
            content = (Path(repo_root) / target).read_text(encoding="utf-8")
        except Exception:
            content = ""
        literals = [m.group(2) for m in _QUOTED.finditer(args.task)]
        # Special case: noop-style task with no quoted literal
        if not literals and noop_style and "# devloop noop" in content:
            console.print(
                Panel(
                    f"Literal already present in {target}: '# devloop noop'",
                    title="SKIP CODER",
                    style="yellow",
                )
            )
            skip_coder = True
        else:
            for lit in literals:
                if lit in content:
                    console.print(
                        Panel(
                            f"Literal already present in {target}: {lit[:50]!r}",
                            title="SKIP CODER",
                            style="yellow",
                        )
                    )
                    skip_coder = True
                    break

    if not skip_coder:
        for coder_attempt in range(3):
            coder_resp = generate_patch(
                args.task, plan, file_map, cfg["models"], cfg["hybrid"],
                retry_mode=(coder_attempt > 0), return_llm=True,
            )
            _write_llm_artifacts(run_dir, f"llm_coder_{coder_attempt}", coder_resp["llm"])
            patch = (coder_resp["llm"].content or "").strip()
            (run_dir / "patch.diff").write_text(patch, encoding="utf-8")
            pv = validate_unified_diff(patch)
            if pv.ok:
                break

    if pv:
        (run_dir / "patch.cleaned.diff").write_text(pv.cleaned, encoding="utf-8")

    if patch.strip() and pv and pv.ok:
        scope = check_patch_scope(pv.cleaned, files)
        if not scope.ok:
            console.print(
                Panel(
                    f"{scope.reason}\n\nTouched: {scope.touched}\nOutside: {scope.outside}",
                    title="PATCH OUT OF SCOPE",
                    style="red",
                )
            )
            return

        # Defensive: only apply validated cleaned diff, never raw model output
        ap_res = apply_unified_diff(repo_root, pv.cleaned)
        if not ap_res.ok:
            console.print(Panel(ap_res.message, title="PATCH APPLY FAILED", style="red"))
            return
        console.print(Panel(ap_res.message, title="PATCH APPLIED", style="green"))
    elif not patch.strip():
        if not skip_coder:
            console.print(Panel("Coder returned empty patch after retries. Proceeding to verify.", title="NO PATCH", style="yellow"))
    elif pv and not pv.ok:
        console.print(Panel(f"INVALID PATCH after 3 retries: {pv.reason}", title="STOPPED", style="red"))
        console.print("Stopping to avoid corrupt apply. See patch.diff and llm_coder_*.txt in run artifacts.")
        sys.exit(2)

    # --- VERIFY + FIX LOOP ---
    max_retries = int(cfg.get("max_retries", 3))
    for attempt in range(max_retries + 1):
        ok, stage, out, err = verify(cfg, repo_root)
        (run_dir / f"verify_{attempt}.log").write_text(out + "\n" + err, encoding="utf-8")
        if ok:
            console.print(Panel("All checks passed ✅", title="DONE", style="green"))
            return

        text = (out or "") + "\n" + (err or "")
        INFRA_MARKERS = [
            "Cannot connect to the Docker daemon",
            "Is the docker daemon running",
            "Error response from daemon",
            "no such service",
            "port is already allocated",
            "bind: address already in use",
            "connection refused",
            "dial tcp",
            "context deadline exceeded",
            "i/o timeout",
            "no such host",
        ]
        if stage in ("gate", "unknown") and any(m in text for m in INFRA_MARKERS):
            console.print(
                Panel(
                    "Infra failure detected (not a code issue).\n\n"
                    "Fix the environment and rerun:\n"
                    "- Ensure Docker Desktop is running\n"
                    "- `docker compose ps` / `docker ps`\n"
                    "- Free ports / remove stale containers\n\n"
                    "Log excerpt:\n" + text.strip()[:1200],
                    title="STOPPED: INFRA FAILURE",
                    style="red",
                )
            )
            sys.exit(2)

        selected_for_fallback = files if stage in ("gate", "unknown") else None
        failure = parse_failure(stage, out, err, selected_files=selected_for_fallback)
        failure.file = _normalize_backend_path(repo_root, failure.stage, failure.file)
        failure.relevant_files = [
            p for p in (
                _normalize_backend_path(repo_root, failure.stage, x) for x in (failure.relevant_files or [])
            )
            if p
        ]
        verifier_log = (out or "") + "\n" + (err or "")

        # Config stop: missing Makefile target
        if stage == "gate" and "No rule to make target" in verifier_log:
            console.print(
                Panel(
                    "Makefile target 'gate' does not exist.\n"
                    "Fix tools/devloop/config.yaml: either remove 'gate' from verify_chain or point gate to an existing Makefile target.",
                    title="CONFIG ERROR",
                    style="red",
                )
            )
            sys.exit(2)

        failure_dict = {
            "stage": failure.stage,
            "kind": failure.kind,
            "file": failure.file,
            "line": failure.line,
            "message": failure.message,
            "relevant_files": failure.relevant_files,
            "verifier_log_excerpt": verifier_log[:4000],
        }
        (run_dir / f"failure_{attempt}.json").write_text(json.dumps(failure_dict, indent=2), encoding="utf-8")
        console.print(Panel(json.dumps(failure_dict, indent=2), title=f"FAILURE (attempt {attempt+1}/{max_retries})", style="red"))

        # Env/config stop: don't try to fix missing DATABASE_URL
        if failure.kind == "pytest" and "DATABASE_URL is not set" in verifier_log:
            console.print(
                Panel(
                    "DATABASE_URL is not set. Set it in backend_unit (e.g. DATABASE_URL=sqlite:///./test.db) or in env.",
                    title="ENV CONFIG",
                    style="yellow",
                )
            )
            return

        # Env stop: SQLite + UUID binding (Postgres-only schema)
        if failure.kind == "pytest" and "'str' object has no attribute 'hex'" in verifier_log:
            console.print(
                Panel(
                    "backend_unit failing due to SQLite UUID binding; run tests with Postgres DATABASE_URL or update SQLite type handling.",
                    title="ENV CONFIG",
                    style="yellow",
                )
            )
            return

        if attempt >= max_retries:
            console.print(Panel("Max retries reached. Stopping.", title="STOPPED", style="red"))
            return

        # expand context: include failure file + any relevant files (only existing paths)
        repo = Path(repo_root)
        relevant = [p for p in (failure.relevant_files or []) if p and (repo / p).exists()]
        if failure.file and (repo / failure.file).exists() and failure.file not in relevant:
            relevant.append(failure.file)
        if not relevant and files:
            relevant = list(files)  # fallback to selected_files (already filtered to existing)
        if not relevant:
            console.print(Panel("No existing files to fix. Stopping.", title="STOPPED", style="red"))
            return

        # Fixer creep policy: scope = files. If failure is outside files, ask to expand (shadow only)
        outside = [p for p in relevant if p not in files]
        if outside:
            # Never expand into .venv or site-packages
            if any("/.venv/" in p or "/site-packages/" in p for p in outside):
                console.print(
                    Panel(
                        "Dependency frame selected; parser should select repo file.",
                        title="STOPPED",
                        style="red",
                    )
                )
                return
            if shadow_mode:
                yn = input(f"Expand scope to include {outside}? (y/n): ").strip().lower()
                if yn == "y":
                    files = list(set(files) | set(outside))
                else:
                    console.print("Stopping (scope not expanded).")
                    return
            else:
                console.print(
                    Panel(
                        f"Failure in {outside} outside allowed scope. Run with --shadow to expand.",
                        title="STOPPED",
                        style="red",
                    )
                )
                return

        fix_files_map = read_files(repo_root, relevant)
        fix_patch = ""
        fix_pv = None
        for fixer_attempt in range(3):
            fixer_resp = generate_fix(
                failure_dict, fix_files_map, cfg["models"], cfg["hybrid"],
                retry_mode=(fixer_attempt > 0), return_llm=True,
            )
            _write_llm_artifacts(run_dir, f"llm_fixer_{attempt}_{fixer_attempt}", fixer_resp["llm"])
            fix_patch = (fixer_resp["llm"].content or "").strip()
            (run_dir / f"fix_patch_{attempt}.diff").write_text(fix_patch, encoding="utf-8")
            fix_pv = validate_unified_diff(fix_patch)

            if not fix_patch.strip():
                console.print(Panel("Fixer returned empty patch. Stopping.", title="STOPPED", style="red"))
                return

            if not fix_pv.ok:
                console.print(Panel(fix_pv.cleaned[:2000] if fix_pv else fix_patch[:500], title=f"INVALID FIX PATCH (reason: {fix_pv.reason if fix_pv else 'unknown'})", style="red"))
                if fixer_attempt < 2:
                    failure_dict["format_error"] = fix_pv.reason
                    continue
                console.print("Stopping to avoid corrupt apply. See fix_patch diff and llm_fixer_*.txt in run artifacts.")
                sys.exit(2)

            # E402 semantic guard: reject patches that delete logic or don't touch imports
            if failure_dict.get("message") == "Ruff E402":
                cleaned = fix_pv.cleaned
                if any(x in cleaned for x in ("-db_url", "-config.set_main_option")):
                    console.print(Panel("E402 fix must move imports to top, not delete logic.", title="INVALID FIX PATCH", style="red"))
                    if fixer_attempt < 2:
                        failure_dict["format_error"] = "E402 fix must move imports to top, not delete logic"
                        continue
                    sys.exit(2)
                if not any(x in cleaned for x in ("+import ", "+from ", "-import ", "-from ")):
                    console.print(Panel("E402 fix must touch imports (move to top).", title="INVALID FIX PATCH", style="red"))
                    if fixer_attempt < 2:
                        failure_dict["format_error"] = "E402 fix must touch imports (move to top)"
                        continue
                    sys.exit(2)

            # Reject fixer injecting # devloop noop into unrelated files
            if "# devloop noop" in fix_pv.cleaned:
                touched = extract_touched_files(fix_pv.cleaned)
                if all(p != "tools/devloop/main.py" for p in touched):
                    console.print(
                        Panel("Fix patch adds devloop noop in unrelated file.", title="INVALID FIX PATCH", style="red")
                    )
                    if fixer_attempt < 2:
                        failure_dict["format_error"] = "Fix patch adds devloop noop in unrelated file"
                        continue
                    sys.exit(2)

            # Scope check: retry on placeholder or out-of-scope paths
            scope = check_patch_scope(fix_pv.cleaned, files)
            if not scope.ok:
                console.print(
                    Panel(
                        f"{scope.reason}\n\nTouched: {scope.touched}\nOutside: {scope.outside}",
                        title="FIX PATCH OUT OF SCOPE",
                        style="red",
                    )
                )
                if fixer_attempt < 2:
                    failure_dict["format_error"] = (
                        f"{scope.reason}. You may ONLY edit: {', '.join(sorted(files))}"
                    )
                    continue
                return

            break  # passed all checks

        # Defensive: only apply validated cleaned diff

        (run_dir / f"fix_patch_{attempt}.cleaned.diff").write_text(fix_pv.cleaned, encoding="utf-8")

        # Apply with retry: if "patch does not apply", regenerate fix with apply error + fresh file content
        max_apply_retries = 2
        for apply_attempt in range(max_apply_retries + 1):
            ap_res = apply_unified_diff(repo_root, fix_pv.cleaned)
            if ap_res.ok:
                console.print(Panel("Applied fix patch. Re-verifying...", title="FIX APPLIED", style="green"))
                break

            msg = ap_res.message.lower()
            if ("patch does not apply" in msg or "patch failed" in msg) and apply_attempt < max_apply_retries:
                console.print(Panel(ap_res.message, title="FIX PATCH DID NOT APPLY", style="red"))
                failure_dict["apply_error"] = ap_res.message
                fix_files_map = read_files(repo_root, relevant)
                fixer_resp = generate_fix(
                    failure_dict, fix_files_map, cfg["models"], cfg["hybrid"],
                    retry_mode=True, return_llm=True,
                )
                _write_llm_artifacts(run_dir, f"llm_fixer_applyretry_{attempt}_{apply_attempt}", fixer_resp["llm"])
                fix_patch = (fixer_resp["llm"].content or "").strip()
                (run_dir / f"fix_patch_{attempt}.diff").write_text(fix_patch, encoding="utf-8")
                fix_pv = validate_unified_diff(fix_patch)
                if not fix_pv.ok:
                    console.print(Panel(f"INVALID FIX PATCH: {fix_pv.reason}", title="STOPPED", style="red"))
                    sys.exit(2)
                if "# devloop noop" in fix_pv.cleaned:
                    touched = extract_touched_files(fix_pv.cleaned)
                    if all(p != "tools/devloop/main.py" for p in touched):
                        console.print(
                            Panel("Fix patch adds devloop noop in unrelated file.", title="INVALID FIX PATCH", style="red")
                        )
                        sys.exit(2)
                scope = check_patch_scope(fix_pv.cleaned, files)
                if not scope.ok:
                    console.print(
                        Panel(
                            f"{scope.reason}\n\nTouched: {scope.touched}\nOutside: {scope.outside}",
                            title="FIX PATCH OUT OF SCOPE",
                            style="red",
                        )
                    )
                    return
                (run_dir / f"fix_patch_{attempt}.cleaned.diff").write_text(fix_pv.cleaned, encoding="utf-8")
                continue

            console.print(Panel(ap_res.message, title="FIX PATCH APPLY FAILED", style="red"))
            return


if __name__ == "__main__":
    main()
