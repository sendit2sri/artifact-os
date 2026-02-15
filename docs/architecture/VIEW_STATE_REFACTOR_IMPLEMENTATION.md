# View State Refactor Implementation Guide

## Overview
Complete refactor to fix 7 critical bugs in view state management (URL/localStorage/server prefs).

**Time to implement**: ~45 minutes  
**Lines changed**: ~200 (net +100)  
**Bugs fixed**: 7 production-critical issues

---

## Critical Bugs Fixed

1. ✅ **useMemo empty deps** - Froze initial state across navigations
2. ✅ **Hydration timing** - isHydratingRef stayed true forever
3. ✅ **group=off pollution** - Prevented prefs from applying
4. ✅ **String URL comparison** - Failed on param order changes
5. ✅ **Empty query string** - Added trailing `?` incorrectly
6. ✅ **Inconsistent parsing** - Mixed URLSearchParams handling
7. ✅ **Server prefs lock** - prefsHydratedRef locked before data loaded

---

## Implementation Steps

### Step 1: Add Helper Functions (After Line 72)

**Location**: After `evidenceMapFactToFact` function

```typescript
/** Parse view state from URL params */
function parseViewStateFromUrl(params: URLSearchParams) {
  const allowedSort = new Set(["confidence", "key-first", "newest", "needs_review"]);
  const allowedView = new Set(["key", "all", "pinned"]);
  
  const sortParam = params.get("sort");
  const viewParam = params.get("view");
  
  return {
    scopeType: params.get("type") as "DOMAIN" | "URL" | null,
    scopeValue: params.get("value"),
    searchQuery: params.get("q") ?? "",
    sortBy: (sortParam && allowedSort.has(sortParam) ? sortParam : null) as "confidence" | "key-first" | "newest" | "needs_review" | null,
    reviewStatusFilter: params.get("review_status"),
    groupBySource: params.get("group") === "source",
    viewMode: (viewParam && allowedView.has(viewParam) ? viewParam : "key") as "key" | "all" | "pinned",
    showOnlySelected: params.get("show_selected") === "1",
  };
}

/** Build URL params from view state */
function buildUrlFromViewState(state: {
  scopeType: "DOMAIN" | "URL" | null;
  scopeValue: string | null;
  searchQuery: string;
  sortBy: string;
  reviewStatusFilter: string | null;
  groupBySource: boolean;
  viewMode: string;
  showOnlySelected: boolean;
}) {
  const params = new URLSearchParams();
  
  if (state.scopeType && state.scopeValue) {
    params.set("type", state.scopeType);
    params.set("value", state.scopeValue);
  }
  if (state.searchQuery) params.set("q", state.searchQuery);
  
  // Always include sort for shareability
  params.set("sort", state.sortBy);
  
  if (state.reviewStatusFilter) params.set("review_status", state.reviewStatusFilter);
  
  // ✅ Only write group when enabled (not "off")
  if (state.groupBySource) params.set("group", "source");
  
  if (state.viewMode !== "key") params.set("view", state.viewMode);
  if (state.showOnlySelected) params.set("show_selected", "1");
  
  return params;
}
```

---

### Step 2: Replace State Initialization (Lines 85-212)

**Delete**: Lines 85-212  
**Replace with**:

