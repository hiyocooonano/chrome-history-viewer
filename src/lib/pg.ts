import { Pool, PoolConfig } from "pg";

export function pgConfig(): PoolConfig {
  return {
    host: process.env.PG_HOST ?? "localhost",
    port: Number(process.env.PG_PORT ?? 5432),
    user: process.env.PG_USER ?? "admin",
    password: process.env.PG_PASSWORD ?? "password",
    database: process.env.PG_DATABASE ?? "postgres",
  };
}

export function createPool(): Pool {
  return new Pool(pgConfig());
}
