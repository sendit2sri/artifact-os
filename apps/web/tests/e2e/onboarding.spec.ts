/**
 * Onboarding guided tour E2E.
 * Fresh profile: navigate to empty project, assert overlay, Next → Finish, reload → overlay does not appear.
 * Run: npx playwright test onboarding.spec.ts
 */

import { test, expect } from '@playwright/test';

const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174000';

async function createEmptyProject(request: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<{ id: string }> }> }): Promise<string> {
  const res = await request.post('/api/v1/projects', {
    data: { workspace_id: WORKSPACE_ID, title: 'Onboarding E2E Project' },
  });
  if (!res.ok()) throw new Error('Create project failed');
  const data = await res.json();
  return data.id;
}

test.describe('Onboarding', () => {
  // Onboarding overlay is disabled when NEXT_PUBLIC_E2E_MODE is set (Playwright webServer env).
  // To run these tests, start the app without NEXT_PUBLIC_E2E_MODE and run: npx playwright test onboarding.spec.ts
  test.skip('fresh profile: overlay appears on empty project; Next → Finish; reload → overlay does not appear', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('artifact_onboarding_completed_v1'));

    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId('onboarding-overlay')).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId('onboarding-step-title')).toContainText('Add a Source');
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-step-title')).toContainText('Facts appear here');
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-step-title')).toContainText('Select facts');
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-step-title')).toContainText('Generate synthesis');
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-step-title')).toContainText('Review outputs');
    await page.getByTestId('onboarding-next').click();

    await expect(page.getByTestId('onboarding-overlay')).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('project-title')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
  });

  test.skip('Skip closes overlay and persists completion', async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('artifact_onboarding_completed_v1'));
    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId('onboarding-overlay')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('onboarding-skip').click();
    await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('project-title')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
  });
});