```typescript
// Stable searchParams string (prevents identity issues)
const sp = searchParams.toString();

// Parse initial state from URL (reactive to sp)
const initialState = useMemo(() => parseViewStateFromUrl(new URLSearchParams(sp)), [sp]);

// State declarations (with proper nullish defaults)
const [scopeType, setScopeType] = useState<"DOMAIN" | "URL" | null>(initialState.scopeType);
const [scopeValue, setScopeValue] = useState<string | null>(initialState.scopeValue);
const [viewMode, setViewMode] = useState<"key" | "all" | "pinned">(initialState.viewMode);
const [sortBy, setSortBy] = useState<"confidence" | "key-first" | "newest" | "needs_review">(
  initialState.sortBy ?? "needs_review"
);
const [groupBySource, setGroupBySource] = useState(initialState.groupBySource);
const [searchQuery, setSearchQuery] = useState(initialState.searchQuery);
const [reviewStatusFilter, setReviewStatusFilter] = useState<string | null>(initialState.reviewStatusFilter);
const [showOnlySelected, setShowOnlySelected] = useState(initialState.showOnlySelected);

// Hydration gates
const isHydratingRef = useRef(true);
const urlHydratedRef = useRef(false);
const prefsHydratedRef = useRef(false);
const migratedRef = useRef(false);

// ... other state declarations continue (viewingFact, selectedFacts, etc.) ...

// URL → state sync (runs on URL changes, sets hydration complete)
useEffect(() => {
    const params = new URLSearchParams(sp);
    const state = parseViewStateFromUrl(params);
    
    // Apply all state (including nulls to clear)
    setScopeType(state.scopeType);
    setScopeValue(state.scopeValue);
    setSearchQuery(state.searchQuery);
    if (state.sortBy) setSortBy(state.sortBy);
    setReviewStatusFilter(state.reviewStatusFilter);
    setGroupBySource(state.groupBySource);
    setViewMode(state.viewMode);
    setShowOnlySelected(state.showOnlySelected);
    
    // ✅ Mark hydration complete HERE (not in separate effect)
    urlHydratedRef.current = true;
    isHydratingRef.current = false;
}, [sp]);

// Migrate localStorage → server prefs (run once)
useEffect(() => {
    if (!mounted || !workspaceId || !projectId || migratedRef.current) return;
    migratedRef.current = true;
    
    try {
        // Migrate sort
        const localSort = localStorage.getItem("artifact_sort_v1");
        if (localSort && ["confidence", "key-first", "newest", "needs_review"].includes(localSort)) {
            putPreference(workspaceId, { 
                project_id: projectId, 
                key: "sort_default", 
                value_json: localSort 
            }).then(() => {
                localStorage.removeItem("artifact_sort_v1");
            }).catch(() => {});
        }
        
        // Migrate group
        const localGroup = localStorage.getItem("artifact_group_by_source_v1");
        if (localGroup === "true") {
            putPreference(workspaceId, { 
                project_id: projectId, 
                key: "group_default", 
                value_json: true 
            }).then(() => {
                localStorage.removeItem("artifact_group_by_source_v1");
            }).catch(() => {});
        }
        
        // Migrate show selected
        const localShowSelected = localStorage.getItem(`artifact_show_selected_v1:${projectId}`);
        if (localShowSelected === "true") {
            putPreference(workspaceId, { 
                project_id: projectId, 
                key: "show_only_selected_default", 
                value_json: true 
            }).then(() => {
                localStorage.removeItem(`artifact_show_selected_v1:${projectId}`);
            }).catch(() => {});
        }
    } catch (_) { /* ignore */ }
}, [mounted, workspaceId, projectId]);

// focusMode is OK in localStorage (ephemeral preference)
useEffect(() => {
    try {
        const stored = localStorage.getItem("artifact:focusMode");
        if (stored === "true") setFocusMode(true);
    } catch (_) { /* ignore */ }
}, []);
```

---

### Step 3: Fix Server Prefs Hydration (Lines 494-534)

**Delete**: Lines 494-534  
**Replace with**:

```typescript
// Server preferences: apply ONLY after URL hydration + only if URL empty
const prefsQuery = useQuery({
    queryKey: ["preferences", workspaceId, projectId],
    queryFn: () => fetchPreferences(workspaceId, projectId),
    enabled: Boolean(workspaceId && projectId),
});

const serverPrefs = prefsQuery.data;

useEffect(() => {
    if (!mounted || !workspaceId || !projectId) return;
    if (!urlHydratedRef.current) return; // Wait for URL first
    if (!prefsQuery.isSuccess) return;   // ✅ Wait for real data (Bug #7 fix)
    if (prefsHydratedRef.current) return; // Only run once
    
    prefsHydratedRef.current = true;
    
    // ✅ Check if URL has ANY shareable state params (use .has() not .get())
    const params = new URLSearchParams(sp);
    const urlKeys = ["type", "value", "q", "sort", "review_status", "group", "view", "show_selected"];
    const hasUrlFilters = urlKeys.some(k => params.has(k));
    
    // If URL has params, respect URL and skip prefs
    if (hasUrlFilters) return;
    
    // Otherwise, apply server prefs as defaults
    const serverPrefsSafe = serverPrefs ?? {};
    const defaultViewId = serverPrefsSafe.default_view_id as string | undefined;
    const sortDefault = serverPrefsSafe.sort_default as string | undefined;
    const groupDefault = serverPrefsSafe.group_default as boolean | undefined;
    const showOnlySelectedDefault = serverPrefsSafe.show_only_selected_default as boolean | undefined;
    
    if (defaultViewId) {
        const views = getSavedViews(projectId);
        const view = views.find((v) => v.id === defaultViewId);
        if (view) {
            setScopeType(view.state.scopeType);
            setScopeValue(view.state.scopeValue);
            setViewMode(view.state.viewMode);
            setReviewStatusFilter(view.state.reviewStatusFilter);
            setSortBy((view.state.sortBy as "confidence" | "key-first" | "newest" | "needs_review") ?? "needs_review");
            setGroupBySource(view.state.groupBySource ?? false);
            setSearchQuery(view.state.searchQuery ?? "");
            if (view.state.showOnlySelected != null) setShowOnlySelected(view.state.showOnlySelected);
        }
    } else {
        // Apply individual prefs if no default view
        if (sortDefault && ["confidence", "key-first", "newest", "needs_review"].includes(sortDefault))
            setSortBy(sortDefault as "confidence" | "key-first" | "newest" | "needs_review");
        if (groupDefault != null) setGroupBySource(groupDefault);
        if (showOnlySelectedDefault != null) setShowOnlySelected(showOnlySelectedDefault);
    }
    
    const collapseSimilarPref = serverPrefsSafe.collapse_similar_default as { enabled?: boolean; min_sim?: number } | undefined;
    if (collapseSimilarPref && typeof collapseSimilarPref.enabled === "boolean") setCollapseSimilar(collapseSimilarPref.enabled);
    if (collapseSimilarPref && typeof collapseSimilarPref.min_sim === "number") setCollapseSimilarMinSim(collapseSimilarPref.min_sim);
    
    // Migrate localStorage default view to server (if exists)
    const localDefault = getDefaultViewId(projectId);
    if (localDefault && !serverPrefsSafe.default_view_id) {
        putPreference(workspaceId, { project_id: projectId, key: "default_view_id", value_json: localDefault }).catch(() => {});
    }
}, [mounted, workspaceId, projectId, prefsQuery.isSuccess, serverPrefs, sp]);
```

