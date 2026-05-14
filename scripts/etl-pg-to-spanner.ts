// history-viewer/scripts/etl-pg-to-spanner.ts
import { Spanner } from "@google-cloud/spanner";
import { loadHistoryToSpanner } from "../src/lib/etl/history-etl";
import { createPool } from "../src/lib/pg";
import { spannerConfig } from "../src/lib/spanner";

async function main() {
  const { projectId, instanceId, databaseId } = spannerConfig();

  const pg = createPool();
  const spanner = new Spanner({ projectId });
  const database = spanner.instance(instanceId).database(databaseId);

  try {
    console.log("=== ETL: PostgreSQL → Spanner Graph ===");
    const result = await loadHistoryToSpanner(pg, database);
    console.log(JSON.stringify(result));
  } finally {
    await pg.end();
    await database.close();
    spanner.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
