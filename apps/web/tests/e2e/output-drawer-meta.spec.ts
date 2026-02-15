import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  selectTwoFacts,
  clickGenerateAndWaitForPost,
  waitForSynthesisResult,
  closeDrawer,
} from './helpers/synthesis';

/**
 * Output Drawer meta E2E - meta facts/sources visible, View selected facts opens drawer.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('Output Drawer Meta', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('generate synthesis then assert meta facts/sources and View selected facts', async ({ page, seed }) => {
    await selectTwoFacts(page);
    await clickGenerateAndWaitForPost(page, seed.project_id);
    const result = await waitForSynthesisResult(page, seed.project_id);
    if (result === 'builder') {
      await page.getByTestId('synthesis-builder-generate-split').click();
    }

    await expect(async () => {
      const drawer = page.getByTestId('output-drawer');
      await expect(drawer).toBeVisible();
    }).toPass({ timeout: 20000 });

    const meta = page.getByTestId('output-drawer-meta');
    await expect(meta).toBeVisible();
    await expect(page.getByTestId('output-drawer-meta-facts')).toBeVisible();
    await expect(page.getByTestId('output-drawer-meta-sources')).toBeVisible();

    const viewFactsBtn = page.getByTestId('output-drawer-view-selected-facts');
    await expect(viewFactsBtn).toBeVisible();
    await viewFactsBtn.click();

    await expect(page.getByTestId('selected-facts-drawer')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('selected-facts-count')).toBeVisible();
  });
});
