# カリキュラム

教え方は `docs/learning-design.md`、データ形式は `docs/content-spec.md`、各レッスンの中身（解説 → 理解確認 → クイズ → 実戦 → 結果 → まとめ）の設計は `docs/lessons/`。
この文書は**何を・どの順に・どのつながりで教えるか**を決める。

- レッスン ID: `<分野>.<難易度>.<番号>`。難易度は `b`（初級）・`i`（中級）・`a`（上級）
- 各レッスンは `docs/learning-design.md` の 7 段（解説 → 理解 → クイズ → 実戦 → 結果 → まとめ → XP）を持つ
- 表の「実戦」の記号: **端**=仮想端末 / **模**=模擬環境 / **S**=ブラウザ内 SQL / **編**=設定の編集
- 「推奨前提」は**推奨**であり、ロックではない
- 「次に学ぶとよい」は、そのレッスンを推奨前提にしているレッスン（無ければ同じ分野の次のレッスン）
- 「関連」は、他の分野で同じ題材（権限・ログ・ポート・TLS・障害対応など）を扱うレッスン
- **推奨学習順**は 2 章の分野の順と、各表の行の順（上から）で決まる

---

## 1. 分野の一覧

| ID | 分野 | 対応する施設（`docs/city-design.md`） | 何ができるようになるか |
|---|---|---|---|
| `found` | IT 基礎 | 市立 IT 学院 | コンピュータ・OS・プロセス・メモリ・ファイル・権限を説明できる |
| `linux` | Linux / CLI | サーバ施設 | 端末でサーバを操作し、サービス・ログ・パッケージ・権限を扱える |
| `net` | ネットワーク | ネットワークセンター | IP・TCP/UDP・ポート・DNS・ルーティング・NAT・Firewall を扱い、切り分けられる |
| `web` | Web / HTTP | Web 施設 | HTTP を読み、Web サーバを設定し、API を扱える |
| `sec` | TLS / セキュリティ | セキュリティセンター | 認証と認可・秘密情報・TLS と証明書・脆弱性対応を扱える |
| `git` | Git | 開発オフィス | 変更を記録・分岐・統合し、リモートとチームで使える |
| `cicd` | CI/CD | デプロイセンター | パイプラインを読み書きし、失敗を直し、安全に配布できる |
| `ctr` | コンテナ | コンテナ施設 | コンテナの概念（VM との違い・イメージ・レイヤ・ランタイム）を説明できる |
| `docker` | Docker | コンテナ施設（Docker 工房） | Docker で作り・動かし・つなぎ・配れる |
| `k8s` | Kubernetes | クラスタ施設 | クラスタでアプリを動かし、公開し、更新し、障害を直せる |
| `db` | データベース | データセンター | SQL を書き、設計・索引・トランザクション・バックアップを扱える |
| `cloud` | クラウド / インフラ | クラウドセンター | 仮想化とクラウドの形を理解し、可用性とスケールを設計できる |
| `mon` | 監視 | 監視・運用センター | ログ・メトリクス・トレース・アラートで状態を把握し調査できる |
| `devops` | DevOps | DevOps 推進本部 | 自動化・IaC・改善のループで開発と運用をつなげられる |
| `trouble` | トラブルシューティング | インシデント対応本部 | 症状から原因を絞り、直し、再発を防げる |
| `lab` | 研究（総合演習） | 研究施設 | 複数の分野を組み合わせて、実務に近い課題をやり遂げられる |

---

## 2. 推奨学習順

```text
 1 IT 基礎（初級）
 2 Linux / CLI（初級）
 3 ネットワーク（初級）            ─┐
 4 Web / HTTP（初級）＋ HTTPS と TLS の入口（sec 初級の一部）
 5 Git（初級）
 6 トラブルシューティング（初級）   ← 1〜5 で覚えた道具で切り分けの型を学ぶ
 7 Linux（中級）・Web サーバ（web 中級）
 8 セキュリティ基礎（sec 初級の残り：認証と認可・秘密情報）
 9 データベース（初級）
10 CI/CD（初級〜中級）
11 コンテナ（初級〜中級）
12 Docker（初級〜中級）
13 Kubernetes（初級〜中級）
14 トラブルシューティング（中級）・研究（総合演習 1〜2）
15 監視 / ログ（初級〜中級）
16 セキュリティ（中級〜上級：脆弱性・運用のセキュリティ）
17 クラウド / インフラ
18 DevOps
19 各分野の上級・トラブルシューティング（上級）・研究（総合演習 3〜5）
```

**この順にした理由**

- Linux の前に IT 基礎: ファイル・プロセス・権限を「何か」から知ってから操作に進む
- ネットワークを Web の前に: HTTP はネットワークの上で動くため、IP・ポート・DNS を先に知ると HTTP が読める
- HTTPS と TLS は Web の初級で一緒に: 利用者が毎日見る鍵の印を、HTTP を学んだ直後に説明すると実感を伴う
- Git を CI/CD の前に: CI/CD は Git の変更をきっかけに動く
- **セキュリティ基礎を CI/CD の前に**（最重要指示の例より前に置いた。`docs/decisions.md` D-04）: CI/CD では秘密情報を扱う。秘密情報をコミットしない・認証と認可の違い、を知らずにパイプラインを書くと事故になるため
- コンテナの概念 → Docker → Kubernetes: Docker だけをコンテナ技術として扱わないため、概念を先に置く。Kubernetes はコンテナを束ねる仕組みなので最後
- トラブルシューティングを 3 回に分けて差し込む: 独立したスキルとして、道具が増えるたびに切り分けの型を積み上げる
- 監視は Kubernetes の後: 分散した仕組みを見る必要が生まれてから学ぶと動機が強い
- 脆弱性と運用のセキュリティは監視の後: 検知と対応の流れを知ってからの方が理解しやすい
- DevOps は最後: 開発と運用の道具（Git・CI/CD・コンテナ・監視）を一通り知ってから、つなぐ考え方を学ぶ

**学習可能 ≠ 理解しやすい順序。** どのレッスンも、この順を無視して始められる。

---

## 3. 知識グラフ

### 3.1 分野どうしの関係

```text
                    ┌──────── web ────────┐
                    │          │          │
found ── linux ── net ──── sec(TLS)     db
  │        │  └──────────┐    │          │
  │        ├── git ── cicd ── devops ── mon
  │        │           │       │         │
  │        └── ctr ── docker ── k8s ─────┘
  │                               │
  └──────────────── cloud ────────┘
trouble は全分野と関連（各分野の中級以上が trouble の前提）
lab は複数分野の組み合わせ
```

### 3.2 辺（推奨前提 と 関連）

分野の推奨前提（→ は「先に学ぶと分かりやすい」）:

| 分野 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|
| found | — | linux, net | linux |
| linux | found | net, git, ctr | net |
| net | found | linux, web, cloud | web |
| web | net | sec, db, cicd | git, sec |
| sec | web（TLS）、found（権限） | linux, cicd, mon | cicd（基礎の後）、mon（中級の後） |
| git | linux（初級） | cicd, devops | cicd |
| cicd | git, sec（秘密情報） | devops, docker | ctr |
| ctr | linux（中級）, found（プロセスと仮想化） | docker, k8s, cloud | docker |
| docker | ctr | k8s, cicd | k8s |
| k8s | ctr, docker, net | cloud, mon, devops | mon |
| db | web（初級） | cloud, trouble | cicd |
| cloud | net, ctr | k8s, devops | devops |
| mon | linux, k8s | trouble, devops | sec（中級以上） |
| devops | cicd, mon | cloud, k8s | lab |
| trouble | 各分野の該当レベル | 全分野 | lab |
| lab | 該当する複数分野 | — | — |

