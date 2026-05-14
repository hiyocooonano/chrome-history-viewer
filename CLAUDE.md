@AGENTS.md

# Chrome History Graph Explorer — AI 開発ガイド

ユーザー向けの利用方法・セットアップは `README.md` を参照。本ファイルは AI / 開発者が編集する際に押さえるべき内部仕様をまとめる。

## システム全体像

```
Chrome SQLite/JSON ──(ETL Step 1)──> PostgreSQL chrome_history ──(ETL Step 2)──> Spanner HistoryGraph ──> Next.js (Cytoscape.js)
```

- ローカル検証: **Spanner Omni** (`localhost:15000`, project=`default`, instance=`default`, db=`history-db`)
- 本番想定: GCP Spanner Graph
- フロントは Next.js 16 (App Router) + Tailwind v4 + Cytoscape.js (`cytoscape-cola`, `cytoscape-dagre`)

## スキーマ早見表

### PostgreSQL: `chrome_history` スキーマ（中間層・差分マージ対象）

| テーブル | PK / UK | カラム | 同期方針 |
| --- | --- | --- | --- |
| `urls` | PK `id` | `url`, `title`, `visit_count`, `typed_count`, `last_visit_time`, `hidden` | `ON CONFLICT (id) DO UPDATE`、`visit_count`/`last_visit_time` は `GREATEST`、`title` は `COALESCE` |
| `visits` | PK `id` | `url`, `visit_time`, `from_visit`, `transition`, `visit_duration` | `ON CONFLICT DO NOTHING` |
| `search_terms` | UK `(url_id, term)` | `keyword_id`, `url_id`, `term`, `normalized_term` | `ON CONFLICT DO NOTHING` |
| `bookmark_folders` | PK `folder_id` | `name`, `parent_folder_id`, `depth` | TXN 内で `DELETE` → `INSERT` |
| `bookmarks` | (なし) | `folder_id`, `url`, `name`, `date_added`, `date_last_used` | TXN 内で `DELETE` → `INSERT` |

### Spanner `history-db`

ノード:

| テーブル | PK | カラム |
| --- | --- | --- |
| `SearchTermNode` | `term` | `search_count`, `first_search`, `last_search` |
| `WebPageNode` | `url` | `title`, `domain`, `visit_count`, `last_visit`, `is_bookmarked`, `bookmark_folder` |
| `BookmarkFolderNode` | `folder_id` | `name`, `depth` |

エッジ:

| テーブル | PK | SRC → DST | 補助カラム |
| --- | --- | --- | --- |
| `SearchedFor` | `(term, url)` | `SearchTermNode.term` → `WebPageNode.url` | `search_time` |
| `LinkedTo` | `(source_url, target_url, visit_time)` | `WebPageNode.url` → `WebPageNode.url` | `transition_type`, `visit_duration` |
| `FolderContains` | `(parent_folder_id, child_folder_id)` | `BookmarkFolderNode` → `BookmarkFolderNode` | — |
| `Bookmarked` | `(folder_id, url)` | `BookmarkFolderNode` → `WebPageNode` | `date_added`, `date_last_used` |

Property Graph 名は `HistoryGraph`。ブックマーク追加時に DROP & CREATE する必要があるため、`migrate-bookmark-schema.ts` では同一 DDL バッチに `DROP PROPERTY GRAPH` と `CREATE PROPERTY GRAPH` を含める。

## 設定の env 化

すべての接続情報は環境変数で上書き可能。`.env.local.example` にデフォルトを記載。

- `src/lib/pg.ts` … `createPool()` / `pgConfig()` — PG_HOST / PG_PORT / PG_USER / PG_PASSWORD / PG_DATABASE（デフォルト localhost / 5432 / admin / password / postgres）
- `src/lib/spanner.ts` … `getDatabase()` / `spannerConfig()` — SPANNER_EMULATOR_HOST / SPANNER_PROJECT_ID / SPANNER_INSTANCE_ID / SPANNER_DATABASE_ID（デフォルト localhost:15000 / default / default / history-db）
- `scripts/etl-sqlite-to-pg.ts` … `process.argv[2]` → `HISTORY_PATH` → `./History` の優先順で SQLite パスを解決

ハードコードは禁止。新規にスクリプト / ルートを足す場合も上記ヘルパーから取得する。

## ETL の責務

- `src/lib/etl/history-etl.ts`
  - `loadHistoryToPg(sqlitePath, pg)`: Chrome の `urls` / `visits` / `keyword_search_terms` を読み、上記方針で PostgreSQL に upsert。戻り値に `dateRange` を含める
  - `loadHistoryToSpanner(pg, database)`: PostgreSQL を集計して `SearchTermNode` / `WebPageNode` / `SearchedFor` / `LinkedTo` に upsert
