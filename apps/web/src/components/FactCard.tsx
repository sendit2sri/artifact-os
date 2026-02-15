import { useState, useEffect, useRef } from "react";
import { Fact, updateFact } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Quote, CheckCircle2, AlertTriangle, CheckSquare, Square, Star, Copy, ExternalLink, FileText, Globe, AlertCircle, Flag, X, Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { UndoManager, UndoEntry } from "@/hooks/useUndoManager";

type ReviewStatus = Fact["review_status"];
const HAS_STATUS = ["APPROVED", "NEEDS_REVIEW", "FLAGGED", "REJECTED"] as const;

interface FactCardProps {
    fact: Fact;
    onViewEvidence: (fact: Fact) => void;
    isSelected?: boolean;
    onToggleSelect?: (fact: Fact) => void;
    selectionMode?: boolean;
    /** When fact is suppressed, the canonical fact (for "Duplicate of" line) */
    canonicalFact?: Fact | null;
    /** Optional undo manager for reversible actions */
    undoManager?: UndoManager | null;
    /** When collapse similar is on: callback when user clicks +N similar chip */
    onSimilarChipClick?: (fact: Fact) => void;
}

function statusLabel(s: ReviewStatus): string {
    return s === "APPROVED" ? "Approved" : s === "NEEDS_REVIEW" ? "Needs review" : s === "FLAGGED" ? "Flagged" : s === "REJECTED" ? "Rejected" : "Cleared";
}

function showToastWithUndo(label: string, entry: UndoEntry, undoManager: UndoManager | null | undefined, queryClient: ReturnType<typeof import("@tanstack/react-query").useQueryClient>) {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["project-facts"] });
    const handleUndo = () => {
        if (!undoManager) return;
        undoManager.executeUndo(entry, invalidate, () => {
            toast.error("Failed to undo");
            invalidate();
        });
    };
    if (undoManager) {
        toast.custom((t) => (
            <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-3 shadow-lg">
                <span className="text-sm">{label} •</span>
                <button
                    data-testid="toast-undo"
                    type="button"
                    onClick={() => { handleUndo(); toast.dismiss(t); }}
                    className="text-sm font-medium text-primary hover:underline"
                >
                    Undo
                </button>
            </div>
        ), { duration: 5000 });
    } else {
        toast.success(label, { duration: 5000 });
    }
}

