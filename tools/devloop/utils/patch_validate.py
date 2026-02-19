from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List, Optional, Set


@dataclass
class PatchValidation:
    ok: bool
    reason: str
    cleaned: str


def _strip_fences(s: str) -> str:
    s = s.strip()
    # Remove any fence lines anywhere (``` or ```diff etc.)
    s = re.sub(r"(?m)^\s*```[a-zA-Z0-9_-]*\s*$\n?", "", s)
    return s.strip()


def _extract_diff_body(s: str) -> str:
    """Keep from first diff --git to end. Strips leading prose."""
    idx = s.find("diff --git ")
    if idx >= 0:
        return s[idx:].strip()
    return s


def _normalize_hunk_blank_lines(cleaned: str) -> str:
    """
    Some models emit truly empty lines inside @@ hunks.
    git apply requires every hunk line to start with ' ', '+', '-', or '\\'.
    Convert empty lines within hunks into a single-space context line.
    """
    out: list[str] = []
    in_hunk = False

    for line in cleaned.splitlines():
        if line.startswith("diff --git "):
            in_hunk = False
            out.append(line)
            continue
        if line.startswith("@@ "):
            in_hunk = True
            out.append(line)
            continue

        if in_hunk:
            # Treat "blank looking" lines as blank (handles NBSP / zero-width)
            if re.fullmatch(r"[ \t\u00a0\u200b]*", line):
                out.append(" ")
            else:
                out.append(line)
        else:
            out.append(line)

    return "\n".join(out)


def _validate_hunk_prefixes(cleaned: str) -> tuple[bool, str]:
    """
    git apply requires unified hunks where each line begins with:
      - ' ' context
      - '+' add
      - '-' delete
      - '\\' for '\\ No newline at end of file'
    Some models output raw file lines inside hunks (missing prefixes) which causes:
      'error: corrupt patch at line N'
    """
    lines = cleaned.splitlines()
    in_hunk = False
    for i, line in enumerate(lines, start=1):
        if line.startswith("diff --git "):
            in_hunk = False
            continue
        if line.startswith("@@ "):
            in_hunk = True
            continue
        if not in_hunk:
            continue
        if line.startswith("index ") or line.startswith("--- ") or line.startswith("+++ "):
            continue
        if line == "":
            return False, f"invalid hunk at line {i}: empty line must be ' ' (single space) for context"
        if line[0] not in (" ", "+", "-", "\\"):
            return False, f"invalid hunk at line {i}: missing prefix (expected ' ', '+', '-', or '\\\\'): {line[:80]!r}"
        # Reject context lines that look like add/remove (common model error: " +#" instead of "+#")
        if line.startswith(" +") or line.startswith(" -"):
            return False, (
                f"invalid hunk at line {i}: context line begins with + or -. "
                "Did you mean to add/remove this line? Remove the leading space."
            )
    return True, "ok"


_HUNK_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")


def _repair_hunk_headers(cleaned: str) -> str:
    """
    Recompute @@ hunk line counts from the body. Models often get counts wrong;
    repairing deterministically before git apply avoids brittle failures.
    """
    lines = cleaned.splitlines()
    i = 0
    out: list[str] = []
    while i < len(lines):
        m = _HUNK_RE.match(lines[i])
        if not m:
            out.append(lines[i])
            i += 1
            continue

        old_start = int(m.group(1))
        new_start = int(m.group(3))
        tail = m.group(5) or ""

        hunk_header_index = len(out)
        out.append(lines[i])
        i += 1

        old_seen = 0
        new_seen = 0

        while i < len(lines):
            line = lines[i]
            if line.startswith("diff --git ") or line.startswith("@@ "):
                break
            if line.startswith("\\"):
                out.append(line)
                i += 1
                continue

            if not line:
                out.append(" ")
                old_seen += 1
                new_seen += 1
                i += 1
                continue

            c = line[0]
            if c == " ":
                old_seen += 1
                new_seen += 1
            elif c == "-":
                old_seen += 1
            elif c == "+":
                new_seen += 1

            out.append(line)
            i += 1

        out[hunk_header_index] = f"@@ -{old_start},{old_seen} +{new_start},{new_seen} @@{tail}"

    return "\n".join(out)


