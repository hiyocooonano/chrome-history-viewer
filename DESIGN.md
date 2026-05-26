# history-viewer デザイン仕様

データ可視化ツール向けの **ダークテーマ**。Cytoscape.js のキャンバスがコンテンツの主役なので、UI クロムは最小限・低彩度。

## カラーパレット

Tailwind v4 デフォルトの `gray-*` / `blue-*` を基本に、グラフのノード / エッジは固定 hex で配色する（凡例とコードに直接対応）。

### Surface (UI)

| Token | Hex | 用途 |
|-------|-----|------|
| `gray-950` | `#030712` | `<body>` 背景（最も暗い） |
| `gray-900` | `#111827` | パネル / カード背景（SidePanel、NodeDetail bar） |
| `gray-800` | `#1f2937` | 入力 / 選択中のタブ / ボタン背景 |
| `gray-700` | `#374151` | ボーダー / hover bg |
| `gray-500` 〜 `gray-400` | 中間グレー | テキスト二次・キャプション |
| `gray-200` | `#e5e7eb` | hover 時のテキスト強調 |
| `white` | `#ffffff` | 本文・主要テキスト |

### Accent

| Token | Hex | 用途 |
|-------|-----|------|
| `blue-600` | `#2563eb` | 主アクション（検索ボタン）|
| `blue-700` | `#1d4ed8` | hover |
| `blue-500` | `#3b82f6` | フォーカスリング、active 線 |
| `blue-400` | `#60a5fa` | リンク・「読み込み中」 |
| `[#1a73e8]` | `#1a73e8` | Header の Google ブルー（プロダクト色） |

### Status

| Hex | 用途 |
|-----|------|
| `green-700 / 950/50` | アップロード成功表示 |
| `red-700 / 950/50` | エラー表示 |
| `yellow-400` (`#ffd700`) | ブックマーク済みの強調（★） |

### Graph ノード / エッジ（凡例と一致）

| Hex | 意味 |
|-----|------|
| `#1a73e8` | 検索キーワードノード（depth 0） |
| `#2e7d32` | 訪問ページ（depth 1） |
| `#e65100` | 関連ページ（depth 2+） |
| `#7b1fa2` | ブックマークフォルダノード |
| `#ffd700` | ブックマーク済みノードのボーダー |
| `#4fc3f7` | `searched-for` エッジ（dashed） |
| `#66bb6a` | `linked-to` エッジ（solid） |

これらの hex は `GraphCanvas.tsx` / `BookmarkTree.tsx` / 凡例 UI で共有する。**変えるときは凡例も同時に更新する**（`cytoscape.md` 参照）。

## タイポグラフィ

font-family: 既定（Arial, Helvetica, sans-serif）。グラフ可視化が主目的でテキストの装飾優先度は低い。

| Class | Size | 用途 |
|-------|------|------|
| `text-base` | 16px | Header タイトル |
| `text-lg font-semibold` | 18px | UploadPanel のセクション見出し |
| `text-sm` | 14px | 本文、ボタンラベル |
| `text-xs` | 12px | キャプション、ラベル、ステータスバー、凡例 |

font-weight は `font-medium`(500) / `font-semibold`(600) を中心に。`bold` はアクセント箇所のみ。

数値のラベルやキー / バリュー表記は `text-gray-400` + `text-white font-medium` の組合せで対比をつける（`NodeDetail` 参照）。

## 主要コンポーネント

### Header (`components/Header.tsx`)

`bg-[#1a73e8]` 固定。タイトル + ナビ（履歴グラフ / ブックマーク / アップロード）。
active タブは `bg-white/20`、inactive は `text-blue-100`。

### SearchPanel (`components/SearchPanel.tsx`)

左サイド固定 280px。`bg-gray-900 border-r border-gray-800 overflow-y-auto`。

- タブ（検索起点 / URL追跡）: 選択は `bg-gray-800 text-white border-b-2 border-blue-500`、未選択は `text-gray-400 hover:text-gray-200`
- 入力: `bg-gray-800 border border-gray-700 focus:border-blue-500`
- 主ボタン: `bg-blue-600 hover:bg-blue-700 text-white`
- スライダー: `accent-blue-500`

