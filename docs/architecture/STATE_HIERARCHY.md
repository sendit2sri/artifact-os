# View State Priority Rules

## Goal
Make view state predictable and shareable. Prevent URL/localStorage/server defaults from fighting.

## Definitions
**Shareable state (URL canonical):**
- sort, group, review_status, scope, searchQuery, viewMode

**Preferences (non-shareable defaults):**
- default sort/group, density, theme, last-used view

**Ephemeral UI state:**
- drawers, sheets, modals, selections

## Canonical Source of Truth
### 1) URL (wins if present)
If a param exists in URL, it is the truth for that key.

### 2) Server preferences (fallback)
If URL param is missing, use server preferences.

### 3) LocalStorage (temporary migration fallback only)
Used only to migrate older clients → server prefs.
- Read once on boot
- If present and valid: POST to server prefs, then delete localStorage key

### 4) Hardcoded default (last resort)
Used only when neither URL nor prefs exists.

## Prohibited Patterns
- Reading localStorage on every render
- Two-way syncing URL <-> state without a single orchestrator
- Multiple `useEffect` blocks writing to the same state key

## Required Implementation Pattern
All view state must go through:
- `useViewState()` hook
- `setViewState()` writes URL (shareable) and optionally writes server prefs (preference)
- UI components consume only derived state from hook

## Critical Implementation Bugs to Avoid

### 🔥 Bug: prefsHydratedRef locks before prefs load
**Problem**: React Query renders with `data === undefined` initially. If you use `const { data: serverPrefs = {} }`, the effect runs with empty object, sets `prefsHydratedRef.current = true`, and never applies real preferences when they arrive.

**Fix**: Use query flags to gate hydration
```typescript
const prefsQuery = useQuery({
  queryKey: ["preferences", workspaceId, projectId],
  queryFn: () => fetchPreferences(workspaceId, projectId),
  enabled: Boolean(workspaceId && projectId),
});

const serverPrefs = prefsQuery.data;

useEffect(() => {
  if (!urlHydratedRef.current) return;
  if (!prefsQuery.isSuccess) return;  // ✅ wait for real data
  if (prefsHydratedRef.current) return;
  
  prefsHydratedRef.current = true;
  // ...apply prefs
}, [prefsQuery.isSuccess, serverPrefs, sp]);
```

### Other Critical Bugs
1. **useMemo with empty deps []**: Will freeze initial state across navigations. Use `[sp]` dependency.
2. **group=off in URL**: Prevents prefs from applying. Only write `group=source` when true.
3. **String URL comparison**: Fragile due to param order. Compare `URLSearchParams.toString()`.
4. **Hydration timing**: Set `isHydratingRef.current = false` inside URL sync effect, not separate effect.

## Acceptance Tests
- Navigating to a URL with `?sort=needs_review` always results in sort=needs_review in UI
- Clearing URL param falls back to server prefs
- localStorage keys are removed after migration
- **Server prefs apply after query resolves** (catches the prefsHydratedRef bug)