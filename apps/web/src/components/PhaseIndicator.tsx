"use client";

import { AppPhase, PhaseState, getPhaseMessage, getPhaseColor } from "@/lib/phase";
import { Loader2, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhaseIndicatorProps {
  phaseState: PhaseState;
  className?: string;
  variant?: "full" | "compact" | "badge";
}

/**
 * PhaseIndicator Component
 * 
 * Displays the current application phase with appropriate icon, color, and message.
 * 
 * Variants:
 * - full: Shows icon, title, description (for empty states)
 * - compact: Shows icon and title only (for toolbars)
 * - badge: Small badge with icon and phase name (for diagnostics)
 */
export function PhaseIndicator({ phaseState, className, variant = "compact" }: PhaseIndicatorProps) {
  const { phase, details } = phaseState;
  const message = getPhaseMessage(phaseState);
  const colors = getPhaseColor(phase);

  const icon = getPhaseIcon(phase);

  if (variant === "badge") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
          colors.bg,
          colors.text,
          colors.border,
          "border",
          className
        )}
        data-testid="phase-badge"
        data-phase={phase}
      >
        {icon}
        <span className="capitalize">{phase.toLowerCase()}</span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm",
          colors.text,
          className
        )}
        data-testid="phase-indicator-compact"
        data-phase={phase}
      >
        {icon}
        <span className="font-medium">{message.title}</span>
        {details.hasActiveWork && (
          <span className="text-xs text-muted-foreground">
            ({details.runningJobs + details.pendingJobs} active)
          </span>
        )}
      </div>
    );
  }

  // Full variant
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-8 px-4",
        className
      )}
      data-testid="phase-indicator-full"
      data-phase={phase}
    >
      <div className={cn("mb-4", colors.text)}>
        {getPhaseIconLarge(phase)}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {message.title}
      </h3>
      <p className="text-sm text-muted-foreground max-w-md">
        {message.description}
      </p>
      {details.hasErrors && phase !== "ERROR" && (
        <p className="text-xs text-warning mt-2">
          {details.failedJobs} source{details.failedJobs !== 1 ? 's' : ''} failed
        </p>
      )}
    </div>
  );
}

function getPhaseIcon(phase: AppPhase) {
  switch (phase) {
    case "EMPTY":
      return <FileText className="w-4 h-4" />;
    case "INGESTING":
    case "PROCESSING":
      return <Loader2 className="w-4 h-4 animate-spin" />;
    case "READY":
      return <CheckCircle2 className="w-4 h-4" />;
    case "ERROR":
      return <AlertTriangle className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
}

function getPhaseIconLarge(phase: AppPhase) {
  switch (phase) {
    case "EMPTY":
      return <FileText className="w-12 h-12" />;
    case "INGESTING":
    case "PROCESSING":
      return <Loader2 className="w-12 h-12 animate-spin" />;
    case "READY":
      return <CheckCircle2 className="w-12 h-12" />;
    case "ERROR":
      return <AlertTriangle className="w-12 h-12" />;
    default:
      return <FileText className="w-12 h-12" />;
  }
}

/**
 * Phase Progress Bar
 * 
 * Shows progress through jobs when in INGESTING or PROCESSING phase
 */
export function PhaseProgressBar({ phaseState }: { phaseState: PhaseState }) {
  const { phase, details } = phaseState;

  if (phase !== "INGESTING" && phase !== "PROCESSING") {
    return null;
  }

  const totalJobs = details.pendingJobs + details.runningJobs + details.completedJobs + details.failedJobs;
  const completedJobs = details.completedJobs + details.failedJobs;
  const progress = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

  return (
    <div className="w-full" data-testid="phase-progress-bar">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>
          {completedJobs} of {totalJobs} sources processed
        </span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Phase Status Line
 * 
 * Compact one-liner for showing phase in toolbars/headers
 */
export function PhaseStatusLine({ phaseState }: { phaseState: PhaseState }) {
  const { phase, details } = phaseState;
  const colors = getPhaseColor(phase);

  if (phase === "EMPTY" || phase === "READY") {
    return null; // Don't show status line in stable states
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
        colors.bg,
        colors.text,
        "border",
        colors.border
      )}
      data-testid="phase-status-line"
      data-phase={phase}
    >
      {getPhaseIcon(phase)}
      <span className="font-medium">
        {phase === "INGESTING" && `Processing ${details.sourcesCount} sources...`}
        {phase === "PROCESSING" && `${details.factsCount} facts extracted, ${details.runningJobs + details.pendingJobs} jobs remaining`}
        {phase === "ERROR" && `${details.failedJobs} sources failed`}
      </span>
    </div>
  );
}
