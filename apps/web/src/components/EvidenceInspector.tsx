"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, ExternalLink, Quote, AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { fetchSourceContent, Fact } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeRaw from "rehype-raw";
import { 
    findQuoteInText, 
    parseTextToBlocks, 
    scrollToEvidenceMark,
    injectEvidenceMark,
    injectMarkInReactText,
    looksLikeTableData,
    normalizeMarkdown,
    type TextBlock,
    type MatchResult
} from "@/lib/evidenceUtils";

interface Props {
    fact: Fact;
    onClose: () => void;
    projectId: string;
    disableClose?: boolean;
}

type EvidenceJumpState = 'IDLE' | 'INJECTED' | 'SCROLLED';

export function EvidenceInspector({ fact, onClose, projectId, disableClose = false }: Props) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<"reader" | "raw">("reader");
    const [showCitations, setShowCitations] = useState(false);
    const [isPulsing, setIsPulsing] = useState(false);
    
    // ✅ State machine: Track evidence jump lifecycle
    const [evidenceState, setEvidenceState] = useState<EvidenceJumpState>('IDLE');
    const scrollAttemptRef = useRef(0);

    // Fetch content with "auto" mode
    const { data, isLoading } = useQuery({
        queryKey: ["source-content", fact.source_url, "auto"],
        queryFn: () => fetchSourceContent(projectId, fact.source_url, "auto"),
        staleTime: 1000 * 60 * 10,
    });

    // Reset state when tab changes
    useEffect(() => {
        setEvidenceState('IDLE');
        scrollAttemptRef.current = 0;
    }, [activeTab]);

    // ✅ Robust scroll pipeline: double RAF + retry loop + fallback
    useEffect(() => {
        if (!data || !fact.quote_text_raw || isLoading) return;
        
        // Only scroll once per tab view (IDLE → INJECTED → SCROLLED)
        if (evidenceState === 'SCROLLED') return;
        
        if (evidenceState === 'IDLE') {
            // Step 1: Mark as injected (DOM will render with mark)
            setEvidenceState('INJECTED');
            return;
        }
        
        if (evidenceState === 'INJECTED') {
            // Step 2: Wait for mark to appear in DOM, then scroll
            // ✅ Use triple RAF for more deterministic timing after tab switches
            const executeScroll = () => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            const success = scrollToEvidenceMark(
                                contentRef.current,
                                10,  // max 10 attempts
                                100   // 100ms between attempts for E2E reliability
                            );
                            
                            if (success) {
                                setEvidenceState('SCROLLED');
                                setIsPulsing(true);
                                setTimeout(() => setIsPulsing(false), 1200);
                            } else {
                                // Fallback: try querySelector directly with longer wait
                                setTimeout(() => {
                                    const mark = contentRef.current?.querySelector('[data-evidence-mark="true"]') as HTMLElement;
                                    if (mark) {
                                        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        setEvidenceState('SCROLLED');
                                        setIsPulsing(true);
                                        setTimeout(() => setIsPulsing(false), 1200);
                                    } else if (process.env.NODE_ENV === 'development') {
                                        console.warn('⚠️ Evidence mark not found in DOM after retries', {
                                            tab: activeTab,
                                            hasQuote: !!fact.quote_text_raw,
                                            containerExists: !!contentRef.current,
                                            markCount: contentRef.current?.querySelectorAll('[data-evidence-mark="true"]').length || 0
                                        });
                                    }
                                }, 200);
                            }
                        });
                    });
                });
            };
            
            executeScroll();
        }
    }, [data, fact.quote_text_raw, isLoading, activeTab, evidenceState]);

    const copyQuote = () => {
        if (fact.quote_text_raw) {
            navigator.clipboard.writeText(fact.quote_text_raw);
            toast.success("Quote copied");
        }
    };

    // Determine which offsets to use based on active tab
    const useStoredOffsets = activeTab === "raw" 
        ? { start: fact.evidence_start_char_raw, end: fact.evidence_end_char_raw }
        : { start: fact.evidence_start_char_md, end: fact.evidence_end_char_md };

    const matchResult = data && fact.quote_text_raw 
        ? findQuoteInText(
            data.text || "", 
            fact.quote_text_raw,
            useStoredOffsets.start,
            useStoredOffsets.end
          )
        : { found: false, start: -1, end: -1, matchType: 'none' as const };

    return (
        <div className="h-full flex flex-col bg-surface shadow-lg" data-testid="evidence-inspector">
            {/* Header */}
            <div className="h-14 bg-surface-2/50 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-2 overflow-hidden">
                    <Badge variant="outline" className="bg-elevated text-muted-foreground border-border shadow-xs">
                        Evidence
                    </Badge>
                    <span className="text-sm font-medium text-foreground truncate max-w-[200px]" title={fact.source_domain}>
                        {fact.source_domain}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={copyQuote}
                        className="hover:bg-muted rounded-lg transition-colors"
                    >
                        <Copy className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => fact.source_url && window.open(fact.source_url, '_blank')}
                        className="hover:bg-muted rounded-lg transition-colors"
                    >
                        <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </Button>
                    {!disableClose && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={onClose}
                            className="hover:bg-muted rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="p-4 bg-surface space-y-3 z-10 shadow-sm">
                    {/* Quote Card */}
                    <div className="bg-quote-bg/50 rounded-lg p-4 pl-5 border-l-2 border-quote-border relative shadow-xs">
                        <Quote className="absolute top-4 left-3 w-5 h-5 text-quote-border/40" />
                        <div className="pl-7">
                            <p className="text-sm text-quote-text italic leading-relaxed font-serif">
                                "{fact.quote_text_raw || fact.fact_text}"
                            </p>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {matchResult.found ? (
                                <span className="text-[10px] font-medium text-success-foreground flex items-center bg-success/90 px-2 py-0.5 rounded-full border border-success shadow-xs">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> 
                                    {matchResult.matchType === 'stored' ? 'Precise' : matchResult.matchType === 'exact' ? 'Exact' : matchResult.matchType === 'normalized' ? 'Normalized' : 'Fuzzy'}
                                </span>
                            ) : (
                                <span className="text-[10px] font-medium text-warning-foreground flex items-center bg-warning/90 px-2 py-0.5 rounded-full border border-warning shadow-xs">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Not Found
                                </span>
                            )}
                            
                            {/* Show Citations Toggle (Reader mode only) */}
                            {activeTab === "reader" && (
                                <button
                                    onClick={() => setShowCitations(!showCitations)}
                                    className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-full hover:bg-muted transition-colors"
                                >
                                    {showCitations ? 'Hide' : 'Show'} Citations
                                </button>
                            )}
                            
                            {fact.source_url && (
                                <a 
                                    href={fact.source_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-muted-foreground hover:text-foreground hover:underline flex items-center ml-2"
                                >
                                    Source <ExternalLink className="w-3 h-3 ml-1" />
                                </a>
                            )}
                        </div>

                        {/* Tabs */}
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "reader" | "raw")} className="w-[170px]">
                            <TabsList className="h-9 w-full bg-muted p-1 rounded-full">
                                <TabsTrigger
                                    value="reader"
                                    className="text-[11px] font-medium h-7 px-4 rounded-full data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all text-muted-foreground"
                                >
                                    Reader
                                </TabsTrigger>
                                <TabsTrigger
                                    value="raw"
                                    className="text-[11px] font-medium h-7 px-4 rounded-full data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all text-muted-foreground"
                                >
                                    Raw
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </div>

                {/* Main Scroll Area */}
                <ScrollArea className="flex-1 bg-surface">
                    {isLoading ? (
                        <div className="flex h-64 items-center justify-center">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-pulse" style={{animationDelay: '0ms'}} />
                                <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-pulse" style={{animationDelay: '150ms'}} />
                                <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-pulse" style={{animationDelay: '300ms'}} />
                            </div>
                        </div>
                    ) : data ? (
                        <div ref={contentRef} className="p-8 md:p-12 max-w-[65ch] mx-auto">
                            {activeTab === "reader" ? (
                                <ReaderView 
                                    data={data as unknown as { markdown?: string; [k: string]: unknown }} 
                                    quote={fact.quote_text_raw} 
                                    matchResult={matchResult}
                                    showCitations={showCitations}
                                    isPulsing={isPulsing}
                                />
                            ) : (
                                <RawView 
                                    text={data.text || ""} 
                                    quote={fact.quote_text_raw}
                                    matchResult={matchResult}
                                    isPulsing={isPulsing}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="p-12 text-center">
                            <p className="text-muted-foreground text-sm font-medium">Content unavailable</p>
                        </div>
                    )}
                </ScrollArea>
            </div>
        </div>
    );
}

