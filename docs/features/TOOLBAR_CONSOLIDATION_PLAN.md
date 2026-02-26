# Toolbar consolidation plan

## Summary

Keep only **Tabs**, **Search**, **Filters** (sheet trigger), and **Primary CTA** in the facts top toolbar; move Sort, Group, Collapse Similar, Show Selected, Clean duplicates, Show suppressed, and Views into the existing Facts Controls sheet. No visual redesign, no new features, no backend changes.

## Context

- **Owner:** `apps/web/src/app/project/[id]/page.tsx` — facts toolbar lives in the main project page when `scopeType !== "DOMAIN"` (URL/Domain scope or overview with facts).
- **Sheet:** `apps/web/src/components/FactsControlsSheet.tsx` — already contains Sort, Group, Collapse duplicates, Show suppressed, Selected only, Views, Clean duplicates. Same state is passed from the page; no new props needed.
- **State:** All toolbar/sheet controls use existing React state and URL/prefs in `page.tsx` (e.g. `sortBy`, `groupBySource`, `collapseSimilar`, `showOnlySelected`, `showSuppressed`, `viewsOpen`). No state moves; only **where the controls are rendered** changes.

---

## 1) Controls in toolbar (before)

Facts toolbar is the row inside the main canvas when not in DOMAIN overview (`scopeType !== "DOMAIN"`). Two layouts today:

| Viewport | Left block | Right block (md+) |
|----------|-------------|-------------------|
| **&lt; md** | Tabs (Key/All/Pinned), Search input, **Controls** button (opens sheet) | — |
| **≥ md** | Tabs, (Search in right block) | Search input, **Group 3:** Sort dropdown, "Sort affects list" label, Group dropdown, Collapse duplicates checkbox, ViewsPanel, Selected only checkbox, Clean duplicates button, Show suppressed checkbox |

Additional elements in the **same flex row** (both viewports):

- **Needs Review** badge (when `counts.needsReview > 0`)
- **Review Queue** button (when `counts.reviewQueue > 0`) — **Primary CTA** for this toolbar

So the full list of controls currently in the toolbar (before) is:

1. **Tabs** (Key Claims / All Data / Pinned) — keep  
2. **Search** input — keep  
3. **Filters/Controls** button (opens Facts Controls sheet) — keep; today only on &lt; md  
4. **Needs Review** badge (conditional) — keep (informational)  
5. **Review Queue** button (conditional) — keep as **Primary CTA**  
6. **Sort** dropdown — move to sheet (already in sheet)  
7. **“Sort affects list”** text — remove from toolbar (optional: keep inside sheet near Sort)  
8. **Group** dropdown — move to sheet (already in sheet)  
9. **Collapse duplicates** checkbox — move to sheet (already in sheet)  
10. **ViewsPanel** (saved views) — move to sheet (already in sheet)  
11. **Selected only** checkbox — move to sheet (already in sheet)  
12. **Clean duplicates** button — move to sheet (already in sheet)  
13. **Show suppressed** checkbox — move to sheet (already in sheet)  

---

## 2) Proposed Filters sheet layout (after)

**No change to sheet content.** `FactsControlsSheet` already has the target layout:

- **Sort & Group:** Sort select, Group select, Collapse duplicates checkbox  
- **Filters:** Show suppressed checkbox, Clean duplicates button  
- **Selection:** Selected only checkbox, Views (ViewsPanel)  

After consolidation, the **toolbar** will no longer render Sort/Group/Collapse/Views/Selected only/Clean duplicates/Show suppressed; the **only** way to change them is via the Filters sheet. Sheet layout stays as-is.

---

## 3) State wiring plan (what moves where)

- **State stays in `page.tsx`:** `sortBy`, `setSortBy`, `groupBySource`, `setGroupBySource`, `collapseSimilar`, `setCollapseSimilar`, `showOnlySelected`, `setShowOnlySelected`, `showSuppressed`, `setShowSuppressed`, `viewsOpen`, `setViewsOpen`, URL sync, preferences, and `FactsControlsSheet` props are unchanged.
- **Change:** In `page.tsx`, for the facts toolbar row:
  - **&lt; md:** Leave as-is (Tabs, Search, Controls button). Optional: rename "Controls" to "Filters" for consistency.
  - **≥ md:** Remove the entire "Group 3" block (Sort, Group, Collapse, ViewsPanel, Selected only, Clean duplicates, Show suppressed). Add a **Filters** button (same as &lt; md: opens sheet via `setFactsControlsOpen(true)`), so both viewports show: **Tabs | Search | Filters button | [Needs Review badge] | [Review Queue button]**.
- **Filter chips row** (below toolbar): Unchanged; still shows active filters and clears (e.g. Selected only, Duplicates hidden, etc.) with same handlers.
- **FactsControlsSheet:** No code changes; same props and behavior.

---

## 4) Tests impacted + plan

