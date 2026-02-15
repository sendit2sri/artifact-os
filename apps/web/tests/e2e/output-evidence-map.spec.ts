/**
 * Output Evidence Map E2E - Evidence Map in OutputDrawer, View evidence opens EvidencePanelSimple.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test output-evidence-map.spec.ts
 */

import { test, expect } from './fixtures/seed';
import {
  generateSynthesis,
  assertDrawerSuccess,
} from './helpers/synthesis';
import { gotoProject } from './helpers/nav';

test.describe('Output Evidence Map', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('Evidence Map visible with 2 items, View evidence opens panel and shows fact/snippet', async ({ page, seed }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);

    const evidenceMap = page.getByTestId('output-evidence-map');
    await expect(evidenceMap).toBeVisible({ timeout: 5000 });

    const items = page.getByTestId('output-evidence-item');
    await expect(items).toHaveCount(2, { timeout: 5000 });

    const firstViewEvidence = page.getByTestId('output-evidence-open').first();
    await expect(firstViewEvidence).toBeVisible();
    await firstViewEvidence.click();

    const evidencePanel = page.getByTestId('evidence-panel');
    await expect(evidencePanel).toBeVisible({ timeout: 5000 });

    const factText = page.getByTestId('evidence-fact-text');
    await expect(factText).toBeVisible();
    await expect(factText).not.toBeEmpty();

    const snippet = page.getByTestId('evidence-snippet');
    const emptySnippet = page.getByTestId('evidence-empty-snippet');
    const hasSnippet = await snippet.isVisible().catch(() => false);
    const hasEmpty = await emptySnippet.isVisible().catch(() => false);
    expect(hasSnippet || hasEmpty).toBe(true);
  });
});
