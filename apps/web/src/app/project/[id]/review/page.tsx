"use client";

import { use, useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchProjectFacts, updateFact, Fact } from "@/lib/api";
import { EvidenceInspector } from "@/components/EvidenceInspector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Z } from "@/lib/tokens";
import { toast } from "sonner";
import { CheckCircle2, Flag, Star, X, ChevronLeft, AlertTriangle, Search, Keyboard } from "lucide-react";

/**
 * Review Queue Page - STEP #10
 * 
 * Pro-grade triage workflow for Needs Review and Key Claims
 * 
 * Features:
 * - 3-pane layout: Filters | Fact List | Evidence Inspector
 * - Keyboard shortcuts: J/K (navigate), A (approve), K (key claim), F (flag)
 * - Optimistic updates for instant feedback
 * - No blocking modals - actions happen inline
 */

export default function ReviewQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  // State
  const [selectedFactIndex, setSelectedFactIndex] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>("needs_review");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "low" | "medium" | "high">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Fetch facts with server-side filtering
  const { data: facts, isLoading } = useQuery({
    queryKey: ["review-facts", projectId, filterStatus],
    queryFn: () => fetchProjectFacts(projectId, { 
      filter: filterStatus as any,
      sort: "confidence",
      order: "asc" // Show lowest confidence first for review
    }),
  });

  // Filter facts by confidence and search
  const filteredFacts = useMemo(() => {
    const raw = facts ?? [];
    let list = Array.isArray(raw) ? raw : (raw.items ?? []);

    // Confidence filter
    if (confidenceFilter !== "all") {
      if (confidenceFilter === "low") {
        list = list.filter(f => f.confidence_score < 60);
      } else if (confidenceFilter === "medium") {
        list = list.filter(f => f.confidence_score >= 60 && f.confidence_score < 80);
      } else if (confidenceFilter === "high") {
        list = list.filter(f => f.confidence_score >= 80);
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f =>
        f.fact_text.toLowerCase().includes(q) ||
        f.source_domain.toLowerCase().includes(q)
      );
    }

    return list;
  }, [facts, confidenceFilter, searchQuery]);

  const currentFact = filteredFacts[selectedFactIndex];

  // Update fact mutation with optimistic updates
  const updateFactMutation = useMutation({
    mutationFn: ({ factId, updates }: { factId: string; updates: Partial<Fact> }) =>
      updateFact(factId, updates),
    onMutate: async ({ factId, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["review-facts", projectId, filterStatus] });

      // Snapshot previous value
      const previousFacts = queryClient.getQueryData(["review-facts", projectId, filterStatus]);

      // Optimistically update
      queryClient.setQueryData(
        ["review-facts", projectId, filterStatus],
        (old: Fact[] | undefined) => {
          if (!old) return old;
          return old.map(fact =>
            fact.id === factId ? { ...fact, ...updates } : fact
          );
        }
      );

      return { previousFacts };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousFacts) {
        queryClient.setQueryData(
          ["review-facts", projectId, filterStatus],
          context.previousFacts
        );
      }
      toast.error("Update failed");
    },
    onSuccess: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["review-facts", projectId] });
    }
  });

  // Action handlers
  const handleApprove = useCallback(() => {
    if (!currentFact) return;
    updateFactMutation.mutate({
      factId: currentFact.id,
      updates: { review_status: "APPROVED" }
    });
    toast.success("Approved");
    // Move to next fact
    if (selectedFactIndex < filteredFacts.length - 1) {
      setSelectedFactIndex(selectedFactIndex + 1);
    }
  }, [currentFact, selectedFactIndex, filteredFacts.length, updateFactMutation]);

  const handleToggleKeyClaim = useCallback(() => {
    if (!currentFact) return;
    updateFactMutation.mutate({
      factId: currentFact.id,
      updates: { is_key_claim: !currentFact.is_key_claim }
    });
    toast.success(currentFact.is_key_claim ? "Key claim removed" : "Marked as key claim");
  }, [currentFact, updateFactMutation]);

  const handleFlag = useCallback(() => {
    if (!currentFact) return;
    updateFactMutation.mutate({
      factId: currentFact.id,
      updates: { review_status: "FLAGGED" }
    });
    toast.warning("Flagged for review");
    // Move to next fact
    if (selectedFactIndex < filteredFacts.length - 1) {
      setSelectedFactIndex(selectedFactIndex + 1);
    }
  }, [currentFact, selectedFactIndex, filteredFacts.length, updateFactMutation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key.toLowerCase()) {
        case "j":
          // Next fact
          e.preventDefault();
          setSelectedFactIndex(prev => Math.min(prev + 1, filteredFacts.length - 1));
          break;
        case "k":
          // Previous fact
          e.preventDefault();
          setSelectedFactIndex(prev => Math.max(prev - 1, 0));
          break;
        case "a":
          // Approve
          e.preventDefault();
          handleApprove();
          break;
        case "s":
          // Toggle key claim (S for star)
          e.preventDefault();
          handleToggleKeyClaim();
          break;
        case "f":
          // Flag
          e.preventDefault();
          handleFlag();
          break;
        case "?":
          // Show help
          e.preventDefault();
          setShowKeyboardHelp(!showKeyboardHelp);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredFacts.length, handleApprove, handleToggleKeyClaim, handleFlag, showKeyboardHelp]);

  // Reset selected index when facts change
  useEffect(() => {
    setSelectedFactIndex(0);
  }, [filterStatus, confidenceFilter, searchQuery]);

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      {/* Header */}
      <header className={`h-16 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0 relative ${Z.header}`}>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/project/${projectId}`)}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Project
          </Button>
          <h1 className="text-xl font-semibold">Review Queue</h1>
          <Badge variant="secondary">
            {filteredFacts.length} {filteredFacts.length === 1 ? "fact" : "facts"}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowKeyboardHelp(!showKeyboardHelp)}
        >
          <Keyboard className="w-4 h-4 mr-2" />
          Shortcuts
        </Button>
      </header>

      {/* Keyboard help overlay */}
      {showKeyboardHelp && (
        <div className={`absolute inset-0 bg-black/50 ${Z.overlay} flex items-center justify-center`}>
          <div className="bg-surface p-6 rounded-lg shadow-lg max-w-md">
            <h2 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <kbd className="px-2 py-1 bg-muted rounded">J</kbd>
                <span>Next fact</span>
              </div>
              <div className="flex justify-between">
                <kbd className="px-2 py-1 bg-muted rounded">K</kbd>
                <span>Previous fact</span>
              </div>
              <div className="flex justify-between">
                <kbd className="px-2 py-1 bg-muted rounded">A</kbd>
                <span>Approve</span>
              </div>
              <div className="flex justify-between">
                <kbd className="px-2 py-1 bg-muted rounded">S</kbd>
                <span>Toggle key claim</span>
              </div>
              <div className="flex justify-between">
                <kbd className="px-2 py-1 bg-muted rounded">F</kbd>
                <span>Flag</span>
              </div>
              <div className="flex justify-between">
                <kbd className="px-2 py-1 bg-muted rounded">?</kbd>
                <span>Show/hide help</span>
              </div>
            </div>
            <Button
              className="mt-4 w-full"
              onClick={() => setShowKeyboardHelp(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Main content: 3-pane layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left pane: Filters */}
        <div className="w-64 border-r border-border bg-surface p-4 space-y-6 overflow-y-auto">
          <div>
            <h3 className="text-sm font-semibold mb-2">Status Filter</h3>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="all">All Facts</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
                <SelectItem value="key_claims">Key Claims</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Confidence</h3>
            <Select value={confidenceFilter} onValueChange={(v: any) => setConfidenceFilter(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="low">Low (&lt; 60)</SelectItem>
                <SelectItem value="medium">Medium (60-79)</SelectItem>
                <SelectItem value="high">High (≥ 80)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Search</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search facts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {/* Middle pane: Fact list */}
        <div className="w-96 border-r border-border bg-background overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading facts...</div>
          ) : filteredFacts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <p className="font-semibold">All caught up!</p>
              <p className="text-sm mt-2">No facts match your current filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredFacts.map((fact, index) => (
                <div
                  key={fact.id}
                  className={cn(
                    "p-4 cursor-pointer transition-colors hover:bg-accent",
                    selectedFactIndex === index && "bg-accent"
                  )}
                  onClick={() => setSelectedFactIndex(index)}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <Badge
                      variant={fact.confidence_score < 60 ? "destructive" : "secondary"}
                      className="shrink-0"
                    >
                      {fact.confidence_score}%
                    </Badge>
                    {fact.is_key_claim && (
                      <Star className="w-4 h-4 text-yellow-500 shrink-0" />
                    )}
                    {fact.review_status === "FLAGGED" && (
                      <Flag className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-sm line-clamp-3">{fact.fact_text}</p>
                  <p className="text-xs text-muted-foreground mt-2">{fact.source_domain}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right pane: Evidence Inspector + Actions */}
        <div className="flex-1 flex flex-col bg-background">
          {currentFact ? (
            <>
              {/* Actions bar */}
              <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-surface">
                <div className="flex items-center gap-2">
                  <Badge variant={currentFact.confidence_score < 60 ? "destructive" : "secondary"}>
                    {currentFact.confidence_score}% confidence
                  </Badge>
                  {currentFact.is_key_claim && (
                    <Badge variant="default">Key Claim</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleToggleKeyClaim}
                  >
                    <Star className={cn("w-4 h-4 mr-2", currentFact.is_key_claim && "fill-yellow-500 text-yellow-500")} />
                    {currentFact.is_key_claim ? "Remove Key Claim" : "Mark Key Claim"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFlag}
                  >
                    <Flag className="w-4 h-4 mr-2" />
                    Flag
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleApprove}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                </div>
              </div>

              {/* Evidence Inspector */}
              <div className="flex-1 overflow-hidden">
                <EvidenceInspector
                  fact={currentFact}
                  onClose={() => {}}
                  projectId={projectId}
                  disableClose
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
                <p>No fact selected</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
