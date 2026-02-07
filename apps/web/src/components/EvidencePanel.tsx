"use client";

import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { fetchSourceContent } from "@/lib/api";
import { useEffect, useRef, useMemo } from "react";

interface EvidencePanelProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    fact: {
        source_url: string;
        source_domain: string;
        quote_text_raw: string;
        fact_text: string;
    } | null;
}

export function EvidencePanel({ isOpen, onClose, projectId, fact }: EvidencePanelProps) {
    const contentRef = useRef<HTMLDivElement>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ["source-content", fact?.source_url],
        queryFn: () => fact ? fetchSourceContent(projectId, fact.source_url) : Promise.reject("No URL"),
        enabled: !!fact && isOpen,
        staleTime: 1000 * 60 * 5,
    });

    // --- 1. Robust Match Logic ---
    const findQuoteOffset = (fullText: string, quote: string) => {
        if (!quote || !fullText) return null;
        const cleanText = fullText.toLowerCase();
        const cleanQuote = quote.toLowerCase().trim();

        // Strategy 1: Exact Match (Fastest)
        const exactIndex = cleanText.indexOf(cleanQuote);
        if (exactIndex !== -1) return { start: exactIndex, end: exactIndex + quote.length };

        // Helper: Build a loose regex pattern
        const buildPattern = (str: string, allowSkipWords = false) => {
            // Escape regex chars
            const escaped = str.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

            // If we allow skipping words, use wildcards between tokens. 
            // Otherwise just skip punctuation/citations/spaces.
            const gap = allowSkipWords ? '.{1,150}?' : '[\\W\\d]{1,50}?';
            return escaped.join(gap);
        };

        // Strategy 2: Fuzzy Match (Skip Citations & Punctuation)
        // Good for: "intake.[12]" matching "intake"
        let pattern = buildPattern(cleanQuote, false);
        let regex = new RegExp(pattern, 'i');
        let match = regex.exec(fullText);
        if (match) return { start: match.index, end: match.index + match[0].length };

        // Strategy 3: Loose Match (Skip whole clauses/words)
        // Good for: "Magnesium... is abundant" matching "Magnesium (Mg) is abundant"
        pattern = buildPattern(cleanQuote, true);
        regex = new RegExp(pattern, 'i');
        match = regex.exec(fullText);
        if (match) return { start: match.index, end: match.index + match[0].length };

        // Strategy 4: "Anchor Match" (The "It" Fix)
        // If the LLM changed the start (e.g. "It is..." vs "Magnesium is..."), 
        // we try searching for the *last 80%* of the sentence.
        const words = cleanQuote.split(/\s+/);
        if (words.length > 6) {
            // Drop the first 2 words (e.g. removes "It is")
            const partialQuote = words.slice(2).join(" ");
            pattern = buildPattern(partialQuote, true); // Use loose matching
            regex = new RegExp(pattern, 'i');
            match = regex.exec(fullText);
            if (match) return { start: match.index, end: match.index + match[0].length };
        }

        return null;
    };

    const matchLocation = useMemo(() => {
        if (!data?.content || !fact?.quote_text_raw) return null;
        return findQuoteOffset(data.content, fact.quote_text_raw);
    }, [data, fact]);

    // --- 2. Auto-Scroll ---
    useEffect(() => {
        if (matchLocation && contentRef.current) {
            setTimeout(() => {
                const mark = contentRef.current?.querySelector("mark");
                if (mark) {
                    mark.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 300);
        }
    }, [matchLocation]);

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-[500px] sm:w-[800px] flex flex-col p-0">

                {/* Header */}
                <SheetHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-white">{fact?.source_domain}</Badge>
                        {matchLocation ? (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Match Found
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
                                <AlertTriangle className="w-3 h-3 mr-1" /> Fuzzy Match
                            </Badge>
                        )}
                    </div>
                    <SheetTitle className="text-base font-semibold text-slate-900 leading-tight">
                        Verification Evidence
                    </SheetTitle>
                    <SheetDescription className="text-xs line-clamp-3 bg-white p-2 border rounded-md mt-2">
                        "{fact?.quote_text_raw}"
                    </SheetDescription>
                    {fact?.source_url && (
                        <a href={fact.source_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                            Open Original Source <ExternalLink className="w-3 h-3" />
                        </a>
                    )}
                </SheetHeader>

                {/* Content Area */}
                <ScrollArea className="flex-1 p-6">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-40 gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            <p className="text-xs text-slate-400">Loading source text...</p>
                        </div>
                    ) : error ? (
                        <div className="text-red-500 text-sm text-center p-10">
                            Failed to load content.
                        </div>
                    ) : data && matchLocation ? (
                        <div ref={contentRef} className="pb-20 font-mono text-sm whitespace-pre-wrap leading-relaxed text-slate-600">
                            {/* Pre-Match Text */}
                            {data.content.substring(0, matchLocation.start)}

                            {/* The Highlight */}
                            <mark className="bg-yellow-300 text-slate-900 font-bold px-1 rounded-sm ring-4 ring-yellow-300/40">
                                {data.content.substring(matchLocation.start, matchLocation.end)}
                            </mark>

                            {/* Post-Match Text */}
                            {data.content.substring(matchLocation.end)}
                        </div>
                    ) : data ? (
                        // Fallback: Show raw text if regex completely fails
                        <div className="pb-20 font-mono text-sm whitespace-pre-wrap leading-relaxed text-slate-600">
                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 mb-4 text-amber-800 text-xs">
                                Could not pinpoint exact highlight. Showing full text.
                            </div>
                            {data.content}
                        </div>
                    ) : null}
                </ScrollArea>

            </SheetContent>
        </Sheet>
    );
}