/**
 * Output Share Page Evidence Map E2E - Share page shows evidence map and Open source links.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test output-share-evidence.spec.ts
 */

import { test, expect } from './fixtures/seed';
import {
  generateSynthesis,
  assertDrawerSuccess,
} from './helpers/synthesis';
import { gotoProject } from './helpers/nav';

test.describe('Output Share Evidence', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('generate output, open share page, evidence map exists with items and Open source link', async ({ page, seed }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);

    const openShareBtn = page.getByTestId('output-drawer-open-share');
    await expect(openShareBtn).toBeVisible({ timeout: 5000 });
    const href = await openShareBtn.getAttribute('href');
    expect(href).toMatch(/\/output\/[a-f0-9-]+/);

    await page.goto(href!);

    await expect(page.getByTestId('output-page')).toBeVisible({ timeout: 5000 });
    const evidenceMap = page.getByTestId('output-page-evidence-map');
    await expect(evidenceMap).toBeVisible({ timeout: 5000 });

    const items = page.getByTestId('output-page-evidence-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const openSourceLinks = page.getByTestId('output-page-evidence-open-source');
    await expect(openSourceLinks.first()).toBeVisible({ timeout: 5000 });
    const linkCount = await openSourceLinks.count();
    expect(linkCount).toBeGreaterThanOrEqual(1);
  });
});
