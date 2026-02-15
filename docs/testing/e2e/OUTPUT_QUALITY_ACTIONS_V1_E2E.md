# Output Quality Actions v1 E2E

## Summary

After an output is generated (or opened from history/share), **Quality Actions** help the user improve trustworthiness: if the output used any NEEDS_REVIEW | FLAGGED | REJECTED facts, a prominent **Quality Banner** shows a breakdown from `output.quality_stats` and CTAs: **Review issues** (opens Review Queue for non-approved facts), **Regenerate from approved only** (uses only APPROVED facts from the output; requires ≥2), and **Pin & regenerate** (opens SelectedFactsDrawer with output facts preselected). If the output used only APPROVED facts, a subtle "High trust" indicator is shown (no banner).

## Context

- Backend: No new endpoints; `GET /outputs/{id}` already returns `quality_stats`.
- Frontend: New `OutputQualityBanner` component; integrated in OutputDrawer and share page (`/output/[id]`). Project page wires Review issues (output-specific queue), Regenerate from approved only (existing synthesis pipeline), and Repick (preselect output facts, open SelectedFactsDrawer).

## What changed

- **OutputQualityBanner.tsx:** Props `output`, `onReviewIssues`, `onRegenerateApprovedOnly`, `onOpenRepick`, `mode` (project | share). "Issues present" when `quality_stats.needs_review + flagged + rejected > 0`. Project mode: banner with breakdown + CTAs; share mode: read-only breakdown + note. Selectors: `output-quality-banner`, `output-quality-breakdown`, `output-quality-review-issues`, `output-quality-regenerate-approved`, `output-quality-repick`, `output-quality-regenerate-disabled`.
- **OutputDrawer:** Renders banner under meta; passes `onReviewIssues`, `onRegenerateApprovedOnly`, `onOpenRepick`; disables regenerate when &lt; 2 approved.
- **Project page:** `outputReviewQueueIds` state; `handleReviewIssuesFromOutput` (build issue queue from output facts or evidence map, open EvidencePanelSimple in queue mode); `handleRegenerateApprovedOnly` (approved facts from output, executeSynthesis); `handleOpenRepickFromOutput` (preselect output facts, open SelectedFactsDrawer readOnly=false).
- **Share page:** Renders `OutputQualityBanner` with `mode="share"` when `output.quality_stats` exists.
- **E2E:** `output-quality-banner-actions.spec.ts` (mixed output → banner → Review issues → queue → Regenerate approved only → needs_review 0, content &gt; 80); `output-share-quality-banner.spec.ts` (share page of output with issues → read-only banner + breakdown).

## How to run / verify

- E2E: `npx playwright test output-quality-banner-actions.spec.ts` and `npx playwright test output-share-quality-banner.spec.ts`. Wire into `test:e2e:ci`.

## Files touched

- `apps/web/src/components/OutputQualityBanner.tsx` — new
- `apps/web/src/components/OutputDrawer.tsx` — banner integration, new props
- `apps/web/src/app/project/[id]/page.tsx` — outputReviewQueueIds, handlers, EvidencePanelSimple queueIds, OutputDrawer props
- `apps/web/src/app/output/[id]/page.tsx` — OutputQualityBanner mode=share
- `apps/web/tests/e2e/output-quality-banner-actions.spec.ts` — new
- `apps/web/tests/e2e/output-share-quality-banner.spec.ts` — new
- `docs/testing/e2e/OUTPUT_QUALITY_ACTIONS_V1_E2E.md` — this file

## Links

- [[OUTPUT_EVIDENCE_MAP_V1_E2E]]
- [[EVIDENCE_PANEL_E2E]]
- [[RUN_E2E]]
