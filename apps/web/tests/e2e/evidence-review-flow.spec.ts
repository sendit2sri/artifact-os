import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import { waitForAppIdle } from './helpers/setup';

/**
 * Evidence Review Flow E2E - open evidence, toggle auto-advance, approve → next fact, assert badge.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('Evidence Review Flow', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open evidence for first fact, toggle auto-advance ON, approve → next fact, badge updated', async ({ page }) => {
    await page.getByTestId('view-tab-all').click();
    const first = page.getByTestId('fact-card').filter({ hasText: 'E2E_APPROVED_1' }).first();
    await expect(first).toBeVisible({ timeout: 10000 });

    await first.getByTestId('evidence-open').click();

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('evidence-review-bar')).toBeVisible({ timeout: 3000 });

    const autoAdvance = page.getByTestId('evidence-auto-advance-toggle');
    await expect(autoAdvance).toBeVisible();
    if (!(await autoAdvance.isChecked())) {
      await autoAdvance.check();
    }

    const firstFactText = await page.getByTestId('evidence-fact-text').textContent();

    await page.getByTestId('evidence-review-approve').click();
    await waitForAppIdle(page);

    await expect(async () => {
      const factTextNow = await page.getByTestId('evidence-fact-text').textContent();
      expect(factTextNow).not.toBe(firstFactText);
    }).toPass({ timeout: 5000 });

    await expect(first.getByTestId('fact-status-badge')).toContainText(/Approved/i);
  });
});