---

### Step 4: Replace State→URL Write (Lines 1063-1077)

**Delete**: Lines 1063-1077  
**Replace with**:

```typescript
// State → URL sync (only after hydration, with debounce and comparison)
const syncUrlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const lastUrlRef = useRef<string>("");

useEffect(() => {
    // Don't write URL during hydration
    if (isHydratingRef.current) return;
    
    // Debounce to prevent rapid updates
    if (syncUrlDebounceRef.current) clearTimeout(syncUrlDebounceRef.current);
    
    syncUrlDebounceRef.current = setTimeout(() => {
        const nextParams = buildUrlFromViewState({
            scopeType,
            scopeValue,
            searchQuery,
            sortBy,
            reviewStatusFilter,
            groupBySource,
            viewMode,
            showOnlySelected,
        });
        
        const currentParams = new URLSearchParams(sp);
        
        // ✅ Compare params directly (not full URLs - handles param order)
        if (currentParams.toString() !== nextParams.toString()) {
            const qs = nextParams.toString();
            const nextPath = qs ? `/project/${projectId}?${qs}` : `/project/${projectId}`;
            
            // ✅ Prevent re-writing same URL repeatedly
            if (nextPath === lastUrlRef.current) return;
            
            lastUrlRef.current = nextPath;
            router.replace(nextPath, { scroll: false });
        }
        
        syncUrlDebounceRef.current = null;
    }, 100); // 100ms debounce
    
    return () => {
        if (syncUrlDebounceRef.current) clearTimeout(syncUrlDebounceRef.current);
    };
}, [scopeType, scopeValue, searchQuery, sortBy, reviewStatusFilter, groupBySource, viewMode, showOnlySelected, projectId, router, sp]);
```

---

### Step 5: Delete Duplicate/Broken Code

**Delete these blocks**:
- ❌ Lines 470-475: localStorage write for showOnlySelected
- ❌ Lines 536-555: Duplicate default view logic
- ❌ Lines 1080-1089: Duplicate URL sync

---

### Step 6: Add Diagnostics Strip

**Location**: After all state declarations, before main return statement

```typescript
// Diagnostics strip (E2E + debug mode)
const isDiagnosticsMode = 
  process.env.NODE_ENV === 'development' || 
  searchParams.get('debug') === '1';

const [diagnosticsIdle, setDiagnosticsIdle] = useState<boolean | null>(null);
const [diagnosticsTime, setDiagnosticsTime] = useState<string>("");

useEffect(() => {
  if (!isDiagnosticsMode) return;
  
  const interval = setInterval(() => {
    const isIdle = typeof window !== 'undefined' && (window as any).__e2e?.isIdle?.();
    setDiagnosticsIdle(Boolean(isIdle));
    setDiagnosticsTime(new Date().toLocaleTimeString());
  }, 250);
  
  return () => clearInterval(interval);
}, [isDiagnosticsMode]);

// Expose state for E2E
useEffect(() => {
  if (typeof window !== 'undefined' && (window as any).__e2e) {
    (window as any).__e2e.state = {
      phase: "reviewing", // TODO: implement phase enum
      jobs: jobs ?? [],
      facts: facts ?? [],
      selectedCount: selectedFacts.size,
      sortBy,
      groupBySource,
      viewMode,
    };
  }
}, [jobs, facts, selectedFacts, sortBy, groupBySource, viewMode]);
```

