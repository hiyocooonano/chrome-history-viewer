---
name: git-workflow
description: Use whenever the user mentions branches, commits, PRs, releases, or asks to "push", "merge", or "open a PR". Enforces the hiyocooonano_project workflow — main → release/x.y.z → feature/*, PR review via pr-review-toolkit, GitHub MCP for all GitHub operations, and explicit prohibitions on force-push and main direct push.
---

# Git Workflow

このリポジトリは `hiyocooonano_project` ワークスペースの一員。ブランチ運用と PR 手順はワークスペース全体で統一されている。

## ブランチ階層

```
main ← release/x.y.z ← feature/<topic>
                    ← fix/<topic>
```

- `main`: 本番反映済みの安定ブランチ
- `release/x.y.z`: リリース候補。複数 feature がマージされる
- `feature/<topic>` / `fix/<topic>`: 個別作業ブランチ

## マスタールール

1. **main への直接 push は禁止**。必ず release → main の PR を経由
2. **PR の base は `release/*`**（main 直接の PR は不可）
3. **force-push は明示的に許可されない限り行わない**。feature ブランチでも、他者がチェックアウト中の可能性があるためデフォルト禁止
4. **`--no-verify` / `--no-gpg-sign` は使わない**。pre-commit hook を skip しない
5. **commit はユーザーが「commit して」と言ったときのみ作成**。勝手に commit しない

## 着手前

- 関連する変更は同一ブランチ・PR にまとめる（不必要に分割しない）
- 同一ブランチに**前作業からの未コミット差分**が残っていることがある。自分が触っていないファイルが diff に混じっていたら、PR には含めず別 PR を提案する
- 「何をやったか」を聞かれた時はローカル `git diff` ではなく、**セッション内の作業記録**に基づいて回答する（前作業の残骸と本作業を混同しないため）

## コミット

- ユーザーが明示的に依頼した時のみ
- メッセージ末尾に `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` を含める
- HEREDOC で渡してフォーマットを保つ
- 1 つのコミットには 1 つの論理変更だけ（混入差分は別コミット）

## PR 作成手順

**PR 作成前に必ず実施**:

1. **`pr-review-toolkit:code-reviewer` agent でレビュー実施**
   - Important 以上の指摘は対応
   - 「変更スコープ外」を理由に判断保留する場合は PR 説明に明記
2. **UT を必ず作成**。テストスキップでビルドが通っただけでは完了扱いにしない
3. **UI 変更がある場合は `npm run dev` でブラウザ確認**まで実施

**PR 操作は GitHub MCP ツール (`mcp__github__*`) を使う**。`gh pr ...` の CLI は使わない。

- `mcp__github__create_branch` で release ブランチ作成
- `mcp__github__create_pull_request` で PR 作成
- `mcp__github__pull_request_read` でステータス確認

## PR 本文テンプレート

```markdown
## Summary
- 何を / なぜ
- 影響範囲（どのサービス/レイヤー）

## 関連
- 仕様: vault: `<obsidian path>` / Linear: <ticket>
- 関連PR: BE/BFF/FE

## Test plan
- [ ] ./gradlew build / npm test
- [ ] 手動確認（必要なら）
- [ ] DB マイグレーション適用確認（マイグレ追加時）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## マージ後の取扱い

- PR 番号 `#N` がマージされた後の **同じ feature ブランチを使い回さない**。新規ブランチを切る
- ただし release ブランチは複数 PR を受け入れる前提なので、release/x.y.z は使い回し可
- マージ済みの V*.sql マイグレーションは**書き換えない**。次の V*.sql を追加して evolve する

## 機密情報

- 本番ログを引用する時は IP / トークン / 秘密鍵などをマスク
- `.env*` / credentials.json / `important/` 配下は commit に含めない

## docker-compose

- ワークスペース直下の `docker-compose.yml` はどの git リポジトリにも属さない **ローカル開発専用ファイル**
- CI/CD に影響する変更は行わず、必要な手順は README に手動手順として残す

## 例外: ユーザーが明示的に許可した場合

- force-push、`--no-verify`、main 直接 push、はユーザーが**そのセッションで明示的に許可**した時のみ実行可
- セッションを跨いだ「以前許可した」は引き継がない。都度確認する