// Reader View Component
function ReaderView({ 
    data, 
    quote, 
    matchResult,
    showCitations = false,
    isPulsing = false
}: { 
    data: { markdown?: string; [k: string]: unknown }; 
    quote?: string; 
    matchResult: ReturnType<typeof findQuoteInText>;
    showCitations?: boolean;
    isPulsing?: boolean;
}) {
    // Remove citations from text (only if showCitations is false)
    const removeCitations = (text: string) => 
        showCitations ? text : text.replace(/\[\d+\]|\[citation needed\]|\[edit\]/gi, '');

    if (data.markdown) {
        const cleanMarkdown = removeCitations(data.markdown);
        
        // Normalize markdown tables before rendering
        const normalizedMarkdown = normalizeMarkdown(cleanMarkdown);
        
        // Inject precise mark element if we have a match
        const mdWithMark = matchResult.found && quote
            ? injectEvidenceMark(normalizedMarkdown, quote, matchResult)
            : normalizedMarkdown;
        
        return (
            <div className="reader-content prose prose-slate dark:prose-invert prose-lg max-w-none">
                <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize, rehypeRaw]}
                >
                    {mdWithMark}
                </ReactMarkdown>
            </div>
        );
    }

    const htmlStr = typeof data.html === "string" ? data.html : "";
    if (htmlStr) {
        return (
            <div 
                className="reader-content prose prose-slate dark:prose-invert prose-lg max-w-none"
                dangerouslySetInnerHTML={{ __html: removeCitations(htmlStr) }}
            />
        );
    }

    // Plain text - parse into blocks
    const textContent = (typeof data.text === "string" ? data.text : typeof data.content === "string" ? data.content : "") || "";
    const text = removeCitations(textContent);
    const blocks = parseTextToBlocks(text);

    return (
        <div className="reader-content space-y-6">
            {blocks.map((block, i) => (
                <RenderBlock key={i} block={block} quote={quote} isPulsing={isPulsing} />
            ))}
        </div>
    );
}