def _validate_hunk_line_counts(cleaned: str) -> tuple[bool, str]:
    """Reject hunks where @@ declared counts don't match actual body lines."""
    lines = cleaned.splitlines()
    i = 0
    while i < len(lines):
        m = _HUNK_RE.match(lines[i])
        if not m:
            i += 1
            continue

        old_n = int(m.group(2) or "1")
        new_n = int(m.group(4) or "1")

        i += 1
        old_seen = 0
        new_seen = 0
        while i < len(lines):
            line = lines[i]
            if line.startswith("diff --git ") or line.startswith("@@ "):
                break
            if line.startswith("\\"):
                i += 1
                continue
            if not line:
                return False, f"hunk has empty line (should be ' '): near line {i+1}"
            c = line[0]
            if c == " ":
                old_seen += 1
                new_seen += 1
            elif c == "-":
                old_seen += 1
            elif c == "+":
                new_seen += 1
            else:
                return False, f"hunk contains invalid prefix {c!r} near line {i+1}"
            i += 1

        if old_seen != old_n or new_seen != new_n:
            return False, (
                f"hunk line count mismatch: expected old={old_n}, new={new_n} "
                f"but saw old={old_seen}, new={new_seen}"
            )

    return True, "ok"


def validate_unified_diff(patch_text: str) -> PatchValidation:
    if not patch_text or not patch_text.strip():
        return PatchValidation(ok=False, reason="empty", cleaned="")

    cleaned = _strip_fences(patch_text)
    cleaned = _extract_diff_body(cleaned)
    cleaned = _normalize_hunk_blank_lines(cleaned)
    cleaned = _repair_hunk_headers(cleaned)

    # A minimal unified diff should contain at least one diff header.
    if "diff --git " not in cleaned:
        return PatchValidation(
            ok=False,
            reason="missing diff --git header (not a unified diff)",
            cleaned=cleaned,
        )

    # Must have --- and +++ (required for git apply)
    if "--- " not in cleaned or "+++ " not in cleaned:
        return PatchValidation(
            ok=False,
            reason="missing ---/+++ headers (invalid unified diff)",
            cleaned=cleaned,
        )

    # Prevent common hallucination: explanations inside patch
    bad_markers = ["Here is the patch", "Explanation:", "```", "PATCH:"]
    if any(m in cleaned for m in bad_markers):
        # Not always fatal, but we keep it strict for v1 safety
        return PatchValidation(ok=False, reason="patch contains non-diff prose/markers", cleaned=cleaned)

    ok, reason = _validate_hunk_prefixes(cleaned)
    if not ok:
        return PatchValidation(ok=False, reason=reason, cleaned=cleaned)

    ok2, reason2 = _validate_hunk_line_counts(cleaned)
    if not ok2:
        return PatchValidation(ok=False, reason=reason2, cleaned=cleaned)

    return PatchValidation(ok=True, reason="ok", cleaned=cleaned)


@dataclass
class ScopeCheck:
    ok: bool
    touched: List[str]
    outside: List[str]
    reason: Optional[str] = None


_DIFF_RE = re.compile(r"^diff --git a/(.+?) b/(.+?)$", re.MULTILINE)


def extract_touched_files(patch_text: str) -> List[str]:
    touched: List[str] = []
    for a_path, b_path in _DIFF_RE.findall(patch_text):
        # Usually identical; prefer b/ path
        path = b_path.strip()
        if path and path not in touched:
            touched.append(path)
    return touched


BAD_PATH_MARKERS = {"your_script.py", "file.py", "path/to/file", "example.py"}


def check_patch_scope(patch_text: str, allowed_files: Iterable[str]) -> ScopeCheck:
    allowed: Set[str] = set(allowed_files)
    touched = extract_touched_files(patch_text)

    if not touched:
        return ScopeCheck(ok=False, touched=[], outside=[], reason="No diff --git paths found (cannot scope-check)")

    # Reject placeholder/hallucinated paths
    if any(p in BAD_PATH_MARKERS or any(p.endswith("/" + m) for m in BAD_PATH_MARKERS) for p in touched):
        return ScopeCheck(
            ok=False, touched=touched, outside=touched, reason="Patch contains placeholder file paths"
        )

    outside = [p for p in touched if p not in allowed]
    if outside:
        return ScopeCheck(ok=False, touched=touched, outside=outside, reason="Patch touches files outside allowed scope")

    return ScopeCheck(ok=True, touched=touched, outside=[])
