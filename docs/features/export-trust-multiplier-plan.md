# Export Trust Multiplier — Implementation Plan

## Summary

Improve Export panel UX: make formats clear (MD/JSON), show "What's included" summary, ensure evidence/citations are included where available, add Copy + Download with success feedback, and keep stable filenames. No backend contract or schema changes.

## Context

- **ExportPanel** (`apps/web/src/components/ExportPanel.tsx`): right-hand Sheet; quick actions (Last output MD, Facts CSV) and full project export (Markdown, CSV, Facts CSV with evidence, Facts Markdown with evidence, JSON).
- **Backend** `GET /projects/{project_id}/export?format=...` returns raw body; no `Content-Disposition`. Frontend builds filename in `api.ts`: `project-${projectId}-${format}.${ext}`.
- **Project page** passes `projectId`, `lastOutputId={lastOutputSummary?.id ?? null}`; has `facts`, `sources`, `outputsList` from queries.

---

## 1) Current export behavior

| Area | Current behavior |
|------|-------------------|
| **Formats** | Markdown, CSV, Facts CSV (with evidence), Facts Markdown (with evidence), JSON. All as separate buttons; no primary/secondary grouping. |
| **Quick actions** | "Last output (Markdown)" (programmatic `<a>` download, filename from sanitized output title), "Facts CSV" (full-project CSV). |
| **Success state** | "Export ready" + single **Download** link; no Copy. No preview or summary of contents. |
| **Filenames** | Full project: `project-{projectId}-{format}.{ext}` (stable). Last output: `{title_sanitized}.md`. |
| **Evidence** | Backend already includes `evidence_snippet` in `markdown_evidence`, `csv_evidence`, and in JSON fact objects. |
| **Backend payload** | Facts built from `ResearchNode`: `source_domain`, `source_url`, `fact_text`, `confidence_score`, `is_key_claim`, `review_status`, `is_pinned`, `evidence_snippet`. |

---

## 2) Proposed UX improvements

### Screens / states

- **Open state (default)**  
  - Header: "Export"  
  - **Format section**: Primary formats as clear options: **Markdown** and **JSON**. Optional: group "With evidence" variants under a toggle or sub-options (e.g. "Markdown (with evidence)" / "Markdown (facts only)") so it’s obvious evidence is included when chosen.  
  - **What’s included**: Small summary block (e.g. "X facts, Y sources, Z outputs") when counts are available. Pass `factsCount`, `sourcesCount`, `outputsCount` from project page (optional props). If not passed, hide block or show "—" to avoid extra API calls.  
  - **Quick actions**: Keep "Last output (Markdown)" and optionally "Facts CSV"; keep disabled state when no `lastOutputId`.  
  - **Full project**: Buttons for Markdown, Markdown (with evidence), JSON; CSV optional if trivial (keep existing CSV / CSV evidence buttons or fold into "CSV" with a sub-label).  

- **Loading**  
  - Keep current "Exporting..." + loader.  

- **Success state**  
  - Keep "Export ready".  
  - Add **Copy** button: copy `result.content` to clipboard, then toast "Copied to clipboard" (or "Copied to clipboard (Markdown)" / "… (JSON)").  
  - Keep **Download** link with stable filename; optional brief toast on click ("Download started") if desired.  

- **Error state**  
  - Unchanged: message + Retry.  

### Filenames (stability)

- Full project: keep `project-{projectId}-{format}.{ext}` (already stable).  
- Last output: keep current sanitized title or standardize to `project-{projectId}-output-{outputId}.md` for consistency (optional).  

---

## 3) Data mapping for Markdown / JSON

### Markdown (facts only) — `format=markdown`

- Backend: `### {source_domain}\n> {fact_text}\n*Confidence: … | Key Claim: …*`  
- No change.

### Markdown (with evidence) — `format=markdown_evidence`

- Backend: same plus **Evidence** block (`evidence_snippet`) and **Source** URL.  
- No change.

### JSON — `format=json`

- Backend: array of `{ source_domain, source_url, fact_text, confidence_score, is_key_claim, review_status, is_pinned, evidence_snippet }`.  
- Evidence/citations already present via `evidence_snippet` and `source_url`. No change.

### CSV / CSV evidence

- Existing; optional to keep as secondary options. Evidence in `csv_evidence` via `evidence_snippet` column.

---

## 4) Tests impacted + minimal update plan

| Test file | Current coverage | Planned change |
|-----------|------------------|----------------|
| `export.spec.ts` | Markdown success (filename, content), error + retry | Add assertion for Copy button (click, then check clipboard or toast). Optionally assert "What's included" block when present. Keep filename assertions. |
| `export-quick-actions.spec.ts` | Last output MD download, `.md` filename | No change unless we standardize last-output filename; then update expected pattern. |
| `export-evidence.spec.ts` | CSV evidence content (evidence_snippet column) | No change. |
| `provenance-export.spec.ts` | (if it exists) | Leave as-is unless it touches ExportPanel. |

**Minimal implementation order**

1. **ExportPanel**  
   - Add optional props: `factsCount?: number`, `sourcesCount?: number`, `outputsCount?: number`.  
   - Add "What's included" summary (facts, sources, outputs) when any count is defined.  
   - Reorder/group format buttons: Markdown / JSON primary; label "with evidence" clearly; keep CSV optional.  
   - On success: add Copy button (copy `content`, toast), keep Download link and stable filename.  

2. **Project page**  
   - Pass `factsCount={facts?.length ?? 0}`, `sourcesCount={sources?.length ?? 0}`, `outputsCount={outputsList?.length ?? 0}` into `ExportPanel`.  

3. **api.ts**  
   - No change to `exportProject` or filename logic (already stable). Optionally use backend `Content-Disposition` filename if backend adds it later.  

4. **E2E**  
   - In `export.spec.ts`: add Copy flow (click Copy, expect success toast or clipboard).  

5. **Lint/typecheck**  
   - `cd apps/web && npm run lint && npm run typecheck` (stop condition).

---

## Files touched (planned)

| File | Change |
|------|--------|
| `apps/web/src/components/ExportPanel.tsx` | Props for counts; "What's included"; format grouping; Copy + Download with feedback; stable filenames (no change if already stable). |
| `apps/web/src/app/project/[id]/page.tsx` | Pass `factsCount`, `sourcesCount`, `outputsCount` to `ExportPanel`. |
| `apps/web/tests/e2e/export.spec.ts` | Add Copy success test. |
| `docs/features/export-trust-multiplier-plan.md` | This plan. |
| `docs/_index.md` | Add link to this doc (per docs generator rules). |

---

## Links

- [[ExportPanel]] (component)
- [[docs/_index]]
