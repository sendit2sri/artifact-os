# Application Phase State Machine

**Created**: 2026-02-11  
**Status**: IMPLEMENTED ✅

---

## Summary

A deterministic state machine that tracks the application's current phase based on sources, jobs, and facts. This provides clear, unambiguous UI feedback and enables phase-specific messaging and controls.

---

## Problem Statement

### Before Phase Model
- UI had multiple boolean flags (`isLoading`, `isProcessing`, `hasErrors`)
- Unclear what state the app was in at any given time
- Inconsistent messaging across empty states
- No single source of truth for "what should the user see?"

### After Phase Model
- ✅ Single phase enum tracks application state
- ✅ Deterministic phase computation from data
- ✅ Phase-specific UI messaging and CTAs
- ✅ Clear feedback for users at every stage

---

## Phase Hierarchy

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  EMPTY                                          │
│  No sources added yet                           │
│  CTA: "Add your first source"                   │
│                                                 │
└─────────────────────────────────────────────────┘
                     │
                     ▼ (source added)
┌─────────────────────────────────────────────────┐
│                                                 │
│  INGESTING                                      │
│  Sources added, jobs pending/running            │
│  No facts extracted yet                         │
│  Message: "Processing N sources..."             │
│                                                 │
└─────────────────────────────────────────────────┘
                     │
                     ▼ (first facts extracted)
┌─────────────────────────────────────────────────┐
│                                                 │
│  PROCESSING                                     │
│  Some facts extracted                           │
│  Jobs still running                             │
│  Message: "N facts extracted, M jobs remaining" │
│                                                 │
└─────────────────────────────────────────────────┘
                     │
                     ▼ (all jobs complete)
┌─────────────────────────────────────────────────┐
│                                                 │
│  READY                                          │
│  Facts available, no active work                │
│  CTA: "Generate synthesis"                      │
│                                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                                                 │
│  ERROR                                          │
│  All jobs failed, no facts available            │
│  CTA: "Retry sources"                           │
│  (Can occur at any time)                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Phase Definitions

### 1. EMPTY
**Trigger**: `sourcesCount === 0`

**Characteristics**:
- No sources added to project
- Brand new project state
- Onboarding opportunity

**UI**:
- Show PhaseIndicator with "Ready to start" message
- Primary CTA: "Add your first source"
- Hide facts list, filters, controls

**User Intent**: Get started, add first source

---

### 2. INGESTING
**Trigger**: `hasActiveWork && factsCount === 0`

**Characteristics**:
- Sources added
- Jobs pending or running
- Zero facts extracted yet
- Waiting for LLM/extraction

**UI**:
- Show progress bar (jobs completed / total jobs)
- Message: "Processing N sources..."
- Disable synthesis controls
- Show skeleton loaders

**User Intent**: Wait for extraction to complete

---

### 3. PROCESSING
**Trigger**: `hasActiveWork && factsCount > 0`

**Characteristics**:
- Facts being extracted
- Some facts available already
- Jobs still running
- Mixed state (partial results)

**UI**:
- Show facts list (partial)
- Show progress bar
- Message: "N facts extracted, M jobs remaining"
- Enable filters (on extracted facts)
- Disable synthesis (wait for completion)

**User Intent**: Monitor progress, preview facts

---

### 4. READY
**Trigger**: `factsCount > 0 && !hasActiveWork`

**Characteristics**:
- All jobs complete (or failed)
- Facts available for synthesis
- Stable state for analysis

**UI**:
- Show facts list (full)
- Hide progress indicators
- Enable all controls
- Primary CTA: "Generate synthesis"

**User Intent**: Analyze facts, synthesize, export

**Sub-states**:
- `READY (clean)`: All jobs succeeded
- `READY (with errors)`: Some jobs failed, but facts available

---

### 5. ERROR
**Trigger**: `allJobsFailed && factsCount === 0`

**Characteristics**:
- All sources failed to process
- Zero facts extracted
- Terminal failure state
- Requires user action

**UI**:
- Show error indicator (red)
- Message: "All N sources failed"
- CTA: "Retry sources" or "Add different source"
- Show failed job details

**User Intent**: Diagnose failure, retry, try different sources

