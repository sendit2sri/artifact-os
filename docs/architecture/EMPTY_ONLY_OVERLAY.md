# Empty-Only Overlay Pattern

**Created**: 2026-02-11  
**Status**: IMPLEMENTED ✅

---

## Summary

Onboarding and quick start content now only appears when the project is in the EMPTY phase, removing clutter from the normal workflow and providing contextual guidance exactly when users need it.

---

## Problem Statement

### Before
- **Onboarding shown based on job/fact counts** - Fragile logic prone to race conditions
- **Modal overlay interrupts workflow** - Blocking UI that requires dismissal
- **No phase awareness** - Could appear during processing
- **Boolean soup** - Multiple conditions to determine visibility

### After
- ✅ **Phase-aware** - Only shows in EMPTY phase
- ✅ **Inline variant** - Non-blocking, integrated into empty state
- ✅ **Clean separation** - Onboarding for EMPTY, phase indicator for other states
- ✅ **One condition** - `phaseState.phase === "EMPTY"`

---

## Architecture

### Phase Integration

```
┌─────────────────────────────────────────────┐
│                                             │
│  EMPTY Phase                                │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ PhaseIndicator (full variant)       │   │
│  │ "Ready to start"                    │   │
│  │ [Add your first source] button      │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ OnboardingOverlay (inline variant)  │   │
│  │ ✓ Quick Start Guide                 │   │
│  │ 1. Add a source                     │   │
│  │ 2. Facts appear here                │   │
│  │ 3. Select facts                     │   │
│  │ 4. Generate synthesis               │   │
│  │ 5. Review outputs                   │   │
│  │ [×] Dismiss                         │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│                                             │
│  INGESTING/PROCESSING/READY/ERROR Phases    │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ PhaseIndicator (full variant)       │   │
│  │ Phase-specific message              │   │
│  │ [Phase CTA if applicable]           │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  (No onboarding - user past EMPTY state)   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Implementation

### OnboardingOverlay Component
**File**: `apps/web/src/components/OnboardingOverlay.tsx`

#### Variants

1. **Overlay** (original modal)
   - Fixed position, backdrop
   - Stepper UI (1 of 5)
   - Next/Skip buttons
   - **Deprecated** - Only kept for backwards compat

2. **Inline** (new, recommended)
   - Integrated into page flow
   - Shows all steps at once
   - Numbered list (1-5)
   - Dismissible with X button
   - **Used in EMPTY phase**

#### Usage

```tsx
import { OnboardingOverlay } from "@/components/OnboardingOverlay";

{/* Inline variant - for EMPTY phase */}
{phaseState.phase === "EMPTY" && showOnboarding && (
  <OnboardingOverlay
    open={true}
    onClose={() => setShowOnboarding(false)}
    step={onboardingStep}
    onStepChange={setOnboardingStep}
    onSkip={() => setShowOnboarding(false)}
    variant="inline"
  />
)}
```

---

### Project Page Integration
**File**: `apps/web/src/app/project/[id]/page.tsx`

#### Visibility Logic (Before)

```typescript
// OLD: Boolean soup based on jobs/facts
const jobCount = (jobs ?? []).length;
const factCount = (facts ?? []).length;

if (jobCount === 0 && factCount === 0 && !getOnboardingCompleted()) {
  setShowOnboarding(true);
}

