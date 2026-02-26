"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Job } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const PENDING_ESCALATION_SEC = 30;

const STAGE_ORDER = ["queued", "fetching", "extracting", "facting", "done"] as const;
type StageKey = (typeof STAGE_ORDER)[number];

function jobStatusToStage(status: Job["status"], currentStep?: string | null): StageKey {
    if (status === "FAILED") return "done";
    if (status === "COMPLETED") return "done";
    const step = (currentStep ?? "").toLowerCase();
    if (step === "queued") return "queued";
    if (step === "fetching") return "fetching";
    if (step === "extracting") return "extracting";
    if (step === "facting") return "facting";
    if (step.includes("fetch")) return "fetching";
    if (step.includes("extract") && !step.includes("fact")) return "extracting";
    if (step.includes("fact") || step.includes("saving fact")) return "facting";
    return "queued";
}

function elapsedSeconds(createdAt: string | undefined, now: number): number {
    if (!createdAt || now === 0) return 0;
    const created = new Date(createdAt).getTime();
    if (isNaN(created)) return 0;
    return Math.floor((now - created) / 1000);
}

function pendingStatusMessage(job: Job, elapsed: number): { main: string; hint?: string } {
    const isDev = process.env.NODE_ENV === "development";
    if (elapsed >= PENDING_ESCALATION_SEC) {
        return {
            main: "Queued — worker not running?",
            hint: isDev ? "Start the ingestion worker with make dev or make dev-proxy." : "Try again in a moment.",
        };
    }
    return {
        main: "Queued — waiting for ingestion worker",
        hint: isDev && elapsed >= 15 ? "If this takes longer than ~30s, run make dev." : undefined,
    };
}

function errorCodeLabel(code: string): string {
    const labels: Record<string, string> = {
        NETWORK: "Network error",
        RATE_LIMIT: "Rate limited",
        PAYWALL: "Paywall / blocked",
        UNSUPPORTED: "Unsupported",
        EMPTY_CONTENT: "Empty content",
        CAPTIONS_UNAVAILABLE: "Captions not available",
        TRANSCRIPT_DISABLED: "Captions not available",
    };
    return labels[code] ?? code;
}

function isCaptionsUnavailable(code: string | undefined): boolean {
    return code === "CAPTIONS_UNAVAILABLE" || code === "TRANSCRIPT_DISABLED";
}

interface ProcessingTimelineProps {
    jobs: Job[];
    onRetry: (canonicalUrl: string, sourceType?: "WEB" | "REDDIT" | "YOUTUBE") => void;
}

