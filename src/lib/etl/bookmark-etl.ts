// history-viewer/src/lib/etl/bookmark-etl.ts
import { Pool } from "pg";

export interface ParsedFolder {
  folderId: string;
  name: string;
  parentFolderId: string | null;
  depth: number;
}

export interface ParsedBookmark {
  folderId: string;
  url: string;
  name: string;
  dateAdded: number;
  dateLastUsed: number;
}

export interface ParseResult {
  folders: ParsedFolder[];
  bookmarks: ParsedBookmark[];
}

interface ChromeBookmarkNode {
  guid: string;
  name: string;
  type: "folder" | "url";
  url?: string;
  date_added?: string;
  date_last_used?: string;
  children?: ChromeBookmarkNode[];
}

interface ChromeBookmarksJson {
  roots: {
    bookmark_bar?: ChromeBookmarkNode;
    other?: ChromeBookmarkNode;
    synced?: ChromeBookmarkNode;
  };
}

function walkNode(
  node: ChromeBookmarkNode,
  parentFolderId: string | null,
  depth: number,
  folders: ParsedFolder[],
  bookmarks: ParsedBookmark[]
): void {
  if (node.type === "folder") {
    folders.push({
      folderId: node.guid,
      name: node.name,
      parentFolderId,
      depth,
    });
    if (node.children) {
      for (const child of node.children) {
        walkNode(child, node.guid, depth + 1, folders, bookmarks);
      }
    }
  } else if (node.type === "url" && node.url) {
    bookmarks.push({
      folderId: parentFolderId ?? "",
      url: node.url,
      name: node.name,
      dateAdded: node.date_added ? parseInt(node.date_added, 10) : 0,
      dateLastUsed: node.date_last_used
        ? parseInt(node.date_last_used, 10)
        : 0,
    });
  }
}

export function parseBookmarksJson(jsonString: string): ParseResult {
  const data: ChromeBookmarksJson = JSON.parse(jsonString);
  const folders: ParsedFolder[] = [];
  const bookmarks: ParsedBookmark[] = [];

  const roots = ["bookmark_bar", "other", "synced"] as const;
  for (const rootKey of roots) {
    const rootNode = data.roots[rootKey];
    if (rootNode) {
      walkNode(rootNode, null, 0, folders, bookmarks);
    }
  }

  return { folders, bookmarks };
}

const BATCH_SIZE = 100;

export async function loadBookmarksToPg(
  parsed: ParseResult,
  pg: Pool
): Promise<void> {
  const client = await pg.connect();
  try {
    await client.query("BEGIN");

    // Clear existing data
    await client.query("DELETE FROM chrome_history.bookmarks");
    await client.query("DELETE FROM chrome_history.bookmark_folders");

    // Insert folders in batches
    const { folders, bookmarks } = parsed;
    for (let i = 0; i < folders.length; i += BATCH_SIZE) {
      const batch = folders.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;
      const values = batch
        .map(
          (_, idx) =>
            `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`
        )
        .join(", ");
      const params = batch.flatMap((f) => [
        f.folderId,
        f.name,
        f.parentFolderId,
        f.depth,
      ]);
      await client.query(
        `INSERT INTO chrome_history.bookmark_folders (folder_id, name, parent_folder_id, depth) VALUES ${values} ON CONFLICT (folder_id) DO NOTHING`,
        params
      );
    }

    // Insert bookmarks in batches
    for (let i = 0; i < bookmarks.length; i += BATCH_SIZE) {
      const batch = bookmarks.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;
      const values = batch
        .map(
          (_, idx) =>
            `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`
        )
        .join(", ");
      const params = batch.flatMap((b) => [
        b.folderId,
        b.url,
        b.name,
        b.dateAdded,
        b.dateLastUsed,
      ]);
      await client.query(
        `INSERT INTO chrome_history.bookmarks (folder_id, url, name, date_added, date_last_used) VALUES ${values}`,
        params
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Chrome timestamp → Unix ms: microseconds since 1601-01-01 → subtract epoch offset
function chromeTimeToDate(chromeTime: number): Date {
  const unixMs = (chromeTime / 1_000_000 - 11_644_473_600) * 1000;
  return new Date(unixMs);
}

type SpannerDatabase = {
  table: (name: string) => { upsert: (rows: Record<string, unknown>[]) => Promise<unknown> };
};

async function upsertBatches(
  tableName: string,
  rows: Record<string, unknown>[],
  database: SpannerDatabase
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await database.table(tableName).upsert(batch);
  }
}

export async function loadBookmarksToSpanner(
  pg: Pool,
  database: SpannerDatabase
): Promise<{ folders: number; bookmarks: number }> {
  // Read folders from PG
  const { rows: folderRows } = await pg.query<{
    folder_id: string;
    name: string;
    parent_folder_id: string | null;
    depth: number;
  }>("SELECT folder_id, name, parent_folder_id, depth FROM chrome_history.bookmark_folders");

  // Read bookmarks from PG
  const { rows: bookmarkRows } = await pg.query<{
    folder_id: string;
    url: string;
    name: string;
    date_added: string;
    date_last_used: string;
  }>(
    "SELECT folder_id, url, name, date_added, date_last_used FROM chrome_history.bookmarks"
  );

  // Build folder name lookup
  const folderNameById = new Map<string, string>();
  for (const f of folderRows) {
    folderNameById.set(f.folder_id, f.name);
  }

  // Upsert BookmarkFolderNode
  const bookmarkFolderNodes = folderRows.map((f) => ({
    folder_id: f.folder_id,
    name: f.name,
    depth: f.depth,
  }));
  await upsertBatches("BookmarkFolderNode", bookmarkFolderNodes, database);

  // Upsert FolderContains edges (parent → child relationships)
  const folderContainsEdges = folderRows
    .filter((f) => f.parent_folder_id !== null)
    .map((f) => ({
      parent_folder_id: f.parent_folder_id!,
      child_folder_id: f.folder_id,
    }));
  if (folderContainsEdges.length > 0) {
    await upsertBatches("FolderContains", folderContainsEdges, database);
  }

  // Upsert WebPageNode with is_bookmarked=true
  // Use upsert but include default values for required columns so new URLs are created
  // For existing URLs, upsert overwrites — but visit_count/last_visit will be re-populated by history ETL
  const webPageNodes = bookmarkRows.map((b) => ({
    url: b.url,
    title: b.name || null,
    domain: (() => {
      try {
        return new URL(b.url).hostname;
      } catch {
        return "";
      }
    })(),
    visit_count: 0,
    last_visit: "1970-01-01T00:00:00.000Z",
    is_bookmarked: true,
    bookmark_folder: folderNameById.get(b.folder_id) ?? null,
  }));
  if (webPageNodes.length > 0) {
    await upsertBatches("WebPageNode", webPageNodes, database);
  }

  // Upsert Bookmarked edges
  const bookmarkedEdges = bookmarkRows.map((b) => ({
    folder_id: b.folder_id,
    url: b.url,
    date_added: chromeTimeToDate(parseInt(b.date_added, 10)),
    date_last_used: chromeTimeToDate(parseInt(b.date_last_used, 10)),
  }));
  if (bookmarkedEdges.length > 0) {
    await upsertBatches("Bookmarked", bookmarkedEdges, database);
  }

  return { folders: folderRows.length, bookmarks: bookmarkRows.length };
}
