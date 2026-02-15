# Queued Watchdog

**Created**: 2026-02-11  
**Status**: IMPLEMENTED ✅

---

## Summary

Automatically detects jobs stuck in PENDING state for too long and provides user feedback with retry options. Prevents silent failures and improves user trust through proactive error detection.

---

## Problem Statement

### Before
- **Silent failures** - Jobs stuck in queue with no user feedback
- **No retry mechanism** - Users had to refresh or re-add sources manually
- **Unclear state** - "Processing..." could mean active or stuck
- **Support burden** - Users filing tickets: "My source isn't processing"

### After
- ✅ **Proactive detection** - Alerts appear automatically after 30s
- ✅ **Actionable feedback** - Clear message + retry button
- ✅ **Soft warnings** - Early notification at 15s (informational)
- ✅ **Troubleshooting links** - Direct link to docs
- ✅ **Auto-retry** - One-click retry without re-adding source

---

## Architecture

### Thresholds

```typescript
// Soft warning (informational)
WARNING_THRESHOLD_MS = 15000  // 15 seconds

// Critical stuck (action required)
STUCK_THRESHOLD_MS = 30000    // 30 seconds
```

### State Machine

```
PENDING (0s)
    ↓
    ↓ (normal processing)
    ↓
RUNNING (usually < 10s)
    ↓
COMPLETED/FAILED

--- OR ---

PENDING (0s)
    ↓
    ↓ (15s elapsed)
    ↓
WARNING ⚠️  "Queued for 15s (taking longer than usual)"
    ↓
    ↓ (30s elapsed)
    ↓
STUCK 🚨  "Queued for 30s+ (stuck)"
[Retry] button + [Troubleshoot] link
```

---

## Implementation

### Core Logic
**File**: `apps/web/src/lib/queuedWatchdog.ts`

```typescript
export function analyzeQueuedJobs(jobs: Job[], now: number = Date.now()) {
  const stuck: StuckJob[] = [];
  const warning: StuckJob[] = [];
  const healthy: Job[] = [];

  for (const job of jobs) {
    if (job.status !== "PENDING") {
      healthy.push(job);
      continue;
    }

    const queuedFor = getJobQueuedTime(job, now);
    
    if (queuedFor > STUCK_THRESHOLD_MS) {
      stuck.push({
        ...job,
        queuedFor,
        isStuck: true,
        message: getStuckMessage(queuedFor),
        action: getRecommendedAction(queuedFor),
      });
    } else if (queuedFor > WARNING_THRESHOLD_MS) {
      warning.push({
        ...job,
        queuedFor,
        isWarning: true,
        message: getWarningMessage(queuedFor),
        action: "wait",
      });
    } else {
      healthy.push(job);
    }
  }

  return { stuck, warning, healthy };
}
```

### UI Component
**File**: `apps/web/src/components/QueuedJobAlert.tsx`

**Features**:
- Auto-updates every second (accurate elapsed time)
- Stuck jobs: Red, critical, with retry button
- Warning jobs: Yellow, informational, no action
- Compact badge variant for toolbars

**Usage**:
```tsx
<QueuedJobAlert
  jobs={jobs}
  onRetry={(jobId) => {
    // Handle retry logic
    retrySource(workspaceId, projectId, sourceUrl);
  }}
/>
```

### Project Page Integration
**File**: `apps/web/src/app/project/[id]/page.tsx`

Alerts appear:
- After phase status line
- Before filter chips
- Only when jobs exist
- Auto-dismiss when job state changes

---

## User Experience

### Normal Flow (Fast Processing)
```
0s:  Source added → PENDING
2s:  Job starts → RUNNING
5s:  Extraction complete → COMPLETED
     
User sees: Progress bar, no alerts
```

### Slow Flow (Warning)
```
0s:  Source added → PENDING
15s: Still PENDING → ⚠️ WARNING SHOWN
     "Queued for 15s (taking longer than usual)"
     
18s: Job starts → RUNNING → WARNING DISMISSED
22s: Extraction complete → COMPLETED

User sees: Brief warning, then normal completion
```

