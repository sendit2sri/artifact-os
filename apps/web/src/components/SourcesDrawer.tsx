"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SourceTracker } from "@/components/SourceTracker";

export interface SourcesDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string;
    activeFilter: { type: "DOMAIN" | "URL" | null; value: string | null };
    onSelect: (type: "DOMAIN" | "URL" | null, value: string | null) => void;
    highlightCanonicalUrl?: string | null;
}

export function SourcesDrawer({
    open,
    onOpenChange,
    projectId,
    activeFilter,
    onSelect,
    highlightCanonicalUrl,
}: SourcesDrawerProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="left" className="w-full max-w-[min(90vw,24rem)] flex flex-col p-0" data-testid="sources-drawer">
                <SheetHeader className="p-4 border-b border-border shrink-0">
                    <SheetTitle className="text-base">Active Sources</SheetTitle>
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                    <SourceTracker
                        projectId={projectId}
                        activeFilter={activeFilter}
                        onSelect={(type, value) => {
                            onSelect(type, value);
                            onOpenChange(false);
                        }}
                        highlightCanonicalUrl={highlightCanonicalUrl}
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
}
