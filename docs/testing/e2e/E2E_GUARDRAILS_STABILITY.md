# E2E Guardrails & Long-Term Stability

## Summary

Critical guardrails implemented to prevent E2E test regression and cross-test state leakage.

**Goal**: Lock in "~6-11 fails" → "0-3 fails" and keep CI green consistently.

---

## Implemented Guardrails ✅

### 1. Seed Verification Response

**Problem**: Seed could silently fail (wrong counts, missing data) leading to cryptic "element not found" errors.

**Solution**: Backend now returns comprehensive verification in seed response:

```json
{
  "facts_count": 12,
  "approved_count": 2,
  "pinned_count": 2,
  "flagged_count": 1,
  "evidence_count": 11,
  "seed_verification": {
    "expected_facts": 12,
    "actual_facts": 12,
    "has_approved": true,
    "has_pinned": true,
    "has_evidence": true
  }
}
```

**Fixture asserts these invariants** before any test runs. Fails fast with clear message if seed is broken.

**File**: `apps/backend/app/api/test_helpers.py` (line ~324-350)

---

### 2. Header-Driven Force Error

**Problem**: Query param routing (`force_error=true`) was fragile - timing issues, intercept order problems.

**Solution**: Backend now accepts `X-E2E-Force-Error: true` header for deterministic error simulation.

**Usage**:
```typescript
// Clean, timing-independent
await page.route(`**/synthesize*`, async (route) => {
  await route.continue({
    headers: {
      ...route.request().headers(),
      'x-e2e-force-error': 'true',
    },
  });
});
```

**Files**:
- Backend: `apps/backend/app/api/projects.py` (synthesize endpoint)
- Tests: `apps/web/tests/e2e/synthesis-flow.spec.ts`

---

### 3. Browser Storage Isolation Helper

**Problem**: Cross-test state leakage via localStorage:
- `artifact_selected_facts_{projectId}`
- `artifact_sort_v1`, `artifact_view_v1`
- `artifact_collapse_similar_v1`
- `artifact_saved_views_v1`

Parallel tests sharing these keys cause random failures.

**Solution**: New setup helper clears storage before each test.

**Usage**:
```typescript
import { setupCleanTestState } from './helpers/setup';

test.beforeEach(async ({ page }) => {
  await setupCleanTestState(page);
  // ... rest of setup
});
```

**File**: `apps/web/tests/e2e/helpers/setup.ts` (new)

---

### 4. Simplified Evidence Navigation

**Problem**: Complex text-change assertions in `nextEvidence()`/`prevEvidence()` caused timeouts at boundaries or during virtualization.

**Solution**: Simplified to just wait for panel visibility after click.

**File**: `apps/web/tests/e2e/helpers/evidence.ts`

---

## Remaining Gaps to Address

### Gap #1: Selector Ambiguity in Kitchen Sink Seed ⚠️ HIGH PRIORITY

**Problem**: With "everything" seeded, selectors become ambiguous:
```typescript
// BAD: Which approved fact? (we have 2+)
page.getByTestId('fact-card').first()

// BAD: Sort/filter changes which one is "first"
```

**Solution Needed**: Add stable test anchors to seeded facts

**Proposal A**: Data-testid per seeded fact type
```python
# In seed endpoint
fact1 = ResearchNode(
    fact_text="...",
    review_status=ReviewStatus.APPROVED,
    metadata_json={"e2e_anchor": "seed-fact-approved-1"}  # NEW
)
```

```typescript
// In test
await page.getByTestId('fact-card').filter({ has: page.getByText('[E2E:APPROVED-1]') })
```

**Proposal B**: Unique text tokens (simpler)
```python
fact_text="[E2E:APPROVED-1] Global temperatures have risen..."
```

**Impact**: Would fix remaining "first card" flakes in:
- `selection-autosave`
- `undo-action`
- `fact-status-actions`

**Effort**: Low (1-2 hour backend + test helper change)

---

