"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchOutput, fetchOutputEvidenceMap, type OutputEvidenceMapResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { OutputQualityBanner } from "@/components/OutputQualityBanner";
import { ArrowLeft, Copy, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const MODE_TITLES: Record<string, string> = {
  paragraph: "Paragraph",
  research_brief: "Research Brief",
  script_outline: "Script Outline",
  split: "Split Sections",
  split_sections: "Split Sections",
};

function parseSections(content: string): { index: number; title: string; text: string }[] {
  const sections: { index: number; title: string; text: string }[] = [];
  const parts = content.split(/\r?\n(?=## Section \d+:)/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^## Section (\d+):\s*(.+?)(?:\n|$)/);
    if (match) {
      const num = parseInt(match[1], 10);
      const title = match[2].trim();
      sections.push({ index: num, title, text: trimmed });
    }
  }
  return sections.length > 0 ? sections : [];
}

export default function OutputSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: outputId } = use(params);
  const router = useRouter();
  const [output, setOutput] = useState<Awaited<ReturnType<typeof fetchOutput>> | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<OutputEvidenceMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOutput(outputId)
      .then(setOutput)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [outputId]);

  useEffect(() => {
    if (!output?.id || !(output.fact_ids?.length)) {
      setEvidenceMap(null);
      return;
    }
    fetchOutputEvidenceMap(output.id)
      .then(setEvidenceMap)
      .catch(() => setEvidenceMap(null));
  }, [output?.id, output?.fact_ids?.length]);

  const handleCopyLink = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (url) {
      navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  if (loading) {
    return (
      <div data-testid="output-page" className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !output) {
    return (
      <div data-testid="output-page" className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-destructive">{error || "Output not found"}</p>
        <Button variant="outline" onClick={() => router.push("/")}>Go home</Button>
      </div>
    );
  }

  const titleLabel = MODE_TITLES[output.mode] || MODE_TITLES[output.output_type] || output.title;
  const isSplitMode = output.mode === "split" || output.mode === "split_sections";
  const sections = isSplitMode ? parseSections(output.content) : [];

  return (
    <div data-testid="output-page" className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            {output.project_id && (
              <Link href={`/project/${output.project_id}`}>
                <Button data-testid="output-page-back" variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back to project
                </Button>
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button data-testid="output-page-copy-link" variant="outline" size="sm" onClick={handleCopyLink}>
              <Copy className="w-4 h-4 mr-2" />
              Copy link
            </Button>
          </div>
        </div>

        <h1 data-testid="output-page-title" className="flex items-center gap-2 text-xl font-semibold text-foreground mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
          {titleLabel}
        </h1>

        <div data-testid="output-page-meta" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mb-6">
          <span>{output.fact_ids?.length ?? 0} facts</span>
          <span>{output.source_count} sources</span>
          {output.quality_stats && (
            <span>
              Used: {output.quality_stats.total} facts (
              {output.quality_stats.approved} approved · {output.quality_stats.needs_review} needs review · {output.quality_stats.flagged} flagged
              {output.quality_stats.rejected > 0 && ` · ${output.quality_stats.rejected} rejected`}
              )
              {output.quality_stats.pinned > 0 && ` · Pinned used: ${output.quality_stats.pinned}`}
            </span>
          )}
          <span>·</span>
          <span>{new Date(output.created_at).toLocaleDateString()}</span>
        </div>

        {output.quality_stats && (
          <div className="mb-6">
            <OutputQualityBanner output={output} mode="share" />
          </div>
        )}

        {(output.fact_ids?.length ?? 0) > 0 && (
          <div data-testid="output-page-evidence-map" className="mb-8 rounded-lg border border-border bg-muted/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-medium text-foreground">
                Evidence Map ({evidenceMap?.facts?.length ?? output.fact_ids?.length ?? 0} facts)
              </h2>
            </div>
            <div className="p-4">
              {evidenceMap?.facts?.length ? (
                <ul className="space-y-4">
                  {evidenceMap.facts.map((f) => (
                    <li
                      key={f.id}
                      data-testid="output-page-evidence-item"
                      className="rounded-md border border-border bg-background/80 p-3 space-y-2"
                    >
                      <p className="text-sm text-foreground line-clamp-2 leading-relaxed">{f.fact_text}</p>
                      {f.evidence_snippet?.trim() && (
                        <p className="text-xs text-muted-foreground leading-relaxed" data-testid="output-page-evidence-snippet">
                          {f.evidence_snippet.trim()}
                        </p>
                      )}
                      {f.source_url && (
                        <a
                          href={f.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          data-testid="output-page-evidence-open-source"
                        >
                          Open source
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground py-2">Loading evidence map…</p>
              )}
            </div>
          </div>
        )}

        <div data-testid="output-page-content" className="prose prose-slate dark:prose-invert max-w-none">
          {sections.length > 0 ? (
            <div>
              {sections.map((s) => (
                <div key={s.index} className="mb-6">
                  <pre className="whitespace-pre-wrap font-sans text-base text-foreground leading-relaxed">
                    {s.text}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-base text-foreground leading-relaxed">
              {output.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
