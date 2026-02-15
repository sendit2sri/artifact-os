/**
 * Selected Facts Drawer E2E helpers - stable selectors only.
 */

import { Page, expect } from '@playwright/test';

/** Open Selected Facts drawer via selected-facts-open (only visible when selection size > 0) */
export async function openSelectedFactsDrawer(page: Page): Promise<void> {
  const btn = page.getByTestId('selected-facts-open');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  const drawer = page.getByTestId('selected-facts-drawer');
  await expect(drawer).toBeVisible({ timeout: 5000 });
}

/** Assert drawer shows expected fact count */
export async function assertSelectedFactsCount(page: Page, count: number): Promise<void> {
  const el = page.getByTestId('selected-facts-count');
  await expect(el).toContainText(String(count));
}

/** Remove one fact by clicking selected-facts-remove on first item */
export async function removeFirstSelectedFact(page: Page): Promise<void> {
  const removeBtn = page.getByTestId('selected-facts-remove').first();
  await expect(removeBtn).toBeVisible({ timeout: 3000 });
  await removeBtn.click();
}

/** Click Generate in Selected Facts drawer */
export async function clickSelectedFactsGenerate(page: Page): Promise<void> {
  const btn = page.getByTestId('selected-facts-generate');
  await expect(btn).toBeVisible({ timeout: 3000 });
  await expect(btn).toBeEnabled();
  await btn.click();
}

/** Close Selected Facts drawer */
export async function closeSelectedFactsDrawer(page: Page): Promise<void> {
  const closeBtn = page.getByTestId('selected-facts-close');
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
  }
  await expect(page.getByTestId('selected-facts-drawer')).toBeHidden();
}
