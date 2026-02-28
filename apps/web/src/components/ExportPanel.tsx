"use client";

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Copy, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import { exportProject, ExportFormat, fetchOutput } from "@/lib/api";

interface ExportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** When set, enables "Export last output (Markdown)" quick action */
  lastOutputId?: string | null;
  /** Optional counts for "What's included" summary */
  factsCount?: number;
  sourcesCount?: number;
  outputsCount?: number;
}

export function ExportPanel({ open, onOpenChange, projectId, lastOutputId, factsCount, sourcesCount, outputsCount }: ExportPanelProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [exportedContent, setExportedContent] = useState<string | null>(null);
  const [lastFormat, setLastFormat] = useState<ExportFormat | null>(null);
  const [lastOutputLoading, setLastOutputLoading] = useState(false);

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
  };

  const handleClose = () => {
    clearState();
    onOpenChange(false);
  };

  const handleExport = async (format: ExportFormat) => {
    setLastFormat(format);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastFormat) handleExport(lastFormat);
  };

  const handleExportLastOutputMd = async () => {
    if (!lastOutputId) return;
    setLastOutputLoading(true);
    setError(null);
    try {
      const output = await fetchOutput(lastOutputId);
      const blob = new Blob([output.content], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(output.title || "output").replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLastOutputLoading(false);
    }
  };

  const hasQuickActions = !!lastOutputId;
  const quickDisabled = !lastOutputId;
  const hasCounts = factsCount !== undefined || sourcesCount !== undefined || outputsCount !== undefined;
  const summaryParts: string[] = [];
  if (factsCount !== undefined) summaryParts.push(`${factsCount} fact${factsCount !== 1 ? "s" : ""}`);
  if (sourcesCount !== undefined) summaryParts.push(`${sourcesCount} source${sourcesCount !== 1 ? "s" : ""}`);
  if (outputsCount !== undefined) summaryParts.push(`${outputsCount} output${outputsCount !== 1 ? "s" : ""}`);

  const handleCopy = async () => {
    if (!exportedContent) return;
    try {
      await navigator.clipboard.writeText(exportedContent);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

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

          {hasCounts && summaryParts.length > 0 && (
            <p data-testid="export-whats-included" className="text-xs text-muted-foreground">
              What&apos;s included: {summaryParts.join(", ")}
            </p>
          )}

          {(filename || hasQuickActions) && (
            <p data-testid="export-filename-preview" className="text-xs text-muted-foreground truncate">
              {filename ?? "Last output → .md"}
            </p>
          )}

          {hasQuickActions && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Quick actions</p>
              <div className="flex flex-col gap-2">
                <Button
                  data-testid="export-last-output-md"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleExportLastOutputMd}
                  disabled={quickDisabled || loading || lastOutputLoading}
                >
                  {lastOutputLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                  Last output (Markdown)
                </Button>
                <Button
                  data-testid="export-facts-csv"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("csv")}
                  disabled={loading}
                >
                  Facts CSV
                </Button>
              </div>
              {quickDisabled && (
                <p data-testid="export-disabled-reason" className="text-xs text-muted-foreground">
                  Generate an output to export as Markdown.
                </p>
              )}
            </div>
          )}

          {!lastOutputId && (
            <p data-testid="export-disabled-reason" className="text-xs text-muted-foreground">
              Generate an output to use quick export. Or export full project below.
            </p>
          )}

          {loading && (
            <div data-testid="export-loading" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Exporting...
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Full project</p>
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
          </div>

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
