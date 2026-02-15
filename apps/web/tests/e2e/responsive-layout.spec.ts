/**
 * Responsive Layout v2 (Adaptive Modes) E2E.
 * Asserts: no horizontal scroll at key widths; desktop URL bar; mobile Add source sheet & sources drawer & facts controls.
 * Run: npx playwright test responsive-layout.spec.ts
 */

import { test, expect } from '@playwright/test';

const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174000';

async function createEmptyProject(request: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<{ id: string }> }> }): Promise<string> {
  const res = await request.post('/api/v1/projects', {
    data: { workspace_id: WORKSPACE_ID, title: 'Responsive Layout E2E Project' },
  });
  if (!res.ok()) throw new Error('Create project failed');
  const data = await res.json();
  return data.id;
}

async function assertNoHorizontalScroll(page: import('@playwright/test').Page) {
  const ok = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth;
  });
  expect(ok).toBe(true);
}

test.describe('Responsive layout', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('artifact_onboarding_completed_v1', 'true'));
    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
  });

  test('1280x720: desktop URL input visible, no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('source-url-input')).toBeVisible({ timeout: 15_000 });
    await assertNoHorizontalScroll(page);
  });

  test('768x720: header wraps cleanly, no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 720 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('project-title')).toBeVisible({ timeout: 15_000 });
    await assertNoHorizontalScroll(page);
  });

  test('390x844: Add source button opens sheet; sources drawer; facts controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('add-source-open')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('add-source-open').click();
    await expect(page.getByTestId('add-source-sheet')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('add-source-sheet-url-input')).toBeVisible();
    await expect(page.getByTestId('add-source-sheet-submit')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('sources-drawer-open')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('sources-drawer-open').click();
    await expect(page.getByTestId('sources-drawer')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('facts-controls-open')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('facts-controls-open').click();
    await expect(page.getByTestId('facts-controls-sheet')).toBeVisible({ timeout: 5000 });

    await assertNoHorizontalScroll(page);
  });
});