export function ProcessingTimeline({ jobs, onRetry }: ProcessingTimelineProps) {
    const [tick, setTick] = useState(0);
    // Use 0 for SSR to avoid hydration mismatch (#418); set real value after mount
    const [now, setNow] = useState(0);
    const activeOrFailed = jobs.filter((j) =>
        ["PENDING", "RUNNING", "FAILED"].includes(j.status)
    );
    const hasPending = activeOrFailed.some((j) => j.status === "PENDING");
    const isDev = process.env.NODE_ENV === "development";

    useEffect(() => {
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    useEffect(() => {
        if (!hasPending) return;
        const id = setInterval(() => setTick((t) => t + 1), 5000);
        return () => clearInterval(id);
    }, [hasPending]);

    const copyDebugInfo = useCallback(
        (job: Job) => {
            const elapsed = elapsedSeconds(job.created_at, now);
            const payload = {
                jobId: job.id,
                status: job.status,
                created_at: job.created_at,
                elapsed_sec: elapsed,
                backend_url: API_URL,
                env: process.env.NODE_ENV,
            };
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        },
        [now]
    );

    if (activeOrFailed.length === 0) return null;

    return (
        <div
            data-testid="processing-timeline"
            className="rounded-lg border border-border bg-surface p-4 space-y-3"
        >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Processing
            </p>
            {activeOrFailed.map((job) => {
                const label =
                    job.params?.filename ?? job.params?.url ?? "Unknown";
                const shortLabel =
                    typeof label === "string" && label.length > 50
                        ? label.slice(0, 47) + "..."
                        : label;
                const stage = jobStatusToStage(job.status, job.current_step);
                const isFailed = job.status === "FAILED";
                const elapsed = elapsedSeconds(job.created_at, now);
                const pendingMsg = job.status === "PENDING" ? pendingStatusMessage(job, elapsed) : null;

                return (
                    <div
                        key={job.id}
                        className="rounded-md border border-border bg-muted/30 p-3 space-y-2"
                    >
                        <div className="flex items-center gap-2 flex-wrap">
                            {STAGE_ORDER.map((s) => {
                                const isActive =
                                    s === stage ||
                                    (s === "done" && isFailed);
                                const isPast =
                                    STAGE_ORDER.indexOf(s) <
                                    STAGE_ORDER.indexOf(stage);
                                const showCheck =
                                    s === "done" &&
                                    (job.status === "COMPLETED" || isFailed);
                                return (
                                    <span
                                        key={s}
                                        data-testid="processing-stage"
                                        data-stage={s}
                                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                                            isFailed && s === "done"
                                                ? "bg-destructive/10 text-destructive"
                                                : isPast && !showCheck
                                                ? "bg-primary/10 text-primary"
                                                : isActive && !showCheck
                                                ? "bg-primary/20 text-primary"
                                                : "text-muted-foreground"
                                        }`}
                                    >
                                        {showCheck ? (
                                            isFailed ? (
                                                <AlertTriangle className="w-3 h-3" />
                                            ) : (
                                                <CheckCircle2 className="w-3 h-3" />
                                            )
                                        ) : (isActive && job.status === "RUNNING") || (s === "queued" && job.status === "PENDING") ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : null}
                                        {s === "queued"
                                            ? "Queued"
                                            : s === "fetching"
                                            ? "Fetching"
                                            : s === "extracting"
                                            ? "Extracting"
                                            : s === "facting"
                                            ? "Facting"
                                            : "Done"}
                                    </span>
                                );
                            })}
                        </div>
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <p
                                    data-testid="processing-current-step"
                                    className="text-sm text-foreground truncate"
                                    title={label}
                                >
                                    {pendingMsg
                                        ? pendingMsg.main
                                        : job.current_step || (isFailed ? "Failed" : shortLabel)}
                                </p>
                                {pendingMsg?.hint && (
                                    <p
                                        data-testid="processing-pending-hint"
                                        className="text-xs text-muted-foreground mt-0.5"
                                    >
                                        {pendingMsg.hint}
                                    </p>
                                )}
                            </div>
                            {isDev && (job.status === "PENDING" || job.status === "RUNNING") && (
                                <button
                                    type="button"
                                    data-testid="processing-copy-debug"
                                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                    onClick={() => copyDebugInfo(job)}
                                    title="Copy debug info"
                                >
                                    <Copy className="w-3 h-3" />
                                    Copy debug
                                </button>
                            )}
                        </div>
                        {isFailed && (
                            <>
                                <div
                                    data-testid="processing-failed"
                                    className="flex flex-col gap-1 text-sm text-destructive"
                                >
                                    {(job.result_summary?.error_code || job.error_message) && (
                                        <span
                                            data-testid="processing-job-error-code"
                                            className="font-medium"
                                        >
                                            {errorCodeLabel(job.result_summary?.error_code ?? "UNSUPPORTED")}
                                        </span>
                                    )}
                                    <span
                                        data-testid="processing-job-error-message"
                                        className="text-destructive/90"
                                    >
                                        {job.result_summary?.error_message ??
                                            job.error_message ??
                                            "Processing failed"}
                                    </span>
                                    {isCaptionsUnavailable(job.result_summary?.error_code) && (
                                        <span className="text-muted-foreground text-xs block">
                                            Upload the audio file to add this source.
                                        </span>
                                    )}
                                </div>
                                <span data-testid="processing-retry">
                                    <Button
                                        data-testid="processing-job-retry"
                                        variant="outline"
                                        size="sm"
                                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                                        onClick={() => {
                                            const canonicalUrl =
                                                job.params?.canonical_url || job.params?.url || "";
                                            const sourceType = (job.params?.source_type || "WEB") as "WEB" | "REDDIT" | "YOUTUBE";
                                            if (canonicalUrl) onRetry(canonicalUrl, sourceType);
                                        }}
                                        disabled={!job.params?.url && !job.params?.canonical_url}
                                    >
                                        <RefreshCw className="w-3 h-3 mr-1" />
                                        Retry
                                    </Button>
                                </span>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
