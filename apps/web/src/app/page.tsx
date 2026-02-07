"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProject } from "@/lib/api";
import { Loader2, Sparkles, ShieldCheck, FileUp, Zap } from "lucide-react";
import { toast } from "sonner";

export default function HomePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [url, setUrl] = useState("");

    const handleStart = async () => {
        console.log("handleStart called"); // Debug log
        try {
            setLoading(true);
            console.log("Creating project..."); // Debug log
            
            const project = await createProject(
                "123e4567-e89b-12d3-a456-426614174000",
                "New Research Project"
            );
            
            console.log("Project created:", project.id); // Debug log
            
            // Pass URL as query param if provided
            const targetUrl = url.trim()
                ? `/project/${project.id}?ingest=${encodeURIComponent(url.trim())}`
                : `/project/${project.id}`;
            
            console.log("Navigating to:", targetUrl); // Debug log
            router.push(targetUrl);
        } catch (e) {
            console.error("Error in handleStart:", e);
            toast.error(e instanceof Error ? e.message : "Failed to create project. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FAFAF9] dark:bg-[#1A1A1A] transition-colors">
            {/* Minimal Top Bar */}
            <header className="h-16 flex items-center justify-between px-6 lg:px-8 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-[#242424]/80 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 dark:from-stone-700 dark:to-stone-600 text-white grid place-items-center shadow-sm">
                        <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="font-semibold text-[#1F1F1F] dark:text-stone-100 tracking-tight">Artifact OS</div>
                </div>
            </header>

            {/* Centered Hero Section */}
            <main className="max-w-4xl mx-auto px-6 lg:px-8 pt-20 pb-16">
                <div className="text-center space-y-6">
                    {/* Headline */}
                    <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-[#1F1F1F] dark:text-stone-100 leading-[1.1]">
                        Turn messy sources<br />into clear artifacts.
                    </h1>

                    {/* Subtext */}
                    <p className="text-lg text-stone-600 dark:text-stone-400 max-w-2xl mx-auto leading-relaxed">
                        Paste a URL, extract key claims, and verify citations in seconds.<br />
                        Research with confidence and traceability.
                    </p>

                    {/* Action Box - Search Bar Style */}
                    <div className="max-w-2xl mx-auto pt-4">
                        <div className="flex flex-col sm:flex-row gap-3 p-3 bg-white dark:bg-[#2A2A2A] rounded-full shadow-lg border border-stone-200 dark:border-stone-700">
                            <Input
                                type="url"
                                placeholder="Paste a URL or start a new project..."
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !loading) {
                                        handleStart();
                                    }
                                }}
                                className="flex-1 h-12 px-6 border-0 focus-visible:ring-0 text-base bg-transparent dark:text-stone-100 dark:placeholder:text-stone-500"
                            />
                            <Button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    console.log("Button clicked!"); // Debug log
                                    handleStart();
                                }}
                                disabled={loading}
                                className="h-12 px-8 rounded-full bg-[#1F1F1F] dark:bg-stone-100 hover:bg-[#2F2F2F] dark:hover:bg-stone-200 text-white dark:text-[#1F1F1F] shadow-sm"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Starting...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        Start Research
                                    </>
                                )}
                            </Button>
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-400 mt-3">
                            Support for URLs, PDFs, and Markdown files (Press Enter to start)
                        </p>
                    </div>

                    {/* Feature Pills */}
                    <div className="flex flex-wrap justify-center gap-3 pt-8">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-[#2A2A2A] border border-stone-200 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-300 shadow-sm">
                            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                            Citation verification
                        </div>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-[#2A2A2A] border border-stone-200 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-300 shadow-sm">
                            <Zap className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                            AI-powered synthesis
                        </div>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-[#2A2A2A] border border-stone-200 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-300 shadow-sm">
                            <FileUp className="h-4 w-4 text-blue-600 dark:text-blue-500" />
                            Multi-format support
                        </div>
                    </div>
                </div>

                {/* Recent Projects / Empty State */}
                <div className="mt-24">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-stone-100 tracking-tight">Recent Projects</h2>
                    </div>

                    {/* Empty State */}
                    <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#2A2A2A] p-12 text-center">
                        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800 mb-4">
                            <Sparkles className="h-8 w-8 text-stone-400 dark:text-stone-500" />
                        </div>
                        <p className="text-stone-600 dark:text-stone-300 font-medium mb-2">No projects yet</p>
                        <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">
                            Create your first research project to start extracting and organizing insights from your sources.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