| Spec / helper | Current behavior | Change |
|---------------|------------------|--------|
| **view-state-refactor.spec.ts** | Clicks `facts-sort-trigger`, `facts-group-trigger`, `facts-selected-only-toggle` in toolbar (md+). | Open sheet first: `ensureFactsControlsOpen(page)` (or `facts-controls-open` click), then interact with same testids inside sheet. |
| **view-link.spec.ts** | Clicks sort/group in toolbar; expects sort/group trigger text in toolbar. | Open sheet, set sort/group in sheet. Assert URL/state; optionally assert sheet content (sort/group labels in sheet) instead of toolbar. |
| **preferences-persist.spec.ts** | Sets sort, group, selected-only via toolbar. | Open sheet, then set sort, group, selected-only in sheet. After reload, open sheet and assert state in sheet. |
| **saved-views.spec.ts** | Uses sort/group triggers in toolbar. | Open sheet before sort/group interactions. |
| **canary.spec.ts** | Clicks `facts-sort-trigger` in toolbar. | Open sheet, then click sort in sheet. |
| **facts-group-sort.spec.ts** | Uses sort/group triggers and expects sections. | Open sheet, then use sort/group in sheet. |
| **facts-dedup.spec.ts** | Uses `facts-show-suppressed-toggle` (toolbar or sheet). | Always open sheet first, then toggle in sheet. |
| **selected-only.spec.ts** | Toggles `facts-selected-only-toggle`. | Open sheet, then toggle in sheet. |
| **collapse-similar.spec.ts** | Uses `toggle-collapse-similar`. | Open sheet, then toggle in sheet. |
| **similar-drawer-selection.spec.ts** | Uses `toggle-collapse-similar`. | Open sheet, then toggle in sheet. |
| **helpers/nav.ts** (`resetFactsViewState`, `toggleCollapseOn`, `groupBySource`) | Opens sheet only when toggle/trigger not visible (&lt; md). | **Always** open sheet first when needing to change sort/group/collapse/selected/suppressed (e.g. call `facts-controls-open` click at start of reset, then interact with controls in sheet). |
| **helpers/ui.ts** (`ensureFactsControlsOpen`) | Clicks `facts-controls-open` if visible. | Keep; use in all specs that need to interact with sort/group/collapse/selected/suppressed so sheet is open before those interactions. |
| **responsive-layout.spec.ts** | Asserts Controls button visible and sheet opens. | Still valid; on md+ the Filters button will now always be present, so test may be updated to assert Filters button on all viewports if desired. |

**Strategy:** Centralize “open sheet then use control” in helpers (e.g. `resetFactsViewState` and `groupBySource` always open sheet first). Specs that today assume sort/group/collapse/selected/suppressed are in the toolbar should call `ensureFactsControlsOpen(page)` (or equivalent) before using those testids. No new testids; sheet already uses same testids (`facts-sort-trigger`, `facts-group-trigger`, `toggle-collapse-similar`, `facts-selected-only-toggle`, `facts-show-suppressed-toggle`, `facts-dedup-trigger`).

---

## Files to touch (implementation)

| File | Change |
|------|--------|
| `apps/web/src/app/project/[id]/page.tsx` | (1) For `isMd`, remove Group 3 block (Sort, Group, Collapse, ViewsPanel, Selected only, Clean duplicates, Show suppressed). (2) For `isMd`, add Filters button (same as &lt; md: `data-testid="facts-controls-open"`, `SlidersHorizontal`, opens sheet). (3) Optionally rename "Controls" to "Filters" for &lt; md. |
| `apps/web/src/components/FactsControlsSheet.tsx` | No change. |
| `apps/web/tests/e2e/helpers/nav.ts` | In `resetFactsViewState`, `toggleCollapseOn`, `groupBySource`: always open sheet first (click `facts-controls-open`) when needing to interact with controls that are now only in the sheet. |
| `apps/web/tests/e2e/view-state-refactor.spec.ts` | Before any sort/group/selected-only interaction, ensure sheet is open (e.g. `ensureFactsControlsOpen`). |
| `apps/web/tests/e2e/view-link.spec.ts` | Open sheet, then set sort/group in sheet; adjust assertions to sheet or URL. |
| `apps/web/tests/e2e/preferences-persist.spec.ts` | Open sheet, then set sort/group/selected-only in sheet. |
| `apps/web/tests/e2e/saved-views.spec.ts` | Open sheet before sort/group. |
| `apps/web/tests/e2e/canary.spec.ts` | Open sheet before sort. |
| `apps/web/tests/e2e/facts-group-sort.spec.ts` | Open sheet before sort/group. |
| `apps/web/tests/e2e/facts-dedup.spec.ts` | Open sheet before show-suppressed. |
| `apps/web/tests/e2e/selected-only.spec.ts` | Open sheet before selected-only toggle. |
| `apps/web/tests/e2e/collapse-similar.spec.ts` | Open sheet before collapse toggle. |
| `apps/web/tests/e2e/similar-drawer-selection.spec.ts` | Open sheet before collapse toggle. |

**Diff budget:** Target &lt; 250 LOC, ≤ 6 files. If the list above exceeds that, do the **page.tsx** change first (toolbar consolidation) and run existing E2E; then fix failing specs in a follow-up (helpers + 1–2 highest-impact specs first).

---

## Acceptance criteria

- Top facts toolbar contains only: **Tabs**, **Search**, **Filters** (sheet trigger), **Needs Review** badge (when applicable), **Review Queue** button (Primary CTA when applicable).
- Sort, Group, Collapse Similar, Show Selected, Show suppressed, Clean duplicates, and Views are **only** in the Filters sheet and still work (same state and behavior).
- Existing E2E suite green after minimal spec/helper updates (open sheet before interacting with moved controls).
- `npm run lint` and `npm run typecheck` pass in `apps/web`.
- Playwright E2E pass (same command as CI/release gate).

---

## Links

- [[features/]]
- [[testing/e2e/]]
- [[testing/e2e/PRE_MERGE_CHECKLIST]]
