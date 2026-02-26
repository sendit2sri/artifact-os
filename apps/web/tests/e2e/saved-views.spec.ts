/**
 * Saved Views E2E: create, apply, set default, reload with clean URL.
 * Uses stable data-testid. Deterministic + parallel safe.
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { closeOverlays, ensureFactsControlsOpen } from './helpers/ui';

test.describe('Saved Views', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('save current state as view, change state, apply view restores state', async ({
    page,
    seed,
  }) => {
    await switchToAllDataView(page);
    await closeOverlays(page);
    await ensureFactsControlsOpen(page);
    const sortTrigger = page.getByTestId('facts-sort-trigger');
    await expect(sortTrigger).toBeVisible({ timeout: 5000 });
    await sortTrigger.click();
    await page.getByTestId('facts-sort-option-needs_review').click();

    const groupTrigger = page.getByTestId('facts-group-trigger');
    await groupTrigger.click();
    await page.getByTestId('facts-group-option-source').click();

    const searchInput = page.getByTestId('facts-search-input');
    await searchInput.fill('climate');

    await page.getByTestId('views-trigger').click();
    await expect(page.getByTestId('views-panel')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('views-create-input').fill('My View');
    await page.getByTestId('views-create-save').click();

    await expect(async () => {
      await page.getByTestId('views-trigger').click();
      await expect(page.getByTestId('views-item').first()).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 15_000 });

    await sortTrigger.click();
    await page.getByRole('option', { name: /newest first/i }).click();
    await searchInput.fill('');
    await groupTrigger.click();
    await page.getByRole('option', { name: 'No grouping' }).click();

    await page.getByTestId('views-trigger').click();
    await page.getByTestId('views-apply').first().click();

    await expect(async () => {
      await expect(sortTrigger).toContainText(/needs review/i);
    }).toPass({ timeout: 10_000 });
    await expect(searchInput).toHaveValue('climate');
    await expect(groupTrigger).toContainText(/source/i);
  });

  test('set as default, reload with clean URL, view auto-applied', async ({
    page,
    seed,
  }) => {
    await switchToAllDataView(page);
    await closeOverlays(page);
    await ensureFactsControlsOpen(page);
    await page.getByTestId('facts-sort-trigger').click();
    await page.getByTestId('facts-sort-option-needs_review').click();
    await page.getByTestId('views-trigger').click();
    await expect(page.getByTestId('views-panel')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('views-create-input').fill('Default View');
    await page.getByTestId('views-create-save').click();

    await expect(async () => {
      await page.getByTestId('views-trigger').click();
      await expect(page.getByTestId('views-item').first()).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId('views-set-default').first().click();
    await page.getByTestId('views-trigger').click();

    await page.goto(`/project/${seed.project_id}`, { waitUntil: 'domcontentloaded' });
    await ensureFactsControlsOpen(page);
    await expect(async () => {
      await expect(page.getByTestId('facts-sort-trigger')).toContainText(/needs review/i);
    }).toPass({ timeout: 15_000 });
  });
});
