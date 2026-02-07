/**
 * E2E Synthesis Test Helpers
 *
 * 100% stable-selector driven, parallel-safe.
 * No text matching, no arbitrary sleeps, no Promise.race.
 */

import { Page, expect } from '@playwright/test';

export type SynthesisResult = 'drawer' | 'builder' | 'error';

/**
 * Select exactly two facts from the fact list
 */
export async function selectTwoFacts(page: Page): Promise<void> {
  const factCards = page.getByTestId('fact-card');
  await expect(factCards.first()).toBeVisible({ timeout: 10000 });
  await factCards.first().getByTestId('fact-select-button').click();
  await factCards.nth(1).getByTestId('fact-select-button').click();
}

/**
 * Click the Generate button (stable selector only)
 */
export async function clickGenerate(page: Page): Promise<void> {
  const generateBtn = page.getByTestId('generate-synthesis');
  await expect(generateBtn).toBeEnabled({ timeout: 5000 });
  await generateBtn.click();
}

/**
 * Wait for synthesis result: error → drawer → builder (visibility only, no extra waits in loop).
 * Returns 'builder' only when builder is actually visible (not just attached).
 */
export async function waitForSynthesisResult(page: Page, timeout = 10000): Promise<SynthesisResult> {
  let result: SynthesisResult | null = null;

  await expect(async () => {
    const errorBanner = page.getByTestId('synthesis-error-banner');
    const drawer = page.getByTestId('output-drawer');
    const builder = page.getByTestId('synthesis-builder');

    if (await errorBanner.isVisible()) {
      result = 'error';
      return;
    }
    if (await drawer.isVisible()) {
      result = 'drawer';
      return;
    }
    if (await builder.isVisible()) {
      result = 'builder';
      return;
    }
    throw new Error('Waiting for synthesis result...');
  }).toPass({ timeout });

  if (result == null) {
    throw new Error('Synthesis result was not determined');
  }
  return result;
}

/**
 * Complete SynthesisBuilder flow: click split, wait for drawer
 */
export async function completeSynthesisBuilder(page: Page): Promise<void> {
  const builder = page.getByTestId('synthesis-builder');
  await expect(builder).toBeVisible();
  await page.getByTestId('synthesis-builder-generate-split').click();
  const drawer = page.getByTestId('output-drawer');
  await expect(drawer).toBeVisible({ timeout: 30000 });
}

/**
 * Assert OutputDrawer opened with valid E2E content
 */
export async function assertDrawerSuccess(page: Page): Promise<void> {
  const drawer = page.getByTestId('output-drawer');
  await expect(drawer).toBeVisible();

  const content = page.getByTestId('output-drawer-content');
  await expect(content).toBeVisible();

  const text = await content.textContent();
  expect(text).toBeTruthy();
  expect(text!.length).toBeGreaterThan(50);
  expect(text).toContain('Sources:');
  expect(text).toContain('Mode:');
}

/**
 * Assert error state: banner visible, drawer and builder hidden; optional message match
 */
export async function assertErrorState(page: Page, expectedMessage?: RegExp): Promise<void> {
  const errorBanner = page.getByTestId('synthesis-error-banner');
  const drawer = page.getByTestId('output-drawer');
  const builder = page.getByTestId('synthesis-builder');

  await expect(errorBanner).toBeVisible({ timeout: 10000 });
  await expect(drawer).toBeHidden();
  await expect(builder).toBeHidden();

  if (expectedMessage) {
    await expect(errorBanner).toContainText(expectedMessage);
  }
}

/**
 * Open Last Output drawer via stable selector
 */
export async function openLastOutput(page: Page): Promise<void> {
  const lastOutputBtn = page.getByTestId('last-output-button');
  await expect(lastOutputBtn).toBeEnabled({ timeout: 5000 });
  await lastOutputBtn.click();
  const drawer = page.getByTestId('output-drawer');
  await expect(drawer).toBeVisible({ timeout: 5000 });
}

/**
 * Close OutputDrawer: click only if visible, then assert hidden
 */
export async function closeDrawer(page: Page): Promise<void> {
  const drawer = page.getByTestId('output-drawer');
  const closeBtn = page.getByTestId('output-drawer-close');

  if (await drawer.isVisible()) {
    await closeBtn.click();
  }
  await expect(drawer).toBeHidden();
}

/**
 * Full flow: select facts, generate, wait for result; complete builder if needed
 */
export async function generateSynthesis(page: Page): Promise<SynthesisResult> {
  await selectTwoFacts(page);
  await clickGenerate(page);
  const result = await waitForSynthesisResult(page);

  if (result === 'builder') {
    await completeSynthesisBuilder(page);
    return 'drawer';
  }
  return result;
}
