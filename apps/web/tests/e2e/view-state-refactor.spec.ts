/**
 * View State Refactor Acceptance Tests
 * 
 * Tests the 7 critical bugs fixed in the view state refactor:
 * 1. useMemo empty deps freezing state
 * 2. Hydration timing issues
 * 3. group=off polluting URLs
 * 4. String URL comparison failures
 * 5. Empty query string issues
 * 6. Inconsistent URLSearchParams handling
 * 7. CRITICAL: Server prefs locked before React Query data loaded
 */

import { test, expect } from "./fixtures/test";
import { waitForAppIdle } from "./helpers/synthesis";

test.describe("View State Refactor - Acceptance Tests", () => {
  test.beforeEach(async ({ page, projectId }) => {
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);
  });

  test("Bug #7 (CRITICAL): Server prefs apply after query resolves", async ({ page, projectId }) => {
    // Set server preference for sort
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Change sort to "newest"
    await page.click('[data-testid="facts-sort-trigger"]');
    await page.click('text=Newest first');
    await waitForAppIdle(page);

    // Navigate away and back (no URL params)
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Verify sort preference was applied (NOT default "needs_review")
    const sortTrigger = page.locator('[data-testid="facts-sort-trigger"]');
    await expect(sortTrigger).toContainText(/Newest first/i);

    // This test would FAIL before the fix because prefsHydratedRef locked
    // before React Query data actually loaded
  });

  test("Bug #1: URL params override server prefs correctly", async ({ page, projectId }) => {
    // Set server preference for sort=newest
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);
    await page.click('[data-testid="facts-sort-trigger"]');
    await page.click('text=Newest first');
    await waitForAppIdle(page);

    // Navigate with explicit URL param (should override pref)
    await page.goto(`/project/${projectId}?sort=confidence`);
    await waitForAppIdle(page);

    // Verify URL won (not pref)
    const sortTrigger = page.locator('[data-testid="facts-sort-trigger"]');
    await expect(sortTrigger).toContainText(/Confidence/i);

    // Navigate without param - pref should apply again
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    await expect(sortTrigger).toContainText(/Newest first/i);
  });

  test("Bug #1 + #2: State updates on navigation (useMemo not frozen)", async ({ page, projectId }) => {
    // Start with sort=newest
    await page.goto(`/project/${projectId}?sort=newest`);
    await waitForAppIdle(page);

    const sortTrigger = page.locator('[data-testid="facts-sort-trigger"]');
    await expect(sortTrigger).toContainText(/Newest first/i);

    // Navigate to different sort via URL
    await page.goto(`/project/${projectId}?sort=confidence`);
    await waitForAppIdle(page);

    // Verify state updated (not frozen with empty deps)
    await expect(sortTrigger).toContainText(/Confidence/i);

    // Navigate to no params
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Should show default or pref (not stuck on confidence)
    await expect(sortTrigger).not.toContainText(/Confidence/i);
  });

  test("Bug #3: group param only written when true (not group=off)", async ({ page, projectId }) => {
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Toggle grouping OFF
    await page.click('[data-testid="facts-group-trigger"]');
    await page.click('text=Off');
    await waitForAppIdle(page);

    // Verify URL does NOT contain group=off
    const url = new URL(page.url());
    expect(url.searchParams.has('group')).toBe(false);

    // Toggle grouping ON
    await page.click('[data-testid="facts-group-trigger"]');
    await page.click('text=By source');
    await waitForAppIdle(page);

    // Verify URL contains group=source
    const url2 = new URL(page.url());
    expect(url2.searchParams.get('group')).toBe('source');
  });

  test("Bug #2 + #5: No effect loops on rapid toggles", async ({ page, projectId }) => {
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Track URL changes
    const urlChanges: string[] = [];
    page.on('framenavigated', () => {
      urlChanges.push(page.url());
    });

    // Rapid sort toggles (5x)
    for (let i = 0; i < 5; i++) {
      await page.click('[data-testid="facts-sort-trigger"]');
      await page.click('text=Newest first');
      await page.waitForTimeout(100);
      await page.click('[data-testid="facts-sort-trigger"]');
      await page.click('text=Confidence');
      await page.waitForTimeout(100);
    }

    await waitForAppIdle(page);

    // Should have reasonable number of URL changes (not 100s from loops)
    // Allow some extra from debounce, but not exponential
    expect(urlChanges.length).toBeLessThan(20);

    // No console errors about "Maximum update depth exceeded"
    const consoleErrors = await page.evaluate(() => {
      return (window as any).__consoleErrors || [];
    });
    
    const hasLoopError = consoleErrors.some((msg: string) => 
      msg.includes('Maximum update depth') || msg.includes('Too many re-renders')
    );
    
    expect(hasLoopError).toBe(false);
  });

  test("Bug #4: URL comparison robust to param order", async ({ page, projectId }) => {
    // Navigate with params in order A
    await page.goto(`/project/${projectId}?sort=newest&group=source&view=all`);
    await waitForAppIdle(page);

    const urlBefore = page.url();

    // Trigger state change that rebuilds URL
    await page.click('[data-testid="facts-sort-trigger"]');
    await page.click('text=Confidence');
    await waitForAppIdle(page);

    // Change back to original state
    await page.click('[data-testid="facts-sort-trigger"]');
    await page.click('text=Newest first');
    await waitForAppIdle(page);

    const urlAfter = page.url();

    // URLs should be equivalent even if param order differs
    const paramsBefore = new URLSearchParams(new URL(urlBefore).search);
    const paramsAfter = new URLSearchParams(new URL(urlAfter).search);

    expect(paramsBefore.get('sort')).toBe(paramsAfter.get('sort'));
    expect(paramsBefore.get('group')).toBe(paramsAfter.get('group'));
    expect(paramsBefore.get('view')).toBe(paramsAfter.get('view'));
  });

  test("Bug #5: Empty query string handled correctly", async ({ page, projectId }) => {
    // Start with params
    await page.goto(`/project/${projectId}?sort=newest`);
    await waitForAppIdle(page);

    // Clear all filters (should result in empty query string)
    await page.click('[data-testid="facts-sort-trigger"]');
    await page.click('text=Needs review'); // Reset to default
    await waitForAppIdle(page);

    // URL should not have trailing ?
    const url = page.url();
    const hasTrailingQuestion = url.endsWith('?');
    expect(hasTrailingQuestion).toBe(false);

    // Should be clean URL
    expect(url).toMatch(/\/project\/[a-zA-Z0-9-]+$/);
  });

  test("Bug #6: localStorage migration completes and keys deleted", async ({ page, projectId }) => {
    // Set old localStorage keys (simulate legacy state)
    await page.goto(`/project/${projectId}`);
    await page.evaluate((pid) => {
      localStorage.setItem(`sort-${pid}`, 'newest');
      localStorage.setItem(`group-${pid}`, 'source');
      localStorage.setItem(`view-${pid}`, 'all');
    }, projectId);

    // Reload page (should trigger migration)
    await page.reload();
    await waitForAppIdle(page);

    // Verify migration happened (prefs should be on server now)
    // We can't easily verify server state in E2E, but we can verify localStorage was cleared
    const hasOldKeys = await page.evaluate((pid) => {
      return (
        localStorage.getItem(`sort-${pid}`) !== null ||
        localStorage.getItem(`group-${pid}`) !== null ||
        localStorage.getItem(`view-${pid}`) !== null
      );
    }, projectId);

    expect(hasOldKeys).toBe(false);

    // Verify state was applied (sort should be newest from migration)
    const sortTrigger = page.locator('[data-testid="facts-sort-trigger"]');
    await expect(sortTrigger).toContainText(/Newest first/i);
  });

  test("Filter chips appear when filters active", async ({ page, projectId }) => {
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Initially no filter chips
    const chipsRow = page.locator('[data-testid="active-filters-chips"]');
    await expect(chipsRow).not.toBeVisible();

    // Enable group by source
    await page.click('[data-testid="facts-group-trigger"]');
    await page.click('text=By source');
    await waitForAppIdle(page);

    // Filter chips should appear
    await expect(chipsRow).toBeVisible();
    
    // Should show group chip
    const groupChip = page.locator('[data-testid="filter-chip-group-by-source"]');
    await expect(groupChip).toBeVisible();
    await expect(groupChip).toContainText(/Grouped by source/i);

    // Click chip X to clear filter
    await groupChip.click();
    await waitForAppIdle(page);

    // Chip row should hide
    await expect(chipsRow).not.toBeVisible();

    // Group should be off
    const groupTrigger = page.locator('[data-testid="facts-group-trigger"]');
    await expect(groupTrigger).toContainText(/Off/i);
  });

  test("Filter chips: search query", async ({ page, projectId }) => {
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Type search query
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill("test query");
    await searchInput.press("Enter");
    await waitForAppIdle(page);

    // Filter chip should appear
    const searchChip = page.locator('[data-testid="filter-chip-search"]');
    await expect(searchChip).toBeVisible();
    await expect(searchChip).toContainText(/Search: "test query"/i);

    // Click X to clear
    await searchChip.click();
    await waitForAppIdle(page);

    // Search should be cleared
    await expect(searchInput).toHaveValue("");
    await expect(searchChip).not.toBeVisible();
  });

  test("Filter chips: show only selected", async ({ page, projectId }) => {
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Select some facts
    const firstCheckbox = page.locator('[data-testid^="fact-"][data-testid$="-checkbox"]').first();
    await firstCheckbox.click();
    await waitForAppIdle(page);

    // Enable "selected only" filter
    const selectedOnlyToggle = page.locator('[data-testid="facts-selected-only-toggle"]');
    await selectedOnlyToggle.check();
    await waitForAppIdle(page);

    // Filter chip should appear
    const selectedChip = page.locator('[data-testid="filter-chip-selected-only"]');
    await expect(selectedChip).toBeVisible();
    await expect(selectedChip).toContainText(/Selected only/i);

    // Click X to clear
    await selectedChip.click();
    await waitForAppIdle(page);

    // Toggle should be unchecked
    await expect(selectedOnlyToggle).not.toBeChecked();
    await expect(selectedChip).not.toBeVisible();
  });

  test("Diagnostics strip visible in debug mode", async ({ page, projectId }) => {
    // Visit without debug flag - should not show
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    const diagnosticsStrip = page.locator('[data-testid="diagnostics-strip"]');
    await expect(diagnosticsStrip).not.toBeVisible();

    // Visit with debug flag - should show
    await page.goto(`/project/${projectId}?debug=1`);
    await waitForAppIdle(page);

    await expect(diagnosticsStrip).toBeVisible();
    
    // Should show key state info
    await expect(diagnosticsStrip).toContainText(/facts:/i);
    await expect(diagnosticsStrip).toContainText(/jobs:/i);
    await expect(diagnosticsStrip).toContainText(/idle:/i);
  });

  test("Enhanced idle contract: waits for jobs to complete", async ({ page, projectId }) => {
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Trigger a source ingest (creates job)
    await page.click('button:has-text("Add source")');
    await page.fill('[data-testid="add-source-sheet-url-input"]', 'https://example.com/test');
    await page.click('[data-testid="add-source-sheet-submit"]');

    // Job should be created
    await page.waitForSelector('text=/Processing|Extracting/i', { timeout: 5000 });

    // isIdle should return false while job running (returns {idle, reasons} object)
    const isIdleWhileRunning = await page.evaluate(() => {
      const r = (window as any).__e2e?.isIdle?.();
      return typeof r === 'object' ? r.idle : r;
    });
    expect(isIdleWhileRunning).toBe(false);

    // Wait for job to complete
    await waitForAppIdle(page, 30000);

    // isIdle should now return true
    const isIdleAfterComplete = await page.evaluate(() => {
      const r = (window as any).__e2e?.isIdle?.();
      return typeof r === 'object' ? r.idle : r;
    });
    expect(isIdleAfterComplete).toBe(true);
  });

  test("Control heights standardized to h-9", async ({ page, projectId }) => {
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Check sort select height
    const sortTrigger = page.locator('[data-testid="facts-sort-trigger"]');
    const sortBox = await sortTrigger.boundingBox();
    expect(sortBox?.height).toBeCloseTo(36, 2); // h-9 = 36px

    // Check group select height
    const groupTrigger = page.locator('[data-testid="facts-group-trigger"]');
    const groupBox = await groupTrigger.boundingBox();
    expect(groupBox?.height).toBeCloseTo(36, 2);

    // Check button heights in selection panel (if visible)
    const firstCheckbox = page.locator('[data-testid^="fact-"][data-testid$="-checkbox"]').first();
    await firstCheckbox.click();
    await waitForAppIdle(page);

    const selectAllBtn = page.locator('[data-testid="selection-select-all-visible"]');
    if (await selectAllBtn.isVisible()) {
      const btnBox = await selectAllBtn.boundingBox();
      expect(btnBox?.height).toBeCloseTo(36, 2);
    }
  });
});

