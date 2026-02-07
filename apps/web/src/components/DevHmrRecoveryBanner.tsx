"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, X } from "lucide-react";

/**
 * Dev HMR Recovery Banner - STEP #12
 * 
 * Detects ChunkLoadError and shows non-blocking banner with refresh option
 * Prevents dev disruption caused by Turbopack HMR client failures
 * 
 * Features:
 * - Global error listener for ChunkLoadError
 * - Non-blocking banner UI
 * - One-click hard refresh
 * - Auto-reload with guard to prevent infinite loops
 * - Lightweight logging to localStorage
 */

export function DevHmrRecoveryBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    // Only run in development
    if (process.env.NODE_ENV !== 'development') return;

    const handleError = (event: ErrorEvent) => {
      const error = event.error;
      
      // Detect ChunkLoadError (Webpack/Turbopack dynamic import failures)
      const isChunkError = 
        error?.name === 'ChunkLoadError' ||
        error?.message?.includes('ChunkLoadError') ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Failed to fetch dynamically imported module');

      if (isChunkError) {
        console.warn('🔧 ChunkLoadError detected - dev bundle may be out of sync');
        
        // Log to localStorage for debugging
        const timestamp = new Date().toISOString();
        const logKey = 'dev_chunk_errors';
        const existingLogs = localStorage.getItem(logKey);
        const logs = existingLogs ? JSON.parse(existingLogs) : [];
        logs.push({ timestamp, message: error.message });
        
        // Keep only last 10 errors
        if (logs.length > 10) {
          logs.shift();
        }
        localStorage.setItem(logKey, JSON.stringify(logs));
        
        // Update count
        setErrorCount(prev => prev + 1);
        
        // Show banner
        setShowBanner(true);
        
        // Auto-reload once after 2 seconds if this is the first error
        // Guard: Only auto-reload if we haven't auto-reloaded recently
        const lastAutoReload = localStorage.getItem('dev_last_auto_reload');
        const now = Date.now();
        const canAutoReload = !lastAutoReload || (now - parseInt(lastAutoReload)) > 30000; // 30s cooldown
        
        if (canAutoReload && errorCount === 0) {
          console.log('🔄 Auto-reloading in 2 seconds...');
          setTimeout(() => {
            localStorage.setItem('dev_last_auto_reload', now.toString());
            window.location.reload();
          }, 2000);
        }
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      
      // Detect chunk load failures in promise rejections
      const isChunkError = 
        reason?.name === 'ChunkLoadError' ||
        reason?.message?.includes('ChunkLoadError') ||
        reason?.message?.includes('Loading chunk') ||
        reason?.message?.includes('Failed to fetch dynamically imported module');

      if (isChunkError) {
        console.warn('🔧 ChunkLoadError in promise - dev bundle may be out of sync');
        setShowBanner(true);
        setErrorCount(prev => prev + 1);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [errorCount]);

  const handleHardRefresh = () => {
    // Clear cache and reload
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    window.location.reload();
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  if (!showBanner || process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="bg-destructive text-destructive-foreground rounded-lg shadow-lg border-2 border-destructive p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-sm mb-1">Dev Bundle Out of Sync</h3>
            <p className="text-sm opacity-90 mb-3">
              The dev server updated but your browser is out of sync. Hard refresh to fix.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleHardRefresh}
                className="flex-1 bg-background text-foreground hover:bg-accent"
              >
                <RefreshCw className="w-3 h-3 mr-2" />
                Hard Refresh
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-destructive-foreground hover:bg-destructive/90"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            {errorCount > 1 && (
              <p className="text-xs mt-2 opacity-75">
                {errorCount} errors detected
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
