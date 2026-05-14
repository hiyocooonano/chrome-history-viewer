'use client';

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import BookmarkSidebar from "@/components/BookmarkSidebar";
import NodeDetail from "@/components/NodeDetail";
import type { CytoscapeElements, GraphData, GraphNode } from "@/types/graph";

const BookmarkTree = dynamic(() => import("@/components/BookmarkTree"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full text-gray-500 text-sm">
      グラフを読み込み中...
    </div>
  ),
});

const EMPTY_ELEMENTS: CytoscapeElements = { nodes: [], edges: [] };

interface FolderItem {
  folderId: string;
  name: string;
  depth: number;
}

export default function BookmarksPage() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [elements, setElements] = useState<CytoscapeElements>(EMPTY_ELEMENTS);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [bmLayout, setBmLayout] = useState<"mindmap" | "tree">("mindmap");

  // Fetch folder list on mount
  useEffect(() => {
    fetch("/api/graph/bookmarks?foldersOnly=true")
      .then((r) => r.json())
      .then((data: { folders?: FolderItem[] }) => {
        if (data.folders) setFolders(data.folders);
      })
      .catch((err) => console.error("Failed to load folders:", err));
  }, []);

  // Fetch bookmark tree whenever selectedFolderId changes
  const fetchTree = useCallback(async (folderId: string | null) => {
    setLoading(true);
    setSelectedNode(null);
    try {
      const url = folderId
        ? `/api/graph/bookmarks?folderId=${encodeURIComponent(folderId)}`
        : "/api/graph/bookmarks";
      const res = await fetch(url);
      const data = (await res.json()) as {
        graphData?: GraphData;
        elements?: CytoscapeElements;
        error?: string;
      };
      if (data.graphData && data.elements) {
        setGraphData(data.graphData);
        setElements(data.elements);
      }
    } catch (err) {
      console.error("Failed to load bookmark tree:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loading state lives in this component to display during fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTree(selectedFolderId);
  }, [selectedFolderId, fetchTree]);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
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
      {loading && (
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-1 text-xs text-blue-400 animate-pulse shrink-0">
          読み込み中...
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <BookmarkSidebar
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={handleSelectFolder}
        />
        <div className="flex-1 relative overflow-hidden">
          {/* Layout Toggle */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-gray-900/90 rounded px-3 py-2">
            <label className="text-xs text-gray-400 font-medium">表示:</label>
            <select
              value={bmLayout}
              onChange={(e) => setBmLayout(e.target.value as "mindmap" | "tree")}
              className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-700 focus:outline-none focus:border-blue-500"
            >
              <option value="mindmap">マインドマップ</option>
              <option value="tree">階層ツリー</option>
            </select>
          </div>
          <BookmarkTree elements={elements} layout={bmLayout} onNodeSelect={handleNodeSelect} />
        </div>
      </div>
      <NodeDetail node={selectedNode} />
    </div>
  );
}
