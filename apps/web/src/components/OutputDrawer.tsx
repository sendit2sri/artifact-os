"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, Sparkles, X } from "lucide-react";
import { Output } from "@/lib/api";
import { toast } from "sonner";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    output: Output | null;
}

export function OutputDrawer({ open, onOpenChange, output }: Props) {
    if (!output) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(output.content);
        toast.success("Copied to clipboard");
    };

    const handleDownload = () => {
        const blob = new Blob([output.content], { type: "text/markdown;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${output.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
        link.click();
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                data-testid="output-drawer"
                role="dialog"
                side="right"
                className="w-[600px] sm:w-[700px] flex flex-col p-0 gap-0 shadow-2xl border-l border-border bg-surface"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm flex justify-between items-start shrink-0">
                    <div className="flex-1 min-w-0">
                        <SheetTitle className="flex items-center gap-2 text-foreground text-lg">
                            <Sparkles className="w-5 h-5 text-primary" />
                            <span className="truncate">{output.title}</span>
                        </SheetTitle>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span>{output.source_count} sources</span>
                            <span>·</span>
                            <span>{output.fact_ids.length} facts</span>
                            <span>·</span>
                            <span>{new Date(output.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <ScrollArea className="flex-1 bg-surface">
                    <div className="p-8 md:p-12">
                        <div
                            className="prose prose-slate dark:prose-invert prose-lg max-w-none leading-relaxed"
                            style={{
                                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                                lineHeight: "1.75"
                            }}
                        >
                            <pre
                                data-testid="output-drawer-content"
                                className="whitespace-pre-wrap font-sans text-base text-foreground leading-relaxed"
                            >
                                {output.content}
                            </pre>
                        </div>
                    </div>
                </ScrollArea>

                {/* Footer Actions */}
                <div className="p-4 border-t border-border bg-surface-2/50 backdrop-blur-sm flex items-center gap-2 shrink-0">
                    <Button
                        data-testid="output-drawer-copy"
                        variant="outline"
                        onClick={handleCopy}
                        className="flex-1"
                    >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                    </Button>
                    <Button
                        data-testid="output-drawer-download"
                        variant="outline"
                        onClick={handleDownload}
                        className="flex-1"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                    </Button>
                    <Button
                        data-testid="output-drawer-close"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
