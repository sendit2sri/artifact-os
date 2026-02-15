import { expect, type Locator } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Close transient overlays (command palette, open dropdowns) so toolbar clicks
 * are not intercepted. Call before clicking facts-sort-trigger, views-trigger, etc.
 */
export async function closeOverlays(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);
}

/**
 * Open Facts Controls sheet when the Controls button is visible (< md).
 * Call before interacting with toggle-collapse-similar, facts-dedup-trigger, etc.
 */
export async function ensureFactsControlsOpen(page: Page): Promise<void> {
  const openBtn = page.getByTestId("facts-controls-open");
  if (await openBtn.isVisible()) {
    await openBtn.click();
    await expect(page.getByTestId("facts-controls-sheet")).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Safe click that handles overlays and ensures element is clickable.
 * Use for Radix menus, dropdowns, or any element that might be blocked.
 */
export async function safeClick(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  try {
    await locator.click({ timeout: 10_000 });
  } catch (e) {
    // If blocked, press Escape to close overlays and retry once
    const error = e as Error;
    if (error.message.includes('intercepts pointer events') || error.message.includes('not visible')) {
      await locator.page().keyboard.press('Escape');
      await locator.page().waitForTimeout(300);
      await locator.click({ timeout: 10_000 });
    } else {
      throw e;
    }
  }
}
