/**
 * Facts list E2E: seed with many facts (400), assert facts list visible,
 * click fact opens Evidence panel.
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';

test.describe('Virtualization', () => {
  test.beforeEach(async ({ page, seedLarge }) => {
    await gotoProject(page, seedLarge.project_id);
    await switchToAllDataView(page);
  });

  test('many facts: facts list visible, click fact opens Evidence panel', async ({
    page,
  }) => {
    await expect(page.getByTestId('facts-list')).toBeVisible({ timeout: 15_000 });
    const cards = page.getByTestId('fact-card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });

    await expect(async () => {
      const evidenceBtn = page.getByTestId('evidence-open').first();
      await evidenceBtn.click();
      await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 15_000 });
  });
});
