'use client';

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import cola from "cytoscape-cola";
import dagre from "cytoscape-dagre";
import type { CytoscapeElements } from "@/types/graph";

let registered = false;
if (!registered) {
  cytoscape.use(cola);
  cytoscape.use(dagre);
  registered = true;
}

interface GraphCanvasProps {
  elements: CytoscapeElements;
  layout: "cola" | "dagre";
  onNodeSelect: (nodeId: string | null) => void;
}

function getNodeColor(type: string, depth: number): string {
  if (type === "search-term") return "#1a73e8";
  if (depth === 1) return "#2e7d32";
  return "#e65100";
}

export default function GraphCanvas({ elements, layout, onNodeSelect }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...elements.nodes.map((n) => ({ data: n.data })),
        ...elements.edges.map((e) => ({ data: e.data })),
      ],
      style: [
        {
          selector: "node",
          style: {
            "background-color": (ele: cytoscape.NodeSingular) =>
              getNodeColor(
                ele.data("type") as string,
                ele.data("depth") as number
              ),
            label: (ele: cytoscape.NodeSingular) =>
              ele.data("isBookmarked") ? `★ ${ele.data("label") as string}` : (ele.data("label") as string),
            color: "#ffffff",
            "font-size": "11px",
            "text-wrap": "ellipsis",
            "text-max-width": "80px",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
            width: (ele: cytoscape.NodeSingular) => {
              const vc = ele.data("visitCount") as number | undefined;
              const sc = ele.data("searchCount") as number | undefined;
              const count = vc ?? sc ?? 1;
              return Math.max(30, Math.min(70, 20 + count * 3));
            },
            height: (ele: cytoscape.NodeSingular) => {
              const vc = ele.data("visitCount") as number | undefined;
              const sc = ele.data("searchCount") as number | undefined;
              const count = vc ?? sc ?? 1;
              return Math.max(30, Math.min(70, 20 + count * 3));
            },
            "border-color": (ele: cytoscape.NodeSingular) =>
              ele.data("isBookmarked") ? "#ffd700" : "transparent",
            "border-width": (ele: cytoscape.NodeSingular) =>
              ele.data("isBookmarked") ? 3 : 2,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#ffffff",
            "border-width": 3,
          },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": (ele: cytoscape.EdgeSingular) =>
              ele.data("type") === "searched-for" ? "#4fc3f7" : "#66bb6a",
            "line-style": (ele: cytoscape.EdgeSingular) =>
              ele.data("type") === "searched-for" ? "dashed" : "solid",
            "target-arrow-shape": "triangle",
            "target-arrow-color": (ele: cytoscape.EdgeSingular) =>
              ele.data("type") === "searched-for" ? "#4fc3f7" : "#66bb6a",
            "curve-style": "bezier",
          },
        },
      ],
      layout: {
        name: layout,
        animate: true,
      } as cytoscape.LayoutOptions,
    });

    cy.on("tap", "node", (evt) => {
      onNodeSelect(evt.target.id() as string);
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        onNodeSelect(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, layout, onNodeSelect]);

  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.2);
      cyRef.current.center();
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8);
      cyRef.current.center();
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 40);
    }
  };

  return (
    <div className="relative w-full h-full bg-gray-950">
      <div ref={containerRef} className="w-full h-full" />

      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 bg-gray-800 hover:bg-gray-700 text-white rounded flex items-center justify-center text-lg font-bold"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 bg-gray-800 hover:bg-gray-700 text-white rounded flex items-center justify-center text-lg font-bold"
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          onClick={handleFit}
          className="w-8 h-8 bg-gray-800 hover:bg-gray-700 text-white rounded flex items-center justify-center text-xs"
          aria-label="Fit to screen"
        >
          Fit
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 right-2 bg-gray-900 bg-opacity-90 rounded p-2 text-xs text-white z-10">
        <div className="font-semibold mb-1 text-gray-300">凡例</div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#1a73e8]" />
          <span>検索キーワード</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#2e7d32]" />
          <span>訪問ページ (depth 1)</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block w-3 h-3 rounded-full bg-[#e65100]" />
          <span>関連ページ (depth 2+)</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-6 border-t-2 border-dashed border-[#4fc3f7]" />
          <span>検索エッジ</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-6 border-t-2 border-solid border-[#66bb6a]" />
          <span>遷移エッジ</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-[#ffd700] bg-gray-600" />
          <span>ブックマーク済み</span>
        </div>
      </div>
    </div>
  );
}