test.describe("View State - Edge Cases", () => {
  test("Multiple rapid navigations don't cause race conditions", async ({ page, projectId }) => {
    // Rapidly navigate between different states
    for (let i = 0; i < 10; i++) {
      await page.goto(`/project/${projectId}?sort=newest`);
      await page.goto(`/project/${projectId}?sort=confidence`);
      await page.goto(`/project/${projectId}`);
    }

    await waitForAppIdle(page);

    // Should be stable at final state
    const sortTrigger = page.locator('[data-testid="facts-sort-trigger"]');
    await expect(sortTrigger).toBeVisible();
    
    // No console errors
    const consoleErrors = await page.evaluate(() => {
      return (window as any).__consoleErrors || [];
    });
    
    expect(consoleErrors.length).toBe(0);
  });

  test("View state persists across tab switches", async ({ page, projectId, seed }) => {
    await seed();
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Set specific view state
    await page.click('[data-testid="facts-sort-trigger"]');
    await page.click('text=Newest first');
    await page.click('[data-testid="facts-group-trigger"]');
    await page.click('text=By source');
    await waitForAppIdle(page);

    // Switch to "All Data" tab
    await page.click('text=All Data');
    await waitForAppIdle(page);

    // Sort and group should persist
    const sortTrigger = page.locator('[data-testid="facts-sort-trigger"]');
    await expect(sortTrigger).toContainText(/Newest first/i);
    
    const groupTrigger = page.locator('[data-testid="facts-group-trigger"]');
    await expect(groupTrigger).toContainText(/By source/i);
  });

  test("Shareable URLs work correctly", async ({ page, projectId, context }) => {
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Set specific state
    await page.click('[data-testid="facts-sort-trigger"]');
    await page.click('text=Confidence');
    await page.click('[data-testid="facts-group-trigger"]');
    await page.click('text=By source');
    await waitForAppIdle(page);

    // Copy URL
    const shareableUrl = page.url();

    // Open in new tab (simulating sharing)
    const newPage = await context.newPage();
    await newPage.goto(shareableUrl);
    await waitForAppIdle(newPage);

    // State should match exactly
    const sortTrigger = newPage.locator('[data-testid="facts-sort-trigger"]');
    await expect(sortTrigger).toContainText(/Confidence/i);
    
    const groupTrigger = newPage.locator('[data-testid="facts-group-trigger"]');
    await expect(groupTrigger).toContainText(/By source/i);

    await newPage.close();
  });
});
