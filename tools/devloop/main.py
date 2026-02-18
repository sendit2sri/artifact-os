from __future__ import annotations

import os
import json
import time
from pathlib import Path
from typing import Dict, Any, List

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
from tools.devloop.utils.patch_validate import validate_unified_diff, check_patch_scope
from tools.devloop.utils.git import ensure_clean_or_warn

console = Console()


def load_config(cfg_path: str) -> Dict[str, Any]:
    with open(cfg_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def repo_root_from_config(cfg: Dict[str, Any]) -> str:
    here = Path(__file__).resolve().parent
    return str((here / cfg["project_root"]).resolve())


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
    plan = create_plan(args.task, diff_for_plan, cfg["models"], cfg["hybrid"], files_hint=args.files)
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
    patch = generate_patch(args.task, plan, file_map, cfg["models"], cfg["hybrid"])
    (run_dir / "patch.diff").write_text(patch, encoding="utf-8")

    if patch.strip():
        pv = validate_unified_diff(patch)
        if not pv.ok:
            console.print(Panel(pv.cleaned[:2000], title=f"INVALID PATCH (reason: {pv.reason})", style="red"))
            console.print("Stopping to avoid corrupt apply. See patch.diff in run artifacts.")
            return

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

        ap_res = apply_unified_diff(repo_root, pv.cleaned)
        if not ap_res.ok:
            console.print(Panel(ap_res.message, title="PATCH APPLY FAILED", style="red"))
            return
        console.print(Panel(ap_res.message, title="PATCH APPLIED", style="green"))
    else:
        console.print(Panel("Empty patch returned (no changes). Proceeding to verify.", title="NO PATCH", style="yellow"))

    # --- VERIFY + FIX LOOP ---
    max_retries = int(cfg.get("max_retries", 3))
    for attempt in range(max_retries + 1):
        ok, stage, out, err = verify(cfg, repo_root)
        (run_dir / f"verify_{attempt}.log").write_text(out + "\n" + err, encoding="utf-8")
        if ok:
            console.print(Panel("All checks passed ✅", title="DONE", style="green"))
            return

        failure = parse_failure(stage, out, err, selected_files=files)
        failure_dict = {
            "stage": failure.stage,
            "kind": failure.kind,
            "file": failure.file,
            "line": failure.line,
            "message": failure.message,
            "relevant_files": failure.relevant_files,
        }
        (run_dir / f"failure_{attempt}.json").write_text(json.dumps(failure_dict, indent=2), encoding="utf-8")
        console.print(Panel(json.dumps(failure_dict, indent=2), title=f"FAILURE (attempt {attempt+1}/{max_retries})", style="red"))

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
        fix_patch = generate_fix(failure_dict, fix_files_map, cfg["models"], cfg["hybrid"])
        (run_dir / f"fix_patch_{attempt}.diff").write_text(fix_patch, encoding="utf-8")

        if not fix_patch.strip():
            console.print(Panel("Fixer returned empty patch. Stopping.", title="STOPPED", style="red"))
            return

        pv = validate_unified_diff(fix_patch)
        if not pv.ok:
            console.print(Panel(pv.cleaned[:2000], title=f"INVALID FIX PATCH (reason: {pv.reason})", style="red"))
            console.print("Stopping to avoid corrupt apply. See fix_patch diff in run artifacts.")
            return

        scope = check_patch_scope(pv.cleaned, files)
        if not scope.ok:
            console.print(
                Panel(
                    f"{scope.reason}\n\nTouched: {scope.touched}\nOutside: {scope.outside}",
                    title="FIX PATCH OUT OF SCOPE",
                    style="red",
                )
            )
            return

        ap_res = apply_unified_diff(repo_root, pv.cleaned)
        if not ap_res.ok:
            console.print(Panel(ap_res.message, title="FIX PATCH APPLY FAILED", style="red"))
            return
        console.print(Panel("Applied fix patch. Re-verifying...", title="FIX APPLIED", style="green"))


if __name__ == "__main__":
    main()
