// history-viewer/scripts/etl-sqlite-to-pg.ts
import path from "path";
import { loadHistoryToPg } from "../src/lib/etl/history-etl";
import { createPool } from "../src/lib/pg";

async function main() {
  const historyPath =
    process.argv[2] ??
    process.env.HISTORY_PATH ??
    path.resolve(process.cwd(), "History");

  console.log(`=== ETL: Chrome SQLite → PostgreSQL ===`);
  console.log(`source: ${historyPath}`);

  const pg = createPool();
  try {
    const result = await loadHistoryToPg(historyPath, pg);
    console.log(
      `urls: ${result.urls}, visits: ${result.visits}, searchTerms: ${result.searchTerms}, dateRange: ${result.dateRange}`
    );
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
