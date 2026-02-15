/**
 * Queued Watchdog
 * 
 * Detects jobs that are stuck in PENDING state for longer than expected
 * and provides user feedback + retry options.
 * 
 * A job is considered "stuck" if:
 * - Status is PENDING
 * - Created more than STUCK_THRESHOLD_MS ago
 * - Not expected to be queued (e.g., rate limiting, quota)
 */

export const STUCK_THRESHOLD_MS = 30000; // 30 seconds
export const WARNING_THRESHOLD_MS = 15000; // 15 seconds (soft warning)

export interface Job {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  created_at: string;
  error_message?: string;
  source_url?: string;
}

export interface StuckJob extends Job {
  queuedFor: number; // milliseconds
  isStuck: boolean;
  isWarning: boolean;
  message: string;
  action: "retry" | "diagnose" | "wait";
}

/**
 * Check if a job is stuck in PENDING state
 */
export function isJobStuck(job: Job, now: number = Date.now()): boolean {
  if (job.status !== "PENDING") return false;
  
  const createdAt = new Date(job.created_at).getTime();
  const elapsed = now - createdAt;
  
  return elapsed > STUCK_THRESHOLD_MS;
}

/**
 * Check if a job should show a warning (queued longer than expected)
 */
export function isJobWarning(job: Job, now: number = Date.now()): boolean {
  if (job.status !== "PENDING") return false;
  
  const createdAt = new Date(job.created_at).getTime();
  const elapsed = now - createdAt;
  
  return elapsed > WARNING_THRESHOLD_MS && elapsed <= STUCK_THRESHOLD_MS;
}

/**
 * Safe parse of created_at. Returns elapsed ms or null if invalid/future/missing.
 * Handles: missing, non-ISO, clock skew (future dates), Invalid Date.
 */
export function getJobQueuedTimeSafe(job: Job, now: number = Date.now()): number | null {
  const raw = job?.created_at;
  if (raw == null || typeof raw !== "string") return null;

  const createdAt = new Date(raw).getTime();
  if (Number.isNaN(createdAt)) return null;

  const elapsed = now - createdAt;
  // Future or absurdly old (>1 year) → fail safe
  if (elapsed < 0 || elapsed > 365 * 24 * 60 * 60 * 1000) return null;

  return elapsed;
}

/**
 * Get elapsed time for a job in milliseconds (unsafe, for backward compat).
 * Prefer getJobQueuedTimeSafe for production.
 */
export function getJobQueuedTime(job: Job, now: number = Date.now()): number {
  const result = getJobQueuedTimeSafe(job, now);
  return result ?? 0;
}

/**
 * Analyze all jobs and return stuck/warning jobs
 */
export function analyzeQueuedJobs(jobs: Job[], now: number = Date.now()): {
  stuck: StuckJob[];
  warning: StuckJob[];
  healthy: Job[];
} {
  const stuck: StuckJob[] = [];
  const warning: StuckJob[] = [];
  const healthy: Job[] = [];

  for (const job of jobs) {
    if (job.status !== "PENDING") {
      healthy.push(job);
      continue;
    }

    const queuedFor = getJobQueuedTimeSafe(job, now);
    if (queuedFor == null) continue; // Invalid/missing/future → skip (fail safe, no crash)
    const isStuck = queuedFor > STUCK_THRESHOLD_MS;
    const isWarning = queuedFor > WARNING_THRESHOLD_MS && queuedFor <= STUCK_THRESHOLD_MS;

    if (isStuck) {
      stuck.push({
        ...job,
        queuedFor,
        isStuck: true,
        isWarning: false,
        message: getStuckMessage(queuedFor),
        action: getRecommendedAction(queuedFor),
      });
    } else if (isWarning) {
      warning.push({
        ...job,
        queuedFor,
        isStuck: false,
        isWarning: true,
        message: getWarningMessage(queuedFor),
        action: "wait",
      });
    } else {
      healthy.push(job);
    }
  }

  return { stuck, warning, healthy };
}

/**
 * Get human-readable message for stuck job
 */
function getStuckMessage(queuedFor: number): string {
  const seconds = Math.floor(queuedFor / 1000);
  
  if (seconds < 60) {
    return `Queued for ${seconds}s (longer than expected)`;
  }
  
  const minutes = Math.floor(seconds / 60);
  return `Queued for ${minutes}m (stuck)`;
}

/**
 * Get human-readable warning message
 */
function getWarningMessage(queuedFor: number): string {
  const seconds = Math.floor(queuedFor / 1000);
  return `Queued for ${seconds}s (taking longer than usual)`;
}

/**
 * Get recommended action for stuck job
 */
function getRecommendedAction(queuedFor: number): "retry" | "diagnose" | "wait" {
  const minutes = Math.floor(queuedFor / 1000 / 60);
  
  // Over 2 minutes = definitely stuck, recommend retry
  if (minutes >= 2) {
    return "retry";
  }
  
  // Over 1 minute = likely stuck, recommend diagnose
  if (minutes >= 1) {
    return "diagnose";
  }
  
  // 30s-1m = warning, recommend wait a bit more
  return "wait";
}

/**
 * Format elapsed time for display. Returns "unknown" for invalid/NaN.
 */
export function formatQueuedTime(ms: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "unknown";
  const seconds = Math.floor(ms / 1000);
  
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Get color scheme for stuck/warning states
 */
export function getQueuedJobColor(job: StuckJob): {
  bg: string;
  text: string;
  border: string;
} {
  if (job.isStuck) {
    return {
      bg: "bg-destructive/10",
      text: "text-destructive",
      border: "border-destructive/30",
    };
  }
  
  if (job.isWarning) {
    return {
      bg: "bg-warning/10",
      text: "text-warning",
      border: "border-warning/30",
    };
  }
  
  return {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
  };
}

/**
 * Hook-like helper for monitoring queued jobs
 * Returns analysis updated every second
 */
export function useQueuedJobsMonitor(jobs: Job[]) {
  return analyzeQueuedJobs(jobs);
}
