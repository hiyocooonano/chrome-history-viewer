// --- Spanner Graph ノード ---
export interface SearchTermNode {
  term: string;
  searchCount: number;
  firstSearch: string; // ISO 8601
  lastSearch: string;
}

export interface WebPageNode {
  url: string;
  title: string;
  domain: string;
  visitCount: number;
  lastVisit: string; // ISO 8601
  isBookmarked?: boolean;
  bookmarkFolder?: string;
}

export interface BookmarkFolderNode {
  folderId: string;
  name: string;
  depth: number;
}

// --- Spanner Graph エッジ ---
export interface SearchedForEdge {
  term: string;
  url: string;
  searchTime: string;
}

export interface LinkedToEdge {
  sourceUrl: string;
  targetUrl: string;
  visitTime: string;
  transitionType: number;
  visitDuration: number;
}

export interface ContainsEdge {
  parentFolderId: string;
  childFolderId: string;
}

export interface BookmarkedEdge {
  folderId: string;
  url: string;
  dateAdded: string;
  dateLastUsed: string;
}

// --- API レスポンス ---
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "search-term" | "web-page" | "bookmark-folder";
  data: SearchTermNode | WebPageNode | BookmarkFolderNode;
  depth: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: "searched-for" | "linked-to" | "contains" | "bookmarked";
  data: SearchedForEdge | LinkedToEdge | ContainsEdge | BookmarkedEdge;
}

// --- API リクエスト ---
export interface SearchRequest {
  term: string;
  maxHops: number; // 1〜3
}

export interface ContextRequest {
  url: string;
}

// --- Cytoscape Elements ---
export interface CytoscapeNode {
  data: {
    id: string;
    label: string;
    type: "search-term" | "web-page" | "bookmark-folder";
    depth: number;
    visitCount?: number;
    domain?: string;
    searchCount?: number;
    isBookmarked?: boolean;
    bookmarkFolder?: string;
    childCount?: number;
  };
}

export interface CytoscapeEdge {
  data: {
    id: string;
    source: string;
    target: string;
    type: "searched-for" | "linked-to" | "contains" | "bookmarked";
  };
}

export type CytoscapeElements = {
  nodes: CytoscapeNode[];
  edges: CytoscapeEdge[];
};