// Render individual text block
function RenderBlock({ 
    block, 
    quote, 
    isPulsing = false 
}: { 
    block: TextBlock; 
    quote?: string;
    isPulsing?: boolean;
}) {
    const shouldHighlight = (content: string) => {
        if (!quote) return false;
        return content.toLowerCase().includes(quote.toLowerCase());
    };

    if (block.type === 'heading') {
        const content = block.content as string;
        const headingMatch = quote ? findQuoteInText(content, quote) : { found: false, start: -1, end: -1, matchType: 'none' as const };
        
        if (headingMatch.found) {
            return (
                <h2 className="text-xl font-bold mt-8 mb-4 tracking-tight">
                    {injectMarkInReactText(content, quote!, headingMatch, isPulsing)}
                </h2>
            );
        }
        
        return <h2 className="text-xl font-bold mt-8 mb-4 tracking-tight">{content}</h2>;
    }

    if (block.type === 'list') {
        const items = block.content as string[];
        return (
            <ul className="my-6 ml-6 space-y-2 list-disc marker:text-muted-foreground">
                {items.map((item, j) => {
                    const itemMatch = quote ? findQuoteInText(item, quote) : { found: false, start: -1, end: -1, matchType: 'none' as const };
                    
                    return (
                        <li key={j} className="leading-relaxed">
                            {itemMatch.found 
                                ? injectMarkInReactText(item, quote!, itemMatch, isPulsing)
                                : item
                            }
                        </li>
                    );
                })}
            </ul>
        );
    }

    // Paragraph - use precise highlighting if quote is present
    const content = block.content as string;
    const paraMatchResult = quote ? findQuoteInText(content, quote) : { found: false, start: -1, end: -1, matchType: 'none' as const };
    
    if (paraMatchResult.found) {
        return (
            <p className="mb-6 leading-relaxed">
                {injectMarkInReactText(content, quote!, paraMatchResult, isPulsing)}
            </p>
        );
    }
    
    return <p className="mb-6 leading-relaxed">{content}</p>;
}

// Raw View Component
function RawView({ 
    text, 
    quote, 
    matchResult,
    isPulsing = false
}: { 
    text: string; 
    quote?: string; 
    matchResult: ReturnType<typeof findQuoteInText>;
    isPulsing?: boolean;
}) {
    // Check if it looks like table data
    if (looksLikeTableData(text)) {
        return (
            <div className="space-y-4">
                <pre className="raw-content bg-muted/20 dark:bg-muted/10 rounded-lg p-4 overflow-x-auto border border-border/50 shadow-sm">
                    {renderHighlightedText(text, matchResult, isPulsing)}
                </pre>
            </div>
        );
    }

    return (
        <pre className="raw-content bg-surface-2 rounded-lg border border-border/50 p-5 shadow-sm">
            {renderHighlightedText(text, matchResult, isPulsing)}
        </pre>
    );
}

// Render text with highlighted quote
// ✅ Uses data-evidence-mark (not id) to avoid duplicate IDs
function renderHighlightedText(
    text: string,
    matchResult: ReturnType<typeof findQuoteInText>,
    isPulsing = false
) {
    if (!matchResult.found || matchResult.start === -1) {
        return text;
    }

    return (
        <>
            {text.substring(0, matchResult.start)}
            <mark 
                data-evidence-mark="true"
                data-testid="evidence-mark"
                className={`evidence-mark ${isPulsing ? 'evidence-pulse' : ''}`}
            >
                {text.substring(matchResult.start, matchResult.end)}
            </mark>
            {text.substring(matchResult.end)}
        </>
    );
}
