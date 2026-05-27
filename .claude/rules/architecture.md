---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "next.config.ts"
---

# アーキテクチャ

## レイヤリング

```
src/app/         ← Next.js App Router（ページ + route handler が同居）
src/components/  ← Client UI（Cytoscape, SearchPanel, UploadPanel, Header ...）
src/lib/
  etl/           ← ETL（PG / Spanner への書き込み）
  graph-queries  ← Spanner GQL → ドメイン GraphData
  transform      ← GraphData → CytoscapeElements
  pg / spanner   ← 接続 helper（環境変数 1 箇所集約）
src/types/       ← GraphNode / GraphEdge / CytoscapeElements 型定義
scripts/         ← Node 単体で動く CLI スクリプト（tsx 実行）
```

依存方向: `app → components → lib`、`scripts → lib`。逆は禁止。

## App Router 構成

App Router の **3 つの責務がひとつのプロセス**に乗っている:

1. **Server Component（page.tsx）** — 現状はクライアント主導なのでほぼ pass-through。初期データ取得を増やすなら Server Component で fetch する
2. **Route Handler（api/.../route.ts）** — Spanner / PostgreSQL に直接アクセスする backend
3. **Client Component（'use client'）** — Cytoscape / 状態管理 / `fetch` で route handler を叩く

```
app/
  page.tsx                              ← '/' 履歴グラフ（'use client'）
  bookmarks/page.tsx                    ← '/bookmarks' ブックマーク（'use client'）
  upload/page.tsx                       ← '/upload' ドラッグ&ドロップ
  api/
    graph/search/route.ts               ← GET /api/graph/search
    graph/context/route.ts              ← GET /api/graph/context
    graph/bookmarks/route.ts            ← GET /api/graph/bookmarks
    upload/history/route.ts             ← POST /api/upload/history (maxDuration=300)
    upload/bookmarks/route.ts           ← POST /api/upload/bookmarks (maxDuration=300)
```

詳細は `api-routes.md`。

## SSR / Client 境界

### Client 必須

- `src/components/GraphCanvas.tsx` / `BookmarkTree.tsx` — Cytoscape は DOM が必要。**`next/dynamic` + `ssr: false`** で import する（page.tsx の `dynamic(() => import("..."), { ssr: false })`）
- `'use client'` ディレクティブを先頭に付ける。`useState` / `useEffect` / event handler を持つコンポーネント全般

### Server only

- `src/app/api/**/route.ts` — Spanner / PG / fs / `better-sqlite3` を使用。client 側に import されないように切り出してある
- `src/lib/etl/**` — Node API（`pg.Pool`, `Spanner.Database`, `better-sqlite3`）依存。**`'use client'` のファイルから import 禁止**

## `next.config.ts` の `serverExternalPackages`

```ts
serverExternalPackages: [
  "@google-cloud/spanner",
  "@grpc/grpc-js",
  "@grpc/proto-loader",
  "google-gax",
]
```

これらは Node ネイティブ依存があるため、Next.js のバンドルで握り潰されないよう **server bundle の external 扱い**にする。
新しく gRPC 系 / native binding 系のパッケージを足したら同様に追加する（さもないと build 時に "Cannot find module" / `binding.node` 関連のエラーになる）。

## 依存ライブラリの呼び出し制約

| Package | 呼べる場所 | 理由 |
|---------|------------|------|
| `@google-cloud/spanner` | route handler / scripts | gRPC、Node only |
| `pg` | route handler / scripts | Node only |
| `better-sqlite3` | route handler / scripts | C++ binding |
| `cytoscape` / `-cola` / `-dagre` | client component のみ | DOM 依存 |

クライアント component が `lib/etl/` を間接的にでも import すると build error になる。**API は必ず route handler を介す**。

## Provider / Context

現状アプリは Provider を使っていない。状態は **各ページコンポーネントの `useState`** に閉じる。Cross-cutting な context が必要になったら `src/providers/` を作って `layout.tsx` の `<body>` 内に注入する（`follow-trade-fe` の構成を参考）。

## 新機能を追加するとき

1. **読み取り API**: `src/app/api/<resource>/route.ts` に GET を実装。Spanner / PG アクセスは `src/lib/` の helper を使う
2. **クエリ拡張**: `src/lib/graph-queries.ts` に GQL クエリと変換を追加。期間フィルタは `isWithinDateRange` で行う
3. **画面**: `src/app/<feature>/page.tsx` を `'use client'` で作成。Cytoscape を使うなら `next/dynamic` で wrapper
4. **ETL 拡張**: `src/lib/etl/<area>-etl.ts` に書く。Chrome タイムスタンプ・URL 長制限・差分マージは必ず守る（`data-pipeline.md`）
5. **テスト**: `__tests__/` 配下。ETL ロジックや transform は ts-jest + node env で書く（`testing.md`）

## 禁止事項

- `lib/etl/`, `lib/spanner.ts`, `lib/pg.ts` を **client component（`'use client'`）から import** すること
- 接続情報のハードコード（`env-config.md`）
- Cytoscape を Server Component から直接 import すること
- マージ済みの `scripts/init-db.sql` を書き換えること（DDL は追加 SQL で evolve、または `migrate-*.ts` を新規に追加）
