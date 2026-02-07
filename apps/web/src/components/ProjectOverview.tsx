"use client";

import { Fact, Job } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { FileText, Star, AlertCircle, CheckCircle2, Globe } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";

interface Props {
    facts: Fact[];
    jobs: Job[];
    projectId?: string;
}

export function ProjectOverview({ facts, jobs, projectId }: Props) {
    const router = useRouter();
    
    const stats = useMemo(() => {
        const totalSources = jobs.length;
        const totalFacts = facts.length;
        const keyClaims = facts.filter(f => f.is_key_claim).length;
        // ✅ Updated: Include new "needs_review" status
        const needsReview = facts.filter(f => 
            f.review_status === "pending" || 
            f.review_status === "needs_review" || 
            f.review_status === "flagged"
        ).length;
        const approved = facts.filter(f => f.review_status === "approved").length;

        return { totalSources, totalFacts, keyClaims, needsReview, approved };
    }, [facts, jobs]);
    
    const handleFilterByStatus = (status: string) => {
        if (projectId) {
            router.push(`/project/${projectId}?review_status=${status}`);
        }
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-surface border-border hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Sources</p>
                        <p className="text-2xl font-bold text-foreground">{stats.totalSources}</p>
                    </div>
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Globe className="w-4 h-4 text-primary" />
                    </div>
                </div>
            </Card>

            <Card className="p-4 bg-surface border-border hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Facts</p>
                        <p className="text-2xl font-bold text-foreground">{stats.totalFacts}</p>
                    </div>
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <FileText className="w-4 h-4 text-blue-500" />
                    </div>
                </div>
            </Card>

            <Card className="p-4 bg-surface border-border hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Key Claims</p>
                        <p className="text-2xl font-bold text-foreground">{stats.keyClaims}</p>
                    </div>
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                        <Star className="w-4 h-4 text-amber-500 fill-current" />
                    </div>
                </div>
            </Card>

            <Card 
                className="p-4 bg-surface border-border hover:shadow-md transition-shadow cursor-pointer hover:ring-2 hover:ring-warning/30"
                onClick={() => handleFilterByStatus('needs_review')}
            >
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Needs Review</p>
                        <p className="text-2xl font-bold text-foreground">{stats.needsReview}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Click to filter</p>
                    </div>
                    <div className="p-2 bg-warning/10 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-warning" />
                    </div>
                </div>
            </Card>
        </div>
    );
}