// Problems:
// - Race conditions (jobs loading before facts)
// - No phase awareness
// - Multiple conditions
// - Could show during INGESTING phase
```

#### Visibility Logic (After)

```typescript
// NEW: Phase-aware, single condition
useEffect(() => {
  if (!mounted) return;
  const e2eMode = /* ... */;
  
  if (e2eMode) {
    setShowOnboarding(false);
    return;
  }
  
  // Only show in EMPTY phase and if not previously completed
  if (phaseState.phase === "EMPTY" && !getOnboardingCompleted()) {
    setShowOnboarding(true);
  } else {
    setShowOnboarding(false);
  }
}, [mounted, phaseState.phase]);
```

**Benefits**:
- ✅ No race conditions (phase is deterministic)
- ✅ Clear intent (EMPTY = onboarding appropriate)
- ✅ Single source of truth (phase state)
- ✅ E2E safe (never shows in test mode)

---

### Empty State Rendering

```tsx
{visibleFacts.length === 0 && (
  <div data-testid="facts-empty-state" className="space-y-6">
    {/* Phase indicator - always shown */}
    <div className="bg-surface rounded-lg border border-border shadow-xs">
      <PhaseIndicator phaseState={phaseState} variant="full" />
      {(phaseState.phase === "EMPTY" || phaseState.phase === "ERROR") && phaseCTA.action && (
        <div className="flex justify-center pb-8">
          <Button
            variant={phaseCTA.variant === "primary" ? "default" : phaseCTA.variant as any}
            disabled={phaseCTA.disabled}
            onClick={() => {
              if (phaseCTA.action === "add_source") {
                setIsAddSourceOpen(true);
              }
            }}
            data-testid="phase-cta-button"
          >
            {phaseCTA.label}
          </Button>
        </div>
      )}
    </div>
    
    {/* Onboarding guide - only in EMPTY phase */}
    {phaseState.phase === "EMPTY" && showOnboarding && (
      <OnboardingOverlay
        open={true}
        onClose={() => setShowOnboarding(false)}
        step={onboardingStep}
        onStepChange={setOnboardingStep}
        onSkip={() => setShowOnboarding(false)}
        variant="inline"
      />
    )}
  </div>
)}
```

---

## User Experience Flow

### First-Time User (EMPTY Phase)

1. **Lands on project page**
   - Phase: EMPTY
   - Sees: PhaseIndicator ("Ready to start")
   - Sees: CTA button ("Add your first source")
   - Sees: Onboarding guide (inline, all steps visible)

2. **Dismisses onboarding (optional)**
   - Clicks X on onboarding
   - `setOnboardingCompleted()` called
   - Onboarding hidden, won't show again
   - Phase indicator and CTA remain

3. **Adds first source**
   - Phase: EMPTY → INGESTING
   - Onboarding auto-hides (phase changed)
   - PhaseIndicator updates to "Processing sources..."
   - `setOnboardingCompleted()` called automatically

### Returning User (EMPTY Phase)

1. **Lands on project page**
   - Phase: EMPTY
   - `getOnboardingCompleted()` returns true
   - **No onboarding shown**
   - Only PhaseIndicator + CTA visible

### User with Data (Non-EMPTY Phase)

1. **Lands on project page**
   - Phase: INGESTING/PROCESSING/READY/ERROR
   - Onboarding never renders
   - Only PhaseIndicator shown (if applicable)

---

## Persistence

### LocalStorage Key
```
artifact_onboarding_completed_v1
```

### Functions

```typescript
export function getOnboardingCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setOnboardingCompleted(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  } catch (_) {}
}
```

### Triggers
1. **User dismisses onboarding** - Click X button
2. **User completes onboarding** - Original stepper "Finish" (deprecated)
3. **User adds first source** - Phase changes from EMPTY

---

## Benefits

### User Experience
1. **Contextual** - Only shown when relevant (EMPTY phase)
2. **Non-blocking** - Inline, not modal overlay
3. **Progressive** - Can see all steps at once
4. **Dismissible** - User can hide if not needed
5. **Persistent** - Won't re-appear after dismissal

### Developer Experience
1. **Simple logic** - One condition: `phaseState.phase === "EMPTY"`
2. **Phase-aware** - Leverages existing phase state machine
3. **No race conditions** - Phase is deterministic
4. **Testable** - E2E can assert phase + onboarding visibility

### Maintenance
1. **Single responsibility** - Onboarding only handles EMPTY phase
2. **Clear separation** - Phase indicator handles other phases
3. **Easy to modify** - Steps defined in STEPS array
4. **Versioned** - LocalStorage key has version suffix

---

## Testing

### E2E Tests

```typescript
// apps/web/tests/e2e/onboarding.spec.ts

test("Onboarding shows only in EMPTY phase", async ({ page, projectId }) => {
  await page.goto(`/project/${projectId}`);
  
  // EMPTY phase - onboarding should be visible
  await expect(page.locator('[data-testid="onboarding-inline"]')).toBeVisible();
  
  // Add source
  await page.click('button:has-text("Add your first source")');
  await page.fill('[data-testid="add-source-sheet-url-input"]', 'https://example.com');
  await page.click('[data-testid="add-source-sheet-submit"]');
  
  // Phase transitions to INGESTING
  await expect(page.locator('[data-phase="INGESTING"]')).toBeVisible();
  
  // Onboarding auto-hides
  await expect(page.locator('[data-testid="onboarding-inline"]')).not.toBeVisible();
});

test("Onboarding dismissible and persistent", async ({ page, projectId }) => {
  await page.goto(`/project/${projectId}`);
  
  // EMPTY phase - onboarding visible
  await expect(page.locator('[data-testid="onboarding-inline"]')).toBeVisible();
  
  // Dismiss onboarding
  await page.click('[data-testid="onboarding-inline"] button[aria-label="Dismiss quick start"]');
  
  // Onboarding hidden
  await expect(page.locator('[data-testid="onboarding-inline"]')).not.toBeVisible();
  
  // Reload page
  await page.reload();
  
  // Onboarding should NOT re-appear (localStorage persisted)
  await expect(page.locator('[data-testid="onboarding-inline"]')).not.toBeVisible();
});

