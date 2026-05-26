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

## PR base (target) の選び方

「リモートにある release/x.y.z のうち最新版」をバージョン番号で選ぶだけでは事故る。過去に docs PR で:

- マージ済みの release を base にして diff にコード差分が混入
- 既に main にマージ済みの release/1.2.5 (rogue commit が乗って "unmerged" 状態) を選ぶべきと早合点
- 未マージで in-flight の release/1.2.0 があるのに新規 release/1.2.1 を作成

を全部やった。判定は **2 軸（main のマージ履歴 + 未マージ release）** で行う。

### base 選定アルゴリズム

```bash
git fetch origin

# 1) 最新マージ済み release version (main の merge commit から取得)
LATEST_MERGED=$(git log origin/main --merges --pretty=format:'%s' \
  | grep -oE 'release/[0-9.]+' | head -1 | sed 's|release/||')

# 2) 最新「未マージ」release (merge-base --is-ancestor が false なものの最新)
LATEST_UNMERGED=""
for rb in $(git branch -r | grep 'origin/release/' | sed 's|.*origin/||' | sort -V -r); do
  if ! git merge-base --is-ancestor "origin/$rb" "origin/main"; then
    LATEST_UNMERGED="$rb"; break
  fi
done
```

### 判定ロジック

| 状況 | 意味 | アクション |
|------|------|------------|
| `LATEST_UNMERGED` が `LATEST_MERGED` より新しいバージョン | **意図された in-flight release**（次のリリース準備中） | これを base にする。feature は **release から派生 or rebase --onto** で同じ起点に揃える |
| `LATEST_UNMERGED` が `LATEST_MERGED` より古いバージョン | **rogue commits**（マージ済み release に誤って commit された） | 無視。`LATEST_MERGED` の次バージョンで新規 release を作成して base にする |
| `LATEST_UNMERGED` なし、`LATEST_MERGED` あり | 全 release がマージ済み | `LATEST_MERGED` の次バージョンで新規 release 作成 |
| `LATEST_UNMERGED` なし、`LATEST_MERGED` なし | 初リリース | `release/0.1.0` または `release/1.0.0` を main HEAD から作成 |

### 次バージョン採番

- **patch up** が default（例: `1.2.7` → `1.2.8`）
- 機能追加・破壊的変更を含むなら **minor up**（`1.3.0`）／ **major up**（`2.0.0`）
- 採番に迷ったら docs PR は patch up、機能 PR は意味で決める

### feature ブランチの派生元

- 新規 release を main HEAD から作る場合: feature も main 起点で OK（同じ起点なので diff = 自分の commit のみ）
- 既存 in-flight release を base にする場合: feature は **その release から派生** するか、main 起点から **`git rebase --onto origin/release/x.y.z origin/main feature/topic`** で付け替える
  - 付け替え後の push は `--force-with-lease`（ユーザーの明示的承認が必要）

### 必須の確認

PR 作成直後に `mcp__github__pull_request_read` で `get_files` を呼んで diff に意図しないファイルが入っていないか確認する。docs PR なら docs 以外のファイル、機能 PR なら関係ないモジュールが出てきたら base 選定ミスのサイン。

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
