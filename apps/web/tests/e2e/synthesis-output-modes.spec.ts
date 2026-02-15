/**
 * Synthesis output modes E2E: Paragraph, Research Brief, Script Outline, Split produce
 * visibly different content and footer Mode. Uses stable data-testid selectors.
 * Run: npx playwright test synthesis-output-modes.spec.ts --workers=3
 */

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  selectTwoFacts,
  clickGenerate,
  setSynthesisFormat,
  getOutputDrawerContent,
  closeDrawer,
  ensureOutputDrawerAfterGenerate,
} from './helpers/synthesis';

test.describe('Synthesis output modes', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('select 2 facts, set mode to paragraph, generate: drawer shows real content and footer Mode', async ({
    page,
  }) => {
    await selectTwoFacts(page);
    await setSynthesisFormat(page, 'paragraph');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    const content = await getOutputDrawerContent(page);
    expect(content).not.toBe('');
    expect(content.length).toBeGreaterThan(80);
    expect(content).toContain('Mode: paragraph');
    await expect(page.getByTestId('output-drawer-title')).toContainText(/Paragraph|Synthesis/i);
    await closeDrawer(page);
  });

  test('select 2 facts, set mode to research_brief, generate: content differs from paragraph, Mode research_brief', async ({
    page,
  }) => {
    await selectTwoFacts(page);
    await setSynthesisFormat(page, 'research_brief');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    const content = await getOutputDrawerContent(page);
    expect(content).toContain('Mode: research_brief');
    await expect(page.getByTestId('output-drawer-title')).toContainText(/Research Brief/i);
    await closeDrawer(page);
  });

  test('select 2 facts, set mode to script_outline, generate: content differs, Mode script_outline', async ({
    page,
  }) => {
    await selectTwoFacts(page);
    await setSynthesisFormat(page, 'script_outline');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    const content = await getOutputDrawerContent(page);
    expect(content).toContain('Mode: script_outline');
    await expect(page.getByTestId('output-drawer-title')).toContainText(/Script Outline/i);
    await closeDrawer(page);
  });

  test('split mode: content contains ## Section 1, length > 80, Mode split_sections', async ({ page }) => {
    await selectTwoFacts(page);
    await setSynthesisFormat(page, 'split');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'split');
    const content = await getOutputDrawerContent(page);
    expect(content.length).toBeGreaterThan(80);
    expect(content).toMatch(/## Section 1|## Section 1:/);
    expect(content).toMatch(/Mode: split_sections|Mode: split/);
    await closeDrawer(page);
  });

  test('drawer content differs between paragraph and research_brief (not identical)', async ({
    page,
  }) => {
    await selectTwoFacts(page);
    await setSynthesisFormat(page, 'paragraph');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    const contentParagraph = await getOutputDrawerContent(page);
    expect(contentParagraph.length).toBeGreaterThan(80);
    await closeDrawer(page);

    // Selection still 2 facts; do not call selectTwoFacts again (would deselect)
    await setSynthesisFormat(page, 'research_brief');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    const contentBrief = await getOutputDrawerContent(page);
    expect(contentBrief.length).toBeGreaterThan(80);
    expect(contentBrief).not.toBe(contentParagraph);
    await closeDrawer(page);
  });
});
