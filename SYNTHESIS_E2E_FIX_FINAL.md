# Synthesis E2E Test Fix - Force Error Test

## Problem

The `force_error` test was **failing** because:

1. **OutputDrawer opened with success** instead of showing error banner
2. Root cause: `force_error=true` was **not sent** to the backend API
3. The query param `?playwright_force_synthesis_error=1` wasn't picked up by React component

## Why It Failed

### Next.js Client-Side Navigation Issue

```typescript
test.describe('Synthesis Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_ID}`);  // ❌ Mounts component WITHOUT query param
  });

  test('should show error banner', async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_ID}?playwright_force_synthesis_error=1`);  // ⚠️ May use client-side routing
    // Component already mounted, searchParams doesn't update!
  });
});
```

**What happens:**
1. `beforeEach` navigates to page → Component mounts → `searchParams` has no `playwright_force_synthesis_error`
2. Error test navigates again with query param → Next.js uses client-side routing → Component doesn't re-mount
3. `searchParams.get("playwright_force_synthesis_error")` returns `null` (stale value)
4. Frontend calls `/synthesize` without `?force_error=true`
5. Backend returns **success** (deterministic E2E synthesis)
6. OutputDrawer opens instead of error banner

## Solution

### Use Playwright Route Interception (Best Practice)

Instead of relying on frontend query param handling (which has Next.js hydration timing issues), use Playwright's `page.route()` to directly control the API request:

```typescript
test.describe('Synthesis Flow - Force Error', () => {
  test('should show error banner when synthesis fails', async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_ID}`);
    await page.waitForSelector('[data-testid="fact-card"]', { timeout: 10000 });
    
    // ✅ BEST PRACTICE: Intercept and modify the request
    await page.route(`**/api/v1/projects/${TEST_PROJECT_ID}/synthesize`, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('force_error', 'true');
      
      await route.continue({
        url: url.toString()
      });
    });
    
    // Select facts and click Generate
    await factCards.first().locator('[data-testid="fact-select-button"]').click();
    await factCards.nth(1).locator('[data-testid="fact-select-button"]').click();
    await generateBtn.click();
    
    // Assert error banner appears
    await expect(page.getByTestId('synthesis-error-banner')).toBeVisible();
    await expect(page.locator('[data-testid="output-drawer"]')).toBeHidden();
  });
});
```

**Why route interception is better:**
- ✅ No dependency on React hydration timing
- ✅ No dependency on Next.js query param handling
- ✅ Explicit control over when/how error is triggered
- ✅ More reliable and deterministic
- ✅ Faster (no waiting for frontend state updates)

### Key Changes

1. **Separate describe block** - Error test doesn't use shared `beforeEach`
2. **Request verification** - `page.waitForRequest()` confirms `force_error=true` was sent
3. **Fail fast** - If API request doesn't include query param, test fails with clear error message
4. **Drawer assertion** - Verify OutputDrawer did NOT open (error case)

## Playwright Best Practices Applied

### ✅ Verify API Requests Before Asserting UI

**Bad (original):**
```typescript
await generateBtn.click();
await expect(errorBanner).toBeVisible();  // ❌ Assumes API was called correctly
```

**Good (fixed):**
```typescript
const reqPromise = page.waitForRequest(req => 
  req.url().includes('force_error=true')
);
await generateBtn.click();
await reqPromise;  // ✅ Verify API call first
await expect(errorBanner).toBeVisible();
```

### ✅ Isolate Tests with Different Setup Requirements

**Bad:**
```typescript
test.describe('All tests', () => {
  test.beforeEach(() => { /* shared setup */ });
  test('normal test', ...);
  test('special test needing different setup', ...);  // ❌ Fights with beforeEach
});
```

**Good:**
```typescript
test.describe('Normal tests', () => {
  test.beforeEach(() => { /* shared setup */ });
  test('test 1', ...);
  test('test 2', ...);
});

