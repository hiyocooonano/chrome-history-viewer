---
paths:
  - "src/lib/etl/**/*.ts"
  - "src/lib/graph-queries.ts"
  - "scripts/**/*.ts"
  - "scripts/init-db.sql"
---

# データパイプライン

## 全体像

```
Chrome SQLite / Bookmarks JSON
       │ (ETL Step 1)
       ▼
PostgreSQL: chrome_history schema （生データの差分マージ）
       │ (ETL Step 2)
       ▼
Spanner: HistoryGraph（Property Graph）
       │ (GQL クエリ)
       ▼
Next.js route handler → Cytoscape
```

- ETL Step 1: `loadHistoryToPg(sqlitePath, pg)` / `loadBookmarksToPg(parsed, pg)`
- ETL Step 2: `loadHistoryToSpanner(pg, database)` / `loadBookmarksToSpanner(pg, database)`

## PostgreSQL: `chrome_history` schema

中間層。**差分マージ前提**。

| テーブル | PK / UK | 主要カラム | 同期方針 |
|---------|---------|----------|---------|
| `urls` | PK `id` | `url`, `title`, `visit_count`, `typed_count`, `last_visit_time`, `hidden` | `ON CONFLICT (id) DO UPDATE`、`visit_count`/`last_visit_time` は `GREATEST`、`title` は `COALESCE` |
| `visits` | PK `id` | `url`, `visit_time`, `from_visit`, `transition`, `visit_duration` | `ON CONFLICT DO NOTHING` |
| `search_terms` | UK `(url_id, term)` | `keyword_id`, `url_id`, `term`, `normalized_term` | `ON CONFLICT DO NOTHING` |
| `bookmark_folders` | PK `folder_id` | `name`, `parent_folder_id`, `depth` | TXN 内で `DELETE` → `INSERT` |
| `bookmarks` | (なし) | `folder_id`, `url`, `name`, `date_added`, `date_last_used` | TXN 内で `DELETE` → `INSERT` |

スキーマ定義は `scripts/init-db.sql`（postgres コンテナ初回起動時に自動適用）。

## Spanner: `history-db`

### ノード

| テーブル | PK | カラム |
|---------|----|--------|
| `SearchTermNode` | `term` | `search_count`, `first_search`, `last_search` |
| `WebPageNode` | `url` | `title`, `domain`, `visit_count`, `last_visit`, `is_bookmarked`, `bookmark_folder` |
| `BookmarkFolderNode` | `folder_id` | `name`, `depth` |

### エッジ

| テーブル | PK | SRC → DST | 補助カラム |
|---------|----|----------|-----------|
| `SearchedFor` | `(term, url)` | `SearchTermNode.term` → `WebPageNode.url` | `search_time` |
| `LinkedTo` | `(source_url, target_url, visit_time)` | `WebPageNode.url` → `WebPageNode.url` | `transition_type`, `visit_duration` |
| `FolderContains` | `(parent_folder_id, child_folder_id)` | `BookmarkFolderNode` → `BookmarkFolderNode` | — |
| `Bookmarked` | `(folder_id, url)` | `BookmarkFolderNode` → `WebPageNode` | `date_added`, `date_last_used` |

Property Graph 名: `HistoryGraph`。

```sql
CREATE PROPERTY GRAPH HistoryGraph
  NODE TABLES (SearchTermNode, WebPageNode, BookmarkFolderNode)
  EDGE TABLES (SearchedFor, LinkedTo, FolderContains, Bookmarked)
```

## 不変条件

### Chrome タイムスタンプ変換

「1601-01-01 UTC からのマイクロ秒」→ Unix ms:

```ts
const unixMs = (chromeTime / 1_000_000 - 11_644_473_600) * 1000;
```

`history-etl.ts:chromeTimeToISO`、`bookmark-etl.ts:chromeTimeToDate` を使う。直接計算式を散らさない。

### URL 長制限

`MAX_URL_LENGTH = 3000`。これを超える URL は **`WebPageNode` / `SearchedFor` / `LinkedTo` の投入時にスキップ**する。

理由: Spanner の PK は 8192 バイト上限。`LinkedTo` の PK = `source_url + target_url + visit_time` の組合せで容易に超えるため。

### `hidden=1` の除外

`WebPageNode` / `SearchedFor` / `LinkedTo` は `chrome_history.urls.hidden = 0` のみを対象にする。Chrome が「履歴に出さない」と判断したものを Graph に出さない。

### インクリメンタル同期

`loadHistoryToPg` は **`DELETE` しない**。複数プロファイルの履歴を順次マージできる前提を維持。`urls` の `visit_count` / `last_visit_time` は `GREATEST` で大きい値を採用、`title` は `COALESCE` で既存優先。

## Spanner / GQL の落とし穴

| 症状 / 制約 | 対応 |
|------------|------|
| `*0..10` 等の可変長パス未対応 | アプリ側で BFS（`queryBookmarkTree` 参照）。ブックマークツリーは全件取得 + クライアント側で組み立て |
| `CONTAINS` は予約語 | テーブル名は `FolderContains`（`Contains` にしない） |
| Property Graph の整合 | スキーマ変更時に `DROP PROPERTY GRAPH` + `CREATE PROPERTY GRAPH` を **同一 DDL バッチ**で実行（`migrate-bookmark-schema.ts` 参照） |
| `DEADLINE_EXCEEDED` / `timestamp staleness` | Spanner Omni を `docker compose down -v && up -d` で再起動。`Spanner is ready` を待つ |
| `WebPageNode.visit_count` / `last_visit` | 履歴 ETL 由来の値で `UPDATE`。ブックマーク ETL では上書きしない |

## 期間フィルタ（`from` / `to`）

GQL ではなく **アプリ側**で行う:

```ts
function isWithinDateRange(isoTimestamp: string, dateFrom?: string, dateTo?: string): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!isoTimestamp) return true;
  const ts = isoTimestamp.slice(0, 10); // YYYY-MM-DD
  if (dateFrom && ts < dateFrom) return false;
  if (dateTo && ts > dateTo) return false;
  return true;
}
```

`YYYY-MM-DD` の文字列比較で前後を判定。Spanner Omni の安定性確保 + クライアントから渡しやすい形に揃えるため。

## DDL 変更時のチェックリスト

1. `scripts/init-db.sql` に PG 側カラム / テーブル追加が必要なら追記
2. Spanner 側は `scripts/setup-spanner-schema.ts` または新規 `migrate-*.ts` で DDL を発行
3. Property Graph を再作成する DDL は **同一バッチ** に DROP / CREATE を入れる
4. README.md の DDL ブロックも同期更新
5. dev / CI のリセット手順: `docker compose down -v && up -d` で全データ削除 → `migrate:*` を順次実行

## ETL を編集するとき必ず守る

- 「複数回アップロードしても差分マージで増えていくこと」
- 「URL > 3000 char をスキップすること（`MAX_URL_LENGTH` 定数を経由）」
- 「Chrome タイムスタンプは helper 関数で変換すること」
- 「`hidden = 1` を除外すること」
