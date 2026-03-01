import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView, ensureFactsControlsOpen } from './helpers/nav';
import type { Page } from '@playwright/test';

async function openBucketsPanel(page: Page): Promise<void> {
  const toolbarBtn = page.getByTestId('buckets-panel-open');
  const visible = await toolbarBtn.isVisible().catch(() => false);
  if (visible) {
    await toolbarBtn.scrollIntoViewIfNeeded();
    await toolbarBtn.click({ timeout: 5000 });
  } else {
    await ensureFactsControlsOpen(page);
    await page.getByTestId('buckets-panel-open').click({ timeout: 5000 });
  }
  await expect(page.getByTestId('buckets-panel')).toBeVisible({ timeout: 5000 });
}

/**
 * Buckets V2b: persist → reload → generate.
 * Save buckets, reload page, open panel, assert bucket + facts loaded, then generate and assert Angle label.
 */
test.describe('Buckets V2b persist reload generate @release-gate', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
    await switchToAllDataView(page);
  });

  test('save → reload → generate shows Angle label', async ({ page }) => {
    test.setTimeout(120_000);

    await expect(page.getByTestId('facts-list')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 30_000 });

    await openBucketsPanel(page);
    await page.getByTestId('buckets-add-name').fill('Angle 1');
    await page.getByTestId('buckets-add-btn').click();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('buckets-panel')).toBeHidden({ timeout: 3000 });
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 30_000 });

    const cards = page.getByTestId('fact-card');
    for (let i = 0; i < 2; i++) {
      const card = cards.nth(i);
      await expect(card).toBeVisible({ timeout: 10_000 });
      const addBtn = card.getByTestId('fact-add-to-bucket');
      await expect(addBtn).toBeVisible({ timeout: 10_000 });
      await addBtn.click({ timeout: 10_000 });
      const angleItem = page.getByRole('menuitem', { name: /Angle 1/ });
      await expect(angleItem).toBeVisible({ timeout: 10_000 });
      await angleItem.click({ timeout: 10_000 });
    }

    await openBucketsPanel(page);
    await expect(page.getByTestId('buckets-dirty')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('buckets-save').click();
    await expect(page.getByTestId('buckets-saved')).toBeVisible({ timeout: 10_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('facts-search-input')).toBeVisible({ timeout: 15_000 });

    await openBucketsPanel(page);
    await expect(page.getByRole('button', { name: /Generate \(2 facts\)/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Generate \(2 facts\)/ }).click();

    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('output-drawer-angle')).toContainText('Angle: Angle 1');
  });
});
