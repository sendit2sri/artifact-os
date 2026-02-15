"use client";

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Download, X, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { exportProject, ExportFormat, fetchOutput } from "@/lib/api";

interface ExportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** When set, enables "Export last output (Markdown)" quick action */
  lastOutputId?: string | null;
}

export function ExportPanel({ open, onOpenChange, projectId, lastOutputId }: ExportPanelProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
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
                Facts CSV (with evidence)
              </Button>
              <Button
                data-testid="export-facts-md-evidence"
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleExport("markdown_evidence")}
                disabled={loading}
              >
                Facts Markdown (with evidence)
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
              <a
                data-testid="export-download"
                href={blobUrl}
                download={filename}
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Download className="w-4 h-4" />
                Download {filename}
              </a>
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
