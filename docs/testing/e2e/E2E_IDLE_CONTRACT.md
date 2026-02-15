# E2E Idle Contract

## Goal
Prevent flakes caused by async queries, background jobs, debounced UI, and transitions.

## Canonical Definition
`window.__e2e.isIdle()` returns true only when ALL are true:

1. queryClient.isFetching() === 0
2. queryClient.isMutating() === 0
3. No jobs with status PENDING or RUNNING
4. No active debounced timers affecting visible results
5. (Optional) No open overlays that trap input unexpectedly

## Required Test Pattern
After any of the following:
- navigation
- seed/refresh
- clicking filters/sort/group
- opening evidence panel
- performing mutations (approve/pin/dedup)

Tests must call:
- `await waitForAppIdle(page)`

## Debugging Output on Timeout
Timeout error must print:
- fetching count
- mutating count
- pending/running job count
- failed job count
- current phase

## Implementation Status

### ✅ Implemented (providers.tsx)
- `queryClient.isFetching/isMutating` check
- `window.__e2e.isIdle()` exposed
- `window.__e2e.waitForIdle(timeout)` promise-based helper

### 🚧 TODO
- [ ] Add jobs status check to `isIdle()`
- [ ] Expose `window.__e2e.state.phase` (after phase model implemented)
- [ ] Add debounce timer tracking (if needed for search/prefs)
- [ ] Update all E2E tests to use `waitForAppIdle()` helper

## Proposed Enhancement

```typescript
// In providers.tsx
waitForIdle: (timeoutMs = 10000) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const queryIdle = queryClient.isFetching() === 0 && queryClient.isMutating() === 0;
      
      const jobs = window.__e2e?.state?.jobs ?? [];
      const hasActiveJobs = jobs.some(j => ["PENDING", "RUNNING"].includes(j.status));
      const hasFailedJobs = jobs.some(j => j.status === "FAILED");
      
      if (queryIdle && !hasActiveJobs) {
        if (hasFailedJobs) {
          console.warn('⚠️ App idle but has failed jobs:', jobs.filter(j => j.status === "FAILED"));
        }
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        reject(new Error(
          `Timeout waiting for idle (${timeoutMs}ms):\n` +
          `  fetching: ${queryClient.isFetching()}\n` +
          `  mutating: ${queryClient.isMutating()}\n` +
          `  pending jobs: ${jobs.filter(j => j.status === "PENDING").length}\n` +
          `  running jobs: ${jobs.filter(j => j.status === "RUNNING").length}\n` +
          `  failed jobs: ${jobs.filter(j => j.status === "FAILED").length}`
        ));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}
```

## Acceptance Tests

```typescript
test('isIdle() respects job status', async ({ page }) => {
  await seedProject(page, { url: 'https://example.com' });
  
  // Should NOT be idle while job is pending
  const isIdleWhilePending = await page.evaluate(() => window.__e2e.isIdle());
  expect(isIdleWhilePending).toBe(false);
  
  await waitForAppIdle(page);
  
  // Should be idle after job completes
  const isIdleAfter = await page.evaluate(() => window.__e2e.isIdle());
  expect(isIdleAfter).toBe(true);
});

test('waitForIdle timeout includes diagnostic info', async ({ page }) => {
  await page.goto('/project/p');
  
  // Trigger a long-running job
  await page.locator('[data-testid="add-source-btn"]').click();
  await page.locator('[data-testid="url-input"]').fill('https://example.com');
  await page.locator('[data-testid="add-btn"]').click();
  
  // Should timeout with useful info
  await expect(async () => {
    await page.evaluate(() => window.__e2e.waitForIdle(1000));
  }).rejects.toThrow(/pending jobs: \d+/);
});
```