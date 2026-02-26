/**
 * Saved Views (frontend-only v1).
 * Key: artifact_saved_views_v1:${projectId}
 * Default: artifact_default_view_v1:${projectId}
 */

export type ViewScopeType = "DOMAIN" | "URL" | null;
export type ViewMode = "key" | "all" | "pinned" | "graph";
export type SortBy = "needs_review" | "key-first" | "confidence" | "newest";

export interface SavedViewState {
  scopeType: ViewScopeType;
  scopeValue: string | null;
  viewMode: ViewMode;
  reviewStatusFilter: string | null;
  sortBy: SortBy;
  groupBySource: boolean;
  searchQuery: string;
  showOnlySelected?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  created_at: string;
  state: SavedViewState;
}

const VIEWS_KEY = (projectId: string) => `artifact_saved_views_v1:${projectId}`;
const DEFAULT_VIEW_KEY = (projectId: string) => `artifact_default_view_v1:${projectId}`;

export function getSavedViews(projectId: string): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setSavedViews(projectId: string, views: SavedView[]): void {
  try {
    localStorage.setItem(VIEWS_KEY(projectId), JSON.stringify(views));
  } catch {
    /* ignore */
  }
}

export function addSavedView(projectId: string, name: string, state: SavedViewState): SavedView {
  const views = getSavedViews(projectId);
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  const view: SavedView = { id, name, created_at, state };
  setSavedViews(projectId, [...views, view]);
  return view;
}

export function updateSavedView(projectId: string, id: string, updates: Partial<Pick<SavedView, "name" | "state">>): void {
  const views = getSavedViews(projectId).map((v) =>
    v.id === id ? { ...v, ...updates } : v
  );
  setSavedViews(projectId, views);
}

export function deleteSavedView(projectId: string, id: string): void {
  const views = getSavedViews(projectId).filter((v) => v.id !== id);
  setSavedViews(projectId, views);
  const defaultId = getDefaultViewId(projectId);
  if (defaultId === id) setDefaultViewId(projectId, null);
}

export function getDefaultViewId(projectId: string): string | null {
  try {
    return localStorage.getItem(DEFAULT_VIEW_KEY(projectId));
  } catch {
    return null;
  }
}

export function setDefaultViewId(projectId: string, viewId: string | null): void {
  try {
    if (viewId) localStorage.setItem(DEFAULT_VIEW_KEY(projectId), viewId);
    else localStorage.removeItem(DEFAULT_VIEW_KEY(projectId));
  } catch {
    /* ignore */
  }
}
