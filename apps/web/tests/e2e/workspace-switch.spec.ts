/**
 * Workspace switch E2E: load home, switch to Team, create project,
 * verify project appears in Team list, not in Personal list.
 */

import { test, expect } from "./fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const API_URL = `${BACKEND_URL}/api/v1`;

test.describe("Workspace switch", () => {
  test("switch to Team, create project, project appears in Team list only", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(async () => {
      const trigger = page.getByTestId("workspace-trigger");
      await expect(trigger).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 15_000 });

    const trigger = page.getByTestId("workspace-trigger");
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    
    // Wait for workspace menu to appear (more robust than checking individual items)
    await expect(page.getByRole('menu').or(page.locator('[role="menu"]')).or(page.getByTestId('workspace-panel'))).toBeVisible({ timeout: 5000 });
    
    // Click Team workspace item by text (more resilient than testid filter)
    await page.getByText('Team', { exact: true }).click();

    await expect(async () => {
      await expect(page.getByTestId("workspace-trigger")).toContainText("Team");
    }).toPass({ timeout: 5000 });

    await expect(page).toHaveURL(/[\?&]ws=[a-f0-9-]+/);
    const url = page.url();
    const ws = url.match(/[\?&]ws=([a-f0-9-]+)/)?.[1];
    expect(ws).toBeTruthy();

    await page.getByTestId("project-create").click();
    await expect(async () => {
      await expect(page).toHaveURL(/\/project\/[a-f0-9-]+/, { timeout: 15_000 });
    }).toPass({ timeout: 20_000 });

    const projectUrl = page.url();
    const projectId = projectUrl.split("/project/")[1]?.split("?")[0];
    expect(projectId).toBeTruthy();
    await expect(page.locator(`a[href*="ws=${ws}"]`).first()).toBeVisible({ timeout: 5000 });

    const workspaces = await (await fetch(`${API_URL}/workspaces`)).json();
    const teamWs = workspaces.find((w: { name: string }) => w.name === "Team");
    expect(teamWs).toBeTruthy();
    const teamProjects = await (
      await fetch(`${API_URL}/workspaces/${teamWs.id}/projects`)
    ).json();
    const found = teamProjects.some((p: { id: string }) => p.id === projectId);
    expect(found).toBe(true);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("workspace-trigger").click();
    
    // Wait for menu, then click Personal by text
    await expect(page.getByRole('menu').or(page.locator('[role="menu"]')).or(page.getByTestId('workspace-panel'))).toBeVisible({ timeout: 5000 });
    await page.getByText('Personal', { exact: true }).click();
    
    await expect(page.getByTestId("workspace-trigger")).toContainText("Personal");
    const personalWs = workspaces.find((w: { name: string }) => w.name === "Personal");
    const personalProjects = await (
      await fetch(`${API_URL}/workspaces/${personalWs.id}/projects`)
    ).json();
    const inPersonal = personalProjects.some((p: { id: string }) => p.id === projectId);
    expect(inPersonal).toBe(false);
  });
});