- `src/lib/etl/bookmark-etl.ts`
  - `parseBookmarksJson(jsonString)`: Chrome `Bookmarks` JSON を再帰的に walk して `folders` / `bookmarks` を返す
  - `loadBookmarksToPg(parsed, pg)`: 既存ブックマークを削除した上でフォルダ・ブックマークを書き込む
  - `loadBookmarksToSpanner(pg, database)`: `BookmarkFolderNode` / `FolderContains` / `Bookmarked` を upsert し、`WebPageNode` に `is_bookmarked=true` を立てる

### 不変条件

- **Chrome タイムスタンプ変換**: `(chromeTime / 1_000_000 - 11_644_473_600) * 1000` で Unix ms に変換。`history-etl.ts:chromeTimeToISO`、`bookmark-etl.ts:chromeTimeToDate` を使う
- **URL 長制限**: `MAX_URL_LENGTH = 3000`。これを超える URL は `WebPageNode` / `SearchedFor` / `LinkedTo` 投入時にスキップ（Spanner の PK 8192 バイト上限を回避するため）
- **`hidden=1` を除外**: WebPageNode / SearchedFor / LinkedTo は `chrome_history.urls.hidden = 0` のみを対象にする
- **インクリメンタル同期**: 履歴の `loadHistoryToPg` は `DELETE` しない。複数プロファイルの履歴を順次マージできる前提を維持

## API ルート

| エンドポイント | 概要 |
| --- | --- |
| `POST /api/upload/history` | `multipart/form-data` で SQLite を受け取り、PG → Spanner ETL を実行。`maxDuration = 300` 設定済み |
| `POST /api/upload/bookmarks` | 同上で Bookmarks JSON を処理 |
| `GET /api/graph/search?term=&maxHops=&from=&to=` | 検索キーワード起点のサブグラフ。期間で `visit_time` をフィルタ |
| `GET /api/graph/context?url=&from=&to=` | 任意 URL の流入元・遷移先サブグラフ |
| `GET /api/graph/bookmarks?folderId=` | 指定フォルダ配下のブックマークツリー。`foldersOnly=true` でフォルダ一覧のみ返す |

`graph-queries.ts:isWithinDateRange` で `YYYY-MM-DD` の前後を比較。期間フィルタは GQL ではなくアプリ側で行う。

## Spanner / GQL の落とし穴

- `*0..10` などの **可変長パス未対応**。ブックマークのツリー展開は `queryBookmarkTree` で全件取得 + BFS
- `CONTAINS` は予約語のためテーブル名は `FolderContains`
- DDL の `DROP PROPERTY GRAPH` と `CREATE PROPERTY GRAPH` は **同一バッチ** で実行しないと整合が崩れる
- Spanner Omni は不安定で `DEADLINE_EXCEEDED` / `timestamp staleness` を返すことがある。`docker compose down -v && up -d` でリセット
- `WebPageNode` の挿入は upsert なので、`visit_count` / `last_visit` は履歴 ETL 由来の値を書き戻す前提で扱う

## フロントの構成

- `src/app/page.tsx` — 履歴グラフ（検索 / コンテキスト）
- `src/app/bookmarks/page.tsx` — ブックマーク（mindmap / tree 切替）
- `src/app/upload/page.tsx` — `UploadPanel` 経由のドラッグ&ドロップ
- 共通: `GraphCanvas`（Cytoscape ラッパー、SSR 無効・`dynamic` で読み込み）、`NodeDetail`、`Header`

クライアントから `/api/upload/*` への `fetch` は `AbortSignal.timeout(300000)` を付与する。

## 編集時のチェックリスト

1. PostgreSQL に新カラム/テーブルを追加する場合は `README.md` の DDL ブロックも同期して更新する
2. Spanner スキーマを変えるときは `setup-spanner-schema.ts` / `migrate-bookmark-schema.ts` の両方を見直す（HistoryGraph の再作成も同一バッチで）
3. 履歴 ETL を編集するときは「複数回アップロードで差分マージできること」「URL > 3000 char をスキップすること」を維持する
4. UI 変更後は `npm run dev` でローカルブラウザ確認まで行う
5. テストは `npm test`、Lint は `npm run lint`

## Next.js のバージョン留意

このリポジトリの Next.js は通常版と挙動が異なる場合がある。新しい API を使うときは `node_modules/next/dist/docs/` の該当ガイドを必ず参照すること（`AGENTS.md` 参照）。
