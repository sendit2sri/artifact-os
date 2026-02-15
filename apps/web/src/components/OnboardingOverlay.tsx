"use client";

import { Button } from "@/components/ui/button";
import { Z } from "@/lib/tokens";
import { X } from "lucide-react";

const ONBOARDING_STORAGE_KEY = "artifact_onboarding_completed_v1";

const STEPS: { title: string; description: string }[] = [
    { title: "Add a Source", description: "Paste a URL or upload a file to extract facts." },
    { title: "Facts appear here", description: "Extracted facts will show in the list below." },
    { title: "Select facts", description: "Use the checkbox on each fact card to select items for synthesis." },
    { title: "Generate synthesis", description: "Click Generate in the floating bar to create an output." },
    { title: "Review outputs & history", description: "Use Last Output and History to view past syntheses." },
];

export function getOnboardingCompleted(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

export function setOnboardingCompleted(): void {
    try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } catch (_) {}
}

interface OnboardingOverlayProps {
    open: boolean;
    onClose: () => void;
    step: number;
    onStepChange: (step: number) => void;
    onSkip: () => void;
    variant?: "overlay" | "inline";
}

export function OnboardingOverlay({ open, onClose, step, onStepChange, onSkip, variant = "overlay" }: OnboardingOverlayProps) {
    if (!open) return null;

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const handleNext = () => {
        if (isLast) {
            setOnboardingCompleted();
            onClose();
        } else {
            onStepChange(step + 1);
        }
    };

    const handleSkip = () => {
        setOnboardingCompleted();
        onSkip();
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            setOnboardingCompleted();
            onClose();
        }
    };

    // Inline variant (for empty state integration)
    if (variant === "inline") {
        return (
            <div
                data-testid="onboarding-inline"
                className="bg-muted/30 border border-border rounded-lg p-6 max-w-2xl mx-auto"
                role="region"
                aria-label="Quick start guide"
            >
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-foreground mb-1">Quick Start</h3>
                        <p className="text-sm text-muted-foreground">Get started in 4 simple steps</p>
                    </div>
                    <button
                        type="button"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => {
                            setOnboardingCompleted();
                            onClose();
                        }}
                        aria-label="Dismiss quick start"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="grid gap-3">
                    {STEPS.map((s, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-3 text-sm"
                        >
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                                {i + 1}
                            </div>
                            <div>
                                <div className="font-medium text-foreground">{s.title}</div>
                                <div className="text-muted-foreground text-xs mt-0.5">{s.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Overlay variant (original modal)
    return (
        <div
            data-testid="onboarding-overlay"
            className={`fixed inset-0 ${Z.overlay} bg-black/30 flex items-end sm:items-center justify-center p-4 sm:p-6`}
            onClick={handleBackdropClick}
            role="dialog"
            aria-label="Onboarding tour"
        >
            <div
                className="bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-md flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                            Step {step + 1} of {STEPS.length}
                        </p>
                        <h2 data-testid="onboarding-step-title" className="text-lg font-semibold text-foreground">
                            {current.title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => {
                            setOnboardingCompleted();
                            onClose();
                        }}
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-sm text-muted-foreground">{current.description}</p>
                <div className="flex items-center justify-between gap-2 pt-2">
                    <Button
                        data-testid="onboarding-skip"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={handleSkip}
                    >
                        Skip
                    </Button>
                    <Button data-testid="onboarding-next" size="sm" onClick={handleNext}>
                        {isLast ? "Finish" : "Next"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
