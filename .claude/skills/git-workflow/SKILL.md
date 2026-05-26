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

## PR base (target) の選び方 — 「main が release より進んでいる」問題

**バージョン番号だけで release/x.y.z を選ぶと、間の commits が PR diff に混入する事故が起きる**（過去にこの問題で docs PR にコード差分が混じった）。

feature ブランチを `main` から作って、古い `release/1.2.5` を PR base に指定すると、`main` と `release/1.2.5` の間の差分（既に main に入っているコード）も PR diff に含まれてしまう。

### base 選定アルゴリズム

```bash
# 1. main と最新 release ブランチの差を確認
git fetch origin
LATEST_RELEASE=$(git branch -r | grep 'origin/release/' | sed 's|.*origin/||' | sort -V | tail -1)
AHEAD=$(git rev-list "origin/$LATEST_RELEASE..origin/main" --count)
```

- `AHEAD == 0` → `$LATEST_RELEASE` をそのまま base に使ってよい
- `AHEAD > 0` → **新しい release ブランチを main HEAD から作成**して base にする
  - patch up が妥当（例: `release/1.2.5` → `release/1.2.6`）
  - もしくはこの PR が機能拡張を含むなら minor up（`release/1.3.0`）
- release ブランチが存在しない場合 → `release/0.1.0`（または `1.0.0`）を main HEAD から作成

### feature ブランチの派生元

可能なら **PR target と同じブランチから派生**させる:

```bash
git fetch origin
git checkout -b feature/topic origin/release/x.y.z  # PR base と同じ
```

main から派生せざるを得ない場合（複数 feature の並走時など）は、上記アルゴリズムに従って release を patch up する。

### 確認手順

PR 作成直後、必ず `mcp__github__pull_request_read` で `get_files` を呼んで、**diff に意図しないファイルが入っていないか**を確認する。docs PR なら docs 以外のファイルが出てきたら base 選定ミスのサイン。

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

## リリースブランチのライフサイクル

`main → release/x.y.z → feature/*` の運用に加えて、release ブランチ自体の
**作成・マージのタイミングで Milestone と Tag/Release を必ず操作する**。
追跡可能性を保つため省略しない。

### 1. release/x.y.z 作成時 — Milestone を作成

```bash
# 例: release/1.2.7 を main から作成した直後
gh api repos/{owner}/{repo}/milestones \
  -f title="v1.2.7" \
  -f description="release/1.2.7 に含まれる変更を集約。main マージ時に削除し v1.2.7 タグを発行する。" \
  -f state=open
```

- Milestone 名は `vX.Y.Z`（ブランチ名から `release/` を外して `v` を付ける）
- この release を base にする PR には作成時に Milestone を紐付ける
  - `mcp__github__create_pull_request` 後に `mcp__github__update_pull_request` の `milestone` で番号指定

### 2. release/x.y.z を main にマージした時

順序は **Milestone 削除 → Tag 兼 Release 作成**。

```bash
# Milestone を削除（履歴を残したい場合は state=closed への変更でも可）
gh api -X DELETE repos/{owner}/{repo}/milestones/<number>

# Tag + GitHub Release を作成（auto-generated notes でその release の PR をまとめる）
gh release create v1.2.7 \
  --target main \
  --title "v1.2.7" \
  --generate-notes
```

- Tag 名は Milestone と同じ `vX.Y.Z`
- `--target main` を必ず指定（マージ後の main HEAD を打点）
- `--generate-notes` でその tag に含まれる PR / commit を自動集約

### MCP との関係

GitHub MCP には Milestone / Release 作成専用ツールが現状ないため、`gh api` /
`gh release` を使用する。読み取り系（`list_releases`, `get_release_by_tag` 等）は
MCP を優先する。

## 機密情報

- 本番ログを引用する時は IP / トークン / 秘密鍵などをマスク
- `.env*` / credentials.json / `important/` 配下は commit に含めない

## docker-compose

- ワークスペース直下の `docker-compose.yml` はどの git リポジトリにも属さない **ローカル開発専用ファイル**
- CI/CD に影響する変更は行わず、必要な手順は README に手動手順として残す

## 例外: ユーザーが明示的に許可した場合

- force-push、`--no-verify`、main 直接 push、はユーザーが**そのセッションで明示的に許可**した時のみ実行可
- セッションを跨いだ「以前許可した」は引き継がない。都度確認する
