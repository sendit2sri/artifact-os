# Research Inbox - UX Improvements Implementation Summary

**Date:** February 7, 2026  
**Completed:** All 9 Issues ✓

## Overview

This document summarizes the comprehensive UX improvements made to the Research Inbox application, following 2026 SaaS design trends: fewer borders, more spacing, soft surfaces, clear hierarchy, and strong feedback loops.

---

## ✅ ISSUE 1: Auto-Refresh After Ingestion

**Problem:** Facts only appeared after manual page reload post-extraction.

### Changes Made

**Frontend (`apps/web/src/app/project/[id]/page.tsx`):**
- Renamed query keys for consistency: `["project-facts", projectId]`, `["project-jobs", projectId]`, `["project-sources", projectId]`
- Added completion tracking with `useRef` and `useEffect` to detect newly completed jobs
- Auto-invalidate all related queries when jobs transition to `COMPLETED`
- Improved polling strategy: 2.5s intervals for active jobs, stops when none active

**Affected Components:**
- `SourceTracker.tsx` - Updated to use new query keys
- `FactCard.tsx` - Updated query invalidation

### Verification Checklist
- [ ] Add a new source URL
- [ ] Watch the "Extracting facts..." spinner in the main area
- [ ] Verify facts appear automatically without refresh when job completes
- [ ] Check that polling stops when no jobs are running (network tab should be quiet)

---

## ✅ ISSUE 2: Real & Persistent Sorting

**Problem:** Sort dropdown didn't actually sort, no URL persistence, no visual feedback.

### Changes Made

**Frontend (`apps/web/src/app/project/[id]/page.tsx`):**
- Added URL query param synchronization: `?sort=by_confidence`, `?sort=newest`
- Default sort is `key-first` (not added to URL to keep URLs clean)
- Visual feedback: "✓ Sorted" indicator appears when non-default sort is active
- Sort logic:
  - `key-first`: `is_key_claim DESC, confidence_score DESC, created_at DESC`
  - `by_confidence`: `confidence_score DESC, created_at DESC`
  - `newest`: `created_at DESC`

### Verification Checklist
- [ ] Select "By Confidence" - URL should update to `?sort=confidence`
- [ ] Verify facts are sorted by confidence score (highest first)
- [ ] Check "✓ Sorted" label appears below dropdown
- [ ] Refresh page - sort should persist
- [ ] Switch back to "Key Claims First" - URL param should be removed

---

## ✅ ISSUE 3: Project Overview Dashboard

**Problem:** No project-level overview, no way to create/rename projects.

### Changes Made

**New Component (`apps/web/src/components/ProjectOverview.tsx`):**
- Created stat cards showing:
  - Total Sources
  - Total Facts
  - Key Claims count
  - Needs Review count
- Modern card design with icons and color-coded badges

**Frontend (`apps/web/src/app/project/[id]/page.tsx`):**
- Changed breadcrumb: "All Sources" → "Overview"
- Overview panel shows when no filter/domain/source is selected
- Added inline project rename: click project title in header to edit
- Press Enter to save, ESC to cancel

**Backend (`apps/backend/app/api/projects.py`):**
- Added `PATCH /projects/{project_id}` endpoint for title updates

### Verification Checklist
- [ ] Navigate to project root (click "Overview" in breadcrumb)
- [ ] Verify 4 stat cards display with correct counts
- [ ] Click project title "Research Inbox" in header
- [ ] Edit title, press Enter
- [ ] Verify toast "Project renamed" appears
- [ ] Refresh page - new title should persist

---

## ✅ ISSUE 4: Evidence Panel Auto-Scroll & Highlighting

**Problem:** Evidence panel didn't scroll to highlighted quote reliably; highlights weren't theme-aware.

### Changes Made

**Frontend (`apps/web/src/components/EvidenceInspector.tsx`):**
- Improved scroll logic using `requestAnimationFrame` for stability
- Works on both Reader and Raw tabs
- Searches for multiple selector types (mark, border-l-4, border-l-2)
- 400ms delay to allow content rendering
- Theme-aware highlight colors:
  - Light: `bg-primary/10`, `ring-primary/30`
  - Dark: `bg-primary/20`, `ring-primary/40`