---

## Phase Computation Logic

### Implementation

```typescript
// apps/web/src/lib/phase.ts

export function computeAppPhase(
  sources: { status: string }[],
  jobs: { status: string }[],
  facts: unknown[]
): PhaseState {
  const sourcesCount = sources.length;
  const factsCount = facts.length;
  
  const pendingJobs = jobs.filter(j => j.status === "PENDING").length;
  const runningJobs = jobs.filter(j => j.status === "RUNNING").length;
  const completedJobs = jobs.filter(j => j.status === "COMPLETED").length;
  const failedJobs = jobs.filter(j => j.status === "FAILED").length;
  
  const hasActiveWork = pendingJobs > 0 || runningJobs > 0;
  const allJobsFailed = jobs.length > 0 && failedJobs === jobs.length;

  // Phase determination (priority order)
  
  if (sourcesCount === 0) return { phase: "EMPTY", details };
  
  if (allJobsFailed && factsCount === 0) return { phase: "ERROR", details };
  
  if (hasActiveWork && factsCount === 0) return { phase: "INGESTING", details };
  
  if (hasActiveWork && factsCount > 0) return { phase: "PROCESSING", details };
  
  if (factsCount > 0 && !hasActiveWork) return { phase: "READY", details };
  
  return { phase: "READY", details }; // Default
}
```

### Priority Rules

1. **EMPTY takes precedence** - If no sources, always EMPTY
2. **ERROR is explicit** - Must have all jobs failed AND no facts
3. **INGESTING before PROCESSING** - Differentiate zero-facts state
4. **READY is default** - When jobs done, regardless of facts count

---

## UI Components

### PhaseIndicator
**File**: `apps/web/src/components/PhaseIndicator.tsx`

**Variants**:

1. **Full** (`variant="full"`)
   - Large icon
   - Title + description
   - For empty states, modals
   - Used when no other content visible

2. **Compact** (`variant="compact"`)
   - Small icon + title
   - Active job count
   - For toolbars, headers
   - Used alongside other content

3. **Badge** (`variant="badge"`)
   - Tiny badge with icon + phase name
   - For diagnostics, debug mode
   - Minimal space usage

**Usage**:
```tsx
import { PhaseIndicator } from "@/components/PhaseIndicator";

<PhaseIndicator phaseState={phaseState} variant="full" />
```

---

### PhaseProgressBar
Shows job completion progress during INGESTING/PROCESSING.

```tsx
import { PhaseProgressBar } from "@/components/PhaseIndicator";

{(phaseState.phase === "INGESTING" || phaseState.phase === "PROCESSING") && (
  <PhaseProgressBar phaseState={phaseState} />
)}
```

---

### PhaseStatusLine
Compact one-liner for toolbars (auto-hides in EMPTY/READY).

```tsx
import { PhaseStatusLine } from "@/components/PhaseIndicator";

<PhaseStatusLine phaseState={phaseState} />
```

---

## Integration Points

### 1. Project Page
**File**: `apps/web/src/app/project/[id]/page.tsx`

**Phase Computation**:
```typescript
const phaseState = useMemo(() => 
  computeAppPhase(
    sources ?? [],
    jobs ?? [],
    facts ?? []
  ),
  [sources, jobs, facts]
);
```

**Empty State**:
```tsx
{visibleFacts.length === 0 && (
  <PhaseIndicator phaseState={phaseState} variant="full" />
)}
```

**Toolbar Status**:
```tsx
{(phaseState.phase === "INGESTING" || phaseState.phase === "PROCESSING") && (
  <PhaseStatusLine phaseState={phaseState} />
)}
```

---

### 2. Action Gating
**File**: `apps/web/src/lib/phase.ts`

```typescript
import { canPerformAction } from "@/lib/phase";

const canSynthesize = canPerformAction(phaseState, "synthesize");
// Returns true only if READY phase with facts

<Button 
  onClick={handleSynthesize}
  disabled={!canSynthesize}
>
  Generate synthesis
</Button>
```

---

### 3. Phase-Specific CTAs
**File**: `apps/web/src/lib/phase.ts`

