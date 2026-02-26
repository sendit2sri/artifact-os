/**
 * Navigation helpers - resilient to dev server hot-reload and frame-detached flakiness.
 * Uses domcontentloaded; then UI sentinels (no idle - dev mode idle can stay false forever).
 */

import { expect, Page } from '@playwright/test';

/** Force canonical baseline: view=all, toggles off, search empty, group off. Removes alternate render paths. */
export async function resetFactsViewState(page: Page): Promise<void> {
  await expect(page.getByTestId('facts-search-input')).toBeVisible({ timeout: 5000 });

  // Open Filters sheet (sort/group/collapse/selection live only in sheet)
  await page.getByTestId('facts-controls-open').click({ timeout: 2000 });
  await expect(page.getByTestId('facts-controls-sheet')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(200);

  const collapseToggle = page.getByTestId('toggle-collapse-similar');
  // Uncheck toggles that trigger alternate render paths
  if (await collapseToggle.isChecked().catch(() => false)) {
    await collapseToggle.click();
    await page.waitForTimeout(150);
  }
  const selectedOnly = page.getByTestId('facts-selected-only-toggle');
  if (await selectedOnly.isChecked().catch(() => false)) {
    await selectedOnly.click();
    await page.waitForTimeout(150);
  }
  const showSuppressed = page.getByTestId('facts-show-suppressed-toggle');
  if (await showSuppressed.isChecked().catch(() => false)) {
    await showSuppressed.click();
    await page.waitForTimeout(150);
  }

  // Clear search
  await page.getByTestId('facts-search-input').clear();
  await page.waitForTimeout(200);

  // Set group to "off" if "source" (grouped view uses different structure)
  const groupTrigger = page.getByTestId('facts-group-trigger');
  const groupText = await groupTrigger.textContent().catch(() => '');
  if (groupText?.toLowerCase().includes('source')) {
    await groupTrigger.click();
    await page.getByRole('option', { name: /no grouping/i }).click();
    await page.waitForTimeout(200);
  }

  // Dismiss controls sheet if open
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

export async function gotoProject(page: Page, projectId: string) {
  // Navigate with view=all to force baseline (avoids Key Claims default hiding facts)
  const url = `/project/${projectId}?view=all`;

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    try {
      await expect(page).toHaveURL(/\/project\//, { timeout: 15_000 });
      await expect(page.getByTestId('facts-search-input')).toBeVisible({ timeout: 15_000 });
      await resetFactsViewState(page);
      return;
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
}

/** Enable "Collapse duplicates" toggle. Opens Filters sheet first (controls live in sheet). */
export async function toggleCollapseOn(page: Page): Promise<void> {
  await page.getByTestId('facts-controls-open').click({ timeout: 2000 });
  await expect(page.getByTestId('facts-controls-sheet')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(200);
  const toggle = page.getByTestId('toggle-collapse-similar');
  if (!(await toggle.isChecked().catch(() => false))) {
    await toggle.check();
    await page.waitForTimeout(200);
  }
}

/** Set "Group by Source" in facts controls. Opens Filters sheet first (controls live in sheet). */
export async function groupBySource(page: Page): Promise<void> {
  await page.getByTestId('facts-controls-open').click({ timeout: 2000 });
  await expect(page.getByTestId('facts-controls-sheet')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(200);
  const groupTrigger = page.getByTestId('facts-group-trigger');
  await expect(groupTrigger).toBeVisible({ timeout: 5000 });
  const groupText = await groupTrigger.textContent().catch(() => '');
  if (!groupText?.toLowerCase().includes('source')) {
    await groupTrigger.click();
    await page.getByTestId('facts-group-option-source').click();
    await page.waitForTimeout(200);
  }
}

/** Switch to "All Data" view so all facts (including non-key-claims) are visible. */
export async function switchToAllDataView(page: Page): Promise<void> {
  const allTab = page.getByTestId('view-tab-all');

  await allTab.scrollIntoViewIfNeeded();
  await expect(allTab).toBeVisible({ timeout: 5000 });

  // If already active, exit
  const selected = await allTab.getAttribute('aria-selected');
  if (selected === 'true') return;

  // Try up to 2 times (Radix tabs sometimes ignore click if something steals focus)
  for (let attempt = 0; attempt < 2; attempt++) {
    await allTab.click({ timeout: 5000 });

    try {
      await expect(allTab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });

      // Confirm list rendered (Promise.race avoids or() strict-mode when both present)
      await Promise.race([
        expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 5000 }),
        expect(page.getByTestId('facts-empty-state')).toBeVisible({ timeout: 5000 }),
      ]);

      return;
    } catch {
      if (attempt === 1) {
        throw new Error('Failed to switch to All Data tab (view-tab-all never became selected).');
      }
    }
  }
}
