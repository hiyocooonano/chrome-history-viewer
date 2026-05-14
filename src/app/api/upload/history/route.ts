import { Spanner } from "@google-cloud/spanner";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { loadHistoryToPg, loadHistoryToSpanner } from "@/lib/etl/history-etl";
import { createPool } from "@/lib/pg";
import { spannerConfig } from "@/lib/spanner";

// Allow long-running ETL (up to 5 minutes)
export const maxDuration = 300;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "file is required" }, { status: 400 });

  const tmpPath = join(tmpdir(), `history-${Date.now()}.sqlite`);
  const { projectId, instanceId, databaseId } = spannerConfig();

  const pg = createPool();
  const spanner = new Spanner({ projectId });
  const database = spanner.instance(instanceId).database(databaseId);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpPath, buffer);
    const pgResult = await loadHistoryToPg(tmpPath, pg);
    const spannerResult = await loadHistoryToSpanner(pg, database);
    return Response.json({ ...pgResult, ...spannerResult });
  } catch (error) {
    console.error("[/api/upload/history] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  } finally {
    await unlink(tmpPath).catch(() => {});
    await pg.end();
    await database.close();
    spanner.close();
  }
}