### Stuck Flow (Critical)
```
0s:  Source added → PENDING
15s: Still PENDING → ⚠️ WARNING
30s: Still PENDING → 🚨 STUCK ALERT SHOWN
     "Source stuck in queue - Queued for 30s (stuck)"
     [Retry] button + [Troubleshoot] link
     
User clicks: [Retry]
     → Job cancelled, source re-queued
     → Fresh PENDING job created
     → Alert dismissed, monitoring restarts

OR

User clicks: [Troubleshoot]
     → Opens /docs/troubleshooting#stuck-jobs
     → Explains common causes (rate limiting, server issues)
```

---

## Alert Variants

### 1. Stuck Job (Critical)

**Appearance**:
- Red background (`bg-destructive/10`)
- Alert triangle icon
- Elapsed time badge
- Source URL (truncated)
- Explanation message
- Action buttons (Retry + Troubleshoot)

**Example**:
```
🚨 Source stuck in queue                    30s

https://example.com/article

Queued for 30s (stuck). This may indicate a 
server issue or rate limiting.

[Retry]  [Troubleshoot →]
```

**Test ID**: `stuck-job-${jobId}`

---

### 2. Warning Job (Soft)

**Appearance**:
- Yellow background (`bg-warning/10`)
- Clock icon
- Elapsed time in message
- Source URL (truncated)
- No action buttons (informational only)

**Example**:
```
⏱️  Queued for 15s (taking longer than usual)

https://example.com/article
```

**Test ID**: `warning-job-${jobId}`

---

### 3. Badge Variant (Toolbar)

**Appearance**:
- Compact pill badge
- Count of stuck jobs
- Red color scheme

**Example**:
```
🚨 2 stuck in queue
```

**Usage**:
```tsx
<QueuedJobBadge jobs={jobs} />
```

**Test ID**: `queued-job-badge`

---

## Retry Mechanism

### Flow

1. **User clicks Retry button**
2. **onRetry callback invoked** with `jobId`
3. **Find job by ID** to get `source_url`
4. **Call `retrySource()` API**
   ```typescript
   retrySource(workspaceId, projectId, sourceUrl)
   ```
5. **API cancels old job** (if possible)
6. **API creates new job** with same source
7. **UI refetches jobs** (React Query invalidation)
8. **Alert auto-dismisses** (new job is fresh, not stuck)

### API Endpoint
```
POST /api/workspaces/{workspace_id}/projects/{project_id}/sources/retry
Body: { "source_url": "https://..." }
```

### Error Handling
```typescript
onRetry={(jobId) => {
  const job = jobs.find(j => j.id === jobId);
  if (job?.source_url) {
    retrySource(workspaceId, projectId, job.source_url)
      .then(() => {
        toast.success("Source retry initiated");
      })
      .catch(() => {
        toast.error("Failed to retry source");
      });
  }
}}
```

---

## Timing Details

### Why 30 seconds?

**Research**:
- Typical LLM extraction: 5-15 seconds
- Normal queueing: 0-10 seconds
- 30s = 2x typical max (generous)
- Prevents false positives
- Balances user patience vs. actual issues

### Why 15 seconds for warning?

- Early signal without alarm
- Gives user visibility into slow processing
- Doesn't require action (just FYI)
- Dismissed automatically if job proceeds

### Update Frequency

**1 second intervals**:
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    setNow(Date.now());
  }, 1000);

  return () => clearInterval(interval);
}, []);
```

**Why every second?**:
- Accurate elapsed time display ("30s", "31s", "32s")
- Responsive UI (feels live)
- Low performance cost (simple state update)

---

## Common Causes of Stuck Jobs

### 1. Rate Limiting
**Symptoms**: Multiple sources stuck at same time  
**Solution**: Wait, or retry one at a time  
**Prevention**: Backend queue throttling

### 2. LLM Service Outage
**Symptoms**: All new jobs stuck, old jobs complete  
**Solution**: Wait for service recovery, retry later  
**Prevention**: Healthcheck + circuit breaker

### 3. Network Issues
**Symptoms**: Intermittent stuck jobs  
**Solution**: Retry  
**Prevention**: Retry with exponential backoff

### 4. Worker Crash
**Symptoms**: Jobs stuck indefinitely  
**Solution**: Retry (new worker picks up)  
**Prevention**: Worker health monitoring

### 5. Source Inaccessible
**Symptoms**: Specific source always stuck  
**Solution**: Check source URL validity  
**Prevention**: Pre-validation before queueing

---

## Benefits

### User Trust
- ✅ Proactive feedback (not silent failure)
- ✅ Clear explanation (not mystery)
- ✅ Actionable next steps (not helpless)
- ✅ Self-service retry (not support ticket)

### Support Reduction
- ✅ Fewer "stuck processing" tickets
- ✅ Clear troubleshooting link
- ✅ Users can retry themselves
- ✅ Better error context

### Reliability
- ✅ Early detection of backend issues
- ✅ Graceful degradation (retry instead of fail)
- ✅ User agency (manual intervention)

---

## Testing

### Unit Tests

```typescript
// apps/web/src/lib/queuedWatchdog.test.ts

