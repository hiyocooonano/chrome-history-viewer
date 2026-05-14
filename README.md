# Chrome History Graph Explorer

Chrome 閲覧履歴・ブックマークを Spanner Graph で可視化するプロトタイプ。

- 検索キーワードを起点に、どのページを訪問しどのように遷移したかをグラフ表示
- 任意の URL の流入元・遷移先（コンテキスト）をグラフ表示
- Chrome ブックマークをマインドマップ / 階層ツリーで可視化
- 履歴・ブックマークの可視化は期間・フォルダで絞り込み可能

ローカルでは Spanner Omni（Spanner の Docker 配布版）を使用し、本番では Spanner Graph への移行を想定。

---

## アーキテクチャ

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│ Chrome      │     │ PostgreSQL   │     │ Spanner Omni   │     │ Next.js App  │
│ History     │ ──> │ chrome_      │ ──> │ HistoryGraph   │ ──> │ Cytoscape.js │
│ (SQLite)    │     │ history      │     │ (Property      │     │ Graph UI     │
│ Bookmarks   │     │ schema       │     │  Graph)        │     │              │
│ (JSON)      │     │              │     │                │     │              │
└─────────────┘     └──────────────┘     └────────────────┘     └──────────────┘
       ETL Step 1               ETL Step 2                GQL クエリ
```

- **ETL Step 1**: SQLite/JSON → PostgreSQL（生データの保存・差分マージ）
- **ETL Step 2**: PostgreSQL → Spanner（グラフモデルへ変換・upsert）
- **クエリ**: フロントから API 経由で Spanner に GQL を発行し、Cytoscape.js 用の要素に変換

---

## セットアップ

### 前提

- Docker
- Node.js 20+
- Spanner Omni Docker イメージへのアクセス権

### 1. インフラ起動（Spanner Omni + PostgreSQL）

```bash
docker compose up -d
# 起動完了まで 10〜15 秒待ち、Spanner Omni のログに "Spanner is ready" を確認
docker exec -it spanner-omni /google/spanner/bin/spanner databases create history-db
```

- Spanner Omni gRPC: `localhost:15000` / Web Console: `http://localhost:15026`
- PostgreSQL: `localhost:5432`（user=`admin`, password=`password`, db=`postgres`）
- `scripts/init-db.sql` が初回起動時に `chrome_history` スキーマと各テーブル / インデックスを作成する

### 2. 環境変数（任意）

`.env.local.example` をコピーして必要なものだけ上書きしてください。デフォルトは上記の docker-compose に揃えてあります。

```bash
cp .env.local.example .env.local
```

| 変数 | デフォルト | 用途 |
| --- | --- | --- |
| `SPANNER_EMULATOR_HOST` | `localhost:15000` | Spanner Omni gRPC |
| `SPANNER_PROJECT_ID` | `default` | プロジェクト ID |
| `SPANNER_INSTANCE_ID` | `default` | インスタンス ID |
| `SPANNER_DATABASE_ID` | `history-db` | データベース ID |
| `PG_HOST` / `PG_PORT` / `PG_USER` / `PG_PASSWORD` / `PG_DATABASE` | `localhost / 5432 / admin / password / postgres` | PostgreSQL 接続情報 |
| `HISTORY_PATH` | (未設定) | CLI ETL でデフォルト参照する Chrome `History` SQLite のパス |

### 3. 依存パッケージ

```bash
npm install
```

### 4. Spanner スキーマ作成

```bash
npm run setup:spanner      # 履歴用テーブル + HistoryGraph
npm run migrate:bookmarks  # ブックマーク用テーブル / グラフを追加
```

### 5. 開発サーバー起動

```bash
npm run dev
```

→ `http://localhost:3000`

---

## 利用方法

### A. データ投入

#### 方法 1: ブラウザからアップロード（推奨）

`/upload` を開き、Chrome の以下のファイルをドラッグ&ドロップ:

| 種類 | macOS パス |
| --- | --- |
| 履歴 | `~/Library/Application Support/Google/Chrome/Default/History` |
| ブックマーク | `~/Library/Application Support/Google/Chrome/Default/Bookmarks` |

- 履歴はインクリメンタル同期。複数のプロファイル（`Default`, `Profile 1` ...）の `History` を順次アップロードすると、マージされる
- API のタイムアウトは 5 分（`maxDuration = 300`）

