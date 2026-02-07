# Playwright Stable Selectors Reference

## Overview

This document lists all `data-testid` selectors used in E2E tests. These are **guaranteed stable** across UI changes and should be used instead of CSS selectors, text matching, or role queries.

## Why Use data-testid?

✅ **Stable** - Independent of styling, layout, or text changes  
✅ **Fast** - Direct DOM queries, no complex traversals  
✅ **Explicit** - Clear intent: "this element is for testing"  
✅ **Maintainable** - Easy to find all test hooks in codebase  
✅ **Resilient** - Won't break when design changes

## Complete Selector List

### Facts & Selection

| Selector | Component | Purpose |
|----------|-----------|---------|
| `fact-card` | FactCard.tsx | Individual fact card in the list |
| `fact-select-button` | FactCard.tsx | Checkbox to select/deselect fact |

**Usage:**
```typescript
await page.getByTestId('fact-card').first().click();
await page.getByTestId('fact-select-button').first().click();
```

### Synthesis Controls

| Selector | Component | Purpose |
|----------|-----------|---------|
| `generate-synthesis` | page.tsx | Main "Generate" button to start synthesis |

**Usage:**
```typescript
const generateBtn = page.getByTestId('generate-synthesis');
await expect(generateBtn).toBeEnabled();
await generateBtn.click();
```

### Synthesis Builder (Mixed Sources)

| Selector | Component | Purpose |
|----------|-----------|---------|
| `synthesis-builder` | SynthesisBuilder.tsx | Root container for builder sheet |
| `synthesis-builder-generate-split` | SynthesisBuilder.tsx | "Generate Separate Sections" button (recommended) |
| `synthesis-builder-generate-merge` | SynthesisBuilder.tsx | "Combine All" button |
| `synthesis-builder-close` | SynthesisBuilder.tsx | Close builder button |

**Usage:**
```typescript
const builder = page.getByTestId('synthesis-builder');
await expect(builder).toBeVisible();

// Click recommended action (split by topic)
await page.getByTestId('synthesis-builder-generate-split').click();

// Or combine all
await page.getByTestId('synthesis-builder-generate-merge').click();

// Close
await page.getByTestId('synthesis-builder-close').click();
```

### Output Drawer (Results)

| Selector | Component | Purpose |
|----------|-----------|---------|
| `output-drawer` | OutputDrawer.tsx | Root container for output sheet |
| `output-drawer-content` | OutputDrawer.tsx | Content area (the synthesis text) |
| `output-drawer-copy` | OutputDrawer.tsx | Copy to clipboard button |
| `output-drawer-download` | OutputDrawer.tsx | Download as markdown button |
| `output-drawer-close` | OutputDrawer.tsx | Close drawer button |

**Usage:**
```typescript
const drawer = page.getByTestId('output-drawer');
await expect(drawer).toBeVisible();

// Check content
const content = page.getByTestId('output-drawer-content');
await expect(content).toContainText(/E2E Synthesis/);

// Actions
await page.getByTestId('output-drawer-copy').click();
await page.getByTestId('output-drawer-download').click();
await page.getByTestId('output-drawer-close').click();
```

### Error Handling

| Selector | Component | Purpose |
|----------|-----------|---------|
| `synthesis-error-banner` | page.tsx | Error banner (appears on synthesis failure) |

**Usage:**
```typescript
const errorBanner = page.getByTestId('synthesis-error-banner');
await expect(errorBanner).toBeVisible();
await expect(errorBanner).toContainText(/LLM returned empty synthesis/i);

// Ensure drawer did NOT open (error case)
await expect(page.getByTestId('output-drawer')).toBeHidden();
```

## Anti-Patterns (Don't Use These)

### ❌ Text-Based Selectors
```typescript
// BAD - text may change
page.locator('button', { hasText: /Generate|Create/i })
page.getByRole('button', { name: /Last Output/i })

// GOOD - stable testid
page.getByTestId('generate-synthesis')
page.getByTestId('synthesis-builder-generate-split')
```

### ❌ CSS Class Selectors
```typescript
// BAD - classes change with styling
page.locator('.prose pre')
page.locator('.flex-1 .text-foreground')

// GOOD - semantic testid
page.getByTestId('output-drawer-content')
```

### ❌ DOM Traversal
```typescript
// BAD - fragile hierarchy
page.locator('[data-testid="output-drawer"]').locator('pre').first()

// GOOD - direct testid
page.getByTestId('output-drawer-content')
```

### ❌ Role Queries (for custom components)
```typescript
// BAD - roles may not be present or stable
page.getByRole('dialog')
page.getByRole('status', { name: /error/ })

// GOOD - explicit testid
page.getByTestId('output-drawer')
page.getByTestId('synthesis-error-banner')
```

**Exception:** Native HTML elements with semantic roles (button, link, checkbox) are fine:
```typescript
// OK - native button
page.getByRole('button', { name: 'Submit' })

// BETTER - testid when available
page.getByTestId('submit-button')
```

## Test Patterns