describe("queuedWatchdog", () => {
  it("detects stuck jobs after 30s", () => {
    const job = {
      id: "1",
      status: "PENDING",
      created_at: new Date(Date.now() - 31000).toISOString(),
    };
    
    expect(isJobStuck(job)).toBe(true);
  });

  it("does not flag recent PENDING jobs", () => {
    const job = {
      id: "1",
      status: "PENDING",
      created_at: new Date(Date.now() - 5000).toISOString(),
    };
    
    expect(isJobStuck(job)).toBe(false);
    expect(isJobWarning(job)).toBe(false);
  });

  it("shows warning between 15s-30s", () => {
    const job = {
      id: "1",
      status: "PENDING",
      created_at: new Date(Date.now() - 20000).toISOString(),
    };
    
    expect(isJobStuck(job)).toBe(false);
    expect(isJobWarning(job)).toBe(true);
  });

  it("analyzes multiple jobs correctly", () => {
    const jobs = [
      { id: "1", status: "PENDING", created_at: new Date(Date.now() - 5000).toISOString() },
      { id: "2", status: "PENDING", created_at: new Date(Date.now() - 20000).toISOString() },
      { id: "3", status: "PENDING", created_at: new Date(Date.now() - 35000).toISOString() },
      { id: "4", status: "RUNNING", created_at: new Date(Date.now() - 40000).toISOString() },
    ];
    
    const { stuck, warning, healthy } = analyzeQueuedJobs(jobs);
    
    expect(healthy.length).toBe(2); // id=1 (recent), id=4 (RUNNING)
    expect(warning.length).toBe(1); // id=2 (15-30s)
    expect(stuck.length).toBe(1);   // id=3 (>30s)
  });
});
```

### E2E Tests

```typescript
// apps/web/tests/e2e/queued-watchdog.spec.ts

test("Shows stuck job alert after 30s", async ({ page, projectId }) => {
  // Mock stuck job (created 31s ago)
  await page.route('**/api/workspaces/*/projects/*/jobs', route => {
    route.fulfill({
      json: [{
        id: "stuck-1",
        status: "PENDING",
        created_at: new Date(Date.now() - 31000).toISOString(),
        source_url: "https://example.com",
      }],
    });
  });

  await page.goto(`/project/${projectId}`);
  
  // Stuck alert should appear
  await expect(page.locator('[data-testid="stuck-job-stuck-1"]')).toBeVisible();
  
  // Should show retry button
  await expect(page.locator('[data-testid="retry-job-stuck-1"]')).toBeVisible();
  
  // Should show elapsed time
  await expect(page.locator('text=/Queued for 31s/')).toBeVisible();
});

test("Retry button triggers retry API", async ({ page, projectId }) => {
  // Setup stuck job
  await page.route('**/api/workspaces/*/projects/*/jobs', route => {
    route.fulfill({
      json: [{
        id: "stuck-1",
        status: "PENDING",
        created_at: new Date(Date.now() - 31000).toISOString(),
        source_url: "https://example.com",
      }],
    });
  });

  // Intercept retry API call
  let retryCalled = false;
  await page.route('**/api/workspaces/*/projects/*/sources/retry', route => {
    retryCalled = true;
    route.fulfill({ json: { success: true } });
  });

  await page.goto(`/project/${projectId}`);
  
  // Click retry
  await page.click('[data-testid="retry-job-stuck-1"]');
  
  // Verify API called
  expect(retryCalled).toBe(true);
});

