import { useState } from "react";
import { Fact, updateFact } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Quote, CheckCircle2, AlertTriangle, CheckSquare, Square, Star, Copy, ExternalLink, FileText, Globe, AlertCircle, Flag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

// ✅ Fix: Define Type locally to avoid import error
type ReviewStatus = Fact['review_status'];

interface FactCardProps {
    fact: Fact;
    onViewEvidence: (fact: Fact) => void;
    isSelected?: boolean;
    onToggleSelect?: (fact: Fact) => void;
    selectionMode?: boolean;
}

export function FactCard({ fact, onViewEvidence, isSelected, onToggleSelect, selectionMode }: FactCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedText, setEditedText] = useState(fact.fact_text);
    const queryClient = useQueryClient();

    const updateMutation = useMutation({
        mutationFn: (updates: { fact_text?: string; is_key_claim?: boolean; review_status?: ReviewStatus }) => updateFact(fact.id, updates),
        onSuccess: () => {
            setIsEditing(false);
            queryClient.invalidateQueries({ queryKey: ["project-facts"] });
        }
    });

    const isHighConfidence = fact.confidence_score > 80;
    const isRejected = fact.review_status === "rejected";
    
    const copyToClipboard = () => {
        navigator.clipboard.writeText(fact.fact_text);
        toast.success("Copied to clipboard");
    };

    return (
        <div
            data-testid="fact-card"
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
                        <p
                            className={cn(
                                "text-sm leading-relaxed text-foreground flex-1",
                                isRejected && "line-through text-muted-foreground"
                            )}
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                            title="Click to edit"
                        >
                            {fact.fact_text}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Review Status Badge */}
                            {fact.review_status === "needs_review" && (
                                <Badge 
                                    variant="secondary" 
                                    className="bg-warning/10 text-warning text-[10px] px-2 py-0.5 border-warning/30"
                                >
                                    <AlertCircle className="w-2.5 h-2.5 mr-1" />
                                    Needs Review
                                </Badge>
                            )}
                            {fact.review_status === "approved" && (
                                <Badge 
                                    variant="secondary" 
                                    className="bg-success/10 text-success text-[10px] px-2 py-0.5 border-success/30"
                                >
                                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                                    Approved
                                </Badge>
                            )}
                            {fact.review_status === "flagged" && (
                                <Badge 
                                    variant="secondary" 
                                    className="bg-danger/10 text-danger text-[10px] px-2 py-0.5 border-danger/30"
                                >
                                    <Flag className="w-2.5 h-2.5 mr-1" />
                                    Flagged
                                </Badge>
                            )}
                            {fact.review_status === "rejected" && (
                                <Badge 
                                    variant="secondary" 
                                    className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5"
                                >
                                    <X className="w-2.5 h-2.5 mr-1" />
                                    Rejected
                                </Badge>
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
                                data-testid="view-evidence-btn"
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

                {/* ✅ Review Status Actions */}
                <div className="h-6 w-px bg-border mx-1" />
                
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    fact.review_status === "approved"
                                        ? "text-success hover:text-success/80 hover:bg-success/10"
                                        : "text-muted-foreground hover:text-success hover:bg-success/10"
                                )}
                                onClick={() => updateMutation.mutate({ review_status: "approved" as ReviewStatus })}
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
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    fact.review_status === "needs_review"
                                        ? "text-warning hover:text-warning/80 hover:bg-warning/10"
                                        : "text-muted-foreground hover:text-warning hover:bg-warning/10"
                                )}
                                onClick={() => updateMutation.mutate({ review_status: "needs_review" as ReviewStatus })}
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
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    fact.review_status === "flagged"
                                        ? "text-danger hover:text-danger/80 hover:bg-danger/10"
                                        : "text-muted-foreground hover:text-danger hover:bg-danger/10"
                                )}
                                onClick={() => updateMutation.mutate({ review_status: "flagged" as ReviewStatus })}
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