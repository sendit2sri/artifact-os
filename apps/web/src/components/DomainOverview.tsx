"use client";

import { useMemo } from "react";
import { Fact, Job } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DomainOverviewProps {
    domain: string;
    domainJobs: Job[];
    domainFacts: Fact[];
    onSelectPage: (url: string) => void;
}

export function DomainOverview({ domain, domainJobs, domainFacts, onSelectPage }: DomainOverviewProps) {

    // 1. Calculate Metrics
    const metrics = useMemo(() => {
        return {
            totalFacts: domainFacts.length,
            keyClaims: domainFacts.filter(f => f.is_key_claim).length,
            verified: domainFacts.filter(f => f.confidence_score > 80).length,
            needsReview: domainFacts.filter(f => f.review_status === "pending" || f.review_status === "flagged").length,
            lastIngested: domainJobs.length > 0
                ? domainJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
                : null
        };
    }, [domainFacts, domainJobs]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* Header Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 border-stone-200 dark:border-stone-700 shadow-sm bg-white dark:bg-[#2A2A2A]">
                    <div className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider mb-1">Total Pages</div>
                    <div className="text-2xl font-semibold text-[#1F1F1F] dark:text-stone-100">{domainJobs.length}</div>
                </Card>
                <Card className="p-4 border-stone-200 dark:border-stone-700 shadow-sm bg-white dark:bg-[#2A2A2A]">
                    <div className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider mb-1">Total Facts</div>
                    <div className="text-2xl font-semibold text-[#1F1F1F] dark:text-stone-100">{metrics.totalFacts}</div>
                </Card>
                <Card className="p-4 border-stone-200 dark:border-stone-700 shadow-sm bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                    <div className="text-amber-700 dark:text-amber-500 text-xs font-medium uppercase tracking-wider mb-1">Key Claims</div>
                    <div className="text-2xl font-semibold text-amber-800 dark:text-amber-400">{metrics.keyClaims}</div>
                </Card>
                <Card className="p-4 border-stone-200 dark:border-stone-700 shadow-sm bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                    <div className="text-amber-700 dark:text-amber-500 text-xs font-medium uppercase tracking-wider mb-1">Needs Review</div>
                    <div className="text-2xl font-semibold text-amber-800 dark:text-amber-400">{metrics.needsReview}</div>
                </Card>
            </div>

            {/* Pages List Table */}
            <div className="bg-white dark:bg-[#2A2A2A] rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden">
                <div className="bg-stone-50 dark:bg-stone-800/50 px-4 py-3 border-b border-stone-200 dark:border-stone-700 flex justify-between items-center">
                    <h3 className="font-medium text-sm text-stone-700 dark:text-stone-300">Pages in this Domain</h3>
                    <span className="text-xs text-stone-400 dark:text-stone-500">Sorted by recent</span>
                </div>

                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                    {domainJobs.map(job => {
                        const pageFacts = domainFacts.filter(f => f.source_url === job.params.url);
                        const pendingCount = pageFacts.filter(f => f.review_status === "pending").length;
                        const title = job.result_summary?.source_title || job.params.url;

                        return (
                            <div
                                key={job.id}
                                className="p-4 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800/50 cursor-pointer transition-colors group"
                                onClick={() => onSelectPage(job.params.url)}
                            >
                                <div className="flex items-start gap-3 overflow-hidden">
                                    <div className="bg-stone-100 dark:bg-stone-800 p-2 rounded text-stone-500 dark:text-stone-400">
                                        <FileText className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors">
                                            {title}
                                        </h4>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-stone-400 dark:text-stone-500">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {formatDistanceToNow(new Date(job.created_at))} ago
                                            </span>
                                            <span>•</span>
                                            <span>{pageFacts.length} facts</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    {pendingCount > 0 && (
                                        <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60">
                                            {pendingCount} to review
                                        </Badge>
                                    )}
                                    <ChevronRightIcon className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-stone-500 dark:group-hover:text-stone-400" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function ChevronRightIcon(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
}