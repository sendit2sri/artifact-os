# UI Invariants (Non-Negotiable)

**Purpose**: Prevent visual inconsistency and "scattered controls" feeling through enforced design standards.

**Last Updated**: 2026-02-11  
**Status**: ENFORCED

---

## 1. Control Height Standard

### Rule
ALL interactive elements MUST use `h-9` (36px):
- Buttons (`<Button>`)
- Inputs (`<Input>`)
- Selects (`<SelectTrigger>`)
- Tabs (`<TabsList>`, `<TabsTrigger>`)
- Dropdowns (`<DropdownMenuTrigger>`)
- Badges (when clickable)

### Implementation
Use `UI_CONSTANTS.CONTROL_HEIGHT` from `lib/tokens.ts`:

```typescript
import { UI_CONSTANTS } from '@/lib/tokens';

<Input className={UI_CONSTANTS.CONTROL_HEIGHT} />
<SelectTrigger className={UI_CONSTANTS.CONTROL_HEIGHT} />
```

### Exceptions
- Icon-only buttons: `h-8 w-8` or `h-9 w-9` (square)
- Large CTAs: Can use `h-10` or `h-11` for primary actions in empty states
- Compact mode: Reserved for dense data tables only

### Enforcement
- Manual: PR review checklist
- Automated: Grep for violations before merge

```bash
# Find violations (should return 0):
rg "className.*h-8[^0-9]" apps/web/src/app apps/web/src/components --type tsx
rg "className.*h-10[^0-9]" apps/web/src/app apps/web/src/components --type tsx
```

### Violations Fixed (2026-02-11)
- ✅ `page.tsx`: 7 instances (h-8 → h-9)
- ✅ `AddSourceSheet.tsx`: 4 instances (h-10 → h-9)
- ✅ `ViewsPanel.tsx`: 2 instances (h-8 → h-9)

---

## 2. Toolbar Layout Pattern

### Rule
ONE pattern everywhere:

```typescript
<div className="flex items-center gap-2 px-4 h-14 border-b">
  <div className="flex items-center gap-3">
    {/* Left: Primary controls */}
  </div>
  <div className="flex-1 min-w-0">
    {/* Center: Search (if applicable) */}
  </div>
  <div className="flex items-center gap-2">
    {/* Right: Secondary actions */}
  </div>
</div>
```

### Prohibited
- ❌ `flex-wrap` on toolbars (causes unpredictable layout)
- ❌ Multiple rows of controls (use sheet instead)
- ❌ Mixing h-8, h-9, h-10 in same toolbar

### Allowed Toolbar Contents
- Tabs (view mode)
- Search input
- 1-2 primary dropdowns (sort, filter)
- "More" button (opens sheet for advanced controls)
- Primary CTA (context-dependent)

### Everything Else Goes in Sheet
- Advanced filters
- Grouping options
- Toggle switches
- Bulk actions
- Settings

### Enforcement
- PR review: "Does this toolbar have >5 elements?" → Move to sheet
- Test: Toolbar height should be single line on all breakpoints

---

## 3. Spacing Scale

### Rule
ONLY these values allowed for gaps and padding:

#### Gaps (between elements)
- `gap-1` (4px): Very tight (icon + text)
- `gap-2` (8px): Standard control gap ✅ DEFAULT
- `gap-3` (12px): Toolbar sections
- `gap-4` (16px): Section spacing

#### Vertical Spacing
- `space-y-2` (8px): Tight lists
- `space-y-4` (16px): Standard sections ✅ DEFAULT
- `space-y-6` (24px): Major sections
- `space-y-8` (32px): Page sections

#### Padding
- `p-2` (8px): Tight containers
- `p-4` (16px): Standard containers ✅ DEFAULT
- `px-4` (16px): Toolbar horizontal padding ✅
- `py-2` (8px): Toolbar vertical padding

### Implementation
Use `UI_CONSTANTS.SPACING` from `lib/tokens.ts`:

```typescript
<div className={UI_CONSTANTS.SPACING.controlGap}>
<div className={UI_CONSTANTS.SPACING.sectionGap}>
```

### Prohibited
- ❌ Arbitrary spacing: `gap-5`, `space-y-3`, `p-3`
- ❌ Mixing scales in same component
- ❌ Per-file spacing standards

### Enforcement
- Manual: PR review
- Future: ESLint rule (custom)

