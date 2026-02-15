/**
 * Output Share Page E2E - Share button copies link, /output/[id] shows read-only page.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test output-share-page.spec.ts --workers=3
 */

import { test, expect } from './fixtures/seed';
import {
  generateSynthesis,
  assertDrawerSuccess,
  closeDrawer,
} from './helpers/synthesis';
import { gotoProject } from './helpers/nav';

test.describe('Output Share Page', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('generate synthesis, open share page via link, assert title/meta/content', async ({ page, seed }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);

    const openShareBtn = page.getByTestId('output-drawer-open-share');
    await expect(openShareBtn).toBeVisible({ timeout: 5000 });
    const href = await openShareBtn.getAttribute('href');
    expect(href).toMatch(/\/output\/[a-f0-9-]+/);

    await page.goto(href!);

    await expect(page.getByTestId('output-page')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('output-page-title')).toBeVisible();
    await expect(page.getByTestId('output-page-meta')).toBeVisible();
    await expect(page.getByTestId('output-page-content')).toBeVisible();
    await expect(page.getByTestId('output-page-copy-link')).toBeVisible();
    await expect(page.getByTestId('output-page-back')).toBeVisible();
  });
});