### Gap #2: Evidence Navigation with Virtualization ⚠️ MEDIUM PRIORITY

**Problem**: Evidence panel Prev/Next uses "current visible cards" index, which breaks when:
- Virtualized list doesn't have all cards mounted
- Status update causes re-filter mid-navigation
- Closing/opening resets index

**Current Failures**:
- `evidence-inspector` - Prev/Next boundary tests
- `evidence-panel` - Navigation regression tests
- `panels-pin` - Pin + navigate combo

**Solution Needed**: Evidence panel should capture factIds snapshot when opened

**Proposal**:
```typescript
// In EvidencePanel component
const [factIdsSnapshot, setFactIdsSnapshot] = useState<string[]>([]);

useEffect(() => {
  if (isOpen && visibleFacts.length > 0) {
    // Capture stable snapshot of fact IDs when panel opens
    setFactIdsSnapshot(visibleFacts.map(f => f.id));
  }
}, [isOpen, visibleFacts]);

// Navigate using snapshot, not current visible list
const nextFact = () => {
  const currentIndex = factIdsSnapshot.indexOf(currentFactId);
  if (currentIndex < factIdsSnapshot.length - 1) {
    const nextId = factIdsSnapshot[currentIndex + 1];
    setCurrentFactId(nextId);
  }
};
```

**Alternative**: Disable virtualization in E2E mode
```typescript
{process.env.NEXT_PUBLIC_E2E_MODE === 'true' && (
  <FactsList virtualization={false} />
)}
```

**Impact**: Would fix 3-4 evidence navigation tests

**Effort**: Medium (3-4 hours frontend + E2E mode flag)

---

### Gap #3: Import Tests Need Real Evidence Records ⚠️ HIGH PRIORITY

**Problem**: `reddit-import`, `youtube-import`, `source-retry` fail because:
- Seed creates facts but not evidence join records
- Evidence panel expects `ResearchNode.evidence` + `SourceDoc` linkage
- Tests expect specific badges/chips that depend on `source_type`

**Current Behavior**:
```python
# seed_sources creates SourceDoc + ResearchNode
# BUT: evidence panel queries may not find linked records
```

**Solution Needed**: Ensure `seed_sources` creates proper evidence linkage

**Files to Check**:
- `apps/backend/app/api/test_helpers.py` - `seed_sources` endpoint (line ~370-640)
- Evidence API - What exact query does it run?

**Verification**:
```bash
# After seed_sources
curl http://localhost:8000/api/v1/projects/{PROJECT_ID}/facts/{FACT_ID}/evidence

# Should return:
{
  "sources": [...],
  "snippet": "...",
  "source_url": "https://reddit.com/..."
}
```

**Impact**: Would fix 3 import tests

**Effort**: Medium (2-3 hours backend investigation + fix)

---

### Gap #4: Undo Action React Query Race ⚠️ LOW PRIORITY

**Problem**: `undo-action (approve)` fails when UI updates before query invalidation finishes.

**Current Flow**:
```typescript
// 1. Mutation sent
await updateFactStatus(factId, 'APPROVED');

// 2. Optimistic update
queryClient.setQueryData(['facts'], ...);

// 3. Test checks immediately (race!)
await expect(badge).toContainText('Approved');

// 4. Sometimes invalidation hasn't completed yet
```

**Solution Needed**: Wait for network + React Query settlement

**Proposal**:
```typescript
// In helper
export async function waitForStatusUpdate(page: Page, factId: string, expectedStatus: string) {
  // Wait for PATCH request
  await page.waitForResponse(r => 
    r.url().includes(`/facts/${factId}`) && 
    r.request().method() === 'PATCH'
  );
  
  // Wait for badge to update with generous timeout
  await expect(async () => {
    const badge = page.getByTestId(`fact-card[data-fact-id="${factId}"]`)
      .getByTestId('fact-status-badge');
    await expect(badge).toContainText(expectedStatus);
  }).toPass({ timeout: 10_000 });
}
```

