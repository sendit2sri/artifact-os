"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LayoutDashboard } from "lucide-react";
import type { Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WorkspaceSelector({
  workspaces,
  currentWorkspaceId,
  onSelect,
  open,
  onOpenChange,
}: WorkspaceSelectorProps) {
  const current = workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0];

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 text-sm font-medium border-border bg-surface hover:bg-muted/50"
          data-testid="workspace-trigger"
        >
          <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
          <span className="truncate max-w-[140px]">{current?.name ?? "Workspace"}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" data-testid="workspace-panel">
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => onSelect(ws.id)}
            data-testid="workspace-item"
            className={cn(ws.id === currentWorkspaceId && "bg-muted")}
          >
            {ws.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