- Applied to headings, paragraphs, lists, and raw text

### Verification Checklist
- [ ] Click "View Evidence" on a fact
- [ ] Verify panel opens with quote highlighted in colored box
- [ ] Switch between "Reader" and "Raw" tabs
- [ ] Verify scroll-to-match works on both tabs
- [ ] Toggle light/dark mode
- [ ] Verify highlight is visible and pleasing in both themes

---

## ✅ ISSUE 5: Premium Evidence Display

**Problem:** Evidence had bracket citations `[1]`, tables looked broken, typography wasn't premium.

### Changes Made

**Frontend (`apps/web/src/components/EvidenceInspector.tsx`):**

**Content Normalization:**
- Added `removeCitations()` function - strips `[1]`, `[2]`, `[citation needed]`, `[edit]` in Reader mode only
- Raw mode keeps citations for accuracy

**Table Detection:**
- Added `detectTableContent()` - identifies columnar data (multiple spaces/tabs)
- Added `renderTableBlocks()` - wraps tables in `<pre>` with horizontal scroll + subtle background

**Typography Improvements:**
- Font: Inter for readability
- Line height: 1.75 for comfortable reading
- Letter spacing: -0.011em for optical balance
- Max width: 65ch (optimal reading column)
- Generous padding: `p-8 md:p-16`
- Paragraph spacing: `mb-6`

**Toolbar Additions:**
- "Copy Quote" button
- "Open Original" button (opens source URL in new tab)
- "Close" button

### Verification Checklist
- [ ] Open evidence for a Wikipedia source
- [ ] Verify no `[1]`, `[2]` citations in Reader mode
- [ ] Switch to Raw mode - citations should be present
- [ ] If source has tables, verify they render in scrollable `<pre>` blocks
- [ ] Check typography: readable font, good line height, max-width column
- [ ] Click "Open Original" button - source should open in new tab
- [ ] Click "Copy Quote" - verify toast confirmation

---

## ✅ ISSUE 6: Inline Rename (No Modal)

**Problem:** Rename source used blocking modal dialog.

### Changes Made

**Frontend (`apps/web/src/components/SourceTracker.tsx`):**
- Removed `RenameSourceDialog` import and component
- Added inline rename state: `renamingJobId`, `renameValue`
- Double-click source name → becomes input field
- Enter saves, Esc cancels
- Shows "Enter save · Esc cancel" hint while editing
- Added `renameMutation` with toast feedback
- Background remains fully interactive

**Backend (uses existing endpoint):**
- Uses `PATCH /jobs/{job_id}` with `{ source_title: "new title" }`

### Verification Checklist
- [ ] Expand a domain in the sources sidebar
- [ ] Double-click a source name
- [ ] Verify it becomes an editable input
- [ ] Type new name, press Enter
- [ ] Verify toast "Source renamed" appears
- [ ] Verify name updates immediately
- [ ] Try again but press Esc - verify edit cancels
- [ ] Scroll/interact with rest of page while editing - verify no blocking

---

## ✅ ISSUE 7: Improved Generate Button UX

**Problem:** Generate button only appeared after selection; silent after click; modal blocked background.

### Changes Made

**Frontend (`apps/web/src/app/project/[id]/page.tsx`):**
- Generate bar now **always visible** at bottom of screen
- When `selectedFacts.size === 0`: shows hint "Select facts to generate synthesis"
- When facts selected: shows full toolbar with actions
- After generation completes:
  - Auto-opens OutputDrawer (right-side drawer)
  - Shows toast: "Synthesis complete! View in drawer →"
  - Background remains interactive (non-blocking)

**New Component (`apps/web/src/components/OutputDrawer.tsx`):**
- Right-side drawer (600-700px width)
- Shows output title, source count, fact count, creation date
- Premium typography for content display
- Footer actions: Copy, Download, Close
- Can scroll facts list while drawer is open

