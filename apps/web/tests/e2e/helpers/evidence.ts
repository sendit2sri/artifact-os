/**
 * Evidence Panel E2E helpers.
 * Uses stable selectors: evidence-panel, evidence-open, evidence-fact-text,
 * evidence-source-domain, evidence-source-url, evidence-prev, evidence-next, etc.
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function selectFirstFact(page: Page) {
  const openBtn = page.getByTestId('evidence-open').first();
  await openBtn.scrollIntoViewIfNeeded();
  await openBtn.click();
}

export async function openEvidence(page: Page) {
  // Panel opens when a fact is selected via evidence-open
  // Wait for fact click to trigger evidence panel/drawer and API call
  const openBtn = page.getByTestId('evidence-open').first();
  if (await openBtn.isVisible()) {
    await openBtn.scrollIntoViewIfNeeded();
    await openBtn.click();
    // Wait for evidence panel to appear (it might fetch data or use cached)
    const panel = page.getByTestId('evidence-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });
  }
}

/**
 * Open evidence panel by clicking evidence-open on the first visible fact card.
 * Ensures All view + wait for view to apply + stable selector (evidence-open).
 */
export async function openEvidenceForFirstFact(page: Page, options?: { timeout?: number }): Promise<void> {
  const timeout = options?.timeout ?? 10_000;

  const { switchToAllDataView } = await import('./nav');
  await switchToAllDataView(page);

  const firstCard = page.getByTestId('fact-card').first();
  await expect(firstCard).toBeVisible({ timeout });
  const openBtn = firstCard.getByTestId('evidence-open');
  await openBtn.scrollIntoViewIfNeeded();
  await openBtn.click();

  const panel = page.getByTestId('evidence-panel');
  await expect(panel).toBeVisible({ timeout });

  // Wait for panel to have content/empty/error/loading (not stuck)
  await expect(async () => {
    const factText = page.getByTestId('evidence-fact-text');
    const empty = page.getByTestId('evidence-empty');
    const error = page.getByTestId('evidence-error');
    const loading = page.getByTestId('evidence-loading');
    const hasContent = await factText.isVisible().catch(() => false);
    const emptyVisible = await empty.isVisible().catch(() => false);
    const errorVisible = await error.isVisible().catch(() => false);
    const isLoading = await loading.isVisible().catch(() => false);
    expect(hasContent || emptyVisible || errorVisible || isLoading).toBeTruthy();
  }).toPass({ timeout });

  const loading = page.getByTestId('evidence-loading');
  if (await loading.isVisible().catch(() => false)) {
    await expect(loading).toBeHidden({ timeout });
  }
}

export async function assertEvidenceForFact(
  page: Page,
  expectedTextRegex: RegExp | string,
  expectedDomain: string
) {
  const panel = page.getByTestId('evidence-panel');
  await panel.waitFor({ state: 'visible', timeout: 5000 });

  const factText = page.getByTestId('evidence-fact-text');
  await expect(factText).toBeVisible();

  const regex = typeof expectedTextRegex === 'string' ? new RegExp(expectedTextRegex) : expectedTextRegex;
  await expect(factText).toContainText(regex);

  const domainEl = page.getByTestId('evidence-source-domain');
  await expect(domainEl).toBeVisible();
  await expect(domainEl).toContainText(expectedDomain);
}

/**
 * Click Next and wait until evidence-fact-text changes (deterministic, no fixed sleeps).
 */
export async function nextEvidence(page: Page) {
  const factTextEl = page.getByTestId('evidence-fact-text');
  const prevText = (await factTextEl.textContent()) ?? '';
  await page.getByTestId('evidence-next').click();
  await expect(factTextEl).not.toHaveText(prevText.trim(), { timeout: 5000 });
}

/**
 * Click Prev and wait until evidence-fact-text changes (deterministic, no fixed sleeps).
 */
export async function prevEvidence(page: Page) {
  const factTextEl = page.getByTestId('evidence-fact-text');
  const prevText = (await factTextEl.textContent()) ?? '';
  await page.getByTestId('evidence-prev').click();
  await expect(factTextEl).not.toHaveText(prevText.trim(), { timeout: 5000 });
}

export async function closeEvidence(page: Page) {
  await page.getByTestId('evidence-close').click();
}

export async function retryEvidence(page: Page) {
  await page.getByTestId('evidence-retry').click();
}

export async function assertEvidenceLoadingThenLoaded(page: Page, timeout = 8000) {
  const loading = page.getByTestId('evidence-loading');
  const factText = page.getByTestId('evidence-fact-text');
  await expect(async () => {
    const loadingVisible = await loading.isVisible().catch(() => false);
    if (loadingVisible) {
      await expect(loading).toBeVisible();
    }
    await expect(factText).toBeVisible();
  }).toPass({ timeout });
}
