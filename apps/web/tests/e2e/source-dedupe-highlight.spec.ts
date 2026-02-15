/**
 * Source dedupe highlight E2E.
 * Seed one OK reddit; ingest same URL again via UI; assert toast "Already added" and existing source row gets pulse.
 * Run with ARTIFACT_ENABLE_TEST_SEED=true.
 * npx playwright test source-dedupe-highlight.spec.ts
 */

import { test, expect } from "@playwright/test";

const WORKSPACE_ID = "123e4567-e89b-12d3-a456-426614174000";
const REDDIT_DEMO_URL = "https://www.reddit.com/r/test/comments/abc123/demo_thread/";

async function createEmptyProject(request: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<{ id: string }> }> }): Promise<string> {
  const res = await request.post("/api/v1/projects", {
    data: { workspace_id: WORKSPACE_ID, title: "Source Dedupe Highlight E2E" },
  });
  if (!res.ok()) throw new Error("Create project failed");
  const data = await res.json();
  return data.id;
}

test.describe("Source dedupe highlight", () => {
  test.beforeEach(async ({ page, request }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("artifact_onboarding_completed_v1", "true"));
    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
  });

  test("seed OK reddit → add same URL again → toast Already added, source row gets pulse", async ({ page, request }) => {
    const projectId = await page.evaluate(() => {
      const m = window.location.pathname.match(/\/project\/([^/]+)/);
      return m ? m[1] : null;
    });
    if (!projectId) throw new Error("No project ID in URL");

    const res = await request.post("/api/v1/test/seed_sources", {
      data: { project_id: projectId, reset: true, sources: [{ kind: "reddit", mode: "ok" }] },
    });
    if (!res.ok()) {
      test.skip(true, "seed_sources disabled (ARTIFACT_ENABLE_TEST_SEED)");
      return;
    }
    await page.reload();

    // Wait for source-ready (not fact-card): sources list + URL input. seed_sources may yield 0 facts.
    await expect(page.getByText("Active Sources")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("reddit.com")).toBeVisible({ timeout: 5000 });
    const urlInput = page.getByTestId("source-url-input");
    await expect(urlInput).toBeVisible({ timeout: 5000 });
    await urlInput.fill(REDDIT_DEMO_URL);
    await expect(page.getByRole("button", { name: "Add" })).toBeEnabled();
    await page.getByRole("button", { name: "Add" }).click();

    await expect(async () => {
      const toast = page.getByText(/already added|has already been added/i);
      await expect(toast).toBeVisible({ timeout: 8000 });
    }).toPass({ timeout: 10_000 });

    await expect(page.getByTestId("source-highlight-pulse")).toBeVisible({ timeout: 5000 });
  });
});