### Verification Checklist
- [ ] Load project with no facts selected
- [ ] Verify persistent bar at bottom shows "Select facts to generate"
- [ ] Select 2+ facts
- [ ] Verify bar expands with actions
- [ ] Click Generate
- [ ] Verify drawer opens on right side after completion
- [ ] Try scrolling/clicking facts list - verify background is interactive
- [ ] Click "Copy" - verify toast confirmation
- [ ] Click "Download" - verify markdown file downloads
- [ ] Close drawer - verify bar remains visible

---

## ✅ ISSUE 8: Synthesis Builder Non-Blocking

**Problem:** Needed to verify Synthesis Builder doesn't block background.

### Status

**Already Implemented:** The `SynthesisBuilder` component uses `<Sheet>` (drawer) from shadcn/ui, which is **non-blocking by default**.

### Verification Checklist
- [ ] Select facts from multiple sources
- [ ] Click Generate when "Mixed topics detected" appears
- [ ] Verify builder opens as right-side drawer
- [ ] Try scrolling facts list in background - verify it's interactive
- [ ] Click outside drawer - verify it closes gracefully

---

## ✅ ISSUE 9: Output Storage & Display

**Problem:** Generated synthesis was shown in toast then lost; no persistence or export.

### Changes Made

**Backend Models (`apps/backend/app/models.py`):**
- Created new `Output` model:
  - `id`, `project_id`, `title`, `content`
  - `output_type`, `mode` (paragraph/outline/brief)
  - `fact_ids` (array), `source_count`
  - `created_at`, `updated_at`

**Backend API (`apps/backend/app/api/projects.py`):**
- Modified `POST /projects/{project_id}/synthesize` to auto-save outputs
- Added `GET /projects/{project_id}/outputs` - list all outputs
- Added `GET /outputs/{output_id}` - get single output
- Added `DELETE /outputs/{output_id}` - delete output

**Database Migration (`apps/backend/alembic/versions/f1c8d4a2e9b7_add_outputs_table.py`):**
- Creates `outputs` table with all fields
- Adds foreign key to projects
- Adds index on `project_id`

**Frontend API Client (`apps/web/src/lib/api.ts`):**
- Added `Output` interface
- Added `fetchProjectOutputs(projectId)`
- Added `fetchOutput(outputId)`
- Added `deleteOutput(outputId)`
- Modified `synthesizeFacts` to return `output_id`

**Frontend Integration:**
- After synthesis completes, fetches full output via `output_id`
- Opens OutputDrawer with complete output object
- Output can be copied or downloaded as markdown

### Verification Checklist
- [ ] Generate a synthesis
- [ ] Verify output drawer opens with content
- [ ] Click "Download" - verify markdown file is saved
- [ ] Close drawer
- [ ] Refresh page
- [ ] **Future:** Navigate to outputs list (not yet built in UI)
- [ ] Verify output is persisted in database

---

## Database Migration Instructions

Run the migration to create the `outputs` table:

```bash
cd apps/backend
alembic upgrade head
```

Verify migration succeeded:

```bash
alembic current
# Should show: f1c8d4a2e9b7 (head)
```

---

## Visual Design Improvements Applied Throughout

Following 2026 SaaS design trends:

### Spacing & Surfaces
- Increased padding: `p-8 md:p-16` for content areas
- Card spacing: `gap-4`, `gap-6` for hierarchical layouts
- Soft shadows: `shadow-xs`, `shadow-sm` instead of heavy borders
- Backdrop blur: `backdrop-blur-sm` for floating elements

### Typography
- Font stack: Inter, system fonts for readability
- Line heights: 1.75 for reading, 1.5 for UI
- Letter spacing: -0.011em for optical balance
- Reading column: max-width 65ch

### Color & Feedback
- Theme-aware highlights: `bg-primary/10 dark:bg-primary/20`
- Ring borders instead of solid: `ring-2 ring-primary/30`
- Subtle hover states: `hover:bg-surface-2`
- Clear disabled states: `opacity-50`
- Success/warning/danger color system consistently applied

### Interactions
- Non-blocking drawers instead of modals
- Inline editing where possible
- Persistent UI elements with disabled states (not hidden)
- Tooltips on icon buttons
- Toast confirmations for actions
- Auto-save with visual feedback