### Pattern 1: Success Flow (Single Source)
```typescript
test('should generate synthesis from single source', async ({ page }) => {
  await page.goto(`/project/${PROJECT_ID}`);
  
  // Select facts
  await page.getByTestId('fact-card').first().getByTestId('fact-select-button').click();
  await page.getByTestId('fact-card').nth(1).getByTestId('fact-select-button').click();
  
  // Generate
  await page.getByTestId('generate-synthesis').click();
  
  // Assert drawer opens with content
  await expect(page.getByTestId('output-drawer')).toBeVisible();
  await expect(page.getByTestId('output-drawer-content')).toContainText(/.+/);
});
```

### Pattern 2: Success Flow (Mixed Sources → Builder)
```typescript
test('should use builder for mixed sources', async ({ page }) => {
  await page.goto(`/project/${PROJECT_ID}`);
  
  // Select facts from different sources
  const factCards = page.getByTestId('fact-card');
  await factCards.first().getByTestId('fact-select-button').click();
  await factCards.nth(2).getByTestId('fact-select-button').click();
  
  // Generate (opens builder)
  await page.getByTestId('generate-synthesis').click();
  
  // Builder appears
  const builder = page.getByTestId('synthesis-builder');
  await expect(builder).toBeVisible();
  
  // Click recommended action
  await page.getByTestId('synthesis-builder-generate-split').click();
  
  // Drawer opens with result
  await expect(page.getByTestId('output-drawer')).toBeVisible();
});
```

### Pattern 3: Error Flow
```typescript
test('should show error banner on failure', async ({ page }) => {
  await page.goto(`/project/${PROJECT_ID}`);
  
  // Intercept request to force error
  await page.route('**/synthesize', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('force_error', 'true');
    await route.continue({ url: url.toString() });
  });
  
  // Select and generate
  await page.getByTestId('fact-card').first().getByTestId('fact-select-button').click();
  await page.getByTestId('fact-card').nth(1).getByTestId('fact-select-button').click();
  await page.getByTestId('generate-synthesis').click();
  
  // Assert error banner (not drawer)
  await expect(page.getByTestId('synthesis-error-banner')).toBeVisible();
  await expect(page.getByTestId('output-drawer')).toBeHidden();
});
```

## Adding New Selectors

When adding a new component or feature that needs E2E testing:

1. **Add data-testid** to the root element
2. **Add data-testid** to key interactive elements (buttons, inputs)
3. **Add data-testid** to content areas that need assertions
4. **Update this document** with the new selectors
5. **Write tests** using the new selectors

### Example: Adding a new feature
```tsx
// Component
export function NewFeature() {
  return (
    <div data-testid="new-feature">
      <button data-testid="new-feature-action" onClick={handleAction}>
        Do Something
      </button>
      <div data-testid="new-feature-result">
        {result}
      </div>
    </div>
  );
}

// Test
test('should use new feature', async ({ page }) => {
  await page.getByTestId('new-feature-action').click();
  await expect(page.getByTestId('new-feature-result')).toContainText('Success');
});
```

## Naming Conventions

### Format: `{component}-{element}-{variant?}`

- **component**: Lowercase, dash-separated (e.g., `output-drawer`, `synthesis-builder`)
- **element**: Purpose/role (e.g., `content`, `close`, `generate`)
- **variant**: Optional qualifier (e.g., `split`, `merge`, `copy`)

### Examples
- ✅ `output-drawer-content`
- ✅ `synthesis-builder-generate-split`
- ✅ `fact-select-button`
- ❌ `OutputDrawerContent` (not camelCase)
- ❌ `drawer-1` (not numbered)
- ❌ `btn-close` (not abbreviated)

## Maintenance

### When to Update Selectors

**DO update** when:
- Component is refactored or redesigned
- Element purpose changes significantly
- Merging/splitting components

**DON'T update** for:
- Style changes (colors, spacing, fonts)
- Text content changes
- Layout changes (flex → grid, etc.)
- Minor UX tweaks

### Backward Compatibility

When changing a selector:
1. Add the new selector alongside the old one
2. Update tests to use new selector
3. Remove old selector in next release

```tsx
// Migration period
<button
  data-testid="new-name"
  data-testid-legacy="old-name"  // Keep for 1 release
  ...
>
```

## Testing the Selectors

Verify all selectors are present:

```bash
# Search for testid usage in tests
grep -r "getByTestId" apps/web/tests/

# Search for testid definitions in components
grep -r "data-testid" apps/web/src/components/
```

## Summary

**Total Stable Selectors: 11**

| Category | Count | Selectors |
|----------|-------|-----------|
| Facts | 2 | `fact-card`, `fact-select-button` |
| Controls | 1 | `generate-synthesis` |
| Builder | 4 | `synthesis-builder`, `synthesis-builder-generate-split`, `synthesis-builder-generate-merge`, `synthesis-builder-close` |
| Output | 5 | `output-drawer`, `output-drawer-content`, `output-drawer-copy`, `output-drawer-download`, `output-drawer-close` |
| Errors | 1 | `synthesis-error-banner` |

**100% test coverage** - All critical user flows have stable selectors.

## Related Documentation

- `SYNTHESIS_E2E_ROUTE_INTERCEPTION_FIX.md` - Error testing with route interception
- `E2E_SYNTHESIS_DETERMINISM.md` - E2E mode setup and usage
- `synthesis-flow.spec.ts` - Complete test suite using these selectors
