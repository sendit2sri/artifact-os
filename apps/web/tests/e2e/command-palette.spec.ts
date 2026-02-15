/**
 * Command palette E2E.
 * Cmd/Ctrl+K opens palette; choose "Open History" → history drawer opens.
 * Run: npx playwright test command-palette.spec.ts
 */

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

test.describe('Command palette', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('press Cmd/Ctrl+K → palette visible', async ({ page }) => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible({ timeout: 5000 });
  });

  test('choose Open History → history drawer opens', async ({ page }) => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('command-item').filter({ hasText: 'Open History' }).click();
    await expect(page.getByTestId('outputs-history-drawer')).toBeVisible({ timeout: 5000 });
  });
});
