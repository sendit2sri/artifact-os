import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import type { Page } from '@playwright/test';

/** Open Buckets panel via toolbar button or, if missing, via Filters sheet (stable in all layouts). */
async function openBucketsPanel(page: Page): Promise<void> {
  const toolbarBtn = page.getByTestId('buckets-panel-open');
  const visible = await toolbarBtn.isVisible().catch(() => false);
  if (visible) {
    await toolbarBtn.scrollIntoViewIfNeeded();
    await toolbarBtn.click({ timeout: 5000 });
  } else {
    await page.getByTestId('facts-controls-open').click({ timeout: 5000 });
    await expect(page.getByTestId('facts-controls-sheet')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(200);
    await page.getByTestId('buckets-panel-open').click({ timeout: 5000 });
  }
  await expect(page.getByTestId('buckets-panel')).toBeVisible({ timeout: 5000 });
}

/**
 * Buckets V2a smoke: create bucket → add facts via dropdown → generate → assert Angle label.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */
test.describe('Buckets V2a @release-gate', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
    await switchToAllDataView(page);
  });

  test('bucket generate shows Angle label in output drawer', async ({ page }) => {
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10_000 });

    await openBucketsPanel(page);
    await page.getByTestId('buckets-add-name').fill('Angle 1');
    await page.getByTestId('buckets-add-btn').click();
    await expect(page.getByRole('button', { name: /Generate \(0 facts\)/ })).toBeVisible({ timeout: 3000 });

    // Close panel so fact list is clickable
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('buckets-panel')).toBeHidden({ timeout: 3000 });

    // Add two facts to bucket via "Add to bucket" dropdown (seed has ≥2 facts)
    const cards = page.getByTestId('fact-card');
    for (let i = 0; i < 2; i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      await card.hover();
      await expect(card.getByTestId('fact-add-to-bucket')).toBeVisible({ timeout: 3000 });
      await card.getByTestId('fact-add-to-bucket').click();
      await page.getByRole('menuitem', { name: /Angle 1/ }).click();
    }

    await openBucketsPanel(page);
    await page.getByRole('button', { name: /Generate \(2 facts\)/ }).click();

    // Wait for output drawer and Angle label
    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('output-drawer-angle')).toContainText('Angle: Angle 1');
  });
});