レッスンどうしの推奨前提は、下の各分野の表の「推奨前提」列に書く。
**テストで、推奨前提の辺に循環が無いこと**を確かめる（`docs/testing-strategy.md`）。

---

## 4. 分野ごとのレッスン

### 4.1 IT 基礎（found）— 市立 IT 学院

テーマ: コンピュータの仕組み / OS / プロセスとメモリ / ファイルと権限 / データの表し方 / 仮想化の入口

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| found.b.01 | 初級 | 仕組み | コンピュータは何をしているか | 入力・処理・出力・記憶の 4 つで説明できる | 模 | — | found.b.07, net.b.01 | found.b.02, found.b.07, found.b.08 |
| found.b.02 | 初級 | 仕組み | CPU・メモリ・ストレージ | 速さと容量の違いと役割分担を説明できる | 模 | found.b.01 | found.i.01, linux.a.02 | found.b.03, found.i.01 |
| found.b.03 | 初級 | OS | OS の役割 | 資源の割り振り・ファイル・利用者の管理を説明できる | 模 | found.b.02 | linux.b.00, cloud.b.01 | found.b.04, found.b.05, found.i.03 |
| found.b.04 | 初級 | ファイル | ファイルとディレクトリ | 木の構造・パス・現在地を説明し、初めて pwd/ls/cd を打てる | 端 | found.b.03 | linux.b.02, git.b.01 | found.b.06, linux.b.01, db.b.01 |
| found.b.05 | 初級 | プロセス | プロセスとは | プログラムとプロセスの違い、PID を説明できる | 端 | found.b.03 | linux.b.08, ctr.i.02 | found.i.01, found.i.02, linux.b.08 |
| found.b.06 | 初級 | 権限 | 利用者と権限 | 読み・書き・実行と、所有者・グループ・その他を説明できる | 端 | found.b.04 | linux.b.06, sec.i.04 | linux.b.06, sec.b.01 |
| found.b.07 | 初級 | 通信 | ネットワークとインターネットの全体像 | 端末・ネットワーク・サーバのつながりを説明できる | 模 | found.b.01 | net.b.01, web.b.01 | net.b.01 |
| found.b.08 | 初級 | データ | 2 進数・文字コード・データ量 | ビットとバイト、文字化けの理由を説明できる | 模 | found.b.01 | db.b.02, web.i.02 | found.i.01 |
| found.i.01 | 中級 | メモリ | メモリ不足とスワップ | メモリが足りないと何が起きるかを予測できる | 模 | found.b.02, found.b.05 | linux.a.02, k8s.i.07 | found.i.02 |
| found.i.02 | 中級 | プロセス | プロセス・スレッド・並行 | 同時に動かす仕組みと取り合いを説明できる | 模 | found.b.05 | linux.b.08, db.i.04 | found.a.01 |
| found.i.03 | 中級 | 仮想化 | 仮想化の考え方 | 1 台を複数に見せる仕組みを説明できる | 模 | found.b.03 | cloud.b.01, ctr.b.02 | ctr.b.02, cloud.b.01 |
| found.a.01 | 上級 | OS | カーネルとシステムコール | アプリと OS の境界を説明できる | 端 | found.i.02 | ctr.i.02, linux.a.02 | ctr.i.02 |

### 4.2 Linux / CLI（linux）— サーバ施設

テーマ: Linux 基礎 / シェルと CLI / ファイル操作 / テキスト処理 / 権限とユーザー / プロセス / サービスと systemd / ログ / パッケージ / ネットワーク設定 / ディスク / 自動化 / トラブルシューティング

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| linux.b.00 | 初級 | Linux 基礎 | Linux とは | OS としての Linux・カーネルとディストリビューション・サーバで使われる理由を説明できる | 模 | found.b.03 | found.b.03, ctr.b.02 | linux.b.01 |
| linux.b.01 | 初級 | CLI | 端末とシェル | CLI とは何かを説明し、プロンプト・コマンド・引数・オプションを読める | 端 | linux.b.00, found.b.04 | found.b.04, git.b.02 | linux.b.02, linux.b.03 |
| linux.b.02 | 初級 | ファイル操作 | 作る・写す・移す・消す | mkdir/cp/mv/rm を安全に使える | 端 | linux.b.01 | found.b.04, git.b.02 | web.b.07, git.b.01 |
| linux.b.03 | 初級 | テキスト | 中身を見る | cat/less/head/tail を使い分けられる | 端 | linux.b.01 | trouble.b.03, mon.b.02 | linux.b.04 |
| linux.b.04 | 初級 | テキスト | 探す | grep と find で目的の行とファイルを見つけられる | 端 | linux.b.03 | trouble.b.03, mon.b.02 | linux.b.05, trouble.b.01 |
| linux.b.05 | 初級 | テキスト | パイプとリダイレクト | コマンドをつなぎ、結果をファイルに残せる | 端 | linux.b.04 | cicd.b.02, web.i.02 | linux.i.05, linux.i.06 |
| linux.b.06 | 初級 | 権限 | 権限を読む・変える | ls -l を読み、chmod/chown で直せる | 端 | found.b.06 | found.b.06, sec.i.04 | linux.b.07 |
| linux.b.07 | 初級 | ユーザー | ユーザー・グループ・sudo | 管理者権限の意味と危険を説明できる | 端 | linux.b.06 | sec.b.02, sec.i.04 | linux.i.03, sec.i.04 |
| linux.b.08 | 初級 | プロセス | プロセスを見る・止める | ps/top/kill を使える | 端 | found.b.05 | found.b.05, docker.b.05 | linux.i.01, ctr.b.01 |
| linux.i.01 | 中級 | サービス | サービスと systemd | systemctl で起動・停止・有効化・状態確認ができる | 端 | linux.b.08 | docker.b.03, k8s.i.05 | linux.i.02, linux.a.04, trouble.i.01 |
| linux.i.02 | 中級 | ログ | ログを読む | journalctl と /var/log から手掛かりを探せる | 端 | linux.i.01 | mon.b.02, trouble.b.03 | linux.a.01, mon.b.01 |
| linux.i.03 | 中級 | パッケージ | パッケージ管理 | apt で入れる・更新する・消すができる | 端 | linux.b.07 | sec.a.01, docker.i.01 | sec.a.01 |
| linux.i.04 | 中級 | ネットワーク設定 | IP とポートを確かめる | ip/ss で自分のアドレスと待ち受けを確かめられる | 端 | net.b.04 | net.b.04, docker.b.04 | linux.i.05 |
| linux.i.05 | 中級 | ディスク | 容量を調べる | df/du で使用量を調べ、原因の場所を特定できる | 端 | linux.b.05 | trouble.i.01, db.a.02 | linux.a.02, linux.a.03, trouble.i.01 |
| linux.i.06 | 中級 | 環境 | 環境変数とシェル設定 | PATH と環境変数を理解し設定できる | 端 | linux.b.05 | k8s.i.01, cicd.i.03 | linux.i.07 |
| linux.i.07 | 中級 | 自動化 | シェルスクリプト入門 | 変数・条件・繰り返しで小さな自動化を書ける | 端 | linux.i.06 | devops.b.02, cicd.i.02 | linux.i.08, devops.b.02 |
| linux.i.08 | 中級 | 自動化 | 定期実行 | cron と systemd タイマーで定期処理を設定できる | 端 | linux.i.07 | devops.b.02, mon.b.04 | linux.a.01 |
| linux.a.01 | 上級 | 障害 | 起動しないサービスを直す | 状態・ログ・設定から原因を特定し直せる | 端 | linux.i.02 | trouble.i.01, docker.a.02 | linux.a.02 |
| linux.a.02 | 上級 | 性能 | 遅いサーバを調べる | CPU・メモリ・ディスク・待ちの偏りを見分けられる | 端 | linux.i.05 | mon.b.03, db.i.03 | linux.a.03 |
| linux.a.03 | 上級 | ファイルシステム | マウントとファイルシステム | 領域を追加し、マウントし、再起動後も保てる | 端 | linux.i.05 | ctr.i.04, k8s.i.03 | linux.a.04 |
| linux.a.04 | 上級 | 安全 | サーバを堅くする | SSH 鍵・最小権限・不要なサービスの停止ができる | 端 | sec.b.04, linux.i.01 | sec.i.04, sec.b.04 | — |