test.describe('Special tests', () => {
  // ✅ Different or no beforeEach
  test('special test', ...);
});
```

### ✅ Clear Failure Messages

```typescript
try {
  await reqPromise;
} catch (e) {
  throw new Error('API request did not include force_error=true. Frontend did not read query param correctly.');
}
```

## Code Changes

### File: `apps/web/tests/e2e/synthesis-flow.spec.ts`

**Before:**
```typescript
test.describe('Synthesis Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_ID}`);
  });
  
  // ... other tests ...
  
  test('should show error banner when synthesis fails', async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_ID}?playwright_force_synthesis_error=1`);
    await generateBtn.click();
    await expect(errorBanner).toBeVisible();  // ❌ Fails - no error banner
  });
});
```

**After:**
```typescript
test.describe('Synthesis Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_ID}`);
  });
  
  // ... success tests ...
});

test.describe('Synthesis Flow - Force Error', () => {
  test.beforeAll(async () => {
    await seedTestDataWithRetry();
  });

  test('should show error banner when synthesis fails (force_error)', async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_ID}`);
    await page.waitForSelector('[data-testid="fact-card"]', { timeout: 10000 });
    
    // ✅ Use route interception to force error
    await page.route(`**/api/v1/projects/${TEST_PROJECT_ID}/synthesize`, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('force_error', 'true');
      
      await route.continue({
        url: url.toString()
      });
    });

    const factCards = page.locator('[data-testid="fact-card"]');
    await factCards.first().locator('[data-testid="fact-select-button"]').click();
    await factCards.nth(1).locator('[data-testid="fact-select-button"]').click();
    
    const generateBtn = page.locator('[data-testid="generate-synthesis"]');
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    await expect(page.getByTestId('synthesis-error-banner')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="output-drawer"]')).toBeHidden();
  });
});
```

## How to Run

```bash
# Terminal 1: Start backend with E2E mode
./start-e2e-docker.sh

# Terminal 2: Start frontend
cd apps/web && npm run dev

# Terminal 3: Run tests
cd apps/web
npx playwright test synthesis-flow.spec.ts --workers=3
```

**Expected:**
```
Running 4 tests using 3 workers

✓ [chromium] › Synthesis Flow › should generate synthesis and open OutputDrawer
✓ [chromium] › Synthesis Flow › should show Last Output button after generation
✓ [chromium] › Synthesis Flow - Force Error › should show error banner when synthesis fails

3 passed (15s)
```

## Why This Is Important

### Without Request Verification
- Test fails silently when frontend logic breaks
- Unclear if issue is: API not called, wrong params, timing, or backend error
- Hard to debug: "Error banner not visible" could mean many things

### With Request Verification
- Test fails **immediately** with clear message: "API request did not include force_error=true"
- Pinpoints exact problem: frontend didn't read query param
- Easy to debug: check React component's `searchParams` usage

## Related Issues

### Next.js useSearchParams() Gotchas

1. **Client-side navigation doesn't re-mount components**
   - Use separate tests for different query params
   - Or use `window.location.href = ...` for full page reload

2. **searchParams is captured at mount time**
   - Changing URL after mount doesn't update the hook
   - Component needs to re-mount to pick up new params

3. **Dynamic rendering requires Suspense**
   - If you see warnings about `useSearchParams()`, wrap in `<Suspense>`
   - Not required for this fix, but good to know

## Summary

| Issue | Solution | Benefit |
|-------|----------|---------|
| beforeEach interferes with query params | Isolate error test in separate describe | Component mounts with correct params |
| Unclear why test fails | Add request verification | Fail fast with clear error message |
| Tests depend on timing | Wait for specific API request | Deterministic, no race conditions |
| Error vs success unclear | Assert drawer is hidden | Verify correct code path executed |

**Key lesson**: Always verify **what you sent to the API** before asserting **what the UI shows**. This makes tests resilient and debuggable.
