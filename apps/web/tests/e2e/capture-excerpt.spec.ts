/**
 * Capture Excerpt E2E - capture source excerpt for a fact.
 * Release gate: snippet + persistence (no highlight flake).
 * Nightly: full highlight verification.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';

const SOURCE_CONTENT =
  'Recent studies indicate that global temperatures have risen by approximately 1.1°C since pre-industrial times. ' +
  'This warming trend is primarily driven by human activities. ' +
  'Additional filler text to ensure indices are valid and highlight spans render correctly.';

async function routeSourceContent(page: { route: (url: string, handler: (route: import('@playwright/test').Route) => Promise<void>) => Promise<void> }) {
  await page.route('**/projects/*/sources/content*', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.includes('/sources/content')) return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        content: SOURCE_CONTENT,
        format: 'text',
        text: SOURCE_CONTENT,
        markdown: null,
        html: null,
        title: 'Climate Change Research Summary',
        url: 'https://example.com/climate-research',
        domain: 'example.com',
      }),
    });
  });
}

test.describe('Capture Excerpt @release-gate', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('capture excerpt → snippet appears and persists after reopen', async ({ page, seed }) => {
    await routeSourceContent(page);
    await switchToAllDataView(page);

    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 10000 });

    const factCard = factCards.filter({ hasText: '[E2E:APPROVED-1]' }).first();
    await expect(factCard).toBeVisible({ timeout: 5000 });
    await factCard.getByTestId('evidence-open').click();

    const panel = page.getByTestId('evidence-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('evidence-fact-text')).toBeVisible({ timeout: 8000 });

    await page.getByTestId('evidence-capture-excerpt').click();
    const captureUI = page.getByTestId('evidence-capture-ui');
    await expect(captureUI).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('source-content-viewer')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('source-content-viewer').getByText(/global temperatures have risen/i)).toBeVisible({ timeout: 5000 });

    const startInput = captureUI.getByPlaceholder('Start');
    const endInput = captureUI.getByPlaceholder('End');
    await startInput.fill('0');
    await endInput.fill('80');

    const captureEndpoint = new RegExp(`/api/v1/projects/${seed.project_id}/facts/.+/capture_excerpt`);
    await Promise.all([
      page.waitForResponse(
        (r) => {
          const u = new URL(r.url());
          return (
            r.request().method() === 'POST' &&
            r.status() === 200 &&
            captureEndpoint.test(u.pathname)
          );
        },
        { timeout: 15000 }
      ),
      page.getByTestId('evidence-capture-save').click(),
    ]);

    // Assert snippet appears
    const snippet = page.getByTestId('evidence-snippet');
    await expect(snippet).toBeVisible({ timeout: 8000 });
    const snippetText = (await snippet.textContent()) ?? '';
    expect(snippetText.length).toBeGreaterThan(20);

    // Persistence: close panel, reopen, snippet still there
    await page.getByTestId('evidence-close').click();
    await expect(panel).toBeHidden({ timeout: 5000 });
    await factCard.getByTestId('evidence-open').click();
    await expect(panel).toBeVisible({ timeout: 5000 });
    const snippetAfter = page.getByTestId('evidence-snippet');
    await expect(snippetAfter).toBeVisible({ timeout: 5000 });
    const textAfter = (await snippetAfter.textContent()) ?? '';
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(normalize(textAfter)).toBe(normalize(snippetText));
  });
});

test.describe('Capture Excerpt highlight @nightly', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('capture excerpt → highlight visible and correct range', async ({ page, seed }) => {
    await routeSourceContent(page);
    await switchToAllDataView(page);

    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 10000 });

    const factCard = factCards.filter({ hasText: '[E2E:APPROVED-1]' }).first();
    await expect(factCard).toBeVisible({ timeout: 5000 });
    await factCard.getByTestId('evidence-open').click();

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('evidence-fact-text')).toBeVisible({ timeout: 8000 });

    await page.getByTestId('evidence-capture-excerpt').click();
    const captureUI = page.getByTestId('evidence-capture-ui');
    await expect(captureUI).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('source-content-viewer')).toBeVisible({ timeout: 5000 });

    const startInput = captureUI.getByPlaceholder('Start');
    const endInput = captureUI.getByPlaceholder('End');
    await startInput.fill('0');
    await endInput.fill('80');

    const captureEndpoint = new RegExp(`/api/v1/projects/${seed.project_id}/facts/.+/capture_excerpt`);
    await Promise.all([
      page.waitForResponse(
        (r) => {
          const u = new URL(r.url());
          return (
            r.request().method() === 'POST' &&
            r.status() === 200 &&
            captureEndpoint.test(u.pathname)
          );
        },
        { timeout: 15000 }
      ),
      page.getByTestId('evidence-capture-save').click(),
    ]);

    await expect(page.getByTestId('evidence-snippet')).toBeVisible({ timeout: 8000 });

    const highlight = page.getByTestId('source-highlight');
    await expect(async () => {
      const visible = await highlight.isVisible().catch(() => false);
      if (!visible) {
        const hasNoContent = await page
          .getByText(/No content available|Source content not available/i)
          .isVisible()
          .catch(() => false);
        throw new Error(`highlight not visible (noContent=${hasNoContent})`);
      }
    }).toPass({ timeout: 8000 });
  });
});
