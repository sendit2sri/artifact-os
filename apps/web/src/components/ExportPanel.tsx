"use client";

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Copy, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import { exportProject, ExportFormat, fetchOutput } from "@/lib/api";

export type ExportMode = "project" | "last_output";

interface ExportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** When set, enables Last output mode and Export as Markdown */
  lastOutputId?: string | null;
  /** Optional counts for "What's included" summary */
  factsCount?: number;
  sourcesCount?: number;
  outputsCount?: number;
}

export function ExportPanel({ open, onOpenChange, projectId, lastOutputId, factsCount, sourcesCount, outputsCount }: ExportPanelProps) {
  const [mode, setMode] = useState<ExportMode>("project");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [exportedContent, setExportedContent] = useState<string | null>(null);
  const [lastFormat, setLastFormat] = useState<ExportFormat | null>(null);
  const [lastOutputLoading, setLastOutputLoading] = useState(false);
  /** Used for Retry: which path produced the current success */
  const [lastExportMode, setLastExportMode] = useState<ExportMode | null>(null);

  const clearState = () => {
    setSuccess(false);
    setError(null);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    setFilename(null);
    setExportedContent(null);
    setLastFormat(null);
    setLastExportMode(null);
  };

  const handleClose = () => {
    clearState();
    onOpenChange(false);
  };

  const handleExport = async (format: ExportFormat) => {
    setLastFormat(format);
    setLastExportMode(null);
    setLoading(true);
    setError(null);
    setSuccess(false);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    try {
      const result = await exportProject(projectId, format);
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setFilename(result.filename);
      setExportedContent(result.content);
      setSuccess(true);
      setLastExportMode("project");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastExportMode === "last_output") {
      handleExportLastOutputMd();
    } else if (lastFormat) {
      handleExport(lastFormat);
    }
  };

  const handleExportLastOutputMd = async () => {
    if (!lastOutputId) return;
    setLastOutputLoading(true);
    setError(null);
    setSuccess(false);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    try {
      const output = await fetchOutput(lastOutputId);
      const content = output.content;
      const stableFilename = `project-${projectId}-output-${lastOutputId}.md`;
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setFilename(stableFilename);
      setExportedContent(content);
      setSuccess(true);
      setLastExportMode("last_output");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLastOutputLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!exportedContent) return;
    try {
      await navigator.clipboard.writeText(exportedContent);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const isProject = mode === "project";
  const projectSummaryParts: string[] = [];
  if (factsCount !== undefined) projectSummaryParts.push(`${factsCount} fact${factsCount !== 1 ? "s" : ""}`);
  if (sourcesCount !== undefined) projectSummaryParts.push(`${sourcesCount} source${sourcesCount !== 1 ? "s" : ""}`);
  const hasProjectSummary = projectSummaryParts.length > 0;
  const hasLastOutput = !!lastOutputId;
  const lastOutputDisabled = !lastOutputId;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        data-testid="export-panel"
        side="right"
        className="w-[320px] sm:w-[360px]"
        closeButtonTestId="export-close"
      >
        <div className="space-y-4">
          <h3 className="font-semibold text-foreground">Export</h3>

          {/* Mode switch */}
          <div className="flex rounded-lg border border-border p-0.5 bg-muted/30" role="tablist">
            <Button
              data-testid="export-mode-project"
              variant={isProject ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 rounded-md"
              onClick={() => setMode("project")}
            >
              Project
            </Button>
            <Button
              data-testid="export-mode-last-output"
              variant={!isProject ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 rounded-md"
              onClick={() => setMode("last_output")}
            >
              Last output
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isProject ? "Facts + sources from this project" : "Latest synthesis (Markdown)"}
          </p>

          {isProject && (
            <>
              {hasProjectSummary && (
                <p data-testid="export-whats-included" className="text-xs text-muted-foreground">
                  What&apos;s included: {projectSummaryParts.join(", ")}
                </p>
              )}
              <p className="text-xs font-medium text-muted-foreground">Formats</p>
              <div className="flex flex-col gap-2">
                <Button
                  data-testid="export-option-markdown"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("markdown")}
                  disabled={loading}
                >
                  Markdown
                </Button>
                <Button
                  data-testid="export-facts-md-evidence"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("markdown_evidence")}
                  disabled={loading}
                >
                  Markdown (with evidence)
                </Button>
                <Button
                  data-testid="export-option-json"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("json")}
                  disabled={loading}
                >
                  JSON
                </Button>
                <Button
                  data-testid="export-option-csv"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("csv")}
                  disabled={loading}
                >
                  CSV
                </Button>
                <Button
                  data-testid="export-facts-csv-evidence"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("csv_evidence")}
                  disabled={loading}
                >
                  CSV (with evidence)
                </Button>
              </div>
            </>
          )}

          {!isProject && (
            <>
              {hasLastOutput && (
                <p data-testid="export-whats-included" className="text-xs text-muted-foreground">
                  What&apos;s included: 1 output
                </p>
              )}
              <p className="text-xs font-medium text-muted-foreground">Format</p>
              <Button
                data-testid="export-last-output-md"
                variant="outline"
                className="w-full justify-start"
                onClick={handleExportLastOutputMd}
                disabled={lastOutputDisabled || loading || lastOutputLoading}
              >
                {lastOutputLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Export as Markdown
              </Button>
              {lastOutputDisabled && (
                <p data-testid="export-disabled-reason" className="text-xs text-muted-foreground">
                  Generate an output to export the latest synthesis.
                </p>
              )}
            </>
          )}

          {(loading || lastOutputLoading) && (
            <div data-testid="export-loading" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Exporting...
            </div>
          )}

          {success && blobUrl && filename && (
            <div
              data-testid="export-success"
              className="rounded-lg border border-border bg-muted/50 p-3 space-y-2"
            >
              <div className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                Export ready
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="export-copy"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleCopy}
                  disabled={!exportedContent}
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </Button>
                <a
                  data-testid="export-download"
                  href={blobUrl}
                  download={filename}
                  className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            </div>
          )}

          {error && (
            <div
              data-testid="export-error"
              className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2"
            >
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
              <Button
                data-testid="export-retry"
                variant="outline"
                size="sm"
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={handleRetry}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
