"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Clock, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { analyzeQueuedJobs, formatQueuedTime, getQueuedJobColor, type StuckJob } from "@/lib/queuedWatchdog";

interface Job {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  created_at: string;
  error_message?: string;
  source_url?: string;
}

interface QueuedJobAlertProps {
  jobs: Job[];
  onRetry?: (jobId: string) => void | Promise<void>;
  className?: string;
}

/**
 * QueuedJobAlert Component
 * 
 * Displays warnings for jobs that are stuck in PENDING state
 * Updates every second to show accurate elapsed time.
 * Interval uses empty deps to avoid multiplication on re-renders.
 */
export function QueuedJobAlert({ jobs, onRetry, className }: QueuedJobAlertProps) {
  // Use 0 for SSR to avoid hydration mismatch (#418); set real value after mount
  const [now, setNow] = useState(0);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleRetry = useCallback(
    async (jobId: string) => {
      if (!onRetry || retryingJobId) return;
      setRetryingJobId(jobId);
      try {
        await Promise.resolve(onRetry(jobId));
        // Success: alert will auto-dismiss when job state changes (React Query refetch)
      } catch {
        // Failure: keep alert visible, parent should show toast
        setRetryingJobId(null);
      } finally {
        setRetryingJobId(null);
      }
    },
    [onRetry, retryingJobId]
  );

  const analysis = analyzeQueuedJobs(jobs, now);
  const { stuck, warning } = analysis;

  if (stuck.length === 0 && warning.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)} data-testid="queued-job-alert">
      {stuck.map((job) => (
        <StuckJobCard
          key={job.id}
          job={job}
          onRetry={onRetry ? handleRetry : undefined}
          isRetrying={retryingJobId === job.id}
        />
      ))}
      {warning.map((job) => (
        <WarningJobCard key={job.id} job={job} />
      ))}
    </div>
  );
}

/**
 * Stuck Job Card (critical - action required)
 */
function StuckJobCard({ job, onRetry, isRetrying }: { job: StuckJob; onRetry?: (jobId: string) => void | Promise<void>; isRetrying?: boolean }) {
  const colors = getQueuedJobColor(job);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border",
        colors.bg,
        colors.border
      )}
      data-testid={`stuck-job-${job.id}`}
    >
      <AlertTriangle className={cn("w-5 h-5 flex-shrink-0 mt-0.5", colors.text)} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("text-sm font-medium", colors.text)}>
            Source stuck in queue
          </span>
          <span className="text-xs text-muted-foreground">
            {formatQueuedTime(job.queuedFor)}
          </span>
        </div>
        
        {job.source_url && (
          <p className="text-xs text-muted-foreground truncate mb-2">
            {job.source_url}
          </p>
        )}
        
        <p className="text-xs text-muted-foreground mb-3">
          {job.message}. This may indicate a server issue or rate limiting.
        </p>
        
        <div className="flex items-center gap-2">
          {onRetry && (
            <Button
              size="sm"
              variant="outline"
              className={cn("h-8 text-xs", colors.text, "border-current hover:bg-current/10")}
              onClick={() => onRetry(job.id)}
              disabled={isRetrying}
              data-testid={`retry-job-${job.id}`}
            >
              {isRetrying ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              {isRetrying ? "Retrying…" : "Retry"}
            </Button>
          )}
          
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground"
            asChild
          >
            <a
              href="/docs/troubleshooting#stuck-jobs"
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`diagnose-job-${job.id}`}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Troubleshoot
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Warning Job Card (soft warning - informational)
 */
function WarningJobCard({ job }: { job: StuckJob }) {
  const colors = getQueuedJobColor(job);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border",
        colors.bg,
        colors.border
      )}
      data-testid={`warning-job-${job.id}`}
    >
      <Clock className={cn("w-4 h-4 flex-shrink-0 mt-0.5", colors.text)} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-medium", colors.text)}>
            {job.message}
          </span>
        </div>
        
        {job.source_url && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {job.source_url}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Compact variant for toolbars/headers
 */
export function QueuedJobBadge({ jobs }: { jobs: Job[] }) {
  // Use 0 for SSR to avoid hydration mismatch (#418); set real value after mount
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const analysis = analyzeQueuedJobs(jobs, now);
  const { stuck } = analysis;

  if (stuck.length === 0) {
    return null;
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/30"
      data-testid="queued-job-badge"
    >
      <AlertTriangle className="w-3 h-3" />
      <span>{stuck.length} stuck in queue</span>
    </div>
  );
}
