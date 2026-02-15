"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash, Globe, ChevronRight, ChevronDown, FileText, Search, X, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { deleteJob, resetProject, Job, fetchProjectJobs } from "@/lib/api";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface SourceTrackerProps {
    projectId: string;
    activeFilter: { type: "DOMAIN" | "URL" | null; value: string | null };
    onSelect: (type: "DOMAIN" | "URL" | null, value: string | null) => void;
    /** When set, the source row matching this canonical URL shows a pulse highlight (e.g. after duplicate ingest). */
    highlightCanonicalUrl?: string | null;
}

const getDomain = (u: string) => {
    try { return new URL(u).hostname.replace(/^www\./, ""); }
    catch { return u; }
};

export function SourceTracker({ projectId, activeFilter, onSelect, highlightCanonicalUrl }: SourceTrackerProps) {
    const queryClient = useQueryClient();
    const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState(""); // ✅ Local Search State
    const [renamingJobId, setRenamingJobId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    // 1. Fetch Jobs
    const { data: jobs } = useQuery({
        queryKey: ["project-jobs", projectId],
        queryFn: () => fetchProjectJobs(projectId),
        refetchInterval: (query) => {
            const isActive = (query.state.data as Job[])?.some(j => ["PENDING", "RUNNING"].includes(j.status));
            return isActive ? 2500 : false; // Poll every 2.5s when active, stop otherwise
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (jobId: string) => deleteJob(projectId, jobId, true),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
        },
    });

    const renameMutation = useMutation({
        mutationFn: async ({ jobId, title }: { jobId: string; title: string }) => {
            const res = await fetch(`/api/v1/jobs/${jobId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source_title: title })
            });
            if (!res.ok) throw new Error("Failed to rename");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
            toast.success("Source renamed");
            setRenamingJobId(null);
        },
        onError: () => {
            toast.error("Failed to rename");
        }
    });

    const handleStartRename = (jobId: string, currentTitle: string) => {
        setRenamingJobId(jobId);
        setRenameValue(currentTitle);
    };

    const handleSaveRename = (jobId: string) => {
        if (renameValue.trim()) {
            renameMutation.mutate({ jobId, title: renameValue.trim() });
        }
    };

    const handleCancelRename = () => {
        setRenamingJobId(null);
        setRenameValue("");
    };

    // 2. Group & Filter Logic
    const groupedJobs = useMemo(() => {
        const rawGroups = (jobs || []).reduce((acc, job) => {
            const domain = getDomain(job.params.url);
            if (!acc[domain]) acc[domain] = [];
            acc[domain].push(job);
            return acc;
        }, {} as Record<string, Job[]>);

        // If no search, return raw groups
        if (!searchQuery.trim()) return rawGroups;

        // Filter logic
        const q = searchQuery.toLowerCase();
        const filtered: Record<string, Job[]> = {};

        Object.entries(rawGroups).forEach(([domain, domainJobs]) => {
            // Check if domain matches
            const domainMatches = domain.toLowerCase().includes(q);

            // Check if any page title matches
            const matchingJobs = domainJobs.filter(j => {
                const title = j.result_summary?.source_title || j.params.url;
                return title.toLowerCase().includes(q) || domainMatches;
            });

            if (matchingJobs.length > 0) {
                filtered[domain] = matchingJobs;
            }
        });

        return filtered;
    }, [jobs, searchQuery]);

    // 3. Auto-Expand on Search
    useMemo(() => {
        if (searchQuery.trim()) {
            const allOpen = Object.keys(groupedJobs).reduce((acc, key) => {
                acc[key] = true;
                return acc;
            }, {} as Record<string, boolean>);
            setExpandedDomains(allOpen);
        }
    }, [groupedJobs, searchQuery]);

    const toggleDomain = (domain: string) => {
        setExpandedDomains(prev => ({ ...prev, [domain]: !prev[domain] }));
    };

    // ✅ RESTORED: Reset All Handler
    const handleResetAll = async () => {
        if (!confirm("⚠️ RESET PROJECT: Delete ALL sources and facts? This cannot be undone.")) return;

        try {
            // Use the backend's reset endpoint (properly deletes in correct order)
            await resetProject(projectId);

            queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-facts", projectId] });
            queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
            // Call the parent's onSelect to clear filters if needed
            onSelect(null, null);
            toast.success("Project reset complete");
        } catch (error) {
            console.error("Reset failed:", error);
            toast.error("Failed to reset project");
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header / Search / Settings */}
            <div className="mb-4 flex items-center gap-2 relative shrink-0">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400 dark:text-stone-500" />
                    <Input
                        placeholder="Search sources..."
                        className="h-9 pl-9 text-sm bg-white dark:bg-[#2A2A2A] border-stone-200 dark:border-stone-700 dark:text-stone-100 rounded-lg"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-2.5 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* ✅ IMPROVED: Reset in Dropdown Menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 dark:bg-[#2A2A2A] dark:border-stone-700">
                        <DropdownMenuItem
                            onClick={handleResetAll}
                            className="text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300 focus:bg-red-50 dark:focus:bg-red-950"
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Reset All Sources
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* List */}
            <div data-testid="sources-list" className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-stone-300 dark:scrollbar-thumb-stone-700 scrollbar-track-transparent">
                {Object.entries(groupedJobs).length === 0 && searchQuery && (
                    <div className="text-center py-12 text-sm text-stone-400 dark:text-stone-500">
                        No sources found.
                    </div>
                )}

                {Object.entries(groupedJobs).length === 0 && !searchQuery && (
                    <div data-testid="sources-empty" className="text-center py-16">
                        <Globe className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto mb-3" />
                        <p className="text-sm text-stone-500 dark:text-stone-400 font-medium">No sources yet</p>
                        <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">Add a URL to get started</p>
                    </div>
                )}

                {Object.entries(groupedJobs).map(([domain, domainJobs]) => {
                    const isExpanded = expandedDomains[domain] ?? true;
                    const isDomainSelected = activeFilter.type === "DOMAIN" && activeFilter.value === domain;
                    const isAnyUrlSelected = activeFilter.type === "URL" && domainJobs.some(j => j.params.url === activeFilter.value);

                    const isRunning = domainJobs.some(j => ["PENDING", "RUNNING"].includes(j.status));
                    const failedCount = domainJobs.filter(j => j.status === "FAILED").length;

                    return (
                        <div key={domain} className="rounded-xl bg-surface shadow-xs hover:shadow-sm transition-all overflow-hidden">

                            {/* Domain Header (Compact) */}
                            <div
                                className={cn(
                                    "flex items-center justify-between p-3 cursor-pointer hover:bg-surface-2 transition-colors",
                                    isDomainSelected && "bg-primary/5 ring-1 ring-primary/20",
                                    isAnyUrlSelected && !isDomainSelected && "bg-primary/[0.02]"
                                )}
                                onClick={() => {
                                    toggleDomain(domain);
                                    onSelect("DOMAIN", domain);
                                }}
                            >
                                <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                    <button
                                        className="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 p-0.5 hover:bg-stone-200 dark:hover:bg-stone-700 rounded"
                                        onClick={(e) => { e.stopPropagation(); toggleDomain(domain); }}
                                    >
                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    </button>
                                    <Globe className="w-4 h-4 text-stone-400 dark:text-stone-500 shrink-0" />
                                    <p className={cn("text-sm font-semibold truncate", isDomainSelected ? "text-amber-700 dark:text-amber-400" : "text-[#1F1F1F] dark:text-stone-100")}>
                                        {domain}
                                    </p>
                                    <span className="text-[10px] text-stone-400 dark:text-stone-500 shrink-0">({domainJobs.length})</span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {/* Modern pulse loader instead of spinning circle */}
                                    {isRunning && (
                                        <div className="flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-500 animate-pulse" style={{ animationDelay: '0ms' }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-500 animate-pulse" style={{ animationDelay: '150ms' }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-500 animate-pulse" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    )}
                                    {failedCount > 0 && !isRunning && (
                                        <Badge variant="secondary" className="h-4 px-1.5 bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 text-[9px] hover:bg-red-200 dark:hover:bg-red-900">
                                            {failedCount} err
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            {/* Expanded Pages (Compact) */}
                            {isExpanded && (
                                <div className="bg-surface-2/50">
                                    {domainJobs.map(job => {
                                        const title = job.result_summary?.source_title || job.params.filename || job.params.url;
                                        const status = job.status;
                                        const isUrlSelected = activeFilter.type === "URL" && activeFilter.value === job.params.url;
                                        const isRenaming = renamingJobId === job.id;
                                        const canonicalUrl = job.params?.canonical_url || job.params?.url || "";
                                        const isHighlightPulse = Boolean(highlightCanonicalUrl && canonicalUrl && (canonicalUrl === highlightCanonicalUrl || job.params?.url === highlightCanonicalUrl));

                                        return (
                                            <div
                                                key={job.id}
                                                data-testid={isHighlightPulse ? "source-highlight-pulse" : "source-row"}
                                                data-source-id={job.id}
                                                data-canonical-url={canonicalUrl || undefined}
                                                className={cn(
                                                    "flex items-center justify-between py-2 px-3 pl-8 group transition-colors",
                                                    isUrlSelected ? "bg-primary/10 ring-1 ring-inset ring-primary/20" : "hover:bg-surface-2",
                                                    isHighlightPulse && "animate-pulse ring-1 ring-inset ring-primary/30",
                                                    !isRenaming && "cursor-pointer"
                                                )}
                                                onClick={(e) => {
                                                    if (!isRenaming) {
                                                        e.stopPropagation();
                                                        onSelect("URL", job.params.url);
                                                    }
                                                }}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className={cn("w-3.5 h-3.5 shrink-0", isUrlSelected ? "text-amber-600 dark:text-amber-500" : "text-stone-400 dark:text-stone-500")} />
                                                        {isRenaming ? (
                                                            <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                                                                <Input
                                                                    value={renameValue}
                                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") handleSaveRename(job.id);
                                                                        if (e.key === "Escape") handleCancelRename();
                                                                    }}
                                                                    autoFocus
                                                                    className="h-7 text-sm px-2 bg-white dark:bg-[#2A2A2A] border-stone-300 dark:border-stone-600"
                                                                />
                                                                {renameMutation.isPending && (
                                                                    <Loader2 className="w-3 h-3 animate-spin text-amber-600 dark:text-amber-500" />
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <p
                                                                    className={cn(
                                                                        "text-sm truncate font-medium max-w-[160px]",
                                                                        isUrlSelected ? "text-amber-700 dark:text-amber-400" : "text-stone-600 dark:text-stone-300"
                                                                    )}
                                                                    title={title}
                                                                    onDoubleClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleStartRename(job.id, title);
                                                                    }}
                                                                >
                                                                    {title}
                                                                </p>
                                                                {(() => {
                                                                    const st = job.result_summary?.source_type || job.params?.source_type;
                                                                    if (!st || st === "WEB") return null;
                                                                    const label = st === "REDDIT" ? "Reddit" : st === "YOUTUBE" ? "YouTube" : "Web";
                                                                    return (
                                                                        <Badge
                                                                            variant="secondary"
                                                                            className="h-4 px-1.5 text-[9px] shrink-0"
                                                                            data-testid="source-type-badge"
                                                                            data-source-type={st}
                                                                        >
                                                                            {label}
                                                                        </Badge>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Status Indicator & Actions */}
                                                <div className="flex items-center gap-2">
                                                    {/* Modern Status Indicator with tooltip */}
                                                    {status === "COMPLETED" ? (
                                                        <div className="w-2 h-2 rounded-full bg-emerald-400 dark:bg-emerald-500" title="Completed" />
                                                    ) : status === "FAILED" ? (
                                                        <div
                                                            className="w-2 h-2 rounded-full bg-red-400 dark:bg-red-500 cursor-help"
                                                            title={job.error_message || "Processing failed"}
                                                        />
                                                    ) : (
                                                        <div
                                                            className="flex items-center gap-0.5"
                                                            title={job.current_step || "Processing..."}
                                                        >
                                                            <div className="w-1 h-1 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" style={{ animationDelay: '0ms' }} />
                                                            <div className="w-1 h-1 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" style={{ animationDelay: '150ms' }} />
                                                            <div className="w-1 h-1 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" style={{ animationDelay: '300ms' }} />
                                                        </div>
                                                    )}

                                                    {/* Show current step text for running jobs */}
                                                    {status === "RUNNING" && job.current_step && (
                                                        <span className="text-[9px] text-amber-600 dark:text-amber-500 font-medium max-w-[80px] truncate">
                                                            {job.current_step}
                                                        </span>
                                                    )}

                                                    {/* Show error badge for failed jobs */}
                                                    {status === "FAILED" && (
                                                        <Badge
                                                            variant="secondary"
                                                            className="h-4 px-1.5 bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 text-[9px]"
                                                            title={job.error_message || "Processing failed"}
                                                        >
                                                            Failed
                                                        </Badge>
                                                    )}
                                                </div>

                                                {/* Actions - visible on hover or when renaming */}
                                                {!isRenaming ? (
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md">
                                                                    <MoreHorizontal className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="dark:bg-[#2A2A2A] dark:border-stone-700">
                                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStartRename(job.id, title); }} className="dark:hover:bg-stone-800">
                                                                    <Pencil className="w-3 h-3 mr-2" /> Rename
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem className="text-red-600 dark:text-red-400 dark:hover:bg-red-950" onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (confirm("Delete?")) deleteMutation.mutate(job.id);
                                                                }}>
                                                                    <Trash className="w-3 h-3 mr-2" /> Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                        <kbd className="px-1 bg-muted rounded">Enter</kbd> save · <kbd className="px-1 bg-muted rounded">Esc</kbd> cancel
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

        </div>
    );
}