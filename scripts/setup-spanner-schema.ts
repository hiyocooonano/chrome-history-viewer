// history-viewer/scripts/setup-spanner-schema.ts
import { Spanner } from "@google-cloud/spanner";
import { spannerConfig } from "../src/lib/spanner";

const DDL_STATEMENTS = [
  `CREATE TABLE SearchTermNode (
    term         STRING(MAX) NOT NULL,
    search_count INT64,
    first_search TIMESTAMP,
    last_search  TIMESTAMP,
  ) PRIMARY KEY (term)`,

  `CREATE TABLE WebPageNode (
    url          STRING(MAX) NOT NULL,
    title        STRING(MAX),
    domain       STRING(MAX),
    visit_count  INT64,
    last_visit   TIMESTAMP,
  ) PRIMARY KEY (url)`,

  `CREATE TABLE SearchedFor (
    term        STRING(MAX) NOT NULL,
    url         STRING(MAX) NOT NULL,
    search_time TIMESTAMP,
    CONSTRAINT FK_SearchedFor_Term FOREIGN KEY (term) REFERENCES SearchTermNode(term),
    CONSTRAINT FK_SearchedFor_Url FOREIGN KEY (url) REFERENCES WebPageNode(url),
  ) PRIMARY KEY (term, url)`,

  `CREATE TABLE LinkedTo (
    source_url      STRING(MAX) NOT NULL,
    target_url      STRING(MAX) NOT NULL,
    visit_time      TIMESTAMP NOT NULL,
    transition_type INT64,
    visit_duration  INT64,
    CONSTRAINT FK_LinkedTo_Source FOREIGN KEY (source_url) REFERENCES WebPageNode(url),
    CONSTRAINT FK_LinkedTo_Target FOREIGN KEY (target_url) REFERENCES WebPageNode(url),
  ) PRIMARY KEY (source_url, target_url, visit_time)`,

  `CREATE PROPERTY GRAPH HistoryGraph
    NODE TABLES (
      SearchTermNode,
      WebPageNode
    )
    EDGE TABLES (
      SearchedFor
        SOURCE KEY (term) REFERENCES SearchTermNode(term)
        DESTINATION KEY (url) REFERENCES WebPageNode(url),
      LinkedTo
        SOURCE KEY (source_url) REFERENCES WebPageNode(url)
        DESTINATION KEY (target_url) REFERENCES WebPageNode(url)
    )`,
];

async function main() {
  console.log("=== Spanner Graph Schema Setup ===");

  const { projectId, instanceId, databaseId } = spannerConfig();
  const spanner = new Spanner({ projectId });
  const database = spanner.instance(instanceId).database(databaseId);

  try {
    console.log(
      `Connecting to projects/${projectId}/instances/${instanceId}/databases/${databaseId}`
    );
    console.log(`SPANNER_EMULATOR_HOST=${process.env.SPANNER_EMULATOR_HOST}`);

    console.log(`Executing ${DDL_STATEMENTS.length} DDL statements...`);
    const [operation] = await database.updateSchema(DDL_STATEMENTS);

    console.log("Waiting for schema update operation to complete...");
    await operation.promise();

    console.log("Schema created successfully.");
    console.log("Tables: SearchTermNode, WebPageNode, SearchedFor, LinkedTo");
    console.log("Graph: HistoryGraph");
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (
      error.code === 6 ||
      (error.message && error.message.includes("already exists"))
    ) {
      console.log(
        "Schema already exists (some or all tables/graph already present). Skipping."
      );
    } else {
      throw err;
    }
  } finally {
    await database.close();
    spanner.close();
  }

  console.log("=== Schema Setup Complete ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
