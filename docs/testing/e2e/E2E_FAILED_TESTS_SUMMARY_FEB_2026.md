# E2E Failed Tests Summary (Feb 2026)

## Overview

19 tests failed in the last E2E run. This doc defines canonical UX contracts, maps failures to them, and gives concrete spec-level patches so implementers can fix without re-interpreting.

---

## Canonical UX Contracts

### 1. Synthesis flow (Generate → Builder → Output)

**Contract:** If `selectedFacts.size >= 2`, clicking any Generate entry point follows a deterministic sequence:
- **If trust-gate conditions are met:** Generate → Trust Gate → Builder/Preview → Confirm → Output Drawer
- **Else:** Generate → Builder/Preview → Confirm → Output Drawer

**Acceptance criteria:**
- `generate-synthesis`, `generate-from-approved`, `generate-from-pinned`, and selected-facts drawer "Generate" all follow the sequence above
- If trust-gate is shown: stable testids `trust-gate`, `trust-gate-remove-non-approved`, `trust-gate-include-anyway`
- Builder: `synthesis-builder` (SynthesisBuilder) or `cluster-preview` (ClusterPreviewModal)
- Confirm: `synthesis-builder-generate-merge` ("Combine All") or `cluster-preview-confirm`
- Output: `output-drawer`, `output-drawer-content`
- `ensureOutputDrawerAfterGenerate()` must handle both trust-gate path and builder/cluster-preview path

---

### 2. Duplicate add feedback

**Contract:** Pasting a URL that is already present must produce immediate feedback: toast "Already added" and highlight/pulse the existing source row. The Add button must remain clickable.

**Acceptance criteria:**
- Add button is disabled only for invalid URL / empty / loading — **not** for `isDuplicate`
- When input URL canonicalizes to an existing `job.params.canonical_url`, Add is **enabled**
- Clicking Add triggers API call; backend returns `{ is_duplicate: true, canonical_url }` (or 409)
- On duplicate: toast appears; `source-highlight-pulse` appears on matching source row
- Server idempotency prevents duplicate job rows

**Why API path:** Avoids client canonicalization drift; keeps logic authoritative on backend.

---

### 3. Workspace source of truth

**Contract:** Workspace switch must update router query `ws` immediately. Project creation must read `workspaceId` from the same source (router/store).

**Acceptance criteria:**
- After switching workspace: URL includes `?ws=<teamId>`
- Create project uses that workspace ID
- Project list and project links reflect the active workspace

---

### 4. Mutation / idle

**Contract:** After any mutation (approve/flag/undo/retry), tests must wait for "app is settled" before asserting.

**Acceptance criteria:**
- Use `waitForAppIdle(page)` (from `helpers/setup.ts`) or equivalent
- Debug strip shows `idle: ✓` when settled
- No tests assert badge/state before idle

---

## Classification: Test Bug vs Product Contract vs Seed

| Type | Specs | Fix |
|------|-------|-----|
| **Test bug** | generate-from-approved, generate-from-pinned | Add `selectTwoFacts(page)` before asserting button |
| **Product contract** | source-dedupe-highlight | Allow Add when duplicate; call API; show toast + pulse |
| **Product contract** | trust-gate, selected-facts-drawer, panels-pin, output-diff, cluster-preview-generate | Align to Generate → Builder → Confirm → Output |
| **Product contract** | workspace-switch | Enforce URL/state; assert `ws` before create |
| **Harness** | synthesis-flow (force_error) | Deterministic trigger (query param or wait-for-harness) |
| **Seed** | facts-group-sort, facts-dedup | Add NEEDS_REVIEW marker; fix dedup assertions |

---

## Failing Specs Mapped to Contracts

| Spec | Contract | Failure |
|------|----------|---------|
| source-dedupe-highlight | Duplicate add | Add disabled → no toast, no pulse |
| workspace-switch | Workspace | Team selected but URLs still Personal ws |
| undo-action | Mutation/idle | Assert before idle; badge timing |
| trust-gate | Synthesis | Expect output drawer; gets Builder |
| synthesis-flow (×2) | Synthesis + Harness | force_error not applied; builder vs error |
| selected-facts-drawer | Synthesis | Expect output drawer; gets Builder |
| selection-autosave | State persistence | Selection not restored / banner not shown |
| preferences-persist | State | Prefs not restored |
| panels-pin | Synthesis | Output drawer closes when History opens |
| output-diff | Synthesis | Depends on outputs; diff UI |
| generate-from-approved | Synthesis + Test | Button gated by selection |
| generate-from-pinned | Synthesis + Test | Button gated by selection |
| facts-group-sort | Seed | No NEEDS_REVIEW fact |
| facts-dedup | Seed | cardCountBefore < 5 brittle |
| fact-status-actions (×2) | Mutation/idle | Badge/sort timing |
| evidence-review-flow | Mutation/idle | Wrong card after advance |
| cluster-preview-generate | Synthesis | Already uses cluster-preview; may need ensureOutputDrawerAfterGenerate |

---

## Concrete Spec-Level Patches

### A) generate-from-approved / generate-from-pinned

```ts
// Before: expect button visible without selection
await switchToAllDataView(page);
const approvedBtn = page.getByTestId('generate-from-approved');

// After:
await switchToAllDataView(page);
await selectTwoFacts(page);  // gates synthesis bar visibility
const approvedBtn = page.getByTestId('generate-from-approved');
await expect(approvedBtn).toBeVisible({ timeout: 10000 });
await approvedBtn.click();
// Then use ensureOutputDrawerAfterGenerate(page, 'merge') — Builder may open first
```

