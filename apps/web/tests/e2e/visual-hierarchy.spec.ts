/**
 * Visual Hierarchy v1 (2026 Calm UI) E2E.
 * Asserts primary CTA is designated via data-variant="primary".
 * Run: npx playwright test visual-hierarchy.spec.ts
 */

import { test, expect } from '@playwright/test';

const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174000';

async function createEmptyProject(request: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<{ id: string }> }> }): Promise<string> {
  const res = await request.post('/api/v1/projects', {
    data: { workspace_id: WORKSPACE_ID, title: 'Visual Hierarchy E2E Project' },
  });
  if (!res.ok()) throw new Error('Create project failed');
  const data = await res.json();
  return data.id;
}

test.describe('Visual hierarchy', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('artifact_onboarding_completed_v1', 'true'));
    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
  });

  test('1280x720: source-add-button has data-variant="primary"', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForLoadState('networkidle');
    const addBtn = page.getByTestId('source-add-button');
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await expect(addBtn).toHaveAttribute('data-variant', 'primary');
  });

  test('390x844: add-source-sheet-submit has data-variant="primary"', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('add-source-open')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('add-source-open').click();
    await expect(page.getByTestId('add-source-sheet')).toBeVisible({ timeout: 5000 });
    const submitBtn = page.getByTestId('add-source-sheet-submit');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toHaveAttribute('data-variant', 'primary');
  });
});