test("Warning shows between 15-30s", async ({ page, projectId }) => {
  await page.route('**/api/workspaces/*/projects/*/jobs', route => {
    route.fulfill({
      json: [{
        id: "warning-1",
        status: "PENDING",
        created_at: new Date(Date.now() - 20000).toISOString(),
        source_url: "https://example.com",
      }],
    });
  });

  await page.goto(`/project/${projectId}`);
  
  // Warning should appear (not stuck)
  await expect(page.locator('[data-testid="warning-job-warning-1"]')).toBeVisible();
  
  // Should NOT have retry button
  await expect(page.locator('[data-testid="retry-job-warning-1"]')).not.toBeVisible();
});

test("Alerts auto-dismiss when job state changes", async ({ page, projectId }) => {
  // Start with stuck job
  await page.route('**/api/workspaces/*/projects/*/jobs', route => {
    route.fulfill({
      json: [{
        id: "stuck-1",
        status: "PENDING",
        created_at: new Date(Date.now() - 31000).toISOString(),
      }],
    });
  });

  await page.goto(`/project/${projectId}`);
  
  // Alert visible
  await expect(page.locator('[data-testid="stuck-job-stuck-1"]')).toBeVisible();
  
  // Update job to RUNNING
  await page.route('**/api/workspaces/*/projects/*/jobs', route => {
    route.fulfill({
      json: [{
        id: "stuck-1",
        status: "RUNNING",  // Changed!
        created_at: new Date(Date.now() - 35000).toISOString(),
      }],
    });
  });
  
  // Trigger refetch (wait for poll interval or manual)
  await page.waitForTimeout(3000);
  
  // Alert should auto-dismiss
  await expect(page.locator('[data-testid="stuck-job-stuck-1"]')).not.toBeVisible();
});
```

---

## Performance

### Update Frequency
- **1 second interval** for elapsed time updates
- **Minimal cost**: Simple state update, no network calls
- **Scoped**: Only active when jobs exist

### Render Cost
- **Conditional rendering**: Only when stuck/warning jobs present
- **Memoization**: Analysis result cached per second
- **No animations**: Static UI, no performance drain

---

## Future Enhancements

### Auto-Retry
After 2 minutes stuck, auto-retry once:

```typescript
if (queuedFor > 120000 && !hasAutoRetried) {
  setHasAutoRetried(true);
  onRetry(jobId);
}
```

### Smart Threshold
Adjust threshold based on historical data:

```typescript
const avgProcessingTime = calculateAverage(pastJobs);
const threshold = avgProcessingTime * 3; // 3x typical
```

### Batch Retry
Retry all stuck jobs at once:

```tsx
<Button onClick={() => stuck.forEach(j => onRetry(j.id))}>
  Retry all ({stuck.length})
</Button>
```

### Progress Estimation
Show estimated time remaining:

```typescript
const estimatedCompletion = avgProcessingTime + queuedFor;
```

---

## Accessibility

### Screen Reader Support
```tsx
<div role="alert" aria-live="polite">
  Source stuck in queue for 30 seconds.
  Press retry button to retry source.
</div>
```

### Keyboard Navigation
- Retry button: Tab-accessible
- Troubleshoot link: Tab-accessible
- Focus indicator on active element

---

## References

- **Implementation**: `apps/web/src/lib/queuedWatchdog.ts`
- **Component**: `apps/web/src/components/QueuedJobAlert.tsx`
- **Integration**: `apps/web/src/app/project/[id]/page.tsx`
- **Roadmap**: `docs/architecture/UX_POLISH_ROADMAP_FEB_2026.md`

---

## Success Criteria

✅ **Stuck jobs detected after 30s**  
✅ **Warning shown at 15s (soft alert)**  
✅ **Retry button triggers API call**  
✅ **Alerts auto-dismiss when job state changes**  
✅ **Elapsed time updates every second**  
✅ **Troubleshooting link provided**  
✅ **No false positives (RUNNING jobs ignored)**

---

**Status**: IMPLEMENTED ✅  
**All Week 2 items COMPLETE** 🎉
