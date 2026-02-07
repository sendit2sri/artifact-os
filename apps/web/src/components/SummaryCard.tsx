"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ChevronDown, ChevronUp, Pencil, Check, X } from "lucide-react";
import { updateJobSummary } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
    jobId: string;
    initialSummary: string | string[];
    title: string;
}

export function SummaryCard({ jobId, initialSummary, title }: SummaryCardProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(""); // Initialize empty
    const [isSaving, setIsSaving] = useState(false);

    // ✅ FIX: Sync state when props change (Navigating between pages)
    useEffect(() => {
        const rawText = Array.isArray(initialSummary)
            ? initialSummary.map(s => `• ${s}`).join("\n")
            : initialSummary || "";
        setText(rawText);
    }, [initialSummary, jobId]); // dependency on jobId ensures reset on nav

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateJobSummary(jobId, text);
            toast.success("Summary updated");
            setIsEditing(false);
        } catch (e) {
            toast.error("Failed to save summary");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white dark:bg-[#2A2A2A] rounded-lg border border-stone-200 dark:border-stone-700 shadow-sm overflow-hidden mb-4 transition-all animate-in fade-in">
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 bg-stone-50/50 dark:bg-stone-800/50 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                    <h4 className="text-sm font-semibold text-[#1F1F1F] dark:text-stone-100">Executive Summary</h4>
                    <span className="text-xs text-stone-400 dark:text-stone-500 font-normal border-l border-stone-300 dark:border-stone-700 pl-2 ml-1 truncate max-w-[200px]">
                        {title}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {!isEditing && isExpanded && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-400 dark:text-stone-500 hover:text-amber-600 dark:hover:text-amber-500" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                            <Pencil className="w-3 h-3" />
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-400 dark:text-stone-500">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="p-4 border-t border-stone-100 dark:border-stone-800">
                    {isEditing ? (
                        <div className="space-y-3">
                            <Textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                className="min-h-[120px] text-sm text-stone-700 dark:text-stone-100 bg-white dark:bg-[#1A1A1A] border-stone-200 dark:border-stone-700 font-serif leading-relaxed resize-none focus-visible:ring-amber-500 dark:focus-visible:ring-amber-600"
                            />
                            <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" className="text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100" onClick={() => setIsEditing(false)}>Cancel</Button>
                                <Button size="sm" className="bg-[#1F1F1F] dark:bg-stone-100 text-white dark:text-[#1F1F1F] hover:bg-[#2F2F2F] dark:hover:bg-stone-200" onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? "Saving..." : "Save Changes"}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="prose prose-sm max-w-none text-stone-700 dark:text-stone-300 font-serif leading-relaxed whitespace-pre-wrap cursor-text hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                            onClick={() => setIsEditing(true)}
                            title="Click to edit"
                        >
                            {text}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}