#### 方法 2: CLI

```bash
# パスを引数 or 環境変数で渡す
npm run etl:sqlite-to-pg -- /path/to/Chrome/Default/History
# あるいは HISTORY_PATH=/path/to/History を .env.local で設定して引数なし

npm run etl:pg-to-spanner
```

### B. 履歴の可視化（`/`）

- **検索起点分析**: 検索キーワードを選ぶ → そのキーワードで開いたページ群 → さらに hop を辿るとそこから遷移したページが表示される
- **コンテキスト追跡**: 任意の URL を入力 → そのページに流入してきたページと、そこから遷移したページが表示される
- **期間フィルタ**: `YYYY-MM-DD` の from / to で絞り込み（クライアント側で `visit_time` を検査）
- **レイアウト切替**: `cola`（力学レイアウト）/ `dagre`（階層レイアウト）

### C. ブックマークの可視化（`/bookmarks`）

- ルート（全体）または特定フォルダから配下のツリーを表示
- **マインドマップ**: cola レイアウトで放射状に展開
- **階層ツリー**: dagre レイアウトで左から右に階層表示
- 履歴グラフ上の WebPage ノードには、ブックマーク登録済みかどうかを示すフラグが付与される

### D. データのリセット

```bash
# Spanner + PostgreSQL をボリュームごと削除して作り直す
docker compose down -v
docker compose up -d
docker exec -it spanner-omni /google/spanner/bin/spanner databases create history-db
npm run setup:spanner
npm run migrate:bookmarks
```

---

## データ構造

### Chrome 履歴ファイル（入力）

Chrome の `History` は SQLite。本アプリで使うテーブルと項目は以下:

| テーブル | カラム | 説明 |
| --- | --- | --- |
| `urls` | `id` | URL の内部 ID |
| | `url` | URL 文字列 |
| | `title` | ページタイトル |
| | `visit_count` | 訪問回数（Chrome 集計） |
| | `last_visit_time` | 最終訪問（Chrome タイムスタンプ） |
| | `hidden` | 非表示フラグ（1 は除外） |
| `visits` | `id` | 訪問ごとのユニーク ID |
| | `url` | `urls.id` への参照 |
| | `visit_time` | 訪問時刻 |
| | `from_visit` | 流入元の `visits.id`（0 はなし） |
| | `transition` | 遷移種別（link / typed / form_submit など） |
| | `visit_duration` | 滞在時間（マイクロ秒） |
| `keyword_search_terms` | `url_id` | 検索結果ページの `urls.id` |
| | `term` | 検索キーワード |

> Chrome のタイムスタンプは「1601-01-01 UTC からのマイクロ秒」。`(chromeTime / 1_000_000 - 11_644_473_600) * 1000` で Unix ms に変換。

### Chrome ブックマークファイル（入力）

Chrome の `Bookmarks` は JSON。`roots.bookmark_bar` / `roots.other` / `roots.synced` をルートに、`type` が `folder` / `url` のツリーとして再帰的に格納される。フォルダの `guid` をフォルダ ID として扱う。

### PostgreSQL: `chrome_history` スキーマ（中間層）

| テーブル | PK / 制約 | 役割 |
| --- | --- | --- |
| `urls` | PK `id` | Chrome `urls` テーブルのコピー。`ON CONFLICT (id) DO UPDATE` で差分マージ |
| `visits` | PK `id` | Chrome `visits` テーブルのコピー。`ON CONFLICT DO NOTHING` |
| `search_terms` | unique `(url_id, term)` | 検索キーワードと URL の対応。`ON CONFLICT DO NOTHING` |
| `bookmark_folders` | PK `folder_id` | ブックマークフォルダ（GUID, 名前, 親フォルダ, 階層） |
| `bookmarks` | (なし、TXN で `DELETE`→`INSERT`) | ブックマーク本体（フォルダ ID, URL, 名前, 追加日, 最終利用日） |

スキーマ定義は `scripts/init-db.sql` を参照（postgres コンテナ初回起動時に自動適用）。

### Spanner: `history-db`（グラフ層）

#### ノードテーブル

