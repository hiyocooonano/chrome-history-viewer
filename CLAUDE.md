@AGENTS.md

# history-viewer

## このサービスのゴール

**Chrome 閲覧履歴・ブックマークを Spanner Graph で可視化するプロトタイプ**。Chrome の `History` (SQLite) と `Bookmarks` (JSON) を取り込み、PostgreSQL を中間層として Spanner（ローカルは Spanner Omni）の Property Graph に投入し、Cytoscape.js でグラフ表示する。

利用シーン:

- 検索キーワードを起点に、どのページを訪問しどう遷移したかを可視化
- 任意 URL の流入元 / 遷移先（コンテキスト）を可視化
- ブックマークをマインドマップ / 階層ツリーで眺める

利用者は本人想定（オーナー 1 人）。認証なし。

## 技術スタック

Next.js 16 (App Router, React 19) / TypeScript / Tailwind v4 / Cytoscape.js（`cytoscape-cola` / `cytoscape-dagre`） / `@google-cloud/spanner` / `pg` / `better-sqlite3` / Jest + ts-jest

> **Next.js のバージョン留意**: 通常版と挙動が異なる場合がある。新 API を使うときは `node_modules/next/dist/docs/` を必ず確認する（詳細は `AGENTS.md`）。

## コマンド

```bash
npm run dev               # 開発サーバ (3000 番)
npm run build             # プロダクションビルド
npm run lint              # ESLint
npm test                  # Jest

npm run setup:spanner     # Spanner: 履歴用 schema + HistoryGraph 作成
npm run migrate:bookmarks # Spanner: ブックマーク用 schema 追加 + Graph 再作成

npm run etl:sqlite-to-pg  # CLI: SQLite → PostgreSQL（引数 or HISTORY_PATH）
npm run etl:pg-to-spanner # CLI: PostgreSQL → Spanner
```

ローカル前提:

- Spanner Omni: `localhost:15000`（project=`default`, instance=`default`, db=`history-db`）
- PostgreSQL: `localhost:5432`（user=`admin`, password=`password`, db=`postgres`, schema=`chrome_history`）
- `docker compose up -d` → `docker exec spanner-omni /google/spanner/bin/spanner databases create history-db`

## ディレクトリ早見

```
src/
  app/
    page.tsx              ← 履歴グラフ
    bookmarks/page.tsx    ← ブックマーク（mindmap / tree）
    upload/page.tsx       ← ドラッグ&ドロップで履歴 / ブックマーク投入
    api/graph/{search,context,bookmarks}/route.ts
    api/upload/{history,bookmarks}/route.ts   ← maxDuration = 300
  components/             ← GraphCanvas / BookmarkTree / SearchPanel / Header / UploadPanel ...
  lib/
    etl/history-etl.ts    ← Chrome → PG → Spanner
    etl/bookmark-etl.ts   ← Bookmarks JSON → PG → Spanner
    graph-queries.ts      ← Spanner GQL → GraphData
    transform.ts          ← GraphData → CytoscapeElements
    spanner.ts            ← spannerConfig() / getDatabase()
    pg.ts                 ← pgConfig() / createPool()
  types/graph.ts
scripts/
  init-db.sql                  ← postgres 初期化（chrome_history schema）
  setup-spanner-schema.ts
  migrate-bookmark-schema.ts
  etl-sqlite-to-pg.ts
  etl-pg-to-spanner.ts
__tests__/
```

データ層の責務分担: **Chrome → PG（生データの差分マージ） → Spanner（グラフモデル upsert） → API → クライアント Cytoscape**。

## ルール（自動で読み込まれる）

- `.claude/rules/architecture.md` — App Router 構成、Server / Client 分離、SSR 不可ライブラリの扱い、`serverExternalPackages`
- `.claude/rules/data-pipeline.md` — Schema 早見、ETL の責務、Chrome タイムスタンプ・URL 長制限などの不変条件、Spanner / GQL の落とし穴
- `.claude/rules/api-routes.md` — `/api/graph/*` / `/api/upload/*` の責務、期間フィルタ、`maxDuration`、エラー応答形式
- `.claude/rules/cytoscape.md` — Cytoscape の SSR 無効化、plugin 登録、レイアウト切替、ノード色 / サイズ規約
- `.claude/rules/testing.md` — Jest + ts-jest（node env）、ETL / transform のテスト、Spanner 統合テスト方針
- `.claude/rules/env-config.md` — `pg.ts` / `spanner.ts` / `etl-sqlite-to-pg.ts` で環境変数を集約。ハードコード禁止

## Skill（呼び出して使う）

- `.claude/skills/git-workflow/` — ブランチ運用・PR 手順・GitHub MCP 利用ルール

## デザイン

- `DESIGN.md` — ダークテーマカラー / タイポ / 主要コンポーネント / 状態 UI / アクセシビリティ / レスポンシブ

## 重要な注意事項

- **IMPORTANT**: 接続情報のハードコード禁止。**`src/lib/pg.ts` / `src/lib/spanner.ts` の helper 経由**で取得する。新規スクリプト / route も同じヘルパーから取る。詳細は `env-config.md`
- **IMPORTANT**: `MAX_URL_LENGTH = 3000` を超える URL は `WebPageNode` / `SearchedFor` / `LinkedTo` 投入時にスキップ。Spanner の PK 8192 バイト上限を回避するため。値を変えるときは upstream の影響を全箇所確認する（`data-pipeline.md`）
- **IMPORTANT**: Cytoscape を使うコンポーネント（`GraphCanvas`, `BookmarkTree`）は **`next/dynamic` + `ssr: false`** で読み込む。SSR で評価されると DOM 不在で落ちる（`cytoscape.md`）
- 履歴 ETL は **インクリメンタル同期**。`urls` は `ON CONFLICT (id) DO UPDATE`、`visits` / `search_terms` は `DO NOTHING`。複数プロファイル分の `History` を順次マージできる前提を維持する
- ブックマーク追加で Spanner schema を変えるときは **同一 DDL バッチに `DROP PROPERTY GRAPH` + `CREATE PROPERTY GRAPH`** を含める（HistoryGraph の整合維持）
- 期間フィルタ（`from` / `to`）は **GQL ではなくアプリ側**で行う（`graph-queries.ts:isWithinDateRange`）。Spanner Omni の挙動が安定しないため