### GraphCanvas / BookmarkTree (`components/`)

`bg-gray-950` の中央キャンバス。`next/dynamic` + `ssr: false` で読み込む。
ZoomControls は右上、Legend は右下にフローティング配置（`absolute top-2 right-2` / `bottom-2 right-2`、`z-10`）。

### NodeDetail (`components/NodeDetail.tsx`)

下部固定の細い情報バー。`bg-gray-900 border-t border-gray-800 px-6 py-3 overflow-x-auto`。
カラーチップ + ラベル + 値の組（横並び）で、選択中ノードの主要属性を表示。

### UploadPanel (`components/UploadPanel.tsx`)

ドロップゾーン: `border-2 border-dashed`、ドラッグ中は `border-blue-400 bg-blue-950/30`、待機中は `border-gray-700 hover:border-gray-500`。
結果表示: 成功 `bg-green-950/50 border-green-700 text-green-200`、失敗 `bg-red-950/50 border-red-700 text-red-300`。

### GraphControls (`components/GraphControls.tsx`)

レイアウト切替の `<select>`。`bg-gray-900 bg-opacity-90 rounded px-3 py-2`、画面左上にフロート。

## 状態 UI

### Loading

- グラフ: `next/dynamic` の `loading` prop で「グラフを読み込み中...」を中央寄せ
- 全体 / ステータス: `text-blue-400 animate-pulse` で「読み込み中...」を inline 表示（`page.tsx` の Stats Bar 参照）

### Empty

- グラフが空: Cytoscape は noop（要素 0）。UI 側のメッセージは現状なし。**「データなし」とエラーを取り違えないために**、空配列レスポンスでも凡例とキャンバス枠は残す
- NodeDetail 未選択: 「ノードを選択すると詳細が表示されます」（`text-gray-500`）

### Error

- `console.error` でデバッグ情報を出し、UI ではアップロード時のみ赤バナーを表示（`UploadPanel`）
- グラフ取得失敗時は現状 `console.error` のみ。**将来的にトースト等で可視化する**

### Confirm

破壊操作は現状なし（クライアントから DELETE しない）。データリセットは CLI（`docker compose down -v`）に限定。

## アクセシビリティ

- **アイコンのみのボタンには `aria-label`** 必須（Zoom +/-, Fit ボタン参照）
- **キーボード操作**: SearchPanel / UploadPanel はネイティブ `<input>` / `<button>` で組み、Tab 順を明示しない
- **コントラスト**: ダークテーマは特に注意。`gray-500` 以下のテキストを `gray-900` 背景に置くとコントラスト不足。**主要テキストは `text-white` か `text-gray-200`** までを推奨
- **`html lang="ja"`** を維持（`layout.tsx`）
- **focus ring**: `focus:outline-none focus:border-blue-500` で input は border を変えて代替。`button` には `focus:ring-2 focus:ring-blue-500` を付与すると望ましい
- **`prefers-reduced-motion`**: cola レイアウトは `animate: true` だが、ユーザーの reduce-motion 設定を尊重するなら `animate` を切り替える余地を残しておく

## レスポンシブブレイクポイント

Tailwind v4 デフォルト:

| Prefix | min-width |
|--------|-----------|
| (none) | 0 |
| `sm:` | 640px |
| `md:` | 768px |
| `lg:` | 1024px |

設計指針:

- **最小利用 width は 1024px 想定**（デスクトップツール）。モバイル UX は副次的
- SidePanel は固定 280px。`< 1024px` でも一旦そのまま（将来折り畳み追加余地あり）
- グラフキャンバスは `flex-1` で余白を全消費
- NodeDetail は `overflow-x-auto` で横スクロール（情報を縦に積まない）

## アニメーション

- Cytoscape のレイアウトは `animate: true`（cola / dagre のネイティブ animation）
- UI 遷移は `transition-colors`（150ms 程度）に留める。Hero animation 等は避ける
- 「読み込み中」は `animate-pulse` を使う（点滅で進行を示す）