### 4.3 ネットワーク（net）— ネットワークセンター

テーマ: 全体像 / 層（OSI と TCP/IP） / IP / TCP と UDP / ポート / DNS / DHCP / ルーティング / NAT / Firewall / 切り分け

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| net.b.01 | 初級 | 全体像 | ネットワークとは（LAN と WAN） | 家庭・会社・インターネットのつながりを描ける | 模 | found.b.07 | found.b.07, cloud.b.03 | net.b.02 |
| net.b.02 | 初級 | 層 | OSI と TCP/IP の層 | 各層の役割と、どの層の話かを判断できる | 模 | net.b.01 | web.b.02, trouble.b.01 | net.b.03 |
| net.b.03 | 初級 | IP | IP アドレスとサブネット | アドレスとネットワーク部を読み、同じ網かを判断できる | 模 | net.b.02 | cloud.b.03, linux.i.04 | net.b.04, net.b.06, net.b.07 |
| net.b.04 | 初級 | ポート | ポート | 1 台の中で通信を届け分ける仕組みを説明できる | 模 | net.b.03 | linux.i.04, docker.b.04 | net.b.05, net.i.03, web.b.02 |
| net.b.05 | 初級 | TCP/UDP | TCP と UDP | 確実さと速さの違い、使い分けを判断できる | 模 | net.b.04 | web.i.06, mon.i.01 | net.i.04, web.i.06 |
| net.b.06 | 初級 | DNS | 名前解決 | 名前から IP を引く流れを説明し、dig で確かめられる | 端 | net.b.03 | web.b.01, trouble.i.02 | net.i.05, web.b.01 |
| net.b.07 | 初級 | 確認 | ping と traceroute | 到達と経路を確かめられる | 端 | net.b.03 | trouble.i.02, linux.i.04 | net.i.01 |
| net.b.08 | 初級 | DHCP | DHCP | アドレスが自動で配られる流れを説明できる | 模 | net.b.03 | net.b.03, cloud.b.03 | net.i.01 |
| net.i.01 | 中級 | ルーティング | 経路とデフォルトゲートウェイ | 経路表を読み、足りない経路を足せる | 模 | net.b.07 | cloud.b.03, trouble.i.02 | net.i.02, net.i.06 |
| net.i.02 | 中級 | NAT | NAT | 内側と外側のアドレス変換を説明し、設定の誤りを見つけられる | 模 | net.i.01 | cloud.b.03, docker.b.04 | net.i.03 |
| net.i.03 | 中級 | Firewall | ファイアウォール | 許可と拒否の規則を読み書きできる | 模 | net.b.04 | sec.i.04, k8s.b.06 | net.a.01, net.a.03, trouble.i.02 |
| net.i.04 | 中級 | TCP | 接続の確立と状態 | 3 ウェイハンドシェイクと ss の状態を読める | 端 | net.b.05 | trouble.i.02, web.b.02 | net.a.02 |
| net.i.05 | 中級 | DNS | DNS レコード | A/AAAA/CNAME/MX/TXT を使い分けられる | 模 | net.b.06 | web.b.01, sec.b.07 | net.i.06 |
| net.i.06 | 中級 | 設計 | ネットワークを分ける | セグメント分割と VLAN の考え方を説明できる | 模 | net.i.01 | cloud.i.01, k8s.b.07 | net.a.01 |
| net.a.01 | 上級 | 切り分け | 繋がらない原因を層ごとに探す | 物理〜アプリの順に切り分けられる | 模 | net.i.03, trouble.b.01 | trouble.i.02, mon.i.03 | net.a.02 |
| net.a.02 | 上級 | 経路 | MTU と断片化 | 大きな通信だけ失敗する理由を説明できる | 模 | net.i.04 | trouble.a.02, web.a.01 | net.a.03 |
| net.a.03 | 上級 | 負荷分散 | ロードバランサ | 振り分け方式と健全性確認を設計できる | 模 | net.i.03 | k8s.b.06, cloud.i.02 | net.a.04 |
| net.a.04 | 上級 | IPv6 | IPv6 の基本 | アドレスの読み方と IPv4 との違いを説明できる | 模 | net.b.03 | net.b.03, cloud.b.03 | — |

### 4.4 Web / HTTP（web）— Web 施設

テーマ: URL / HTTP / HTTPS / メソッド / ステータスコード / ヘッダ / Cookie とセッション / REST と API / Web サーバ / 性能と障害

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| web.b.01 | 初級 | URL | URL の組み立て | スキーム・ホスト・ポート・パス・クエリを読める | 模 | net.b.06 | net.b.06, web.i.01 | web.b.02 |
| web.b.02 | 初級 | HTTP | リクエストとレスポンス | HTTP のやり取りを読み、curl で確かめられる | 端 | web.b.01, net.b.04 | net.b.04, linux.b.03 | web.b.03, web.b.04, web.b.05 |
| web.b.03 | 初級 | メソッド | HTTP メソッド | GET/POST/PUT/DELETE を使い分けられる | 端 | web.b.02 | web.i.01, db.b.05 | web.i.01 |
| web.b.04 | 初級 | ステータス | ステータスコード | 2xx〜5xx の意味から次の行動を判断できる | 端 | web.b.02 | trouble.i.03, mon.b.03 | web.b.05 |
| web.b.05 | 初級 | ヘッダ | HTTP ヘッダ | Content-Type・Cache-Control・Location などを読める | 端 | web.b.02 | web.i.04, sec.b.06 | web.b.06, web.i.04 |
| web.b.06 | 初級 | 状態 | Cookie とセッション | ログイン状態が保たれる仕組みを説明できる | 模 | web.b.05 | sec.b.02, sec.b.03 | web.b.07 |
| web.b.07 | 初級 | Web サーバ | Web サーバの役割 | 静的なファイルを配る流れを説明し、模擬サーバで公開できる | 端 | web.b.02, linux.b.02 | linux.i.01, docker.b.04 | web.i.03 |
| web.b.08 | 初級 | HTTPS | HTTPS（HTTP を安全にする） | http と https の違い・443 番・http から https への転送・混在コンテンツを説明し確かめられる | 端 | web.b.02, sec.b.06 | sec.b.07, net.b.04 | web.i.01 |
| web.i.01 | 中級 | API | REST と API | 資源と操作で API を設計・利用できる | 端 | web.b.03 | db.b.03, cicd.b.01 | web.i.02, web.i.05, web.a.03 |
| web.i.02 | 中級 | データ | JSON | JSON を読み書きし、API の応答から値を取り出せる | 端 | web.i.01 | db.i.05, linux.b.05 | web.i.03 |
| web.i.03 | 中級 | Web サーバ | 仮想ホストとリバースプロキシ | 1 台で複数サイト、後段への転送を設定できる | 編 | web.b.07 | k8s.i.04, net.a.03 | web.a.02, sec.i.02, k8s.i.04 |
| web.i.04 | 中級 | 性能 | キャッシュ | どこで何が保存されるかを説明し、設定できる | 模 | web.b.05 | net.a.03, db.i.03 | web.a.01 |
| web.i.05 | 中級 | 安全 | CORS | ブラウザが他のサイトへの通信を止める理由と許可の仕方 | 模 | web.i.01 | sec.b.02, web.i.01 | web.i.06 |
| web.i.06 | 中級 | 版 | HTTP/2 と HTTP/3 | 違いと利点を説明できる | 端 | web.b.02, net.b.05 | net.b.05, sec.b.06 | web.a.01 |
| web.a.01 | 上級 | 性能 | 遅い Web を調べる | 遅延の内訳（DNS・接続・TLS・処理・転送）を切り分けられる | 模 | web.i.04, sec.b.06 | mon.i.01, net.a.02 | web.a.02 |
| web.a.02 | 上級 | 障害 | 4xx と 5xx を直す | 症状から Web サーバ・アプリ・後段のどこかを特定できる | 端 | web.i.03, trouble.b.03 | trouble.i.03, mon.i.03 | web.a.03 |
| web.a.03 | 上級 | API | 認証付き API | トークンを使った API 呼び出しと失敗時の扱い | 端 | web.i.01, sec.b.02 | sec.b.02, sec.i.05 | — |

