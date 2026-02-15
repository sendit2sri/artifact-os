/**
 * Generate from Pinned E2E - seed pinned facts >= 2, click generate-from-pinned,
 * generates, assert output quality pinned>=2.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { seedWithPinnedFacts } from './helpers/trust-gate';
import { selectTwoFacts, ensureOutputDrawerAfterGenerate } from './helpers/synthesis';

test.describe('Generate from Pinned', () => {
  test.beforeEach(async ({ page, seed }) => {
    await seedWithPinnedFacts(seed.project_id, seed.source_id);
    await gotoProject(page, seed.project_id);
  });

  test('click generate-from-pinned, generates, assert quality pinned>=2', async ({ page }) => {
    await switchToAllDataView(page);
    await selectTwoFacts(page);
    const pinnedBtn = page.getByTestId('generate-from-pinned');
    await expect(pinnedBtn).toBeVisible({ timeout: 10000 });
    await expect(pinnedBtn).toBeEnabled();
    await pinnedBtn.click();
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    await expect(page.getByTestId('output-quality-pinned')).toContainText(/[2-9]/);
  });
});
