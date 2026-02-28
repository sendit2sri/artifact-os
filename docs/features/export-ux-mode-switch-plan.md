# Export UX — Project vs Last Output Mode Switch (Plan)

## Summary

Improve Export as a trust multiplier by adding a clear mode switch (**Project** vs **Last output**), summary counts + lightweight preview, stable filenames, and consistent Copy/Download for both modes. No backend changes.

## Context

- **Current:** Single panel with “Quick actions” (Last output MD, Facts CSV) and “Full project” (MD, MD+evidence, JSON, CSV, CSV+evidence). Last output triggers a direct download only (no success state or Copy in panel). Project export shows success + Copy/Download.
- **Goal:** User immediately understands “I’m exporting facts+sources” vs “I’m exporting the latest synthesis doc.”

---

## 1) Exact UI copy for the two modes

### Panel header (unchanged)
- **Title:** `Export`

### Mode switch (new, at top of content)
- **Control:** Segmented control or tab-style switch.
- **Labels:**
  - `Project` — “Facts + sources from this project”
  - `Last output` — “Latest synthesis (Markdown)”
- **Test IDs:** `export-mode-project`, `export-mode-last-output`.

### When mode = **Project**
- **Summary (when counts available):**  
  `What's included: X facts, Y sources`  
  (Do not show “Z outputs” here; outputs are not part of project export.)
- **Subheading:** `Formats`
- **Format buttons (order):**
  1. `Markdown`
  2. `Markdown (with evidence)`
  3. `JSON`
  4. `CSV`
  5. `CSV (with evidence)`
- **Optional evidence toggle:** If desired, can replace the two “(with evidence)” buttons with a single “Include evidence” toggle and one button per format (MD / JSON / CSV). For minimal diff, keep five buttons as above.
- **After export:** Same success block: “Export ready” + **Copy** + **Download** (stable filename).

### When mode = **Last output**
- **Summary (when lastOutputId + counts available):**  
  `Latest output · 1 document`  
  Or: `What's included: 1 output` (and optionally output title if we have it).
- **Subheading:** `Format`
- **Single action:**  
  `Export as Markdown` (or “Generate export”)  
  Triggers `fetchOutput(lastOutputId)` → then show same success block with **Copy** + **Download** (stable filename).
- **When no output:**  
  `Generate an output to export the latest synthesis.`  
  Button disabled; no format list.

### Success block (shared)
- **Line 1:** `Export ready`
- **Line 2:** **Copy** button, **Download** link (same for both modes).
- **Preview (lightweight):** Optional 1–2 line preview: first ~80 chars of exported content, truncated with ellipsis. Test ID: `export-preview-text`. If omitted for minimal diff, skip.

### Error block (unchanged)
- Message + **Retry** (Project: retry last format; Last output: retry fetch).

---

## 2) Data mapping + filenames

### Project export (unchanged backend contract)
- **API:** `GET /projects/{project_id}/export?format={format}`.
- **Formats:** `markdown` | `markdown_evidence` | `json` | `csv` | `csv_evidence`.
- **Content:** Facts + source metadata (domain, URL, confidence, key claim, review status, evidence snippet when applicable).
- **Filenames (stable):**  
  `project-{projectId}-{format}.{ext}`  
  e.g. `project-abc123-markdown.md`, `project-abc123-json.json`, `project-abc123-csv_evidence.csv`.

### Last output export (client-side only)
- **API:** `GET /outputs/{outputId}` → `Output` (`content`, `title`, …).
- **Content:** `output.content` (Markdown body of the synthesis).
- **Filename (stable):**  
  `project-{projectId}-output-{outputId}.md`  
  (No longer `{title_sanitized}.md` so it’s stable and unique.)

### Summary counts (source of truth)
- **Project mode:** `factsCount`, `sourcesCount` (from project page). Do not show outputs count in Project mode.
- **Last output mode:** Can show “1 output” or “Latest output” when `lastOutputId` is set; optional `lastOutputTitle` prop for preview line.

---

## 3) Test impact plan

| Test file | Current coverage | Change |
|-----------|------------------|--------|
| **export.spec.ts** | Project Markdown success (filename, content), Copy feedback, error+retry | 1) Ensure “Project” mode is selected (or select it if default is Last output). 2) Keep assertions on `export-option-markdown`, `export-success`, `export-download`, `export-copy`. 3) Optional: assert `export-whats-included` contains “fact(s)” and “source(s)” when visible. |
| **export-quick-actions.spec.ts** | Last output MD download (click → download, `.md` filename) | 1) Switch to “Last output” mode (click `export-mode-last-output`). 2) Click “Export as Markdown” (new test ID e.g. `export-last-output-md` can stay). 3) Assert download filename: `project-{projectId}-output-{outputId}.md` (or match regex `project-.*-output-.*\.md`). 4) Optional: assert success block and Copy visible after export. |
| **export-evidence.spec.ts** | CSV with evidence (content has evidence_snippet) | 1) Ensure “Project” mode. 2) Click CSV (with evidence). No change to response assertions. |

### New / updated test IDs (recommended)
- `export-mode-project` — switch to Project.
- `export-mode-last-output` — switch to Last output.
- Keep `export-last-output-md` for the “Export as Markdown” button in Last output mode.
- Keep `export-whats-included`; in Project mode copy should mention facts/sources only.

### Minimal test updates (no new spec files)
- **export.spec.ts:** Before project export tests, add “select Project mode” if not default (e.g. `page.getByTestId('export-mode-project').click()`).
- **export-quick-actions.spec.ts:** Select Last output mode; click export; assert new filename pattern and optionally success + Copy.
- **export-evidence.spec.ts:** Select Project mode then trigger CSV evidence export.

---

## Files to touch (implementation)

| File | Change |
|------|--------|
| `apps/web/src/components/ExportPanel.tsx` | Add mode state (`project` | `last_output`); mode switch UI; conditional body (Project: formats + counts; Last output: single MD action + counts); Last output path sets blob + filename `project-{id}-output-{outputId}.md` and shows same success block (Copy + Download). |
| `apps/web/src/app/project/[id]/page.tsx` | No change if ExportPanel props unchanged. Optional: pass `lastOutputTitle={lastOutputSummary?.title}` for preview. |
| `apps/web/tests/e2e/export.spec.ts` | Select Project mode; keep existing assertions. |
| `apps/web/tests/e2e/export-quick-actions.spec.ts` | Select Last output mode; assert new filename pattern; optional success/Copy. |
| `apps/web/tests/e2e/export-evidence.spec.ts` | Select Project mode before CSV evidence. |

---

## Links

- [[features/export-trust-multiplier-plan]] (previous iteration)
- [[docs/_index]]
