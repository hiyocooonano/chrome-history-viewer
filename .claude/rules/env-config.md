---
paths:
  - "src/lib/pg.ts"
  - "src/lib/spanner.ts"
  - "scripts/**/*.ts"
  - "src/app/api/**/*.ts"
  - ".env.local.example"
---

# 環境変数 / 接続設定ルール

## 大原則

**接続情報のハードコード禁止**。新規 script / route / lib を追加するときも、必ず `src/lib/pg.ts` / `src/lib/spanner.ts` の helper を経由する。

`.env.local.example` に**全ての許可されたキー**を列挙する。新キーを増やしたら example も同期更新する。

## PostgreSQL: `src/lib/pg.ts`

```ts
// 環境変数（デフォルトは docker-compose と一致）
PG_HOST=localhost
PG_PORT=5432
PG_USER=admin
PG_PASSWORD=password
PG_DATABASE=postgres
```

公開 API:

| Function | 用途 |
|----------|------|
| `pgConfig()` | 上記環境変数を解決した `PoolConfig` を返す |
| `createPool()` | `pgConfig()` から `pg.Pool` を新規作成 |

呼び出し例:

```ts
import { createPool } from "@/lib/pg";

const pg = createPool();
try {
  await pg.query("SELECT 1");
} finally {
  await pg.end();   // 必ず close
}
```

- route handler は **リクエスト毎に `createPool()` → `finally` で `pg.end()`**
- 長時間プロセスの scripts は module レベルで 1 個作って、終了前に `pg.end()`

## Spanner: `src/lib/spanner.ts`

```ts
// 環境変数
SPANNER_EMULATOR_HOST=localhost:15000
SPANNER_PROJECT_ID=default
SPANNER_INSTANCE_ID=default
SPANNER_DATABASE_ID=history-db
```

公開 API:

| Function | 用途 |
|----------|------|
| `spannerConfig()` | 上記から `{ projectId, instanceId, databaseId }` を返す |
| `getDatabase()` | `Spanner` / `Instance` / `Database` を組み立てて返す |

呼び出し例:

```ts
import { spannerConfig } from "@/lib/spanner";

const { projectId, instanceId, databaseId } = spannerConfig();
const spanner = new Spanner({ projectId });
const database = spanner.instance(instanceId).database(databaseId);
try {
  await database.run({ sql: "..." });
} finally {
  await database.close();
  spanner.close();
}
```

- route handler は **リクエスト毎に作る → `finally` で close**
- `SPANNER_EMULATOR_HOST` が設定されていると `@google-cloud/spanner` SDK が自動で emulator 接続するので、本番 / ローカルでコード分岐は不要

## ETL CLI スクリプト: `scripts/etl-sqlite-to-pg.ts`

SQLite パスの解決優先順位:

1. `process.argv[2]`（CLI 第一引数）
2. `process.env.HISTORY_PATH`
3. `./History`（カレントディレクトリ）

```bash
npm run etl:sqlite-to-pg -- /path/to/Chrome/Default/History
# or
HISTORY_PATH=/path/to/History npm run etl:sqlite-to-pg
```

新しい CLI スクリプトを追加するときも、**パス / 接続情報は引数 → 環境変数 → デフォルトの順**で解決する。

## `.env.local.example`

```bash
# Spanner Omni
SPANNER_EMULATOR_HOST=localhost:15000
SPANNER_PROJECT_ID=default
SPANNER_INSTANCE_ID=default
SPANNER_DATABASE_ID=history-db

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_USER=admin
PG_PASSWORD=password
PG_DATABASE=postgres

# ETL (optional)
# HISTORY_PATH=/Users/<you>/Library/Application Support/Google/Chrome/Default/History
```

`.env.local` は git ignore。本物の credential / 秘密はここに置かない（本リポはプロトタイプなので秘密 credential は基本不要）。

## 本番想定

ローカルは Spanner Omni、本番は GCP Spanner Graph。コードは `@google-cloud/spanner` SDK の挙動で透過的に切り替わる:

- ローカル: `SPANNER_EMULATOR_HOST` を設定 → SDK が emulator に接続
- 本番: `SPANNER_EMULATOR_HOST` 未設定 + GCP 資格情報（ADC）→ 実 Spanner に接続

スキーマ名（`SearchTermNode` 等）は同一を維持。

## 禁止事項

- `new Pool({ host: 'localhost', ... })` のように接続情報を route / script 内に直書き
- `new Spanner({ projectId: 'default' })` のハードコード（`spannerConfig().projectId` を使う）
- `.env.local.example` を更新せずに新環境変数を導入
- `process.env.SPANNER_*` を pg / spanner helper の外で散らかして読む