export function FactCard({ fact, onViewEvidence, isSelected, onToggleSelect, selectionMode, canonicalFact, undoManager, onSimilarChipClick }: FactCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedText, setEditedText] = useState(fact.fact_text);
    const [displayStatus, setDisplayStatus] = useState<ReviewStatus>(fact.review_status);
    const previousStatusRef = useRef<ReviewStatus>(fact.review_status);
    const queryClient = useQueryClient();

    useEffect(() => {
        setDisplayStatus(fact.review_status);
    }, [fact.review_status]);

    const updateMutation = useMutation({
        mutationFn: (updates: { fact_text?: string; is_key_claim?: boolean; review_status?: ReviewStatus; is_pinned?: boolean }) => updateFact(fact.id, updates),
        onMutate: async (variables) => {
            if (variables.review_status !== undefined) {
                previousStatusRef.current = displayStatus;
                setDisplayStatus(variables.review_status);
            }
        },
        onSuccess: (_, variables) => {
            setIsEditing(false);
            queryClient.invalidateQueries({ queryKey: ["project-facts"] });
            if (variables.review_status !== undefined) {
                const label = statusLabel(variables.review_status);
                const entry: UndoEntry = { id: fact.id, type: "review_status", before: { review_status: previousStatusRef.current }, after: { review_status: variables.review_status }, ts: Date.now() };
                undoManager?.push(entry);
                showToastWithUndo(label, entry, undoManager, queryClient);
            }
            if (variables.is_pinned !== undefined) {
                const label = variables.is_pinned ? "Pinned" : "Unpinned";
                const entry: UndoEntry = { id: fact.id, type: "pin", before: { is_pinned: !variables.is_pinned }, after: { is_pinned: variables.is_pinned }, ts: Date.now() };
                undoManager?.push(entry);
                showToastWithUndo(label, entry, undoManager, queryClient);
            }
            if (variables.is_key_claim !== undefined) {
                const label = variables.is_key_claim ? "Key claim" : "Key claim removed";
                const entry: UndoEntry = { id: fact.id, type: "key_claim", before: { is_key_claim: !variables.is_key_claim }, after: { is_key_claim: variables.is_key_claim }, ts: Date.now() };
                undoManager?.push(entry);
                showToastWithUndo(label, entry, undoManager, queryClient);
            }
        },
        onError: (_, variables) => {
            if (variables.review_status !== undefined) {
                setDisplayStatus(previousStatusRef.current);
                toast.error("Failed to update status. Please try again.");
            }
        },
    });

    const isHighConfidence = fact.confidence_score > 80;
    const isRejected = displayStatus === "REJECTED";
    const hasReviewStatus = HAS_STATUS.includes(displayStatus as typeof HAS_STATUS[number]);
    const isStatusLoading = updateMutation.isPending;
    
    const copyToClipboard = () => {
        navigator.clipboard.writeText(fact.fact_text);
        toast.success("Copied to clipboard");
    };

    return (
        <div
            data-testid="fact-card"
            data-fact-id={fact.id}
            data-pinned={fact.is_pinned ? "true" : "false"}
            className={cn(
                "group relative flex items-center gap-4 px-4 py-3 bg-surface transition-all cursor-pointer rounded-lg mb-2",
                "hover:bg-fact-hover hover:shadow-sm",
                isSelected && "bg-fact-selected shadow-sm ring-2 ring-primary/20",
                isRejected && "opacity-50 hover:opacity-100"
            )}
            onClick={() => !isEditing && onToggleSelect?.(fact)}
        >
            {/* LEFT: Source Icon + Confidence Dot */}
            <div className="flex items-center gap-3 shrink-0">
                {/* Checkbox */}
                <button
                    data-testid="fact-select-button"
                    onClick={(e) => { e.stopPropagation(); onToggleSelect?.(fact); }}
                    className={cn(
                        "text-faint-foreground hover:text-muted-foreground transition-colors",
                        isSelected && "text-primary",
                        !isSelected && !selectionMode && "opacity-0 group-hover:opacity-100"
                    )}
                >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>

                {/* Source Icon + Domain */}
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-muted">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground/80 truncate max-w-[120px]" title={fact.source_domain}>
                            {fact.source_domain}
                        </span>
                        {/* Confidence Dot */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isHighConfidence 
                                    ? "bg-success" 
                                    : "bg-warning"
                            )} />
                            <span className={cn(
                                "text-[10px] font-medium",
                                isHighConfidence 
                                    ? "text-success" 
                                    : "text-warning"
                            )}>
                                {isHighConfidence ? "High" : "Low"} conf
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* CENTER: Fact Text */}
            <div className="flex-1 min-w-0 px-2">
                {isEditing ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <Textarea
                            value={editedText}
                            onChange={(e) => setEditedText(e.target.value)}
                            className="w-full text-sm min-h-[60px] bg-surface border-border"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <Button 
                                size="sm" 
                                className="h-7 text-xs px-3" 
                                onClick={() => updateMutation.mutate({ fact_text: editedText })}
                            >
                                Save
                            </Button>
                            <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 text-xs px-3" 
                                onClick={() => setIsEditing(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                        {fact.is_suppressed && (
                            <div data-testid="fact-duplicate-badge" className="text-[10px] text-muted-foreground mb-1">
                                Duplicate of {canonicalFact ? (canonicalFact.fact_text.slice(0, 60) + (canonicalFact.fact_text.length > 60 ? "…" : "")) : "another fact"}
                            </div>
                        )}
                        {fact.collapsed_count != null && fact.collapsed_count > 1 && fact.group_id && (
                            <button
                                data-testid="fact-similar-chip"
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onSimilarChipClick?.(fact); }}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors mt-1 inline-block"
                            >
                                +{fact.collapsed_count - 1} similar
                            </button>
                        )}
                        <p
                            className={cn(
                                "text-sm leading-relaxed text-foreground",
                                isRejected && "line-through text-muted-foreground"
                            )}
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                            title="Click to edit"
                        >
                            {fact.fact_text}
                        </p>
                        {(() => {
                            const ctx = fact.section_context;
                            if (!ctx) return null;
                            if (ctx === "reddit:op") {
                                return (
                                    <span data-testid="fact-context-chip" className="inline-block text-[10px] text-muted-foreground mt-1 px-1.5 py-0.5 rounded bg-muted/60">
                                        OP
                                    </span>
                                );
                            }
                            if (ctx.startsWith("reddit:comment:")) {
                                return (
                                    <span data-testid="fact-context-chip" className="inline-block text-[10px] text-muted-foreground mt-1 px-1.5 py-0.5 rounded bg-muted/60">
                                        Comment
                                    </span>
                                );
                            }
                            if (ctx.startsWith("yt:")) {
                                const m = ctx.match(/yt:(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
                                const start = m ? parseFloat(m[1]) : 0;
                                const end = m ? parseFloat(m[2]) : 0;
                                const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
                                return (
                                    <span data-testid="fact-context-chip" className="inline-block text-[10px] text-muted-foreground mt-1 px-1.5 py-0.5 rounded bg-muted/60">
                                        Transcript {fmt(start)}–{fmt(end)}
                                    </span>
                                );
                            }
                            return null;
                        })()}
                    </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Review Status Badge (compact pill) */}
                            {hasReviewStatus && (
                                <span data-testid="fact-status-badge">
                                    {displayStatus === "NEEDS_REVIEW" && (
                                        <Badge
                                            variant="secondary"
                                            className="bg-warning/10 text-warning text-[10px] px-2 py-0.5 border-warning/30"
                                        >
                                            <AlertCircle className="w-2.5 h-2.5 mr-1" />
                                            Needs Review
                                        </Badge>
                                    )}
                                    {displayStatus === "APPROVED" && (
                                        <Badge
                                            variant="secondary"
                                            className="bg-success/10 text-success text-[10px] px-2 py-0.5 border-success/30"
                                        >
                                            <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                                            Approved
                                        </Badge>
                                    )}
                                    {displayStatus === "FLAGGED" && (
                                        <Badge
                                            variant="secondary"
                                            className="bg-danger/10 text-danger text-[10px] px-2 py-0.5 border-danger/30"
                                        >
                                            <Flag className="w-2.5 h-2.5 mr-1" />
                                            Flagged
                                        </Badge>
                                    )}
                                    {displayStatus === "REJECTED" && (
                                        <Badge
                                            variant="secondary"
                                            className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5"
                                        >
                                            <X className="w-2.5 h-2.5 mr-1" />
                                            Rejected
                                        </Badge>
                                    )}
                                </span>
                            )}
                            {/* Key Claim Badge */}
                            {fact.is_key_claim && (
                                <Badge 
                                    variant="secondary" 
                                    className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 border-0"
                                >
                                    <Star className="w-2.5 h-2.5 mr-1 fill-current" />
                                    Key
                                </Badge>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT: Quick Actions */}
            <div 
                className={cn(
                    "flex items-center gap-1 shrink-0 transition-opacity",
                    !isEditing && !isSelected && "opacity-0 group-hover:opacity-100"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                data-testid="fact-pin-toggle"
                                data-pinned={fact.is_pinned ? "true" : "false"}
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    fact.is_pinned ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                                disabled={updateMutation.isPending}
                                onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ is_pinned: !fact.is_pinned }); }}
                            >
                                {fact.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{fact.is_pinned ? "Unpin fact" : "Pin fact"}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <span data-testid="fact-pin-state" data-pinned={fact.is_pinned ? "true" : "false"} aria-hidden className="sr-only" />

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                data-testid="evidence-open"
                                data-fact-id={fact.id}
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => onViewEvidence(fact)}
                            >
                                <Quote className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>View Evidence</TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                onClick={copyToClipboard}
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy</TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    fact.is_key_claim 
                                        ? "text-primary hover:text-primary/80 hover:bg-primary/10" 
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                                onClick={() => updateMutation.mutate({ is_key_claim: !fact.is_key_claim })}
                            >
                                <Star className={cn("w-4 h-4", fact.is_key_claim && "fill-current")} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {fact.is_key_claim ? "Remove from Key Claims" : "Mark as Key Claim"}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                asChild
                            >
                                <a href={fact.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open Source</TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                {/* Review Status Actions */}
                <div className="h-6 w-px bg-border mx-1" />

                {hasReviewStatus && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    data-testid="fact-clear-status"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                    disabled={isStatusLoading}
                                    onClick={() => updateMutation.mutate({ review_status: "PENDING" })}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Clear status</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                data-testid="fact-approve"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    displayStatus === "APPROVED"
                                        ? "text-success hover:text-success/80 hover:bg-success/10"
                                        : "text-muted-foreground hover:text-success hover:bg-success/10"
                                )}
                                disabled={isStatusLoading}
                                onClick={() => updateMutation.mutate({ review_status: "APPROVED" })}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Approve</TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                data-testid="fact-needs-review"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    displayStatus === "NEEDS_REVIEW"
                                        ? "text-warning hover:text-warning/80 hover:bg-warning/10"
                                        : "text-muted-foreground hover:text-warning hover:bg-warning/10"
                                )}
                                disabled={isStatusLoading}
                                onClick={() => updateMutation.mutate({ review_status: "NEEDS_REVIEW" })}
                            >
                                <AlertCircle className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Mark Needs Review</TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                data-testid="fact-flag"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    displayStatus === "FLAGGED"
                                        ? "text-danger hover:text-danger/80 hover:bg-danger/10"
                                        : "text-muted-foreground hover:text-danger hover:bg-danger/10"
                                )}
                                disabled={isStatusLoading}
                                onClick={() => updateMutation.mutate({ review_status: "FLAGGED" })}
                            >
                                <Flag className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Flag for Review</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    );
}