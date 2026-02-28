"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Star, CheckCircle2, Clock, AlertTriangle, FolderOpen } from "lucide-react";
import { ViewsPanel } from "@/components/ViewsPanel";
import type { SavedViewState } from "@/lib/savedViews";
import type { UseMutationResult } from "@tanstack/react-query";

export interface FactsControlsSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sortBy: "confidence" | "key-first" | "newest" | "needs_review";
    setSortBy: (v: "confidence" | "key-first" | "newest" | "needs_review") => void;
    groupBySource: boolean;
    setGroupBySource: (v: boolean) => void;
    collapseSimilar: boolean;
    setCollapseSimilar: (v: boolean) => void;
    showOnlySelected: boolean;
    setShowOnlySelected: (v: boolean) => void;
    showSuppressed: boolean;
    setShowSuppressed: (v: boolean) => void;
    viewsOpen: boolean;
    setViewsOpen: (v: boolean) => void;
    scopeType: "DOMAIN" | "URL" | null;
    scopeValue: string | null;
    viewMode: "key" | "all" | "pinned" | "graph";
    reviewStatusFilter: string | null;
    searchQuery: string;
    onApplyViewState: (state: SavedViewState) => void;
    projectId: string;
    workspaceId: string;
    putPreference: (workspaceId: string, payload: { project_id: string; key: string; value_json: string }) => Promise<unknown>;
    dedupMutation: UseMutationResult<unknown, Error, void, unknown>;
    factsCount: number;
    /** When set, shows a Buckets button in the sheet (same testid as toolbar for E2E). */
    onOpenBuckets?: () => void;
}

export function FactsControlsSheet({
    open,
    onOpenChange,
    sortBy,
    setSortBy,
    groupBySource,
    setGroupBySource,
    collapseSimilar,
    setCollapseSimilar,
    showOnlySelected,
    setShowOnlySelected,
    showSuppressed,
    setShowSuppressed,
    viewsOpen,
    setViewsOpen,
    scopeType,
    scopeValue,
    viewMode,
    reviewStatusFilter,
    searchQuery,
    onApplyViewState,
    projectId,
    workspaceId,
    putPreference,
    dedupMutation,
    factsCount,
    onOpenBuckets,
}: FactsControlsSheetProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full max-w-[min(90vw,22rem)] flex flex-col gap-4" data-testid="facts-controls-sheet">
                <SheetHeader>
                    <SheetTitle className="text-base">Facts controls</SheetTitle>
                </SheetHeader>
                <div className="space-y-6 overflow-y-auto">
                    {onOpenBuckets && (
                        <section>
                            <Button
                                data-testid="buckets-panel-open"
                                variant="outline"
                                size="sm"
                                className="w-full h-9 text-xs focus-visible:ring-2 focus-visible:ring-ring/30"
                                onClick={() => {
                                    onOpenChange(false);
                                    onOpenBuckets();
                                }}
                            >
                                <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                                Buckets
                            </Button>
                        </section>
                    )}
                    <section>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sort & Group</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sort</label>
                                <Select value={sortBy} onValueChange={(v: "confidence" | "key-first" | "newest" | "needs_review") => setSortBy(v)}>
                                    <SelectTrigger data-testid="facts-sort-trigger" className="h-9 w-full text-xs bg-surface border-border focus-visible:ring-2 focus-visible:ring-ring/30">
                                        <SelectValue placeholder="Sort by..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="needs_review" data-testid="facts-sort-option-needs_review">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="w-3 h-3" />
                                                Needs review first
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="key-first">
                                            <div className="flex items-center gap-2">
                                                <Star className="w-3 h-3" />
                                                Key claims first
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="confidence">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="w-3 h-3" />
                                                High confidence first
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="newest">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-3 h-3" />
                                                Newest first
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Group</label>
                                <Select value={groupBySource ? "source" : "off"} onValueChange={(v) => setGroupBySource(v === "source")}>
                                    <SelectTrigger data-testid="facts-group-trigger" className="h-9 w-full text-xs bg-surface border-border focus-visible:ring-2 focus-visible:ring-ring/30">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="off">No grouping</SelectItem>
                                        <SelectItem value="source" data-testid="facts-group-option-source">Group by Source</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                <input
                                    type="checkbox"
                                    checked={collapseSimilar}
                                    onChange={(e) => setCollapseSimilar(e.target.checked)}
                                    className="rounded border-border focus-visible:ring-2 focus-visible:ring-ring/30"
                                    data-testid="toggle-collapse-similar"
                                />
                                Collapse duplicates
                            </label>
                        </div>
                    </section>
                    <section>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Filters</h3>
                        <div className="space-y-2.5">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                <input
                                    type="checkbox"
                                    data-testid="facts-show-suppressed-toggle"
                                    checked={showSuppressed}
                                    onChange={(e) => setShowSuppressed(e.target.checked)}
                                    className="rounded border-border focus-visible:ring-2 focus-visible:ring-ring/30"
                                />
                                Show suppressed
                            </label>
                            <Button
                                data-testid="facts-dedup-trigger"
                                variant="outline"
                                size="sm"
                                className="w-full h-9 text-xs focus-visible:ring-2 focus-visible:ring-ring/30"
                                onClick={() => dedupMutation.mutate()}
                                disabled={dedupMutation.isPending || factsCount < 2}
                            >
                                {dedupMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                                Clean duplicates
                            </Button>
                        </div>
                    </section>
                    <section>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Selection</h3>
                        <div className="space-y-2.5">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                <input
                                    type="checkbox"
                                    checked={showOnlySelected}
                                    onChange={(e) => setShowOnlySelected(e.target.checked)}
                                    className="rounded border-border focus-visible:ring-2 focus-visible:ring-ring/30"
                                    data-testid="facts-selected-only-toggle"
                                />
                                Selected only
                            </label>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Views</label>
                                <ViewsPanel
                            projectId={projectId}
                            open={viewsOpen}
                            onOpenChange={setViewsOpen}
                            currentState={{
                                scopeType,
                                scopeValue,
                                viewMode,
                                reviewStatusFilter,
                                sortBy,
                                groupBySource,
                                searchQuery,
                                showOnlySelected,
                            }}
                            onApply={(state: SavedViewState) => {
                                onApplyViewState(state);
                                onOpenChange(false);
                            }}
                            buildViewLink={() => (typeof window !== "undefined" ? window.location.href : "")}
                            onSetDefault={(viewId) => {
                                putPreference(workspaceId, { project_id: projectId, key: "default_view_id", value_json: viewId }).catch(() => {});
                            }}
                            onApplyView={(viewId) => {
                                putPreference(workspaceId, { project_id: projectId, key: "last_view_id", value_json: viewId }).catch(() => {});
                            }}
                        />
                            </div>
                        </div>
                    </section>
                </div>
            </SheetContent>
        </Sheet>
    );
}
