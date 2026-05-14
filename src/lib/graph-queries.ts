import { getDatabase } from "./spanner";
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  SearchTermNode,
  WebPageNode,
  SearchedForEdge,
  LinkedToEdge,
  BookmarkFolderNode,
  BookmarkedEdge,
  ContainsEdge,
} from "@/types/graph";

function spannerTimestampToISO(ts: unknown): string {
  if (ts && typeof ts === "object" && "value" in ts)
    return (ts as { value: string }).value;
  if (ts instanceof Date) return ts.toISOString();
  return String(ts || "");
}

function isWithinDateRange(
  isoTimestamp: string,
  dateFrom?: string,
  dateTo?: string
): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!isoTimestamp) return true;
  const ts = isoTimestamp.slice(0, 10); // YYYY-MM-DD
  if (dateFrom && ts < dateFrom) return false;
  if (dateTo && ts > dateTo) return false;
  return true;
}

/**
 * Search term analysis: SearchTermNode → SearchedFor → WebPageNodes (→ LinkedTo → WebPageNodes)
 */
export async function querySearchGraph(
  term: string,
  maxHops: number,
  dateFrom?: string,
  dateTo?: string
): Promise<GraphData> {
  const db = getDatabase();
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Step 1: Find SearchTermNode and its SearchedFor edges to WebPageNodes
  const step1Query = `
    GRAPH HistoryGraph
    MATCH (s:SearchTermNode {term: @term})-[e:SearchedFor]->(p:WebPageNode)
    RETURN s.term AS s_term, s.search_count AS s_count,
           p.url AS p_url, p.title AS p_title, p.domain AS p_domain,
           p.visit_count AS p_visit_count, p.last_visit AS p_last_visit,
           p.is_bookmarked AS p_bookmarked, p.bookmark_folder AS p_bm_folder,
           e.search_time AS e_time
  `;

  const [step1Rows] = await db.run({
    sql: step1Query,
    params: { term },
  });

  const hop1Urls: string[] = [];

  for (const row of step1Rows) {
    const r = row.toJSON();

    const searchNodeId = `term:${r.s_term}`;
    if (!nodes.has(searchNodeId)) {
      const searchTermData: SearchTermNode = {
        term: r.s_term,
        searchCount: Number(r.s_count ?? 0),
        firstSearch: "",
        lastSearch: "",
      };
      nodes.set(searchNodeId, {
        id: searchNodeId,
        label: r.s_term,
        type: "search-term",
        data: searchTermData,
        depth: 0,
      });
    }

    const pageNodeId = `page:${r.p_url}`;
    if (!nodes.has(pageNodeId)) {
      const webPageData: WebPageNode = {
        url: r.p_url,
        title: r.p_title ?? r.p_url,
        domain: r.p_domain ?? "",
        visitCount: Number(r.p_visit_count ?? 0),
        lastVisit: spannerTimestampToISO(r.p_last_visit),
        isBookmarked: r.p_bookmarked === true,
        bookmarkFolder: r.p_bm_folder || undefined,
      };
      nodes.set(pageNodeId, {
        id: pageNodeId,
        label: r.p_title ?? r.p_url,
        type: "web-page",
        data: webPageData,
        depth: 1,
      });
      hop1Urls.push(r.p_url);
    }

    const edgeId = `searched-for:${r.s_term}:${r.p_url}`;
    const searchedForData: SearchedForEdge = {
      term: r.s_term,
      url: r.p_url,
      searchTime: spannerTimestampToISO(r.e_time),
    };
    edges.push({
      id: edgeId,
      source: searchNodeId,
      target: pageNodeId,
      type: "searched-for",
      data: searchedForData,
    });
  }

  // Step 2: For each hop-1 page, find LinkedTo edges (up to maxHops-1 more hops)
  if (maxHops > 1 && hop1Urls.length > 0) {
    const step2Query = `
      GRAPH HistoryGraph
      MATCH (src:WebPageNode {url: @url})-[e:LinkedTo]->(dst:WebPageNode)
      RETURN src.url AS src_url, dst.url AS dst_url,
             dst.title AS dst_title, dst.domain AS dst_domain,
             dst.visit_count AS dst_vc, dst.last_visit AS dst_lv,
             dst.is_bookmarked AS dst_bm, dst.bookmark_folder AS dst_bm_folder,
             e.visit_time AS e_time, e.transition_type AS e_trans
      LIMIT 20
    `;

    for (const pageUrl of hop1Urls) {
      const [step2Rows] = await db.run({
        sql: step2Query,
        params: { url: pageUrl },
      });

      for (const row of step2Rows) {
        const r = row.toJSON();

        const dstNodeId = `page:${r.dst_url}`;
        if (!nodes.has(dstNodeId)) {
          const webPageData: WebPageNode = {
            url: r.dst_url,
            title: r.dst_title ?? r.dst_url,
            domain: r.dst_domain ?? "",
            visitCount: Number(r.dst_vc ?? 0),
            lastVisit: spannerTimestampToISO(r.dst_lv),
            isBookmarked: r.dst_bm === true,
            bookmarkFolder: r.dst_bm_folder || undefined,
          };
          nodes.set(dstNodeId, {
            id: dstNodeId,
            label: r.dst_title ?? r.dst_url,
            type: "web-page",
            data: webPageData,
            depth: 2,
          });
        }

        const srcNodeId = `page:${r.src_url}`;
        const edgeId = `linked-to:${r.src_url}:${r.dst_url}`;
        const linkedToData: LinkedToEdge = {
          sourceUrl: r.src_url,
          targetUrl: r.dst_url,
          visitTime: spannerTimestampToISO(r.e_time),
          transitionType: Number(r.e_trans ?? 0),
          visitDuration: 0,
        };
        edges.push({
          id: edgeId,
          source: srcNodeId,
          target: dstNodeId,
          type: "linked-to",
          data: linkedToData,
        });
      }
    }
  }

  // Apply date filter if specified
  if (dateFrom || dateTo) {
    const filteredNodeIds = new Set<string>();
    for (const [id, node] of nodes) {
      if (node.type === "search-term") {
        filteredNodeIds.add(id);
      } else {
        const data = node.data as WebPageNode;
        if (isWithinDateRange(data.lastVisit, dateFrom, dateTo)) {
          filteredNodeIds.add(id);
        }
      }
    }
    for (const id of Array.from(nodes.keys())) {
      if (!filteredNodeIds.has(id)) nodes.delete(id);
    }
    const filteredEdges = edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
    return { nodes: Array.from(nodes.values()), edges: filteredEdges };
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

/**
 * Context tracking: incoming links + outgoing links for a given URL
 */
export async function queryContextGraph(url: string, dateFrom?: string, dateTo?: string): Promise<GraphData> {
  const db = getDatabase();
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Get target page info
  const targetQuery = `
    GRAPH HistoryGraph
    MATCH (p:WebPageNode {url: @url})
    RETURN p.url AS p_url, p.title AS p_title, p.domain AS p_domain,
           p.visit_count AS p_visit_count, p.last_visit AS p_last_visit,
           p.is_bookmarked AS p_bookmarked, p.bookmark_folder AS p_bm_folder
  `;

  const [targetRows] = await db.run({
    sql: targetQuery,
    params: { url },
  });

  if (targetRows.length > 0) {
    const r = targetRows[0].toJSON();
    const targetNodeId = `page:${r.p_url}`;
    const webPageData: WebPageNode = {
      url: r.p_url,
      title: r.p_title ?? r.p_url,
      domain: r.p_domain ?? "",
      visitCount: Number(r.p_visit_count ?? 0),
      lastVisit: spannerTimestampToISO(r.p_last_visit),
      isBookmarked: r.p_bookmarked === true,
      bookmarkFolder: r.p_bm_folder || undefined,
    };
    nodes.set(targetNodeId, {
      id: targetNodeId,
      label: r.p_title ?? r.p_url,
      type: "web-page",
      data: webPageData,
      depth: 0,
    });
  }

  // Get incoming links (other pages → target)
  const incomingQuery = `
    GRAPH HistoryGraph
    MATCH (src:WebPageNode)-[e:LinkedTo]->(dst:WebPageNode {url: @url})
    RETURN src.url AS src_url, src.title AS src_title, src.domain AS src_domain,
           src.visit_count AS src_vc, src.last_visit AS src_lv,
           src.is_bookmarked AS src_bm, src.bookmark_folder AS src_bm_folder,
           e.visit_time AS e_time, e.transition_type AS e_trans
    LIMIT 20
  `;

  const [incomingRows] = await db.run({
    sql: incomingQuery,
    params: { url },
  });

  for (const row of incomingRows) {
    const r = row.toJSON();

    const srcNodeId = `page:${r.src_url}`;
    if (!nodes.has(srcNodeId)) {
      const webPageData: WebPageNode = {
        url: r.src_url,
        title: r.src_title ?? r.src_url,
        domain: r.src_domain ?? "",
        visitCount: Number(r.src_vc ?? 0),
        lastVisit: spannerTimestampToISO(r.src_lv),
        isBookmarked: r.src_bm === true,
        bookmarkFolder: r.src_bm_folder || undefined,
      };
      nodes.set(srcNodeId, {
        id: srcNodeId,
        label: r.src_title ?? r.src_url,
        type: "web-page",
        data: webPageData,
        depth: -1,
      });
    }

    const dstNodeId = `page:${url}`;
    const edgeId = `linked-to:${r.src_url}:${url}`;
    const linkedToData: LinkedToEdge = {
      sourceUrl: r.src_url,
      targetUrl: url,
      visitTime: spannerTimestampToISO(r.e_time),
      transitionType: Number(r.e_trans ?? 0),
      visitDuration: 0,
    };
    edges.push({
      id: edgeId,
      source: srcNodeId,
      target: dstNodeId,
      type: "linked-to",
      data: linkedToData,
    });
  }

  // Get outgoing links (target → other pages)
  const outgoingQuery = `
    GRAPH HistoryGraph
    MATCH (src:WebPageNode {url: @url})-[e:LinkedTo]->(dst:WebPageNode)
    RETURN dst.url AS dst_url, dst.title AS dst_title, dst.domain AS dst_domain,
           dst.visit_count AS dst_vc, dst.last_visit AS dst_lv,
           dst.is_bookmarked AS dst_bm, dst.bookmark_folder AS dst_bm_folder,
           e.visit_time AS e_time, e.transition_type AS e_trans
    LIMIT 20
  `;

  const [outgoingRows] = await db.run({
    sql: outgoingQuery,
    params: { url },
  });

  for (const row of outgoingRows) {
    const r = row.toJSON();

    const dstNodeId = `page:${r.dst_url}`;
    if (!nodes.has(dstNodeId)) {
      const webPageData: WebPageNode = {
        url: r.dst_url,
        title: r.dst_title ?? r.dst_url,
        domain: r.dst_domain ?? "",
        visitCount: Number(r.dst_vc ?? 0),
        lastVisit: spannerTimestampToISO(r.dst_lv),
        isBookmarked: r.dst_bm === true,
        bookmarkFolder: r.dst_bm_folder || undefined,
      };
      nodes.set(dstNodeId, {
        id: dstNodeId,
        label: r.dst_title ?? r.dst_url,
        type: "web-page",
        data: webPageData,
        depth: 1,
      });
    }

    const srcNodeId = `page:${url}`;
    const edgeId = `linked-to:${url}:${r.dst_url}`;
    const linkedToData: LinkedToEdge = {
      sourceUrl: url,
      targetUrl: r.dst_url,
      visitTime: spannerTimestampToISO(r.e_time),
      transitionType: Number(r.e_trans ?? 0),
      visitDuration: 0,
    };
    edges.push({
      id: edgeId,
      source: srcNodeId,
      target: dstNodeId,
      type: "linked-to",
      data: linkedToData,
    });
  }

  // Apply date filter if specified
  if (dateFrom || dateTo) {
    const filteredNodeIds = new Set<string>();
    for (const [id, node] of nodes) {
      const data = node.data as WebPageNode;
      if (node.depth === 0 || isWithinDateRange(data.lastVisit, dateFrom, dateTo)) {
        filteredNodeIds.add(id);
      }
    }
    for (const id of Array.from(nodes.keys())) {
      if (!filteredNodeIds.has(id)) nodes.delete(id);
    }
    const filteredEdges = edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
    return { nodes: Array.from(nodes.values()), edges: filteredEdges };
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

/**
 * Bookmark tree graph: BookmarkFolderNode → FolderContains → BookmarkFolderNode → Bookmarked → WebPageNode
 */
export async function queryBookmarkTree(folderId?: string): Promise<GraphData> {
  const db = getDatabase();
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Step 1: Get all BookmarkFolderNode rows
  const [folderRows] = await db.run({
    sql: "SELECT folder_id, name, depth FROM BookmarkFolderNode",
  });

  for (const row of folderRows) {
    const r = row.toJSON();
    const nodeId = `folder:${r.folder_id}`;
    const folderData: BookmarkFolderNode = {
      folderId: r.folder_id,
      name: r.name,
      depth: Number(r.depth ?? 0),
    };
    nodes.set(nodeId, {
      id: nodeId,
      label: r.name,
      type: "bookmark-folder",
      data: folderData,
      depth: Number(r.depth ?? 0),
    });
  }

  // Step 2: Get FolderContains edges
  const [containsRows] = await db.run({
    sql: "SELECT parent_folder_id, child_folder_id FROM FolderContains",
  });

  for (const row of containsRows) {
    const r = row.toJSON();
    const sourceId = `folder:${r.parent_folder_id}`;
    const targetId = `folder:${r.child_folder_id}`;
    const edgeId = `contains:${r.parent_folder_id}:${r.child_folder_id}`;
    const containsData: ContainsEdge = {
      parentFolderId: r.parent_folder_id,
      childFolderId: r.child_folder_id,
    };
    edges.push({
      id: edgeId,
      source: sourceId,
      target: targetId,
      type: "contains",
      data: containsData,
    });
  }

  // Step 3: Get all Bookmarked pages
  const [bookmarkedRows] = await db.run({
    sql: `
      GRAPH HistoryGraph
      MATCH (f:BookmarkFolderNode)-[e:Bookmarked]->(p:WebPageNode)
      RETURN f.folder_id AS sub_id, p.url AS p_url, p.title AS p_title, p.domain AS p_domain, p.visit_count AS p_vc, e.date_added AS e_added
    `,
  });

  for (const row of bookmarkedRows) {
    const r = row.toJSON();
    const pageNodeId = `page:${r.p_url}`;
    const folderNodeId = `folder:${r.sub_id}`;

    if (!nodes.has(pageNodeId)) {
      const webPageData: WebPageNode = {
        url: r.p_url,
        title: r.p_title ?? r.p_url,
        domain: r.p_domain ?? "",
        visitCount: Number(r.p_vc ?? 0),
        lastVisit: "",
        isBookmarked: true,
      };
      nodes.set(pageNodeId, {
        id: pageNodeId,
        label: r.p_title ?? r.p_url,
        type: "web-page",
        data: webPageData,
        depth: 1,
      });
    }

    const edgeId = `bookmarked:${r.sub_id}:${r.p_url}`;
    const bookmarkedData: BookmarkedEdge = {
      folderId: r.sub_id,
      url: r.p_url,
      dateAdded: spannerTimestampToISO(r.e_added),
      dateLastUsed: "",
    };
    edges.push({
      id: edgeId,
      source: folderNodeId,
      target: pageNodeId,
      type: "bookmarked",
      data: bookmarkedData,
    });
  }

  // Step 4: If filtering by folderId, compute the subtree and remove everything else
  if (folderId) {
    // Build parent→children map from contains edges
    const childrenMap = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (edge.type === "contains") {
        const parentId = edge.source; // "folder:xxx"
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, new Set());
        childrenMap.get(parentId)!.add(edge.target);
      }
    }

    // BFS to find all descendant folder IDs from the selected folder
    const subtreeFolderIds = new Set<string>();
    const rootNodeId = `folder:${folderId}`;
    const queue = [rootNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      subtreeFolderIds.add(current);
      const children = childrenMap.get(current);
      if (children) {
        for (const child of children) {
          if (!subtreeFolderIds.has(child)) queue.push(child);
        }
      }
    }

    // Remove nodes not in subtree
    for (const key of Array.from(nodes.keys())) {
      if (key.startsWith("folder:") && !subtreeFolderIds.has(key)) {
        nodes.delete(key);
      }
    }

    // Remove edges not connected to subtree nodes, and page nodes not connected
    const validEdges: GraphEdge[] = [];
    const connectedPageIds = new Set<string>();
    for (const edge of edges) {
      if (edge.type === "contains") {
        if (subtreeFolderIds.has(edge.source) && subtreeFolderIds.has(edge.target)) {
          validEdges.push(edge);
        }
      } else if (edge.type === "bookmarked") {
        if (subtreeFolderIds.has(edge.source)) {
          validEdges.push(edge);
          connectedPageIds.add(edge.target);
        }
      }
    }

    // Remove page nodes not connected to subtree
    for (const key of Array.from(nodes.keys())) {
      if (key.startsWith("page:") && !connectedPageIds.has(key)) {
        nodes.delete(key);
      }
    }

    return { nodes: Array.from(nodes.values()), edges: validEdges };
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

/**
 * List all bookmark folders ordered by depth then name
 */
export async function getBookmarkFolders(): Promise<
  Array<{ folderId: string; name: string; depth: number }>
> {
  const db = getDatabase();

  const [rows] = await db.run({
    sql: "SELECT folder_id, name, depth FROM BookmarkFolderNode ORDER BY depth, name",
  });

  return rows.map((row) => {
    const r = row.toJSON();
    return {
      folderId: r.folder_id,
      name: r.name,
      depth: Number(r.depth ?? 0),
    };
  });
}

/**
 * Top keywords list
 */
export async function getTopSearchTerms(
  limit: number
): Promise<{ term: string; searchCount: number }[]> {
  const db = getDatabase();

  const [rows] = await db.run({
    sql: "SELECT term, search_count FROM SearchTermNode ORDER BY search_count DESC LIMIT @limit",
    params: { limit },
  });

  return rows.map((row) => {
    const r = row.toJSON();
    return {
      term: r.term,
      searchCount: Number(r.search_count ?? 0),
    };
  });
}
