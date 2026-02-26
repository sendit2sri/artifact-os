# Graph View (TicNote V1) – Plan

## Summary

Add a read-only **Graph** tab that visualizes fact clusters (similarity groups) as nodes, and lets users click a node to focus/filter the facts list. No new backend; reuse existing grouping (and optionally topic clustering) and existing filter/list pipeline.

## Context

- **Cluster/group data today:**
  - **Similarity groups:** From `fetchProjectFacts(projectId, { ..., group_similar: 1 })` → `FactsGroupedResponse`: `items: Fact[]`, `groups: Record<string, { collapsed_ids: string[]; collapsed_count: number }>`. Used when “Collapse similar” is on; `factsGroups` is derived in `page.tsx` (line ~533) from `factsRaw`. Facts have `group_id` and `collapsed_count` on representative facts.
  - **Topic clusters:** From `analyzeFacts(projectId, payload)` in `SynthesisBuilder` only (when user selects facts and opens the sheet). Returns `{ clusters: { label: string; fact_ids: string[] }[] }`. Not project-wide unless we call analyze with current visible facts when entering Graph.

- **View state:** Project page uses `viewMode: "key" | "all" | "pinned"` (tabs: Key Claims, All Data, Pinned). State lives in `apps/web/src/app/project/[id]/page.tsx` (useState + URL sync via `parseViewStateFromUrl` / `buildUrlFromViewState`). `visibleFacts` = `scopedFacts` filtered by `searchQuery`, `showOnlySelected`, and (to add) graph selection.

- **Facts list:** Rendered in the same page (~2229): `data-testid="facts-list"`, iterating `visibleFacts` (flat or by `visibleFactsGroupedBySource`). Evidence panel uses `visibleFacts` and `factMap` for prev/next.

- **Dependencies:** `reactflow` is already in `apps/web/package.json` (^11.10.0); no new dependency.

---

## 1) Where cluster data comes from today

| Source | Location | Shape | When available |
|--------|----------|--------|-----------------|
| **Similarity groups** | `fetchProjectFacts` with `group_similar: 1` → `factsRaw` → `factsGroups` | `Record<groupId, { collapsed_ids, collapsed_count }>`; rep facts in `facts` have `group_id`, `collapsed_count` | When `collapseSimilar` is true **or** (proposed) when `viewMode === "graph"` |
| **Topic clusters** | `analyzeFacts(projectId, facts)` in `SynthesisBuilder.tsx` | `{ clusters: { label: string; fact_ids: string[] }[] }` | Only when sheet is open with selected facts |

**V1 recommendation:** Use **similarity groups** as the graph data source so no extra backend or analyze call is required. When user selects the Graph tab, request facts with `group_similar: 1` so `factsGroups` is populated. Optionally in a later slice, add a “Topic clusters” mode that calls `analyzeFacts` with visible facts when entering Graph.

---

## 2) Proposed Graph UI structure (route/component)

- **Route:** No new route. Add a fourth tab on the existing project page: **Graph** alongside Key Claims, All Data, Pinned.
- **Placement:** Same URL as project page; `viewMode` extended to `"key" | "all" | "pinned" | "graph"` (and reflected in URL as `view=graph`).
- **Layout when Graph is selected:**
  - Top (or main area): read-only **FactsGraphView** (React Flow) showing one node per similarity group (and optionally one node per “orphan” fact not in any group, or omit orphans for V1).
  - Below (or beside): same **facts list** as today, but when a node is selected, filter to that group’s `collapsed_ids` (see click-to-focus below).
- **Components:**
  - **`FactsGraphView`** (new): `apps/web/src/components/FactsGraphView.tsx`
    - Props: `groups: Record<string, { collapsed_ids: string[]; collapsed_count: number }>`, `facts: Fact[]` (for rep fact labels), `selectedGroupId: string | null`, `onNodeClick: (groupId: string) => void`, `onClearSelection: () => void`.
    - Uses React Flow: nodes only (no edges for V1). Node id = group id; label = truncated rep fact text or “Group of N”. Read-only (no drag/drop). Optional “Clear filter” when `selectedGroupId` is set.
  - **Page changes:** In `apps/web/src/app/project/[id]/page.tsx`:
    - Extend `viewMode` type and URL parsing/building to include `"graph"`.
    - When `viewMode === "graph"`, include `group_similar: 1` (and current `min_sim`) in `factsFilter` so the existing facts query returns `FactsGroupedResponse` with `groups`.
    - Add state: `graphSelectedGroupId: string | null` (or `graphSelectedFactIds: Set<string> | null`). When user switches away from Graph, clear it (or leave it for next visit; V1 can clear on tab switch).
    - Render: if `viewMode === "graph"`, render `FactsGraphView` above the existing list; pass `factsGroups`, `facts`, `graphSelectedGroupId`, `onNodeClick` (set `graphSelectedGroupId` and optionally scroll list into view), `onClearSelection` (clear `graphSelectedGroupId`).
