// history-viewer/src/lib/etl/history-etl.ts
import Database from "better-sqlite3";
import { Pool } from "pg";

const BATCH_SIZE = 1000;
const SPANNER_BATCH_SIZE = 500;
// Spanner PK size limit is 8192 bytes. LinkedTo PK = source_url + target_url + visit_time.
// Skip URLs longer than 3000 chars to stay safely under the limit.
const MAX_URL_LENGTH = 3000;

// Chrome timestamp → ISO 8601
function chromeTimeToISO(chromeTime: number): string {
  const unixMs = (chromeTime / 1_000_000 - 11_644_473_600) * 1000;
  return new Date(unixMs).toISOString();
}

// Chrome timestamp → YYYY-MM-DD for display
function chromeTimeToDate(chromeTime: number): string {
  return chromeTimeToISO(chromeTime).slice(0, 10);
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

type SpannerDatabase = {
  table: (name: string) => { upsert: (rows: Record<string, unknown>[]) => Promise<unknown> };
};

async function upsertBatches<T extends Record<string, unknown>>(
  tableName: string,
  rows: T[],
  database: SpannerDatabase
): Promise<void> {
  for (let i = 0; i < rows.length; i += SPANNER_BATCH_SIZE) {
    const batch = rows.slice(i, i + SPANNER_BATCH_SIZE);
    await database.table(tableName).upsert(batch);
    process.stdout.write(
      `\r  ${tableName}: ${Math.min(i + SPANNER_BATCH_SIZE, rows.length)}/${rows.length}`
    );
  }
  console.log(`\r  ${tableName}: ${rows.length}/${rows.length} done`);
}

export async function loadHistoryToPg(
  sqlitePath: string,
  pg: Pool
): Promise<{ urls: number; visits: number; searchTerms: number; dateRange: string }> {
  const sqlite = new Database(sqlitePath, { readonly: true });

  try {
    // Incremental sync: use ON CONFLICT DO UPDATE to merge new data
    // No DELETE — existing data is preserved and updated

    // urls — upsert: update visit_count and last_visit_time if newer
    const urls = sqlite
      .prepare(
        "SELECT id, url, title, visit_count, typed_count, last_visit_time, hidden FROM urls"
      )
      .all() as Array<{
        id: number;
        url: string;
        title: string;
        visit_count: number;
        typed_count: number;
        last_visit_time: number;
        hidden: number;
      }>;
    console.log(`urls: ${urls.length} rows`);

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      const values = batch
        .map(
          (_, idx) =>
            `($${idx * 7 + 1}, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7})`
        )
        .join(", ");
      const params = batch.flatMap((r) => [
        r.id, r.url, r.title, r.visit_count, r.typed_count, r.last_visit_time, r.hidden,
      ]);
      await pg.query(
        `INSERT INTO chrome_history.urls (id, url, title, visit_count, typed_count, last_visit_time, hidden)
         VALUES ${values}
         ON CONFLICT (id) DO UPDATE SET
           title = COALESCE(EXCLUDED.title, chrome_history.urls.title),
           visit_count = GREATEST(EXCLUDED.visit_count, chrome_history.urls.visit_count),
           last_visit_time = GREATEST(EXCLUDED.last_visit_time, chrome_history.urls.last_visit_time)`,
        params
      );
    }
    console.log("  urls: done");

    // visits — upsert: skip if already exists
    const visits = sqlite
      .prepare(
        "SELECT id, url, visit_time, from_visit, transition, visit_duration FROM visits"
      )
      .all() as Array<{
        id: number;
        url: number;
        visit_time: number;
        from_visit: number;
        transition: number;
        visit_duration: number;
      }>;
    console.log(`visits: ${visits.length} rows`);

    for (let i = 0; i < visits.length; i += BATCH_SIZE) {
      const batch = visits.slice(i, i + BATCH_SIZE);
      const values = batch
        .map(
          (_, idx) =>
            `($${idx * 6 + 1}, $${idx * 6 + 2}, $${idx * 6 + 3}, $${idx * 6 + 4}, $${idx * 6 + 5}, $${idx * 6 + 6})`
        )
        .join(", ");
      const params = batch.flatMap((r) => [
        r.id, r.url, r.visit_time, r.from_visit, r.transition, r.visit_duration,
      ]);
      await pg.query(
        `INSERT INTO chrome_history.visits (id, url, visit_time, from_visit, transition, visit_duration)
         VALUES ${values} ON CONFLICT (id) DO NOTHING`,
        params
      );
    }
    console.log("  visits: done");

    // search_terms — use url_id + term as dedup key
    const terms = sqlite
      .prepare(
        "SELECT keyword_id, url_id, term, normalized_term FROM keyword_search_terms"
      )
      .all() as Array<{
        keyword_id: number;
        url_id: number;
        term: string;
        normalized_term: string;
      }>;
    console.log(`search_terms: ${terms.length} rows`);

    for (let i = 0; i < terms.length; i += BATCH_SIZE) {
      const batch = terms.slice(i, i + BATCH_SIZE);
      const values = batch
        .map(
          (_, idx) =>
            `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`
        )
        .join(", ");
      const params = batch.flatMap((r) => [
        r.keyword_id, r.url_id, r.term, r.normalized_term,
      ]);
      await pg.query(
        `INSERT INTO chrome_history.search_terms (keyword_id, url_id, term, normalized_term) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        params
      );
    }
    console.log("  search_terms: done");

    // Calculate date range of this upload
    const dateRangeRow = sqlite
      .prepare("SELECT MIN(visit_time) as min_time, MAX(visit_time) as max_time FROM visits")
      .get() as { min_time: number; max_time: number } | undefined;
    const dateRange = dateRangeRow
      ? `${chromeTimeToDate(dateRangeRow.min_time)} 〜 ${chromeTimeToDate(dateRangeRow.max_time)}`
      : "不明";

    return { urls: urls.length, visits: visits.length, searchTerms: terms.length, dateRange };
  } finally {
    sqlite.close();
  }
}

export async function loadHistoryToSpanner(
  pg: Pool,
  database: SpannerDatabase
): Promise<{
  webPages: number;
  searchTerms: number;
  searchedFor: number;
  linkedTo: number;
}> {
  // 1. SearchTermNode
  console.log("Querying SearchTermNode data from PostgreSQL...");
  const { rows: termRows } = await pg.query(`
    SELECT st.term, COUNT(*) as search_count,
           MIN(v.visit_time) as first_search,
           MAX(v.visit_time) as last_search
    FROM chrome_history.search_terms st
    JOIN chrome_history.visits v ON v.url = st.url_id
    GROUP BY st.term
  `);
  console.log(`  SearchTermNode: ${termRows.length} rows`);

  const searchTermNodes = termRows.map((r) => ({
    term: r.term,
    search_count: parseInt(r.search_count),
    first_search: chromeTimeToISO(parseInt(r.first_search)),
    last_search: chromeTimeToISO(parseInt(r.last_search)),
  }));
  await upsertBatches("SearchTermNode", searchTermNodes, database);

  // 2. WebPageNode
  console.log("Querying WebPageNode data from PostgreSQL...");
  const { rows: urlRows } = await pg.query(`
    SELECT u.url, u.title,
           COUNT(v.id) as visit_count,
           MAX(v.visit_time) as last_visit
    FROM chrome_history.urls u
    JOIN chrome_history.visits v ON v.url = u.id
    WHERE u.hidden = 0
    GROUP BY u.url, u.title
  `);
  console.log(`  WebPageNode: ${urlRows.length} rows`);

  const webPageNodes = urlRows
    .filter((r) => r.url.length <= MAX_URL_LENGTH)
    .map((r) => ({
      url: r.url,
      title: r.title || null,
      domain: extractDomain(r.url),
      visit_count: parseInt(r.visit_count),
      last_visit: chromeTimeToISO(parseInt(r.last_visit)),
    }));
  const skippedUrls = urlRows.length - webPageNodes.length;
  if (skippedUrls > 0) console.log(`  (skipped ${skippedUrls} URLs exceeding ${MAX_URL_LENGTH} chars)`);
  await upsertBatches("WebPageNode", webPageNodes, database);

  // 3. SearchedFor edges
  console.log("Querying SearchedFor edge data from PostgreSQL...");
  const { rows: searchedForRows } = await pg.query(`
    SELECT DISTINCT st.term, u.url,
           MIN(v.visit_time) as search_time
    FROM chrome_history.search_terms st
    JOIN chrome_history.urls u ON u.id = st.url_id
    JOIN chrome_history.visits v ON v.url = st.url_id
    WHERE u.hidden = 0
    GROUP BY st.term, u.url
  `);
  console.log(`  SearchedFor: ${searchedForRows.length} rows`);

  const searchedForEdges = searchedForRows
    .filter((r) => r.url.length <= MAX_URL_LENGTH)
    .map((r) => ({
      term: r.term,
      url: r.url,
      search_time: chromeTimeToISO(parseInt(r.search_time)),
    }));
  await upsertBatches("SearchedFor", searchedForEdges, database);

  // 4. LinkedTo edges
  console.log("Querying LinkedTo edge data from PostgreSQL...");
  const { rows: linkedToRows } = await pg.query(`
    SELECT src_u.url as source_url, dst_u.url as target_url,
           v.visit_time, v.transition, v.visit_duration
    FROM chrome_history.visits v
    JOIN chrome_history.visits from_v ON v.from_visit = from_v.id
    JOIN chrome_history.urls src_u ON from_v.url = src_u.id
    JOIN chrome_history.urls dst_u ON v.url = dst_u.id
    WHERE v.from_visit != 0
      AND src_u.hidden = 0 AND dst_u.hidden = 0
  `);
  console.log(`  LinkedTo: ${linkedToRows.length} rows`);

  const linkedToEdges = linkedToRows
    .filter((r) => r.source_url.length <= MAX_URL_LENGTH && r.target_url.length <= MAX_URL_LENGTH)
    .map((r) => ({
      source_url: r.source_url,
      target_url: r.target_url,
      visit_time: chromeTimeToISO(parseInt(r.visit_time)),
      transition_type: r.transition !== null ? parseInt(r.transition) : null,
      visit_duration:
        r.visit_duration !== null ? parseInt(r.visit_duration) : null,
    }));
  const skippedEdges = linkedToRows.length - linkedToEdges.length;
  if (skippedEdges > 0) console.log(`  (skipped ${skippedEdges} edges with URLs exceeding ${MAX_URL_LENGTH} chars)`);
  await upsertBatches("LinkedTo", linkedToEdges, database);

  return {
    webPages: webPageNodes.length,
    searchTerms: searchTermNodes.length,
    searchedFor: searchedForEdges.length,
    linkedTo: linkedToEdges.length,
  };
}
