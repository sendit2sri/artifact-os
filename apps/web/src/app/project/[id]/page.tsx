"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, use, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FactCard } from "@/components/FactCard";
import { SourceTracker } from "@/components/SourceTracker";
import { EvidenceInspector } from "@/components/EvidenceInspector";
import { DomainOverview } from "@/components/DomainOverview";
import { SummaryCard } from "@/components/SummaryCard";
import { SynthesisBuilder } from "@/components/SynthesisBuilder";
import { OutputDrawer } from "@/components/OutputDrawer";
import { ProjectOverview } from "@/components/ProjectOverview";
import { fetchProjectFacts, fetchProjectJobs, ingestUrl, resetProject, synthesizeFacts, Fact, downloadAsCSV, downloadAsMarkdown, uploadFile, batchUpdateFacts, Output, fetchProjectOutputs } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Layout, Search, Sparkles, X, Home, ChevronRight, Download, UploadCloud, Check, Star, FileText, Video, AlignLeft, Moon, Sun, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const getDomain = (u: string) => {
    try { return new URL(u).hostname.replace(/^www\./, ""); }
    catch { return u; }
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: projectId } = use(params);
    const workspaceId = "123e4567-e89b-12d3-a456-426614174000";

    const router = useRouter();
    const searchParams = useSearchParams();
    const { theme, setTheme } = useTheme();

    // Fix hydration mismatch: only render theme icon after client mount
    const [mounted, setMounted] = useState(false);

    // State
    const initialFilterType = searchParams.get("type") as "DOMAIN" | "URL" | null;
    const initialFilterValue = searchParams.get("value");
    const [scopeType, setScopeType] = useState<"DOMAIN" | "URL" | null>(initialFilterType);
    const [scopeValue, setScopeValue] = useState<string | null>(initialFilterValue);
    const [viewMode, setViewMode] = useState<"key" | "all">("key");
    const initialSort = (searchParams.get("sort") as "confidence" | "key-first" | "newest") || "key-first";
    const [sortBy, setSortBy] = useState<"confidence" | "key-first" | "newest">(initialSort);
    const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
    
    // ✅ Review status filter
    const [reviewStatusFilter, setReviewStatusFilter] = useState<string | null>(searchParams.get("review_status"));
    const [urlInput, setUrlInput] = useState("");
    const [inputType, setInputType] = useState<"url" | "file">("url");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [viewingFact, setViewingFact] = useState<Fact | null>(null);
    const [selectedFacts, setSelectedFacts] = useState<Set<string>>(new Set());
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [currentOutput, setCurrentOutput] = useState<Output | null>(null);
    const [showOutputDrawer, setShowOutputDrawer] = useState(false);
    const [synthesisMode, setSynthesisMode] = useState<"paragraph" | "outline" | "brief">("paragraph");
    const [showSelectionDrawer, setShowSelectionDrawer] = useState(false);
    const [lastSynthesisError, setLastSynthesisError] = useState<string | null>(null);

    // Toast deduplication: Track which jobs/sources we've already notified about
    const toastShownRef = useRef(new Set<string>());

    // Set mounted state after hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    const queryClient = useQueryClient();

    // Queries with improved polling logic
    const { data: jobs, dataUpdatedAt: jobsUpdatedAt } = useQuery({
        queryKey: ["project-jobs", projectId],
        queryFn: () => fetchProjectJobs(projectId),
        refetchInterval: (query) => {
            const data = query.state.data as any[];
            const hasActive = data?.some(j => ["PENDING", "RUNNING"].includes(j.status));
            return hasActive ? 2500 : false; // Poll every 2.5s when active, stop otherwise
        },
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
        const filter: any = {};
        
        // Map viewMode and reviewStatusFilter to backend filter param
        if (reviewStatusFilter) {
            filter.filter = reviewStatusFilter;
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
        }
        
        return filter;
    }, [viewMode, reviewStatusFilter, sortBy]);

    const { data: facts, isLoading } = useQuery({
        queryKey: ["project-facts", projectId, factsFilter],
        queryFn: () => fetchProjectFacts(projectId, factsFilter),
        refetchInterval: isProcessing ? 3000 : false, // Poll every 3s when processing
    });

    // ✅ STEP #13: Load latest project output for "Last Output" button
    const { data: outputs } = useQuery({
        queryKey: ["project-outputs", projectId],
        queryFn: () => fetchProjectOutputs(projectId),
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    });
    const lastOutput = outputs?.[0] ?? null;

    // Mutations
    const ingestMutation = useMutation({
        mutationFn: () => ingestUrl(projectId, workspaceId, urlInput),
        onSuccess: (data: any) => {
            const jobId = data.job_id || data.id;
            setUrlInput("");
            queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
            
            // Check if this was a duplicate
            if (data.is_duplicate) {
                toast.info(data.message || "This source has already been added to this project", {
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
        onError: (error: any) => {
            const errorMsg = error.message || "Failed to add source. Please check the URL and try again.";
            toast.error(errorMsg);
            console.error("Ingestion error:", error);
        }
    });

    const uploadMutation = useMutation({
        mutationFn: () => {
            if (!selectedFile) throw new Error("No file selected");
            return uploadFile(projectId, workspaceId, selectedFile);
        },
        onSuccess: (data: any) => {
            const jobId = data.job_id || data.id;
            const filename = selectedFile?.name;
            setSelectedFile(null);
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
        onError: (error: any) => {
            const errorMsg = error.message || "Failed to upload file. Please try again.";
            toast.error(errorMsg);
            console.error("Upload error:", error);
        }
    });

    const handleBatchUpdate = async (updates: Partial<Fact>) => {
        const count = selectedFacts.size;
        const actionLabel = updates.is_key_claim ? "key claims" : updates.review_status === "APPROVED" ? "approved" : "updated";
        
        // Show loading toast
        const loadingToast = toast.loading(`Updating ${count} facts...`);
        
        try {
            // Optimistic update
            queryClient.setQueryData(["project-facts", projectId], (oldData: Fact[] | undefined) => {
                if (!oldData) return oldData;
                return oldData.map(fact => 
                    selectedFacts.has(fact.id) ? { ...fact, ...updates } : fact
                );
            });

            await batchUpdateFacts(Array.from(selectedFacts), updates);
            
            // Invalidate to get fresh data from server
            await queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            
            setSelectedFacts(new Set());
            toast.success(`${count} facts ${actionLabel}`, { id: loadingToast });
        } catch (e) {
            // Rollback on error
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            toast.error("Batch update failed", { id: loadingToast });
        }
    };

    const executeSynthesis = async (finalRichFacts: any[], mode: "paragraph" | "outline" | "brief") => {
        setIsSynthesizing(true);
        setShowSelectionDrawer(false);

        // ✅ STEP #13: Better progress message with mode + fact count
        const modeLabels = {
            paragraph: "Research Brief",
            outline: "Script Outline",
            brief: "Executive Summary"
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
            
            // ✅ STEP #13: ALWAYS open OutputDrawer on success (never silent)
            // Try to fetch full output from backend
            let finalOutput: Output;
            
            try {
                const outputRes = await fetch(`/api/v1/outputs/${result.output_id}`);
                if (outputRes.ok) {
                    finalOutput = await outputRes.json();
                } else {
                    throw new Error(`Output fetch failed: ${outputRes.status}`);
                }
            } catch (fetchError) {
                // ✅ Fallback: Create output object from synthesis response
                console.warn(`Output fetch failed for ${result.output_id}, using fallback`, fetchError);
                finalOutput = {
                    id: result.output_id,
                    project_id: projectId,
                    title: `${modeLabel} - ${new Date().toLocaleString()}`,
                    content: result.synthesis,
                    output_type: "synthesis",
                    mode: mode,
                    fact_ids: finalRichFacts.map(f => f.id),
                    source_count: new Set(finalRichFacts.map(f => f.url)).size,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            }
            
            // ✅ ALWAYS open drawer (never return early)
            setCurrentOutput(finalOutput);
            setShowOutputDrawer(true);
            
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
            toast.error(errorMsg, {
                id: progressToast,
                duration: 6000,
                description: "Check console for details",
                // Stable selector for E2E (Sonner may forward to toast element)
                "data-testid": "synthesis-error-toast",
            } as Parameters<typeof toast.error>[1] & { "data-testid"?: string });
        } finally {
            setIsSynthesizing(false);
        }
    };

    const handleGenerateClick = async () => {
        if (selectedFacts.size < 2) return;

        const richFacts = (facts || [])
            .filter(f => selectedFacts.has(f.id))
            .map(f => {
                const job = jobs?.find(j => j.params.url === f.source_url);
                return {
                    id: f.id,
                    text: f.fact_text,
                    title: job?.result_summary?.source_title || f.source_domain,
                    url: f.source_url,
                    section: f.section_context
                };
            });

        if (selectionAnalysis.isMixed) {
            toast.info("Mixed topics detected. Opening builder...");
            setShowSelectionDrawer(true);
            return;
        }

        executeSynthesis(richFacts, synthesisMode);
    };

    // Auto-ingest URL from query param on mount
    useEffect(() => {
        const ingestParam = searchParams.get("ingest");
        if (ingestParam && !jobs?.some(j => j.params.url === ingestParam)) {
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
                    
                    // Use same toast message as manual ingest for consistency
                    toast.success("Source added! Processing will begin shortly.", {
                        id: toastKey
                    });
                    
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

    // Sync URL params including sort and review_status
    useEffect(() => {
        const params = new URLSearchParams();
        if (scopeType && scopeValue) {
            params.set("type", scopeType);
            params.set("value", scopeValue);
        }
        if (searchQuery) params.set("q", searchQuery);
        if (sortBy !== "key-first") params.set("sort", sortBy); // Only add if not default
        if (reviewStatusFilter) params.set("review_status", reviewStatusFilter);
        router.replace(`/project/${projectId}?${params.toString()}`, { scroll: false });
    }, [scopeType, scopeValue, searchQuery, sortBy, reviewStatusFilter, projectId, router]);
    
    // Sync review_status filter from URL on mount
    useEffect(() => {
        const status = searchParams.get("review_status");
        if (status) {
            setReviewStatusFilter(status);
        }
    }, [searchParams]);

    // Auto-clear synthesis error after 10s
    useEffect(() => {
        if (lastSynthesisError) {
            const timer = setTimeout(() => setLastSynthesisError(null), 10000);
            return () => clearTimeout(timer);
        }
    }, [lastSynthesisError]);

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
        key: scopedFacts.filter(f => f.is_key_claim).length
    }), [scopedFacts]);

    const visibleFacts = useMemo(() => {
        let list = scopedFacts;
        
        // ✅ STEP #8: Server-side filtering handles viewMode, reviewStatusFilter, and sortBy
        // Only client-side filtering needed now is search query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(f =>
                f.fact_text.toLowerCase().includes(q) ||
                f.tags?.some(t => t.toLowerCase().includes(q))
            );
        }
        
        // No need for manual sorting - backend handles it now
        return list;
    }, [scopedFacts, searchQuery]);

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

    const isDuplicate = (jobs ?? []).some(j => j.params.url.trim() === urlInput.trim());

    return (
        <div className="h-screen w-full bg-background flex flex-col overflow-hidden relative transition-colors">
            {/* Synthesis error banner (E2E stable selector) */}
            {lastSynthesisError && (
                <div
                    data-testid="synthesis-error-banner"
                    className="fixed top-4 right-4 z-50 max-w-md bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 animate-in slide-in-from-right-5"
                >
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm">
                        <p className="font-medium">Synthesis Error</p>
                        <p className="text-xs mt-1 opacity-90">{lastSynthesisError}</p>
                    </div>
                    <button
                        onClick={() => setLastSynthesisError(null)}
                        className="shrink-0 text-destructive/70 hover:text-destructive transition-colors"
                        aria-label="Dismiss error"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
            <header className="h-16 bg-surface/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-6 shrink-0 z-10 shadow-xs">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm">
                        <Layout className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 
                            className="font-semibold text-foreground tracking-tight cursor-pointer hover:text-primary transition-colors"
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={async (e) => {
                                const newTitle = e.currentTarget.textContent?.trim();
                                if (newTitle && newTitle !== "Research Inbox") {
                                    try {
                                        await fetch(`/api/v1/projects/${projectId}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ title: newTitle })
                                        });
                                        toast.success("Project renamed");
                                    } catch {
                                        toast.error("Failed to rename project");
                                    }
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                }
                            }}
                        >
                            Research Inbox
                        </h1>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                            Click to rename • {jobs?.length || 0} Sources • {facts?.length || 0} Facts
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        {mounted ? (
                            theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />
                        ) : (
                            <div className="w-4 h-4" />
                        )}
                    </Button>

                    {/* ✅ STEP #13: Last Output button */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    data-testid="last-output-button"
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-9 gap-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                    disabled={!lastOutput}
                                    onClick={() => {
                                        if (lastOutput) {
                                            setCurrentOutput(lastOutput);
                                            setShowOutputDrawer(true);
                                        }
                                    }}
                                >
                                    <FileText className="w-4 h-4" />
                                    <span className="hidden sm:inline">Last Output</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {lastOutput ? `${lastOutput.title} (${new Date(lastOutput.created_at).toLocaleDateString()})` : "No outputs yet"}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-9 gap-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                                <Download className="w-4 h-4" />
                                <span className="hidden sm:inline">Export</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => downloadAsCSV(visibleFacts, projectId)}>Download as CSV</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadAsMarkdown(visibleFacts, projectId)}>Download as Markdown</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex items-center gap-2 bg-surface p-2 rounded-full border border-border shadow-sm">
                        <div className="flex gap-1 bg-muted rounded-full p-0.5">
                            <button onClick={() => setInputType("url")} className={cn("px-3 py-1.5 text-xs font-medium rounded-full transition-all", inputType === "url" ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>URL</button>
                            <button onClick={() => setInputType("file")} className={cn("px-3 py-1.5 text-xs font-medium rounded-full transition-all", inputType === "file" ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>Upload</button>
                        </div>
                        {inputType === "url" ? (
                            <>
                                <div className="relative">
                                    <Input placeholder="Paste a source URL..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className={cn("w-80 h-9 text-sm border-0 bg-transparent text-foreground focus-visible:ring-0 placeholder:text-faint-foreground", isDuplicate && "text-warning")} />
                                </div>
                                <Button size="sm" className="h-9 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs" onClick={() => ingestMutation.mutate()} disabled={ingestMutation.isPending || !urlInput || isDuplicate}>
                                    {ingestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Input type="file" accept=".pdf,.txt,.md" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="w-80 h-9 text-sm border-0 bg-transparent text-foreground file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted-2" />
                                <Button size="sm" className="h-9 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs" onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !selectedFile}>
                                    {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UploadCloud className="w-4 h-4 mr-1" /> Upload</>}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <PanelGroup direction="horizontal" className="flex-1 min-h-0">
                {/* Left: Sources */}
                <Panel id="sidebar" order={1} defaultSize={20} minSize={15} maxSize={30} className="border-r border-border bg-surface/50 backdrop-blur-sm flex flex-col">
                    <div className="p-4 overflow-y-auto h-full">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Active Sources</h3>
                        <SourceTracker
                            projectId={projectId}
                            activeFilter={{ type: scopeType, value: scopeValue }}
                            onSelect={handleNav}
                        />
                    </div>
                </Panel>
                <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

                {/* Main Canvas */}
                <Panel id="canvas" order={2} minSize={30} className="bg-background relative">
                    <div className="h-full w-full overflow-y-auto">
                        <div className="mx-auto max-w-4xl p-8 flex flex-col gap-6">
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

                            {/* Project Overview - shown when no filter is active */}
                            {!scopeType && !scopeValue && (
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
                                <div className="flex items-center justify-between gap-4">
                                    {/* Left: Segmented Control for Key Claims / All Data */}
                                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "key" | "all")}>
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
                                                className="text-xs font-medium px-4 rounded-full data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground transition-all"
                                            >
                                                All Data
                                                <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px] bg-muted text-muted-foreground border-0">
                                                    {counts.all}
                                                </Badge>
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>

                                    {/* Right: Sort + Search */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex flex-col items-end gap-0.5">
                                            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                                                <SelectTrigger className="h-9 w-[160px] text-xs bg-surface border-border">
                                                    <SelectValue placeholder="Sort by..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="key-first">
                                                        <div className="flex items-center gap-2">
                                                            <Star className="w-3 h-3" />
                                                            Key Claims First
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="confidence">
                                                        <div className="flex items-center gap-2">
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            By Confidence
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="newest">
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="w-3 h-3" />
                                                            Newest First
                                                        </div>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                <Check className="w-2.5 h-2.5 text-success" />
                                                Sorted by: {sortBy === "key-first" ? "Key first" : sortBy === "confidence" ? "Confidence" : "Newest"}
                                            </span>
                                        </div>

                                        <div className="relative w-72">
                                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input 
                                                type="search" 
                                                placeholder="Filter facts..." 
                                                className="h-9 pl-10 text-sm bg-surface border-border focus-visible:ring-2 focus-visible:ring-ring/30" 
                                                value={searchQuery} 
                                                onChange={(e) => setSearchQuery(e.target.value)} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="pb-24">
                                {scopeType !== "DOMAIN" ? (
                                    isLoading || (visibleFacts.length === 0 && isProcessing) ? (
                                        <div className="space-y-4">
                                            {/* Show processing message if jobs are running */}
                                            {isProcessing && (
                                                <div className="bg-warning/10 border border-warning rounded-lg p-6 text-center shadow-xs">
                                                    <div className="flex items-center justify-center gap-2 mb-2">
                                                        <div className="w-2 h-2 rounded-full bg-warning animate-pulse" style={{animationDelay: '0ms'}} />
                                                        <div className="w-2 h-2 rounded-full bg-warning animate-pulse" style={{animationDelay: '150ms'}} />
                                                        <div className="w-2 h-2 rounded-full bg-warning animate-pulse" style={{animationDelay: '300ms'}} />
                                                    </div>
                                                    <h3 className="text-foreground font-semibold text-lg">Extracting facts...</h3>
                                                    <p className="text-muted-foreground text-sm mt-2">
                                                        {jobs?.find(j => ["PENDING", "RUNNING"].includes(j.status))?.current_step || "Processing your sources"}
                                                    </p>
                                                </div>
                                            )}
                                            {/* Modern skeleton loader */}
                                            {[1, 2, 3].map(i => (
                                                <div key={i} className="h-16 bg-gradient-to-r from-muted/30 via-muted/60 to-muted/30 rounded-lg animate-shimmer bg-[length:200%_100%]" />
                                            ))}
                                        </div>
                                    ) : visibleFacts.length === 0 ? (
                                        <div className="text-center py-24 bg-surface rounded-lg border border-border shadow-xs">
                                            {jobs?.some(j => j.status === "FAILED") ? (
                                                <>
                                                    <AlertTriangle className="w-10 h-10 text-danger mx-auto mb-4" />
                                                    <h3 className="text-foreground font-semibold text-lg">Processing failed</h3>
                                                    <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto">
                                                        {jobs.find(j => j.status === "FAILED")?.error_message || "Some sources couldn't be processed. Check the sidebar for details."}
                                                    </p>
                                                </>
                                            ) : (
                                                <>
                                                    <Search className="w-10 h-10 text-faint-foreground mx-auto mb-4" />
                                                    <h3 className="text-foreground font-semibold text-lg">No facts found</h3>
                                                    <p className="text-muted-foreground text-sm mt-2">Try adding a source or adjusting your filters.</p>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="bg-surface rounded-lg border border-border overflow-hidden shadow-sm">
                                            {visibleFacts.map((fact) => (
                                                <FactCard
                                                    key={fact.id}
                                                    fact={fact}
                                                    onViewEvidence={(f) => setViewingFact(f)}
                                                    isSelected={selectedFacts.has(fact.id)}
                                                    onToggleSelect={(f) => {
                                                        const newSet = new Set(selectedFacts);
                                                        if (newSet.has(f.id)) newSet.delete(f.id);
                                                        else newSet.add(f.id);
                                                        setSelectedFacts(newSet);
                                                    }}
                                                    selectionMode={selectedFacts.size > 0}
                                                />
                                            ))}
                                        </div>
                                    )
                                ) : (
                                    <div className="flex-1" />
                                )}
                            </div>
                        </div>
                    </div>
                </Panel>

                {/* Right: Inspector */}
                {viewingFact && (
                    <>
                        <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
                        <Panel id="inspector" order={3} defaultSize={35} minSize={25} maxSize={50} className="bg-elevated shadow-lg z-20">
                            <EvidenceInspector fact={viewingFact} onClose={() => setViewingFact(null)} projectId={projectId} />
                        </Panel>
                    </>
                )}
            </PanelGroup>

            {/* Floating Action Bar - Always visible, disabled when no selection */}
            {!showSelectionDrawer && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 bg-elevated border border-border px-3 py-2 rounded-full shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-4">
                    {selectedFacts.size === 0 ? (
                        <div className="px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
                            <Sparkles className="w-4 h-4 opacity-50" />
                            Select facts to generate synthesis
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 px-1">
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
                                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full" onClick={() => handleBatchUpdate({ is_key_claim: true })}>
                                            <Star className="w-4 h-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Mark all as Key Claims</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-success hover:bg-success/10 rounded-full" onClick={() => handleBatchUpdate({ review_status: "APPROVED" })}>
                                            <CheckCircle2 className="w-4 h-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Approve all</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-warning hover:bg-warning/10 rounded-full" onClick={() => handleBatchUpdate({ review_status: "NEEDS_REVIEW" })}>
                                            <AlertTriangle className="w-4 h-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Mark as Needs Review</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <div className="h-7 w-px bg-border mx-1" />
                            <Select value={synthesisMode} onValueChange={(v: any) => setSynthesisMode(v)}>
                                <SelectTrigger className="h-9 w-[140px] text-sm border-border bg-surface text-foreground rounded-full">
                                    <SelectValue placeholder="Format" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="paragraph"><div className="flex items-center gap-2"><AlignLeft className="w-3 h-3" /> Paragraph</div></SelectItem>
                                    <SelectItem value="outline"><div className="flex items-center gap-2"><Video className="w-3 h-3" /> Script Outline</div></SelectItem>
                                    <SelectItem value="brief"><div className="flex items-center gap-2"><FileText className="w-3 h-3" /> Research Brief</div></SelectItem>
                                </SelectContent>
                            </Select>
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
            )}

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
                onGenerate={(mode, finalIds) => {
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
                                section: f.section_context || "General"
                            };
                        });
                    const backendMode = mode === "split" ? "brief" : "paragraph";
                    executeSynthesis(richFacts, backendMode);
                }}
                projectId={projectId}
            />

            <OutputDrawer 
                open={showOutputDrawer} 
                onOpenChange={setShowOutputDrawer}
                output={currentOutput}
            />
        </div>
    );
}