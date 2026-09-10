# DevLearn Arena 引き継ぎ資料

このファイルと、リポジトリにある元の実装指示プロンプトを読んでから作業する。
**確認を求めず、残作業を上から順に最後まで実装すること。** 人間に問いを投げない。

## 作業の進め方

```
cd devlearn-arena
npm install          # 初回のみ
npm run verify       # typecheck + lint + test。ここを必ず緑にしてからコミット
npm run links        # 出典 URL の実在確認（ネットワークに出るので verify には入れない）
```

E2E（`npm run e2e`）は **ローカルで回さない**。
このプロジェクトの開発機ではブラウザ2つ分のメモリが確保できず、
exit 137（OOM）で落ち続けたため、CI に任せる取り決めになっている。
ローカルの検証は `npm run typecheck` / `npm run lint` / `npm run test` の3つ。

各段階で `npm run verify` を通し、落ちたら自分で直してからコミットする。
`.github/workflows/deploy.yml` は複数プロジェクト共有なので触らない。
`npm run build` に型チェックを入れない（1プロジェクトの型エラーで全体のデプロイが止まるため）。
ただし **ビルドは import の不整合を検出する**ので、分割リファクタの後は
`npm run build` まで通してからコミットすること。

## 現状

テスト 935 件（67 ファイル）。
5 トラック 58 章、演習 1777 本。どの章にも遊べる任務が入っている。

### P0 基盤
Vite + React 18 + TS(strict, noUncheckedIndexedAccess) + Tailwind + Zustand + zod。
base path は CI が `VITE_BASE=/<repo>/devlearn-arena/` を渡す。
サブフォルダ SPA の直リンク対策として、ルートの 404.html が `?p=` へ振り替え、
`src/lib/spaFallback.ts` が元の URL に戻す。

### P1 カーネル（`src/engines/kernel/`）
字句解析 → 構文解析 → 展開 → 実行。変数展開、コマンド置換、単語分割、
ブレース展開、パス名展開、パイプ（各段はサブシェル）、リダイレクト、
ヒアドキュメント、`&&`/`||`/`;`。仮想FSは平坦な Map。
コマンド 60 個以上。Tab補完、行編集、履歴、ジャーナル（全スナップショット保持）。
`vi`/`vim`/`nano` は画面側の編集パネルを開く。
権限（chmod / chown / umask / stat と、読み書き実行の判定）。
プロセス表（ps / top / free / pgrep / pkill / kill / lsof）。
容量（df / du。掴まれたまま消したファイルの分は空きに戻らない）。
実行権のあるファイルはスクリプトとして走る（$1 と $# が使える）。
grep / sed は POSIX の基本正規表現として解釈する（-E で拡張、-F で文字どおり）。
2> / &> で標準エラーを分けられる。

### P2 Git（`src/engines/git/`）
本物と同じ形式でシリアライズして SHA-1（既知ハッシュのテストあり）。
`repository.ts`（作る・読む）/ `history.ts`（作り直す）/ `diff.ts`（差分）に分けてある。
refs / HEAD / index / reflog / stash / remotes / MERGE_HEAD。status は3面差分。
3-way マージ（衝突していない行を巻き込まない）、rebase、cherry-pick、revert、reset。
`refs.ts` が rev-parse 相当（HEAD / ブランチ / タグ / `~n` / `^n`）を解く。
tag（軽量・注釈付き）、bisect、worktree、sparse-checkout、submodule（gitlink）、
hooks（`.git/hooks/pre-commit` を実際に実行）、rebase -i の todo。
これらの状態は本物と同じ置き場所（refs と `.git/` 配下のファイル）に持つ。
仮想リモートと push（非FF拒否・force-with-lease）/ fetch / pull。

### P3 Kubernetes（`src/engines/k8s/`）
素の計算機の集合から組み立てられる。kubeadm init / join / token / upgrade / reset。
ノードの Ready は保持せず状態から導く（CNI が入るまで NotReady）。
kubectl は create / label / taint / set image / set resources / set probe まで。
スケジューラ（requests と allocatable の実比較、nodeSelector、taint/toleration、cordon）。
kubelet（Pending→Running、probe 3種、CrashLoopBackOff の指数バックオフ、イベント蓄積）。
Deployment / ReplicaSet / StatefulSet / DaemonSet / Job / CronJob / HPA のコントローラ。
ConfigMap / Secret（base64 保管、env では復号）、PV / PVC / StorageClass（束ね直し）、
Ingress（最長一致）、NetworkPolicy（既定拒否）、RBAC（`auth can-i` の理由付き）。
`manifest.ts` が js-yaml で本物の YAML を読む。`-o yaml|json|name|jsonpath`、
`rollout status/history/undo/restart`、`drain`、`logs`、`exec`。

