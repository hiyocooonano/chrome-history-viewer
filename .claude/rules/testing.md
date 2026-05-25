---
paths:
  - "__tests__/**/*.ts"
  - "src/lib/**/*.ts"
---

# テストルール

## UT 必須原則

**実装と同じコミットで UT を作成する**。「テストスキップで build が通った」だけで完了扱いにしない。

### 必須対象

- `src/lib/transform.ts` — `GraphData → CytoscapeElements` 変換のフィールド検証
- `src/lib/etl/*.ts` の純粋関数（Chrome タイムスタンプ変換、Bookmarks JSON パース、URL 長制限フィルタなど）
- `src/lib/graph-queries.ts` のヘルパー（`isWithinDateRange` のような純粋関数）

### 不要なもの

- Spanner / PG への副作用を含む E2E 的なフロー（個別の純粋ロジックに分解してテスト）
- Cytoscape を実描画するレンダーテスト（DOM 依存、jsdom では cola/dagre が動かない）

## Jest 設定

`jest.config.ts`:

```ts
preset: "ts-jest",
testEnvironment: "node",          // ← node 環境
roots: ["<rootDir>/__tests__"],
moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
```

UI をテストしたい場合は別 config で `jsdom` を使うか、対象ファイル冒頭で `@jest-environment jsdom` を指定する。

## ディレクトリ

```
__tests__/
  lib/
    transform.test.ts        ← GraphData → CytoscapeElements
    bookmark-etl.test.ts     ← JSON パース・walk
    history-etl.test.ts      ← Chrome タイムスタンプ変換、URL 長フィルタ
```

src 配下とパラレルなパスを保つ。

## transform / 純粋関数のテストパターン

`__tests__/lib/transform.test.ts` を雛形にする:

```ts
import { graphDataToCytoscapeElements } from "@/lib/transform";
import type { GraphData } from "@/types/graph";

describe("graphDataToCytoscapeElements", () => {
  it("converts GraphData to CytoscapeElements", () => {
    const input: GraphData = { nodes: [...], edges: [...] };
    const result = graphDataToCytoscapeElements(input);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].data).toEqual({
      id: "term:日向坂46",
      label: "日向坂46",
      type: "search-term",
      depth: 0,
      searchCount: 11,
    });
  });

  it("returns empty elements for empty input", () => { ... });
  it("converts bookmark-folder nodes", () => { ... });
  it("includes bookmark info for web-page nodes", () => { ... });
});
```

- それぞれの **ノード type / depth / フラグの組み合わせ** ごとにテストを切る
- 「empty / edge case」を必ず 1 ケース入れる

## ETL テスト

純粋関数（パーサ / 変換）に切り出して node env でテストする:

```ts
// __tests__/lib/bookmark-etl.test.ts
import { parseBookmarksJson } from "@/lib/etl/bookmark-etl";

it("walks roots.bookmark_bar recursively", () => {
  const json = JSON.stringify({ roots: { bookmark_bar: { type: "folder", guid: "g", children: [...] } } });
  const result = parseBookmarksJson(json);
  expect(result.folders).toContainEqual(expect.objectContaining({ folderId: "g" }));
});
```

PG / Spanner への書き込み（`loadHistoryToPg` 等）はテストから除外し、その内部で呼ばれる純粋関数（`chromeTimeToISO`、URL 長フィルタなど）を切り出してテストする。

## 統合テストの方針（将来）

- Spanner Omni / PostgreSQL を `docker compose up` で起動した状態で、`__tests__/integration/` 配下に GoldenPath テストを置く
- Jest は遅いので `npm run test:integration` のような専用 script を用意する想定（現状は未配置）
- Spanner Omni は `DEADLINE_EXCEEDED` が出やすいので、リトライ + 安定化を実装してから入れる

## テスト命名

```ts
describe("<関数名>", () => {
  it("<観測可能な振る舞いを 1 行で>", () => { ... });
});

// 例:
it("converts GraphData to CytoscapeElements", () => { ... });
it("returns empty elements for empty input", () => { ... });
it("includes bookmark info for web-page nodes", () => { ... });
```

Spanner / PG / Cytoscape を含む test は内部の純粋関数に分解する責任を負う（テストしづらいときは設計を見直すサイン）。

## 落とし穴

- `@google-cloud/spanner` を import するモジュールを test ファイルから直接読むと、gRPC ネイティブが node env でも起動して遅延する。**純粋関数を別ファイルに切り出し**、test 側はそちらだけ import する
- `better-sqlite3` も同様。test の対象は SQLite クエリ部分ではなく、その結果を整形する関数にする
- `transformTimestamp` のような変換関数は `Date` の TimeZone に依存しないこと（テストが CI で日付ズレで落ちる）。Unix ms / ISO 文字列で扱う
