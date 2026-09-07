# DevLearn Arena 引き継ぎ資料

このファイルと、リポジトリにある元の実装指示プロンプトを読んでから作業する。
**確認を求めず、残作業を上から順に最後まで実装すること。** 人間に問いを投げない。

## 作業の進め方

```
cd devlearn-arena
npm install          # 初回のみ
npm run verify       # typecheck + lint + test。ここを必ず緑にしてからコミット
npm run e2e          # 主要導線の確認
```

各段階で `npm run verify` を通し、落ちたら自分で直してからコミットする。
`.github/workflows/deploy.yml` は複数プロジェクト共有なので触らない。
`npm run build` に型チェックを入れない（1プロジェクトの型エラーで全体のデプロイが止まるため）。

## 完了済み

### P0 基盤
Vite + React 18 + TS(strict, noUncheckedIndexedAccess) + Tailwind + Zustand + zod。
base path は CI が `VITE_BASE=/<repo>/devlearn-arena/` を渡す。
サブフォルダ SPA の直リンク対策として、ルートの 404.html が `?p=` へ振り替え、
`src/lib/spaFallback.ts` が元の URL に戻す。

### P1 カーネル（`src/engines/kernel/`）
字句解析 → 構文解析 → 展開 → 実行。変数展開、コマンド置換、単語分割、
ブレース展開、パス名展開、パイプ（各段はサブシェル）、リダイレクト、
ヒアドキュメント、`&&`/`||`/`;`。仮想FSは平坦な Map。
コマンド 45 個以上。Tab補完、行編集、履歴、ジャーナル（全スナップショット保持）。
`vi`/`vim`/`nano` は画面側の編集パネルを開く。

### P2 Git（`src/engines/git/`）
本物と同じ形式でシリアライズして SHA-1（既知ハッシュのテストあり）。
refs/HEAD/index/reflog/stash/remotes。status は3面差分。
3-way マージとコンフリクトマーカ。rebase / cherry-pick / revert / reset / diff。
仮想リモート（別インスタンス）と push（非FF拒否・force-with-lease）/ fetch / pull。
`git` サブコマンド 24 個。

### P3 Kubernetes（`src/engines/k8s/`）
スケジューラ（requests と allocatable の実比較、nodeSelector、taint/toleration、cordon）。
kubelet（Pending→Running、指数バックオフ、イベント蓄積）。
コントローラの reconcile ループ（Deployment→ReplicaSet→Pod、ローリングアップデート、
Service の Endpoints は Ready な Pod のみ）。`kubectl` 12 サブコマンド。

### P4 Network（`src/engines/net/`）
CIDR 計算（BigInt）。パケットを構造体として運び、ホップごとに TTL 減算・MAC 書換・IP 不変。
最長プレフィックス一致。ケーブル断/経路なし/FW拒否/待受なしを区別。
`ping` `traceroute` `curl -v` `dig` `ip` `ipcalc` `netstat`。

### P5 GitHub（`src/engines/github/`）
ワークフロー YAML を実際にパースし job DAG を評価（needs / if: always() / 失敗の下流は skipped）。
PR、レビュー、ブランチ保護、必須チェック、マージ戦略3種の履歴差。`gh` コマンド。

### 可視化（`src/visual/`）
FileWorld（タイルの世界、部屋・通路・歩くキャラ）、CommitGraph、ClusterCanvas、
PacketFlow、PrTimeline。学習画面の右側でタブ切替。

### 学習の仕組み
任務 10 本（`src/engines/lesson/missions.ts`）。判定は状態アサーションのみ。
各手順に `check`（人が読める通過条件）と `diagnose`（惜しい点の指摘）を持つ。
模範解答と別解で実際にクリアできることをテストしている（`missions.test.ts`）。
XP・ランク・クリア演出・効果音・間隔反復（`src/lib/review.ts`）・進捗の保存。

## 残作業（この順に進める）

1. **クラスタとネットワークの保存**
   `src/engines/kernel/session.ts` の `snapshotShell` / `restoreShell` で
   `cluster` と `net` と `repo` が null 固定になっている。Git と同じ要領で直列化し、
   `src/lib/storage/schema.ts` に zod スキーマを足す。リロードで失われないようにする。

2. **カリキュラム本文の実装**
   `src/content/tracks/*.ts` に 210 レッスンの目次があるが、全て `status: 'planned'`。
   任務として実装したものは `status: 'ready'` に変え、`src/engines/lesson/missions.ts` に
   対応する任務を足す。1章あたり最低1本を目安に増やす。
   出典 URL は各レッスンに紐付いているが**リンク切れの検証をしていない**。
   実在を確認し、切れているものを直すこと。

3. **P2 の残り**: `bisect` `tag` `worktree` `submodule` `sparse-checkout` `hooks`、
   interactive rebase の todo list。

4. **P3 の残り**: StatefulSet / DaemonSet / Job / CronJob、ConfigMap / Secret、
   PV / PVC / StorageClass、Ingress、NetworkPolicy、RBAC（`kubectl auth can-i`）、
   HPA、probe（liveness/readiness/startup）と CrashLoopBackOff、
   `kubectl apply -f` と YAML（js-yaml を入れて `manifest.ts` に繋ぐ）、
   `-o yaml|json|jsonpath`、`rollout status/history/undo`、`drain`。

5. **P4 の残り**: ARP、スイッチの MAC 学習、VLAN、NAT/PAT、
   TCP の状態遷移（3ウェイ、TIME_WAIT、再送）、DNS の再帰解決、DHCP、
   TLS ハンドシェイク、HTTP/1.1 と HTTP/2 の比較、MTU 不一致。

6. **P5 の残り**: Issue / Projects、CODEOWNERS、matrix、キャッシュ、artifact、
   secrets、再利用可能ワークフロー、Fork & PR フロー。

7. **P6**: 実績バッジ、ストリーク表示、サンドボックス（任務外で自由に触るモード）、
   i18n の `en` を埋める、a11y（コントラスト、フォーカス、aria-live）、
   Lighthouse 90+、初回オンボーディング。

## 守ること

- **出力をハードコードしない。** 状態機械を実装し、状態から出力を導出する
- エンジン層は React 非依存・決定論。`Date` と `Math.random` は ESLint で禁止済み。
  時刻は `SimClock`、乱数は seeded RNG
- エラーメッセージは本物に寄せる（文言・終了コード）
- 1ファイル 400 行を超えたら分割。`any` 禁止。未使用の依存追加禁止
- テストを必ず書く。エンジンは本物との一致を検証する
- 任務は「解けること」をテストで担保する（`missions.test.ts` の play ヘルパを使う）
- 失敗を罰にしない。HP や撤退は入れない
- UI は木枠・クリーム・金看板の外装。暗いターミナル配色に戻さない
- 学習画面は左＝ターミナル、右＝可視化。仕切りはドラッグで動く
- 可視化は斜め45度にしない
