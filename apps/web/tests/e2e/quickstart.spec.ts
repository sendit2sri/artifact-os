/**
 * Quick start empty-state E2E.
 * On empty project: quickstart visible; Paste URL focuses input; demo seed (if enabled) loads facts.
 * Run: npx playwright test quickstart.spec.ts
 */

import { test, expect } from '@playwright/test';

const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174000';

async function createEmptyProject(request: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<{ id: string }> }> }): Promise<string> {
  const res = await request.post('/api/v1/projects', {
    data: { workspace_id: WORKSPACE_ID, title: 'Quickstart E2E Project' },
  });
  if (!res.ok()) throw new Error('Create project failed');
  const data = await res.json();
  return data.id;
}

test.describe('Quick start @release-gate', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('artifact_onboarding_completed_v1', 'true'));
    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
  });

  test('empty state visible', async ({ page }) => {
    await expect(page.getByTestId('quickstart-paste-url')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('quickstart-upload-pdf')).toBeVisible();
  });

  test('Paste URL focuses input', async ({ page }) => {
    await expect(page.getByTestId('quickstart-paste-url')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('quickstart-paste-url').click();
    await expect(async () => {
      const active = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      expect(active).toBe('source-url-input');
    }).toPass({ timeout: 3000 });
  });
});

test.describe('Quick start demo seed @nightly', () => {
  const DEMO_SEED_ENABLED =
    process.env.NEXT_PUBLIC_ENABLE_TEST_SEED === 'true' ||
    process.env.ARTIFACT_ENABLE_TEST_SEED === 'true';

  test.beforeEach(async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('artifact_onboarding_completed_v1', 'true'));
    const res = await request.post('/api/v1/projects', {
      data: { workspace_id: WORKSPACE_ID, title: 'Quickstart Demo E2E Project' },
    });
    if (!res.ok()) throw new Error('Create project failed');
    const data = await res.json();
    await page.goto(`/project/${data.id}`);
  });

  test('Try demo seed loads facts when enabled', async ({ page }) => {
    test.skip(!DEMO_SEED_ENABLED, 'Demo seed not enabled (set NEXT_PUBLIC_ENABLE_TEST_SEED=true)');
    const demoBtn = page.getByTestId('quickstart-demo-seed');
    await expect(demoBtn).toBeVisible({ timeout: 5000 });
    await demoBtn.click();
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 15_000 });
  });
});