- **Saved views:** Extend `ViewMode` in `apps/web/src/lib/savedViews.ts` to include `"graph"` so saved views can store and restore the Graph tab.

---

## 3) Click-to-focus wiring plan

- **State:** `graphSelectedGroupId: string | null` (or equivalently `graphSelectedFactIds: Set<string> | null` derived from `factsGroups[graphSelectedGroupId]?.collapsed_ids`).
- **On node click:** In `FactsGraphView`, React Flow `onNodeClick` → call `onNodeClick(groupId)`. Parent sets `graphSelectedGroupId` to that `groupId` (and optionally scrolls the facts list into view).
- **Filtering the list:** In the `visibleFacts` useMemo, add: if `viewMode === "graph"` and `graphSelectedGroupId != null` and `factsGroups[graphSelectedGroupId]` exists, then restrict `list` to fact ids in `factsGroups[graphSelectedGroupId].collapsed_ids` (after current filters). So: `list = list.filter(f => factsGroups[graphSelectedGroupId].collapsed_ids.includes(f.id))`. Ensure this runs after `scopedFacts` and search/selection filters so we only restrict to the graph selection.
- **Clear:** “Clear filter” in the graph (or when switching back to list-only view) sets `graphSelectedGroupId` to `null`, so `visibleFacts` returns to normal.
- **Evidence panel:** No change; it already uses `visibleFacts` and `factMap`, so when the list is filtered by graph selection, prev/next stay within the focused set.

---

## 4) Test plan

- **Unit / integration:** Not strictly required for V1 if scope is tight; optional: shallow render of `FactsGraphView` with mock groups and assert node count and click callback.
- **E2E (minimal smoke):**
  - **File:** `apps/web/tests/e2e/graph-view.spec.ts` (or add to an existing view-state spec).
  - **Steps:** (1) Go to project with enough facts that similarity grouping returns at least one group (e.g. use seed that has similar facts; or enable “Collapse similar” and then switch to Graph so groups exist). (2) Switch to Graph tab (`view=graph` or click Graph tab). (3) Assert graph is visible (e.g. a node or container with `data-testid="facts-graph"`). (4) Click a node; assert facts list updates (e.g. only facts from that group shown, or count matches). (5) Clear selection; assert list shows all again. (6) Switch to “All Data” and back to Graph; assert no regression.
- **Commands:**  
  `cd apps/web && npm run lint`  
  `cd apps/web && npm run typecheck`  
  `cd apps/web && npx playwright test --project=chromium` (or project’s CI command).

---

## Files to touch (within budget)

| File | Change |
|------|--------|
| `apps/web/src/app/project/[id]/page.tsx` | Add viewMode `"graph"`, URL parse/build, `factsFilter` when graph, `graphSelectedGroupId` state, `visibleFacts` filter by graph selection, render Graph tab + `FactsGraphView`. |
| `apps/web/src/components/FactsGraphView.tsx` | New: React Flow graph from `groups` + `facts`, read-only nodes, click → `onNodeClick`, clear button. |
| `apps/web/src/lib/savedViews.ts` | Extend `ViewMode` to include `"graph"`. |
| `apps/web/tests/e2e/graph-view.spec.ts` | New (or add to view-state spec): smoke test for Graph tab and click-to-focus. |

**Optional:** `docs/_index.md` – add link to this plan.

**Diff budget:** Aim &lt; 300 LOC, ≤ 8 files. If over: ship V1 with clusters-only (no edges) and no “orphan” nodes to keep the graph component small.

---

## Links

- [[architecture/backend-api]] (if exists)
- [[solutions/runbooks]] (if exists)
- [[_index]]
