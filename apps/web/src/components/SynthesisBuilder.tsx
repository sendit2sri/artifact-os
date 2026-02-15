"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Trash2, X, EyeOff, CheckCircle2, Split, Merge, AlertCircle } from "lucide-react";
import { analyzeFacts } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface FactInput {
    id: string;
    text: string;
    title: string;
    source_domain: string;
    url: string;
}

interface Cluster {
    label: string;
    fact_ids: string[]; // ✅ Using real IDs
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedFacts: FactInput[];
    onRemoveFact: (id: string) => void;
    onClear: () => void;
    onGenerate: (mode: "merge" | "split", finalFactIds: string[]) => void;
    projectId: string;
}

export function SynthesisBuilder({ open, onOpenChange, selectedFacts, onRemoveFact, onClear, onGenerate, projectId }: Props) {
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [loading, setLoading] = useState(false);
    const [excludedClusterLabels, setExcludedClusterLabels] = useState<Set<string>>(new Set());

    const abortControllerRef = useRef<AbortController | null>(null);

    // 1. Debounced Analysis with Stale Protection
    useEffect(() => {
        if (!open || selectedFacts.length === 0) {
            setClusters([]);
            return;
        }

        const runAnalysis = async () => {
            // Cancel previous request
            if (abortControllerRef.current) abortControllerRef.current.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;

            setLoading(true);
            try {
                // ✅ Send Rich Payload with IDs
                const payload = selectedFacts.map(f => ({
                    id: f.id,
                    text: f.text,
                    title: f.title,
                    url: f.url,
                    section: ""
                }));

                const result = await analyzeFacts(projectId, payload, controller.signal);
                if (!controller.signal.aborted) {
                    setClusters(result.clusters);
                }
            } catch (e: any) {
                if (e.name !== "AbortError") {
                    console.error(e);
                    toast.error("Analysis paused. Showing list view.");
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        const timer = setTimeout(runAnalysis, 400); // Debounce
        return () => {
            clearTimeout(timer);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, [selectedFacts, projectId, open]);

    // 2. Exclude Logic
    const toggleExcludeCluster = (label: string) => {
        const next = new Set(excludedClusterLabels);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        setExcludedClusterLabels(next);
    };

    // 3. Truth Source: Map Facts to Exclusions via IDs
    const activeFactIds = useMemo(() => {
        // Start empty
        const active = new Set<string>();

        // If we have clusters, use them as the primary map
        const clusteredIds = new Set<string>();

        if (clusters.length > 0) {
            clusters.forEach(c => {
                if (!excludedClusterLabels.has(c.label)) {
                    c.fact_ids.forEach(id => {
                        active.add(id);
                        clusteredIds.add(id);
                    });
                }
            });
        } else if (!loading) {
            // Fallback if no clusters (single topic or analysis failed) -> All active
            selectedFacts.forEach(f => active.add(f.id));
        }

        // Safety: Add back any selected facts that weren't returned in clusters (orphans)
        // unless explicitly excluded by logic. For now, we assume analysis covers all.
        // If analysis is pending, we might show all or none. Let's show all if loading initially.
        if (loading && clusters.length === 0) {
            selectedFacts.forEach(f => active.add(f.id));
        }

        return active;
    }, [selectedFacts, clusters, excludedClusterLabels, loading]);

    const handleGenerate = (mode: "merge" | "split") => {
        if (activeFactIds.size < 2) {
            toast.error("Select at least 2 facts (check exclusions)");
            return;
        }
        onGenerate(mode, Array.from(activeFactIds));
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
            <SheetContent
                data-testid="synthesis-builder"
                nonModal
                className="w-[400px] sm:w-[600px] flex flex-col p-0 gap-0 shadow-2xl border-l border-stone-200 dark:border-stone-700 bg-white dark:bg-[#2A2A2A] z-[100]"
                onPointerDownOutside={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
            >

                {/* Header */}
                <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-800/80 backdrop-blur supports-[backdrop-filter]:bg-stone-50/50 dark:supports-[backdrop-filter]:bg-stone-800/50 flex justify-between items-start">
                    <div>
                        <SheetTitle className="flex items-center gap-2 text-[#1F1F1F] dark:text-stone-100">
                            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                            Synthesis Builder
                        </SheetTitle>
                        <SheetDescription className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                            {selectedFacts.length} facts selected. Review structure before generating.
                        </SheetDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950" onClick={onClear}>
                        Clear All
                    </Button>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                    {/* 1. Cluster Chips (Interactive) */}
                    <div className="px-6 py-4 bg-white dark:bg-[#2A2A2A] border-b border-stone-200 dark:border-stone-700 shrink-0 transition-all">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-[11px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider flex items-center gap-2">
                                Topic Clusters
                                {loading && <Loader2 className="w-3 h-3 animate-spin text-stone-400 dark:text-stone-500" />}
                            </h4>
                        </div>

                        {clusters.length === 0 && !loading ? (
                            <div className="text-xs text-stone-400 dark:text-stone-500 italic">Single topic detected...</div>
                        ) : (
                            <div className="flex flex-wrap gap-2 animate-in fade-in duration-300">
                                {clusters.map((c, i) => {
                                    const isExcluded = excludedClusterLabels.has(c.label);
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => toggleExcludeCluster(c.label)}
                                            className={cn(
                                                "group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all border select-none",
                                                isExcluded
                                                    ? "bg-stone-50 dark:bg-stone-800 text-stone-400 dark:text-stone-500 border-stone-200 dark:border-stone-700 line-through opacity-70 hover:opacity-100"
                                                    : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/60 shadow-sm"
                                            )}
                                            title={isExcluded ? "Click to Include" : "Click to Exclude from generation"}
                                        >
                                            <span className="max-w-[150px] truncate font-medium">{c.label}</span>
                                            <span className={cn(
                                                "px-1.5 rounded-full text-[10px] min-w-[1.25rem] text-center",
                                                isExcluded ? "bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400" : "bg-amber-200/50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300"
                                            )}>
                                                {c.fact_ids.length}
                                            </span>
                                            {isExcluded ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3 opacity-0 group-hover:opacity-50" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 2. Fact List (Live Feedback) */}
                    <ScrollArea className="flex-1 bg-stone-50/30 dark:bg-stone-900/20">
                        <div className="p-6 space-y-3">
                            {selectedFacts.map(f => {
                                // Check if active
                                const isExcluded = !activeFactIds.has(f.id);
                                return (
                                    <div
                                        key={f.id}
                                        className={cn(
                                            "group relative flex gap-3 items-start p-3 rounded border transition-all duration-200",
                                            isExcluded
                                                ? "bg-stone-100/50 dark:bg-stone-800/30 border-stone-100 dark:border-stone-800 text-stone-400 dark:text-stone-500"
                                                : "bg-white dark:bg-[#2A2A2A] border-stone-200 dark:border-stone-700 shadow-sm hover:border-amber-300 dark:hover:border-amber-700"
                                        )}
                                    >
                                        <div className="flex-1 space-y-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className={cn(
                                                    "text-[10px] px-1.5 h-5 font-normal border-0 max-w-[120px] truncate",
                                                    isExcluded ? "bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400" : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                                                )}>
                                                    {f.source_domain}
                                                </Badge>
                                                {isExcluded && <span className="text-[10px] font-medium text-red-400 dark:text-red-500 flex items-center gap-1 animate-in fade-in"><EyeOff className="w-3 h-3" /> Excluded</span>}
                                            </div>
                                            <p className={cn("text-sm line-clamp-2 leading-relaxed font-serif", isExcluded ? "text-stone-400 dark:text-stone-500" : "text-stone-800 dark:text-stone-200")}>
                                                {f.text}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-stone-300 dark:text-stone-600 hover:text-red-500 dark:hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => { e.stopPropagation(); onRemoveFact(f.id); }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                            {selectedFacts.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-10 text-stone-400 dark:text-stone-500 text-sm gap-2">
                                    <AlertCircle className="w-6 h-6 opacity-50" />
                                    <p>No facts selected.</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-stone-200 dark:border-stone-700 bg-white dark:bg-[#2A2A2A] space-y-2 shrink-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.2)]">
                    <Button
                        data-testid="synthesis-builder-generate-split"
                        className={cn("w-full justify-between h-11 bg-[#1F1F1F] dark:bg-stone-100 text-white dark:text-[#1F1F1F] hover:bg-[#2F2F2F] dark:hover:bg-stone-200", activeFactIds.size < 2 && "opacity-50")}
                        onClick={() => handleGenerate("split")}
                        disabled={activeFactIds.size < 2 || loading}
                    >
                        <span className="flex items-center gap-2">
                            <Split className="w-4 h-4" /> Generate Separate Sections
                        </span>
                        <Badge variant="secondary" className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 border-0">
                            Recommended
                        </Badge>
                    </Button>

                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            data-testid="synthesis-builder-generate-merge"
                            variant="outline"
                            className="justify-start text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"
                            onClick={() => handleGenerate("merge")}
                            disabled={activeFactIds.size < 2 || loading}
                        >
                            <Merge className="w-4 h-4 mr-2" /> Combine All
                        </Button>
                        <Button
                            data-testid="synthesis-builder-close"
                            variant="ghost"
                            className="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
                            onClick={() => onOpenChange(false)}
                        >
                            Close
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}