| テーブル | PK | カラム |
| --- | --- | --- |
| `SearchTermNode` | `term` | `search_count`, `first_search`, `last_search` |
| `WebPageNode` | `url` | `title`, `domain`, `visit_count`, `last_visit`, `is_bookmarked`, `bookmark_folder` |
| `BookmarkFolderNode` | `folder_id` | `name`, `depth` |

#### エッジテーブル

| テーブル | PK | SOURCE → DESTINATION |
| --- | --- | --- |
| `SearchedFor` | `(term, url)` | `SearchTermNode.term` → `WebPageNode.url`（`search_time`） |
| `LinkedTo` | `(source_url, target_url, visit_time)` | `WebPageNode.url` → `WebPageNode.url`（`transition_type`, `visit_duration`） |
| `FolderContains` | `(parent_folder_id, child_folder_id)` | `BookmarkFolderNode` → `BookmarkFolderNode` |
| `Bookmarked` | `(folder_id, url)` | `BookmarkFolderNode` → `WebPageNode`（`date_added`, `date_last_used`） |

#### Property Graph

```
CREATE PROPERTY GRAPH HistoryGraph
  NODE TABLES (SearchTermNode, WebPageNode, BookmarkFolderNode)
  EDGE TABLES (SearchedFor, LinkedTo, FolderContains, Bookmarked)
```

GQL 例:

```sql
GRAPH HistoryGraph
MATCH (s:SearchTermNode {term: @term})-[e:SearchedFor]->(p:WebPageNode)
RETURN s.term, p.url, p.title, e.search_time
```

#### 制約上の注意

- **PK サイズ上限**: Spanner の PK は 8192 バイトまで。`LinkedTo` の PK = `source_url + target_url + visit_time` のため、3000 文字超の URL は ETL でスキップ（`MAX_URL_LENGTH = 3000`）
- **GQL の可変長パス未対応**: `-[*0..10]->` のような表現は使えないため、ブックマークのツリー展開はアプリ側で BFS して構築
- **予約語**: `CONTAINS` は予約語のため、テーブル名は `FolderContains` を使用

---

## ディレクトリ構成

```
history-viewer/
├── docker-compose.yml          # Spanner Omni + PostgreSQL
├── scripts/
│   ├── init-db.sql             # postgres 初期化 (chrome_history スキーマ)
│   ├── setup-spanner-schema.ts # 履歴用 DDL + HistoryGraph
│   ├── migrate-bookmark-schema.ts # ブックマーク用 DDL + Graph 再作成
│   ├── etl-sqlite-to-pg.ts     # CLI ETL（引数 or HISTORY_PATH）
│   └── etl-pg-to-spanner.ts    # CLI ETL
├── src/
│   ├── app/
│   │   ├── page.tsx            # 履歴グラフ画面
│   │   ├── bookmarks/page.tsx  # ブックマーク画面
│   │   ├── upload/page.tsx     # アップロード画面
│   │   └── api/
│   │       ├── graph/{search,context,bookmarks}/route.ts
│   │       └── upload/{history,bookmarks}/route.ts
│   ├── components/             # UploadPanel, GraphCanvas, BookmarkTree など
│   ├── lib/
│   │   ├── etl/{history,bookmark}-etl.ts
│   │   ├── graph-queries.ts    # GQL クエリ + Cytoscape 変換
│   │   ├── spanner.ts          # spannerConfig() / getDatabase()
│   │   ├── pg.ts               # createPool() / pgConfig()
│   │   └── transform.ts
│   └── types/graph.ts
└── __tests__/
```

---

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| `DEADLINE_EXCEEDED` / `FAILED_PRECONDITION: timestamp staleness` | `docker compose down && docker compose up -d` でコンテナを再起動。`Spanner is ready` を待つ |
| アップロード時に `Unexpected end of JSON input` | ETL が 5 分を超えた可能性。`maxDuration = 300` を確認。クライアントは `AbortSignal.timeout(300000)` |
| LinkedTo の挿入で PK サイズエラー | `MAX_URL_LENGTH`（3000 文字）超の URL はスキップ済み。さらに長い URL を扱う場合は同定数を調整 |
| GQL `*0..10` で構文エラー | Spanner Omni / Spanner Graph は可変長パスを未サポート。アプリ側で BFS する |

---

## ライセンス

[MIT](./LICENSE)
