import type {
  GraphData,
  SearchTermNode,
  WebPageNode,
  BookmarkFolderNode,
  CytoscapeElements,
  CytoscapeNode,
  CytoscapeEdge,
} from "@/types/graph";

export function graphDataToCytoscapeElements(
  data: GraphData
): CytoscapeElements {
  const nodes: CytoscapeNode[] = data.nodes.map((node) => {
    if (node.type === "search-term") {
      const d = node.data as SearchTermNode;
      return {
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          depth: node.depth,
          searchCount: d.searchCount,
        },
      };
    }
    if (node.type === "bookmark-folder") {
      const d = node.data as BookmarkFolderNode;
      return {
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          depth: node.depth,
          childCount: d.depth,
        },
      };
    }
    const d = node.data as WebPageNode;
    return {
      data: {
        id: node.id,
        label: node.label,
        type: node.type,
        depth: node.depth,
        visitCount: d.visitCount,
        domain: d.domain,
        isBookmarked: d.isBookmarked,
        bookmarkFolder: d.bookmarkFolder,
      },
    };
  });

  const edges: CytoscapeEdge[] = data.edges.map((edge) => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
    },
  }));

  return { nodes, edges };
}
