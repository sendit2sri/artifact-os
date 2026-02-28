"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Plus, UploadCloud, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AddSourceSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    inputType: "url" | "file" | "query";
    setInputType: (t: "url" | "file" | "query") => void;
    urlInput: string;
    setUrlInput: (v: string) => void;
    setAddUrlError: (v: string | null) => void;
    selectedFile: File | null;
    setSelectedFile: (f: File | null) => void;
    addUrlError: string | null;
    isValidUrl: boolean;
    onAddUrl: () => void;
    onUpload: () => void;
    isAddPending: boolean;
    isUploadPending: boolean;
    /** When true, show Query tab and query form. */
    showQueryTab?: boolean;
    queryInput?: string;
    setQueryInput?: (v: string) => void;
    onQuerySubmit?: () => void;
    isQueryPending?: boolean;
    queryError?: string | null;
    setQueryError?: (v: string | null) => void;
}

export function AddSourceSheet({
    open,
    onOpenChange,
    inputType,
    setInputType,
    urlInput,
    setUrlInput,
    setAddUrlError,
    selectedFile,
    setSelectedFile,
    addUrlError,
    isValidUrl,
    onAddUrl,
    onUpload,
    isAddPending,
    isUploadPending,
    showQueryTab = false,
    queryInput = "",
    setQueryInput,
    onQuerySubmit,
    isQueryPending = false,
    queryError = null,
    setQueryError,
}: AddSourceSheetProps) {
    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUrlInput(e.target.value);
        setAddUrlError(null);
    };
    const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQueryInput?.(e.target.value);
        setQueryError?.(null);
    };
    const canSubmitQuery = (queryInput || "").trim().length > 0 && (queryInput || "").trim().length <= 500;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-2xl" data-testid="add-source-sheet">
                <SheetHeader>
                    <SheetTitle>Add source</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 pt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source type</p>
                    <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5 w-fit border border-border/60">
                        <button
                            type="button"
                            onClick={() => setInputType("url")}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                inputType === "url" ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            URL
                        </button>
                        <button
                            type="button"
                            onClick={() => setInputType("file")}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                inputType === "file" ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Upload
                        </button>
                        {showQueryTab && (
                            <button
                                type="button"
                                onClick={() => setInputType("query")}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                    inputType === "query" ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Query
                            </button>
                        )}
                    </div>
                    {inputType === "url" ? (
                        <>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">URL</label>
                                <Input
                                    data-testid="add-source-sheet-url-input"
                                    placeholder="Paste a source URL..."
                                    value={urlInput}
                                    onChange={handleUrlChange}
                                    className="h-9 text-sm bg-muted/30 border-border/80 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                                />
                                {(addUrlError || (urlInput.trim() && !isValidUrl)) && (
                                    <p className="text-xs text-destructive">
                                        {addUrlError || "Invalid URL. Must start with http:// or https://"}
                                    </p>
                                )}
                            </div>
                            <Button
                                data-testid="add-source-sheet-submit"
                                data-variant="primary"
                                size="sm"
                                className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-medium focus-visible:ring-2 focus-visible:ring-ring/30"
                                onClick={onAddUrl}
                                disabled={isAddPending || !isValidUrl}
                            >
                                {isAddPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4 mr-2" /> Add source
                                    </>
                                )}
                            </Button>
                        </>
                    ) : inputType === "query" ? (
                        <>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Search query</label>
                                <Input
                                    data-testid="add-source-sheet-query-input"
                                    placeholder="e.g. climate change 2024 studies"
                                    value={queryInput}
                                    onChange={handleQueryChange}
                                    className="h-9 text-sm bg-muted/30 border-border/80 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                                />
                                {queryError && <p className="text-xs text-destructive">{queryError}</p>}
                                {(queryInput || "").trim().length > 500 && (
                                    <p className="text-xs text-destructive">Query must be at most 500 characters</p>
                                )}
                            </div>
                            <Button
                                data-testid="add-source-sheet-query-submit"
                                data-variant="primary"
                                size="sm"
                                className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-medium focus-visible:ring-2 focus-visible:ring-ring/30"
                                onClick={onQuerySubmit}
                                disabled={isQueryPending || !canSubmitQuery}
                            >
                                {isQueryPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Search className="w-4 h-4 mr-2" /> Search and add sources
                                    </>
                                )}
                            </Button>
                        </>
                    ) : (
                        <>
                            <label className="text-xs font-medium text-muted-foreground">File</label>
                            <Input
                                type="file"
                                accept=".pdf,.txt,.md,.mp3,.wav,.m4a,.webm,.ogg,.mp4,.m4v,.mov"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                                className="h-9 text-sm bg-muted/30 border-border/80 file:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                            />
                            <Button
                                data-variant="primary"
                                size="sm"
                                className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-medium focus-visible:ring-2 focus-visible:ring-ring/30"
                                onClick={onUpload}
                                disabled={isUploadPending || !selectedFile}
                            >
                                {isUploadPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <UploadCloud className="w-4 h-4 mr-2" /> Upload
                                    </>
                                )}
                            </Button>
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
