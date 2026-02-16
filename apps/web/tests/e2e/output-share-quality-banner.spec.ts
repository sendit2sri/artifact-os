/**
 * Output Share Page Quality Banner E2E - Share page shows read-only quality banner when output has issues.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test output-share-quality-banner.spec.ts
 */

import { test, expect } from './fixtures/seed';
import {
  generateSynthesis,
  assertDrawerSuccess,
  waitForAppIdle,
} from './helpers/synthesis';
import { gotoProject } from './helpers/nav';

test.describe('Output Share Quality Banner', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('share page of output with issues shows read-only quality banner and breakdown', async ({
    page,
    seed,
  }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);
    await waitForAppIdle(page);

    const banner = page.getByTestId('output-quality-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });

    const openShareBtn = page.getByTestId('output-drawer-open-share');
    await expect(openShareBtn).toBeVisible({ timeout: 5000 });
    const href = await openShareBtn.getAttribute('href');
    expect(href).toMatch(/\/output\/[a-f0-9-]+/);

    await page.goto(href!);
    await waitForAppIdle(page);

    await expect(page.getByTestId('output-page')).toBeVisible({ timeout: 5000 });
    const pageBanner = page.getByTestId('output-page-quality-banner');
    await expect(pageBanner).toBeVisible({ timeout: 5000 });
    const breakdown = page.getByTestId('output-quality-breakdown');
    await expect(breakdown).toBeVisible();
  });
});
