'use client';

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import SearchPanel from "@/components/SearchPanel";
import GraphControls from "@/components/GraphControls";
import NodeDetail from "@/components/NodeDetail";
import Header from "@/components/Header";
import type {
  CytoscapeElements,
  GraphData,
  GraphNode,
} from "@/types/graph";

// GraphCanvas uses cytoscape which requires a DOM — load client-side only
const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full text-gray-500 text-sm">
      グラフを読み込み中...
    </div>
  ),
});

const EMPTY_ELEMENTS: CytoscapeElements = { nodes: [], edges: [] };

export default function DashboardPage() {
  const [mode, setMode] = useState<"search" | "context">("search");
  const [maxHops, setMaxHops] = useState(2);
  const [layout, setLayout] = useState<"cola" | "dagre">("cola");
  const [elements, setElements] = useState<CytoscapeElements>(EMPTY_ELEMENTS);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [topTerms, setTopTerms] = useState<Array<{ term: string; searchCount: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });

  // Fetch top terms on mount
  useEffect(() => {
    fetch("/api/graph/search")
      .then((r) => r.json())
      .then((data: { topTerms?: Array<{ term: string; searchCount: number }> }) => {
        if (data.topTerms) {
          setTopTerms(data.topTerms);
        }
      })
      .catch((err) => console.error("Failed to load top terms:", err));
  }, []);

  const handleSearch = useCallback(async (term: string, hops: number, dateFrom?: string, dateTo?: string) => {
    setLoading(true);
    setSelectedNode(null);
    try {
      let url = `/api/graph/search?term=${encodeURIComponent(term)}&maxHops=${hops}`;
      if (dateFrom) url += `&from=${dateFrom}`;
      if (dateTo) url += `&to=${dateTo}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        graphData?: GraphData;
        elements?: CytoscapeElements;
        error?: string;
      };
      if (data.graphData && data.elements) {
        setGraphData(data.graphData);
        setElements(data.elements);
        setStats({
          nodes: data.elements.nodes.length,
          edges: data.elements.edges.length,
        });
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleContextSearch = useCallback(async (url: string, dateFrom?: string, dateTo?: string) => {
    setLoading(true);
    setSelectedNode(null);
    try {
      let apiUrl = `/api/graph/context?url=${encodeURIComponent(url)}`;
      if (dateFrom) apiUrl += `&from=${dateFrom}`;
      if (dateTo) apiUrl += `&to=${dateTo}`;
      const res = await fetch(apiUrl);
      const data = (await res.json()) as {
        graphData?: GraphData;
        elements?: CytoscapeElements;
        error?: string;
      };
      if (data.graphData && data.elements) {
        setGraphData(data.graphData);
        setElements(data.elements);
        setStats({
          nodes: data.elements.nodes.length,
          edges: data.elements.edges.length,
        });
      }
    } catch (err) {
      console.error("Context search failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNodeSelect = useCallback(
    (nodeId: string | null) => {
      if (!nodeId || !graphData) {
        setSelectedNode(null);
        return;
      }
      const found = graphData.nodes.find((n) => n.id === nodeId) ?? null;
      setSelectedNode(found);
    },
    [graphData]
  );

  return (
    <div className="h-screen flex flex-col">
      <Header />
      {/* Stats Bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-1 flex items-center gap-4 text-xs text-gray-400 shrink-0">
        <span>ノード: {stats.nodes}</span>
        <span>エッジ: {stats.edges}</span>
        {loading && <span className="text-blue-400 animate-pulse">読み込み中...</span>}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <SearchPanel
          mode={mode}
          onModeChange={setMode}
          onSearch={handleSearch}
          onContextSearch={handleContextSearch}
          topTerms={topTerms}
          maxHops={maxHops}
          onMaxHopsChange={setMaxHops}
        />

        {/* Graph Area */}
        <div className="flex-1 relative overflow-hidden">
          <GraphControls layout={layout} onLayoutChange={setLayout} />
          <GraphCanvas
            elements={elements}
            layout={layout}
            onNodeSelect={handleNodeSelect}
          />
        </div>
      </div>

      {/* Node Detail Bar */}
      <NodeDetail node={selectedNode} />
    </div>
  );
}
