import { Spanner } from "@google-cloud/spanner";
import { spannerConfig } from "../src/lib/spanner";

const DDL_STATEMENTS = [
  `ALTER TABLE WebPageNode ADD COLUMN is_bookmarked BOOL`,
  `ALTER TABLE WebPageNode ADD COLUMN bookmark_folder STRING(MAX)`,

  `CREATE TABLE BookmarkFolderNode (
    folder_id STRING(MAX) NOT NULL,
    name      STRING(MAX),
    depth     INT64,
  ) PRIMARY KEY (folder_id)`,

  `CREATE TABLE FolderContains (
    parent_folder_id STRING(MAX) NOT NULL,
    child_folder_id  STRING(MAX) NOT NULL,
    CONSTRAINT FK_FolderContains_Parent FOREIGN KEY (parent_folder_id) REFERENCES BookmarkFolderNode(folder_id),
    CONSTRAINT FK_FolderContains_Child  FOREIGN KEY (child_folder_id)  REFERENCES BookmarkFolderNode(folder_id),
  ) PRIMARY KEY (parent_folder_id, child_folder_id)`,

  `CREATE TABLE Bookmarked (
    folder_id      STRING(MAX) NOT NULL,
    url            STRING(MAX) NOT NULL,
    date_added     TIMESTAMP,
    date_last_used TIMESTAMP,
    CONSTRAINT FK_Bookmarked_Folder FOREIGN KEY (folder_id) REFERENCES BookmarkFolderNode(folder_id),
    CONSTRAINT FK_Bookmarked_Url    FOREIGN KEY (url)       REFERENCES WebPageNode(url),
  ) PRIMARY KEY (folder_id, url)`,

  `DROP PROPERTY GRAPH HistoryGraph`,

  `CREATE PROPERTY GRAPH HistoryGraph
    NODE TABLES (
      SearchTermNode,
      WebPageNode,
      BookmarkFolderNode
    )
    EDGE TABLES (
      SearchedFor
        SOURCE KEY (term) REFERENCES SearchTermNode(term)
        DESTINATION KEY (url) REFERENCES WebPageNode(url),
      LinkedTo
        SOURCE KEY (source_url) REFERENCES WebPageNode(url)
        DESTINATION KEY (target_url) REFERENCES WebPageNode(url),
      FolderContains
        SOURCE KEY (parent_folder_id) REFERENCES BookmarkFolderNode(folder_id)
        DESTINATION KEY (child_folder_id) REFERENCES BookmarkFolderNode(folder_id),
      Bookmarked
        SOURCE KEY (folder_id) REFERENCES BookmarkFolderNode(folder_id)
        DESTINATION KEY (url) REFERENCES WebPageNode(url)
    )`,
];

async function runBatch(
  database: ReturnType<ReturnType<Spanner["instance"]>["database"]>,
  statements: string[],
  label: string
): Promise<void> {
  console.log(`Running batch [${label}] with ${statements.length} statement(s)...`);
  const [operation] = await database.updateSchema(statements);
  await operation.promise();
  console.log(`Batch [${label}] complete.`);
}

async function main() {
  console.log("=== Bookmark Schema Migration ===");

  const { projectId, instanceId, databaseId } = spannerConfig();
  console.log(`SPANNER_EMULATOR_HOST=${process.env.SPANNER_EMULATOR_HOST}`);

  const spanner = new Spanner({ projectId });
  const database = spanner.instance(instanceId).database(databaseId);

  try {
    // Attempt single batch first (Spanner processes DDL statements sequentially).
    // DROP + CREATE of HistoryGraph must be in the same batch to avoid conflicts.
    try {
      await runBatch(database, DDL_STATEMENTS, "full");
    } catch (batchErr: unknown) {
      const err = batchErr as { code?: number; message?: string };
      console.warn(`Single-batch failed (code=${err.code}): ${err.message}`);
      console.log("Falling back to sequential batches...");

      // Batch 1: ALTER TABLE statements
      const alterStatements = DDL_STATEMENTS.filter((s) =>
        s.trimStart().startsWith("ALTER")
      );
      // Batch 2: CREATE TABLE statements
      const createTableStatements = DDL_STATEMENTS.filter((s) =>
        s.trimStart().startsWith("CREATE TABLE")
      );
      // Batch 3: DROP + CREATE PROPERTY GRAPH (must be together)
      const graphStatements = DDL_STATEMENTS.filter(
        (s) =>
          s.trimStart().startsWith("DROP PROPERTY GRAPH") ||
          s.trimStart().startsWith("CREATE PROPERTY GRAPH")
      );

      if (alterStatements.length > 0) {
        try {
          await runBatch(database, alterStatements, "ALTER TABLE");
        } catch (alterErr: unknown) {
          const e = alterErr as { code?: number; message?: string };
          if (e.code === 6 || e.message?.includes("already exists") || e.message?.includes("Duplicate column")) {
            console.log("ALTER TABLE: columns already exist, skipping.");
          } else {
            throw alterErr;
          }
        }
      }

      if (createTableStatements.length > 0) {
        try {
          await runBatch(database, createTableStatements, "CREATE TABLE");
        } catch (createErr: unknown) {
          const e = createErr as { code?: number; message?: string };
          if (e.code === 6 || e.message?.includes("already exists")) {
            console.log("CREATE TABLE: tables already exist, skipping.");
          } else {
            throw createErr;
          }
        }
      }

      if (graphStatements.length > 0) {
        await runBatch(database, graphStatements, "PROPERTY GRAPH");
      }
    }

    console.log("Migration complete.");
    console.log("New tables: BookmarkFolderNode, FolderContains, Bookmarked");
    console.log("Updated graph: HistoryGraph (now includes bookmark nodes/edges)");
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (error.code === 6 || error.message?.includes("already exists")) {
      console.log("Some schema already exists. Skipping.");
    } else {
      throw err;
    }
  } finally {
    await database.close();
    spanner.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
