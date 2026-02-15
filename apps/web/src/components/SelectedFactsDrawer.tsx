"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, X, AlertCircle, CheckCircle2, Eye } from "lucide-react";

export interface SelectedFactItem {
    id: string;
    text: string;
    title: string;
    source_domain?: string;
    review_status?: "PENDING" | "APPROVED" | "NEEDS_REVIEW" | "FLAGGED" | "REJECTED";
}

interface SelectedFactsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: SelectedFactItem[];
    onRemove: (factId: string) => void;
    onGenerate: () => void;
    isGenerating?: boolean;
    /** When true, hide remove and generate (e.g. when opened from OutputDrawer) */
    readOnly?: boolean;
    /** Trust gate: when selection has non-approved facts, allow Remove non-approved, Include anyway, Open review */
    onRemoveNonApproved?: () => void;
    onIncludeAnyway?: () => void;
    onOpenReview?: (factId: string) => void;
}

export function SelectedFactsDrawer({
    open,
    onOpenChange,
    items,
    onRemove,
    onGenerate,
    isGenerating = false,
    readOnly = false,
    onRemoveNonApproved,
    onIncludeAnyway,
    onOpenReview,
}: SelectedFactsDrawerProps) {
    const sourceCount = new Set(items.map((i) => i.source_domain ?? i.title)).size;
    const isMixed = sourceCount > 1;

    const approvedCount = items.filter((i) => i.review_status === "APPROVED").length;
    const needsReviewCount = items.filter((i) => i.review_status === "NEEDS_REVIEW").length;
    const flaggedCount = items.filter((i) => i.review_status === "FLAGGED").length;
    const hasNonApproved = items.some((i) => i.review_status !== "APPROVED");
    const firstNonApprovedId = items.find((i) => i.review_status !== "APPROVED")?.id;

    return (
        <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
            <SheetContent
                data-testid="selected-facts-drawer"
                side="right"
                nonModal
                className="w-[400px] sm:w-[440px] flex flex-col p-0 gap-0"
            >
                <SheetHeader className="px-6 py-4 border-b border-border shrink-0 flex flex-row items-center justify-between space-y-0">
                    <SheetTitle className="text-lg">Selected facts</SheetTitle>
                    <Button
                        data-testid="selected-facts-close"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onOpenChange(false)}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </SheetHeader>
                <div className="p-4 border-b border-border space-y-2 shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span
                            data-testid="selected-facts-count"
                            className="text-sm font-medium text-foreground"
                        >
                            {items.length} fact{items.length !== 1 ? "s" : ""}
                        </span>
                        <span
                            data-testid="selected-facts-source-count"
                            className="text-sm text-muted-foreground"
                        >
                            {sourceCount} source{sourceCount !== 1 ? "s" : ""}
                        </span>
                        {isMixed && (
                            <Badge
                                variant="outline"
                                className="text-[10px] bg-warning/10 text-warning border-warning/30"
                            >
                                Cross-source selection
                            </Badge>
                        )}
                    </div>
                </div>
                <ScrollArea className="flex-1 min-h-0">
                    <ul className="p-4 space-y-2">
                        {items.map((item) => (
                            <li
                                key={item.id}
                                data-testid="selected-facts-item"
                                className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3"
                            >
                                <p className="flex-1 min-w-0 text-sm text-foreground line-clamp-3">
                                    {item.text}
                                </p>
                                {!readOnly && (
                                    <Button
                                        data-testid="selected-facts-remove"
                                        data-fact-id={item.id}
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                        onClick={() => onRemove(item.id)}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                </ScrollArea>
                {!readOnly && (
                    <div className="p-4 border-t border-border shrink-0 space-y-3">
                        {hasNonApproved && items.length >= 2 && onRemoveNonApproved && onIncludeAnyway && (
                            <div data-testid="trust-gate" className="rounded-lg border border-warning/50 bg-warning/10 p-3 space-y-2">
                                <p data-testid="trust-gate-summary" className="text-xs font-medium text-foreground">
                                    {needsReviewCount > 0 && `${needsReviewCount} fact${needsReviewCount !== 1 ? "s" : ""} need review`}
                                    {needsReviewCount > 0 && flaggedCount > 0 && ", "}
                                    {flaggedCount > 0 && `${flaggedCount} flagged`}
                                    {needsReviewCount === 0 && flaggedCount === 0 && "Selected facts include non-approved"}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        data-testid="trust-gate-remove-non-approved"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={onRemoveNonApproved}
                                        disabled={isGenerating || approvedCount < 2}
                                    >
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Remove non-approved
                                    </Button>
                                    <Button
                                        data-testid="trust-gate-include-anyway"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={onIncludeAnyway}
                                        disabled={isGenerating}
                                    >
                                        Include anyway
                                    </Button>
                                    {firstNonApprovedId && onOpenReview && (
                                        <Button
                                            data-testid="trust-gate-open-review"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => onOpenReview(firstNonApprovedId)}
                                        >
                                            <Eye className="w-3 h-3 mr-1" />
                                            Open review
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                        <Button
                            data-testid="selected-facts-generate"
                            className="w-full"
                            onClick={onGenerate}
                            disabled={items.length < 2 || isGenerating}
                        >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