### 4.5 TLS / セキュリティ（sec）— セキュリティセンター

**2 段に分けて学ぶ**（`docs/decisions.md` D-04）: 初級は Web の直後〜CI/CD の前、中級・上級は監視の後。

テーマ: セキュリティの基本 / 認証と認可 / 秘密情報 / 暗号（公開鍵と秘密鍵）/ TLS と証明書（中間・ルート）/ 脆弱性 / 最小権限 / 運用のセキュリティ

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| sec.b.01 | 初級 | 基本 | 何を守るのか（機密性・完全性・可用性） | 守る対象と脅威を 3 つの観点で整理できる | 模 | found.b.06 | cloud.i.03, mon.b.01 | sec.b.02, sec.b.04, cloud.i.03 |
| sec.b.02 | 初級 | 認証と認可 | 認証と認可 | 「誰か」と「何をしてよいか」を区別できる | 模 | sec.b.01 | web.b.06, k8s.i.02 | sec.b.03, web.a.03 |
| sec.b.03 | 初級 | 認証 | パスワードと多要素認証 | 強いパスワードと多要素の意味を説明できる | 模 | sec.b.02 | web.b.06, sec.b.05 | sec.b.04 |
| sec.b.04 | 初級 | 暗号 | 公開鍵と秘密鍵 | 鍵の対と、渡してよい鍵・いけない鍵を説明できる | 端 | sec.b.01 | linux.a.04, git.i.02 | sec.b.05, sec.b.06, linux.a.04 |
| sec.b.05 | 初級 | 秘密情報 | 秘密情報を漏らさない | 鍵やトークンをコードに書かない・コミットしない理由と方法 | 端 | sec.b.04, git.b.02 | git.a.03, cicd.i.03 | sec.i.05, cicd.i.03, k8s.i.02 |
| sec.b.06 | 初級 | TLS | HTTPS と TLS | 暗号化と相手の確認の 2 つの役割を説明できる | 模 | web.b.02, sec.b.04 | web.b.02, net.b.05 | sec.b.07, web.b.08, web.a.01 |
| sec.b.07 | 初級 | 証明書 | 証明書と認証局 | サーバ証明書・中間証明書・ルート証明書の関係を説明できる | 模 | sec.b.06 | net.i.05, web.b.08 | sec.i.01 |
| sec.i.01 | 中級 | 証明書 | 証明書の検証と連鎖 | 期限・名前・連鎖の欠けによるエラーを直せる | 模 | sec.b.07 | trouble.i.03, web.a.02 | sec.i.02, trouble.i.03 |
| sec.i.02 | 中級 | 設定 | Web サーバに TLS を設定する | 証明書と秘密鍵を正しく配置し、HTTPS を有効にできる | 編 | sec.i.01, web.i.03 | web.i.03, k8s.i.04 | lab.i.01 |
| sec.i.03 | 中級 | 脆弱性 | 脆弱性とは（代表例） | SQL インジェクション・XSS などの仕組みと対策を説明できる | 模 | web.i.01, db.b.03 | db.b.03, web.i.01 | sec.a.01 |
| sec.i.04 | 中級 | 権限 | 最小権限 | 必要最小限の権限を設計し、過剰な権限を見つけられる | 端 | linux.b.07 | linux.b.07, ctr.a.02 | ctr.a.02 |
| sec.i.05 | 中級 | 秘密情報 | 秘密情報の保管と受け渡し | 環境変数・Secrets・鍵の更新（ローテーション）ができる | 編 | sec.b.05, cicd.i.03 | k8s.i.02, linux.i.06 | sec.a.01 |
| sec.a.01 | 上級 | 対応 | 脆弱性の報告から更新まで | 影響の判断と更新の優先順位を付けられる | 模 | sec.i.03, linux.i.03 | linux.i.03, docker.a.01 | sec.a.02 |
| sec.a.02 | 上級 | 監査 | ログと監査 | 不審な操作をログから見つけられる | 端 | mon.b.02 | linux.i.02, mon.i.03 | sec.a.03 |
| sec.a.03 | 上級 | 事故 | インシデント対応の基本 | 封じ込め・調査・復旧・報告の流れを実行できる | 模 | sec.a.02, trouble.i.01 | trouble.a.03, devops.i.03 | sec.a.04 |
| sec.a.04 | 上級 | 依存 | 依存関係の安全（サプライチェーン） | 依存の脆弱性を調べ、更新と固定を判断できる | 模 | cicd.i.02 | ctr.a.02, cicd.a.03 | — |

### 4.6 Git（git）— 開発オフィス

テーマ: バージョン管理 / commit / 差分と履歴 / branch / merge / conflict / remote / pull と push / GitHub・GitLab / 取り消し / 運用

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| git.b.01 | 初級 | 考え方 | バージョン管理とは | 履歴を残す理由と、無いと困る場面を説明できる | 端 | linux.b.02 | found.b.04, devops.b.01 | git.b.02 |
| git.b.02 | 初級 | commit | 最初の記録 | init/status/add/commit で変更を記録できる | 端 | git.b.01 | linux.b.02, cicd.b.01 | git.b.03, git.b.04, git.i.06 |
| git.b.03 | 初級 | 履歴 | 差分と履歴を見る | diff/log で何がいつ変わったかを読める | 端 | git.b.02 | linux.b.03, trouble.b.03 | git.i.01, git.i.04 |
| git.b.04 | 初級 | branch | 枝を分ける | branch/switch で作業を分けられる | 端 | git.b.02 | cicd.i.05, git.a.02 | git.b.05 |
| git.b.05 | 初級 | merge | 枝を合わせる | merge で統合できる | 端 | git.b.04 | cicd.b.02, git.i.03 | git.b.06, git.i.05 |
| git.b.06 | 初級 | conflict | 衝突を解く | 衝突の印を読み、正しく解消できる | 端 | git.b.05 | trouble.b.01, git.i.05 | git.i.01 |
| git.i.01 | 中級 | remote | リモートと複製 | clone/remote を理解できる | 端 | git.b.03 | net.b.06, web.b.01 | git.i.02 |
| git.i.02 | 中級 | 同期 | push と pull | 手元と遠くの履歴を同期できる。fetch との違いを説明できる | 端 | git.i.01 | sec.b.04, cicd.b.01 | git.i.03 |
| git.i.03 | 中級 | 共同作業 | GitHub / GitLab とプルリクエスト | プルリクエストを作り、レビューを受けて統合できる | 端 | git.i.02 | cicd.i.02, devops.b.03 | git.a.02, lab.i.02 |
| git.i.04 | 中級 | 取り消し | 変更を取り消す | restore/revert/reset を場面で使い分けられる | 端 | git.b.03 | db.i.04, trouble.b.01 | git.a.01, git.a.03 |
| git.i.05 | 中級 | 履歴 | rebase の考え方 | merge との違いと、使ってはいけない場面を説明できる | 端 | git.b.05 | git.b.05, git.a.02 | git.i.06 |
| git.i.06 | 中級 | 設定 | .gitignore とタグ | 管理しない物を決め、版に名前を付けられる | 端 | git.b.02 | cicd.b.04, sec.b.05 | git.a.01 |
| git.a.01 | 上級 | 調査 | 壊れた変更を探す | bisect/blame で原因の変更を特定できる | 端 | git.i.04 | trouble.a.02, cicd.i.04 | git.a.02 |
| git.a.02 | 上級 | 運用 | チームのブランチ戦略 | 保護・レビュー・リリースの流れを設計できる | 模 | git.i.03 | cicd.a.03, devops.a.02 | cicd.a.03 |
| git.a.03 | 上級 | 事故 | 秘密情報をコミットしてしまったら | 無効化・履歴からの除去・再発防止の順に対処できる | 端 | sec.b.05, git.i.04 | sec.a.03, cicd.i.03 | — |