---

### B) trust-gate, selected-facts-drawer, panels-pin, output-diff, cluster-preview-generate

**Pattern:** Do not assert output drawer immediately after Generate. Use canonical flow:

1. Select 2+ facts
2. Click Generate entry point
3. Assert Builder or Cluster Preview visible (not output drawer)
4. Click confirm (`synthesis-builder-generate-merge` or `cluster-preview-confirm`)
5. Assert output drawer visible + content

**Helper:** `ensureOutputDrawerAfterGenerate(page, 'merge'|'split', timeout)` already does 2–5. Use it.

**cluster-preview:** Uses `cluster-preview` (ClusterPreviewModal). See Shared Helper section.

---

### C) synthesis-flow force_error

**Preferred:** URL param `?e2e_force_synth_error=1` for next generate only (or request header). Reset after first use.

**If keeping `window.__e2e`:**
```ts
await page.waitForFunction(
  () => typeof (window as any).__e2e?.setForceNextSynthesisError === 'function',
  { timeout: 10000 }
);
await page.evaluate(() => (window as any).__e2e.setForceNextSynthesisError(true));
```

"Expected error, got builder" means the flag did not apply — ensure harness is ready and backend honors it.

---

### D) workspace-switch

**Product:** On workspace switch, `router.replace({ query: { ws: teamId } })` immediately. Create project reads `workspaceId` from router/store.

**Test:** Assert Team ws specifically (not just any ws param). If known team ID in seed/harness, use it. Otherwise:
```ts
await page.getByText('Team', { exact: true }).click();
await expect(page.getByTestId('workspace-trigger')).toContainText('Team');  // UI shows Team
await expect(page).toHaveURL(/\?ws=[a-f0-9-]+/);
const teamWsId = page.url().match(/ws=([a-f0-9-]+)/)?.[1];
expect(teamWsId).toBeTruthy();
// Optional: assert workspace-label or known DEFAULT_WORKSPACE_ID_TEAM matches
await page.getByTestId('project-create').click();
// ... assert new project link includes ws=<teamWsId>
```

---

### E) facts-group-sort

**Seed:** Kitchen sink MUST include at least one NEEDS_REVIEW and at least one APPROVED fact (so sort comparisons remain meaningful). Include marker `[E2E_NEEDS_REVIEW_1]` on the Needs Review fact.

**Test:** Assert that marker in first card after sort (not badge text only).

---

### F) facts-dedup

**Replace** `cardCountBefore < 5` with:

- Before dedup: assert duplicates exist (`fact-duplicate-badge` count > 0 or `debug-dup-count` if added)
- Click dedup trigger
- Assert toast "Suppressed duplicates"
- **Most stable assertion:** After dedup, toggling "Show suppressed" increases visible rows (avoids brittle "count decreases" if UI collapses differently)

---

### G) undo-action, fact-status-actions, evidence-review-flow

**Add** `await waitForAppIdle(page)` after mutation, before badge assertion.

**Wrong card after sort:** Pin target via `[E2E_APPROVED_1]` or `data-fact-id` instead of "first card".

---

### H) selection-autosave, preferences-persist (State persistence)

**selection-autosave:** Selection restored from localStorage; banner shows count. Ensure `selection-restore-banner` and `bulk-actions-label` wait for restore to complete (may need `waitForAppIdle` after reload).

**preferences-persist:** Server-backed prefs must save before reload; assert restored state matches (sort, group, selected-only, default view).

**Helper contract:** `ensureOutputDrawerAfterGenerate(page, mode)` must:

1. Wait for one of: `trust-gate`, `synthesis-builder`, `cluster-preview`, `output-drawer` (in case product bypasses builder in future)
2. Route accordingly:
   - **trust-gate:** Resolve it (`trust-gate-remove-non-approved` or `trust-gate-include-anyway`)
   - **synthesis-builder:** Click `synthesis-builder-generate-merge` or split equivalent
   - **cluster-preview:** Click `cluster-preview-confirm`
3. Finally: assert `output-drawer` + `output-drawer-content` visible

**cluster-preview extension:** Extend `waitForSynthesisResult` to check `cluster-preview` (return `'cluster'`), then in `ensureOutputDrawerAfterGenerate`:

```ts
if (result === 'cluster') {
  await page.getByTestId('cluster-preview-confirm').click();
  await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 30000 });
  return;
}
```

---

## Implementation Order

1. **Fix tests:** Add `selectTwoFacts()` before generate-from-approved/pinned.
2. **Fix source-dedupe-highlight product:** Allow Add on duplicates; call API; show toast + pulse.
3. **Align synthesis specs:** Use `ensureOutputDrawerAfterGenerate` everywhere; stop asserting drawer immediately after Generate.
4. **Workspace switch:** Enforce URL/state; assert `ws` before create.
5. **force_error harness:** Query param or wait-for-harness; ensure flag applies and resets.
6. **Seed:** Add NEEDS_REVIEW fact; fix dedup assertions.
7. **Mutation tests:** Add `waitForAppIdle` after mutations.

---

## Definition of Done

When fixes are complete:

- [ ] All Generate entry points follow: Generate → [Trust Gate if applicable] → Builder/Preview → Confirm → Output
- [ ] Duplicate URL add gives feedback (toast + pulse) even when duplicate
- [ ] Workspace switching updates `ws` and project creation honors it
- [ ] All mutation tests use `waitForAppIdle` (or equivalent)
- [ ] Seeds contain explicit markers for Needs Review + Dedup scenarios
- [ ] No tests assert existence of facts if the seed can produce 0 facts
