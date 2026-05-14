import { Spanner } from "@google-cloud/spanner";
import { parseBookmarksJson, loadBookmarksToPg, loadBookmarksToSpanner } from "@/lib/etl/bookmark-etl";
import { createPool } from "@/lib/pg";
import { spannerConfig } from "@/lib/spanner";

export const maxDuration = 300;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "file is required" }, { status: 400 });

  const { projectId, instanceId, databaseId } = spannerConfig();

  const pg = createPool();
  const spanner = new Spanner({ projectId });
  const database = spanner.instance(instanceId).database(databaseId);

  try {
    const jsonString = await file.text();
    const parsed = parseBookmarksJson(jsonString);
    await loadBookmarksToPg(parsed, pg);
    const result = await loadBookmarksToSpanner(pg, database);
    return Response.json(result);
  } finally {
    await pg.end();
    await database.close();
    spanner.close();
  }
}
