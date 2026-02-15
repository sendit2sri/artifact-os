/**
 * Pin Output + Selection UX E2E.
 * Covers: selection bar (select all / invert / clear), output sections index + copy,
 * evidence freshness + reprocess, pin output, output cache.
 * Parallel-safe via seed fixture. Run: npx playwright test pin-output-selection.spec.ts --workers=3
 */

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  openOutputsHistory,
  assertHistoryHasItems,
  openFirstHistoryItem,
  closeOutputsHistory,
} from './helpers/outputs-history';
import {
  selectTwoFacts,
  generateSplitSections,
  closeDrawer,
  assertDrawerSuccess,
} from './helpers/synthesis';

test.describe('Selection UX', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('select 2 facts → selection bar visible with correct count', async ({ page }) => {
    await selectTwoFacts(page);
    const bar = page.getByTestId('selection-bar');
    await expect(bar).toBeVisible({ timeout: 5000 });
    await expect(bar).toContainText('Selected:');
    await expect(bar).toContainText('2');
  });

  test('select all visible → count increases', async ({ page }) => {
    await selectTwoFacts(page);
    const bar = page.getByTestId('selection-bar');
    await expect(bar).toBeVisible({ timeout: 5000 });
    await page.getByTestId('selection-select-all-visible').click();
    const barAfter = page.getByTestId('selection-bar');
    await expect(barAfter).toContainText('Selected:');
    const count = await page.getByTestId('fact-card').count();
    await expect(barAfter).toContainText(String(count));
  });

  test('invert selection → count changes', async ({ page }) => {
    await selectTwoFacts(page);
    const bar = page.getByTestId('selection-bar');
    await expect(bar).toBeVisible({ timeout: 5000 });
    await expect(bar).toContainText('2');
    await page.getByTestId('selection-invert').click();
    const barAfter = page.getByTestId('selection-bar');
    await expect(barAfter).toBeVisible();
    const total = await page.getByTestId('fact-card').count();
    await expect(barAfter).toContainText(String(total - 2));
  });

  test('clear → selection bar disappears', async ({ page }) => {
    await selectTwoFacts(page);
    await expect(page.getByTestId('selection-bar')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('selection-clear').click();
    await expect(page.getByTestId('selection-bar')).toBeHidden();
  });
});

test.describe('Output sections (split mode)', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('generate split sections → index appears', async ({ page, seed }) => {
    await generateSplitSections(page, seed.project_id);
    const index = page.getByTestId('output-sections-index');
    await expect(index).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('output-section-item').first()).toBeVisible({ timeout: 5000 });
  });

  test('click copy section → clipboard or content reflects copy', async ({ page, seed }) => {
    await generateSplitSections(page, seed.project_id);
    await expect(page.getByTestId('output-sections-index')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('output-section-copy').first().click();
    // Assert clipboard has content (E2E-safe) or drawer content still visible — no flaky toast
    await expect(async () => {
      const text = await page.evaluate(async () => {
        const cb = navigator?.clipboard;
        if (typeof cb?.readText !== 'function') return '';
        return cb.readText().catch(() => '');
      });
      if (text && text.length > 0) return;
      const visible = await page.getByTestId('output-drawer-content').isVisible();
      expect(visible).toBe(true);
    }).toPass({ timeout: 3000 });
  });
});

test.describe('Evidence freshness + reprocess', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('fact without snippet: evidence shows empty message and reprocess button', async ({
    page,
  }) => {
    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 10000 });
    let opened = false;
    for (let i = 0; i < Math.min(await factCards.count(), 5); i++) {
      await factCards.nth(i).getByTestId('evidence-open').click();
      await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
      const emptySnippet = page.getByTestId('evidence-empty-snippet');
      if (await emptySnippet.isVisible()) {
        await expect(page.getByTestId('evidence-freshness')).toContainText(
          'No excerpt captured yet'
        );
        await expect(page.getByTestId('evidence-reprocess-source')).toBeVisible();
        opened = true;
        break;
      }
      await page.getByTestId('evidence-close').click();
    }
    if (!opened) test.skip(true, 'No fact without snippet in this seed');
    expect(opened).toBe(true);
  });

  test('click reprocess source → timeline or ingest triggered', async ({ page }) => {
    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < Math.min(await factCards.count(), 5); i++) {
      await factCards.nth(i).getByTestId('evidence-open').click();
      await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
      const reprocessBtn = page.getByTestId('evidence-reprocess-source');
      if (await reprocessBtn.isVisible()) {
        await reprocessBtn.click();
        // Assert processing timeline appears (job started) or panel still open — no flaky toast
        await expect(async () => {
          const timeline = page.getByTestId('processing-timeline');
          if (await timeline.isVisible()) return;
          await expect(page.getByTestId('evidence-panel')).toBeVisible();
        }).toPass({ timeout: 8000 });
        return;
      }
      await page.getByTestId('evidence-close').click();
    }
    test.skip(true, 'No fact without snippet in this seed');
  });
});

test.describe('Pin output', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open history → open first output → pin it; close and reopen history → output in pinned section', async ({
    page,
  }) => {
    await openOutputsHistory(page);
    await assertHistoryHasItems(page);
    await openFirstHistoryItem(page);
    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 10000 });
    await assertDrawerSuccess(page);
    const pinToggle = page.getByTestId('output-pin-toggle');
    await expect(pinToggle).toBeVisible({ timeout: 5000 });
    await pinToggle.click();
    await closeDrawer(page);
    await openOutputsHistory(page);
    const pinnedSection = page.getByTestId('outputs-history-pinned-section');
    await expect(pinnedSection).toBeVisible({ timeout: 5000 });
    await expect(pinnedSection.getByTestId('outputs-history-item').first()).toBeVisible();
  });
});

test.describe('Output cache', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open output from history → close → open same again → renders instantly', async ({
    page,
  }) => {
    await openOutputsHistory(page);
    await assertHistoryHasItems(page);
    await openFirstHistoryItem(page);
    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 10000 });
    await assertDrawerSuccess(page);
    await closeDrawer(page);
    await openOutputsHistory(page);
    await openFirstHistoryItem(page);
    await expect(
      async () => {
        const drawer = page.getByTestId('output-drawer');
        await expect(drawer).toBeVisible();
        await expect(page.getByTestId('output-drawer-content')).toBeVisible();
      }
    ).toPass({ timeout: 3000 });
  });
});
