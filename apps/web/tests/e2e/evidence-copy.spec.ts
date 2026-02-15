import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import { openEvidence } from './helpers/evidence';

/**
 * Evidence Copy E2E - open evidence, click copy snippet, assert clipboard contains snippet.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Seed facts 1 and 2 have evidence_snippet; we open first fact and copy.
 */

test.describe('Evidence Copy @nightly', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open evidence, click copy snippet, clipboard contains snippet', async ({ page }) => {
    await page.getByTestId('view-tab-all').click();
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10000 });

    await openEvidence(page);

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('evidence-snippet')).toBeVisible({ timeout: 5000 });

    const snippetEl = page.getByTestId('evidence-snippet');
    const expectedSnippet = (await snippetEl.textContent()) ?? '';

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.getByTestId('evidence-copy-snippet').click();

    const clipboardText = await page.evaluate(() => {
      const cb = navigator?.clipboard;
      if (typeof cb?.readText !== 'function') return null;
      return cb.readText();
    });
    if (clipboardText === null) {
      test.skip(true, 'Clipboard API not available (headless/Docker)');
      return;
    }
    expect(clipboardText).toBe(expectedSnippet.trim());
  });
});