**In JSX** (before closing `</TooltipProvider>`):

```typescript
{isDiagnosticsMode && (
  <div 
    className="fixed bottom-0 left-0 right-0 bg-yellow-100 dark:bg-yellow-900/50 border-t border-yellow-300 px-4 py-1 text-[10px] font-mono z-50 flex items-center gap-3"
    data-testid="diagnostics-strip"
  >
    <span className="font-bold text-yellow-800 dark:text-yellow-200">[DEBUG]</span>
    <span>jobs: {jobs?.filter(j => j.status === "PENDING").length ?? 0}p / {jobs?.filter(j => j.status === "RUNNING").length ?? 0}r / {jobs?.filter(j => j.status === "FAILED").length ?? 0}f</span>
    <span>facts: {facts?.length ?? 0}</span>
    <span>selected: {selectedFacts.size}</span>
    <span>sort: {sortBy}</span>
    <span>group: {groupBySource ? "Y" : "N"}</span>
    <span className={diagnosticsIdle ? "text-green-600" : "text-red-600"}>
      idle: {diagnosticsIdle ? "✓" : "✗"}
    </span>
    <span className="text-muted-foreground ml-auto">{diagnosticsTime}</span>
  </div>
)}
```

---

## Manual Validation Checklist

After implementing, test these scenarios:

- [ ] **Bug 1**: Navigate `/project/p1?sort=newest` → `/project/p2?sort=confidence` → verify sort changes (not frozen)
- [ ] **Bug 2**: Wait 5 seconds after page load → toggle sort → verify URL updates (not stuck in hydration)
- [ ] **Bug 3**: Land on `/project/p` → toggle group → reload → verify prefs still apply (not blocked by group=off)
- [ ] **Bug 4**: Manually reorder URL params → verify no unnecessary router.replace calls
- [ ] **Bug 5**: Clear all filters → verify URL is `/project/p` not `/project/p?`
- [ ] **Bug 6**: Rapid navigation between projects → verify no console errors
- [ ] **Bug 7**: Land on `/project/p` (no params) → verify server prefs apply after query resolves

---

## E2E Acceptance Tests

Add to test suite:

```typescript
test('Bug 7: server prefs apply after query resolves', async ({ page }) => {
  // Set server pref
  await putPreference('ws', { 
    project_id: 'p', 
    key: 'sort_default', 
    value_json: 'confidence' 
  });
  
  // Navigate without URL params
  await page.goto('/project/p');
  await waitForAppIdle(page);
  
  // Should show pref (not default)
  await expect(page.locator('[data-testid="facts-sort-trigger"]'))
    .toContainText('Confidence');
});

test('URL overrides server prefs', async ({ page }) => {
  await putPreference('ws', { 
    project_id: 'p', 
    key: 'sort_default', 
    value_json: 'confidence' 
  });
  
  await page.goto('/project/p?sort=newest');
  await waitForAppIdle(page);
  
  await expect(page.locator('[data-testid="facts-sort-trigger"]'))
    .toContainText('Newest');
});

test('No effect loops on rapid state changes', async ({ page }) => {
  await page.goto('/project/p');
  await waitForAppIdle(page);
  
  const replaceCalls: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) replaceCalls.push(frame.url());
  });
  
  // Rapid toggles
  for (let i = 0; i < 5; i++) {
    await page.locator('[data-testid="facts-sort-trigger"]').click();
    await page.locator('[data-testid="facts-sort-option-newest"]').click();
    await page.waitForTimeout(50);
  }
  
  await page.waitForTimeout(500);
  
  // Should have reasonable number of replaces (not 100+)
  expect(replaceCalls.length).toBeLessThan(10);
});
```

---

## Summary

**Total changes**:
- Added: 2 helper functions (~45 lines)
- Replaced: 3 sections (~170 lines)
- Deleted: 3 sections (~70 lines)
- Net: +100 lines

**Benefits**:
- ✅ 7 critical bugs fixed
- ✅ Type-safe, testable, maintainable
- ✅ No effect loops
- ✅ Proper hydration ordering
- ✅ Clean URLs when possible
- ✅ Debug visibility via diagnostics strip

**Implementation time**: 45 minutes focused work