**Impact**: Would fix 1 undo test

**Effort**: Low (1-2 hours test helper)

---

### Gap #5: Workspace Switch Pointer Interception ⚠️ LOW PRIORITY

**Problem**: `workspace-switch` times out on dropdown click (60s timeout).

**Possible Causes**:
- Radix portal overlay remains open
- Output drawer z-index intercepts click
- Header pointer-events issue

**Solution Needed**: Deterministic close all overlays before workspace interaction

**Proposal**:
```typescript
export async function openWorkspaceSelector(page: Page) {
  // Close any open overlays/drawers
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  
  // Click trigger
  const trigger = page.getByTestId('workspace-trigger');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  
  // Wait for dropdown
  await expect(page.getByTestId('workspace-dropdown')).toBeVisible();
}
```

**Impact**: Would fix 1 workspace test

**Effort**: Low (1 hour helper)

---

## Stress Testing for Parallel CI

**Command**:
```bash
# Run flaky subset with high parallelism + repeats
npm run test:e2e:ci -- \
  evidence-inspector.spec.ts \
  evidence-panel.spec.ts \
  generate-from-approved.spec.ts \
  selection-autosave.spec.ts \
  undo-action.spec.ts \
  --workers=4 \
  --repeat-each=3
```

**Expected Behavior**:
- All tests pass consistently (9/9 on each iteration)
- No "flaky" annotations needed

**If Tests Flake**:
1. Check terminal for localStorage conflicts
2. Look for "element detached from frame" (virtualization)
3. Check seed verification logs
4. Inspect test artifacts for state leakage patterns

---

## Priority Order for Remaining Fixes

| Priority | Gap | Effort | Impact | ETA |
|----------|-----|--------|--------|-----|
| **P0** | #1 Seed Fact Anchors | Low | Fixes 3-5 tests | 2h |
| **P0** | #3 Import Evidence Records | Medium | Fixes 3 tests | 3h |
| **P1** | #2 Evidence Navigation Snapshot | Medium | Fixes 3-4 tests | 4h |
| **P2** | #4 Undo Action Wait | Low | Fixes 1 test | 2h |
| **P2** | #5 Workspace Overlay | Low | Fixes 1 test | 1h |

**Total Time to 0-3 Failures**: ~12 hours

---

## Long-Term Maintenance Rules

### DO
✅ Always use `setupCleanTestState()` in test.beforeEach  
✅ Assert seed verification after fixture creation  
✅ Use header-driven backend E2E flags (not query params)  
✅ Target facts by anchor, not `.first()`  
✅ Wait for network + React Query settlement after mutations  
✅ Run stress test before merging flaky test fixes  

### DON'T
❌ Rely on localStorage persisting between tests  
❌ Use `.first()` or `.nth(0)` with kitchen sink seed  
❌ Assume virtualized list has all elements mounted  
❌ Check UI immediately after mutation (race)  
❌ Use `page.route()` with complex logic (prefer backend flags)  

---

## CI Pipeline Integration

**Recommended `.github/workflows/e2e.yml`**:
```yaml
- name: Run E2E Tests
  run: |
    npm run test:e2e:ci
  env:
    ARTIFACT_ENABLE_TEST_SEED: true
    ARTIFACT_E2E_MODE: true
    NEXT_PUBLIC_E2E_MODE: true

- name: Stress Test Critical Paths (on PR)
  if: github.event_name == 'pull_request'
  run: |
    npm run test:e2e:ci -- \
      generate-from-approved.spec.ts \
      synthesis-flow.spec.ts \
      evidence-panel.spec.ts \
      --workers=4 \
      --repeat-each=2
```

---

## Links

- [[E2E_STABILIZATION_FEB_2026]] - Initial fixes (85→31 failures)
- [[CI_READY_E2E_IMPROVEMENTS]] - Original CI work
- [[RUN_E2E]] - How to run E2E locally
