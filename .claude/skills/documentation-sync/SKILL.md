---
name: documentation-sync
description: Use whenever modifying code, schema, behavior, endpoints, or domain vocabulary — ensures CLAUDE.md, .claude/rules, README, and design docs stay in sync within the same PR. Trigger before commit when you've changed entities, RPC/REST routes, enum values, state transitions, or introduced anti-pattern fixes.
---

# Documentation Sync

コードと仕様変更には **必ず同じ PR でドキュメントを更新**する。ドキュメントが古くなると Claude / 開発者の指示が誤動作し、設計負債が積み重なる。

## 同期マトリクス

| 変更タイプ | 同期対象 |
|----------|---------|
| RPC / REST エンドポイント追加・変更 | `CLAUDE.md` のエンドポイント表 |
| 公開／非公開の境界変更 (`@Authenticated` 追加・撤去) | `CLAUDE.md` 認証列、`.claude/rules/auth*.md` |
| エンティティ / カラム追加・リネーム | `.claude/rules/persistence.md`（パターン変更時）、`CLAUDE.md` の主要テーブル表 |
| ドメイン enum / 状態遷移の変更 | `CLAUDE.md` と該当 `.claude/rules/*.md` |
| カテゴリ追加（例: tech/life → tech/life/news） | `CLAUDE.md` の文言、`.claude/rules/*.md` の例 |
| 設計負債 / silent failure の修正 | `.claude/rules/<topic>.md` に「過去の負債」セクションを残す（再発防止） |
| 新規 skill / hook / フィルタ追加 | `CLAUDE.md` の「Skill」「ルール」セクション |
| README.md レベルの公開情報 | `README.md` |
| FE のデザインシステム変更 | `DESIGN.md` |

## チェックリスト（コミット前 / PR 作成前）

実装が固まったら以下を確認する。

- [ ] `CLAUDE.md` の「このサービスのゴール」は今も正確か？ 機能拡張で守備範囲が変わってないか？
- [ ] `CLAUDE.md` の「重要な注意事項 / IMPORTANT」に追加・削除すべき項目はないか？
- [ ] エンドポイント / テーブル / enum の一覧と実コードは一致するか？
- [ ] `.claude/rules/*.md` の `paths:` frontmatter は今も適切か？（新規ディレクトリを追加した場合、対象 paths を追記）
- [ ] 過去に書いた IMPORTANT 注意事項が「今は問題ない」状態になっていないか？（解消したら削除）
- [ ] FE で UI コンポーネント or トークンを変えたら `DESIGN.md` も更新したか？

## 「ドキュメントは別 PR」NG

コードの仕様変更とドキュメント更新を別 PR にすると、間に **コードとドキュメントが食い違う期間** が生じる。同じ PR にまとめる。

例外: ドキュメントの大規模リファクタ（CLAUDE.md → ToBe 形式化、`.claude/rules/` の新規導入 等）は単独 PR で良い。

## PR レビュー時の観点

`pr-review-toolkit:code-reviewer` を回す時、レビュー指示に「**コード変更に対応するドキュメント更新が同 PR に含まれているか**」を観点として明示する。

## ドキュメントを「足す」と「消す」の判断

- **足す**: 「Claude や他人がコードを読んでも気付かない暗黙の規約 / 過去の負債 / 非自明な制約」を見つけた時
- **消す**: 既に AI が知っている標準的な技術スタック・コマンド、変更で意味を失った IMPORTANT、コードと一致しなくなった列挙
- **判断基準** (Zenn記事): 「この行を消したら Claude が間違いを犯すか？」答えが No なら削除候補

## CLAUDE.md は 200 行以内を維持

200 行超になった場合、Layer 2 (`.claude/rules/*.md`) へ移管する。`paths:` frontmatter で関連ファイル時のみロードする Progressive Disclosure に従う。
