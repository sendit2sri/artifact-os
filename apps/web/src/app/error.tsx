"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="h-full flex flex-col items-center justify-center space-y-4 p-8 text-center">
      <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
        <AlertTriangle className="h-6 w-6 text-red-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Application Error</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {error.message || "Something went wrong. Please try again."}
        </p>
      </div>
      <Button onClick={() => reset()} variant="outline">
        Try Again
      </Button>
    </div>
  );
}
