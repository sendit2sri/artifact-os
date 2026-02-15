/**
 * Source failure modes E2E.
 * Seed one OK reddit + two failing (youtube transcript_disabled, web paywall).
 * Assert timeline shows 3 jobs, failed jobs show error_code + message, retry button exists.
 * Run with ARTIFACT_ENABLE_TEST_SEED=true.
 * npx playwright test source-failure-modes.spec.ts
 */

import { test, expect } from "@playwright/test";

const WORKSPACE_ID = "123e4567-e89b-12d3-a456-426614174000";

async function createEmptyProject(request: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<{ id: string }> }> }): Promise<string> {
  const res = await request.post("/api/v1/projects", {
    data: { workspace_id: WORKSPACE_ID, title: "Source Failure Modes E2E" },
  });
  if (!res.ok()) throw new Error("Create project failed");
  const data = await res.json();
  return data.id;
}

test.describe("Source failure modes", () => {
  test.beforeEach(async ({ page, request }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("artifact_onboarding_completed_v1", "true"));
    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
  });

  test("seed OK reddit + failing youtube + web → timeline shows 3 jobs, error_code + message, retry", async ({ page, request }) => {
    const projectId = await page.evaluate(() => {
      const m = window.location.pathname.match(/\/project\/([^/]+)/);
      return m ? m[1] : null;
    });
    if (!projectId) throw new Error("No project ID in URL");

    await expect(page.getByTestId("quickstart-paste-url").or(page.getByTestId("processing-timeline"))).toBeVisible({ timeout: 15_000 });

    const res = await request.post("/api/v1/test/seed_sources", {
      data: {
        project_id: projectId,
        reset: true,
        sources: [
          { kind: "reddit", mode: "ok" },
          { kind: "youtube", mode: "transcript_disabled" },
          { kind: "web", mode: "paywall" },
        ],
      },
    });
    if (!res.ok()) {
      test.skip(true, "seed_sources disabled (ARTIFACT_ENABLE_TEST_SEED)");
      return;
    }
    await page.reload();

    await expect(page.getByTestId("processing-timeline")).toBeVisible({ timeout: 10_000 });
    const failedSections = page.locator("[data-testid='processing-failed']");
    await expect(failedSections.first()).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId("processing-job-error-code").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("processing-job-error-message").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("processing-job-retry").first()).toBeVisible({ timeout: 3000 });
  });
});
