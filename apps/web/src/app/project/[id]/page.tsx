"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, use, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Panel, Group, Separator } from "react-resizable-panels";
import { FactCard } from "@/components/FactCard";
import { SourceTracker } from "@/components/SourceTracker";
import { EvidencePanelSimple } from "@/components/EvidencePanelSimple";
import { ExportPanel } from "@/components/ExportPanel";
import { DomainOverview } from "@/components/DomainOverview";
import { SummaryCard } from "@/components/SummaryCard";
import { SynthesisBuilder } from "@/components/SynthesisBuilder";
import { OutputDrawer } from "@/components/OutputDrawer";
import { OutputCompareDrawer } from "@/components/OutputCompareDrawer";
import { ProcessingTimeline } from "@/components/ProcessingTimeline";
import { QueuedJobAlert, QueuedJobBadge } from "@/components/QueuedJobAlert";
import { SelectedFactsDrawer } from "@/components/SelectedFactsDrawer";
import { SimilarFactsDrawer } from "@/components/SimilarFactsDrawer";
import { ClusterPreviewModal } from "@/components/ClusterPreviewModal";
import { SourceHealthPanel } from "@/components/SourceHealthPanel";
import { ProjectOverview } from "@/components/ProjectOverview";
import { OnboardingOverlay, getOnboardingCompleted } from "@/components/OnboardingOverlay";
import { PhaseIndicator, PhaseStatusLine, PhaseProgressBar } from "@/components/PhaseIndicator";
import { computeAppPhase, getPhaseCTA, canPerformAction } from "@/lib/phase";
import { fetchProject, fetchProjectFacts, fetchProjectJobs, ingestUrl, resetProject, synthesizeFacts, Fact, Job, uploadFile, batchUpdateFacts, Output, fetchProjectOutputs, fetchOutput, patchOutput, OutputSummary, updateProjectName, seedDemoProject, seedDemoSources, retrySource, updateFact, dedupFacts, fetchSourcesSummary, fetchWorkspaces, fetchPreferences, putPreference, fetchFactsGroup, fetchOutputEvidenceMap, type FactsGroupedResponse, type OutputEvidenceMapFact, type SynthesizeFactInput } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Layout, Search, Sparkles, X, Home, ChevronRight, Download, UploadCloud, Check, Star, FileText, Video, AlignLeft, Moon, Sun, Clock, CheckCircle2, AlertTriangle, History, List, Activity, Menu, SlidersHorizontal, Share2, FolderOpen } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getDensityClasses } from "@/lib/uiDensity";
import { Z } from "@/lib/tokens";
import { toast } from "sonner";
import { useUndoManager } from "@/hooks/useUndoManager";
import { ViewsPanel } from "@/components/ViewsPanel";
import type { SavedViewState } from "@/lib/savedViews";
import { getSavedViews, getDefaultViewId } from "@/lib/savedViews";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { WorkspaceSelector } from "@/components/WorkspaceSelector";
import { AddSourceSheet } from "@/components/AddSourceSheet";
import { SourcesDrawer } from "@/components/SourcesDrawer";
import { FactsControlsSheet } from "@/components/FactsControlsSheet";
import { FactsGraphView } from "@/components/FactsGraphView";
import { BucketsPanel, type Bucket } from "@/components/BucketsPanel";

const getDomain = (u: string) => {
    try { return new URL(u).hostname.replace(/^www\./, ""); }
    catch { return u; }
};

/** Build minimal Fact for EvidencePanelSimple from output evidence map item (when fact not in current list). */
function evidenceMapFactToFact(em: OutputEvidenceMapFact): Fact {
    return {
        id: em.id,
        fact_text: em.fact_text,
        source_doc_id: "",
        source_url: em.source_url ?? "",
        source_domain: em.source_domain ?? "",
        confidence_score: 0,
        section_context: undefined,
        tags: [],
        is_key_claim: em.is_key_claim,
        review_status: em.review_status as Fact["review_status"],
        is_pinned: em.is_pinned,
        quote_text_raw: undefined,
        evidence_start_char_raw: em.evidence_start_char_raw ?? undefined,
        evidence_end_char_raw: em.evidence_end_char_raw ?? undefined,
        evidence_snippet: em.evidence_snippet ?? undefined,
    };
}

/** Parse view state from URL params */
function parseViewStateFromUrl(params: URLSearchParams) {
    const allowedSort = new Set(["confidence", "key-first", "newest", "needs_review"]);
    const allowedView = new Set(["key", "all", "pinned", "graph"]);
    
    const sortParam = params.get("sort");
    const viewParam = params.get("view");
    
    return {
        scopeType: params.get("type") as "DOMAIN" | "URL" | null,
        scopeValue: params.get("value"),
        searchQuery: params.get("q") ?? "",
        sortBy: (sortParam && allowedSort.has(sortParam) ? sortParam : null) as "confidence" | "key-first" | "newest" | "needs_review" | null,
        reviewStatusFilter: params.get("review_status"),
        groupBySource: params.get("group") === "source",
        viewMode: (viewParam && allowedView.has(viewParam) ? viewParam : "key") as "key" | "all" | "pinned" | "graph",
        showOnlySelected: params.get("show_selected") === "1",
    };
}