```typescript
import { getPhaseCTA } from "@/lib/phase";

const phaseCTA = getPhaseCTA(phaseState);

<Button 
  variant={phaseCTA.variant}
  disabled={phaseCTA.disabled}
  onClick={() => handleAction(phaseCTA.action)}
>
  {phaseCTA.label}
</Button>
```

---

## Benefits

### User Experience
1. **Clear Feedback** - Users always know what state the app is in
2. **Appropriate Actions** - CTAs match current phase
3. **Progress Visibility** - Track job progress in real-time
4. **Error Recovery** - Clear path forward when things fail

### Developer Experience
1. **Single Source of Truth** - No more boolean soup
2. **Testable** - Pure function, easy to unit test
3. **Consistent** - Same logic across all components
4. **Extensible** - Easy to add new phases

### Quality Assurance
1. **Deterministic** - Same inputs = same phase
2. **No Race Conditions** - Computed from data, not events
3. **E2E Testable** - `data-phase` attribute on components
4. **Debug Friendly** - Phase badge in diagnostics mode

---

## Testing

### Unit Tests
```typescript
// apps/web/src/lib/phase.test.ts

describe("computeAppPhase", () => {
  it("returns EMPTY when no sources", () => {
    const result = computeAppPhase([], [], []);
    expect(result.phase).toBe("EMPTY");
  });

  it("returns INGESTING when jobs running, no facts", () => {
    const sources = [{ status: "PENDING" }];
    const jobs = [{ status: "RUNNING" }];
    const facts = [];
    const result = computeAppPhase(sources, jobs, facts);
    expect(result.phase).toBe("INGESTING");
  });

  it("returns PROCESSING when jobs running, facts exist", () => {
    const sources = [{ status: "COMPLETED" }];
    const jobs = [{ status: "RUNNING" }, { status: "COMPLETED" }];
    const facts = [{}, {}];
    const result = computeAppPhase(sources, jobs, facts);
    expect(result.phase).toBe("PROCESSING");
  });

  it("returns READY when jobs done, facts exist", () => {
    const sources = [{ status: "COMPLETED" }];
    const jobs = [{ status: "COMPLETED" }];
    const facts = [{}];
    const result = computeAppPhase(sources, jobs, facts);
    expect(result.phase).toBe("READY");
  });

  it("returns ERROR when all jobs failed, no facts", () => {
    const sources = [{ status: "FAILED" }];
    const jobs = [{ status: "FAILED" }];
    const facts = [];
    const result = computeAppPhase(sources, jobs, facts);
    expect(result.phase).toBe("ERROR");
  });
});
```

### E2E Tests
```typescript
// apps/web/tests/e2e/phase-model.spec.ts

test("Phase transitions correctly through lifecycle", async ({ page, projectId }) => {
  await page.goto(`/project/${projectId}`);
  
  // EMPTY phase
  await expect(page.locator('[data-phase="EMPTY"]')).toBeVisible();
  
  // Add source
  await page.click('button:has-text("Add source")');
  await page.fill('input', 'https://example.com');
  await page.click('button:has-text("Add")');
  
  // INGESTING phase
  await expect(page.locator('[data-phase="INGESTING"]')).toBeVisible();
  
  // Wait for some facts
  await page.waitForSelector('[data-testid="fact-card"]');
  
  // PROCESSING phase (facts exist, jobs still running)
  await expect(page.locator('[data-phase="PROCESSING"]')).toBeVisible();
  
  // Wait for completion
  await waitForAppIdle(page);
  
  // READY phase
  await expect(page.locator('[data-phase="READY"]')).toBeVisible();
});
```

---

## Edge Cases

### Mixed Job States
**Scenario**: 2 jobs complete, 1 running, 1 failed

**Phase**: PROCESSING (because `hasActiveWork === true`)

**Behavior**: Show facts from completed jobs, keep progress bar visible

---

### All Jobs Failed, But Facts Exist
**Scenario**: Job 1 failed, Job 2 succeeded with facts

**Phase**: READY (because `factsCount > 0 && !hasActiveWork`)

**Behavior**: Show facts, hide error message (jobs not all failed)

---

### Zero Facts After Completion
**Scenario**: All jobs complete, but extracted 0 facts

