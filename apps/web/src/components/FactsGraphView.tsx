"use client";

import { useMemo, useCallback } from "react";
import ReactFlow, { type Node, type Edge, Background } from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import type { Fact } from "@/lib/api";

export interface FactsGraphGroups {
  [groupId: string]: { collapsed_ids: string[]; collapsed_count: number };
}

interface Props {
  groups: FactsGraphGroups;
  facts: Fact[];
  selectedGroupId: string | null;
  onNodeClick: (groupId: string) => void;
  onClearSelection: () => void;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;
const PAD = 24;
const COLS = 4;

function buildNodes(
  groups: FactsGraphGroups,
  facts: Fact[],
  selectedGroupId: string | null
): Node<{ label: string; selected?: boolean }>[] {
  const factMap = new Map(facts.map((f) => [f.id, f]));
  const entries = Object.entries(groups);
  return entries.map(([groupId, group], i) => {
    const repId = group.collapsed_ids[0];
    const rep = repId ? factMap.get(repId) : undefined;
    const label =
      rep?.fact_text?.slice(0, 40).trim() + (rep?.fact_text && rep.fact_text.length > 40 ? "…" : "") ||
      `Group of ${group.collapsed_count}`;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      id: groupId,
      type: "default",
      position: { x: col * (NODE_WIDTH + PAD), y: row * (NODE_HEIGHT + PAD) },
      data: { label, selected: selectedGroupId === groupId },
      className: selectedGroupId === groupId ? "ring-2 ring-primary" : "",
    };
  });
}

export function FactsGraphView({
  groups,
  facts,
  selectedGroupId,
  onNodeClick,
  onClearSelection,
}: Props) {
  const nodes = useMemo(
    () => buildNodes(groups, facts, selectedGroupId),
    [groups, facts, selectedGroupId]
  );
  const edges: Edge[] = useMemo(() => [], []);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick(node.id);
    },
    [onNodeClick]
  );

  const groupCount = Object.keys(groups).length;
  if (groupCount === 0) {
    return (
      <div
        data-testid="facts-graph"
        className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 p-8 text-center min-h-[200px]"
      >
        <p className="text-sm text-muted-foreground">
          No similarity groups yet. Group similar facts in Filters to see clusters here.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="facts-graph" className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
        <span className="text-xs font-medium text-muted-foreground">
          {groupCount} cluster{groupCount !== 1 ? "s" : ""} · click to focus list
        </span>
        {selectedGroupId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onClearSelection}
            data-testid="graph-clear-selection"
          >
            Clear filter
          </Button>
        )}
      </div>
      <div className="h-[220px] w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          minZoom={0.3}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
        >
          <Background gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
