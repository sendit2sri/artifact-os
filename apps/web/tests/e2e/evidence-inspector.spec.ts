import { test, expect } from '@playwright/test';

/**
 * Evidence Inspector E2E Tests
 * 
 * Tests the "View Evidence" auto-scroll + highlight reliability
 * 
 * Prerequisites:
 * - Backend running with ARTIFACT_ENABLE_TEST_SEED=true
 * - Test seed endpoint creates deterministic test data
 */

/**
 * Helper function to seed test data with retry logic
 * Retries up to 3 times on transient failures (500 errors)
 */
async function seedTestDataWithRetry(maxRetries = 3): Promise<void> {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const seedResponse = await fetch(`${BACKEND_URL}/api/v1/test/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (seedResponse.ok) {
        const seedData = await seedResponse.json();
        console.log(`✅ Test data seeded (attempt ${attempt}):`, seedData);
        return;
      }
      
      // Handle 500 errors with retry
      if (seedResponse.status === 500 && attempt < maxRetries) {
        const error = await seedResponse.text();
        console.warn(`⚠️ Seed attempt ${attempt} failed with 500, retrying...`, error);
        await new Promise(resolve => setTimeout(resolve, 200 * attempt)); // Exponential backoff
        continue;
      }
      
      // Other errors or max retries reached
      const error = await seedResponse.text();
      throw new Error(`Failed to seed test data: ${seedResponse.status} - ${error}`);
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.warn(`⚠️ Seed attempt ${attempt} failed, retrying...`, error);
      await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    }
  }
}

test.describe('Evidence Inspector', () => {
  const TEST_PROJECT_ID = '123e4567-e89b-12d3-a456-426614174001';
  
  // Seed once before all tests in this file (avoids parallel collision)
  test.beforeAll(async () => {
    await seedTestDataWithRetry();
  });
  
  test.beforeEach(async ({ page }) => {
    // Navigate to project page
    await page.goto(`/project/${TEST_PROJECT_ID}`);
    
    // Wait for facts to load with better error reporting
    try {
      await page.waitForSelector('[data-testid="fact-card"]', { timeout: 10000 });
    } catch (error) {
      // Debug: Take screenshot and log network errors
      await page.screenshot({ path: 'test-failure-facts-not-loaded.png' });
      console.error('❌ Facts did not load. Network logs:', await page.evaluate(() => {
        return performance.getEntriesByType('resource').map(r => ({
          name: r.name,
          duration: r.duration
        }));
      }));
      throw error;
    }
  });

  test('should scroll to evidence mark on first click', async ({ page }) => {
    // Click "View Evidence" button on first fact
    const viewEvidenceBtn = page.locator('[data-testid="view-evidence-btn"]').first();
    await viewEvidenceBtn.click();
    
    // Wait for inspector panel to open
    await page.waitForSelector('[data-testid="evidence-inspector"]', { timeout: 10000 });
    
    // Wait for evidence mark to appear in DOM (increased timeout for markdown rendering)
    const evidenceMark = page.locator('[data-evidence-mark="true"]').or(page.locator('[data-testid="evidence-mark"]'));
    
    try {
      await evidenceMark.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      // Debug: Print page content and take screenshot
      console.error('❌ Evidence mark not found. Debug info:');
      const markCount = await page.locator('[data-evidence-mark="true"]').count();
      console.error('Mark count:', markCount);
      
      if (markCount > 0) {
        const isVisible = await page.locator('[data-evidence-mark="true"]').first().isVisible();
        console.error('First mark visible:', isVisible);
      }
      
      await page.screenshot({ path: 'test-failure-evidence-mark-missing.png', fullPage: true });
      throw error;
    }
    
    // Assert mark exists
    await expect(evidenceMark.first()).toBeVisible();
    
    // Assert mark is in viewport (scrolled to)
    const isInViewport = await evidenceMark.first().evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
    });
    
    expect(isInViewport).toBe(true);
  });

  test('should re-scroll when switching between Reader and Raw tabs', async ({ page }) => {
    // Open evidence inspector
    const viewEvidenceBtn = page.locator('[data-testid="view-evidence-btn"]').first();
    await viewEvidenceBtn.click();
    
    await page.waitForSelector('[data-testid="evidence-inspector"]', { timeout: 10000 });
    
    // Wait for evidence mark in Reader view
    const evidenceMark = page.locator('[data-evidence-mark="true"]');
    await evidenceMark.waitFor({ state: 'visible', timeout: 10000 });
    
    // Switch to Raw tab
    const rawTab = page.locator('[role="tab"]', { hasText: 'Raw' });
    await rawTab.click();
    
    // Wait for tab transition and re-render (triple RAF + 200ms)
    await page.waitForTimeout(800);
    
    // Wait for evidence mark in Raw view
    try {
      await evidenceMark.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      console.error('❌ Evidence mark not found in Raw tab');
      const markCount = await page.locator('[data-evidence-mark="true"]').count();
      console.error('Mark count in Raw view:', markCount);
      await page.screenshot({ path: 'test-failure-raw-tab-mark.png', fullPage: true });
      throw error;
    }
    
    // Assert mark is in viewport
    const isInViewport = await evidenceMark.first().evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
    
    expect(isInViewport).toBe(true);
    
    // Switch back to Reader tab
    const readerTab = page.locator('[role="tab"]', { hasText: 'Reader' });
    await readerTab.click();
    
    // Wait for tab transition
    await page.waitForTimeout(800);
    
    // Assert mark appears again and is in viewport
    await expect(evidenceMark.first()).toBeVisible();
  });

  test('should handle repeated clicks on same fact', async ({ page }) => {
    const viewEvidenceBtn = page.locator('[data-testid="view-evidence-btn"]').first();
    
    // Click once
    await viewEvidenceBtn.click();
    await page.waitForSelector('[data-testid="evidence-inspector"]', { timeout: 10000 });
    await page.waitForSelector('[data-evidence-mark="true"]', { timeout: 10000 });
    
    // Close inspector (look for X button or Close button)
    const closeBtn = page.locator('[data-testid="evidence-inspector"] button').filter({ hasText: /Close|×/ }).first();
    await closeBtn.click();
    
    // Wait for inspector to close
    await page.waitForTimeout(500);
    
    // Click again
    await viewEvidenceBtn.click();
    await page.waitForSelector('[data-testid="evidence-inspector"]', { timeout: 10000 });
    await page.waitForSelector('[data-evidence-mark="true"]', { timeout: 10000 });
    
    // Assert mark is still in viewport
    const evidenceMark = page.locator('[data-evidence-mark="true"]').first();
    const isInViewport = await evidenceMark.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
    
    expect(isInViewport).toBe(true);
  });

  test('should only have one evidence mark in DOM', async ({ page }) => {
    // Open evidence inspector
    const viewEvidenceBtn = page.locator('[data-testid="view-evidence-btn"]').first();
    await viewEvidenceBtn.click();
    
    await page.waitForSelector('[data-testid="evidence-inspector"]', { timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for all rendering and scroll completion
    
    // Count evidence marks in DOM
    const markCount = await page.locator('[data-evidence-mark="true"]').count();
    
    console.log(`✓ Found ${markCount} evidence mark(s) in DOM`);
    
    // Should only have ONE mark (no duplicate IDs/marks)
    expect(markCount).toBeLessThanOrEqual(1);
    
    // If mark exists, it should be visible
    if (markCount === 1) {
      const mark = page.locator('[data-evidence-mark="true"]').first();
      await expect(mark).toBeVisible();
    }
  });

  test('should fallback gracefully if mark not found', async ({ page }) => {
    // This test verifies inspector opens even if evidence mark is missing
    
    const viewEvidenceBtn = page.locator('[data-testid="view-evidence-btn"]').first();
    await viewEvidenceBtn.click();
    
    // Wait for inspector to open (should not crash)
    await page.waitForSelector('[data-testid="evidence-inspector"]', { timeout: 10000 });
    
    // Even if mark not found, inspector should still be usable
    await expect(page.locator('[data-testid="evidence-inspector"]')).toBeVisible();
    
    // Verify content loaded
    const scrollArea = page.locator('[data-testid="evidence-inspector"]').locator('.raw-content, .reader-content');
    await expect(scrollArea.first()).toBeVisible();
  });
});
