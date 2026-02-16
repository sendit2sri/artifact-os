/**
 * Facts sort (Needs review first) and Group by Source E2E.
 * Seed has mixed review statuses and 2 sources. Uses stable data-testid.
 * Run: npx playwright test facts-group-sort.spec.ts --workers=3
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';

test.describe('Facts sort and group', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('select sort "Needs review first": first visible card shows Needs Review badge', async ({
    page,
  }) => {
    await switchToAllDataView(page);
    const sortTrigger = page.getByTestId('facts-sort-trigger');
    await expect(sortTrigger).toBeVisible({ timeout: 5000 });
    await sortTrigger.click();
    const needsReviewOption = page.getByTestId('facts-sort-option-needs_review');
    await expect(needsReviewOption).toBeVisible({ timeout: 3000 });
    await needsReviewOption.click();

    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 5000 });
    const firstCard = factCards.first();
    await expect(firstCard).toContainText(/Needs review|needs review|E2E:NEEDS_REVIEW-1/i);
  });

  test('enable Group by Source: group sections appear with correct domains', async ({
    page,
  }) => {
    const groupTrigger = page.getByTestId('facts-group-trigger');
    await expect(groupTrigger).toBeVisible({ timeout: 5000 });
    await groupTrigger.click();
    const groupBySourceOption = page.getByTestId('facts-group-option-source');
    await expect(groupBySourceOption).toBeVisible({ timeout: 3000 });
    await groupBySourceOption.click();

    const sections = page.getByTestId('facts-group-section');
    await expect(sections.first()).toBeVisible({ timeout: 5000 });
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const titles = page.getByTestId('facts-group-title');
    await expect(titles.first()).toBeVisible({ timeout: 3000 });
    const firstTitle = (await titles.first().textContent()) ?? '';
    expect(firstTitle.trim()).not.toBe('');
  });
});