### 4.7 CI/CD（cicd）— デプロイセンター

テーマ: CI と CD / pipeline / runner / artifact / build と test / deploy / 設定ファイル（GitHub Actions・GitLab CI など）/ 秘密情報 / デプロイ戦略

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| cicd.b.01 | 初級 | 考え方 | CI と CD とは | 手作業の配布の危うさと、自動化で何が良くなるかを説明できる | 模 | git.b.02 | devops.b.01, git.b.02 | cicd.b.02, devops.b.01 |
| cicd.b.02 | 初級 | pipeline | パイプラインの形 | ステージとジョブの流れを読める | 模 | cicd.b.01 | linux.b.05, devops.b.03 | cicd.b.03, cicd.i.01 |
| cicd.b.03 | 初級 | build/test | ビルドとテスト | 失敗したら止まる理由と、結果の読み方 | 模 | cicd.b.02 | trouble.b.02, docker.i.02 | cicd.b.04 |
| cicd.b.04 | 初級 | artifact | 成果物（artifact） | 作った物を次の段に渡す仕組みを説明できる | 模 | cicd.b.03 | docker.i.05, ctr.b.05 | cicd.b.05 |
| cicd.b.05 | 初級 | deploy | デプロイ | 環境へ配る段と、確認の段を置ける | 模 | cicd.b.04 | k8s.i.08, devops.b.03 | cicd.i.02, cicd.i.05, devops.b.03 |
| cicd.i.01 | 中級 | runner | runner | ジョブを実行する機械の役割と種類を説明できる | 模 | cicd.b.02 | cloud.b.03, docker.b.01 | cicd.i.02 |
| cicd.i.02 | 中級 | 設定 | 設定ファイルを書く | GitHub Actions と GitLab CI の設定を読み書きできる | 編 | cicd.b.05 | git.i.03, devops.i.01 | cicd.i.03, cicd.i.04, cicd.a.02 |
| cicd.i.03 | 中級 | 秘密情報 | 秘密情報をパイプラインに渡す | Secrets を使い、ログに出さない設定ができる | 編 | cicd.i.02, sec.b.05 | sec.i.05, k8s.i.02 | sec.i.05, lab.i.02 |
| cicd.i.04 | 中級 | 障害 | 失敗したパイプラインを直す | ログから失敗の段と原因を特定し直せる | 編 | cicd.i.02, trouble.b.02 | trouble.b.02, git.a.01 | cicd.i.05 |
| cicd.i.05 | 中級 | 環境 | 開発・検証・本番 | 環境ごとの違いと昇格の流れを設計できる | 模 | cicd.b.05 | git.a.02, cloud.i.01 | cicd.a.01 |
| cicd.a.01 | 上級 | 戦略 | デプロイ戦略 | ローリング・ブルーグリーン・カナリアを比べて選べる | 模 | cicd.i.05, k8s.i.08 | devops.a.01, k8s.i.08 | devops.a.01 |
| cicd.a.02 | 上級 | 速さ | パイプラインを速くする | キャッシュと並列で時間を縮められる | 編 | cicd.i.02 | docker.a.01, web.i.04 | cicd.a.03 |
| cicd.a.03 | 上級 | 品質 | 品質の門 | レビュー・保護・必須チェックを組める | 編 | git.a.02 | git.a.02, sec.a.04 | — |

### 4.8 コンテナ（ctr）— コンテナ施設

**Docker だけをコンテナ技術として扱わない。** 概念を先に教え、Docker は具体例として次の分野で扱う。

テーマ: コンテナとは / VM との違い / イメージ / コンテナ / レイヤ / レジストリ / ランタイム / ネットワーク / ストレージ / 複数コンテナ / 運用

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| ctr.b.01 | 初級 | 考え方 | コンテナとは（なぜ必要か） | 「自分の PC では動いた」問題と、コンテナの解決を説明できる | 模 | linux.b.08 | devops.b.01, cloud.b.02 | ctr.b.02, ctr.b.03 |
| ctr.b.02 | 初級 | 比較 | VM との違い | カーネルの共有と重さの違いを説明できる | 模 | found.i.03, ctr.b.01 | found.i.03, cloud.b.01 | ctr.b.03 |
| ctr.b.03 | 初級 | イメージ | イメージとコンテナ | 設計図と実体の関係を説明できる | 模 | ctr.b.01 | docker.b.02, k8s.b.04 | ctr.b.04, ctr.b.05, ctr.i.03 |
| ctr.b.04 | 初級 | レイヤ | レイヤ | 重ねて作る仕組みと、共有による節約を説明できる | 模 | ctr.b.03 | docker.i.01, docker.a.01 | ctr.i.01, ctr.i.04, docker.i.01 |
| ctr.b.05 | 初級 | レジストリ | レジストリ | イメージを置いて配る場所と、名前とタグを読める | 模 | ctr.b.03 | docker.i.05, cicd.b.04 | docker.i.05 |
| ctr.i.01 | 中級 | ランタイム | コンテナランタイム | OCI の標準と、ランタイム（containerd など）と Docker の位置関係を説明できる | 模 | ctr.b.04 | docker.a.03, k8s.b.03 | ctr.i.02, docker.a.03 |
| ctr.i.02 | 中級 | 隔離 | 隔離の仕組み | 名前空間と資源制限（cgroups）の役割を説明できる | 端 | ctr.i.01, found.a.01 | found.a.01, k8s.i.07 | ctr.i.03 |
| ctr.i.03 | 中級 | ネットワーク | コンテナのネットワーク | コンテナどうし・外との通信の仕組みを説明できる | 模 | ctr.b.03, net.b.04 | docker.i.04, net.b.04 | ctr.i.05, docker.i.04 |
| ctr.i.04 | 中級 | ストレージ | コンテナとデータ | 消える領域と残す領域（ボリューム）を使い分けられる | 模 | ctr.b.04 | docker.i.03, k8s.i.03 | ctr.i.05, docker.i.03, k8s.i.03 |
| ctr.i.05 | 中級 | 複数 | 複数コンテナで 1 つのサービス | 役割を分けて組み合わせる設計ができる | 模 | ctr.i.03, ctr.i.04 | docker.i.06, k8s.a.01 | ctr.a.01 |
| ctr.a.01 | 上級 | 運用 | コンテナ運用 | ログ・資源制限・更新・再起動方針を設計できる | 模 | ctr.i.05 | k8s.i.07, mon.b.02 | ctr.a.02 |
| ctr.a.02 | 上級 | 安全 | コンテナの安全 | 最小イメージ・root で動かさない・脆弱性の走査を実践できる | 編 | ctr.a.01, sec.i.04 | sec.i.04, sec.a.04 | — |

