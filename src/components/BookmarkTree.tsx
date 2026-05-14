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

interface BookmarkTreeProps {
  elements: CytoscapeElements;
  layout: "mindmap" | "tree";
  onNodeSelect: (nodeId: string | null) => void;
}

export default function BookmarkTree({ elements, layout, onNodeSelect }: BookmarkTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current || elements.nodes.length === 0) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...elements.nodes.map((n) => ({ data: n.data })),
        ...elements.edges.map((e) => ({ data: e.data })),
      ],
      style: [
        // フォルダノード: 紫、サイズは接続数に応じて可変
        {
          selector: "node[type='bookmark-folder']",
          style: {
            "background-color": "#7b1fa2",
            "border-color": "#ce93d8",
            "border-width": 2,
            label: "data(label)",
            color: "#fff",
            "font-size": (ele: cytoscape.NodeSingular) => {
              const deg = ele.degree(false);
              return Math.max(9, Math.min(16, 8 + deg * 0.5)) + "px";
            },
            "text-wrap": "ellipsis",
            "text-max-width": "120px",
            "text-valign": "center",
            "text-halign": "center",
            width: (ele: cytoscape.NodeSingular) => {
              const deg = ele.degree(false);
              return Math.max(40, Math.min(90, 30 + deg * 4));
            },
            height: (ele: cytoscape.NodeSingular) => {
              const deg = ele.degree(false);
              return Math.max(40, Math.min(90, 30 + deg * 4));
            },
            shape: "round-rectangle",
          },
        },
        // ブックマーク URL ノード: 緑、小さめ
        {
          selector: "node[type='web-page']",
          style: {
            "background-color": "#2e7d32",
            "border-color": "#66bb6a",
            "border-width": 1,
            label: "data(label)",
            color: "#c8e6c9",
            "font-size": "8px",
            "text-wrap": "ellipsis",
            "text-max-width": "70px",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 3,
            width: 16,
            height: 16,
            shape: "ellipse",
          },
        },
        // 選択状態
        {
          selector: "node:selected",
          style: {
            "border-color": "#ffffff",
            "border-width": 3,
            "text-outline-color": "#000",
            "text-outline-width": 1,
          },
        },
        // contains エッジ: 紫の太線
        {
          selector: "edge[type='contains']",
          style: {
            width: 2.5,
            "line-color": "#9c27b0",
            "line-opacity": 0.7,
            "target-arrow-shape": "none",
            "curve-style": "unbundled-bezier",
            "control-point-step-size": 40,
          },
        },
        // bookmarked エッジ: 緑の細線
        {
          selector: "edge[type='bookmarked']",
          style: {
            width: 1,
            "line-color": "#4caf50",
            "line-opacity": 0.4,
            "target-arrow-shape": "none",
            "curve-style": "unbundled-bezier",
            "control-point-step-size": 30,
          },
        },
      ],
      layout: layout === "tree"
        ? { name: "dagre", rankDir: "LR", nodeSep: 20, rankSep: 80, animate: true, fit: true, padding: 50 } as cytoscape.LayoutOptions
        : { name: "cola", animate: true, maxSimulationTime: 4000, nodeSpacing: 15, edgeLengthVal: 80, convergenceThreshold: 0.01, fit: true, padding: 50 } as cytoscape.LayoutOptions,
      minZoom: 0.05,
      maxZoom: 3,
      wheelSensitivity: 0.3,
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
      cyRef.current.zoom(cyRef.current.zoom() * 1.3);
      cyRef.current.center();
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.7);
      cyRef.current.center();
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 50);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#0a0a1a]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Zoom Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
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
      <div className="absolute bottom-3 right-3 bg-black/70 rounded-lg p-3 text-xs text-gray-300 z-10 space-y-1.5">
        <div className="font-semibold text-gray-200 mb-1">Mind Map</div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm bg-[#7b1fa2]" />
          <span>フォルダ</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-[#2e7d32]" />
          <span>ブックマーク</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-5 border-t-2 border-[#9c27b0]" />
          <span>フォルダ階層</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-5 border-t border-[#4caf50]" />
          <span>ブックマーク</span>
        </div>
      </div>
    </div>
  );
}
