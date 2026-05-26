---
paths:
  - "src/components/GraphCanvas.tsx"
  - "src/components/BookmarkTree.tsx"
  - "src/components/GraphControls.tsx"
  - "src/lib/transform.ts"
  - "src/app/page.tsx"
  - "src/app/bookmarks/page.tsx"
---

# Cytoscape.js ルール

## SSR 無効化

Cytoscape は `document` / `HTMLElement` を直接触るため SSR では落ちる。**必ず `next/dynamic` + `ssr: false`** で読み込む:

```tsx
const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full text-gray-500 text-sm">
      グラフを読み込み中...
    </div>
  ),
});
```

- 親ページは Server / Client どちらでも良いが、`dynamic` import を使う側は `'use client'` を付ける
- `loading` プロパティで「読み込み中」プレースホルダを必ず指定する

## Plugin 登録

`cola` と `dagre` はモジュール先頭で **一度だけ登録**:

```tsx
import cytoscape from "cytoscape";
import cola from "cytoscape-cola";
import dagre from "cytoscape-dagre";

let registered = false;
if (!registered) {
  cytoscape.use(cola);
  cytoscape.use(dagre);
  registered = true;
}
```

複数コンポーネントで `cytoscape.use(...)` を直接呼ぶと warning が出る。各 component ファイル冒頭にこの guard を入れる。

## レイアウトの選択肢

| Layout | 用途 | 特徴 |
|--------|------|------|
| `cola` | 力学レイアウト | エッジを縮めて安定。デフォルト |
| `dagre` | 階層レイアウト | 左→右、源流→流入。流れを見るときに有効 |
| `mindmap` (Bookmark) | cola を放射状で使う | フォルダから放射状に展開 |
| `tree` (Bookmark) | dagre 階層 | フォルダ階層を素直に表示 |

`GraphControls` 経由で切り替え。`useEffect` の依存配列に `layout` を入れて、変更時に Cytoscape を作り直す。

## Cytoscape インスタンスのライフサイクル

```tsx
useEffect(() => {
  if (!containerRef.current) return;

  const cy = cytoscape({ container: containerRef.current, elements: [...], style: [...], layout: { name: layout, animate: true } });
  cy.on("tap", "node", (evt) => onNodeSelect(evt.target.id() as string));
  cy.on("tap", (evt) => { if (evt.target === cy) onNodeSelect(null); });
  cyRef.current = cy;

  return () => {
    cy.destroy();
    cyRef.current = null;
  };
}, [elements, layout, onNodeSelect]);
```

- `useEffect` の cleanup で必ず `cy.destroy()`
- 依存配列に `elements` / `layout` を入れる（変わったら作り直し）
- `cyRef` に `cy` を保持して zoom / fit などの imperative 操作に使う

## ノードのスタイル規約

色は `GraphCanvas.tsx:getNodeColor` に集約。直書き禁止:

| Type / Depth | Color | 意味 |
|--------------|-------|------|
| `search-term` (depth 0) | `#1a73e8`（青） | 検索キーワード |
| `web-page` (depth 1) | `#2e7d32`（緑） | 直接訪問ページ |
| `web-page` (depth 2+) | `#e65100`（橙） | 関連（遷移先） |
| `bookmark-folder` | `#7b1fa2`（紫） | フォルダ |

ブックマーク済みノードは `border-color: #ffd700` + `border-width: 3` + ラベル先頭に `★`。

エッジ:

| Type | Color | Style |
|------|-------|-------|
| `searched-for` | `#4fc3f7` | dashed |
| `linked-to` | `#66bb6a` | solid |
| Bookmark | `#7b1fa2` | solid |

## ノードサイズ

訪問回数 / 検索回数に応じて 30〜70px:

```ts
const count = vc ?? sc ?? 1;
return Math.max(30, Math.min(70, 20 + count * 3));
```

`degree(false)` ベースで font-size を変える方式（`BookmarkTree.tsx`）もある。

## ラベル

- 末尾省略: `text-wrap: "ellipsis"`, `text-max-width: "80px"`（フォルダは 120px）
- 配置: `text-valign: "bottom"`, `text-halign: "center"`
- `isBookmarked` のページは `★ ` を prefix（`GraphCanvas.tsx` の label callback）

## Zoom / Fit

`GraphCanvas` の右上に **+ / − / Fit** の 3 ボタンを置く。クリックで `cy.zoom(...)` / `cy.fit(undefined, 40)` を呼ぶ。`aria-label` を必ず付ける。

## 凡例 (Legend)

`GraphCanvas` の右下に**現在描いているノード / エッジ種別の凡例**を `bg-gray-900 bg-opacity-90` の小窓で表示。色を変えたら凡例も同期する。

## データ変換

API レスポンスの `GraphData` をそのまま渡さず、`src/lib/transform.ts:graphDataToCytoscapeElements` で `CytoscapeElements` に変換する:

```ts
const elements = graphDataToCytoscapeElements(graphData);
```

route handler 側で変換して両方返しているので、`useState<CytoscapeElements>` と `useState<GraphData>` の両方を持って、Cytoscape には elements、NodeDetail には graphData を渡す。

## 禁止事項

- Cytoscape を **Server Component から直接 import**
- color hex を component の途中に散らばせる（`getNodeColor` に集約）
- `useEffect` の cleanup を省略（メモリリーク + 二重 init）
- `cytoscape.use(...)` を module 外から呼ぶ（重複登録 warning）
