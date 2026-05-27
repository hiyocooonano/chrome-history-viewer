---
paths:
  - "src/app/api/**/*.ts"
  - "src/lib/graph-queries.ts"
---

# API ルート

## エンドポイント一覧

| Method | Path | 概要 | maxDuration |
|--------|------|------|-------------|
| GET | `/api/graph/search?term=&maxHops=&from=&to=` | 検索キーワード起点のサブグラフ | (default) |
| GET | `/api/graph/search` (term 未指定) | 人気キーワード Top N を返す | (default) |
| GET | `/api/graph/context?url=&from=&to=` | 任意 URL の流入元・遷移先サブグラフ | (default) |
| GET | `/api/graph/bookmarks?folderId=&foldersOnly=true` | ブックマークツリー（フォルダ単位） | (default) |
| POST | `/api/upload/history` | `multipart/form-data` で SQLite を受け取り ETL 実行 | **300** |
| POST | `/api/upload/bookmarks` | `multipart/form-data` で JSON を受け取り ETL 実行 | **300** |

## 共通実装パターン

### GET（読み取り）

```ts
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const term = searchParams.get("term");
    const maxHops = Math.min(parseInt(searchParams.get("maxHops") || "2", 10), 3);
    const dateFrom = searchParams.get("from") || undefined;
    const dateTo = searchParams.get("to") || undefined;

    if (!term) {
      const topTerms = await getTopSearchTerms(20);
      return Response.json({ topTerms });
    }

    const graphData = await querySearchGraph(term, maxHops, dateFrom, dateTo);
    const elements = graphDataToCytoscapeElements(graphData);
    return Response.json({ graphData, elements });
  } catch (error) {
    console.error("[/api/graph/search] Error:", error);
    return Response.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
```

- レスポンスは **`{ graphData, elements }` の 2 本立て**（クライアント側で `setGraphData` / `setElements` の両方を持つため）
- 例外は `console.error` + 500 で返す。スタックは隠さず `message` で返す（プロトタイプなので情報露出 OK）
- 引数は **クエリパラメータからすべて取得**。body を使わない（GET）

### POST（アップロード / ETL 起動）

```ts
export const maxDuration = 300;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "file is required" }, { status: 400 });

  const tmpPath = join(tmpdir(), `history-${Date.now()}.sqlite`);
  const { projectId, instanceId, databaseId } = spannerConfig();
  const pg = createPool();
  const spanner = new Spanner({ projectId });
  const database = spanner.instance(instanceId).database(databaseId);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpPath, buffer);
    const pgResult = await loadHistoryToPg(tmpPath, pg);
    const spannerResult = await loadHistoryToSpanner(pg, database);
    return Response.json({ ...pgResult, ...spannerResult });
  } catch (error) {
    console.error("[/api/upload/history] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  } finally {
    await unlink(tmpPath).catch(() => {});
    await pg.end();
    await database.close();
    spanner.close();
  }
}
```

### POST 実装の必須事項

1. **`maxDuration = 300`** を必ず module レベルで宣言（ETL が長い）
2. **クライアント側のリクエストには `AbortSignal.timeout(300000)`** を付与する（`UploadPanel.tsx` を参考）
3. ファイルは `tmpdir()` に一旦書き出して ETL に渡す（`better-sqlite3` がパス受け取り前提）
4. `finally` で **必ず**:
   - 一時ファイルを `unlink`（`.catch(() => {})` でエラー無視）
   - `pg.end()` で PG プールを閉じる
   - `database.close()` / `spanner.close()` で Spanner を閉じる

## 期間フィルタ

`from` / `to` は `YYYY-MM-DD`。`graph-queries.ts:isWithinDateRange` で **アプリ側**に判定する。GQL に渡さない（`data-pipeline.md`）。

## maxHops の上限

```ts
const maxHops = Math.min(parseInt(searchParams.get("maxHops") || "2", 10), 3);
```

- デフォルト 2、最大 3。これ以上はノード数が爆発するので許可しない
- UI（`SearchPanel.tsx`）の slider も 1〜3 の範囲

## レスポンス形式の決まりごと

```ts
// 成功
{ graphData: GraphData, elements: CytoscapeElements }       // /api/graph/*
{ topTerms: Array<{ term, searchCount }> }                  // 検索なし
{ pages: number, visits: number, dateRange?: { from, to } } // /api/upload/*

// エラー
{ error: string, message?: string }                         // status >= 400
```

クライアントは `data.error` の存在で失敗判定する（`UploadPanel.tsx` を参考）。

## 新しい API を追加するとき

1. `src/app/api/<resource>/route.ts` に `export async function GET/POST(...)` を実装
2. データアクセスは `lib/graph-queries.ts` などに切り出し、route handler は薄いラッパー
3. PG / Spanner の接続は **`lib/pg.ts` / `lib/spanner.ts` の helper 経由のみ**（`env-config.md`）
4. クライアント側で 5 分以上かかり得る場合は `maxDuration = 300` + `AbortSignal.timeout(300000)`
5. エラーは `console.error` + JSON で 500 を返す

## 禁止事項

- route handler の中で接続情報をハードコード
- `pg.Pool` / `Spanner.Database` を **module レベル**で作って使い回す（リクエスト毎に作って `finally` で close）
- 例外を握り潰す（黙って空配列を返すと UI が「データなし」と区別できなくなる）
- GET で副作用のある操作（書き込みは POST）