### 4.9 Docker（docker）— コンテナ施設（Docker 工房）

テーマ: Docker Engine / image / container / Dockerfile / build / run / volume / network / registry / Compose

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| docker.b.01 | 初級 | Engine | Docker とは | Docker Engine と CLI の関係、コンテナ技術の中での位置を説明できる | 模 | ctr.b.03 | ctr.i.01, docker.a.03 | docker.b.02 |
| docker.b.02 | 初級 | image | イメージを取る・見る | pull/images でイメージを扱える | 端 | docker.b.01 | ctr.b.05, ctr.b.03 | docker.b.03 |
| docker.b.03 | 初級 | run | コンテナを動かす | run/ps/stop/rm で動かし止められる | 端 | docker.b.02 | linux.i.01, k8s.b.04 | docker.b.04, docker.b.05, docker.i.01 |
| docker.b.04 | 初級 | 公開 | ポートを公開する | -p で外から繋がるようにできる | 端 | docker.b.03, net.b.04 | net.b.04, k8s.b.06 | docker.b.05 |
| docker.b.05 | 初級 | 観察 | ログと中に入る | logs/exec で様子を見られる | 端 | docker.b.03 | linux.i.02, k8s.a.02 | docker.a.02 |
| docker.i.01 | 中級 | Dockerfile | Dockerfile を書く | FROM/COPY/RUN/CMD で自分のイメージを作れる | 編 | docker.b.03, ctr.b.04 | ctr.b.04, cicd.b.03 | docker.i.02, docker.a.01 |
| docker.i.02 | 中級 | build | ビルドとタグ | build/tag でイメージを作り名前を付けられる | 端 | docker.i.01 | cicd.b.04, git.i.06 | docker.i.05 |
| docker.i.03 | 中級 | volume | ボリューム | データを残すコンテナを作れる | 端 | ctr.i.04 | ctr.i.04, k8s.i.03 | docker.i.06 |
| docker.i.04 | 中級 | network | ネットワーク | 自作ネットワークでコンテナどうしを名前で繋げる | 端 | ctr.i.03 | ctr.i.03, net.b.06 | docker.i.06 |
| docker.i.05 | 中級 | registry | レジストリに置く | push/pull で配れる | 端 | docker.i.02, ctr.b.05 | ctr.b.05, cicd.b.04 | docker.i.06 |
| docker.i.06 | 中級 | Compose | Compose で複数コンテナ | compose.yaml で Web と DB を一緒に動かせる | 編 | docker.i.04, docker.i.03 | ctr.i.05, k8s.a.01 | lab.a.01 |
| docker.a.01 | 上級 | 軽量化 | マルチステージビルド | 小さく安全なイメージを作れる | 編 | docker.i.01 | ctr.a.02, cicd.a.02 | docker.a.02 |
| docker.a.02 | 上級 | 障害 | 起動しないコンテナを直す | 終了コード・ログ・設定から原因を特定できる | 端 | docker.b.05, trouble.i.01 | trouble.a.01, k8s.a.02 | docker.a.03 |
| docker.a.03 | 上級 | 周辺 | Docker 以外の道具 | Podman・BuildKit などとの関係を説明できる | 模 | ctr.i.01 | ctr.i.01, k8s.b.03 | — |

### 4.10 Kubernetes（k8s）— クラスタ施設

独立した重要分野。段階的に扱う。

テーマ: Kubernetes とは / なぜ必要か / コンテナとの関係 / クラスタ / Node / Pod / Deployment / Service / Namespace / ConfigMap / Secret / Volume / Ingress / ヘルスチェック / スケーリング / ローリングアップデート / 上のアプリ / トラブルシューティング

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| k8s.b.01 | 初級 | 考え方 | Kubernetes とは・なぜ必要か | 多数のコンテナを手で面倒を見る限界と、宣言して任せる考え方を説明できる | 模 | ctr.b.03 | ctr.b.01, devops.b.02 | k8s.b.02 |
| k8s.b.02 | 初級 | 関係 | コンテナとの関係 | コンテナ・Pod・Node の包含関係を説明できる | 模 | k8s.b.01 | ctr.b.03, docker.b.03 | k8s.b.03 |
| k8s.b.03 | 初級 | クラスタ | クラスタと Node | 制御する側と動かす側の役割を説明し、kubectl get nodes を読める | 端 | k8s.b.02 | ctr.i.01, cloud.b.03 | k8s.b.04, k8s.b.07 |
| k8s.b.04 | 初級 | Pod | Pod | Pod を作り、状態（Pending・Running）を読める | 端 | k8s.b.03 | docker.b.03, linux.b.08 | k8s.b.05, k8s.i.03 |
| k8s.b.05 | 初級 | Deployment | Deployment | あるべき数を保つ仕組みを確かめられる | 端 | k8s.b.04 | cloud.i.01, ctr.i.05 | k8s.b.06, k8s.i.01, k8s.i.05 |
| k8s.b.06 | 初級 | Service | Service | 入れ替わる Pod に一定の入口を与えられる | 端 | k8s.b.05, net.b.04 | net.a.03, docker.b.04 | k8s.i.04, mon.i.01, cloud.a.01 |
| k8s.b.07 | 初級 | Namespace | Namespace | 区画を分けて管理できる | 端 | k8s.b.03 | net.i.06, sec.i.04 | k8s.i.01 |
| k8s.i.01 | 中級 | 設定 | ConfigMap | 設定をイメージから切り離せる | 編 | k8s.b.05 | linux.i.06, docker.i.01 | k8s.i.02 |
| k8s.i.02 | 中級 | 秘密 | Secret | 秘密情報を扱い、その限界を説明できる | 編 | k8s.i.01, sec.b.05 | sec.i.05, cicd.i.03 | k8s.i.03 |
| k8s.i.03 | 中級 | 保存 | Volume（PV と PVC） | データを残す Pod を作れる | 編 | k8s.b.04, ctr.i.04 | docker.i.03, db.a.01 | k8s.a.01 |
| k8s.i.04 | 中級 | 公開 | Ingress | 名前やパスで振り分けて外に公開できる | 編 | k8s.b.06, web.i.03 | web.i.03, sec.i.02 | k8s.a.01, k8s.a.03 |
| k8s.i.05 | 中級 | 健全性 | ヘルスチェック | liveness と readiness を設定し違いを説明できる | 編 | k8s.b.05 | mon.b.04, linux.i.01 | k8s.a.02 |
| k8s.i.06 | 中級 | 規模 | スケーリング | 手動と自動で数を変えられる | 端 | k8s.b.05 | cloud.i.02, mon.b.03 | k8s.i.07 |
| k8s.i.07 | 中級 | 資源 | 資源の要求と上限 | requests と limits を設定し、配置への影響を説明できる | 編 | k8s.i.06 | ctr.i.02, found.i.01 | k8s.i.08 |
| k8s.i.08 | 中級 | 更新 | ローリングアップデート | 止めずに更新し、戻せる | 端 | k8s.b.05 | cicd.a.01, devops.a.01 | k8s.a.04, cicd.a.01 |
| k8s.a.01 | 上級 | アプリ | Kubernetes 上のアプリ | Web・API・DB の 3 層を動かし公開できる | 編 | k8s.i.04, k8s.i.03 | lab.a.01, db.b.01 | lab.a.01 |
| k8s.a.02 | 上級 | 障害 | 動かない Pod を直す | Pending・ImagePullBackOff・CrashLoopBackOff を切り分けて直せる | 端 | k8s.i.05, trouble.i.01 | docker.a.02, trouble.a.01 | trouble.a.01 |
| k8s.a.03 | 上級 | 障害 | 繋がらない Service を直す | Endpoints が空・ポートの不一致・Ingress の誤りを直せる | 端 | k8s.i.04 | net.a.01, web.a.02 | mon.a.02 |
| k8s.a.04 | 上級 | 保守 | Node の保守 | cordon/drain で止めずに保守できる | 端 | k8s.i.08 | cloud.i.01, linux.a.01 | — |

