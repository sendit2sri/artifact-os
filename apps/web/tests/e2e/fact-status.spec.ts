import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Fact status E2E - Approve / Needs Review / Flag buttons update state and persist.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test fact-status.spec.ts --workers=3
 */

test.describe('Fact Status', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('Approve button updates fact state and shows toast; persists after reload', async ({ page }) => {
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10_000 });

    const firstCard = page.getByTestId('fact-card').first();
    const approveBtn = firstCard.getByTestId('fact-status-approve');
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    await expect(async () => {
      const toast = page.getByRole('status').filter({ hasText: /Approved|Fact Approved/i });
      await expect(toast).toBeVisible();
    }).toPass({ timeout: 5000 });

    await expect(async () => {
      const card = page.getByTestId('fact-card').first();
      await expect(card).toContainText(/Approved/);
    }).toPass({ timeout: 5000 });

    await page.reload();
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('fact-card').first()).toContainText(/Approved/);
  });
});
