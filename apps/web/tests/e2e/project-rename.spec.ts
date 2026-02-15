import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Project Rename E2E - parallel-safe via seed fixture.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test project-rename.spec.ts --workers=3
 */

test.describe('Project Rename', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('should rename project and persist after reload', async ({ page, seed }) => {
    const titleEl = page.getByTestId('project-title');
    await expect(titleEl).toBeVisible({ timeout: 10_000 });

    const originalTitle = await titleEl.textContent();
    expect(originalTitle).toBeTruthy();

    const newTitle = `E2E Rename ${seed.project_id.slice(0, 8)}`;

    await titleEl.click();

    const input = page.getByTestId('project-title-input');
    await expect(input).toBeVisible();
    await input.fill(newTitle);
    await input.press('Enter');

    await expect(async () => {
      const updated = page.getByTestId('project-title');
      await expect(updated).toContainText(newTitle);
    }).toPass({ timeout: 5000 });

    await page.reload();

    await expect(async () => {
      const persisted = page.getByTestId('project-title');
      await expect(persisted).toContainText(newTitle);
    }).toPass({ timeout: 10_000 });
  });

  test('should show inline error for blank input and keep title unchanged', async ({
    page,
  }) => {
    const titleEl = page.getByTestId('project-title');
    await expect(titleEl).toBeVisible({ timeout: 10_000 });

    const before = await titleEl.textContent();

    await titleEl.click();

    const input = page.getByTestId('project-title-input');
    await expect(input).toBeVisible();
    await input.fill('');
    await input.press('Enter');

    const errorEl = page.getByTestId('project-title-error');
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toContainText(/empty|cannot/i);

    const cancelBtn = page.getByTestId('project-title-cancel');
    await cancelBtn.click();

    const after = page.getByTestId('project-title');
    await expect(after).toContainText(before!);
  });
});
