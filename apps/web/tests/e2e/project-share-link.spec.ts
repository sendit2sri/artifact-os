/**
 * Project share link E2E: create project in Team workspace, copy project link
 * (contains ws param), open link in new context; assert workspace auto-switched and project loads.
 */

import { test, expect } from "./fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const API_URL = `${BACKEND_URL}/api/v1`;

test.describe("Project share link", () => {
  test("copy project link with ws param; open in new page; workspace switched and project loads", async ({
    page,
    seed,
  }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const workspaces = await (await fetch(`${API_URL}/workspaces`)).json();
    const teamWs = workspaces.find((w: { name: string }) => w.name === "Team");
    if (!teamWs) {
      test.skip();
      return;
    }

    const createRes = await fetch(`${API_URL}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: teamWs.id, title: "Share Test Project" }),
    });
    const project = await createRes.json();
    expect(project.id).toBeTruthy();

    await page.goto(`/project/${project.id}?ws=${teamWs.id}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("project-title")).toBeVisible({ timeout: 10_000 });

    await expect(async () => {
      await expect(page.getByTestId("workspace-trigger")).toContainText("Team");
    }).toPass({ timeout: 5000 });

    await page.getByTestId("project-share-link").click();
    const copied = await page.evaluate(() => {
      const cb = navigator?.clipboard;
      if (typeof cb?.readText !== "function") return null;
      return cb.readText();
    });
    if (copied === null) {
      test.skip(true, "Clipboard API not available (headless/Docker)");
      return;
    }
    expect(copied).toContain(`ws=${teamWs.id}`);
    expect(copied).toContain(project.id);

    const page2 = await page.context().newPage();
    await page2.goto(copied, { waitUntil: "domcontentloaded" });
    await expect(async () => {
      await expect(page2.getByTestId("workspace-trigger")).toContainText("Team");
      await expect(page2.getByTestId("project-title")).toContainText("Share Test Project");
    }).toPass({ timeout: 15_000 });
    await page2.close();
  });
});
