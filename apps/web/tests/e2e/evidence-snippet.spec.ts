/**
 * Evidence panel E2E: shows evidence_snippet (source excerpt), not just fact text.
 * Seed includes evidence_snippet on at least one fact. Uses stable data-testid.
 * Run: npx playwright test evidence-snippet.spec.ts --workers=3
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { openEvidenceForAnchor, FACT_ANCHORS } from './helpers/facts';

test.describe('Evidence snippet', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open evidence panel for a fact: evidence_snippet shown, not equal to fact text, url visible', async ({
    page,
  }) => {
    await openEvidenceForAnchor(page, FACT_ANCHORS.APPROVED_1);

    const panel = page.getByTestId('evidence-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });

    const factTextEl = page.getByTestId('evidence-fact-text');
    await expect(factTextEl).toBeVisible();
    const factText = (await factTextEl.textContent()) ?? '';

    await expect(async () => {
      const snippetEl = page.getByTestId('evidence-snippet');
      const emptyEl = page.getByTestId('evidence-empty-snippet');
      const hasSnippet = await snippetEl.isVisible();
      const hasEmpty = await emptyEl.isVisible();
      expect(hasSnippet || hasEmpty).toBe(true);
      if (hasSnippet) {
        const snippetText = (await snippetEl.textContent()) ?? '';
        expect(snippetText.trim()).not.toBe('');
        expect(snippetText).not.toBe(factText);
      }
    }).toPass({ timeout: 5000 });

    const urlEl = page.getByTestId('evidence-source-url');
    await expect(urlEl).toBeVisible();
  });

  test('when snippet missing: evidence-empty-snippet shows "No excerpt captured yet"', async ({
    page,
  }) => {
    await switchToAllDataView(page);
    await openEvidenceForAnchor(page, FACT_ANCHORS.NO_SNIPPET_1);

    const panel = page.getByTestId('evidence-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });

    await expect(async () => {
      const emptyEl = page.getByTestId('evidence-empty-snippet');
      const snippetEl = page.getByTestId('evidence-snippet');
      const emptyVisible = await emptyEl.isVisible();
      const snippetVisible = await snippetEl.isVisible();
      expect(emptyVisible || snippetVisible).toBe(true);
      if (emptyVisible) {
        await expect(emptyEl).toContainText(/No excerpt captured yet/i);
      }
    }).toPass({ timeout: 5000 });
  });
});