---

## 4. Filter Chips (Always Visible)

### Rule
When ANY filter is active, filter chips row MUST render below toolbar.

### Active Filters that Require Chips
1. `showOnlySelected` → "Selected only (N) ×"
2. `collapseSimilar` → "Duplicates hidden ×"
3. `reviewStatusFilter` → "Status: X ×"
4. `groupBySource` → "Grouped by source ×"
5. `searchQuery` → "Search: 'X' ×"
6. `scopeType/scopeValue` → "DOMAIN/URL: X ×"

### Requirements
- ✅ All chips are dismissible (X button)
- ✅ Clicking chip clears that filter
- ✅ Chips have consistent height (h-7)
- ✅ Chips use semantic colors:
  - Primary filter: `bg-primary/10 text-primary`
  - Warning filter: `bg-warning/10 text-warning`
  - Neutral: `bg-muted`

### Implementation Status
- ✅ Implemented in `page.tsx` (2026-02-11)
- ✅ Test selector: `[data-testid="active-filters-chips"]`

### Enforcement
- Component test: Assert chips visible when filters active
- E2E test: Verify clicking chip clears filter
- No silent state changes allowed

---

## 5. Sheet/Dialog Requirements

### Rule
ALL sheets and dialogs MUST have:

1. **Title** (visible or `VisuallyHidden`)
   ```typescript
   <SheetTitle>Facts controls</SheetTitle>
   // OR
   <VisuallyHidden>
     <SheetTitle>Dialog title</SheetTitle>
   </VisuallyHidden>
   ```

2. **data-state attribute** (Radix provides automatically)
   - Used for E2E wait conditions
   - Tests can assert `[data-state="open"]`

3. **Focus return on close**
   ```typescript
   const triggerRef = useRef<HTMLButtonElement>(null);
   
   <Button ref={triggerRef} onClick={() => setOpen(true)}>
   
   <Sheet 
     open={open} 
     onOpenChange={(open) => {
       setOpen(open);
       if (!open) triggerRef.current?.focus();
     }}
   />
   ```

### Why This Matters
- **a11y**: Screen readers require DialogTitle
- **E2E**: Tests need stable wait conditions
- **UX**: Focus return prevents confusion

### Enforcement
- Linter: Radix warns about missing DialogTitle
- PR review: Check all new sheets have titles
- Test: Verify focus return

---

## 6. Color Semantics

### Rule
Use semantic colors consistently:

| Purpose | Color | Usage |
|---------|-------|-------|
| Primary action | `bg-primary` | Main CTAs, key states |
| Warning/Review | `bg-warning/10` | Needs attention |
| Success/Approved | `bg-success/10` | Completed states |
| Danger/Error | `bg-destructive/10` | Errors, deletions |
| Neutral | `bg-muted` | Default state |
| Information | `bg-blue-500/10` | Informational states |

### Prohibited
- ❌ Random colors: `bg-green-300`, `bg-red-500`
- ❌ Hardcoded hex: `bg-[#FF5733]`
- ❌ Inconsistent semantic usage

---

## 7. Z-Index Hierarchy (Stacking Context)

### Rule
Standardized z-index to prevent header/ribbon sitting above Sheet/Dialog:

| Layer | z-index | Usage |
|-------|---------|-------|
| Header | z-30 | Sticky/fixed page headers |
| Popovers | z-[100] | Dropdown, Select, Tooltip, diagnostics strip |
| Overlays | z-[200] | Sheet, Dialog, AlertDialog, Onboarding, Command palette |

### Prohibited
- ❌ Header at z-50 or higher (would cover overlays)
- ❌ Arbitrary z-index values (z-999, z-[500])
- ❌ Same z-index for header and overlays

### Implementation (2026-02-11)
- ✅ **Enforceable tokens**: `Z` in `lib/tokens.ts` — use `Z.header`, `Z.popover`, `Z.overlay`, `Z.overlayContent` everywhere
- ✅ UI primitives import and use `Z.*` (sheet, dialog, alert-dialog, dropdown-menu, select, tooltip)
- ✅ Page headers, overlays, toasts use `Z.*`
- ✅ Sonner Toaster: `style={{ zIndex: 200 }}`

### Stacking-Context Traps
Avoid on header **parents** (not the header itself):
- `transform` / `will-change-transform`
- `isolate` / `isolation: isolate`
- `opacity` on wrapper
- `backdrop-blur` on parent (OK on header itself)

