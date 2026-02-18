from __future__ import annotations

import os
import json
import time
from pathlib import Path
from typing import Dict, Any, List

import yaml
from rich.console import Console
from rich.panel import Panel

from context.packer import pack_initial, read_files
from context.parser import parse_failure
from agents.planner import create_plan
from agents.coder import generate_patch
from agents.fixer import generate_fix
from utils.shell import run_chain
from utils.patch import apply_unified_diff
from utils.patch_validate import validate_unified_diff
from utils.git import ensure_clean_or_warn

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
    plan = create_plan(args.task, diff_for_plan, cfg["models"], cfg["hybrid"])
    (run_dir / "plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
    console.print(Panel(json.dumps(plan, indent=2), title="PLAN (JSON)"))

    files = plan.get("files", []) or []
    # add CLI hints
    for f in args.files:
        if f not in files:
            files.append(f)

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

        failure = parse_failure(stage, out, err)
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

        # expand context: include failure file + any relevant files
        relevant = [p for p in (failure.relevant_files or []) if p]
        if failure.file and failure.file not in relevant:
            relevant.append(failure.file)

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

        ap_res = apply_unified_diff(repo_root, pv.cleaned)
        if not ap_res.ok:
            console.print(Panel(ap_res.message, title="FIX PATCH APPLY FAILED", style="red"))
            return
        console.print(Panel("Applied fix patch. Re-verifying...", title="FIX APPLIED", style="green"))


if __name__ == "__main__":
    main()
