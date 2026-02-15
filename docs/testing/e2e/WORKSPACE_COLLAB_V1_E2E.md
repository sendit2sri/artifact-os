# Workspace & Collaboration v1 E2E

## Summary

E2E coverage for workspaces, server-backed preferences, project list on Home, workspace selector, and project share link with workspace context. Multi-user readiness and team-safe state.

## Context

- **Workspaces**: GET /workspaces, GET /workspaces/{id}/projects. E2E mode: deterministic Personal + Team workspaces.
- **User preferences**: UserPreference model (workspace_id, project_id nullable, key, value_json). GET/PUT preferences; keys: default_view_id, last_view_id, show_only_selected_default, sort_default, group_default.
- **Frontend**: Workspace selector (workspace-trigger, workspace-panel, workspace-item); Home project list (projects-list, project-card, project-create); project page preference hydration + server sync; project share link (?ws=workspace_id); workspace-access-error banner.
- **Migration**: On first load, if server preference missing but local exists, PUT to server; keep local as fallback.

## What changed

- Backend: UserPreference model + migration; workspaces router (GET workspaces, GET workspace projects, GET/PUT preferences); E2E mode Personal/Team.
- Frontend: api workspaces/preferences; useCurrentWorkspace; WorkspaceSelector; Home real project list + New Project; project page workspace from project/URL, preference fetch/apply/migrate, debounced PUT for sort/group/show_only_selected, ViewsPanel onSetDefault/onApplyView → putPreference; project share link (project-share-link); workspace-access-error banner.
- E2E: workspace-switch.spec.ts, preferences-persist.spec.ts, project-share-link.spec.ts.

## How to run / verify

- Backend: `ARTIFACT_ENABLE_TEST_SEED=true` for E2E workspaces (Personal + Team).
- Run migration: `alembic upgrade head` (user_preferences table).
- E2E: `cd apps/web && npm run test:e2e -- workspace-switch.spec.ts preferences-persist.spec.ts project-share-link.spec.ts`
- CI: `npm run test:e2e:ci` (includes the three new specs).

## Files touched

- `apps/backend/app/models.py` — UserPreference
- `apps/backend/alembic/versions/l6i3d4e5f6g_add_user_preferences.py` — new
- `apps/backend/app/api/workspaces.py` — new
- `apps/backend/app/main.py` — workspaces router
- `apps/web/src/lib/api.ts` — fetchWorkspaces, fetchWorkspaceProjects, fetchPreferences, putPreference
- `apps/web/src/hooks/useCurrentWorkspace.ts` — new
- `apps/web/src/components/WorkspaceSelector.tsx` — new
- `apps/web/src/app/page.tsx` — workspace selector, real project list, New Project
- `apps/web/src/app/project/[id]/page.tsx` — workspace from project/URL, preferences, share link, WorkspaceSelector
- `apps/web/src/components/ViewsPanel.tsx` — onSetDefault, onApplyView
- `apps/web/tests/e2e/workspace-switch.spec.ts` — new
- `apps/web/tests/e2e/preferences-persist.spec.ts` — new
- `apps/web/tests/e2e/project-share-link.spec.ts` — new
- `apps/web/package.json` — test:e2e:ci entries

## Links

- [[testing/e2e/SAVED_VIEWS_PERF_V1_E2E]]
- [[testing/e2e/RUN_E2E]]
- [[_index]]