### Portal Check
All Radix Portal components use default `document.body` — no custom `container` prop.

### Verification Checklist (5 min)
- [ ] Open Sheet → overlay covers header
- [ ] Open dropdown inside sheet → dropdown above sheet content
- [ ] Open tooltip in header → tooltip above header
- [ ] Open dialog from sheet → dialog above everything
- [ ] Onboarding overlay covers everything

### Regression Check
```bash
# No hardcoded z-50 (should return 0)
rg "z-50" apps/web/src --type tsx
```

---

## 8. Visual Hierarchy (Depth)

### Rule
Use consistent depth system to establish visual hierarchy:

```typescript
export const DEPTH_TOKENS = {
  surface: 'bg-background',           // Page background (flat)
  raised: 'bg-surface border-border', // Primary content container
  overlay: 'bg-surface shadow-lg',    // Modals, sheets, dialogs
  inset: 'bg-muted/30',              // Subtle wells, inactive areas
} as const;
```

### Application
- **Page background**: No border, flat (`surface`)
- **Main content area** (facts list): Single border (`raised`)
- **Cards**: Use sparingly, only for stats/overview
- **Processing/status**: Inset (`inset`)
- **Modals/sheets**: Shadow, no border (`overlay`)

### Anti-Pattern
Having everything in bordered cards → makes all content equal weight.

### Fix
Only ONE primary container should have a border. Everything else is flat or inset.

---

## Enforcement Checklist

### Before Merging New UI Code
- [ ] All interactive controls use h-9
- [ ] Toolbar has ≤5 elements (rest in sheet)
- [ ] Active filters show chips
- [ ] Spacing uses approved scale (gap-2, gap-3, gap-4, space-y-4)
- [ ] Sheets have SheetTitle
- [ ] Colors use semantic tokens
- [ ] Visual hierarchy follows depth system

### Automated Checks
```bash
# Control height violations
rg "className.*h-8[^0-9]" apps/web/src --type tsx
rg "className.*h-10[^0-9]" apps/web/src --type tsx

# Missing sheet titles
rg "SheetContent" apps/web/src --type tsx -A 5 | grep -v "SheetTitle"

# Arbitrary spacing (future)
rg "gap-[^234\s]" apps/web/src --type tsx
```

---

## Component Checklist

When creating new components:

### Interactive Controls
- [ ] Import `UI_CONSTANTS` from `@/lib/tokens`
- [ ] Use `UI_CONSTANTS.CONTROL_HEIGHT` for inputs/buttons/selects
- [ ] Use `UI_CONSTANTS.SPACING.controlGap` for gaps
- [ ] Consistent padding with `UI_CONSTANTS.SPACING.containerPadding`

### Toolbars
- [ ] Max 5 elements
- [ ] No wrapping (`flex-wrap`)
- [ ] Use three-section layout (left/center/right)
- [ ] Advanced controls go in sheet

### Filters
- [ ] Active filters show chips
- [ ] Chips are dismissible
- [ ] Use semantic colors
- [ ] Test selector: `[data-testid="filter-chip-*"]`

### Sheets/Dialogs
- [ ] Has SheetTitle (visible or hidden)
- [ ] Focus return implemented
- [ ] data-testid for E2E

---

## Migration Path

### Existing Components
1. Audit for h-8/h-10 violations → Replace with h-9
2. Add filter chips where filters exist
3. Document exceptions (icon sizes, etc.)

### New Components
1. Use `lib/tokens.ts` from day 1
2. Follow checklist above
3. PR review enforces invariants

---

## Success Metrics

### Before (2026-02-11)
- Mixed heights: h-8, h-9, h-10
- No visual feedback for active filters
- Arbitrary spacing across components
- Some sheets missing titles

### After (Target)
- ✅ Consistent h-9 for all controls
- ✅ Filter chips always visible
- ✅ Standardized spacing scale
- ✅ All sheets accessible

---

## References

- **Tokens**: `apps/web/src/lib/tokens.ts`
- **Filter Chips**: `apps/web/src/app/project/[id]/page.tsx` (lines ~2077-2145)
- **State Hierarchy**: `docs/architecture/STATE_HIERARCHY.md`
- **Roadmap**: `docs/architecture/UX_POLISH_ROADMAP_FEB_2026.md`
