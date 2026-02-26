import { test, expect } from "./fixtures/seed";
import { gotoProject, switchToAllDataView } from "./helpers/nav";
import { seedWithSimilarFacts } from "./helpers/collapse-similar";
import { waitForAppIdle } from "./helpers/setup";

/**
 * Graph View V1 – smoke test.
 * Graph tab shows similarity-group nodes or empty state; clicking a node filters the list; Clear restores.
 */
test.describe("Graph View V1", () => {
  test.beforeEach(async ({ page, seed }) => {
    await seedWithSimilarFacts(seed.project_id, seed.source_id);
    await gotoProject(page, seed.project_id);
  });

  test("Graph tab shows graph or empty state; click node filters list, Clear restores", async ({
    page,
  }) => {
    await switchToAllDataView(page);
    await expect(
      page.getByTestId("fact-card").or(page.getByTestId("facts-empty-state"))
    ).toBeVisible({ timeout: 10000 });

    const graphTab = page.getByTestId("view-tab-graph");
    await graphTab.scrollIntoViewIfNeeded();
    await expect(graphTab).toBeVisible({ timeout: 5000 });
    await graphTab.click();
    await waitForAppIdle(page);

    const graph = page.getByTestId("facts-graph");
    await expect(graph).toBeVisible({ timeout: 5000 });

    const clearBtn = page.getByTestId("graph-clear-selection");
    const hasNodes = await page.locator(".react-flow__node").count() > 0;

    if (hasNodes) {
      const listCountBefore = await page.getByTestId("fact-card").count();
      await page.locator(".react-flow__node").first().click();
      await waitForAppIdle(page);
      await expect(clearBtn).toBeVisible({ timeout: 3000 });
      const listCountFiltered = await page.getByTestId("fact-card").count();
      expect(listCountFiltered).toBeLessThanOrEqual(listCountBefore);

      await clearBtn.click();
      await waitForAppIdle(page);
      const listCountAfter = await page.getByTestId("fact-card").count();
      expect(listCountAfter).toBe(listCountBefore);
    }
  });
});
