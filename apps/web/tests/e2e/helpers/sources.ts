/**
 * Sources (Add URL) E2E helpers.
 * Uses stable selectors: source-tab-url, source-url-input, source-add-button,
 * source-add-loading, source-add-error, sources-list, source-item, sources-empty.
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function openUrlTab(page: Page) {
  await expect(page.getByTestId('source-tab-url')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('source-tab-url').click();
}

export async function addUrl(page: Page, url: string) {
  await expect(page.getByTestId('source-url-input')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('source-url-input').fill(url);
  const addBtn = page.getByTestId('source-add-button');
  await expect(addBtn).toBeVisible({ timeout: 5_000 });
  const isDisabled = await addBtn.isDisabled();
  if (!isDisabled) {
    await addBtn.click();
  }
}

export async function assertSourceListed(page: Page, domainOrUrlRegex: RegExp | string) {
  const list = page.getByTestId('sources-list');
  await expect(list).toBeVisible();
  const regex = typeof domainOrUrlRegex === 'string' ? new RegExp(domainOrUrlRegex) : domainOrUrlRegex;
  await expect(list).toContainText(regex);
}

export async function assertAddUrlError(page: Page, regex: RegExp) {
  const err = page.getByTestId('source-add-error');
  await expect(err).toBeVisible();
  await expect(err).toContainText(regex);
}
