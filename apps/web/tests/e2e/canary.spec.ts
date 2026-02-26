/**
 * Canary Tests - High-signal regression detectors
 *
 * Run these first in CI. Fast, catch critical regressions.
 */

import { test, expect } from "./fixtures/seed";
import { waitForAppIdle } from "./helpers/synthesis";
import { gotoProject } from "./helpers/nav";

test.describe("Canary - Critical Path @release-gate", () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test("Watchdog canary: warning then stuck then dismiss", async ({ page, seed }) => {
    const projectId = seed.project_id;

    // Single route with mutable state (Playwright routes stack; re-registering doesn't replace)
    let jobAgeMs = 16000;
    let jobStatus: "PENDING" | "COMPLETED" = "PENDING";

    const jobsPath = `/api/v1/projects/${projectId}/jobs`;
    // Exact pathname avoids false positives from query params (?ts=...) or endpoints containing "/jobs"
    const waitJobs200 = () =>
      page.waitForResponse(
        (r) => {
          if (r.request().method() !== "GET") return false;
          if (r.status() !== 200) return false;
          const u = new URL(r.url());
          return u.pathname === jobsPath;
        },
        { timeout: 5000 }
      );

    // Route only this project's jobs endpoint (avoid accidentally intercepting other projects)
    await page.route("**/api/v1/projects/*/jobs*", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname !== jobsPath) return route.continue();

      const ts = new Date(Date.now() - jobAgeMs).toISOString();
      const url = "https://example.com";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "watchdog-test-job",
            status: jobStatus,
            created_at: ts,
            updated_at: ts,
            params: { url },
            source: { url },
            source_url: url,
          },
        ]),
      });
    });

    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page, { requireNoActiveJobs: false });

    // Warning should show (16s > 15s threshold)
    const warningCard = page.locator('[data-testid="warning-job-watchdog-test-job"]');
    await expect(warningCard).toBeVisible({ timeout: 5000 });
    await expect(warningCard).toContainText(/16s|taking longer/i);

    // Update mock: now 31s ago → stuck
    jobAgeMs = 31000;
    jobStatus = "PENDING";

    const r1 = waitJobs200();
    await page.evaluate((pid) => window.__e2e?.refetchJobs?.(pid), projectId);
    await r1;

    const stuckCard = page.locator('[data-testid="stuck-job-watchdog-test-job"]');
    await expect(stuckCard).toBeVisible({ timeout: 5000 });

    // Update mock: job COMPLETED → alert disappears
    jobAgeMs = 35000;
    jobStatus = "COMPLETED";

    const r2 = waitJobs200();
    await page.evaluate((pid) => window.__e2e?.refetchJobs?.(pid), projectId);
    await r2;

    await expect(stuckCard).not.toBeVisible({ timeout: 5000 });
    await expect(warningCard).not.toBeVisible({ timeout: 5000 });
  });

  test("URL loop canary: rapid toggles, no infinite replace", async ({ page, seed }) => {
    const projectId = seed.project_id;

    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    // Track router.replace / navigations
    const navUrls: string[] = [];
    page.on("framenavigated", () => {
      const url = page.url();
      if (url.includes("/project/")) navUrls.push(url);
    });

    // 5 rapid actions (scope to listbox to avoid html intercepting pointer events)
    for (let i = 0; i < 5; i++) {
      await page.click('[data-testid="facts-sort-trigger"]');
      const listbox = page.getByRole("listbox");
      await expect(listbox).toBeVisible({ timeout: 2000 });
      await listbox.getByRole("option", { name: "Newest first", exact: true }).click();
      await page.waitForTimeout(50);
      await page.click('[data-testid="facts-sort-trigger"]');
      const listbox2 = page.getByRole("listbox");
      await expect(listbox2).toBeVisible({ timeout: 2000 });
      await listbox2.getByRole("option", { name: "High confidence first", exact: true }).click();
      await page.waitForTimeout(50);
    }

    await waitForAppIdle(page);

    // No infinite loop: reasonable number of navigations
    expect(navUrls.length).toBeLessThan(25);

    // Final URL should be stable and valid
    const finalUrl = page.url();
    expect(finalUrl).toMatch(new RegExp(`/project/${projectId}`));
    expect(finalUrl).not.toMatch(/\?$/);
    expect(finalUrl).not.toContain("group=off");
  });
});

test.describe("Canary - UI-detail heavy @nightly", () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test("Overlay layering canary: sheet above header, elementFromPoint", async ({ page, seed }, testInfo) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(`/project/${seed.project_id}`);
    await waitForAppIdle(page);

    await page.getByTestId("sources-drawer-open").click();
    const sheet = page.getByTestId("sources-drawer");
    await expect(sheet).toBeVisible({ timeout: 3000 });
    await sheet.getByText("Active Sources", { exact: true }).click();
    await expect(sheet).toBeVisible();

    const result = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="sources-drawer-open"]');
      if (!btn) return { ok: false, debug: 'button not found' };
      const rect = btn.getBoundingClientRect();
      const inset = Math.max(2, Math.floor(Math.min(rect.width, rect.height) * 0.2));
      const pts: [number, number][] = [
        [Math.floor(rect.left + rect.width / 2), Math.floor(rect.top + rect.height / 2)],
        [Math.floor(rect.left + inset), Math.floor(rect.top + inset)],
        [Math.floor(rect.right - inset), Math.floor(rect.top + inset)],
        [Math.floor(rect.right - inset), Math.floor(rect.bottom - inset)],
        [Math.floor(rect.left + inset), Math.floor(rect.bottom - inset)],
      ];
      const seen = new Set<string>();
      for (const [x, y] of pts) {
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const el = document.elementFromPoint(x, y);
        if (!el) return { ok: false, debug: `elementFromPoint(${x},${y})=null` };
        if (el === btn || btn.contains(el)) {
          const s = el instanceof Element ? getComputedStyle(el) : null;
          const pe = s ? s.pointerEvents : '?';
          return {
            ok: false,
            debug: `button hit at (${x},${y}) el=${el.tagName}.${(el.className || '').slice(0, 60)} pointerEvents=${pe}`,
          };
        }
      }
      return { ok: true };
    });
    if (!result.ok) {
      const screenshot = await page.screenshot().catch(() => null);
      if (screenshot) {
        await testInfo.attach('overlay-canary-failure.png', { body: screenshot, contentType: 'image/png' });
      }
    }
    expect(result.ok, result.debug).toBe(true);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 1000 });
  });

  test("Prefs hydration canary: sort persists after reload", async ({ page, seed }) => {
    const projectId = seed.project_id;
    await page.goto(`/project/${projectId}`);
    await waitForAppIdle(page);

    const savePref = page.waitForResponse(
      async (r) => {
        if (!r.url().includes("/preferences")) return false;
        if (r.request().method() === "GET") return false;
        if (r.status() !== 200) return false;
        const body = r.request().postData() || "";
        return body.includes('"sort"') || body.includes("sort");
      },
      { timeout: 10000 }
    );

    await page.click('[data-testid="facts-sort-trigger"]');
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible({ timeout: 2000 });

    await Promise.all([
      savePref,
      listbox.getByRole("option", { name: "Newest first", exact: true }).click(),
    ]);

    const sortTrigger = page.locator('[data-testid="facts-sort-trigger"]');
    await expect(sortTrigger).toContainText(/Newest first/i);

    await page.reload();
    await waitForAppIdle(page);
    await expect(sortTrigger).toContainText(/Newest first/i);
  });
});