### P4 Network（`src/engines/net/`）
何も無いところから組み立てられる。netlab で機器とケーブルを用意し、
ip addr / ip link / ip route / bridge vlan / nat enable / service / hosts で設定する。
CIDR 計算（BigInt）と IPv6（展開・圧縮・プレフィックス・SLAAC）。
パケットを構造体として運び、ホップごとに TTL 減算・MAC 書換・IP 不変。
ARP（問い合わせと学習）、スイッチの MAC 学習とフラッディング、VLAN、
NAT/PAT（5つ組で対応を持つ）、MTU 超過（DF の有無で理由が変わる）。
TCP の状態遷移（3ウェイ / TIME_WAIT / 再送と指数バックオフ）、
DNS の再帰解決（委任・CNAME・TTL 付きキャッシュ）、DHCP の DORA、
TLS ハンドシェイク（期限・名前・発行者を実際に検証）、HTTP/1.1 と 2 の比較。

### P5 GitHub（`src/engines/github/`）
ワークフロー YAML を js-yaml で解析し job DAG を評価。
matrix の展開、cache の当たり外れ、artifact の受け渡し、secrets（未設定なら失敗・ログでは伏せる）、
再利用可能ワークフローの呼び出し、`if: always()` / `failure()`。
PR、レビュー、ブランチ保護、必須チェック、マージ戦略3種の履歴差。
Issue / ラベル / マイルストーン、Projects の盤面、CODEOWNERS（後の行が勝つ）、
本文の `Closes #n` でマージ時に Issue を閉じる、fork と fork からの PR、release。

### 可視化（`src/visual/`）
FileWorld（タイルの世界、部屋・通路・歩くキャラ）、CommitGraph、ClusterCanvas、
PacketFlow、PrTimeline。学習画面の右側でタブ切替。

### 学習の仕組み
演習 1777 本。書き方は2通りある。
- `src/engines/lesson/missions/` … 手で書いた任務（物語のあるもの）
- `src/engines/lesson/drills/` … 「型」と「変える値」に分けて、値違いを並べたもの

判定は状態アサーションのみ。
各手順に `check`（人が読める通過条件）と `diagnose`（惜しい点の指摘）を持つ。
通過条件は名前付きの小さな条件に分けられる（`conditions`）。
分けておくと、画面に「どこまで満たせているか」を一覧で出せる。
模範解答で実際にクリアできることを、トラックごとのテストで担保している。
目次（`src/content`）の `status: 'ready'` は「その id の任務があるか」から刻む。
手で印を付けないので実装とずれない。
つまずいたときの助けが3つ入っている。
- 通過条件の内訳を一覧で見せる（正しそうなのに通らないとき、何が足りないかが分かる）
- 直前のコマンドが失敗していたら、判定の話より先にその出力を見せる
- 同じ手順で3回つまずくとヒントを1つ開き、以後2回ごとに増やす。
  出し切ってもなお通らなければ、その手順の答えを見せる

XP・ランク・実績バッジ・連続日数・クリア演出・効果音・間隔反復・進捗の保存。
`/sandbox` は任務の判定なしに全エンジンを触れる場所。

## 残作業

1. **Lighthouse の実測**
   静的にできる手当ては入れてある（配色の対比、焦点の縁取り、live region、
   `prefers-reduced-motion`、`lang`/`color-scheme`、チャンク分割で初回 JS を軽くする）。
   **実測はしていない。** CI かローカルで Lighthouse を回し、90 未満の項目を直すこと。

2. **E2E の確認**
   `e2e/smoke.spec.ts` は初回案内・訓練場・実績・目次からの導線まで書いてあるが、
   **通ることを確認したのは CI 側だけ**（上記のとおりローカルでは回せない）。
   CI で落ちていたら直すこと。

3. **目次の残り**
   目次に元から書いてあるレッスン 210 本のうち、まだ演習が無いものがある
   （`status: 'planned'` のもの）。埋めていくときは
   `src/engines/lesson/drills/` に型を1つ足し、値の表を用意する。
   `drills/solvable.test.ts` が全ての演習について
   「模範解答で解ける」「答えが用意されている」「条件がどこかで満たされる」
   を自動で確かめるので、テストを個別に書き足す必要はない。

4. **演習の型をさらに増やす**
   いまは章あたり 4〜6 の型。まだ扱えていない題材
   （StatefulSet / PV / Ingress / NetworkPolicy / RBAC / HPA、
   TCP の状態遷移 / DNS / DHCP / TLS、rebase / bisect / submodule、
   matrix / cache / artifact / 再利用可能ワークフロー）は
   エンジン側が既に対応しているので、型を書けばそのまま増やせる。

## 守ること

- **出力をハードコードしない。** 状態機械を実装し、状態から出力を導出する
- エンジン層は React 非依存・決定論。`Date` と `Math.random` は ESLint で禁止済み。
  時刻は `SimClock`、乱数は seeded RNG
- エラーメッセージは本物に寄せる（文言・終了コード）
- 1ファイル 400 行を超えたら分割。`any` 禁止。未使用の依存追加禁止
- 画面の文言は直書きせず `src/i18n` の辞書に置く。ja と en の両方を埋める
  （抜け・余分・差し込みの不一致は `i18n.test.ts` が落とす）
- テストを必ず書く。エンジンは本物との一致を検証する
- 任務は「解けること」をテストで担保する
- 失敗を罰にしない。HP や撤退は入れない
- UI は木枠・クリーム・金看板の外装。暗いターミナル配色に戻さない
- 学習画面は左＝ターミナル、右＝可視化。仕切りはドラッグで動く
- 可視化は斜め45度にしない
