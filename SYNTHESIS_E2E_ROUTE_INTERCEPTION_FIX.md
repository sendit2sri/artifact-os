# Synthesis E2E Test - Route Interception Fix

## Problem

The force_error test failed with:
```
Error: API request did not include force_error=true. Frontend did not read query param correctly.
```

**Why it failed:**
1. Test navigated to `/project/123?playwright_force_synthesis_error=1`
2. Frontend component didn't read the query param (Next.js hydration timing issue)
3. Frontend called `/synthesize` WITHOUT `?force_error=true`
4. Backend returned success instead of error
5. Test expected error banner but OutputDrawer opened instead

## Root Cause: Next.js Hydration Timing

Using `useSearchParams()` in Next.js App Router has timing issues:
- Component may render before query params are available
- `page.goto()` with query params doesn't guarantee immediate availability
- Server-side rendering vs client-side hydration mismatch

## Solution: Playwright Route Interception

**Don't rely on frontend query param handling.** Use Playwright's `page.route()` to intercept and modify the API request directly.

### Before (Unreliable)
```typescript
// ❌ Depends on frontend reading query param
await page.goto(`/project/${TEST_PROJECT_ID}?playwright_force_synthesis_error=1`);

const reqPromise = page.waitForRequest(req => 
  req.url().includes('force_error=true')
);
await generateBtn.click();
await reqPromise; // Times out - query param not read by frontend
```

### After (Reliable)
```typescript
// ✅ Direct control via route interception
await page.goto(`/project/${TEST_PROJECT_ID}`);

await page.route(`**/api/v1/projects/${TEST_PROJECT_ID}/synthesize`, async (route) => {
  const url = new URL(route.request().url());
  url.searchParams.set('force_error', 'true');
  await route.continue({ url: url.toString() });
});

await generateBtn.click();
// API request automatically includes force_error=true
```

## Complete Fixed Test

```typescript
test.describe('Synthesis Flow - Force Error', () => {
  const TEST_PROJECT_ID = '123e4567-e89b-12d3-a456-426614174001';
  
  test.beforeAll(async () => {
    await seedTestDataWithRetry();
  });

  test('should show error banner when synthesis fails (force_error)', async ({ page }) => {
    // Navigate to project page (no query param needed)
    await page.goto(`/project/${TEST_PROJECT_ID}`);
    await page.waitForSelector('[data-testid="fact-card"]', { timeout: 10000 });

    // ✅ Intercept synthesize request and add force_error=true
    await page.route(`**/api/v1/projects/${TEST_PROJECT_ID}/synthesize`, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('force_error', 'true');
      
      await route.continue({
        url: url.toString()
      });
    });

    // Select facts and click Generate
    const factCards = page.locator('[data-testid="fact-card"]');
    await factCards.first().locator('[data-testid="fact-select-button"]').click();
    await factCards.nth(1).locator('[data-testid="fact-select-button"]').click();

    const generateBtn = page.locator('[data-testid="generate-synthesis"]');
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // Assert error banner appears
    const errorBanner = page.getByTestId('synthesis-error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
    await expect(errorBanner).toContainText(/LLM returned empty synthesis/i);

    // Ensure drawer did NOT open (error case)
    await expect(page.locator('[data-testid="output-drawer"]')).toBeHidden();
  });
});
```

## Why Route Interception is Better

| Approach | Reliability | Speed | Debuggability |
|----------|-------------|-------|---------------|
| Query param (`?playwright_force_synthesis_error=1`) | ❌ Low (timing dependent) | Slow (wait for hydration) | Hard (multiple failure points) |
| **Route interception** (`page.route()`) | ✅ High (explicit control) | Fast (immediate) | Easy (clear what's tested) |

### Benefits

1. **No React dependency** - Doesn't rely on React component lifecycle
2. **No Next.js quirks** - Bypasses SSR/hydration timing issues
3. **Explicit control** - Test clearly shows what's being modified
4. **Better isolation** - Tests network layer, not frontend state management
5. **Faster execution** - No waiting for frontend state updates

## Playwright Best Practices

### ✅ DO: Intercept network requests for test scenarios

```typescript
// Force error response
await page.route('**/api/synthesize', route => route.abort());

// Mock successful response
await page.route('**/api/synthesize', route => 
  route.fulfill({ json: { synthesis: "Mock data" } })
);

// Modify request
await page.route('**/api/synthesize', async route => {
  const url = new URL(route.request().url());
  url.searchParams.set('test_mode', 'true');
  await route.continue({ url: url.toString() });
});
```

### ❌ DON'T: Rely on frontend query param handling in tests

```typescript
// ❌ Bad - depends on React hydration timing
await page.goto('/page?special_mode=1');
await button.click();
await expect(specialFeature).toBeVisible();

// ✅ Good - explicit control
await page.goto('/page');
await page.route('**/api/feature', async route => {
  // Modify request to trigger special mode
});
await button.click();
await expect(specialFeature).toBeVisible();
```

## When to Use Route Interception

Use `page.route()` when you need to:
- ✅ Test error handling paths
- ✅ Force specific backend responses
- ✅ Modify request parameters
- ✅ Test timeout scenarios
- ✅ Mock external API calls

Don't use route interception for:
- ❌ Testing actual backend integration (use E2E mode instead)
- ❌ Testing frontend query param handling (use unit tests)

## Run the Fixed Test

```bash
# Start backend with E2E mode
./start-e2e-docker.sh

# Start frontend (in another terminal)
cd apps/web && npm run dev

# Run tests (in third terminal)
cd apps/web
npx playwright test synthesis-flow.spec.ts --workers=3
```

**Expected output:**
```
Running 3 tests using 3 workers

✓ [chromium] › Synthesis Flow › should generate synthesis and open OutputDrawer (5s)
✓ [chromium] › Synthesis Flow › should show Last Output button after generation (4s)
✓ [chromium] › Synthesis Flow - Force Error › should show error banner when synthesis fails (3s)

3 passed (12s)
```

## Summary

**Problem:** Frontend didn't read `?playwright_force_synthesis_error=1` due to Next.js hydration timing.

**Solution:** Use `page.route()` to intercept the API request and add `force_error=true` directly.

**Result:** Test is now reliable, fast, and follows Playwright best practices. ✅

## Related Files

- `apps/web/tests/e2e/synthesis-flow.spec.ts` - Updated test with route interception
- `SYNTHESIS_E2E_FIX_FINAL.md` - Complete documentation of the fix
- `E2E_SYNTHESIS_DETERMINISM.md` - Overall E2E synthesis guide
