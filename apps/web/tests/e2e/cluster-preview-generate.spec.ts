import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView, groupBySource } from './helpers/nav';
import { seedWithSimilarFacts } from './helpers/collapse-similar';
import { ensureFactsControlsOpen } from './helpers/ui';
import { waitForAppIdle } from './helpers/setup';
import {
  selectOneFactPerGroup,
  selectFirstNVisibleFacts,
  clickGenerate,
  ensureOutputDrawerAfterGenerate,
} from './helpers/synthesis';

/**
 * Cluster Preview Generate E2E - grouped selection path.
 * seedWithSimilarFacts produces 2 sources → 2 groups; selectOneFactPerGroup selects 1 per group.
 * Fallback: if only 1 group, use selectFirstNVisibleFacts.
 */

test.describe('Cluster Preview Generate', () => {
  test.beforeEach(async ({ page, seed }) => {
    await seedWithSimilarFacts(seed.project_id, seed.source_id);
    await gotoProject(page, seed.project_id);
  });

  test('grouped selection (2 groups), Generate opens cluster preview, confirm, output drawer content > 80', async ({
    page,
  }) => {
    await switchToAllDataView(page);
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10000 });

    await ensureFactsControlsOpen(page);
    await groupBySource(page);
    await waitForAppIdle(page);

    const sectionCount = await page.getByTestId('facts-group-section').count();
    if (sectionCount >= 2) {
      await selectOneFactPerGroup(page, 2);
    } else {
      await selectFirstNVisibleFacts(page, 2, { assertSelectedCount: true });
    }
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    const content = page.getByTestId('output-drawer-content');
    await expect(content).toBeVisible({ timeout: 5000 });
    const text = (await content.textContent()) ?? '';
    expect(text.length).toBeGreaterThan(80);
    expect(text).toContain('Sources:');
    expect(text).toContain('Mode:');
  });
});