### 4.11 データベース（db）— データセンター

テーマ: DB 基礎 / SQL / テーブル / インデックス / トランザクション / RDB / NoSQL の基本 / バックアップ / 障害対応

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| db.b.01 | 初級 | 考え方 | データベースとは | ファイルではなく DB を使う理由を説明できる | 模 | found.b.04 | found.b.04, web.i.02 | db.b.02 |
| db.b.02 | 初級 | テーブル | テーブル・行・列 | 表の形でデータを整理できる | S | db.b.01 | found.b.08, web.i.02 | db.b.03 |
| db.b.03 | 初級 | SQL | SELECT | 必要な列と行を取り出せる | S | db.b.02 | web.i.01, sec.i.03 | db.b.04, db.b.05, sec.i.03 |
| db.b.04 | 初級 | SQL | 絞り込み・並べ替え・集計 | WHERE/ORDER BY/GROUP BY を使える | S | db.b.03 | linux.b.04, mon.b.02 | db.i.01, db.i.03 |
| db.b.05 | 初級 | SQL | 追加・更新・削除 | INSERT/UPDATE/DELETE を安全に使える | S | db.b.03 | web.b.03, db.i.04 | db.i.04 |
| db.i.01 | 中級 | 結合 | JOIN | 複数の表を結び付けて取り出せる | S | db.b.04 | db.i.02, web.i.01 | db.i.02 |
| db.i.02 | 中級 | 設計 | RDB の設計 | 重複を減らす分け方（正規化の考え方）ができる | S | db.i.01 | db.i.05, web.i.01 | db.i.05 |
| db.i.03 | 中級 | 性能 | インデックス | 遅い検索を索引で速くできる | S | db.b.04 | web.i.04, linux.a.02 | db.a.02 |
| db.i.04 | 中級 | 整合 | トランザクション | 途中で失敗しても壊れない更新ができる | S | db.b.05 | git.i.04, found.i.02 | db.a.01 |
| db.i.05 | 中級 | 種類 | NoSQL の基本概念 | 文書型・キーバリュー型などの向き不向きを説明できる | 模 | db.i.02 | web.i.02, cloud.b.02 | db.a.01 |
| db.a.01 | 上級 | 保全 | バックアップと復元 | 取り方と戻し方、確かめ方を実行できる | S | db.i.04 | k8s.i.03, cloud.i.01 | db.a.03 |
| db.a.02 | 上級 | 障害 | DB の障害対応 | ロック待ち・遅いクエリ・容量不足を切り分けられる | S | db.i.03, trouble.i.01 | trouble.i.01, mon.i.03 | db.a.03 |
| db.a.03 | 上級 | 冗長 | レプリケーションの考え方 | 複製の目的と遅れの影響を説明できる | 模 | db.a.01 | cloud.i.01, net.a.03 | — |

### 4.12 クラウド / インフラ（cloud）— クラウドセンター

特定のクラウド製品に依存しない。製品名は例としてのみ出す。

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| cloud.b.01 | 初級 | 仮想化 | 仮想化とクラウド | 自前の機械とクラウドの違いを説明できる | 模 | found.i.03 | found.i.03, ctr.b.02 | cloud.b.02 |
| cloud.b.02 | 初級 | 形 | IaaS・PaaS・SaaS | どこまでを自分で管理するかで区別できる | 模 | cloud.b.01 | ctr.b.01, db.i.05 | cloud.b.03, cloud.i.03 |
| cloud.b.03 | 初級 | 資源 | コンピュート・ストレージ・ネットワーク | 3 つの資源を組み合わせて小さな構成を作れる | 模 | cloud.b.02, net.b.03 | net.b.03, linux.a.03 | cloud.i.01, devops.i.01 |
| cloud.i.01 | 中級 | 可用性 | 可用性と冗長化 | 1 つ壊れても止まらない構成を作れる | 模 | cloud.b.03 | k8s.b.05, db.a.03 | cloud.i.02, cloud.a.02 |
| cloud.i.02 | 中級 | 規模 | スケーリング | 縦と横、自動の拡縮を設計できる | 模 | cloud.i.01 | k8s.i.06, net.a.03 | cloud.i.04, cloud.a.01 |
| cloud.i.03 | 中級 | 責任 | 責任共有モデル | 利用者と提供者の責任の境目を説明できる | 模 | cloud.b.02, sec.b.01 | sec.b.01, sec.i.04 | cloud.i.04 |
| cloud.i.04 | 中級 | 費用 | 費用の考え方 | 構成から費用の大小を見積もれる | 模 | cloud.i.02 | cloud.i.02, mon.b.03 | cloud.a.01 |
| cloud.a.01 | 上級 | 設計 | 同じ要件を 3 つの形で作る | IaaS・PaaS・コンテナの構成を比べて選べる | 模 | cloud.i.02, k8s.b.06 | k8s.a.01, devops.i.01 | cloud.a.02 |
| cloud.a.02 | 上級 | 障害 | 障害に強い構成 | 地域・区画の障害を想定して設計できる | 模 | cloud.i.01, mon.i.03 | mon.i.03, devops.a.01 | — |

### 4.13 監視（mon）— 監視・運用センター

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| mon.b.01 | 初級 | 考え方 | 監視とは | 何を・なぜ見るのかを説明できる | 模 | linux.i.02 | sec.b.01, k8s.i.05 | mon.b.02, mon.b.03 |
| mon.b.02 | 初級 | ログ | ログ | 構造化ログを読み、絞り込める | 端 | mon.b.01 | linux.i.02, trouble.b.03 | mon.i.01, sec.a.02 |
| mon.b.03 | 初級 | メトリクス | メトリクス | 数値の推移から異常を見つけられる | 模 | mon.b.01 | linux.a.02, web.a.01 | mon.b.04, mon.i.02 |
| mon.b.04 | 初級 | アラート | アラート | しきい値と通知の設計ができる | 模 | mon.b.03 | k8s.i.05, linux.i.08 | mon.i.04 |
| mon.i.01 | 中級 | トレース | トレース | 1 つの処理が複数のサービスを通る様子を追える | 模 | mon.b.02, k8s.b.06 | web.a.01, k8s.b.06 | mon.i.03 |
| mon.i.02 | 中級 | 可視化 | ダッシュボードを読む | 複数のグラフから状況を説明できる | 模 | mon.b.03 | linux.a.02, cloud.i.04 | devops.i.02 |
| mon.i.03 | 中級 | 調査 | 障害調査の手順 | ログ・メトリクス・トレースを突き合わせて原因に迫れる | 模 | mon.i.01, trouble.b.01 | trouble.a.02, sec.a.02 | mon.a.02, cloud.a.02, trouble.a.02 |
| mon.i.04 | 中級 | 目標 | SLO の考え方 | 目標と余裕（エラーバジェット）を決められる | 模 | mon.b.04 | devops.i.02, cloud.i.01 | mon.a.01 |
| mon.a.01 | 上級 | 設計 | 鳴りすぎないアラート | 症状に基づく通知と、優先度の設計ができる | 模 | mon.i.04 | sec.a.03, devops.a.02 | mon.a.02 |
| mon.a.02 | 上級 | 分散 | 分散システムの調査 | 遅延の伝播と部分的な障害を見抜ける | 模 | mon.i.03, k8s.a.03 | k8s.a.03, net.a.01 | — |

