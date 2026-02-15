"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Copy, Download, Sparkles, X, ArrowLeft, Pin, PinOff, Focus, Loader2, RefreshCw, Share2, ExternalLink, ChevronDown, ChevronRight, BookOpen, History } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Output, fetchProjectFacts, Fact, fetchOutputEvidenceMap, OutputEvidenceMapFact } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { OutputQualityBanner } from "@/components/OutputQualityBanner";
import { toast } from "sonner";

function parseSections(content: string): { index: number; title: string; text: string }[] {
    if (typeof content !== "string" || !content) return [];
    const sections: { index: number; title: string; text: string }[] = [];
    const parts = content.split(/\r?\n(?=## Section \d+:)/);
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const match = trimmed.match(/^## Section (\d+):\s*(.+?)(?:\n|$)/);
        if (match) {
            const num = parseInt(match[1], 10);
            const title = match[2].trim();
            sections.push({ index: num, title, text: trimmed });
        }
    }
    return sections.length > 0 ? sections : [];
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    output: Output | null;
    openedFromHistory?: boolean;
    onBackToHistory?: () => void;
    pinned?: boolean;
    onPinChange?: (pinned: boolean) => void;
    /** Pin this output to history (show in Pinned section) */
    outputPinned?: boolean;
    onOutputPinChange?: (pinned: boolean) => void;
    focusMode?: boolean;
    onFocusChange?: (enabled: boolean) => void;
    onRegenerate?: () => void;
    isRegenerating?: boolean;
    /** Open the Selected Facts drawer (read-only view of facts used for this output) */
    onViewSelectedFacts?: () => void;
    /** Project ID for provenance export (fetches facts + sources) */
    projectId?: string;
    /** Open Evidence panel to the given fact (from Evidence Map "View evidence") */
    onOpenEvidenceForFact?: (factId: string, evidenceMapFact: OutputEvidenceMapFact) => void;
    /** Quality actions: review issues (open queue), regenerate from approved only, repick */
    onReviewIssues?: () => void;
    onRegenerateApprovedOnly?: () => void;
    onOpenRepick?: () => void;
    /** Open Synthesis History drawer (used when output drawer covers the main History button) */
    onOpenHistory?: () => void;
}

const MODE_TITLES: Record<string, string> = {
    paragraph: "Paragraph",
    research_brief: "Research Brief",
    script_outline: "Script Outline",
    split: "Split Sections",
    split_sections: "Split Sections",
};

export function OutputDrawer({ open, onOpenChange, output, openedFromHistory, onBackToHistory, pinned = false, onPinChange, outputPinned = false, onOutputPinChange, focusMode = false, onFocusChange, onRegenerate, isRegenerating = false, onViewSelectedFacts, projectId, onOpenEvidenceForFact, onReviewIssues, onRegenerateApprovedOnly, onOpenRepick, onOpenHistory }: Props) {
    const contentScrollRef = useRef<HTMLDivElement>(null);
    const [evidenceMap, setEvidenceMap] = useState<{ facts: OutputEvidenceMapFact[]; sources: { domain: string; url: string; source_type?: string | null }[] } | null>(null);
    const [evidenceMapLoading, setEvidenceMapLoading] = useState(false);
    const [evidenceMapOpen, setEvidenceMapOpen] = useState(true);
    const [provenanceLoading, setProvenanceLoading] = useState(false);
    const [provenanceFilename, setProvenanceFilename] = useState<string | null>(null);

    const hasOutput = Boolean(output);
    const safe = output ?? ({
        id: "",
        project_id: "",
        title: "",
        content: "",
        mode: "paragraph",
        output_type: "paragraph",
        fact_ids: [],
        source_count: 0,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
    } as Output);

    useEffect(() => {
        if (!open || !output?.id || !(output.fact_ids?.length)) {
            setEvidenceMap(null);
            return;
        }
        let cancelled = false;
        setEvidenceMapLoading(true);
        fetchOutputEvidenceMap(output.id)
            .then((res) => {
                if (!cancelled) {
                    setEvidenceMap({ facts: res.facts, sources: res.sources });
                }
            })
            .catch(() => {
                if (!cancelled) setEvidenceMap(null);
            })
            .finally(() => {
                if (!cancelled) setEvidenceMapLoading(false);
            });
        return () => { cancelled = true; };
    }, [open, output?.id, output?.fact_ids?.length]);

    const titleLabel = MODE_TITLES[safe.mode] || MODE_TITLES[safe.output_type] || safe.title;
    const isSplitMode = safe.mode === "split" || safe.mode === "split_sections";
    const sections = useMemo(() => (isSplitMode ? parseSections(safe.content) : []), [isSplitMode, safe.content]);

    if (!hasOutput) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(output.content);
        toast.success("Copied to clipboard");
    };

    const handleCopySection = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Section copied to clipboard");
    };

    const scrollToSection = (sectionId: string) => {
        const el = contentScrollRef.current?.querySelector(`#${sectionId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const handleDownload = () => {
        const blob = new Blob([output.content], { type: "text/markdown;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${output.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
        link.click();
    };

    const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/output/${output.id}` : "";
    const handleShare = () => {
        if (shareUrl) {
            navigator.clipboard.writeText(shareUrl);
            toast.success("Share link copied to clipboard");
        }
    };

    const buildProvenanceMarkdown = (factsMap: Map<string, Fact>): string => {
        const facts = (output.fact_ids ?? [])
            .map((id) => factsMap.get(id))
            .filter((f): f is Fact => !!f);
        const sources = new Map<string, string>();
        for (const f of facts) {
            if (f.source_domain && f.source_url) sources.set(f.source_domain, f.source_url);
        }
        const lines: string[] = [];
        lines.push(`# ${output.title}`);
        lines.push("");
        lines.push(`- **Mode:** ${MODE_TITLES[output.mode] || output.mode}`);
        lines.push(`- **Created:** ${new Date(output.created_at).toLocaleString()}`);
        if (output.quality_stats) {
            const q = output.quality_stats;
            lines.push(`- **Quality:** ${q.approved} approved, ${q.needs_review} needs_review, ${q.flagged} flagged, ${q.rejected} rejected, ${q.pinned} pinned`);
        }
        lines.push(`- **Sources:** ${output.source_count}`);
        lines.push("");
        lines.push("## Synthesis");
        lines.push("");
        lines.push(output.content);
        lines.push("");
        lines.push("## Facts Used");
        lines.push("");
        for (const f of facts) {
            const status = f.review_status ? ` [${f.review_status}]` : "";
            const pinned = f.is_pinned ? " [pinned]" : "";
            lines.push(`- ${f.fact_text}${status}${pinned}`);
        }
        lines.push("");
        lines.push("## Sources");
        lines.push("");
        for (const [domain, url] of sources) {
            lines.push(`- **${domain}:** ${url}`);
        }
        return lines.join("\n");
    };

    const handleExportProvenance = async () => {
        const pid = projectId ?? output.project_id;
        if (!pid) {
            toast.error("Project context required for provenance export");
            return;
        }
        setProvenanceLoading(true);
        setProvenanceFilename(null);
        try {
            const raw = await fetchProjectFacts(pid, { filter: "all" });
            const items = Array.isArray(raw) ? raw : raw.items;
            const factsMap = new Map<string, Fact>(items.map((f) => [f.id, f]));
            const md = buildProvenanceMarkdown(factsMap);
            const slug = output.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
            const filename = `${slug}_provenance.md`;
            setProvenanceFilename(filename);
            const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            toast.success("Provenance exported");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Export failed");
        } finally {
            setProvenanceLoading(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
            <SheetContent
                data-testid="output-drawer"
                role="dialog"
                side="right"
                nonModal
                className="w-[600px] sm:w-[700px] flex flex-col p-0 gap-0 shadow-2xl border-l border-border bg-surface"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm flex justify-between items-start shrink-0">
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                        {openedFromHistory && onBackToHistory && (
                            <Button
                                data-testid="output-drawer-back-to-history"
                                variant="ghost"
                                size="sm"
                                className="w-fit -ml-2 text-muted-foreground hover:text-foreground"
                                onClick={onBackToHistory}
                            >
                                <ArrowLeft className="w-4 h-4 mr-1" />
                                Back to History
                            </Button>
                        )}
                        <SheetTitle className="flex items-center gap-2 text-foreground text-lg" data-testid="output-drawer-title">
                            <Sparkles className="w-5 h-5 text-primary" />
                            <span className="truncate">{titleLabel}</span>
                        </SheetTitle>
                        <div data-testid="output-drawer-meta" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span data-testid="output-drawer-meta-facts">{output.fact_ids.length} facts</span>
                            <span data-testid="output-drawer-meta-sources">{output.source_count} sources</span>
                            {output.quality_stats && (
                                <span data-testid="output-quality-stats" className="flex items-center gap-1.5 flex-wrap">
                                    Used: {output.quality_stats.total} facts (
                                    <span data-testid="output-quality-approved">{output.quality_stats.approved}</span> approved
                                    <> · <span data-testid="output-quality-needs_review">{output.quality_stats.needs_review}</span> needs review</>
                                    <> · <span data-testid="output-quality-flagged">{output.quality_stats.flagged}</span> flagged</>
                                    {output.quality_stats.rejected > 0 && (
                                        <> · <span data-testid="output-quality-rejected">{output.quality_stats.rejected}</span> rejected</>
                                    )}
                                    )
                                    {output.quality_stats.pinned > 0 && (
                                        <>
                                            · <span data-testid="output-quality-pinned">Pinned used: {output.quality_stats.pinned}</span>
                                        </>
                                    )}
                                </span>
                            )}
                            <span>·</span>
                            <span>{new Date(output.created_at).toLocaleDateString()}</span>
                            {onViewSelectedFacts && (
                                <>
                                    <span>·</span>
                                    <button
                                        type="button"
                                        data-testid="output-drawer-view-selected-facts"
                                        className="text-primary hover:underline"
                                        onClick={onViewSelectedFacts}
                                    >
                                        View selected facts
                                    </button>
                                </>
                            )}
                        </div>
                        {output.quality_stats && (
                            <div className="mt-3">
                                <OutputQualityBanner
                                    output={output}
                                    mode="project"
                                    onReviewIssues={onReviewIssues}
                                    onRegenerateApprovedOnly={onRegenerateApprovedOnly}
                                    onOpenRepick={onOpenRepick}
                                    isRegenerating={isRegenerating}
                                />
                            </div>
                        )}
                    </div>
                    {onOutputPinChange && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        data-testid="output-pin-toggle"
                                        data-pinned={outputPinned ? "true" : "false"}
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                        onClick={() => onOutputPinChange(!outputPinned)}
                                    >
                                        {outputPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{outputPinned ? "Unpin from history" : "Pin to history"}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {onPinChange && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        data-testid="output-drawer-pin"
                                        data-pinned={pinned ? "true" : "false"}
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                        onClick={() => onPinChange(!pinned)}
                                    >
                                        {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{pinned ? "Unpin panel" : "Pin panel"}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {onFocusChange && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        data-testid="output-drawer-focus-toggle"
                                        variant="ghost"
                                        size="icon"
                                        className={`h-8 w-8 shrink-0 ${focusMode ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                                        onClick={() => onFocusChange(!focusMode)}
                                    >
                                        <Focus className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{focusMode ? "Exit focus mode" : "Focus mode"}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {onOpenHistory && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        data-testid="output-drawer-open-history"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                        onClick={onOpenHistory}
                                    >
                                        <History className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Open synthesis history</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>

                {/* Content */}
                <ScrollArea className="flex-1 bg-surface">
                    <div className="p-8 md:p-12" ref={contentScrollRef}>
                        {/* Evidence Map (collapsible) */}
                        {(output.fact_ids?.length ?? 0) > 0 && (
                            <Collapsible open={evidenceMapOpen} onOpenChange={setEvidenceMapOpen} className="mb-6">
                                <div data-testid="output-evidence-map" className="border border-border rounded-lg bg-muted/30 overflow-hidden">
                                    <CollapsibleTrigger asChild>
                                        <button
                                            type="button"
                                            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                                        >
                                            <span className="flex items-center gap-2">
                                                {evidenceMapOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                Evidence Map ({evidenceMapLoading ? "…" : (evidenceMap?.facts?.length ?? output.fact_ids?.length ?? 0)} facts)
                                            </span>
                                        </button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <div className="px-4 pb-4 pt-0 border-t border-border">
                                            {evidenceMapLoading ? (
                                                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Loading evidence map…
                                                </div>
                                            ) : evidenceMap?.facts?.length ? (
                                                <ul className="space-y-3">
                                                    {evidenceMap.facts.map((f) => (
                                                        <li
                                                            key={f.id}
                                                            data-testid="output-evidence-item"
                                                            className="rounded-md border border-border bg-background/80 p-3 space-y-2"
                                                        >
                                                            <p className="text-sm text-foreground line-clamp-2 leading-relaxed">
                                                                {f.fact_text}
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <Badge variant="secondary" className="text-[10px] font-normal">
                                                                    {f.review_status}
                                                                </Badge>
                                                                {f.is_pinned && (
                                                                    <Badge variant="outline" className="text-[10px] font-normal">
                                                                        Pinned
                                                                    </Badge>
                                                                )}
                                                                {f.is_key_claim && (
                                                                    <Badge variant="outline" className="text-[10px] font-normal">
                                                                        Key claim
                                                                    </Badge>
                                                                )}
                                                                {f.source_type && (
                                                                    <Badge variant="outline" className="text-[10px] font-normal">
                                                                        {f.source_type}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {onOpenEvidenceForFact && (
                                                                <Button
                                                                    data-testid="output-evidence-open"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-8 text-xs mt-1"
                                                                    onClick={() => onOpenEvidenceForFact(f.id, f)}
                                                                >
                                                                    <BookOpen className="w-3 h-3 mr-1.5" />
                                                                    View evidence
                                                                </Button>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="py-2 text-sm text-muted-foreground">No evidence map data.</p>
                                            )}
                                        </div>
                                    </CollapsibleContent>
                                </div>
                            </Collapsible>
                        )}
                        {sections.length > 0 && (
                            <div data-testid="output-sections-index" className="mb-6 pb-4 border-b border-border">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Sections</p>
                                <ul className="space-y-1.5">
                                    {sections.map((s) => (
                                        <li key={s.index} data-testid="output-section-item" className="flex items-center justify-between gap-2">
                                            <button
                                                type="button"
                                                className="text-sm text-primary hover:underline text-left truncate flex-1 min-w-0"
                                                onClick={() => scrollToSection(`output-section-${s.index}`)}
                                            >
                                                Section {s.index}: {s.title}
                                            </button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-xs shrink-0"
                                                data-testid="output-section-copy"
                                                onClick={() => handleCopySection(s.text)}
                                            >
                                                <Copy className="w-3 h-3 mr-1" />
                                                Copy section
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <div
                            className="prose prose-slate dark:prose-invert prose-lg max-w-none leading-relaxed"
                            style={{
                                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                                lineHeight: "1.75"
                            }}
                        >
                            {sections.length > 0 ? (
                                <div data-testid="output-drawer-content">
                                    {sections.map((s) => (
                                        <div key={s.index} id={`output-section-${s.index}`} className="output-section-block">
                                            <pre className="whitespace-pre-wrap font-sans text-base text-foreground leading-relaxed">
                                                {s.text}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <pre
                                    data-testid="output-drawer-content"
                                    className="whitespace-pre-wrap font-sans text-base text-foreground leading-relaxed"
                                >
                                    {output.content}
                                </pre>
                            )}
                        </div>
                    </div>
                </ScrollArea>

                {/* Footer Actions */}
                <div className="p-4 border-t border-border bg-surface-2/50 backdrop-blur-sm flex items-center gap-2 shrink-0 flex-wrap">
                    <Button
                        data-testid="output-drawer-share"
                        variant="outline"
                        onClick={handleShare}
                        className="flex-1"
                    >
                        <Share2 className="w-4 h-4 mr-2" />
                        Share
                    </Button>
                    {shareUrl && (
                        <Button
                            data-testid="output-drawer-open-share"
                            variant="outline"
                            asChild
                            className="flex-1"
                        >
                            <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Open share page
                            </a>
                        </Button>
                    )}
                    {onRegenerate && (
                        <Button
                            data-testid="output-drawer-regenerate"
                            variant="outline"
                            onClick={onRegenerate}
                            disabled={isRegenerating}
                            className="flex-1"
                        >
                            {isRegenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                            Regenerate
                        </Button>
                    )}
                    <Button
                        data-testid="output-drawer-copy"
                        variant="outline"
                        onClick={handleCopy}
                        className="flex-1"
                    >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                    </Button>
                    <Button
                        data-testid="output-drawer-download"
                        variant="outline"
                        onClick={handleDownload}
                        className="flex-1"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                    </Button>
                    {projectId && (
                        <Button
                            data-testid="output-export-provenance"
                            variant="outline"
                            onClick={handleExportProvenance}
                            disabled={provenanceLoading}
                            className="flex-1"
                            title="Export with Facts Used + Sources"
                        >
                            {provenanceLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Export with provenance
                        </Button>
                    )}
                    {provenanceFilename && (
                        <span data-testid="output-export-provenance-filename-preview" className="sr-only">
                            {provenanceFilename}
                        </span>
                    )}
                    <Button
                        data-testid="output-drawer-close"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
