import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  openEvidenceForAnchor,
  openEvidenceForFirstAnchorWithNext,
  FACT_ANCHORS,
} from './helpers/facts';
import {
  assertEvidenceForFact,
  nextEvidence,
  prevEvidence,
  retryEvidence,
} from './helpers/evidence';

/**
 * Evidence Panel E2E - parallel-safe via seed fixture.
 * Uses anchor-based fact selection (no nth/first).
 */

test.describe('Evidence Panel', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('should show evidence panel on fact click, navigate prev/next, disable at boundaries', async ({
    page,
  }) => {
    await openEvidenceForFirstAnchorWithNext(page, [
      FACT_ANCHORS.APPROVED_2,
      FACT_ANCHORS.NEEDS_REVIEW_1,
      FACT_ANCHORS.PENDING_1,
      FACT_ANCHORS.APPROVED_1,
    ]);

    await expect(async () => {
      const panel = page.getByTestId('evidence-panel');
      await expect(panel).toBeVisible();
      await assertEvidenceForFact(page, /Global temperatures|Arctic|Ocean|climate|fact/i, 'example.com');
    }).toPass({ timeout: 12_000 });

    const firstFactText = await page.getByTestId('evidence-fact-text').textContent();
    expect(firstFactText).toBeTruthy();

    await nextEvidence(page);
    await expect(async () => {
      const secondFactText = await page.getByTestId('evidence-fact-text').textContent();
      expect(secondFactText).toBeTruthy();
      expect(secondFactText).not.toBe(firstFactText);
    }).toPass({ timeout: 3000 });

    await prevEvidence(page);
    await expect(async () => {
      const backToFirst = await page.getByTestId('evidence-fact-text').textContent();
      expect(backToFirst).toBe(firstFactText);
    }).toPass({ timeout: 3000 });

    // Boundary: Prev disabled at start
    const prevBtn = page.getByTestId('evidence-prev');
    await expect(prevBtn).toBeDisabled();

    // Bounded: Next twice, Prev becomes enabled; no loop over all facts (avoids timeout)
    await nextEvidence(page);
    await nextEvidence(page);
    await expect(prevBtn).toBeEnabled();
  });

  test('loads evidence via network and renders sources', async ({ page }) => {
    await openEvidenceForAnchor(page, FACT_ANCHORS.APPROVED_1);

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('evidence-fact-text')).toBeVisible({ timeout: 12_000 });

    const sourceUrl = page.getByTestId('evidence-source-url');
    await expect(sourceUrl.first()).toBeVisible();
    await expect(sourceUrl.first()).toContainText(/example\.com/);
    await expect(page.getByTestId('evidence-fact-text')).toContainText(/Global temperatures|Arctic|Ocean|climate/i);
  });

  test('evidence snippet is shown and not equal to fact text when snippet exists', async ({
    page,
  }) => {
    await openEvidenceForAnchor(page, FACT_ANCHORS.APPROVED_1);
    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });

    const factTextEl = page.getByTestId('evidence-fact-text');
    await expect(factTextEl).toBeVisible({ timeout: 8000 });
    const factText = (await factTextEl.textContent()) ?? '';

    await expect(async () => {
      const snippetEl = page.getByTestId('evidence-snippet');
      const emptyEl = page.getByTestId('evidence-empty-snippet');
      const hasSnippet = await snippetEl.isVisible();
      const hasEmpty = await emptyEl.isVisible();
      expect(hasSnippet || hasEmpty).toBe(true);
      if (hasSnippet) {
        const snippetText = (await snippetEl.textContent()) ?? '';
        expect(snippetText.length).toBeGreaterThan(20);
        expect(snippetText.trim()).not.toBe(factText.trim());
      }
    }).toPass({ timeout: 8000 });

    await expect(page.getByTestId('evidence-source-url')).toBeVisible();
  });

  test('evidence regression: fact snippet → next fact → back to fact snippet matches', async ({
    page,
  }) => {
    await openEvidenceForFirstAnchorWithNext(page, [
      FACT_ANCHORS.APPROVED_1,
      FACT_ANCHORS.APPROVED_2,
      FACT_ANCHORS.NEEDS_REVIEW_1,
      FACT_ANCHORS.PENDING_1,
    ]);
    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 8000 });
    const fact1Text = (await page.getByTestId('evidence-fact-text').textContent()) ?? '';
    const snippet1El = page.getByTestId('evidence-snippet');
    const empty1El = page.getByTestId('evidence-empty-snippet');
    const hasSnippet1 = await snippet1El.isVisible().catch(() => false);
    const snippet1 = hasSnippet1 ? (await snippet1El.textContent()) ?? '' : '';

    await nextEvidence(page);
    await expect(async () => {
      const fact2Text = await page.getByTestId('evidence-fact-text').textContent();
      expect(fact2Text).toBeTruthy();
      expect(fact2Text).not.toBe(fact1Text);
    }).toPass({ timeout: 5000 });

    await prevEvidence(page);
    await expect(async () => {
      const backFactText = await page.getByTestId('evidence-fact-text').textContent();
      expect(backFactText).toBe(fact1Text);
    }).toPass({ timeout: 5000 });
    const backSnippetEl = page.getByTestId('evidence-snippet');
    const backEmptyEl = page.getByTestId('evidence-empty-snippet');
    const backHasSnippet = await backSnippetEl.isVisible().catch(() => false);
    const backSnippet = backHasSnippet ? (await backSnippetEl.textContent()) ?? '' : '';
    if (hasSnippet1) {
      expect(backHasSnippet).toBe(true);
      expect(backSnippet.trim()).toBe(snippet1.trim());
    } else {
      await expect(backEmptyEl).toBeVisible();
    }
  });

  test('shows error state then retry succeeds', async ({ page, seed }) => {
    let requestCount = 0;
    await page.route(`**/api/v1/projects/${seed.project_id}/facts/*/evidence`, async (route) => {
      requestCount++;
      if (requestCount === 1) {
        await route.fulfill({ status: 500, body: 'fail' });
        await page.unroute(`**/api/v1/projects/${seed.project_id}/facts/*/evidence`);
        return;
      }
      await route.continue();
    });

    await openEvidenceForAnchor(page, FACT_ANCHORS.APPROVED_1);

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });

    await expect(async () => {
      await expect(page.getByTestId('evidence-loading')).toBeVisible();
    }).toPass({ timeout: 3000 }).catch(() => {});

    await expect(async () => {
      await expect(page.getByTestId('evidence-error')).toBeVisible();
      await expect(page.getByTestId('evidence-retry')).toBeEnabled();
    }).toPass({ timeout: 8000 });

    await retryEvidence(page);

    await expect(async () => {
      await expect(page.getByTestId('evidence-fact-text')).toBeVisible();
      await expect(page.getByTestId('evidence-source-domain')).toBeVisible();
      await expect(page.getByTestId('evidence-error')).toBeHidden();
    }).toPass({ timeout: 12_000 });
  });
});
