/**
 * Generate from Approved E2E - click generate-from-approved, generates successfully,
 * assert quality stats approved=2.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Seed has fact1 APPROVED, fact3 APPROVED (2 approved).
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { selectTwoFacts, ensureOutputDrawerAfterGenerate } from './helpers/synthesis';

test.describe('Generate from Approved', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('click generate-from-approved, generates successfully, assert quality approved=2', async ({ page }) => {
    await switchToAllDataView(page);
    await selectTwoFacts(page);
    const approvedBtn = page.getByTestId('generate-from-approved');
    await expect(approvedBtn).toBeVisible({ timeout: 10000 });
    await approvedBtn.click();
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    await expect(page.getByTestId('output-quality-approved')).toContainText('2');
  });
});