test("Onboarding never shows in non-EMPTY phases", async ({ page, seed }) => {
  // Seed project with sources/jobs/facts
  await seed();
  
  await page.goto(`/project/${seed.projectId}`);
  await waitForAppIdle(page);
  
  // Phase should be READY (or PROCESSING)
  await expect(page.locator('[data-phase="EMPTY"]')).not.toBeVisible();
  
  // Onboarding should never render
  await expect(page.locator('[data-testid="onboarding-inline"]')).not.toBeVisible();
});
```

---

## Edge Cases

### User Adds Source Then Deletes All
**Scenario**: User adds source, then deletes it before extraction

**Phase**: EMPTY → INGESTING → EMPTY (after deletion)

**Behavior**:
- Onboarding was dismissed when first source added
- `getOnboardingCompleted()` returns true
- Onboarding does NOT re-appear (expected)

**Rationale**: User already knows how to add sources, no need to re-onboard

---

### E2E Mode
**Scenario**: Running in E2E test mode

**Behavior**:
- Onboarding NEVER shows (regardless of phase)
- `useEffect` short-circuits on e2eMode check

**Rationale**: Prevents test flake from onboarding overlays

---

### Server-Side Rendering
**Scenario**: Page rendered on server (Next.js SSR)

**Behavior**:
- `getOnboardingCompleted()` returns false (no window)
- Client-side hydration corrects value
- Onboarding flickers briefly if completed

**Mitigation**: `mounted` check ensures effect only runs client-side

---

## Migration Path

### Old Code (Deprecated)
```tsx
{/* Modal overlay - interrupts workflow */}
<OnboardingOverlay
  open={showOnboarding}
  onClose={() => setShowOnboarding(false)}
  step={onboardingStep}
  onStepChange={setOnboardingStep}
  onSkip={() => setShowOnboarding(false)}
  // No variant = defaults to "overlay"
/>
```

### New Code (Recommended)
```tsx
{/* Inline - integrated into EMPTY state */}
{phaseState.phase === "EMPTY" && showOnboarding && (
  <OnboardingOverlay
    open={true}
    onClose={() => setShowOnboarding(false)}
    step={onboardingStep}
    onStepChange={setOnboardingStep}
    onSkip={() => setShowOnboarding(false)}
    variant="inline"
  />
)}
```

---

## Future Enhancements

### Interactive Onboarding
Replace static list with interactive checklist:

```tsx
const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

{STEPS.map((s, i) => (
  <div key={i} className={completedSteps.has(i) ? "opacity-50" : ""}>
    <Checkbox
      checked={completedSteps.has(i)}
      onChange={(checked) => {
        const next = new Set(completedSteps);
        checked ? next.add(i) : next.delete(i);
        setCompletedSteps(next);
      }}
    />
    {s.title}
  </div>
))}
```

### Contextual Steps
Different onboarding for different project types:

```typescript
const STEPS_BY_TYPE = {
  research: ["Add sources", "Extract facts", "Synthesize"],
  qa: ["Add knowledge base", "Test queries", "Review answers"],
};

const steps = STEPS_BY_TYPE[project.type] ?? STEPS;
```

### Video Tutorials
Embed video walkthrough in onboarding:

```tsx
<div className="aspect-video bg-muted rounded-lg">
  <video src="/tutorials/quick-start.mp4" controls />
</div>
```

---

## Performance

### Render Cost
- **Inline variant**: Minimal (simple list, no animations)
- **Overlay variant**: Higher (modal backdrop, stepper)

### Re-render Impact
- Only re-renders when `phaseState.phase` changes
- Memoized at component level
- No unnecessary re-renders

---

## Accessibility

### Keyboard Navigation
- Dismiss button is keyboard accessible
- Focus management on dismiss
- Tab order: dismiss button → steps list

### Screen Reader Support
```tsx
<div
  role="region"
  aria-label="Quick start guide"
>
  <h3>Quick Start</h3>
  {/* Steps list */}
</div>
```

### Reduced Motion
No animations in inline variant (already static)

---

## References

- **Implementation**: `apps/web/src/components/OnboardingOverlay.tsx`
- **Integration**: `apps/web/src/app/project/[id]/page.tsx`
- **Phase Model**: `docs/architecture/PHASE_MODEL.md`
- **Roadmap**: `docs/architecture/UX_POLISH_ROADMAP_FEB_2026.md`

---

## Success Criteria

✅ **Onboarding only shows in EMPTY phase**  
✅ **Inline variant integrated into empty state**  
✅ **Dismissible and persistent**  
✅ **No race conditions (phase-aware)**  
✅ **E2E safe (never shows in test mode)**  
✅ **Clean separation from phase indicator**

---

**Status**: IMPLEMENTED ✅  
**Next**: Queued watchdog