**Phase**: READY

**Message**: "Processing complete with issues" + "Try adding different sources"

---

### Rapid Source Addition
**Scenario**: User adds 10 sources quickly

**Phase**: INGESTING → PROCESSING → READY (deterministic)

**Behavior**: Progress bar updates smoothly, no flicker

---

## Future Enhancements

### Potential New Phases
1. **SYNTHESIZING** - When synthesis is running
2. **REVIEWING** - When in review mode with queued facts
3. **EXPORTING** - When exporting large datasets

### Phase History
Track phase transitions for analytics:
```typescript
{
  phases: [
    { phase: "EMPTY", timestamp: "2024-02-11T10:00:00Z" },
    { phase: "INGESTING", timestamp: "2024-02-11T10:01:00Z" },
    { phase: "PROCESSING", timestamp: "2024-02-11T10:02:00Z" },
    { phase: "READY", timestamp: "2024-02-11T10:05:00Z" },
  ],
  totalDuration: 300000, // 5 minutes
}
```

### Phase-Specific Shortcuts
Different keyboard shortcuts available in each phase:
- EMPTY: `Cmd+N` = Add source
- READY: `Cmd+S` = Synthesize
- ERROR: `Cmd+R` = Retry

---

## Migration Path

### Existing Code
Before phase model, code used multiple flags:

```typescript
const isLoading = isLoadingFacts || isLoadingJobs;
const isProcessing = jobs?.some(j => ["PENDING", "RUNNING"].includes(j.status));
const hasErrors = jobs?.some(j => j.status === "FAILED");
const isEmpty = facts?.length === 0;

{isLoading && <Spinner />}
{!isLoading && isEmpty && isProcessing && <Processing />}
{!isLoading && isEmpty && !isProcessing && hasErrors && <Error />}
{!isLoading && isEmpty && !isProcessing && !hasErrors && <Empty />}
{!isLoading && !isEmpty && <FactsList />}
```

### With Phase Model
After phase model, simplified to:

```typescript
const phaseState = computeAppPhase(sources, jobs, facts);

{phaseState.phase === "INGESTING" && <PhaseIndicator variant="full" phaseState={phaseState} />}
{phaseState.phase === "PROCESSING" && <PhaseIndicator variant="full" phaseState={phaseState} />}
{phaseState.phase === "ERROR" && <PhaseIndicator variant="full" phaseState={phaseState} />}
{phaseState.phase === "EMPTY" && <PhaseIndicator variant="full" phaseState={phaseState} />}
{phaseState.phase === "READY" && <FactsList />}
```

---

## Performance

### Computation Cost
- **O(n)** where n = number of jobs
- Runs once per render when sources/jobs/facts change
- Memoized at call site

### Re-render Impact
- Phase changes trigger UI updates
- Intentional (user needs feedback)
- No unnecessary re-renders (memoized)

---

## Accessibility

### Screen Reader Support
Phase indicators use semantic HTML:

```tsx
<div role="status" aria-live="polite" data-phase="PROCESSING">
  <span className="sr-only">Processing 3 sources, 5 facts extracted</span>
  {/* Visual content */}
</div>
```

### Keyboard Navigation
Phase-specific CTAs are keyboard accessible:

```tsx
<Button 
  onClick={handleAction}
  aria-label={phaseCTA.label}
  disabled={phaseCTA.disabled}
>
  {phaseCTA.label}
</Button>
```

---

## References

- **Implementation**: `apps/web/src/lib/phase.ts`
- **Components**: `apps/web/src/components/PhaseIndicator.tsx`
- **Integration**: `apps/web/src/app/project/[id]/page.tsx`
- **Roadmap**: `docs/architecture/UX_POLISH_ROADMAP_FEB_2026.md`

---

## Success Criteria

✅ **Phase computation is deterministic**  
✅ **All UI states map to clear phases**  
✅ **Users understand current state instantly**  
✅ **No "boolean soup" in components**  
✅ **E2E tests can assert on phase**  
✅ **Debug mode shows current phase**

---

**Status**: IMPLEMENTED ✅  
**Next**: Empty-only overlay, Queued watchdog
