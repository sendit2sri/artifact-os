"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SavedView,
  SavedViewState,
  getSavedViews,
  addSavedView,
  updateSavedView,
  deleteSavedView,
  getDefaultViewId,
  setDefaultViewId,
} from "@/lib/savedViews";
import { List, Copy, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ViewsPanelProps {
  projectId: string;
  currentState: SavedViewState;
  onApply: (state: SavedViewState) => void;
  buildViewLink: () => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetDefault?: (viewId: string) => void;
  onApplyView?: (viewId: string) => void;
}

export function ViewsPanel({
  projectId,
  currentState,
  onApply,
  buildViewLink,
  open,
  onOpenChange,
  onSetDefault,
  onApplyView,
}: ViewsPanelProps) {
  const [createName, setCreateName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const views = getSavedViews(projectId);
  const defaultId = getDefaultViewId(projectId);

  const handleCreate = () => {
    const name = createName.trim();
    if (!name) return;
    addSavedView(projectId, name, currentState);
    setCreateName("");
    toast.success(`View "${name}" saved`);
    onOpenChange(false);
  };

  const handleApply = (view: SavedView) => {
    onApply(view.state);
    onApplyView?.(view.id);
    toast.success(`Applied "${view.name}"`);
    onOpenChange(false);
  };

  const handleRename = (view: SavedView) => {
    if (editingId === view.id) {
      const name = editName.trim();
      if (name) {
        updateSavedView(projectId, view.id, { name });
        toast.success("View renamed");
        setEditingId(null);
        setEditName("");
      }
    } else {
      setEditingId(view.id);
      setEditName(view.name);
    }
  };

  const handleDelete = (view: SavedView) => {
    deleteSavedView(projectId, view.id);
    toast.success(`Deleted "${view.name}"`);
    if (editingId === view.id) {
      setEditingId(null);
      setEditName("");
    }
    onOpenChange(false);
  };

  const handleSetDefault = (view: SavedView) => {
    setDefaultViewId(projectId, view.id);
    onSetDefault?.(view.id);
    toast.success(`"${view.name}" set as default`);
  };

  const handleCopyLink = () => {
    const url = buildViewLink();
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied to clipboard"),
      () => toast.error("Failed to copy")
    );
    onOpenChange(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-[100px] text-xs bg-surface border-border"
          data-testid="views-trigger"
        >
          <List className="w-3.5 h-3.5 mr-1.5" />
          Views
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 max-h-[70vh] overflow-y-auto"
        data-testid="views-panel"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-2 space-y-2 border-b border-border mb-2">
          <Input
            placeholder="New view name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="h-9 text-sm"
            data-testid="views-create-input"
          />
          <Button
            size="sm"
            className="w-full h-9 text-xs"
            onClick={handleCreate}
            disabled={!createName.trim()}
            data-testid="views-create-save"
          >
            Save new view
          </Button>
        </div>
        <DropdownMenuItem
          onClick={handleCopyLink}
          data-testid="views-copy-link"
          className="text-xs"
        >
          <Copy className="w-3.5 h-3.5 mr-2" />
          Copy link to this view
        </DropdownMenuItem>
        <div className="mt-2 space-y-1">
          {views.map((view) => (
            <div
              key={view.id}
              className={cn(
                "flex items-center gap-1 flex-wrap rounded-sm px-2 py-1.5 text-sm",
                "data-[views-item]:flex data-[views-item]:items-center"
              )}
              data-testid="views-item"
            >
              {editingId === view.id ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(view);
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditName("");
                    }
                  }}
                  className="h-7 flex-1 min-w-0 text-xs"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate text-xs font-medium">{view.name}</span>
              )}
              {defaultId === view.id && (
                <span
                  className="text-[10px] text-muted-foreground shrink-0"
                  data-testid="views-default-badge"
                  title="Default view"
                >
                  Default
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-1.5 text-xs"
                onClick={() => handleApply(view)}
                data-testid="views-apply"
              >
                Apply
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => handleRename(view)}
                data-testid="views-rename"
                title="Rename"
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => handleDelete(view)}
                data-testid="views-delete"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => handleSetDefault(view)}
                data-testid="views-set-default"
                title="Set as default"
              >
                <Star className={cn("w-3 h-3", defaultId === view.id && "fill-current")} />
              </Button>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
