import { Spanner, Database } from "@google-cloud/spanner";

export interface SpannerConfig {
  projectId: string;
  instanceId: string;
  databaseId: string;
}

export function spannerConfig(): SpannerConfig {
  if (!process.env.SPANNER_EMULATOR_HOST) {
    process.env.SPANNER_EMULATOR_HOST = "localhost:15000";
  }
  return {
    projectId: process.env.SPANNER_PROJECT_ID ?? "default",
    instanceId: process.env.SPANNER_INSTANCE_ID ?? "default",
    databaseId: process.env.SPANNER_DATABASE_ID ?? "history-db",
  };
}

let database: Database | null = null;

export function getDatabase(): Database {
  if (database) return database;
  const { projectId, instanceId, databaseId } = spannerConfig();
  const spanner = new Spanner({ projectId });
  database = spanner.instance(instanceId).database(databaseId);
  return database;
}
