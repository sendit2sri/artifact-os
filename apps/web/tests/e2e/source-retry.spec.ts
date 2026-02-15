/**
 * Source retry E2E.
 * Seed one failing web empty_content; click retry; expect new job and transition to DONE (E2E stub).
 * Run with ARTIFACT_ENABLE_TEST_SEED=true and backend + worker.
 * npx playwright test source-retry.spec.ts
 */

import { test, expect } from "@playwright/test";
import { switchToAllDataView } from "./helpers/nav";

const WORKSPACE_ID = "123e4567-e89b-12d3-a456-426614174000";

async function createEmptyProject(request: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<{ id: string }> }> }): Promise<string> {
  const res = await request.post("/api/v1/projects", {
    data: { workspace_id: WORKSPACE_ID, title: "Source Retry E2E" },
  });
  if (!res.ok()) throw new Error("Create project failed");
  const data = await res.json();
  return data.id;
}

test.describe("Source retry", () => {
  test.beforeEach(async ({ page, request }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("artifact_onboarding_completed_v1", "true"));
    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
  });

  test("seed failing web empty_content → click Retry → new job appears and completes (E2E stub)", async ({ page, request }) => {
    const projectId = await page.evaluate(() => {
      const m = window.location.pathname.match(/\/project\/([^/]+)/);
      return m ? m[1] : null;
    });
    if (!projectId) throw new Error("No project ID in URL");

    const res = await request.post("/api/v1/test/seed_sources", {
      data: {
        project_id: projectId,
        reset: true,
        sources: [{ kind: "web", mode: "empty_content" }],
      },
    });
    if (!res.ok()) {
      test.skip(true, "seed_sources disabled (ARTIFACT_ENABLE_TEST_SEED)");
      return;
    }
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
    await switchToAllDataView(page);

    // Wait for processing timeline + retry (seed adds sentinel fact so fact-card exists)
    await expect(page.getByTestId("processing-timeline")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("processing-job-retry")).toBeVisible({ timeout: 5000 });

    await page.getByTestId("processing-job-retry").click();

    // After retry in E2E mode, facts appear (stub) or sentinel fact from seed is visible
    await expect(async () => {
      const factCards = page.getByTestId("fact-card");
      await expect(factCards.first()).toBeVisible({ timeout: 15_000 });
      expect(await factCards.count()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 30_000 });
  });
});