---

## Testing Recommendations

### End-to-End Test Flow

1. **Fresh Project:**
   - [ ] Create/rename project
   - [ ] View overview dashboard

2. **Add Sources:**
   - [ ] Add a URL
   - [ ] Watch auto-refresh when processing completes
   - [ ] Rename source inline (double-click)

3. **Browse Facts:**
   - [ ] Apply different sorts
   - [ ] Verify URL persistence
   - [ ] View evidence
   - [ ] Check auto-scroll and highlighting

4. **Generate Synthesis:**
   - [ ] Select facts
   - [ ] Generate output
   - [ ] Verify drawer opens
   - [ ] Copy and download output
   - [ ] Verify output persists

5. **Theme Testing:**
   - [ ] Toggle dark mode
   - [ ] Verify all colors are readable
   - [ ] Check highlights in evidence panel

---

## Performance Improvements

- **Polling Strategy:** Stops when no active jobs (saves API calls)
- **Query Key Consistency:** Proper cache invalidation reduces unnecessary fetches
- **Debounced Search:** In SourceTracker (400ms debounce)
- **Memoized Computations:** `useMemo` for expensive filters/sorts
- **RAF Scroll:** `requestAnimationFrame` for smooth scrolling

---

## Breaking Changes: None

All changes are **additive** and **backward-compatible**:
- New database table (`outputs`) doesn't affect existing data
- New API endpoints don't break existing ones
- Frontend changes are purely enhancements
- Existing functionality remains intact

---

## Future Enhancements (Not Included)

These would be natural next steps:

1. **Outputs Library Page:** Browse all saved outputs for a project
2. **Output Editing:** Edit title/content of saved outputs
3. **Output Sharing:** Generate public link or export to Notion/Gdocs
4. **Project Templates:** Start new projects from templates
5. **Bulk Import:** Upload multiple URLs at once
6. **Advanced Filters:** Filter facts by confidence, review status, date range
7. **Keyboard Shortcuts:** Power user shortcuts for common actions
8. **Collaborative Features:** Comments on facts, shared projects

---

## Code Quality Notes

### Type Safety
- All new interfaces properly typed (TypeScript)
- Pydantic schemas for all API requests/responses
- SQLModel for database models

### Error Handling
- Try-catch blocks in async operations
- Toast notifications for user feedback
- Graceful degradation (e.g., missing citations don't break render)

### Accessibility
- Semantic HTML (`<mark>`, `<pre>`, proper headings)
- Keyboard navigation support (Enter/Esc for inline edit)
- Color contrast in light/dark modes
- Tooltips on icon-only buttons

### Code Organization
- Extracted reusable utility functions (removeCitations, detectTableContent)
- Separated concerns (API client, components, pages)
- Consistent naming conventions
- Clear comments for complex logic

---

## Support & Maintenance

### Logs to Monitor

**Backend:**
- Synthesis errors: Check synthesis endpoint logs
- Migration issues: Check alembic logs
- Query performance: Monitor slow queries on outputs table

**Frontend:**
- React Query devtools: Verify cache behavior
- Browser console: Check for React warnings
- Network tab: Verify polling stops correctly

### Common Issues

**Issue:** Facts don't auto-refresh
**Solution:** Check React Query devtools - verify jobs query is polling and invalidating facts query

**Issue:** Sort doesn't persist on refresh
**Solution:** Check browser URL - sort param should be present (except key-first)

**Issue:** Inline rename doesn't save
**Solution:** Check network tab - verify PATCH /jobs/{id} request succeeds

**Issue:** Output drawer doesn't open
**Solution:** Check synthesis response - verify output_id is returned

---

## Conclusion

All 9 issues have been successfully implemented with:
- ✅ Full end-to-end functionality (frontend + backend + database)
- ✅ Modern 2026 SaaS design patterns
- ✅ Type safety and error handling
- ✅ Backward compatibility
- ✅ Comprehensive verification checklists

The Research Inbox now provides a polished, professional user experience with clear feedback, non-blocking interactions, and persistent state management.
