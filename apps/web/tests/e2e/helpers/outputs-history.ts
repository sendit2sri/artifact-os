/**
 * Outputs History E2E helpers - stable selectors only.
 */

import { Page, expect } from '@playwright/test';

/** Open History drawer via outputs-history-button or output-drawer-open-history when output drawer covers it */
export async function openOutputsHistory(page: Page): Promise<void> {
  const outputDrawer = page.getByTestId('output-drawer');
  const inDrawerBtn = page.getByTestId('output-drawer-open-history');
  if (await outputDrawer.isVisible()) {
    await expect(inDrawerBtn).toBeVisible({ timeout: 5000 });
    await inDrawerBtn.click();
  } else {
    const btn = page.getByTestId('outputs-history-button');
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
  }
  const drawer = page.getByTestId('outputs-history-drawer');
  await expect(drawer).toBeVisible({ timeout: 5000 });
}

/** Assert history has at least one item */
export async function assertHistoryHasItems(page: Page): Promise<void> {
  const empty = page.getByTestId('outputs-history-empty');
  await expect(empty).toBeHidden();
  const items = page.getByTestId('outputs-history-item');
  await expect(items.first()).toBeVisible({ timeout: 5000 });
}

/** Click first history item to open OutputDrawer */
export async function openFirstHistoryItem(page: Page): Promise<void> {
  const openBtn = page.getByTestId('outputs-history-open').first();
  await expect(openBtn).toBeVisible({ timeout: 5000 });
  await openBtn.click();
}

/** Assert history shows empty state */
export async function assertHistoryEmpty(page: Page): Promise<void> {
  const empty = page.getByTestId('outputs-history-empty');
  await expect(empty).toBeVisible({ timeout: 5000 });
}

/** Close History drawer via outputs-history-close */
export async function closeOutputsHistory(page: Page): Promise<void> {
  const drawer = page.getByTestId('outputs-history-drawer');
  const closeBtn = page.getByTestId('outputs-history-close');
  if (await drawer.isVisible()) {
    await closeBtn.click();
  }
  await expect(drawer).toBeHidden();
}