### 4.14 DevOps（devops）— DevOps 推進本部

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| devops.b.01 | 初級 | 考え方 | 開発と運用 | 分断で起きる問題と、つなぐ考え方を説明できる | 模 | cicd.b.01 | git.b.01, cicd.b.01 | devops.b.02 |
| devops.b.02 | 初級 | 自動化 | 自動化 | 手作業を見つけて自動化の候補を選べる | 模 | devops.b.01, linux.i.07 | linux.i.07, cicd.b.01 | devops.i.01 |
| devops.b.03 | 初級 | 流れ | CI/CD と DevOps | 変更が本番に届くまでの流れを描ける | 模 | cicd.b.05 | cicd.b.02, git.i.03 | devops.i.01 |
| devops.i.01 | 中級 | IaC | Infrastructure as Code の基本概念 | 構成をコードで表す利点と、宣言型の読み方 | 編 | devops.b.02, cloud.b.03 | cloud.b.03, k8s.i.01 | devops.i.02 |
| devops.i.02 | 中級 | 改善 | 監視と改善のループ | 測って・直して・確かめる循環を回せる | 模 | mon.i.02 | mon.i.04, cicd.a.02 | devops.i.03 |
| devops.i.03 | 中級 | 振り返り | ポストモーテム | 責めない振り返りと再発防止を書ける | 模 | trouble.i.01 | sec.a.03, mon.a.01 | devops.a.02, trouble.a.03 |
| devops.a.01 | 上級 | 安全な変更 | 小さく頻繁に変える | 変更の大きさと失敗率の関係を説明し、手順を設計できる | 模 | cicd.a.01 | cicd.a.01, k8s.i.08 | devops.a.02 |
| devops.a.02 | 上級 | 組織 | チームと文化 | 役割・責任・情報共有の仕組みを設計できる | 模 | devops.i.03 | git.a.02, sec.a.03 | — |

### 4.15 トラブルシューティング（trouble）— インシデント対応本部

独立した重要スキル。**わざと壊れた状態から始める実戦**を中心にする。

| ID | 難易度 | テーマ | レッスン | 到達目標 | 実戦 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|---|
| trouble.b.01 | 初級 | 型 | 切り分けの型 | 症状 → 範囲 → 仮説 → 確認 → 対処 → 再確認、を回せる | 模 | linux.b.04 | net.a.01, mon.i.03 | trouble.b.02, mon.i.03, net.a.01 |
| trouble.b.02 | 初級 | 読む | エラーメッセージを読む | どこが何と言っているかを読み取れる | 端 | trouble.b.01 | linux.b.01, cicd.i.04 | trouble.b.03, cicd.i.04 |
| trouble.b.03 | 初級 | 読む | ログを読む | 時刻と文脈で手掛かりを集められる | 端 | trouble.b.02 | linux.i.02, mon.b.02 | web.a.02 |
| trouble.i.01 | 中級 | Linux | サーバの障害 | ディスク満杯・権限・サービス停止を直せる | 端 | linux.i.05, linux.i.01 | linux.a.01, db.a.02 | devops.i.03, sec.a.03, docker.a.02 |
| trouble.i.02 | 中級 | ネットワーク | 繋がらない | 名前が引けない・経路が無い・ポートが閉じている、を見分けて直せる | 端 | net.i.03 | net.a.01, k8s.a.03 | trouble.i.03 |
| trouble.i.03 | 中級 | Web | Web の障害 | 4xx/5xx・証明書・リバースプロキシの誤りを直せる | 端 | web.i.03, sec.i.01 | web.a.02, sec.i.01 | trouble.a.01 |
| trouble.a.01 | 上級 | コンテナ | コンテナと Kubernetes の障害 | 層をまたぐ障害を切り分けて直せる | 端 | k8s.a.02 | docker.a.02, k8s.a.02 | trouble.a.02, lab.a.02 |
| trouble.a.02 | 上級 | 複合 | 複合障害 | 複数の原因が重なった障害を順に解ける | 模 | trouble.a.01, mon.i.03 | mon.a.02, git.a.01 | trouble.a.03 |
| trouble.a.03 | 上級 | 予防 | 再発防止 | 原因に応じた恒久対策を選び、確かめられる | 模 | trouble.a.02, devops.i.03 | devops.i.03, sec.a.03 | — |

### 4.16 研究（lab）— 研究施設（総合演習）

複数分野を組み合わせた、実務に近い課題。都市のミッションと連動する（`docs/game-design.md`）。

| ID | 難易度 | 課題 | 使う分野 | 到達目標 | 推奨前提 | 関連 | 次に学ぶとよい |
|---|---|---|---|---|---|---|---|
| lab.i.01 | 中級 | Web サービスを公開する | linux・net・web・sec | サーバを用意し、Web サーバを動かし、HTTPS で公開できる | linux.i.01, web.i.03, sec.i.02 | web.i.03, sec.i.02 | lab.i.02 |
| lab.i.02 | 中級 | チーム開発から自動デプロイ | git・cicd・sec | プルリクエストからテスト・配布まで自動で流せる | git.i.03, cicd.i.03 | cicd.i.03, git.a.02 | lab.a.01 |
| lab.a.01 | 上級 | コンテナ化して Kubernetes へ | ctr・docker・k8s | アプリをコンテナにし、クラスタで公開・更新できる | docker.i.06, k8s.a.01 | cicd.a.01, cloud.a.01 | lab.a.02 |
| lab.a.02 | 上級 | 監視して障害を直す | mon・trouble・k8s | 監視で異常に気づき、原因を特定して直せる | mon.i.03, trouble.a.01 | devops.i.02, sec.a.03 | lab.a.03 |
| lab.a.03 | 上級 | 新しい技術を調べて試す | 全般 | 公式ドキュメントを読み、小さく試し、報告できる | 任意の中級 2 分野 | devops.a.02, cloud.a.01 | — |

---

## 5. 分量の目安

| 分野 | 初級 | 中級 | 上級 | 計 |
|---|---|---|---|---|
| found | 8 | 3 | 1 | 12 |
| linux | 9 | 8 | 4 | 21 |
| net | 8 | 6 | 4 | 18 |
| web | 8 | 6 | 3 | 17 |
| sec | 7 | 5 | 4 | 16 |
| git | 6 | 6 | 3 | 15 |
| cicd | 5 | 5 | 3 | 13 |
| ctr | 5 | 5 | 2 | 12 |
| docker | 5 | 6 | 3 | 14 |
| k8s | 7 | 8 | 4 | 19 |
| db | 5 | 5 | 3 | 13 |
| cloud | 3 | 4 | 2 | 9 |
| mon | 4 | 4 | 2 | 10 |
| devops | 3 | 3 | 2 | 8 |
| trouble | 3 | 3 | 3 | 9 |
| lab | 0 | 2 | 3 | 5 |
| **計** | **86** | **79** | **46** | **211** |

初回公開の範囲は `docs/decisions.md` Q-04。