/** Build URL params from view state */
function buildUrlFromViewState(state: {
    scopeType: "DOMAIN" | "URL" | null;
    scopeValue: string | null;
    searchQuery: string;
    sortBy: string;
    reviewStatusFilter: string | null;
    groupBySource: boolean;
    viewMode: string;
    showOnlySelected: boolean;
}) {
    const params = new URLSearchParams();
    
    if (state.scopeType && state.scopeValue) {
        params.set("type", state.scopeType);
        params.set("value", state.scopeValue);
    }
    if (state.searchQuery) params.set("q", state.searchQuery);
    
    // Always include sort for shareability
    params.set("sort", state.sortBy);
    
    if (state.reviewStatusFilter) params.set("review_status", state.reviewStatusFilter);
    
    // Only write group when enabled (not "off")
    if (state.groupBySource) params.set("group", "source");
    
    if (state.viewMode !== "key") params.set("view", state.viewMode);
    if (state.showOnlySelected) params.set("show_selected", "1");
    
    return params;
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: projectId } = use(params);
    const [currentWorkspaceId, setCurrentWorkspaceId] = useCurrentWorkspace();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { theme, setTheme } = useTheme();

    // Fix hydration mismatch: only render theme icon after client mount
    const [mounted, setMounted] = useState(false);

    // Stable searchParams string (prevents identity issues)
    const sp = searchParams.toString();

    // Parse initial state from URL (reactive to sp)
    const initialState = useMemo(() => parseViewStateFromUrl(new URLSearchParams(sp)), [sp]);

    // State declarations (with proper nullish defaults)
    const [scopeType, setScopeType] = useState<"DOMAIN" | "URL" | null>(initialState.scopeType);
    const [scopeValue, setScopeValue] = useState<string | null>(initialState.scopeValue);
    const [viewMode, setViewMode] = useState<"key" | "all" | "pinned" | "graph">(initialState.viewMode);
    const [graphSelectedGroupId, setGraphSelectedGroupId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<"confidence" | "key-first" | "newest" | "needs_review">(
        initialState.sortBy ?? "needs_review"
    );
    const [groupBySource, setGroupBySource] = useState(initialState.groupBySource);
    const [searchQuery, setSearchQuery] = useState(initialState.searchQuery);
    const [reviewStatusFilter, setReviewStatusFilter] = useState<string | null>(initialState.reviewStatusFilter);
    const [showOnlySelected, setShowOnlySelected] = useState(initialState.showOnlySelected);

    // Hydration gates
    const isHydratingRef = useRef(true);
    const urlHydratedRef = useRef(false);
    const prefsHydratedRef = useRef(false);
    const migratedRef = useRef(false);
    const [viewsOpen, setViewsOpen] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [inputType, setInputType] = useState<"url" | "file">("url");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [viewingFact, setViewingFact] = useState<Fact | null>(null);
    const [evidenceFactIdsSnapshot, setEvidenceFactIdsSnapshot] = useState<string[]>([]);
    const [selectedFacts, setSelectedFacts] = useState<Set<string>>(new Set());
    const [selectionModeActive, setSelectionModeActive] = useState(false);
    const selectionModeActiveRef = useRef(selectionModeActive);
    selectionModeActiveRef.current = selectionModeActive;
    const [selectionRestoredFromStorage, setSelectionRestoredFromStorage] = useState(false);
    const selectionSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [currentOutput, setCurrentOutput] = useState<Output | null>(null);
    const [showOutputDrawer, setShowOutputDrawer] = useState(false);
    const [synthesisMode, setSynthesisMode] = useState<"paragraph" | "research_brief" | "script_outline" | "split">("paragraph");
    const [showSelectionDrawer, setShowSelectionDrawer] = useState(false);
    const [lastSynthesisError, setLastSynthesisError] = useState<string | null>(null);
    const [lastSynthesisPayload, setLastSynthesisPayload] = useState<{ richFacts: SynthesizeFactInput[]; mode: "paragraph" | "research_brief" | "script_outline" | "split" } | null>(null);
    const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
    const [showCompareDrawer, setShowCompareDrawer] = useState(false);
    const [outputOpenedFromHistory, setOutputOpenedFromHistory] = useState(false);
    const [showSelectedFactsDrawer, setShowSelectedFactsDrawer] = useState(false);
    const [selectedFactsDrawerFromOutput, setSelectedFactsDrawerFromOutput] = useState(false);
    const [evidenceAutoAdvance, setEvidenceAutoAdvance] = useState(true);
    const [showSuppressed, setShowSuppressed] = useState(false);
    const [collapseSimilar, setCollapseSimilar] = useState(false);
    const [collapseSimilarMinSim, setCollapseSimilarMinSim] = useState(0.88);
    const [similarDrawerGroupId, setSimilarDrawerGroupId] = useState<string | null>(null);
    const [similarDrawerRepFact, setSimilarDrawerRepFact] = useState<Fact | null>(null);
    const groupFactsCacheRef = useRef<Map<string, Fact[]>>(new Map());
    const pendingSynthesisRef = useRef<{ richFacts: SynthesizeFactInput[]; mode: "paragraph" | "research_brief" | "script_outline" | "split" } | null>(null);
    const [showClusterPreview, setShowClusterPreview] = useState(false);
    const [clusterPreviewGroups, setClusterPreviewGroups] = useState<Array<{ groupId: string; repFact: Fact; collapsedCount: number; includeAll: boolean }>>([]);
    const [showSourceHealth, setShowSourceHealth] = useState(false);
    const [pinnedPanels, setPinnedPanels] = useState<{ output: boolean; evidence: boolean; history: boolean }>({ output: false, evidence: false, history: false });
    const [highlightCanonicalUrl, setHighlightCanonicalUrl] = useState<string | null>(null);
    const [addSourceSheetOpen, setAddSourceSheetOpen] = useState(false);
    const [sourcesDrawerOpen, setSourcesDrawerOpen] = useState(false);
    const [factsControlsOpen, setFactsControlsOpen] = useState(false);
    const [buckets, setBuckets] = useState<Bucket[]>([]);
    const [showBucketsPanel, setShowBucketsPanel] = useState(false);
    const [synthesisBucketLabel, setSynthesisBucketLabel] = useState<string | null>(null);
    const isSm = useMediaQuery("(min-width: 640px)");
    const isMd = useMediaQuery("(min-width: 768px)");
    const isLg = useMediaQuery("(min-width: 1024px)");
    const historyContentRef = useRef<HTMLDivElement>(null);
    const historyScrollTopRef = useRef(0);
    const panelStackRef = useRef<Array<"history" | "output" | "evidence">>([]);
    const outputCacheRef = useRef<Map<string, Output>>(new Map());

    const pushPanel = useCallback((panel: "history" | "output" | "evidence") => {
        panelStackRef.current = [...panelStackRef.current, panel];
    }, []);
    const popPanel = useCallback(() => {
        const stack = panelStackRef.current;
        if (stack.length <= 1) return;
        stack.pop();
        const top = stack[stack.length - 1];
        if (top === "history") {
            setShowOutputDrawer(false);
            setShowHistoryDrawer(true);
        }
    }, []);
    const [addUrlError, setAddUrlError] = useState<string | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitleValue, setEditTitleValue] = useState("");
    const [titleError, setTitleError] = useState<string | null>(null);
    const [showExportPanel, setShowExportPanel] = useState(false);
    const [isBatchUpdating, setIsBatchUpdating] = useState(false);
    const [focusMode, setFocusMode] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [onboardingStep, setOnboardingStep] = useState(0);
    const [showCommandPalette, setShowCommandPalette] = useState(false);
    const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
    const urlInputRef = useRef<HTMLInputElement>(null);
    const undoManager = useUndoManager();

    // URL → state sync (runs on URL changes, sets hydration complete)
    useEffect(() => {
        const params = new URLSearchParams(sp);
        const state = parseViewStateFromUrl(params);
        
        // Apply all state (including nulls to clear)
        setScopeType(state.scopeType);
        setScopeValue(state.scopeValue);
        setSearchQuery(state.searchQuery);
        if (state.sortBy) setSortBy(state.sortBy);
        setReviewStatusFilter(state.reviewStatusFilter);
        setGroupBySource(state.groupBySource);
        setViewMode(state.viewMode);
        setShowOnlySelected(state.showOnlySelected);
        
        // Mark hydration complete
        urlHydratedRef.current = true;
        isHydratingRef.current = false;
    }, [sp]);

    useEffect(() => {
        if (viewMode !== "graph") setGraphSelectedGroupId(null);
    }, [viewMode]);

    // focusMode is OK in localStorage (ephemeral preference)
    useEffect(() => {
        try {
            const stored = localStorage.getItem("artifact:focusMode");
            if (stored === "true") setFocusMode(true);
        } catch (_) { /* ignore */ }
    }, []);
    const handleFocusModeChange = useCallback((enabled: boolean) => {
        setFocusMode(enabled);
        try {
            localStorage.setItem("artifact:focusMode", enabled ? "true" : "false");
        } catch (_) { /* ignore */ }
    }, []);

    // Toast deduplication: Track which jobs/sources we've already notified about
    const toastShownRef = useRef(new Set<string>());

    // Set mounted state after hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // Diagnostics strip (E2E + debug mode)
    const isDiagnosticsMode = 
        process.env.NODE_ENV === 'development' || 
        searchParams.get('debug') === '1';

    const [diagnosticsIdle, setDiagnosticsIdle] = useState<boolean | null>(null);
    const [diagnosticsIdleReasons, setDiagnosticsIdleReasons] = useState<string[]>([]);
    const [diagnosticsTime, setDiagnosticsTime] = useState<string>("");

    useEffect(() => {
        if (!isDiagnosticsMode) return;
        
        const interval = setInterval(() => {
            const isIdleResult = typeof window !== "undefined" && (window.__e2e?.isIdle as (() => boolean | { idle: boolean; reasons: unknown[] }) | undefined)?.();
            // isIdleResult can be boolean (old) or object with {idle, reasons} (new)
            const idle = typeof isIdleResult === 'object' ? isIdleResult.idle : Boolean(isIdleResult);
            const reasons = typeof isIdleResult === "object" && Array.isArray(isIdleResult.reasons) ? (isIdleResult.reasons as string[]) : [];
            setDiagnosticsIdle(idle);
            setDiagnosticsIdleReasons(reasons);
            setDiagnosticsTime(new Date().toLocaleTimeString());
        }, 250);
        
        return () => clearInterval(interval);
    }, [isDiagnosticsMode]);

    // Restore history list scroll when reopening History drawer (e.g. after Back to History)
    useEffect(() => {
        if (showHistoryDrawer && historyContentRef.current) {
            const top = historyScrollTopRef.current;
            requestAnimationFrame(() => {
                if (historyContentRef.current) historyContentRef.current.scrollTop = top;
            });
        }
    }, [showHistoryDrawer]);

    const queryClient = useQueryClient();

    const { data: project } = useQuery({
        queryKey: ["project", projectId],
        queryFn: () => fetchProject(projectId),
    });
    const projectTitle = project?.title ?? "Research Inbox";
    const workspaceId = project?.workspace_id ?? searchParams.get("ws") ?? currentWorkspaceId ?? "123e4567-e89b-12d3-a456-426614174000";

    // Migrate localStorage → server prefs (run once, must be after workspaceId)
    useEffect(() => {
        if (!mounted || !workspaceId || !projectId || migratedRef.current) return;
        migratedRef.current = true;
        
        try {
            // Migrate sort
            const localSort = localStorage.getItem("artifact_sort_v1");
            if (localSort && ["confidence", "key-first", "newest", "needs_review"].includes(localSort)) {
                putPreference(workspaceId, { 
                    project_id: projectId, 
                    key: "sort_default", 
                    value_json: localSort 
                }).then(() => {
                    localStorage.removeItem("artifact_sort_v1");
                }).catch(() => {});
            }
            
            // Migrate group
            const localGroup = localStorage.getItem("artifact_group_by_source_v1");
            if (localGroup === "true") {
                putPreference(workspaceId, { 
                    project_id: projectId, 
                    key: "group_default", 
                    value_json: true 
                }).then(() => {
                    localStorage.removeItem("artifact_group_by_source_v1");
                }).catch(() => {});
            }
            
            // Migrate show selected
            const localShowSelected = localStorage.getItem(`artifact_show_selected_v1:${projectId}`);
            if (localShowSelected === "true") {
                putPreference(workspaceId, { 
                    project_id: projectId, 
                    key: "show_only_selected_default", 
                    value_json: true 
                }).then(() => {
                    localStorage.removeItem(`artifact_show_selected_v1:${projectId}`);
                }).catch(() => {});
            }
        } catch (_) { /* ignore */ }
    }, [mounted, workspaceId, projectId]);

    const { data: workspaces = [] } = useQuery({
        queryKey: ["workspaces"],
        queryFn: () => fetchWorkspaces(),
    });
    const [workspaceAccessError, setWorkspaceAccessError] = useState(false);
    useEffect(() => {
        const wsParam = searchParams.get("ws");
        if (!wsParam || !mounted) return;
        const inList = workspaces.some((w) => w.id === wsParam);
        if (inList) setCurrentWorkspaceId(wsParam);
        else setWorkspaceAccessError(true);
    }, [searchParams, mounted, workspaces, setCurrentWorkspaceId]);

    const renameMutation = useMutation({
        mutationFn: (name: string) => updateProjectName(projectId, name),
        onMutate: async (newTitle) => {
            setTitleError(null);
            await queryClient.cancelQueries({ queryKey: ["project", projectId] });
            const prev = queryClient.getQueryData(["project", projectId]);
            queryClient.setQueryData(["project", projectId], (old: { id: string; title: string } | undefined) => (old ? { ...old, title: newTitle } : { id: projectId, title: newTitle }));
            return { prev };
        },
        onError: (_err, _newTitle, context) => {
            if (context?.prev) queryClient.setQueryData(["project", projectId], context.prev);
            setTitleError("Failed to rename project. Please try again.");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
            setIsEditingTitle(false);
        },
    });

    const handleSaveTitle = () => {
        const trimmed = editTitleValue.trim();
        if (!trimmed) {
            setTitleError("Title cannot be empty");
            return;
        }
        if (trimmed.length < 3) {
            setTitleError("Title must be at least 3 characters");
            return;
        }
        if (trimmed === projectTitle) {
            setIsEditingTitle(false);
            setTitleError(null);
            return;
        }
        renameMutation.mutate(trimmed);
    };

    const handleCancelTitle = () => {
        setEditTitleValue(projectTitle);
        setTitleError(null);
        setIsEditingTitle(false);
    };

    const handleStartEditTitle = () => {
        setEditTitleValue(projectTitle);
        setTitleError(null);
        setIsEditingTitle(true);
    };

    // Queries with improved polling logic
    const { data: jobs, dataUpdatedAt: jobsUpdatedAt } = useQuery({
        queryKey: ["project-jobs", projectId],
        queryFn: () => fetchProjectJobs(projectId),
        refetchOnWindowFocus: false,
        refetchInterval: (query) => {
            const data = query.state.data as Job[] | undefined;
            const hasActive = data?.some(j => ["PENDING", "RUNNING"].includes(j.status));
            return hasActive ? 2500 : false; // Poll every 2.5s when active, stop otherwise
        },
    });

    const { data: sources = [] } = useQuery({
        queryKey: ["project-sources", projectId],
        queryFn: () => fetchSourcesSummary(projectId),
        refetchOnWindowFocus: false,
    });

    const isProcessing = (jobs ?? []).some(j => ["PENDING", "RUNNING"].includes(j.status));
    const completedJobIds = useMemo(() => 
        (jobs ?? []).filter(j => j.status === "COMPLETED").map(j => j.id), 
        [jobs]
    );

    // Track previous completed job IDs to detect new completions
    const prevCompletedJobIds = useRef<string[]>([]);
    
    useEffect(() => {
        // Detect newly completed jobs
        const newlyCompleted = completedJobIds.filter(id => !prevCompletedJobIds.current.includes(id));
        
        if (newlyCompleted.length > 0) {
            // Invalidate facts and sources when jobs complete
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
        }
        
        prevCompletedJobIds.current = completedJobIds;
    }, [completedJobIds, projectId, queryClient]);

    // ✅ STEP #8: Server-side filtering and sorting
    const factsFilter = useMemo(() => {
        const filter: Record<string, string | number | boolean | undefined> = {};
        
        // Map viewMode and reviewStatusFilter to backend filter param
        if (reviewStatusFilter) {
            filter.filter = reviewStatusFilter;
        } else if (viewMode === "pinned") {
            filter.filter = "pinned";
        } else if (viewMode === "key") {
            filter.filter = "key_claims";
        } else {
            filter.filter = "all";
        }
        
        // Map sortBy to backend sort param
        if (sortBy === "confidence") {
            filter.sort = "confidence";
            filter.order = "desc";
        } else if (sortBy === "key-first") {
            filter.sort = "key_claims";
            filter.order = "desc";
        } else if (sortBy === "newest") {
            filter.sort = "newest";
            filter.order = "desc";
        } else if (sortBy === "needs_review") {
            filter.sort = "needs_review";
            filter.order = "desc";
        }
        filter.show_suppressed = showSuppressed;
        if (collapseSimilar || viewMode === "graph") {
            filter.group_similar = 1;
            filter.min_sim = collapseSimilarMinSim;
        }
        return filter;
    }, [viewMode, reviewStatusFilter, sortBy, showSuppressed, collapseSimilar, collapseSimilarMinSim]);

    const { data: factsRaw, isLoading } = useQuery({
        queryKey: ["project-facts", projectId, factsFilter],
        queryFn: () => fetchProjectFacts(projectId, factsFilter),
        refetchOnWindowFocus: false,
        refetchInterval: isProcessing ? 3000 : false, // Poll every 3s when processing
    });

    const facts = useMemo(() => {
        const d = factsRaw;
        if (!d) return [];
        return Array.isArray(d) ? d : (d as FactsGroupedResponse).items;
    }, [factsRaw]);

    // Compute application phase state (after sources, jobs, facts)
    const phaseState = useMemo(() => 
        computeAppPhase(
            sources ?? [],
            jobs ?? [],
            facts ?? []
        ),
        [sources, jobs, facts]
    );
    const phaseCTA = useMemo(() => getPhaseCTA(phaseState), [phaseState]);

    const factsGroups = useMemo(() => {
        const d = factsRaw;
        if (!d || Array.isArray(d)) return {};
        return (d as FactsGroupedResponse).groups ?? {};
    }, [factsRaw]);

    // Restore selection from localStorage on load (when facts available)
    const hasRestoredRef = useRef(false);
    useEffect(() => {
        if (hasRestoredRef.current || !facts?.length || selectedFacts.size > 0) return;
        try {
            const raw = localStorage.getItem(`artifact_selected_facts_v1:${projectId}`);
            if (!raw) return;
            const saved: string[] = JSON.parse(raw);
            if (!Array.isArray(saved) || saved.length === 0) return;
            const factIds = new Set((facts ?? []).map((f) => f.id));
            const restored = new Set(saved.filter((id) => factIds.has(id)));
            if (restored.size > 0) {
                hasRestoredRef.current = true;
                setSelectedFacts(restored);
                setSelectionRestoredFromStorage(true);
            }
        } catch (_) { /* ignore */ }
    }, [projectId, facts, selectedFacts.size]);

    const enterSelectionMode = useCallback(() => {
        setSelectionModeActive(true);
    }, []);

    const exitSelectionMode = useCallback(() => {
        setSelectionModeActive(false);
    }, []);

    // selectionModeActive is explicit user intent; only reset on explicit exit (Done, Esc, navigate away)

    // Autosave selection to localStorage (debounced 300ms)
    useEffect(() => {
        if (selectedFacts.size === 0) {
            try { localStorage.removeItem(`artifact_selected_facts_v1:${projectId}`); } catch (_) { /* ignore */ }
        } else {
            if (selectionSaveRef.current) clearTimeout(selectionSaveRef.current);
            selectionSaveRef.current = setTimeout(() => {
                try { localStorage.setItem(`artifact_selected_facts_v1:${projectId}`, JSON.stringify(Array.from(selectedFacts))); } catch (_) { /* ignore */ }
                selectionSaveRef.current = null;
            }, 300);
        }
        return () => { if (selectionSaveRef.current) clearTimeout(selectionSaveRef.current); };
    }, [projectId, selectedFacts]);

    // ✅ STEP #13: Load outputs list for Last Output + History
    const { data: outputsList, isLoading: outputsLoading, isError: outputsError, error: outputsErrorObj } = useQuery({
        queryKey: ["project-outputs", projectId],
        queryFn: ({ signal }) => fetchProjectOutputs(projectId, signal),
        staleTime: 1000 * 60 * 5,
    });
    const lastOutputSummary = outputsList?.[0] ?? null;

    // Show onboarding when: 0 sources, 0 facts, not completed, mounted; hide when project has data. Disable in E2E mode.
    // Show onboarding only in EMPTY phase (phase-aware)
    useEffect(() => {
        if (!mounted) return;
        const e2eMode = typeof process !== "undefined" && (process.env.NEXT_PUBLIC_E2E_MODE === "true" || (process.env as Record<string, string | undefined>).ARTIFACT_E2E_MODE === "true");
        
        if (e2eMode) {
            // Always hide onboarding in E2E mode
            setShowOnboarding(false);
            return;
        }
        
        // Only show in EMPTY phase and if not previously completed
        if (phaseState.phase === "EMPTY" && !getOnboardingCompleted()) {
            setShowOnboarding(true);
        } else {
            setShowOnboarding(false);
        }
    }, [mounted, phaseState.phase]);

    // Server preferences: debounced writes (300ms) for sort_default, group_default, show_only_selected_default
    const prefDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!workspaceId || !projectId) return;
        if (prefDebounceRef.current) clearTimeout(prefDebounceRef.current);
        prefDebounceRef.current = setTimeout(() => {
            putPreference(workspaceId, { project_id: projectId, key: "sort_default", value_json: sortBy }).catch(() => {});
            putPreference(workspaceId, { project_id: projectId, key: "group_default", value_json: groupBySource }).catch(() => {});
            putPreference(workspaceId, { project_id: projectId, key: "show_only_selected_default", value_json: showOnlySelected }).catch(() => {});
            putPreference(workspaceId, { project_id: projectId, key: "collapse_similar_default", value_json: { enabled: collapseSimilar, min_sim: collapseSimilarMinSim } }).catch(() => {});
            prefDebounceRef.current = null;
        }, 300);
        return () => { if (prefDebounceRef.current) clearTimeout(prefDebounceRef.current); };
    }, [workspaceId, projectId, sortBy, groupBySource, showOnlySelected, collapseSimilar, collapseSimilarMinSim]);

    // Server preferences: apply ONLY after URL hydration + only if URL empty
    const prefsQuery = useQuery({
        queryKey: ["preferences", workspaceId, projectId],
        queryFn: () => fetchPreferences(workspaceId, projectId),
        enabled: Boolean(workspaceId && projectId),
    });

    const serverPrefs = prefsQuery.data;

    useEffect(() => {
        if (!mounted || !workspaceId || !projectId) return;
        if (!urlHydratedRef.current) return; // Wait for URL first
        if (!prefsQuery.isSuccess) return;   // Wait for real data (Bug #7 fix)
        if (prefsHydratedRef.current) return; // Only run once
        
        prefsHydratedRef.current = true;
        
        // Check if URL has ANY shareable state params (use .has() not .get())
        const params = new URLSearchParams(sp);
        const urlKeys = ["type", "value", "q", "sort", "review_status", "group", "view", "show_selected"];
        const hasUrlFilters = urlKeys.some(k => params.has(k));
        
        // If URL has params, respect URL and skip prefs
        if (hasUrlFilters) return;
        
        // Otherwise, apply server prefs as defaults
        const serverPrefsSafe = serverPrefs ?? {};
        const defaultViewId = serverPrefsSafe.default_view_id as string | undefined;
        const sortDefault = serverPrefsSafe.sort_default as string | undefined;
        const groupDefault = serverPrefsSafe.group_default as boolean | undefined;
        const showOnlySelectedDefault = serverPrefsSafe.show_only_selected_default as boolean | undefined;
        
        if (defaultViewId) {
            const views = getSavedViews(projectId);
            const view = views.find((v) => v.id === defaultViewId);
            if (view) {
                setScopeType(view.state.scopeType);
                setScopeValue(view.state.scopeValue);
                setViewMode(view.state.viewMode);
                setReviewStatusFilter(view.state.reviewStatusFilter);
                setSortBy((view.state.sortBy as "confidence" | "key-first" | "newest" | "needs_review") ?? "needs_review");
                setGroupBySource(view.state.groupBySource ?? false);
                setSearchQuery(view.state.searchQuery ?? "");
                if (view.state.showOnlySelected != null) setShowOnlySelected(view.state.showOnlySelected);
            }
        } else {
            // Apply individual prefs if no default view
            if (sortDefault && ["confidence", "key-first", "newest", "needs_review"].includes(sortDefault))
                setSortBy(sortDefault as "confidence" | "key-first" | "newest" | "needs_review");
            if (groupDefault != null) setGroupBySource(groupDefault);
            if (showOnlySelectedDefault != null) setShowOnlySelected(showOnlySelectedDefault);
        }
        
        const collapseSimilarPref = serverPrefsSafe.collapse_similar_default as { enabled?: boolean; min_sim?: number } | undefined;
        if (collapseSimilarPref && typeof collapseSimilarPref.enabled === "boolean") setCollapseSimilar(collapseSimilarPref.enabled);
        if (collapseSimilarPref && typeof collapseSimilarPref.min_sim === "number") setCollapseSimilarMinSim(collapseSimilarPref.min_sim);
        
        // Migrate localStorage default view to server (if exists)
        const localDefault = getDefaultViewId(projectId);
        if (localDefault && !serverPrefsSafe.default_view_id) {
            putPreference(workspaceId, { project_id: projectId, key: "default_view_id", value_json: localDefault }).catch(() => {});
        }
    }, [mounted, workspaceId, projectId, prefsQuery.isSuccess, serverPrefs, sp]);

    // Command palette: Cmd+K / Ctrl+K; Escape closes it or exits selection mode
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setShowCommandPalette(false);
                setCommandPaletteQuery("");
                const active = document.activeElement;
                const inInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable);
                if (selectionModeActiveRef.current && !inInput) setSelectionModeActive(false);
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setShowCommandPalette((v) => !v);
                setCommandPaletteQuery("");
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    // Mutations
    const ingestMutation = useMutation({
        mutationFn: () => ingestUrl(projectId, workspaceId, urlInput),
        onMutate: () => setAddUrlError(null),
        onSuccess: (data: { job_id?: string; id?: string; is_duplicate?: boolean; result_summary?: { is_duplicate?: boolean }; params?: { canonical_url?: string } }) => {
            const jobId = data.job_id || data.id;
            const urlUsed = urlInput;
            setUrlInput("");
            setAddSourceSheetOpen(false);
            queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
            
            // Graceful deduplication: toast + pulse on existing source row
            if (data.is_duplicate || data.result_summary?.is_duplicate) {
                const canonical = data.params?.canonical_url || urlUsed;
                setHighlightCanonicalUrl(canonical);
                setTimeout(() => setHighlightCanonicalUrl(null), 2000);
                toast.info("Source already exists.", {
                    id: `duplicate-${jobId || urlInput}`
                });
            } else {
                // Use Sonner's ID to prevent duplicates + track in ref
                const toastKey = `ingest-${jobId || urlInput}`;
                if (!toastShownRef.current.has(toastKey)) {
                    toastShownRef.current.add(toastKey);
                    toast.success("Source added! Processing will begin shortly.", {
                        id: toastKey
                    });
                }
            }
        },
        onError: (error: Error) => {
            const errorMsg = error.message || "Failed to add source. Please check the URL and try again.";
            setAddUrlError(errorMsg);
            console.error("Ingestion error:", error);
        }
    });

    const uploadMutation = useMutation({
        mutationFn: () => {
            if (!selectedFile) throw new Error("No file selected");
            return uploadFile(projectId, workspaceId, selectedFile);
        },
        onSuccess: (data: { job_id?: string; id?: string }) => {
            const jobId = data.job_id || data.id;
            const filename = selectedFile?.name;
            setSelectedFile(null);
            setAddSourceSheetOpen(false);
            queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
            
            // Deduplicate with toast ID + ref tracking
            const toastKey = `upload-${jobId || filename}`;
            if (!toastShownRef.current.has(toastKey)) {
                toastShownRef.current.add(toastKey);
                toast.success("File uploaded! Processing will begin shortly.", {
                    id: toastKey
                });
            }
        },
        onError: (error: Error) => {
            const errorMsg = error.message || "Failed to upload file. Please try again.";
            toast.error(errorMsg);
            console.error("Upload error:", error);
        }
    });

    const dedupMutation = useMutation({
        mutationFn: () => dedupFacts(projectId),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            toast.success(`Suppressed ${data.suppressed_count} duplicates`);
        },
        onError: (e: Error) => toast.error(e.message || "Dedup failed"),
    });

    const demoSeedMutation = useMutation({
        mutationFn: () => seedDemoProject(projectId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
            setViewMode("all");
            setSearchQuery("");
            toast.success("Demo loaded");
        },
        onError: (e: Error) => toast.error(e.message || "Demo seed failed"),
    });

    const demoSourcesMutation = useMutation({
        mutationFn: ({ sources }: { sources: ("reddit" | "youtube")[] }) => seedDemoSources(projectId, sources, true),
        onSuccess: (_, { sources }) => {
            queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
            setViewMode("all");
            setSearchQuery("");
            toast.success(sources.includes("reddit") && sources.includes("youtube") ? "Reddit & YouTube demo loaded" : sources.includes("reddit") ? "Reddit demo loaded" : "YouTube demo loaded");
        },
        onError: (e: Error) => toast.error(e.message || "Demo sources failed"),
    });

    const handleBatchUpdate = async (updates: Partial<Fact>) => {
        const count = selectedFacts.size;
        const actionLabel = updates.is_key_claim ? "key claims" : updates.review_status === "APPROVED" ? "approved" : "updated";
        const loadingToast = toast.loading(`Updating ${count} facts...`);
        setIsBatchUpdating(true);
        try {
            queryClient.setQueryData(["project-facts", projectId], (oldData: Fact[] | undefined) => {
                if (!oldData) return oldData;
                return oldData.map(fact =>
                    selectedFacts.has(fact.id) ? { ...fact, ...updates } : fact
                );
            });
            await batchUpdateFacts(Array.from(selectedFacts), updates);
            await queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            setSelectedFacts(new Set());
            toast.success(`Updated ${count} facts`, { id: loadingToast, description: actionLabel });
        } catch (e) {
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            toast.error("Batch update failed", { id: loadingToast });
        } finally {
            setIsBatchUpdating(false);
        }
    };

    const executeSynthesis = async (
        finalRichFacts: SynthesizeFactInput[],
        mode: "paragraph" | "research_brief" | "script_outline" | "split",
        opts?: { bucketLabel?: string }
    ) => {
        setLastSynthesisError(null);
        setLastSynthesisPayload({ richFacts: finalRichFacts, mode });
        setIsSynthesizing(true);
        setShowSelectionDrawer(false);
        setShowSelectedFactsDrawer(false);
        setOutputOpenedFromHistory(false);

        const modeLabels: Record<string, string> = {
            paragraph: "Paragraph",
            research_brief: "Research Brief",
            script_outline: "Script Outline",
            split: "Separate Sections"
        };
        const modeLabel = modeLabels[mode] || "Synthesis";
        
        const progressToast = toast.loading(`Generating ${modeLabel} from ${finalRichFacts.length} facts...`, {
            description: "Clustering facts and drafting content"
        });

        try {
            const forceError = searchParams.get("playwright_force_synthesis_error") === "1";
            const result = await synthesizeFacts(projectId, finalRichFacts, mode, { forceError });
            
            // Debug logging (dev only)
            if (process.env.NODE_ENV === 'development') {
                console.log("SYNTHESIS_VALIDATED_RESPONSE", result);
            }
            
            // Always hydrate output from API (shared helper respects API_URL)
            const full = await fetchOutput(result.output_id);
            outputCacheRef.current.set(full.id, full);
            setCurrentOutput(full);
            setSynthesisBucketLabel(opts?.bucketLabel ?? null);
            setShowOutputDrawer(true);
            setLastSynthesisPayload(null);
            
            // Invalidate outputs query to show in "Last Output"
            queryClient.invalidateQueries({ queryKey: ["project-outputs", projectId] });
            
            toast.success("Synthesis complete — opened output", { 
                id: progressToast,
                description: `${modeLabel} ready to review`
            });
        } catch (e) {
            console.error("Synthesis error:", e);
            const errorMsg = e instanceof Error ? e.message : "Generation failed. Please try again.";
            setLastSynthesisError(errorMsg);
            setShowOutputDrawer(false);
            setShowSelectionDrawer(false);
            toast.dismiss(progressToast);
        } finally {
            setIsSynthesizing(false);
        }
    };

    const handleRegenerate = async (output: Output) => {
        const ids = output.fact_ids || [];
        const projectFacts = facts || [];
        const matched = projectFacts.filter((f) => ids.includes(f.id));
        const missing = ids.length - matched.length;
        if (matched.length < 2) {
            toast.error("Not enough facts to regenerate", {
                description: missing > 0 ? "Some facts from this output are no longer in the project." : "Need at least 2 facts.",
            });
            return;
        }
        if (missing > 0) {
            toast.info(`Regenerating with ${matched.length} facts`, { description: `${missing} fact(s) no longer in project.` });
        }
        setIsRegenerating(true);
        try {
            const richFacts = matched.map((f) => {
                const job = jobs?.find((j) => j.params.url === f.source_url);
                return {
                    id: f.id,
                    text: f.fact_text,
                    title: job?.result_summary?.source_title || f.source_domain,
                    url: f.source_url,
                    section: f.section_context,
                    review_status: f.review_status,
                    is_pinned: f.is_pinned ?? false,
                };
            });
            const mode = (output.mode === "split" || output.mode === "split_sections" ? "split" : output.mode) as "paragraph" | "research_brief" | "script_outline" | "split";
            await executeSynthesis(richFacts, mode);
        } catch (e) {
            toast.error("Regeneration failed");
        } finally {
            setIsRegenerating(false);
        }
    };

    const factMap = useMemo(() => new Map((facts ?? []).map((f) => [f.id, f])), [facts]);
    const bucketsFactMap = useMemo(
        () => new Map((facts ?? []).map((f) => [f.id, { id: f.id, text: f.fact_text, source_domain: f.source_domain }])),
        [facts]
    );

    const addFactToBucket = useCallback((bucketId: string, factId: string) => {
        setBuckets((prev) =>
            prev.map((b) =>
                b.id === bucketId ? { ...b, factIds: b.factIds.includes(factId) ? b.factIds : [...b.factIds, factId] } : b
            )
        );
    }, []);
    const handleGenerateFromBucket = useCallback(
        (bucket: Bucket) => {
            const projectFacts = facts ?? [];
            const richFacts = bucket.factIds
                .map((id) => factMap.get(id))
                .filter(Boolean)
                .map((f) => {
                    const job = jobs?.find((j) => j.params.url === f!.source_url);
                    return {
                        id: f!.id,
                        text: f!.fact_text,
                        title: job?.result_summary?.source_title || f!.source_domain,
                        url: f!.source_url,
                        section: f!.section_context,
                        review_status: f!.review_status,
                        is_pinned: f!.is_pinned ?? false,
                    };
                });
            if (richFacts.length < 2) return;
            executeSynthesis(richFacts, synthesisMode, { bucketLabel: bucket.name });
        },
        [facts, jobs, factMap, synthesisMode]
    );

    const handleReviewIssuesFromOutput = useCallback(async () => {
        const output = currentOutput;
        if (!output?.fact_ids?.length) return;
        const ids = output.fact_ids;
        const issueFacts = (facts ?? []).filter((f) => ids.includes(f.id) && f.review_status !== "APPROVED");
        const issueIds = issueFacts.map((f) => f.id);
        if (issueIds.length > 0) {
            setOutputReviewQueueIds(issueIds);
            setReviewQueueMode(true);
            const firstFact = factMap.get(issueIds[0]) ?? issueFacts[0];
            if (firstFact) setViewingFact(firstFact);
            return;
        }
        try {
            const mapRes = await fetchOutputEvidenceMap(output.id);
            const nonApproved = mapRes.facts.filter((em) => em.review_status !== "APPROVED");
            const issueIdsFromMap = nonApproved.map((em) => em.id);
            if (issueIdsFromMap.length === 0) return;
            setOutputReviewQueueIds(issueIdsFromMap);
            setReviewQueueMode(true);
            const firstFromMap = factMap.get(issueIdsFromMap[0]);
            const firstEm = nonApproved[0];
            setViewingFact(firstFromMap ?? evidenceMapFactToFact(firstEm));
        } catch {
            toast.error("Could not load evidence map for review");
        }
    }, [currentOutput, facts, factMap]);

    const handleRegenerateApprovedOnly = useCallback(async () => {
        const output = currentOutput;
        if (!output?.fact_ids?.length) return;
        const ids = output.fact_ids;
        let approved: Fact[] = (facts ?? []).filter((f) => ids.includes(f.id) && f.review_status === "APPROVED");
        if (approved.length < 2) {
            try {
                const mapRes = await fetchOutputEvidenceMap(output.id);
                const approvedFromMap = mapRes.facts.filter((em) => em.review_status === "APPROVED");
                approved = approvedFromMap.map((em) => evidenceMapFactToFact(em));
            } catch {
                // keep approved from facts
            }
        }
        if (approved.length < 2) {
            toast.error("Need at least 2 approved facts to regenerate");
            return;
        }
        setIsRegenerating(true);
        try {
            const richFacts = approved.map((f) => {
                const job = jobs?.find((j) => j.params.url === f.source_url);
                return {
                    id: f.id,
                    text: f.fact_text,
                    title: job?.result_summary?.source_title || f.source_domain,
                    url: f.source_url,
                    section: f.section_context,
                    review_status: f.review_status,
                    is_pinned: f.is_pinned ?? false,
                };
            });
            const mode = (output.mode === "split" || output.mode === "split_sections" ? "split" : output.mode) as "paragraph" | "research_brief" | "script_outline" | "split";
            await executeSynthesis(richFacts, mode);
        } catch {
            toast.error("Regeneration failed");
        } finally {
            setIsRegenerating(false);
        }
    }, [currentOutput, facts, jobs, executeSynthesis]);

    const handleOpenRepickFromOutput = useCallback(() => {
        if (!currentOutput?.fact_ids?.length) return;
        setSelectedFacts(new Set(currentOutput.fact_ids));
        setSelectedFactsDrawerFromOutput(false);
        setShowSelectedFactsDrawer(true);
    }, [currentOutput?.fact_ids]);

    const groupedSelection = useMemo(() => {
        if (!collapseSimilar || selectedFacts.size < 2) return [];
        const selected = (facts || []).filter((f) => selectedFacts.has(f.id) && f.group_id && (f.collapsed_count ?? 0) > 1);
        return selected.map((f) => ({
            groupId: f.group_id!,
            repFact: f,
            collapsedCount: f.collapsed_count ?? 1,
            includeAll: false,
        }));
    }, [collapseSimilar, selectedFacts, facts]);

    const handleGenerateClick = async () => {
        if (selectedFacts.size < 2) return;

        if (collapseSimilar && groupedSelection.length > 0) {
            setClusterPreviewGroups(groupedSelection);
            setShowClusterPreview(true);
            return;
        }

        await proceedWithSynthesis(
            (facts || []).filter((f) => selectedFacts.has(f.id)),
            groupFactsCacheRef
        );
    };

    const handleClusterPreviewConfirm = async () => {
        const finalIds = new Set<string>();
        for (const g of clusterPreviewGroups) {
            const grp = factsGroups[g.groupId];
            if (grp) {
                if (g.includeAll) grp.collapsed_ids.forEach((id) => finalIds.add(id));
                else finalIds.add(g.repFact.id);
            } else {
                finalIds.add(g.repFact.id);
            }
        }
        const singletonIds = Array.from(selectedFacts).filter((id) => !clusterPreviewGroups.some((g) => factsGroups[g.groupId]?.collapsed_ids?.includes(id)));
        singletonIds.forEach((id) => finalIds.add(id));

        const factList = (facts || []) as Fact[];
        const resolved: Fact[] = factList.filter((f) => finalIds.has(f.id));
        const missing = Array.from(finalIds).filter((id) => !resolved.some((f) => f.id === id));
        for (const id of missing) {
            for (const [gid, grp] of Object.entries(factsGroups)) {
                if (grp.collapsed_ids?.includes(id)) {
                    let groupFacts = groupFactsCacheRef.current.get(gid);
                    if (!groupFacts) {
                        try {
                            groupFacts = await fetchFactsGroup(projectId, gid);
                            groupFactsCacheRef.current.set(gid, groupFacts);
                        } catch (_) {
                            break;
                        }
                    }
                    const f = groupFacts.find((x) => x.id === id);
                    if (f) resolved.push(f);
                    break;
                }
            }
        }

        setShowClusterPreview(false);
        setClusterPreviewGroups([]);
        setSelectedFacts(finalIds);
        await proceedWithSynthesis(resolved, groupFactsCacheRef);
    };

    const proceedWithSynthesis = async (factList: Fact[], _cacheRef: React.MutableRefObject<Map<string, Fact[]>>) => {
        const richFacts = factList.map((f) => {
            const job = jobs?.find((j) => j.params.url === f.source_url);
            return {
                id: f.id,
                text: f.fact_text,
                title: job?.result_summary?.source_title || f.source_domain,
                url: f.source_url,
                section: f.section_context,
                review_status: f.review_status,
                is_pinned: f.is_pinned ?? false,
            };
        });

        const selectedObjects = (facts || []).filter((f) => richFacts.some((r) => r.id === f.id));
        const uniqueSources = new Set(selectedObjects.map((f) => f.source_domain));
        const isMixed = uniqueSources.size > 1;

        if (isMixed) {
            toast.info("Mixed topics detected. Opening builder...");
            setShowSelectionDrawer(true);
            return;
        }

        const hasNonApproved = richFacts.some((f) => (f as { review_status?: string }).review_status !== "APPROVED");
        if (hasNonApproved) {
            setSelectedFactsDrawerFromOutput(false);
            pendingSynthesisRef.current = { richFacts, mode: synthesisMode };
            setSelectedFacts(new Set(richFacts.map((r) => r.id)));
            setShowSelectedFactsDrawer(true);
            return;
        }

        pendingSynthesisRef.current = null;
        executeSynthesis(richFacts, synthesisMode);
    };

    const handleGenerateFromApproved = () => {
        const approved = visibleFacts.filter((f) => f.review_status === "APPROVED");
        if (approved.length < 2) {
            toast.error("Need at least 2 approved facts to generate");
            return;
        }
        const richFacts = approved.map((f) => {
            const job = jobs?.find((j) => j.params.url === f.source_url);
            return {
                id: f.id,
                text: f.fact_text,
                title: job?.result_summary?.source_title || f.source_domain,
                url: f.source_url,
                section: f.section_context,
                review_status: f.review_status,
                is_pinned: f.is_pinned ?? false,
            };
        });
        executeSynthesis(richFacts, synthesisMode);
    };

    const handleGenerateFromPinned = () => {
        const pinned = visibleFacts.filter((f) => f.is_pinned);
        if (pinned.length < 2) {
            toast.error("Need at least 2 pinned facts to generate");
            return;
        }
        const richFacts = pinned.map((f) => {
            const job = jobs?.find((j) => j.params.url === f.source_url);
            return {
                id: f.id,
                text: f.fact_text,
                title: job?.result_summary?.source_title || f.source_domain,
                url: f.source_url,
                section: f.section_context,
                review_status: f.review_status,
                is_pinned: f.is_pinned ?? false,
            };
        });
        executeSynthesis(richFacts, synthesisMode);
    };

    // Auto-ingest URL from query param on mount
    useEffect(() => {
        const ingestParam = searchParams.get("ingest");
        if (ingestParam) {
            setUrlInput(ingestParam);
            
            // Deduplicate: Check if we've already processed this URL
            const toastKey = `auto-ingest-${ingestParam}`;
            if (toastShownRef.current.has(toastKey)) {
                return; // Already processing, skip
            }
            toastShownRef.current.add(toastKey);
            
            ingestUrl(projectId, workspaceId, ingestParam)
                .then((data) => {
                    queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
                    queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
                    
                    if (data.is_duplicate || data.result_summary?.is_duplicate) {
                        const canonical = data.params?.canonical_url || ingestParam;
                        setHighlightCanonicalUrl(canonical);
                        setTimeout(() => setHighlightCanonicalUrl(null), 2000);
                        toast.info("Source already exists.", { id: toastKey });
                    } else {
                        toast.success("Source added! Processing will begin shortly.", { id: toastKey });
                    }
                    
                    // Remove the ingest param from URL
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete("ingest");
                    router.replace(`/project/${projectId}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
                })
                .catch((e) => {
                    const errorMsg = e.message || "Failed to add source. Please check the URL and try again.";
                    toast.error(errorMsg, { id: `${toastKey}-error` });
                    console.error("Ingestion error:", e);
                    // Remove from ref on error so user can retry
                    toastShownRef.current.delete(toastKey);
                });
        }
    }, [searchParams, projectId, workspaceId, jobs, queryClient, router]);

    // State → URL sync (only after hydration, with debounce and comparison)
    const syncUrlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastUrlRef = useRef<string>("");

    useEffect(() => {
        // Don't write URL during hydration
        if (isHydratingRef.current) return;
        
        // Debounce to prevent rapid updates
        if (syncUrlDebounceRef.current) clearTimeout(syncUrlDebounceRef.current);
        
        syncUrlDebounceRef.current = setTimeout(() => {
            const nextParams = buildUrlFromViewState({
                scopeType,
                scopeValue,
                searchQuery,
                sortBy,
                reviewStatusFilter,
                groupBySource,
                viewMode,
                showOnlySelected,
            });
            
            const currentParams = new URLSearchParams(sp);
            
            // Compare params directly (not full URLs - handles param order)
            if (currentParams.toString() !== nextParams.toString()) {
                const qs = nextParams.toString();
                const nextPath = qs ? `/project/${projectId}?${qs}` : `/project/${projectId}`;
                
                // Prevent re-writing same URL repeatedly
                if (nextPath === lastUrlRef.current) return;
                
                lastUrlRef.current = nextPath;
                router.replace(nextPath, { scroll: false });
            }
            
            syncUrlDebounceRef.current = null;
        }, 100); // 100ms debounce
        
        return () => {
            if (syncUrlDebounceRef.current) clearTimeout(syncUrlDebounceRef.current);
        };
    }, [scopeType, scopeValue, searchQuery, sortBy, reviewStatusFilter, groupBySource, viewMode, showOnlySelected, projectId, router, sp]);

    const scopedFacts = useMemo(() => {
        let list = facts ?? [];
        if (scopeType === "DOMAIN" && scopeValue) {
            list = list.filter(f => f.source_domain === scopeValue);
        } else if (scopeType === "URL" && scopeValue) {
            list = list.filter(f => f.source_url === scopeValue);
        }
        return list;
    }, [facts, scopeType, scopeValue]);

    const scopedJobs = useMemo(() => {
        if (scopeType === "DOMAIN" && scopeValue) {
            return (jobs ?? []).filter(j => getDomain(j.params.url) === scopeValue);
        }
        return [];
    }, [jobs, scopeType, scopeValue]);

    const counts = useMemo(() => ({
        all: scopedFacts.length,
        key: scopedFacts.filter(f => f.is_key_claim).length,
        pinned: scopedFacts.filter(f => f.is_pinned).length,
        approved: scopedFacts.filter(f => f.review_status === "APPROVED").length,
        needsReview: scopedFacts.filter(f => f.review_status === "NEEDS_REVIEW").length,
        reviewQueue: scopedFacts.filter(f => f.review_status === "NEEDS_REVIEW" || f.review_status === "FLAGGED").length,
    }), [scopedFacts]);

    const [reviewQueueMode, setReviewQueueMode] = useState(false);
    const [outputReviewQueueIds, setOutputReviewQueueIds] = useState<string[] | null>(null);

    const visibleFacts = useMemo(() => {
        let list = scopedFacts;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(f =>
                f.fact_text.toLowerCase().includes(q) ||
                f.tags?.some(t => t.toLowerCase().includes(q))
            );
        }
        if (showOnlySelected && selectedFacts.size > 0) {
            list = list.filter((f) => selectedFacts.has(f.id));
        }
        if (viewMode === "graph" && graphSelectedGroupId && factsGroups[graphSelectedGroupId]) {
            const ids = new Set(factsGroups[graphSelectedGroupId].collapsed_ids);
            list = list.filter((f) => ids.has(f.id));
        }
        return list;
    }, [scopedFacts, searchQuery, showOnlySelected, selectedFacts, viewMode, graphSelectedGroupId, factsGroups]);

    // Capture evidence navigation snapshot when evidence panel opens (P1 fix for prev/next stability)
    // When viewingFact changes from null -> fact, snapshot current visibleFacts IDs
    // This prevents navigation breaking when list changes due to filtering/status updates
    useEffect(() => {
        if (viewingFact && evidenceFactIdsSnapshot.length === 0) {
            // Evidence panel just opened - capture snapshot
            const snapshot = visibleFacts.map(f => f.id);
            setEvidenceFactIdsSnapshot(snapshot);
        } else if (!viewingFact && evidenceFactIdsSnapshot.length > 0) {
            // Evidence panel closed - clear snapshot
            setEvidenceFactIdsSnapshot([]);
        }
    }, [viewingFact, visibleFacts, evidenceFactIdsSnapshot.length]);

    const reviewQueueIds = useMemo(() =>
        visibleFacts.filter(f => f.review_status === "NEEDS_REVIEW" || f.review_status === "FLAGGED").map(f => f.id),
        [visibleFacts]
    );

    const effectiveGroupBySource = groupBySource;

    const visibleFactsGroupedBySource = useMemo(() => {
        if (!effectiveGroupBySource || !visibleFacts.length) return null;
        const bySource = new Map<string, Fact[]>();
        for (const f of visibleFacts) {
            const key = f.source_domain || f.source_url || "Unknown";
            if (!bySource.has(key)) bySource.set(key, []);
            bySource.get(key)!.push(f);
        }
        return Array.from(bySource.entries()).map(([domain, facts]) => ({ domain, facts }));
    }, [effectiveGroupBySource, visibleFacts]);

    const pageSummary = useMemo(() => {
        if (scopeType === "URL" && scopeValue) {
            return jobs?.find(j => j.params.url === scopeValue)?.result_summary;
        }
        return null;
    }, [jobs, scopeType, scopeValue]);

    const selectionAnalysis = useMemo(() => {
        if (selectedFacts.size === 0) return { sources: [], count: 0, isMixed: false };
        const selectedObjects = (facts || []).filter(f => selectedFacts.has(f.id));
        const uniqueSources = new Set(selectedObjects.map(f => f.source_domain));
        return {
            sources: Array.from(uniqueSources),
            count: uniqueSources.size,
            isMixed: uniqueSources.size > 1
        };
    }, [selectedFacts, facts]);

    const handleNav = (type: "DOMAIN" | "URL" | null, value: string | null) => {
        setScopeType(type);
        setScopeValue(value);
        if (type === "URL") setViewMode("all");
    };

    const trimmedUrl = urlInput.trim();
    const isValidUrl = trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://");

    const handleIngestRetry = useCallback((canonicalUrl: string, sourceType?: "WEB" | "REDDIT" | "YOUTUBE") => {
        retrySource(projectId, canonicalUrl, sourceType ?? "WEB")
            .then((data) => {
                queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
                queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
                queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
                toast.success("Retrying ingestion…");
            })
            .catch((e) => {
                toast.error(e.message || "Retry failed");
            });
    }, [projectId, queryClient]);

    const selectedFactsDrawerItems = useMemo(() => {
        if (selectedFactsDrawerFromOutput && currentOutput?.fact_ids?.length) {
            const byId = new Map((facts ?? []).map((f) => [f.id, f]));
            return currentOutput.fact_ids
                .map((id) => byId.get(id))
                .filter(Boolean)
                .map((f) => ({
                    id: f!.id,
                    text: f!.fact_text,
                    title: jobs?.find((j) => j.params.url === f!.source_url)?.result_summary?.source_title ?? f!.source_domain ?? "",
                    source_domain: f!.source_domain,
                    review_status: f!.review_status,
                }));
        }
        return (facts ?? [])
            .filter((f) => selectedFacts.has(f.id))
            .map((f) => {
                const job = jobs?.find((j) => j.params.url === f.source_url);
                return {
                    id: f.id,
                    text: f.fact_text,
                    title: job?.result_summary?.source_title ?? f.source_domain ?? "",
                    source_domain: f.source_domain,
                    review_status: f.review_status,
                };
            });
    }, [selectedFactsDrawerFromOutput, currentOutput?.fact_ids, facts, jobs, selectedFacts]);

    // Expose state for E2E (diagnostics + idle contract)
    useEffect(() => {
        if (typeof window !== 'undefined' && window.__e2e) {
            window.__e2e.state = {
                phase: "reviewing", // TODO: implement phase enum
                jobs: jobs ?? [],
                facts: facts ?? [],
                outputsCount: outputsList?.length ?? 0,
                selectedCount: selectedFacts.size,
                sortBy,
                groupBySource,
                viewMode,
            };
        }
    }, [jobs, facts, outputsList?.length, selectedFacts, sortBy, groupBySource, viewMode]);

    return (
        <div className="h-screen w-full bg-background flex flex-col overflow-hidden relative transition-colors">
            {/* Synthesis error banner (E2E stable selector) */}
            {lastSynthesisError && (
                <div
                    data-testid="synthesis-error-banner"
                    className={`fixed top-4 right-4 ${Z.overlay} max-w-md bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 animate-in slide-in-from-right-5`}
                >
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm">
                        <p className="font-medium">Synthesis Error</p>
                        <p data-testid="synthesis-error-message" className="text-xs mt-1 opacity-90">{lastSynthesisError}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {lastSynthesisPayload && (
                            <Button
                                data-testid="synthesis-error-retry"
                                variant="outline"
                                size="sm"
                                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                                disabled={isSynthesizing}
                                onClick={() => executeSynthesis(lastSynthesisPayload.richFacts, lastSynthesisPayload.mode)}
                            >
                                {isSynthesizing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Retry"}
                            </Button>
                        )}
                        <button
                            data-testid="synthesis-error-dismiss"
                            onClick={() => { setLastSynthesisError(null); setLastSynthesisPayload(null); }}
                            className="text-destructive/70 hover:text-destructive transition-colors p-1"
                            aria-label="Dismiss error"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
            {workspaceAccessError && (
                <div data-testid="workspace-access-error" className="px-6 py-2 bg-destructive/10 border-b border-destructive/30 text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    You don&apos;t have access to this workspace. Switch workspace or open a different project link.
                </div>
            )}
            <header className={`bg-surface/80 backdrop-blur-sm border-b border-border shrink-0 relative ${Z.header} shadow-xs`}>
                {/* Row 1: Project identity + global actions (utility weight) */}
                <div className="min-h-14 py-2 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {!isLg && (
                            <Button
                                data-testid="sources-drawer-open"
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                                onClick={() => setSourcesDrawerOpen(true)}
                                aria-label="Open sources"
                            >
                                <Menu className="w-4 h-4" />
                            </Button>
                        )}
                        <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm shrink-0">
                            <Layout className="w-5 h-5" />
                        </div>
                        {process.env.NEXT_PUBLIC_E2E_MODE === "true" && (
                            <Badge data-testid="e2e-mode-badge" variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-warning/10 text-warning border-warning/30">
                                E2E
                            </Badge>
                        )}
                    <div className="min-w-0">
                        {isEditingTitle ? (
                            <div className="space-y-1">
                                <Input
                                    data-testid="project-title-input"
                                    value={editTitleValue}
                                    onChange={(e) => setEditTitleValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveTitle();
                                        else if (e.key === "Escape") handleCancelTitle();
                                    }}
                                    onBlur={(e) => {
                                        const target = e.relatedTarget as HTMLElement | null;
                                        if (target?.closest("[data-testid='project-title-save']") || target?.closest("[data-testid='project-title-cancel']")) return;
                                        const trimmed = editTitleValue.trim();
                                        if (trimmed !== projectTitle && trimmed.length >= 3) handleSaveTitle();
                                        else if (trimmed !== projectTitle) setTitleError(trimmed ? "Title must be at least 3 characters" : "Title cannot be empty");
                                        else handleCancelTitle();
                                    }}
                                    disabled={renameMutation.isPending}
                                    className="h-9 text-base font-semibold"
                                    autoFocus
                                />
                                <div className="flex items-center gap-2">
                                    <Button data-testid="project-title-save" size="sm" variant="default" className="h-7 text-xs" onClick={handleSaveTitle} disabled={renameMutation.isPending || !editTitleValue.trim()}>
                                        {renameMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                                    </Button>
                                    <Button data-testid="project-title-cancel" size="sm" variant="ghost" className="h-7 text-xs" onMouseDown={(e) => { e.preventDefault(); handleCancelTitle(); }} disabled={renameMutation.isPending}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <h1
                                data-testid="project-title"
                                role="button"
                                tabIndex={0}
                                aria-label="Project title, click to rename"
                                className="text-base md:text-lg font-semibold text-foreground tracking-tight cursor-pointer hover:text-primary transition-colors truncate"
                                onClick={handleStartEditTitle}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        handleStartEditTitle();
                                    }
                                }}
                            >
                                {projectTitle}
                            </h1>
                        )}
                        {titleError && (
                            <div data-testid="project-title-error" className="text-xs text-destructive mt-0.5">
                                {titleError}
                            </div>
                        )}
                        {!isEditingTitle && (
                            <span className="text-xs text-muted-foreground hidden sm:inline block">
                                Click to rename • {jobs?.length || 0} Sources • {facts?.length || 0} Facts
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1 justify-end">
                    <WorkspaceSelector
                        workspaces={workspaces}
                        currentWorkspaceId={currentWorkspaceId}
                        onSelect={setCurrentWorkspaceId}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-2 text-muted-foreground hover:text-foreground hover:text-primary/90 hover:bg-muted/70 rounded-lg transition-colors"
                        onClick={() => {
                            const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
                            const params = new URLSearchParams(searchParams.toString());
                            params.set("ws", workspaceId);
                            const url = `${base}?${params.toString()}`;
                            navigator.clipboard.writeText(url).then(() => toast.success("Project link copied"), () => toast.error("Failed to copy"));
                        }}
                        data-testid="project-share-link"
                    >
                        <Share2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Share</span>
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground hover:text-primary/90 hover:bg-muted/70 rounded-lg transition-colors"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        {mounted ? (
                            theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />
                        ) : (
                            <div className="w-4 h-4" />
                        )}
                    </Button>

                    {/* Last Output */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    data-testid="last-output-button"
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-9 gap-2 text-muted-foreground hover:text-foreground hover:text-primary/90 hover:bg-muted/70 rounded-lg transition-colors"
                                    disabled={!lastOutputSummary}
                                    onClick={async () => {
                                        if (!lastOutputSummary) return;
                                        setOutputOpenedFromHistory(false);
                                        setSynthesisBucketLabel(null);
                                        const cached = outputCacheRef.current.get(lastOutputSummary.id);
                                        if (cached) {
                                            setCurrentOutput(cached);
                                        } else {
                                            const full = await fetchOutput(lastOutputSummary.id);
                                            outputCacheRef.current.set(lastOutputSummary.id, full);
                                            setCurrentOutput(full);
                                        }
                                        setShowOutputDrawer(true);
                                    }}
                                >
                                    <FileText className="w-4 h-4" />
                                    <span className="hidden sm:inline">Last Output</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {lastOutputSummary ? `${lastOutputSummary.title} (${lastOutputSummary.created_at ? new Date(lastOutputSummary.created_at).toLocaleDateString() : ""})` : "No outputs yet"}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {/* History */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    data-testid="outputs-history-button"
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-9 gap-2 text-muted-foreground hover:text-foreground hover:text-primary/90 hover:bg-muted/70 rounded-lg transition-colors"
                                    onClick={() => {
                                        const stack = panelStackRef.current;
                                        if (stack.length === 0 || stack[stack.length - 1] !== "history") pushPanel("history");
                                        if (showOutputDrawer && !pinnedPanels.output) setShowOutputDrawer(false);
                                        setShowHistoryDrawer(true);
                                    }}
                                >
                                    <History className="w-4 h-4" />
                                    <span className="hidden sm:inline">History</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>View past synthesis outputs</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <Button
                        data-testid="source-health-button"
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-2 text-muted-foreground hover:text-foreground hover:text-primary/90 hover:bg-muted/70 rounded-lg transition-colors"
                        onClick={() => setShowSourceHealth(true)}
                    >
                        <Activity className="w-4 h-4" />
                        <span className="hidden sm:inline">Source Health</span>
                    </Button>
                    <Button
                        data-testid="export-button"
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-2 text-muted-foreground hover:text-foreground hover:text-primary/90 hover:bg-muted/70 rounded-lg transition-colors"
                        onClick={() => setShowExportPanel(true)}
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Export</span>
                    </Button>
                </div>
                </div>

                {/* Row 2: Primary action zone — Add Source (Add = only primary CTA) */}
                <div className="border-t border-border/50 px-4 sm:px-6 py-2.5 flex items-center min-w-0">
                    {isSm ? (
                        <div className="w-full max-w-3xl flex flex-wrap items-center gap-3 bg-muted/30 border border-border/80 rounded-xl px-3 py-2 shadow-sm min-w-0">
                            <div className="flex gap-1 bg-background/60 rounded-lg p-0.5 shrink-0 border border-border/60">
                                <button data-testid="source-tab-url" onClick={() => setInputType("url")} className={cn("px-2.5 py-1.5 text-xs font-medium rounded-md transition-all", inputType === "url" ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>URL</button>
                                <button onClick={() => setInputType("file")} className={cn("px-2.5 py-1.5 text-xs font-medium rounded-md transition-all", inputType === "file" ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>Upload</button>
                            </div>
                            {inputType === "url" ? (
                                <>
                                    <div className="relative flex flex-col gap-1 min-w-0 flex-1 basis-32 sm:basis-48">
                                        <Input ref={urlInputRef} data-testid="source-url-input" placeholder="Paste a source URL..." value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setAddUrlError(null); }} className="min-w-0 w-full max-w-[20rem] h-9 text-sm bg-background/50 border-border/80 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30" />
                                        {(addUrlError || (trimmedUrl && !isValidUrl)) && (
                                            <div data-testid="source-add-error" className="text-xs text-destructive" title={addUrlError || "Invalid URL"}>
                                                {addUrlError || "Invalid URL. Must start with http:// or https://"}
                                            </div>
                                        )}
                                    </div>
                                    <Button data-testid="source-add-button" data-variant="primary" size="sm" className="h-9 px-5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-ring/30" onClick={() => ingestMutation.mutate()} disabled={ingestMutation.isPending || !isValidUrl}>
                                        {ingestMutation.isPending ? <span data-testid="source-add-loading"><Loader2 className="w-4 h-4 animate-spin" /></span> : <><Plus className="w-4 h-4 mr-1.5" /> Add</>}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Input type="file" accept=".pdf,.txt,.md" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="min-w-0 max-w-[20rem] h-9 text-sm bg-background/50 border-0 text-foreground file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80" />
                                    <Button data-variant="primary" size="sm" className="h-9 px-5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-ring/30" onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !selectedFile}>
                                        {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UploadCloud className="w-4 h-4 mr-1.5" /> Upload</>}
                                    </Button>
                                </>
                            )}
                        </div>
                    ) : (
                        <Button
                            data-testid="add-source-open"
                            size="sm"
                            className="h-9 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
                            onClick={() => setAddSourceSheetOpen(true)}
                        >
                            <Plus className="w-4 h-4 mr-1.5" />
                            Add source
                        </Button>
                    )}
                </div>
            </header>

            <AddSourceSheet
                open={addSourceSheetOpen}
                onOpenChange={setAddSourceSheetOpen}
                inputType={inputType}
                setInputType={setInputType}
                urlInput={urlInput}
                setUrlInput={setUrlInput}
                setAddUrlError={setAddUrlError}
                selectedFile={selectedFile}
                setSelectedFile={setSelectedFile}
                addUrlError={addUrlError}
                isValidUrl={isValidUrl}
                onAddUrl={() => ingestMutation.mutate()}
                onUpload={() => uploadMutation.mutate()}
                isAddPending={ingestMutation.isPending}
                isUploadPending={uploadMutation.isPending}
            />

            <SourcesDrawer
                open={sourcesDrawerOpen}
                onOpenChange={setSourcesDrawerOpen}
                projectId={projectId}
                activeFilter={{ type: scopeType, value: scopeValue }}
                onSelect={(type, value) => { setScopeType(type); setScopeValue(value); }}
                highlightCanonicalUrl={highlightCanonicalUrl}
            />

            <FactsControlsSheet
                open={factsControlsOpen}
                onOpenChange={setFactsControlsOpen}
                sortBy={sortBy}
                setSortBy={setSortBy}
                groupBySource={groupBySource}
                setGroupBySource={setGroupBySource}
                collapseSimilar={collapseSimilar}
                setCollapseSimilar={setCollapseSimilar}
                showOnlySelected={showOnlySelected}
                setShowOnlySelected={setShowOnlySelected}
                showSuppressed={showSuppressed}
                setShowSuppressed={setShowSuppressed}
                viewsOpen={viewsOpen}
                setViewsOpen={setViewsOpen}
                scopeType={scopeType}
                scopeValue={scopeValue}
                viewMode={viewMode}
                reviewStatusFilter={reviewStatusFilter}
                searchQuery={searchQuery}
                onApplyViewState={(state) => {
                    setScopeType(state.scopeType);
                    setScopeValue(state.scopeValue);
                    setViewMode(state.viewMode);
                    setReviewStatusFilter(state.reviewStatusFilter);
                    setSortBy(state.sortBy);
                    setGroupBySource(state.groupBySource);
                    setSearchQuery(state.searchQuery ?? "");
                    if (state.showOnlySelected != null) setShowOnlySelected(state.showOnlySelected);
                }}
                projectId={projectId}
                workspaceId={workspaceId}
                putPreference={putPreference}
                dedupMutation={dedupMutation}
                factsCount={(facts ?? []).length}
            />

            <Group orientation="horizontal" className="flex-1 min-h-0 min-w-0">
                {/* Left: Sources (>= lg only) */}
                {isLg && (
                    <>
                        <Panel id="sidebar" defaultSize={20} minSize={15} maxSize={30} className="border-r border-border bg-surface/50 backdrop-blur-sm flex flex-col">
                            <div className="p-4 overflow-y-auto h-full">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Active Sources</h3>
                                <SourceTracker
                                    projectId={projectId}
                                    activeFilter={{ type: scopeType, value: scopeValue }}
                                    onSelect={handleNav}
                                    highlightCanonicalUrl={highlightCanonicalUrl}
                                />
                            </div>
                        </Panel>
                        <Separator className="w-1 bg-border hover:bg-primary transition-colors" />
                    </>
                )}

                {/* Main Canvas */}
                <Panel id="canvas" minSize={30} defaultSize={isLg ? undefined : 100} className="bg-background relative min-w-0">
                    <div className="h-full w-full min-w-0 overflow-y-auto overflow-x-hidden">
                        <div className={cn("mx-auto max-w-4xl min-w-0 flex flex-col", getDensityClasses(isLg).contentPadding, getDensityClasses(isLg).contentGap)}>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <button onClick={() => handleNav(null, null)} className={cn("flex items-center gap-1 hover:text-primary transition-colors", !scopeType ? "font-semibold text-foreground" : "")}>
                                    <Home className="w-4 h-4" /> Overview
                                </button>
                                {(scopeType === "DOMAIN" || scopeType === "URL") && scopeValue && (
                                    <>
                                        <ChevronRight className="w-4 h-4 text-border-subtle" />
                                        <button onClick={() => handleNav("DOMAIN", scopeType === "URL" ? getDomain(scopeValue) : scopeValue)} className={cn("hover:text-primary transition-colors max-w-[150px] truncate", scopeType === "DOMAIN" ? "font-semibold text-foreground" : "")}>
                                            {scopeType === "DOMAIN" ? scopeValue : getDomain(scopeValue)}
                                        </button>
                                    </>
                                )}
                                {scopeType === "URL" && scopeValue && (
                                    <>
                                        <ChevronRight className="w-4 h-4 text-border-subtle" />
                                        <span className="font-semibold text-foreground truncate max-w-[200px]" title={scopeValue}>
                                            {jobs?.find(j => j.params.url === scopeValue)?.result_summary?.source_title || scopeValue}
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Processing Timeline - when any job pending/running/failed */}
                            {(jobs ?? []).some((j) => ["PENDING", "RUNNING", "FAILED"].includes(j.status)) && (
                                <ProcessingTimeline jobs={jobs ?? []} onRetry={handleIngestRetry} />
                            )}

                            {/* Empty state: Quick Start first, then Overview compact */}
                            {!scopeType && !scopeValue && (jobs ?? []).length === 0 && (facts ?? []).length === 0 && (
                                <>
                                    <div className="flex flex-col items-center gap-4">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick start</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
                                            <button
                                                type="button"
                                                data-testid="quickstart-paste-url"
                                                className="text-left p-4 rounded-xl border border-border bg-surface hover:border-primary/30 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring/30"
                                                onClick={() => urlInputRef.current?.focus()}
                                            >
                                                <span className="font-medium text-foreground block">Paste a URL</span>
                                                <span className="text-xs text-muted-foreground mt-1">Add a source URL to extract facts</span>
                                            </button>
                                            {process.env.NEXT_PUBLIC_ENABLE_TEST_SEED === "true" && (
                                                <>
                                                    <button
                                                        type="button"
                                                        data-testid="quickstart-demo-seed"
                                                        className="text-left p-4 rounded-xl border border-border bg-surface hover:border-border hover:shadow-sm transition-all text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                                                        onClick={() => demoSeedMutation.mutate()}
                                                        disabled={demoSeedMutation.isPending}
                                                    >
                                                        <span className="font-medium block">Try demo seed</span>
                                                        <span className="text-xs mt-1 opacity-90">Load sample facts for this project</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        data-testid="quickstart-demo-reddit"
                                                        className="text-left p-4 rounded-xl border border-border bg-surface hover:border-border hover:shadow-sm transition-all text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                                                        onClick={() => demoSourcesMutation.mutate({ sources: ["reddit"] })}
                                                        disabled={demoSourcesMutation.isPending}
                                                    >
                                                        <span className="font-medium block">Try Reddit demo</span>
                                                        <span className="text-xs mt-1 opacity-90">Load a Reddit thread with OP + comments</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        data-testid="quickstart-demo-youtube"
                                                        className="text-left p-4 rounded-xl border border-border bg-surface hover:border-border hover:shadow-sm transition-all text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                                                        onClick={() => demoSourcesMutation.mutate({ sources: ["youtube"] })}
                                                        disabled={demoSourcesMutation.isPending}
                                                    >
                                                        <span className="font-medium block">Try YouTube demo</span>
                                                        <span className="text-xs mt-1 opacity-90">Load a video transcript</span>
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                type="button"
                                                data-testid="quickstart-upload-pdf"
                                                className="text-left p-4 rounded-xl border border-border bg-surface hover:border-border hover:shadow-sm transition-all text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                                                onClick={() => setInputType("file")}
                                            >
                                                <span className="font-medium block">Upload a PDF</span>
                                                <span className="text-xs mt-1 opacity-90">Switch to file upload</span>
                                            </button>
                                        </div>
                                    </div>
                                    <ProjectOverview facts={[]} jobs={[]} projectId={projectId} compact />
                                </>
                            )}
                            {/* Project Overview - when has data, no filter */}
                            {!scopeType && !scopeValue && ((jobs ?? []).length > 0 || (facts ?? []).length > 0) && (
                                <ProjectOverview facts={facts || []} jobs={jobs || []} projectId={projectId} />
                            )}

                            {scopeType === "DOMAIN" && scopeValue && (
                                <DomainOverview
                                    domain={scopeValue}
                                    domainJobs={scopedJobs}
                                    domainFacts={scopedFacts}
                                    onSelectPage={(url) => handleNav("URL", url)}
                                />
                            )}

                            {scopeType === "URL" && pageSummary && (
                                <SummaryCard
                                    jobId={jobs?.find(j => j.params.url === scopeValue)?.id || ""}
                                    initialSummary={pageSummary.summary}
                                    title={pageSummary.source_title || "Untitled Page"}
                                />
                            )}

                            {scopeType !== "DOMAIN" && (
                                <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                                    {/* Left: Tabs (Key / All / Pinned) + on < md: Search + Controls button */}
                                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                                        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "key" | "all" | "pinned" | "graph")}>
                                            <TabsList className="h-9 w-fit bg-muted p-1 rounded-full">
                                                <TabsTrigger 
                                                    value="key" 
                                                    className="text-xs font-medium px-4 rounded-full data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground transition-all"
                                                >
                                                    Key Claims
                                                    <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px] bg-primary/10 text-primary border-0">
                                                        {counts.key}
                                                    </Badge>
                                                </TabsTrigger>
                                                <TabsTrigger 
                                                    value="all" 
                                                    data-testid="view-tab-all"
                                                    className="text-xs font-medium px-4 rounded-full data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground transition-all"
                                                >
                                                    All Data
                                                    <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px] bg-muted text-muted-foreground border-0">
                                                        {counts.all}
                                                    </Badge>
                                                </TabsTrigger>
                                                <TabsTrigger 
                                                    value="pinned" 
                                                    data-testid="facts-filter-pinned"
                                                    className="text-xs font-medium px-4 rounded-full data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground transition-all"
                                                >
                                                    Pinned
                                                    <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px] bg-muted text-muted-foreground border-0">
                                                        {counts.pinned}
                                                    </Badge>
                                                </TabsTrigger>
                                                <TabsTrigger 
                                                    value="graph" 
                                                    data-testid="view-tab-graph"
                                                    className="text-xs font-medium px-4 rounded-full data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground transition-all"
                                                >
                                                    Graph
                                                </TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                        {!isMd && (
                                            <>
                                                <div className="relative min-w-[120px] flex-1 max-w-[12rem]">
                                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                                    <Input
                                                        type="search"
                                                        placeholder="Filter facts..."
                                                        className="h-9 w-full pl-8 text-sm bg-surface border-border focus-visible:ring-2 focus-visible:ring-ring/30"
                                                        value={searchQuery}
                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                        data-testid="facts-search-input"
                                                    />
                                                </div>
                                                <Button
                                                    data-testid="facts-controls-open"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 text-xs shrink-0"
                                                    onClick={() => setFactsControlsOpen(true)}
                                                >
                                                    <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                                                    Filters
                                                </Button>
                                                <Button
                                                    data-testid="buckets-panel-open"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 text-xs shrink-0"
                                                    onClick={() => setShowBucketsPanel(true)}
                                                >
                                                    <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                                                    Buckets
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                    {counts.needsReview > 0 && (
                                        <span data-testid="needs-review-count" className="text-xs font-medium text-warning flex items-center gap-1.5 px-2 py-1 rounded-md bg-warning/10 border border-warning/30 shrink-0">
                                            <AlertTriangle className="w-3 h-3" />
                                            Needs Review: {counts.needsReview}
                                        </span>
                                    )}
                                    {counts.reviewQueue > 0 && (
                                        <Button
                                            data-testid="review-queue-open"
                                            variant="outline"
                                            size="sm"
                                            className="h-9 text-xs shrink-0"
                                            onClick={() => {
                                                const first = visibleFacts.find(f => f.review_status === "NEEDS_REVIEW" || f.review_status === "FLAGGED");
                                                if (first) {
                                                    setReviewQueueMode(true);
                                                    setViewingFact(first);
                                                }
                                            }}
                                        >
                                            Review Queue <span data-testid="review-queue-count">({counts.reviewQueue})</span>
                                        </Button>
                                    )}

                                    {/* Right: Search + Filters (sheet) — >= md */}
                                    {isMd && (
                                    <div className="flex flex-wrap items-center gap-3 min-w-0">
                                        <div className="relative min-w-[160px] flex-1 max-w-[14rem]">
                                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                                            <Input
                                                type="search"
                                                placeholder="Filter facts..."
                                                className="h-9 w-full pl-10 text-sm bg-surface border-border focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                data-testid="facts-search-input"
                                            />
                                        </div>
                                        <Button
                                            data-testid="facts-controls-open"
                                            variant="outline"
                                            size="sm"
                                            className="h-9 text-xs shrink-0"
                                            onClick={() => setFactsControlsOpen(true)}
                                        >
                                            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                                            Filters
                                        </Button>
                                        <Button
                                            data-testid="buckets-panel-open"
                                            variant="outline"
                                            size="sm"
                                            className="h-9 text-xs shrink-0"
                                            onClick={() => setShowBucketsPanel(true)}
                                        >
                                            <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                                            Buckets
                                        </Button>
                                    </div>
                                    )}
                                </div>
                            )}

                            {/* Phase status line (when processing) */}
                            {(phaseState.phase === "INGESTING" || phaseState.phase === "PROCESSING") && (
                                <div className="px-4 py-3 border-b border-border">
                                    <PhaseStatusLine phaseState={phaseState} />
                                </div>
                            )}

                            {/* Queued job watchdog alerts */}
                            {jobs && jobs.length > 0 && (
                                <QueuedJobAlert
                                    jobs={jobs ?? []}
                                    onRetry={async (jobId) => {
                                        const job = (jobs ?? []).find(j => j.id === jobId);
                                        const url = job?.params?.url;
                                        const sourceType = job?.params?.source_type ?? "WEB";
                                        if (!url) return;
                                        try {
                                            await retrySource(projectId, url, sourceType);
                                            toast.success("Retry initiated");
                                        } catch {
                                            toast.error("Failed to retry source");
                                            throw new Error("Retry failed"); // Re-throw so alert stays visible
                                        }
                                    }}
                                    className="px-4 py-3"
                                />
                            )}

                            {/* Active filter chips row */}
                            {(showOnlySelected || collapseSimilar || reviewStatusFilter || groupBySource || searchQuery.trim()) && (
                                <div className="flex flex-wrap gap-2 px-4 py-2 bg-muted/30 border-y border-border" data-testid="active-filters-chips">
                                    {showOnlySelected && (
                                        <Badge 
                                            variant="secondary" 
                                            className="gap-1.5 h-7 px-2.5 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                                            onClick={() => setShowOnlySelected(false)}
                                            data-testid="filter-chip-selected-only"
                                        >
                                            <span className="text-xs">Selected only ({selectedFacts.size})</span>
                                            <X className="w-3 h-3" />
                                        </Badge>
                                    )}
                                    {collapseSimilar && (
                                        <Badge 
                                            variant="secondary" 
                                            className="gap-1.5 h-7 px-2.5 bg-muted hover:bg-muted/80 cursor-pointer"
                                            onClick={() => setCollapseSimilar(false)}
                                            data-testid="filter-chip-collapse-similar"
                                        >
                                            <span className="text-xs">Duplicates hidden</span>
                                            <X className="w-3 h-3" />
                                        </Badge>
                                    )}
                                    {reviewStatusFilter && (
                                        <Badge 
                                            variant="secondary" 
                                            className="gap-1.5 h-7 px-2.5 bg-warning/10 text-warning hover:bg-warning/20 cursor-pointer"
                                            onClick={() => setReviewStatusFilter(null)}
                                            data-testid="filter-chip-review-status"
                                        >
                                            <span className="text-xs capitalize">{reviewStatusFilter.toLowerCase().replace(/_/g, ' ')}</span>
                                            <X className="w-3 h-3" />
                                        </Badge>
                                    )}
                                    {groupBySource && (
                                        <Badge 
                                            variant="secondary" 
                                            className="gap-1.5 h-7 px-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 cursor-pointer"
                                            onClick={() => setGroupBySource(false)}
                                            data-testid="filter-chip-group-by-source"
                                        >
                                            <span className="text-xs">Grouped by source</span>
                                            <X className="w-3 h-3" />
                                        </Badge>
                                    )}
                                    {searchQuery.trim() && (
                                        <Badge 
                                            variant="secondary" 
                                            className="gap-1.5 h-7 px-2.5 bg-muted hover:bg-muted/80 cursor-pointer"
                                            onClick={() => setSearchQuery("")}
                                            data-testid="filter-chip-search"
                                        >
                                            <span className="text-xs">Search: &quot;{searchQuery.length > 20 ? searchQuery.slice(0, 20) + '...' : searchQuery}&quot;</span>
                                            <X className="w-3 h-3" />
                                        </Badge>
                                    )}
                                    {scopeType && scopeValue && (
                                        <Badge 
                                            variant="secondary" 
                                            className="gap-1.5 h-7 px-2.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 cursor-pointer"
                                            onClick={() => { setScopeType(null); setScopeValue(null); }}
                                            data-testid="filter-chip-scope"
                                        >
                                            <span className="text-xs">{scopeType}: {scopeValue.length > 25 ? scopeValue.slice(0, 25) + '...' : scopeValue}</span>
                                            <X className="w-3 h-3" />
                                        </Badge>
                                    )}
                                </div>
                            )}

                            <div className="pb-24">
                                {viewMode === "graph" && scopeType !== "DOMAIN" && (
                                    <div className="mb-4">
                                        <FactsGraphView
                                            groups={factsGroups}
                                            facts={facts ?? []}
                                            selectedGroupId={graphSelectedGroupId}
                                            onNodeClick={setGraphSelectedGroupId}
                                            onClearSelection={() => setGraphSelectedGroupId(null)}
                                        />
                                    </div>
                                )}
                                {scopeType !== "DOMAIN" ? (
                                    isLoading || (visibleFacts.length === 0 && isProcessing) ? (
                                        <div className="space-y-4">
                                            {/* Phase-aware processing indicator */}
                                            {isProcessing && (
                                                <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
                                                    <PhaseIndicator phaseState={phaseState} variant="full" />
                                                    <div className="px-6 pb-6">
                                                        <PhaseProgressBar phaseState={phaseState} />
                                                    </div>
                                                </div>
                                            )}
                                            {/* Modern skeleton loader */}
                                            {[1, 2, 3].map(i => (
                                                <div key={i} className="h-16 bg-gradient-to-r from-muted/30 via-muted/60 to-muted/30 rounded-lg animate-shimmer bg-[length:200%_100%]" />
                                            ))}
                                        </div>
                                    ) : visibleFacts.length === 0 ? (
                                        <>
                                            <div data-testid="facts-empty-state" className="space-y-6">
                                                <div className="bg-surface rounded-lg border border-border shadow-xs">
                                                    <PhaseIndicator phaseState={phaseState} variant="full" />
                                                    {(phaseState.phase === "EMPTY" || phaseState.phase === "ERROR") && phaseCTA.action && (
                                                        <div className="flex justify-center pb-8">
                                                            <Button
                                                                variant={phaseCTA.variant === "primary" ? "default" : (phaseCTA.variant as "secondary" | "outline")}
                                                                disabled={phaseCTA.disabled}
                                                                onClick={() => {
                                                                    if (phaseCTA.action === "add_source") {
                                                                        setAddSourceSheetOpen(true);
                                                                    } else if (phaseCTA.action === "retry") {
                                                                        // Retry logic can be added here
                                                                        toast.info("Retry functionality coming soon");
                                                                    }
                                                                }}
                                                                data-testid="phase-cta-button"
                                                            >
                                                                {phaseCTA.label}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                {/* Onboarding guide - only in EMPTY phase */}
                                                {phaseState.phase === "EMPTY" && showOnboarding && (
                                                    <OnboardingOverlay
                                                        open={true}
                                                        onClose={() => setShowOnboarding(false)}
                                                        step={onboardingStep}
                                                        onStepChange={setOnboardingStep}
                                                        onSkip={() => setShowOnboarding(false)}
                                                        variant="inline"
                                                    />
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {(selectionModeActive || selectedFacts.size > 0) && (
                                                <div data-testid="selection-bar" className="flex items-center justify-between gap-3 px-4 py-2.5 mb-2 rounded-lg border border-border bg-muted/50 text-sm">
                                                    <span className="font-medium text-foreground">
                                                        Selected: <strong>{selectedFacts.size}</strong>
                                                        <span className="text-muted-foreground font-normal ml-1">
                                                            · Sources: <strong>{selectionAnalysis.count}</strong>
                                                        </span>
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <Button size="sm" variant="outline" className="h-9 text-xs" data-testid="selection-select-all-visible" onClick={() => setSelectedFacts(new Set(visibleFacts.map(f => f.id)))}>
                                                            Select all visible
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="h-9 text-xs" data-testid="selection-invert" onClick={() => {
                                                            const next = new Set(selectedFacts);
                                                            visibleFacts.forEach(f => { if (next.has(f.id)) next.delete(f.id); else next.add(f.id); });
                                                            setSelectedFacts(next);
                                                        }}>
                                                            Invert selection
                                                        </Button>
                                                        <Button size="sm" variant="ghost" className="h-9 text-xs text-muted-foreground hover:text-foreground" data-testid="selection-clear" onClick={() => setSelectedFacts(new Set())}>
                                                            Clear
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="h-9 text-xs" data-testid="selection-done" onClick={exitSelectionMode}>
                                                            Done
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                            {effectiveGroupBySource && visibleFactsGroupedBySource?.length ? (
                                        <div className="space-y-4">
                                            {visibleFactsGroupedBySource.map(({ domain, facts: groupFacts }) => (
                                                <div key={domain} data-testid="facts-group-section" className="bg-surface rounded-lg border border-border overflow-hidden shadow-sm">
                                                    <div data-testid="facts-group-title" className="px-4 py-2.5 border-b border-border text-sm font-medium text-foreground bg-muted/50 pointer-events-none">
                                                        {domain}
                                                    </div>
                                                    {groupFacts.map((fact) => (
                                                        <FactCard
                                                            key={fact.id}
                                                            fact={fact}
                                                            canonicalFact={fact.is_suppressed && fact.canonical_fact_id ? factMap.get(fact.canonical_fact_id) : undefined}
                                                            onViewEvidence={(f) => setViewingFact(f)}
                                                            isSelected={selectedFacts.has(fact.id)}
                                                            onToggleSelect={(f) => {
                                                                const newSet = new Set(selectedFacts);
                                                                if (newSet.has(f.id)) newSet.delete(f.id);
                                                                else newSet.add(f.id);
                                                                setSelectedFacts(newSet);
                                                            }}
                                                            onEnterSelectionMode={enterSelectionMode}
                                                            selectionMode={selectionModeActive || selectedFacts.size > 0}
                                                            undoManager={undoManager}
                                                            onSimilarChipClick={collapseSimilar && fact.group_id ? (f) => { setSimilarDrawerGroupId(f.group_id!); setSimilarDrawerRepFact(f); } : undefined}
                                                            buckets={buckets}
                                                            onAddToBucket={(factId, bucketId) => addFactToBucket(bucketId, factId)}
                                                        />
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                            ) : (
                                        <div data-testid="facts-list" className="bg-surface rounded-lg border border-border overflow-hidden shadow-sm">
                                            {visibleFacts.map((fact) => (
                                                <FactCard
                                                    key={fact.id}
                                                    fact={fact}
                                                    canonicalFact={fact.is_suppressed && fact.canonical_fact_id ? factMap.get(fact.canonical_fact_id) : undefined}
                                                    onViewEvidence={(f) => setViewingFact(f)}
                                                    isSelected={selectedFacts.has(fact.id)}
                                                    onToggleSelect={(f) => {
                                                        const newSet = new Set(selectedFacts);
                                                        if (newSet.has(f.id)) newSet.delete(f.id);
                                                        else newSet.add(f.id);
                                                        setSelectedFacts(newSet);
                                                    }}
                                                    onEnterSelectionMode={enterSelectionMode}
                                                    selectionMode={selectionModeActive || selectedFacts.size > 0}
                                                    undoManager={undoManager}
                                                    onSimilarChipClick={collapseSimilar && fact.group_id ? (f) => { setSimilarDrawerGroupId(f.group_id!); setSimilarDrawerRepFact(f); } : undefined}
                                                    buckets={buckets}
                                                    onAddToBucket={(factId, bucketId) => addFactToBucket(bucketId, factId)}
                                                />
                                            ))}
                                        </div>
                                            )}
                                        </>
                                    )
                                ) : (
                                    <div className="flex-1" />
                                )}
                            </div>
                        </div>
                    </div>
                </Panel>

            </Group>

            {/* Evidence Panel (Sheet) */}
            <EvidencePanelSimple
                open={viewingFact !== null}
                onOpenChange={(open) => { if (!open && !pinnedPanels.evidence) { setViewingFact(null); setReviewQueueMode(false); setOutputReviewQueueIds(null); } }}
                fact={viewingFact}
                visibleFacts={visibleFacts}
                projectId={projectId}
                workspaceId={workspaceId}
                pinned={pinnedPanels.evidence}
                onPinChange={(pinned) => setPinnedPanels((prev) => ({ ...prev, evidence: pinned }))}
                onReviewStatusChange={(factId, status) => {
                    updateFact(factId, { review_status: status })
                        .then(() => queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] }))
                        .catch(() => toast.error("Failed to update status"));
                }}
                onFactUpdate={() => queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] })}
                autoAdvance={evidenceAutoAdvance}
                onAutoAdvanceChange={setEvidenceAutoAdvance}
                queueIds={outputReviewQueueIds ?? reviewQueueIds}
                queueMode={reviewQueueMode}
                onQueueExit={() => { setReviewQueueMode(false); setOutputReviewQueueIds(null); }}
                onPrev={() => {
                    if (!viewingFact) return;
                    if (reviewQueueMode && reviewQueueIds.length) {
                        const idx = reviewQueueIds.indexOf(viewingFact.id);
                        if (idx > 0) {
                            const prevFact = factMap.get(reviewQueueIds[idx - 1]);
                            if (prevFact) setViewingFact(prevFact);
                        }
                    } else {
                        // Use snapshot for stable navigation (P1 fix)
                        const navList = evidenceFactIdsSnapshot.length > 0 ? evidenceFactIdsSnapshot : visibleFacts.map(f => f.id);
                        const idx = navList.indexOf(viewingFact.id);
                        if (idx > 0) {
                            const prevFact = factMap.get(navList[idx - 1]);
                            if (prevFact) setViewingFact(prevFact);
                        }
                    }
                }}
                onNext={() => {
                    if (!viewingFact) return;
                    if (reviewQueueMode && reviewQueueIds.length) {
                        const idx = reviewQueueIds.indexOf(viewingFact.id);
                        if (idx >= 0 && idx < reviewQueueIds.length - 1) {
                            const nextFact = factMap.get(reviewQueueIds[idx + 1]);
                            if (nextFact) setViewingFact(nextFact);
                        }
                    } else {
                        // Use snapshot for stable navigation (P1 fix)
                        const navList = evidenceFactIdsSnapshot.length > 0 ? evidenceFactIdsSnapshot : visibleFacts.map(f => f.id);
                        const idx = navList.indexOf(viewingFact.id);
                        if (idx >= 0 && idx < navList.length - 1) {
                            const nextFact = factMap.get(navList[idx + 1]);
                            if (nextFact) setViewingFact(nextFact);
                        }
                    }
                }}
            />

            <ExportPanel
                open={showExportPanel}
                onOpenChange={setShowExportPanel}
                projectId={projectId}
                lastOutputId={lastOutputSummary?.id ?? null}
            />

            <SourceHealthPanel
                open={showSourceHealth}
                onOpenChange={setShowSourceHealth}
                projectId={projectId}
                onOpenSource={(url) => {
                    handleNav("URL", url);
                    setShowSourceHealth(false);
                }}
            />

            {/* Selection restore banner - above floating bar */}
            {selectionRestoredFromStorage && selectedFacts.size > 0 && !showSelectionDrawer && !(focusMode && showOutputDrawer) && (
                <div data-testid="selection-restore-banner" className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/80 border border-border text-xs text-muted-foreground">
                    <span>Restored {selectedFacts.size} selected fact{selectedFacts.size !== 1 ? "s" : ""}</span>
                    <button
                        data-testid="selection-restore-clear"
                        type="button"
                        onClick={() => { setSelectedFacts(new Set()); setSelectionRestoredFromStorage(false); }}
                        className="font-medium text-foreground hover:underline"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Floating Action Bar - Hidden in focus mode when output drawer open. No wrapper testid — only the real bar has selection-bar. */}
            {!showSelectionDrawer && !(focusMode && showOutputDrawer) && (
                <div className="contents">
                <div data-testid="synthesis-selection-bar" className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 bg-elevated border border-border px-3 py-2 rounded-full shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-4">
                    {selectedFacts.size === 0 ? (
                        <div className="px-4 py-2 text-sm text-muted-foreground flex items-center gap-2" data-testid="bulk-actions-label">
                            <Sparkles className="w-4 h-4 opacity-50" />
                            Select facts to generate synthesis
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 px-1" data-testid="bulk-actions-label">
                                <span className="text-xs text-muted-foreground font-normal">Bulk actions</span>
                                <span className="text-sm font-semibold text-foreground">Selected:</span>
                                <Badge variant="secondary" className="h-6 px-2.5 text-xs bg-primary/10 text-primary border-primary/20 font-medium">
                                    {selectedFacts.size} fact{selectedFacts.size !== 1 ? 's' : ''}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    ({selectionAnalysis.count} source{selectionAnalysis.count !== 1 ? 's' : ''})
                                </span>
                                {selectionAnalysis.isMixed && (
                                    <Badge variant="outline" className="h-5 px-2 text-[10px] bg-warning/10 text-warning border-warning/30 font-medium">
                                        Cross-source
                                    </Badge>
                                )}
                            </div>
                            <div className="h-7 w-px bg-border mx-1" />
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full" onClick={() => handleBatchUpdate({ is_key_claim: true })} disabled={isBatchUpdating || selectedFacts.size === 0}>
                                            <Star className="w-4 h-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Mark all as Key Claims</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-success hover:bg-success/10 rounded-full" onClick={() => handleBatchUpdate({ review_status: "APPROVED" })} disabled={isBatchUpdating || selectedFacts.size === 0}>
                                            <CheckCircle2 className="w-4 h-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Approve all</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-warning hover:bg-warning/10 rounded-full" onClick={() => handleBatchUpdate({ review_status: "NEEDS_REVIEW" })} disabled={isBatchUpdating || selectedFacts.size === 0}>
                                            <AlertTriangle className="w-4 h-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Mark as Needs Review</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <div className="h-7 w-px bg-border mx-1" />
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            data-testid="selected-facts-open"
                                            size="sm"
                                            variant="ghost"
                                            className="h-9 w-9 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full"
                                            onClick={() => {
                                                setSelectedFactsDrawerFromOutput(false);
                                                setShowSelectedFactsDrawer(true);
                                            }}
                                        >
                                            <List className="w-4 h-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Review selected facts</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <div className="h-7 w-px bg-border mx-1" />
                            <Select value={synthesisMode} onValueChange={(v) => setSynthesisMode(v as typeof synthesisMode)}>
                                <SelectTrigger data-testid="synthesis-format-trigger" className="h-9 w-[160px] text-sm border-border bg-surface text-foreground rounded-full">
                                    <SelectValue placeholder="Format" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="paragraph" data-testid="synthesis-format-option-paragraph"><div className="flex items-center gap-2"><AlignLeft className="w-3 h-3" /> Paragraph</div></SelectItem>
                                    <SelectItem value="research_brief" data-testid="synthesis-format-option-research_brief"><div className="flex items-center gap-2"><FileText className="w-3 h-3" /> Research Brief</div></SelectItem>
                                    <SelectItem value="script_outline" data-testid="synthesis-format-option-script_outline"><div className="flex items-center gap-2"><Video className="w-3 h-3" /> Script Outline</div></SelectItem>
                                    <SelectItem value="split" data-testid="synthesis-format-option-split"><div className="flex items-center gap-2"><Layout className="w-3 h-3" /> Split Sections</div></SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                data-testid="generate-from-approved"
                                size="sm"
                                variant="outline"
                                className="h-9 text-xs px-3 rounded-full"
                                onClick={handleGenerateFromApproved}
                                disabled={isSynthesizing || counts.approved < 2}
                            >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                Approved
                            </Button>
                            <Button
                                data-testid="generate-from-pinned"
                                size="sm"
                                variant="outline"
                                className="h-9 text-xs px-3 rounded-full"
                                onClick={handleGenerateFromPinned}
                                disabled={isSynthesizing || counts.pinned < 2}
                            >
                                <Star className="w-3.5 h-3.5 mr-1.5" />
                                Pinned
                            </Button>
                            <Button
                                data-testid="generate-synthesis"
                                size="sm"
                                className="h-9 bg-primary text-primary-foreground hover:bg-primary/90 text-sm px-5 rounded-full"
                                onClick={handleGenerateClick}
                                disabled={isSynthesizing || selectedFacts.size < 2}
                            >
                                {isSynthesizing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                                Generate
                            </Button>
                            <div className="h-7 w-px bg-border mx-1" />
                            <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-full" onClick={() => setSelectedFacts(new Set())}>
                                <X className="w-4 h-4" />
                            </Button>
                        </>
                    )}
                </div>
                </div>
            )}

            <ClusterPreviewModal
                open={showClusterPreview}
                onOpenChange={setShowClusterPreview}
                groups={clusterPreviewGroups}
                onIncludeAllChange={(groupId, includeAll) => {
                    setClusterPreviewGroups((prev) =>
                        prev.map((g) => (g.groupId === groupId ? { ...g, includeAll } : g))
                    );
                }}
                onConfirm={handleClusterPreviewConfirm}
            />

            <SimilarFactsDrawer
                open={!!similarDrawerGroupId}
                onOpenChange={(open) => { if (!open) { setSimilarDrawerGroupId(null); setSimilarDrawerRepFact(null); } }}
                projectId={projectId}
                groupId={similarDrawerGroupId ?? ""}
                repFact={similarDrawerRepFact ?? ({} as Fact)}
                collapsedCount={similarDrawerRepFact?.collapsed_count ?? 0}
                selectedIds={selectedFacts}
                onSelectAllInGroup={(ids) => {
                    setSelectedFacts((prev) => new Set([...prev, ...ids]));
                }}
                onRepOnly={(repId) => {
                    const g = factsGroups[similarDrawerGroupId ?? ""];
                    if (!g) return;
                    setSelectedFacts((prev) => {
                        const next = new Set(prev);
                        g.collapsed_ids.forEach((id) => next.delete(id));
                        next.add(repId);
                        return next;
                    });
                }}
                onFactsLoaded={(loaded) => {
                    if (similarDrawerGroupId) groupFactsCacheRef.current.set(similarDrawerGroupId, loaded);
                }}
            />

            <BucketsPanel
                open={showBucketsPanel}
                onOpenChange={setShowBucketsPanel}
                buckets={buckets}
                onBucketsChange={setBuckets}
                factMap={bucketsFactMap}
                onGenerateFromBucket={handleGenerateFromBucket}
                isSynthesizing={isSynthesizing}
                onFactDrop={addFactToBucket}
            />

            <SelectedFactsDrawer
                open={showSelectedFactsDrawer}
                onOpenChange={setShowSelectedFactsDrawer}
                items={selectedFactsDrawerItems}
                onRemove={(id) => {
                    const next = new Set(selectedFacts);
                    next.delete(id);
                    setSelectedFacts(next);
                }}
                onGenerate={() => handleGenerateClick()}
                isGenerating={isSynthesizing}
                readOnly={selectedFactsDrawerFromOutput}
                onRemoveNonApproved={selectedFactsDrawerFromOutput ? undefined : () => {
                    const approved = (facts ?? []).filter((f) => selectedFacts.has(f.id) && f.review_status === "APPROVED");
                    if (approved.length < 2) {
                        toast.error("Need at least 2 approved facts");
                        return;
                    }
                    setSelectedFacts(new Set(approved.map((f) => f.id)));
                    const richFacts = approved.map((f) => {
                        const job = jobs?.find((j) => j.params.url === f.source_url);
                        return {
                            id: f.id,
                            text: f.fact_text,
                            title: job?.result_summary?.source_title || f.source_domain,
                            url: f.source_url,
                            section: f.section_context,
                            review_status: f.review_status,
                            is_pinned: f.is_pinned ?? false,
                        };
                    });
                    setShowSelectedFactsDrawer(false);
                    executeSynthesis(richFacts, synthesisMode);
                }}
                onIncludeAnyway={selectedFactsDrawerFromOutput ? undefined : () => {
                    const pending = pendingSynthesisRef.current;
                    if (pending) {
                        pendingSynthesisRef.current = null;
                        executeSynthesis(pending.richFacts, pending.mode);
                        setShowSelectedFactsDrawer(false);
                    } else {
                        handleGenerateClick();
                    }
                }}
                onOpenReview={selectedFactsDrawerFromOutput ? undefined : (factId) => {
                    const f = (facts ?? []).find((x) => x.id === factId);
                    if (f) {
                        setViewingFact(f);
                        setShowSelectedFactsDrawer(false);
                    }
                }}
            />

            <SynthesisBuilder
                open={showSelectionDrawer}
                onOpenChange={setShowSelectionDrawer}
                selectedFacts={(facts || [])
                    .filter(f => selectedFacts.has(f.id))
                    .map(f => {
                        const job = jobs?.find(j => j.params.url === f.source_url);
                        return {
                            id: f.id,
                            text: f.fact_text,
                            title: job?.result_summary?.source_title || f.source_domain,
                            source_domain: f.source_domain,
                            url: f.source_url
                        };
                    })
                }
                onRemoveFact={(id) => {
                    const next = new Set(selectedFacts);
                    next.delete(id);
                    setSelectedFacts(next);
                }}
                onClear={() => setSelectedFacts(new Set())}
                                onGenerate={(builderMode, finalIds) => {
                                    const richFacts = (facts || [])
                                        .filter(f => finalIds.includes(f.id))
                                        .map(f => {
                                            const rawUrl = f.source_url || "";
                                            const job = jobs?.find(j => j.params.url === rawUrl);
                                            return {
                                                id: f.id,
                                                text: f.fact_text || "Empty text",
                                                title: job?.result_summary?.source_title || f.source_domain || "Unknown Source",
                                                url: rawUrl.length > 0 ? rawUrl : "http://unknown-source.com",
                                                section: f.section_context || "General",
                                                review_status: f.review_status,
                                                is_pinned: f.is_pinned ?? false,
                                            };
                                        });
                                    const backendMode = builderMode === "split" ? "split" : synthesisMode;
                                    executeSynthesis(richFacts, backendMode);
                                }}
                projectId={projectId}
            />

            <OutputDrawer
                open={showOutputDrawer}
                onOpenChange={(open) => {
                    if (!open && pinnedPanels.output) return;
                    setShowOutputDrawer(open);
                    if (!open) setOutputOpenedFromHistory(false);
                }}
                output={currentOutput}
                synthesisBucketLabel={synthesisBucketLabel}
                openedFromHistory={outputOpenedFromHistory}
                onBackToHistory={popPanel}
                pinned={pinnedPanels.output}
                onPinChange={(pinned) => setPinnedPanels((prev) => ({ ...prev, output: pinned }))}
                outputPinned={currentOutput?.is_pinned ?? false}
                onOutputPinChange={currentOutput ? async (pinned) => {
                    try {
                        const updated = await patchOutput(currentOutput.id, { is_pinned: pinned });
                        outputCacheRef.current.set(currentOutput.id, updated);
                        setCurrentOutput(updated);
                        queryClient.invalidateQueries({ queryKey: ["project-outputs", projectId] });
                    } catch (_) {
                        toast.error("Failed to update pin");
                    }
                } : undefined}
                focusMode={focusMode}
                onFocusChange={handleFocusModeChange}
                onRegenerate={currentOutput ? () => handleRegenerate(currentOutput) : undefined}
                isRegenerating={isRegenerating}
                onViewSelectedFacts={() => {
                    setSelectedFactsDrawerFromOutput(true);
                    setShowSelectedFactsDrawer(true);
                }}
                projectId={projectId}
                onOpenEvidenceForFact={(factId, evidenceMapFact) => {
                    const f = factMap.get(factId) ?? evidenceMapFactToFact(evidenceMapFact);
                    if (f) setViewingFact(f);
                }}
                onReviewIssues={handleReviewIssuesFromOutput}
                onRegenerateApprovedOnly={handleRegenerateApprovedOnly}
                onOpenRepick={handleOpenRepickFromOutput}
                onOpenHistory={() => {
                    if (panelStackRef.current.length === 0 || panelStackRef.current[panelStackRef.current.length - 1] !== "history") pushPanel("history");
                    if (pinnedPanels.output) setShowOutputDrawer(true);
                    setShowHistoryDrawer(true);
                }}
            />

            {/* Synthesis History drawer */}
            <Sheet open={showHistoryDrawer} onOpenChange={setShowHistoryDrawer} modal={false}>
                <SheetContent
                    data-testid="outputs-history-drawer"
                    side="right"
                    nonModal
                    className="w-[400px] sm:w-[480px] flex flex-col p-0"
                    closeButtonTestId="outputs-history-close"
                >
                    <SheetHeader className="px-6 py-4 border-b border-border shrink-0 flex flex-row items-center justify-between gap-4">
                        <SheetTitle className="flex items-center gap-2">
                            <History className="w-5 h-5" />
                            Synthesis History
                        </SheetTitle>
                        {outputsList && outputsList.length >= 2 && (
                            <Button
                                data-testid="outputs-compare-open"
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                onClick={() => setShowCompareDrawer(true)}
                            >
                                Compare…
                            </Button>
                        )}
                    </SheetHeader>
                    <div ref={historyContentRef} className="flex-1 overflow-y-auto p-4" data-testid="outputs-history-content">
                        {outputsLoading ? (
                            <div data-testid="outputs-history-loading" className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading outputs...
                            </div>
                        ) : outputsError ? (
                            <div data-testid="outputs-history-error" className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                                <p className="font-medium">Failed to load outputs</p>
                                <p className="mt-1 text-muted-foreground">{outputsErrorObj instanceof Error ? outputsErrorObj.message : "Unknown error"}</p>
                                <Button
                                    data-testid="outputs-history-retry"
                                    variant="outline"
                                    size="sm"
                                    className="mt-3 border-destructive/50 text-destructive hover:bg-destructive/10"
                                    onClick={() => queryClient.invalidateQueries({ queryKey: ["project-outputs", projectId] })}
                                >
                                    Retry
                                </Button>
                            </div>
                        ) : !outputsList?.length ? (
                            <p data-testid="outputs-history-empty" className="text-sm text-muted-foreground">
                                No outputs yet. Generate a synthesis to see it here.
                            </p>
                        ) : (
                            <>
                                {(() => {
                                    const pinnedList = (outputsList as OutputSummary[]).filter((o) => o.is_pinned);
                                    const renderItem = (item: OutputSummary, isPinned = false) => (
                                        <li key={item.id} data-testid={isPinned ? "outputs-history-item-pinned" : "outputs-history-item"}>
                                            <div data-testid={isPinned ? "outputs-history-item" : undefined} className="contents">
                                            <button
                                                type="button"
                                                data-testid="outputs-history-open"
                                                data-output-id={item.id}
                                                className="w-full text-left p-3 rounded-lg border border-border bg-surface hover:bg-muted/50 transition-colors"
                                                onClick={async () => {
                                                    historyScrollTopRef.current = historyContentRef.current?.scrollTop ?? 0;
                                                    pushPanel("output");
                                                    setOutputOpenedFromHistory(true);
                                                    setSynthesisBucketLabel(null);
                                                    const cached = outputCacheRef.current.get(item.id);
                                                    if (cached) {
                                                        setCurrentOutput(cached);
                                                    } else {
                                                        const full = await fetchOutput(item.id);
                                                        outputCacheRef.current.set(item.id, full);
                                                        setCurrentOutput(full);
                                                    }
                                                    setShowHistoryDrawer(false);
                                                    setShowOutputDrawer(true);
                                                }}
                                            >
                                                <div className="font-medium text-sm truncate">{item.title}</div>
                                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                                                    <span>{item.source_count} sources</span>
                                                    <span>·</span>
                                                    <span>{item.fact_ids_count} facts</span>
                                                    {item.created_at && (
                                                        <>
                                                            <span>·</span>
                                                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                                                        </>
                                                    )}
                                                    {(item as OutputSummary).quality_stats && ((item as OutputSummary).quality_stats!.needs_review > 0 || (item as OutputSummary).quality_stats!.flagged > 0) && (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px] h-5 px-1.5 bg-warning/10 text-warning border-warning/30"
                                                            data-testid="outputs-history-quality-badge"
                                                        >
                                                            Needs review used
                                                        </Badge>
                                                    )}
                                                </div>
                                                {item.preview && (
                                                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{item.preview}</p>
                                                )}
                                            </button>
                                            </div>
                                        </li>
                                    );
                                    return (
                                        <>
                                            {pinnedList.length > 0 && (
                                                <div data-testid="outputs-history-pinned-section" className="mb-4">
                                                    <p className="text-xs font-medium text-muted-foreground mb-2">Pinned</p>
                                                    <ul className="space-y-2">{pinnedList.map((item) => renderItem(item, true))}</ul>
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-xs font-medium text-muted-foreground mb-2">All outputs</p>
                                                <ul data-testid="outputs-history-list" className="space-y-2">
                                                    {(outputsList as OutputSummary[]).map((item) => renderItem(item, false))}
                                                </ul>
                                            </div>
                                        </>
                                    );
                                })()}
                            </>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            <OutputCompareDrawer
                open={showCompareDrawer}
                onOpenChange={setShowCompareDrawer}
                outputsList={(outputsList as OutputSummary[]) ?? []}
                onFetchOutput={async (id) => {
                    const cached = outputCacheRef.current.get(id);
                    if (cached) return cached;
                    const full = await fetchOutput(id);
                    outputCacheRef.current.set(id, full);
                    return full;
                }}
            />

            {/* Command palette: Cmd+K / Ctrl+K */}
            {showCommandPalette && (
                <div
                    data-testid="command-palette"
                    className={`fixed inset-0 ${Z.overlay} flex items-start justify-center pt-[15vh] px-4 bg-black/20`}
                    onClick={() => setShowCommandPalette(false)}
                    role="dialog"
                    aria-label="Command palette"
                >
                    <div
                        className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Input
                            placeholder="Search commands..."
                            value={commandPaletteQuery}
                            onChange={(e) => setCommandPaletteQuery(e.target.value)}
                            className="border-0 rounded-none border-b border-border focus-visible:ring-0 h-12 px-4"
                            autoFocus
                        />
                        <ul className="max-h-64 overflow-y-auto py-2">
                            {[
                                { id: "add-source", label: "Add Source", run: () => { urlInputRef.current?.focus(); setShowCommandPalette(false); } },
                                { id: "open-history", label: "Open History", run: () => { setShowHistoryDrawer(true); setShowCommandPalette(false); } },
                                { id: "open-export", label: "Open Export", run: () => { setShowExportPanel(true); setShowCommandPalette(false); } },
                                { id: "source-health", label: "Source Health", run: () => { setShowSourceHealth(true); setShowCommandPalette(false); } },
                                { id: "toggle-group", label: "Toggle Group by Source", run: () => { setGroupBySource((g) => !g); setShowCommandPalette(false); } },
                                { id: "sort-needs-review", label: "Sort: Needs Review", run: () => { setSortBy("needs_review"); setShowCommandPalette(false); } },
                            ]
                                .filter((c) => c.label.toLowerCase().includes(commandPaletteQuery.toLowerCase()))
                                .map((cmd) => (
                                    <li key={cmd.id}>
                                        <button
                                            type="button"
                                            data-testid="command-item"
                                            data-command-id={cmd.id}
                                            className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted/50"
                                            onClick={() => cmd.run()}
                                        >
                                            {cmd.label}
                                        </button>
                                    </li>
                                ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Diagnostics strip (E2E + debug mode) */}
            {isDiagnosticsMode && (
                <div 
                    className={`fixed bottom-0 left-0 right-0 bg-yellow-100 dark:bg-yellow-900/50 border-t border-yellow-300 px-4 py-1 text-[10px] font-mono ${Z.popover} flex items-center gap-3`}
                    data-testid="diagnostics-strip"
                >
                    <span className="font-bold text-yellow-800 dark:text-yellow-200">[DEBUG]</span>
                    <span>jobs: {jobs?.filter(j => j.status === "PENDING").length ?? 0}p / {jobs?.filter(j => j.status === "RUNNING").length ?? 0}r / {jobs?.filter(j => j.status === "FAILED").length ?? 0}f</span>
                    <span>facts: {facts?.length ?? 0}</span>
                    <span>selected: {selectedFacts.size}</span>
                    <span>sort: {sortBy}</span>
                    <span>group: {groupBySource ? "Y" : "N"}</span>
                    <span className={diagnosticsIdle ? "text-green-600" : "text-red-600"}>
                        idle: {diagnosticsIdle ? "✓" : "✗"}
                        {!diagnosticsIdle && diagnosticsIdleReasons.length > 0 && (
                            <span className="text-xs opacity-70"> ({diagnosticsIdleReasons.join(', ')})</span>
                        )}
                    </span>
                    <span className="text-muted-foreground ml-auto">{diagnosticsTime}</span>
                </div>
            )}
        </div>
    );
}