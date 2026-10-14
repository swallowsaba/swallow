# 実戦の作り直し（REWORK-PRACTICE.txt）

記録を始めた日: 2026-10-09

`REWORK-PRACTICE.txt` の指示で、実戦（レッスンの右側の画面）を全面的に作り直す。`docs/development-plan.md` の Phase 13 以降より先に行う。
分野ごとに進め（git → k8s → docker → linux → web → net → db → それ以外）、分野ごとに検査を通してコミットし、ここに結果を書き足す。

## 決まり（原則 1〜5 の要約）

1. 本物の道具がある分野は、必ず本物の道具（git・kubectl・docker・Linux のコマンド・curl・ping/dig/ip/ss・SQL・本物の書式の設定ファイル）を使う。架空の文を作らない
2. 画面の操作にするのは、打つコマンドが存在しない概念だけ
3. 画面の操作は、ドラッグして置く・つなぐ・並べ替える の 3 つと、何をするかが文字で分かるボタンだけ。文を打つ入力欄は作らない
4. 操作の結果は動きで見せる（置くと枠が光り数が動く・つなぐと光の粒が流れる・並べると上から流れる・失敗は止まった所が赤い）。動きを減らす設定では即時
5. 左の目的に出てくる物の名前が、右の画面にそのまま同じ名前で出る

## 判定の考え方（(1) の表の「本物の道具」）

- 「ある」: そのレッスンで行う操作そのものを、現場では本物のコマンドか、本物の書式の設定ファイルで行う（例: 版を戻す → git、経路を足す → ip route、URL を組み立てて取る → curl、レコードを足す → ゾーンファイル）
- 「無い」: 現場でも人が頭の中や紙の上で行う概念の操作（部品の役割・層への仕分け・構成図・流れの設計・観点への仕分け・方式の選び方）。指示書の原則 2 の例（コンピュータの仕組み・OSI の層・IaaS と PaaS の違い・責任共有モデル）と同じ種類
- 「無い」でも、確かめる所に本物の道具の名があれば、ボタンの文字にその名を出す（届くかを確かめる「ping サーバ」など）
- 端末の実戦の「調べて答える」欄（端末で調べた答えを書く欄。`docs/content-spec.md` 2.4 の `answer`）は、画面の操作ではなく本物の道具で調べた結果を書く所なので残す（原則 3 は画面の操作の決まり）

## (1) 131 本の実戦の調べ

今の形: terminal（仮想端末）/ editor（設定の編集）/ sql（ブラウザ内 SQL）/ sim-connect（つなぐ）/ sim-order（並べる）/ sim-assign（置く）/ sim-config（設定する）/ sim-read（読み取って答える）

| レッスン | 本物の道具 | 今の形 | 直した後の形 | 使う道具・理由 |
|---|---|---|---|---|
| git.b.01 バージョン管理とは | ある | sim-config | terminal | git log で履歴を読み、git restore で前の版に戻す |
| git.b.02 最初の記録 | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| git.b.03 差分と履歴を見る | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| git.b.04 枝を分ける | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| git.b.05 枝を合わせる | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| git.b.06 衝突を解く | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| git.i.01 リモートと複製 | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| git.i.02 push と pull | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| git.i.03 GitHub / GitLab とプルリクエスト | ある | sim-config | terminal | gh pr create・gh pr checks・git push・gh pr merge で依頼を通す |
| git.i.04 変更を取り消す | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| git.i.05 rebase の考え方 | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| git.i.06 .gitignore とタグ | ある | terminal | terminal（そのまま） | 本物のコマンド（git） |
| k8s.b.01 Kubernetes とは・なぜ必要か | ある | sim-config | terminal | kubectl で手で置いた Pod と、宣言した Deployment を比べる |
| k8s.b.02 コンテナとの関係 | ある | sim-assign | terminal | kubectl get nodes・get pods -o wide・describe で入れ子を読む |
| k8s.b.03 クラスタと Node | ある | terminal | terminal（そのまま） | 本物のコマンド（kubectl） |
| k8s.b.04 Pod | ある | terminal | terminal（そのまま） | 本物のコマンド（kubectl） |
| k8s.b.05 Deployment | ある | terminal | terminal（そのまま） | 本物のコマンド（kubectl） |
| k8s.b.06 Service | ある | terminal | terminal（そのまま） | 本物のコマンド（kubectl） |
| k8s.b.07 Namespace | ある | terminal | terminal（そのまま） | 本物のコマンド（kubectl） |
| k8s.i.01 ConfigMap | ある | editor | editor（そのまま） | 本物の書式で書き、保存の後に本物のコマンドで確かめる |
| k8s.i.02 Secret | ある | editor | editor（そのまま） | 本物の書式で書き、保存の後に本物のコマンドで確かめる |
| k8s.i.03 Volume（PV と PVC） | ある | editor | editor（そのまま） | 本物の書式で書き、保存の後に本物のコマンドで確かめる |
| k8s.i.04 Ingress | ある | editor | editor（そのまま） | 本物の書式で書き、保存の後に本物のコマンドで確かめる |
| k8s.i.05 ヘルスチェック | ある | editor | editor（そのまま） | 本物の書式で書き、保存の後に本物のコマンドで確かめる |
| k8s.i.06 スケーリング | ある | terminal | terminal（そのまま） | 本物のコマンド（kubectl） |
| k8s.i.07 資源の要求と上限 | ある | editor | editor（そのまま） | 本物の書式で書き、保存の後に本物のコマンドで確かめる |
| k8s.i.08 ローリングアップデート | ある | terminal | terminal（そのまま） | 本物のコマンド（kubectl） |
| docker.b.01 Docker とは | ある | sim-read | terminal | docker version・docker info で CLI と Engine を読む |
| docker.b.02 イメージを取る・見る | ある | terminal | terminal（そのまま） | 本物のコマンド（docker） |
| docker.b.03 コンテナを動かす | ある | terminal | terminal（そのまま） | 本物のコマンド（docker） |
| docker.b.04 ポートを公開する | ある | terminal | terminal（そのまま） | 本物のコマンド（docker） |
| docker.b.05 ログと中に入る | ある | terminal | terminal（そのまま） | 本物のコマンド（docker） |
| docker.i.01 Dockerfile を書く | ある | editor | editor（そのまま） | 本物の書式で書き、保存の後に本物のコマンドで確かめる |
| docker.i.02 ビルドとタグ | ある | terminal | terminal（そのまま） | 本物のコマンド（docker） |
| docker.i.03 ボリューム | ある | terminal | terminal（そのまま） | 本物のコマンド（docker） |
| docker.i.04 ネットワーク | ある | terminal | terminal（そのまま） | 本物のコマンド（docker） |
| docker.i.05 レジストリに置く | ある | terminal | terminal（そのまま） | 本物のコマンド（docker） |
| docker.i.06 Compose で複数コンテナ | ある | editor | editor（そのまま） | 本物の書式で書き、保存の後に本物のコマンドで確かめる |
| linux.b.00 Linux とは | ある | sim-read | terminal | cat /etc/os-release・uname で OS と配布物と版を読む |
| linux.b.01 端末とシェル | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.b.02 作る・写す・移す・消す | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.b.03 中身を見る | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.b.04 探す | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.b.05 パイプとリダイレクト | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.b.06 権限を読む・変える | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.b.07 ユーザー・グループ・sudo | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.b.08 プロセスを見る・止める | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.i.01 サービスと systemd | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.i.02 ログを読む | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.i.03 パッケージ管理 | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.i.04 IP とポートを確かめる | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.i.05 容量を調べる | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.i.06 環境変数とシェル設定 | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.i.07 シェルスクリプト入門 | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| linux.i.08 定期実行 | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| web.b.01 URL の組み立て | ある | sim-config | terminal | curl で URL を組み立てて資源を取る |
| web.b.02 リクエストとレスポンス | ある | terminal | terminal（そのまま） | 本物のコマンド（curl） |
| web.b.03 HTTP メソッド | ある | terminal | terminal（そのまま） | 本物のコマンド（curl） |
| web.b.04 ステータスコード | ある | terminal | terminal（そのまま） | 本物のコマンド（curl） |
| web.b.05 HTTP ヘッダ | ある | terminal | terminal（そのまま） | 本物のコマンド（curl） |
| web.b.06 Cookie とセッション | ある | sim-config | terminal | curl -i・-c・-b で Cookie を見て、設定を直す |
| web.b.07 Web サーバの役割 | ある | terminal | terminal（そのまま） | 本物のコマンド（curl） |
| web.b.08 HTTPS（HTTP を安全にする） | ある | terminal | terminal（そのまま） | 本物のコマンド（curl） |
| web.i.01 REST と API | ある | terminal | terminal（そのまま） | 本物のコマンド（curl） |
| web.i.02 JSON | ある | terminal | terminal（そのまま） | 本物のコマンド（curl） |
| web.i.03 仮想ホストとリバースプロキシ | ある | editor | editor（そのまま） | 本物の書式で書き、保存の後に本物のコマンドで確かめる |
| web.i.04 キャッシュ | ある | sim-config | editor | Web サーバの設定に Cache-Control を書き、curl -I で確かめる |
| web.i.05 CORS | ある | sim-config | editor | Web サーバの設定に Access-Control-Allow-Origin を書き、curl で確かめる |
| web.i.06 HTTP/2 と HTTP/3 | ある | terminal | terminal（そのまま） | 本物のコマンド（curl） |
| net.b.01 ネットワークとは（LAN と WAN） | 無い | sim-connect | sim-connect | LAN と WAN の配線。届くかは ping の名のボタンで確かめる |
| net.b.02 OSI と TCP/IP の層 | 無い | sim-assign | sim-assign | OSI・TCP/IP の層への仕分け（原則 2 の例） |
| net.b.03 IP アドレスとサブネット | ある | sim-config | terminal | ip addr でアドレスを振り、ping で確かめる |
| net.b.04 ポート | ある | sim-assign | terminal | ss -tlnp で待ち受けを見て、設定を直す |
| net.b.05 TCP と UDP | ある | sim-read | terminal | ss -tuln で TCP・UDP の待ち受けを見て、使い分けを答える |
| net.b.06 名前解決 | ある | terminal | terminal（そのまま） | 本物のコマンド（ping・dig・ip・ss・traceroute） |
| net.b.07 ping と traceroute | ある | terminal | terminal（そのまま） | 本物のコマンド（ping・dig・ip・ss・traceroute） |
| net.b.08 DHCP | ある | sim-config | editor | DHCP のサーバの設定（配る範囲）を書き、dhclient で受け取る |
| net.i.01 経路とデフォルトゲートウェイ | ある | sim-config | terminal | ip route で経路を足し、ping・traceroute で確かめる |
| net.i.02 NAT | ある | sim-config | terminal | iptables の nat 表で転送し、curl で確かめる |
| net.i.03 ファイアウォール | ある | sim-order | terminal | iptables の規則の順を直し、確かめる |
| net.i.04 接続の確立と状態 | ある | terminal | terminal（そのまま） | 本物のコマンド（ping・dig・ip・ss・traceroute） |
| net.i.05 DNS レコード | ある | sim-config | editor | ゾーンファイルにレコードを書き、dig で確かめる |
| net.i.06 ネットワークを分ける | ある | sim-config | terminal | VLAN と網の間の規則を ip・bridge・iptables で分ける |
| db.b.01 データベースとは | ある | sim-config | sql | 同時の更新を SQL で記録し、残りを確かめる |
| db.b.02 テーブル・行・列 | ある | sql | sql（そのまま） | 本物の SQL |
| db.b.03 SELECT | ある | sql | sql（そのまま） | 本物の SQL |
| db.b.04 絞り込み・並べ替え・集計 | ある | sql | sql（そのまま） | 本物の SQL |
| db.b.05 追加・更新・削除 | ある | sql | sql（そのまま） | 本物の SQL |
| found.b.01 コンピュータは何をしているか | 無い | sim-connect | sim-connect | 部品の配線（入力・処理・出力・記憶）。打つコマンドが無い |
| found.b.02 CPU・メモリ・ストレージ | 無い | sim-assign | sim-assign | メモリとストレージの役割分担 |
| found.b.03 OS の役割 | 無い | sim-assign | sim-assign | OS の資源の割り振り（取り合い） |
| found.b.04 ファイルとディレクトリ | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| found.b.05 プロセスとは | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| found.b.06 利用者と権限 | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| found.b.07 ネットワークとインターネットの全体像 | 無い | sim-connect | sim-connect | 途切れた線（物理の配線）をつなぐ。届くかは ping の名のボタンで確かめる |
| found.b.08 2 進数・文字コード・データ量 | ある | sim-config | terminal | file・iconv で文字コードを調べて読み直す |
| ctr.b.01 コンテナとは（なぜ必要か） | 無い | sim-assign | sim-assign | 箱（イメージ）に入れる物と機械に任せる物の仕分け |
| ctr.b.02 VM との違い | 無い | sim-read | sim-read | VM とコンテナの比べ |
| ctr.b.03 イメージとコンテナ | ある | sim-config | terminal | コンテナの中の直しが消えることを確かめ、イメージを作り直す |
| ctr.b.04 レイヤ | ある | sim-order | editor | Containerfile の命令の順を直し、作り直しのキャッシュを確かめる |
| ctr.b.05 レジストリ | ある | sim-config | terminal | イメージの名前とタグを読み、版を固定する |
| ctr.i.01 コンテナランタイム | 無い | sim-connect | sim-connect | 道具からカーネルまでの頼む順（構成図） |
| ctr.i.02 隔離の仕組み | ある | terminal | terminal（そのまま） | 本物のコマンド（コンテナのコマンド・設定） |
| ctr.i.03 コンテナのネットワーク | ある | sim-config | terminal | 網を作ってつなぎ、公開するポートを決める |
| ctr.i.04 コンテナとデータ | ある | sim-config | terminal | ボリュームを付けて作り直し、データが残るかを確かめる |
| ctr.i.05 複数コンテナで 1 つのサービス | ある | sim-config | editor | compose の YAML で 3 つに分けてつなぐ |
| cloud.b.01 仮想化とクラウド | 無い | sim-read | sim-read | 自前とクラウドの選び方 |
| cloud.b.02 IaaS・PaaS・SaaS | 無い | sim-read | sim-read | IaaS・PaaS・SaaS の範囲（原則 2 の例） |
| cloud.b.03 コンピュート・ストレージ・ネットワーク | 無い | sim-connect | sim-connect | 製品に依らない小さな構成図 |
| sec.b.01 何を守るのか（機密性・完全性・可用性） | 無い | sim-config | sim-assign | 事故を機密性・完全性・可用性に仕分ける |
| sec.b.02 認証と認可 | 無い | sim-assign | sim-assign | 役割に操作の権限を割り当てる |
| sec.b.03 パスワードと多要素認証 | 無い | sim-config | sim-assign | 入口の決まり（要素・長さ・照合・失敗）を選んで置く |
| sec.b.04 公開鍵と秘密鍵 | ある | terminal | terminal（そのまま） | 本物のコマンド（ssh・openssl などのコマンド） |
| sec.b.05 秘密情報を漏らさない | ある | terminal | terminal（そのまま） | 本物のコマンド（ssh・openssl などのコマンド） |
| sec.b.06 HTTPS と TLS | 無い | sim-order | sim-order | TLS の握手の順 |
| sec.b.07 証明書と認証局 | ある | sim-order | terminal | 中間証明書をつないだ証明書を置き、curl で信頼を確かめる |
| cicd.b.01 CI と CD とは | ある | sim-order | editor | ワークフローの YAML の手順を並べ直す |
| cicd.b.02 パイプラインの形 | ある | sim-order | editor | ワークフローの YAML の needs で並行にする |
| cicd.b.03 ビルドとテスト | ある | sim-read | terminal | gh run view で失敗したログを読む |
| cicd.b.04 成果物（artifact） | ある | sim-config | editor | ワークフローの YAML で成果物を渡す |
| cicd.b.05 デプロイ | ある | sim-config | editor | ワークフローの YAML に確かめと切り戻しを書く |
| mon.b.01 監視とは | 無い | sim-assign | sim-assign | 測る点をどこに置くか |
| mon.b.02 ログ | ある | terminal | terminal（そのまま） | 本物のコマンド（Linux のコマンド） |
| mon.b.03 メトリクス | 無い | sim-read | sim-read | グラフの推移を読む |
| mon.b.04 アラート | ある | sim-config | editor | アラートの規則（YAML）を書き、昨日の記録で試す |
| devops.b.01 開発と運用 | 無い | sim-order | sim-order | 変更が届くまでの流れ（手渡しを無くす） |
| devops.b.02 自動化 | 無い | sim-config | sim-assign | 自動化する作業を選んで置く |
| devops.b.03 CI/CD と DevOps | 無い | sim-order | sim-order | 流れの一番長い待ちを短くする |
| trouble.b.01 切り分けの型 | ある | sim-config | terminal | curl・systemctl・journalctl で切り分けて直す |
| trouble.b.02 エラーメッセージを読む | ある | terminal | terminal（そのまま） | 本物のコマンド（curl・systemctl・journalctl） |
| trouble.b.03 ログを読む | ある | terminal | terminal（そのまま） | 本物のコマンド（curl・systemctl・journalctl） |
| lab（実装したレッスン無し） | — | — | — | 今の公開範囲にレッスンが無い |

数: 直す前は 画面の操作 56 本（sim-config 27・sim-assign 8・sim-order 8・sim-read 8・sim-connect 5）、端末・編集・SQL 75 本。
直した後の予定は 画面の操作 21 本（sim-assign 9・sim-connect 5・sim-order 3・sim-read 4）、端末・編集・SQL 110 本。sim-config は 0 本にして型ごと消す。

## 共通の作り直し（分野の前に行った）

- 模擬（`src/engines/sim`）: 文の入力で操作する経路（`applyStatement`）を消し、操作を型の決まった形（`SimAction`）で与える `applyAction` にした。画面のドラッグ・ボタンと、テストの最後のヒントの再生が同じ関数を通る
  - 足した計算（単体テストあり）: つなげない理由を線を引く前に返す（`connectProblem`）・送った荷物の道すじと止まる所（`sendRoute`）・並べた流れの止まる段と理由（`orderStop`、札の `stop` と `needs` から）・置き違えた札（`misplaced`）・操作を画面の名前で言う（`describeAction`・`actionNames`）
  - 置く: 別の枠の札を置くと、その枠から移る（ドラッグで枠から枠へ動かせる）。入らない枠と理由（札の `refuse`）・動かせない札（`keep`）を書ける
  - 読み取って答える: 問いには押して選ぶ答えを 2 つ以上必須にした（文を打つ答えを無くした）
- 内容の形: 手順に `actions`（最後のヒントで通る操作）を足した。最後のヒントは「何をどこへ置く・つなぐ・並べる」を日本語で書き、操作に出てくる物の名前が全て書いてあることを検証で確かめる。打つ文（`...`）を書くと落ちる
- 画面（`src/screens/lesson/sim`）: 「文で操作する」欄・「使える操作」の列・操作の文の記録を消した。ドラッグの部品（`drag.ts`。マウスはドラッグだけ、キーボードは Enter で持ち上げて Enter で置く）と、型ごとの盤（`ConnectBoard`・`OrderBoard`・`AssignBoard`）、読む所を押すと拡大する情報（`Panels`）に分けた
- 結果の段の「入れた操作の文」を「画面でした操作」（画面の名前で言い表した物）にした
- 撮影: `tools/scenarios/simDrive.mjs`（手順の actions を本物のマウスのドラッグで行う）と `tools/scenarios/rework.mjs`（実戦の画面を、開いた所・ドラッグの途中・誤った後・終えた後で撮る）
- sim-config は分野ごとに作り直すまで残す（最後のヒントは前の形のまま、操作は actions で通す）。全ての分野を終えたら型ごと消す

## git（2026-10-10）

12 本の実戦が全て端末になり、どれも本物の git（git.i.03 は gh も）で行う。最後のヒントには、どれも git か gh のコマンドがある。

| レッスン | 直す前 | 直した後 | 打つ物 |
|---|---|---|---|
| git.b.01 バージョン管理とは | sim-config（版を選ぶ欄） | terminal | `git log` で日付と説明から版を探して答え、`git restore --source=<記録> plan.txt` で戻す（履歴は残る） |
| git.i.03 GitHub / GitLab とプルリクエスト | sim-config（6 つの欄） | terminal | `gh pr create --base main --head limit --reviewer tanaka` → `gh pr checks`・`gh run view --log-failed` → 直して `git commit`・`git push` → `gh pr edit --add-reviewer`・`gh pr merge` |
| ほかの 10 本 | terminal | terminal（そのまま） | 本物の git |

模擬に足した物（単体テストあり）:

- `git restore --source`（`-s`）: 作業ツリーのファイルを、指した記録の版に戻す。インデックスと履歴は変えない（`git.test.ts`）
- `git merge --no-ff` と `-m`: 早送りできる時も合わせる記録を作る（`gitHistory.test.ts`）
- Pull Request の置き場（`src/engines/github/forge.ts`）: setup の `gitServers[].forge` に、自動の検査（ファイルの中身で成否が決まり、push すると次に見た時に検査し直す）・見る人（説明と検査の結果で、質問・変更を求める・承認を返す）・枝の保護（必須の検査と承認の数）を書ける。依頼と返事は保存から戻しても残る
- `gh pr create / view / checks / edit / merge / list / status` と `gh run view`（`src/engines/kernel/commands/ghForge.ts`）: 今いるリポジトリの origin に置き場がある時は、そこへ向けて打つ（本物の gh と同じ）。取り込みは、サーバの控えで `git merge --no-ff` と `git push` をして、サーバの main に `Merge pull request #N from <枝>` の記録を作る（`ghForge.test.ts`）
- 達成条件 `pr:<枝>><枝>`・`pr-checks:<枝>`・`pr-approved:<枝>`・`remote-merged:<枝>><枝>`（`src/engines/git/check.ts`）
- 直した不具合: 共通の祖先（`mergeBase`）が、合わせる記録の 1 つ目の親から辿って最初に当たった古い祖先を返し、取り込んだ枝の先を見落としていた。共通の祖先のうち、ほかの共通の祖先の祖先ではない物を返すようにした。`isAncestor` は辿れるかで決める（先に失敗するテストを `gitHistory.test.ts` に書いた）

内容: エラーの案内（`content/errors/git.json`）を本物の出力（`is the same as base branch`・`you must first push the current branch`・`is not mergeable`）に合わせ、画面の欄にしか無かった 2 つ（`git-pr-not-fixed`・`git-pr-misread`）を消した。`docs/lessons/git.md` の 2 本の実戦の設計、`docs/curriculum.md` の記号（模 → 端）、目録（`npm run catalog`）を直した。

画面の確かめ（`tools/scenarios/rework.mjs`、1920×1080。最後のヒントのコマンドを本物のキー入力で打った）:

- `rw-git.b.01-start` / `-done`: 原則 1（`git log` の Author・Date・説明と `git restore` が端末に出る）・原則 5（目的の `plan.txt` と端末のファイル名が同じ）を満たす。2 つの段が順に「何が起きたか」付きで達成になる
- `rw-git.i.03-start` / `-done`: 原則 1（`gh pr create`・`gh pr checks` の失敗の行と実行の URL・`gh run view --log-failed` のログ・`git push` の送った範囲・`Merged pull request`）・原則 5（目的の `limit`・`main`・`tanaka`・`reserve.js` が端末に同じ名前で出る）を満たす。3 つの段が全て達成になる
- 原則 3・4 は画面の操作の決まりなので、端末だけの git の分野には当たらない
- 気付いた事（今回は直さない）: 端末の幅を超える長い 1 行（`gh pr create … --body …`）を打つと、折り返しの描き直しで打った行が 2 回見える。前からある端末の表示の癖で、打った中身と結果は正しい

検査: `npm run typecheck`・`npm run lint`・`npm run test`（161 ファイル・1761 件）・`npm run content:check` が通った。

## k8s（2026-10-10）

15 本の実戦が全て本物の kubectl になった（端末 9 本・設定の編集 6 本）。設定の編集の 6 本は、本物の書式のマニフェストを書き、保存すると `setup.edit.apply` の `kubectl apply -f`・`kubectl rollout status`・`kubectl exec` などが本物の書き方で走る（直していない）。

| レッスン | 直す前 | 直した後 | 打つ物 |
|---|---|---|---|
| k8s.b.01 Kubernetes とは・なぜ必要か | sim-config（面倒の見方・数・出来事の欄） | terminal | 手で置いた Pod（web-1〜3）の `node-2` を `kubectl drain`（持ち主が無いと断られ、`--force` で空けると web-2 は戻らない）→ 残りの数 2 を答える → `kubectl uncordon`・`kubectl create deployment web --replicas=3`・もう一度 `kubectl drain` で 3 つが保たれる |
| k8s.b.02 コンテナとの関係 | sim-assign（入れ子の札を置く） | terminal | `kubectl get nodes`（2 台）→ `kubectl get pods -o wide` の NODE（node-1）→ `kubectl describe pod web` の Containers（log-agent）。外側から入れ子を読む |
| ほかの 13 本 | terminal・editor | そのまま | 本物の kubectl・マニフェスト |

模擬に足した物・直した物（単体テストあり）:

- `kubectl drain` を本物の振る舞いにした: 持ち主（controller）の無い Pod があると `cannot delete Pods that declare no controller (use --force to override)`、DaemonSet の Pod があると `--ignore-daemonsets` を求めて止まる（cordon は残る。本物と同じく `node/… cordoned` の行の後に断る）。`--force` で持ち主の無い Pod を消し（誰も作り直さない）、`pod/… evicted` の行を出す（`kubectlOps.test.ts`）。前は、持ち主の無い Pod を警告だけで残して drained と言っていた
- `kubectl get pods -o wide -w` で、見続ける時も IP と NODE の欄を出す（前は `-w` を付けると欄が消えた。`kubectlOps.test.ts`）
- 達成条件 `node/<名前>`: `cordoned`（Pod を置かない印）・`pods`（その Node の上の Pod の数）（`check.test.ts`）
- 模擬の置き場に `fluent/fluent-bit:3.1`（ログを集める付き添いのコンテナ。待ち受けない）を足した

内容: エラーの案内 `k8s-no-controller` を本物の drain の文言に、`k8s-count-not-kept`・`k8s-nesting-mixed` を答えの段に合わせた。`docs/lessons/k8s.md` の 2 本の実戦の設計、`docs/curriculum.md` の記号（模 → 端）、目録を直した。

画面の確かめ（`tools/scenarios/rework.mjs`、1920×1080）:

- `rw-k8s.b.01-start` / `-done`: 原則 1（`kubectl drain` の断り・`--force` の警告・`evicting pod`・`get pods -o wide -w` の NODE の欄・Deployment の Pod が別の Node に作り直される様子が端末に出る）・原則 5（目的の `node-1`〜`node-3`・`web-1`〜`web-3`・`web` が端末に同じ名前で出る）を満たす。3 つの段が全て達成になる
- `rw-k8s.b.02-start` / `-done`: 原則 1（`kubectl get nodes`・`get pods -o wide`・`describe pod web` の Containers の下の `nginx` と `log-agent`）・原則 5（`city-cluster`・`node-1`・`web`・`log-agent`）を満たす。3 つの段が全て達成になる
- 原則 3・4 は画面の操作の決まりなので、端末だけの k8s の分野には当たらない

検査: `npm run typecheck`・`npm run lint`・`npm run test`（161 ファイル・1764 件）・`npm run content:check` が通った。

## docker（2026-10-10）

11 本の実戦が全て本物の docker になった（端末 9 本・設定の編集 2 本。設定の編集は、保存すると本物の `docker build`・`docker compose` などが走る）。

| レッスン | 直す前 | 直した後 | 打つ物 |
|---|---|---|---|
| docker.b.01 Docker とは | sim-read（2 台の結果を読んで押して答える） | terminal | `docker ps` が `Cannot connect to the Docker daemon` で止まる dev-01 で、`docker version`（Client の版は出て Server で止まる）→ `systemctl status docker`・`sudo systemctl start docker` → `docker version`（Engine・containerd・runc）→ `docker info`（Containers 4・Running 3） |
| ほかの 10 本 | terminal・editor | そのまま | 本物の docker |

模擬に足した物・直した物（単体テストあり。`src/engines/docker/info.test.ts`）:

- `docker version`: Client の段（CLI の版）と Server の段（Engine・containerd・runc の版）。本体につながらない時は、本物と同じく Client の段まで出してから断る
- `docker info`: Containers・Running・Paused・Stopped・Images・Server Version ほか
- 本体（Engine）を systemd の `docker` のサービスにつないだ: setup の services に `docker` があれば、止まっている間は docker の命令が `Cannot connect to the Docker daemon` で断られ、`systemctl start docker` で動く。コンテナの記録は止まっている間も残る。`docker` のサービスが無い機械では、前と同じくいつも動いている
- journal の行の機械の名前: 前は、どの機械でも `server` と書いていた。setup の hostname を出すようにした（保存から戻しても残る）

内容: エラーの案内 `docker-engine-misread` を答えの段に合わせた（つながらない時は、前からある `docker-daemon` を使う）。`docs/lessons/docker.md` の実戦の設計、`docs/curriculum.md` の記号（模 → 端）、目録を直した。

画面の確かめ（`tools/scenarios/rework.mjs`、1920×1080）:

- `rw-docker.b.01-start` / `-done`: 原則 1（`docker version` の Client と Server の段・`systemctl`・`docker info` の Running の行が端末に出る）・原則 5（目的の `dev-01`・`Client`・`Server`・`docker version`・`docker info`・`old-web` が端末に同じ名前で出る。journal の行も `dev-01`）を満たす。3 つの段が全て達成になる
- 原則 3・4 は画面の操作の決まりなので、端末だけの docker の分野には当たらない

検査: `npm run typecheck`・`npm run lint`・`npm run test`（162 ファイル・1767 件）・`npm run content:check` が通った。

## linux（2026-10-10）

17 本の実戦が全て端末で、本物の Linux のコマンドで行う。

| レッスン | 直す前 | 直した後 | 打つ物 |
|---|---|---|---|
| linux.b.00 Linux とは | sim-read（サーバの情報画面を読んで押して答える） | terminal | 借りたサーバ `port-web-01` で、`uname`（Linux）→ `cat /etc/os-release` の `NAME`（Ubuntu）→ `uname -r`（カーネルの版 6.8.0）と `VERSION_ID`（配布物の版 24.04）を比べて答える |
| ほかの 16 本 | terminal | そのまま | 本物の Linux のコマンド |

模擬に足した物（単体テストあり。`misc.test.ts`）:

- `uname`（`-s`・`-n`・`-r`・`-v`・`-m`・`-p`・`-i`・`-o`・`-a`。並べて書ける）: カーネルの版は、本物と同じく `/proc/sys/kernel/osrelease` から読む。機械の名前は HOSTNAME

内容: エラーの案内 `linux-version-mixup` を、`uname -r` と `/etc/os-release` の取り違えに合わせた。`docs/lessons/linux.md` の実戦の設計、`docs/curriculum.md` の記号（模 → 端）、目録を直した。

画面の確かめ（`tools/scenarios/rework.mjs`、1920×1080）:

- `rw-linux.b.00-start` / `-done`: 原則 1（`uname`・`uname -r`・`cat /etc/os-release` の本物の中身）・原則 5（目的の `port-web-01` がプロンプトに、`VERSION_ID`・`NAME` が端末の行に同じ名前で出る）を満たす。3 つの段が全て達成になる
- 原則 3・4 は画面の操作の決まりなので、端末だけの linux の分野には当たらない

検査: `npm run typecheck`・`npm run lint`・`npm run test`（162 ファイル・1768 件）・`npm run content:check` が通った。

## web（2026-10-14）

14 本の実戦が全て本物の道具になった（端末 11 本・設定の編集 3 本）。端末はどれも `curl`（web.b.07・web.b.08 は Web サーバの機械で curl と systemctl など）、設定の編集は本物の nginx の書式で、保存すると `nginx -t`・`systemctl reload nginx`・`curl` が走る。

| レッスン | 直す前 | 直した後 | 打つ物・書く物 |
|---|---|---|---|
| web.b.01 URL の組み立て | sim-config（部品を選ぶ欄） | terminal | `curl https://shop.example:8443/items`（4 件）→ `curl "https://shop.example:8443/items?id=3"`（灯台の模型）。ポートを書かないと 443 で断られ、http にすると `plain HTTP request was sent to HTTPS port` |
| web.b.06 Cookie とセッション | sim-config（範囲と印の欄） | terminal | 店のサーバ `shop-web` で `curl -i -c cookies.txt -d 'user=minato&pass=harbor' https://shop.example/login` の `Set-Cookie`（`path=/login`）と `curl -b cookies.txt …/cart`（ログインしてください）を読む → `php.ini` の `session.cookie_path` を `/` に直して `systemctl restart apache2`、ログインし直して `/orders`（3 件）→ `session.cookie_secure`・`session.cookie_httponly` を On にして、返事が `Set-Cookie: PHPSESSID=…; path=/; secure; HttpOnly` |
| web.i.04 キャッシュ | sim-config（2 つの欄） | editor | `/etc/nginx/conf.d/port.conf` の `location /` に `add_header Cache-Control "no-cache";`、`location /images/` に `"max-age=31536000"`。保存の後の `curl -sI` で見出しを確かめる |
| web.i.05 CORS | sim-config（許可の欄） | editor | `/etc/nginx/conf.d/api.conf` の `location /` に `add_header Access-Control-Allow-Origin https://shop.example;`。保存の後に `curl -si -H 'Origin: https://shop.example'` と `-H 'Origin: https://evil.example'` で頼み、どちらにも同じ値が返る（止めるのはブラウザ）ことを見る |
| ほかの 10 本 | terminal・editor | そのまま | 本物の curl・nginx の設定 |

模擬に足した物（単体テストあり）:

- Cookie の模型（`src/engines/http/cookies.ts`・`cookies.test.ts`）: Set-Cookie を読み（Path が無ければ頼んだ道のディレクトリ）、名前・Path（RFC 6265 の path-match）・Secure が合う札だけを付ける。札の入れ物は curl と同じ Netscape の形（HttpOnly は行頭に `#HttpOnly_`）
- curl の `-b`・`--cookie`（`名前=値` ならそのまま、無ければ入れ物のファイル。無いファイルは黙って空）と `-c`・`--cookie-jar`（`-` なら標準出力）。`-b` か `-c` で札を覚える働きが動き、転送（`-L`）の次の頼みにも付ける。`-v` は `> Cookie:` と `* Added cookie …` を出す。Secure の札は http の頼みからは受け取らない（手元の名前は除く）
- ログインを覚えるアプリ（`src/engines/http/session.ts`・`session.test.ts`）: setup の services に `session` を書く。本物の PHP と同じく php.ini の `session.name`・`session.cookie_path`・`session.cookie_secure`・`session.cookie_httponly` を、アプリを動かした時に読む（直しても再起動するまで前の決まり）。Set-Cookie は PHP と同じ形
- 手元の Web サーバと後ろのアプリに、付けた札と送った中身（`-d`）を渡す（nginx の中継も通す）
- 達成条件 `http` に `header`（返事の見出し。名前の大文字・小文字は問わず、値は同じ）・`method`・`data` を足した（`docs/content-spec.md` 2.4）

内容: エラーの案内を本物の出力に当てた（`content/errors/web.json`）。`web-cookie-login`（401 の文）・`web-cookie-misread`（範囲を答え違えた）・`web-cookie-scope`（`ログインしてください` が出た）・`web-cookie-flags`（Set-Cookie に印が足りない）・`web-cache-mismatch`（HTML の Cache-Control が長い・no-store・無い）・`web-cache-image`（画像の Cache-Control が no-store・no-cache・短い）・`web-cors-origin`（`Access-Control-Allow-Origin` が自分の画面の送り元と違う）。どれも出力に当たる案内（`output`）で、誤った設定を保存・実行して当たることを試し台で確かめた。`docs/lessons/web.md` の 4 本の実戦の設計、`docs/curriculum.md` の記号（模 → 端・編）、目録を直した。

画面の確かめ（`tools/scenarios/rework.mjs`、1920×1080。最後のヒントのコマンドを本物のキー入力で打ち、設定の編集は最後のヒントの中身を保存した）:

- `rw-web.b.01-start` / `-done`: 原則 1（`curl` と JSON の返事）・原則 5（目的の `shop.example`・`8443`・`/items`・`id` が端末に同じ名前で出る）を満たす。2 つの段が達成になる
- `rw-web.b.06-start` / `-done`: 原則 1（`curl -i` の `Set-Cookie` の行・`sed -i`・`systemctl restart apache2`・注文の履歴の中身）・原則 5（目的の `shop-web` がプロンプトに、`shop.example`・`/cart`・`/orders`・`cookies.txt`・`php.ini`・`session.cookie_path`・`apache2` が端末に同じ名前で出る）を満たす。3 つの段が全て達成になる
- `rw-web.i.04-start` / `-done`: 原則 1（nginx の設定の `add_header`・`nginx -t` の結果・`curl -sI` の `Cache-Control` の行）・原則 5（目的の `port.example`・`index.html`・`/images/`・`logo.v3.png` が設定の注釈と確かめた結果に出る）を満たす。2 つの段が達成になる
- `rw-web.i.05-start` / `-done`: 原則 1（`add_header Access-Control-Allow-Origin`・`curl -si -H 'Origin: …'` の返事の見出し）・原則 5（目的の `https://api.example`・`https://shop.example`・`https://evil.example` が設定の注釈と確かめた結果に出る）を満たす。1 つの段が達成になる
- 原則 3・4 は画面の操作の決まりなので、端末と設定の編集だけの web の分野には当たらない

検査: `npm run typecheck`・`npm run lint`・`npm run test`（163 ファイル・1780 件。試し台を除く）・`npm run content:check` が通った。

## net（2026-10-14）

14 本の実戦のうち、本物の道具がある 12 本が端末（10 本）と設定の編集（2 本）になった。打つコマンドが無い概念の 2 本（net.b.01 LAN と WAN の配線・net.b.02 層への仕分け）は、画面の操作（つなぐ・置く）のまま。

| レッスン | 直す前 | 直した後 | 打つ物・書く物 |
|---|---|---|---|
| net.b.01 ネットワークとは | sim-connect | sim-connect（そのまま） | 確かめるボタンを「ping 支店のプリンタ」「ping 本社のサーバ」にした（本物の道具の名をボタンに出す） |
| net.b.03 IP アドレスとサブネット | sim-config（4 つの欄） | terminal | `pc4` で `ip addr`・`ping`（`Network is unreachable`）から網の住所（192.168.1.0/24）を答える → `ip addr del`・`add` で 192.168.10.14/24 → `ip -n pc3 addr` で打ち間違い（192.168.20.13）を直す（`Destination Host Unreachable`） |
| net.b.04 ポート | sim-assign | terminal | `web-02` で `ss -tlnp`・`curl http://localhost/` から nginx の番号（8080）を答える → `listen 80;` にし、80 番を持つ古い `preview` を `systemctl stop`・`disable` して nginx を動かし直す（`Address already in use`）→ `sshd_config` の `Port 22`・`systemctl restart ssh` |
| net.b.05 TCP と UDP | sim-read | terminal | `city-svc` で `ss -tulnp` の `Netid` から asterisk の番号（UDP 5060）→ 音声が UDP を使う理由（遅れる）→ sshd の決まり（tcp）を答える |
| net.b.08 DHCP | sim-config（範囲の欄） | editor | `/etc/dhcp/dhcpd.conf` の `range` を直す。保存すると `dhcpd -t -q`・`systemctl restart isc-dhcp-server`・`dhcp-lease-list`・`grep -B3 abandoned` が走る |
| net.i.01 経路とデフォルトゲートウェイ | sim-config（経路表） | terminal | `traceroute` の `!N`・`ping` の `Destination Net Unreachable` から止めたルータ（10.0.1.1）を答える → `ip -n r1 route add` → `ip netns exec srv-c ping` で帰り道の欠けを見つけ `ip -n r2 route add` |
| net.i.02 NAT | sim-config（転送の表・欄） | terminal | ルータ `gw` で `iptables -t nat -L PREROUTING` から誤った転送先（192.168.1.11）を答える → `-t nat -D`・`-A … -j DNAT --to-destination 192.168.1.10:443` → `-L FORWARD -v` を読み `-A FORWARD -p tcp -d 192.168.1.10 --dport 443 -j ACCEPT`、`ip netns exec outside curl` で店のページ |
| net.i.03 ファイアウォール | sim-order（札の並べ替え） | terminal | `web-01` で `iptables -L INPUT -n --line-numbers`・`ip netns exec outside nmap` から 443 を止める規則の番号（5）を答える → `-D`・`-I` で 443 を DROP より上へ → 誰でもの 22 を消し `-s 10.0.0.0/8` の 22 を入れる（outside から filtered、office-pc から open） |
| net.i.05 DNS レコード | sim-config（レコードの表） | editor | `/etc/bind/db.shop.example` に `www IN CNAME shop.example.`・`@ IN MX 10 mail.shop.example.` を書く。保存すると `named-checkzone`・`systemctl reload named`・`dig www.shop.example`・`dig MX shop.example` が走る |
| net.i.06 ネットワークを分ける | sim-config（8 つの欄） | terminal | `ip netns exec sw bridge vlan add dev port6 vid 20 pvid untagged`・`del … vid 10`（port7 は 30）→ `ip netns exec guest nmap` でまだ見えることを確かめ、`gw` で `iptables -A FORWARD -i eth3 -o eth1・-o eth2 -j DROP` |
| ほかの 3 本 | terminal・sim-assign | そのまま | net.b.06・net.b.07・net.i.04 は本物の道具、net.b.02 は層への仕分け（原則 2 の例） |

模擬に足した物・直した物（単体テストあり）:

- 網の setup: スイッチ（`kind: switch`・`ports`・口ごとの `vlans`）、機器ごとの iptables の規則（`firewall`。iptables の引数の行）（`netClient.test.ts`・`firewall.test.ts`）
- `ip netns exec 機器 コマンド`・`ip netns list`（機器ごとを本物の netns に見立てる）。`ip route add … via X` は dev を省くと同じ網の口を使い、無ければ `Nexthop has invalid gateway`
- 経路の無いルータは、本物と同じく `Destination Net Unreachable` で知らせる（`ping` の `From ルータ`・`traceroute` の `!N`・`curl` の `Network is unreachable`）。自分の網で ARP に誰も答えなければ `Destination Host Unreachable` と `+N errors`
- iptables の模型（`src/engines/net/firewall.ts`）: filter（INPUT・FORWARD・OUTPUT）と nat（PREROUTING の DNAT・POSTROUTING）、`-A`・`-I`・`-D`（番号・規則）・`-F`・`-P`・`-L`（`--line-numbers`・`-v`）・`-S`、条件 `-p`・`--dport`・`-s`・`-d`・`-i`・`-o`・`-m conntrack --ctstate`。荷物を運ぶ所（`deliver`）で、入ってきた口を見て DNAT と鎖を当てる。返事の荷物は ESTABLISHED で、状態の規則に当たる（状態の規則が無く方針が DROP なら、返事も止まる）。誤りは本物の文（`unknown option "--dport"`・`Index of deletion too big.` など）。root でなければ断る
- `nmap -p 番号,番号 相手`: open（届いて待っている）・closed（拒否の返事）・filtered（止められて返事が無い）
- VLAN を絞るスイッチ（Linux のブリッジの vlan_filtering）: 口ごとの PVID とメンバー。`bridge vlan add dev 口 vid N [pvid] [untagged]`・`del`・`show`（本物の形）。前からの書き方 `dev スイッチ:口` はそのまま使える
- DNS: ゾーンの全てのレコードを持ち、`dig 名前 種類`（A・CNAME・MX・TXT・NS・SOA など）で答える。別名は本物と同じく先を辿って並べる（`+short` も）。`named-checkzone`（知らない種類・A の値・MX の優先度・CNAME と他の同居・SOA が要る）と同じ確かめをし、誤りのあるゾーンは読み込まない（前の答えのまま）
- DHCP のサーバ（`src/engines/net/dhcp.ts`）: ISC dhcpd の設定（`subnet … { range …; }`）を動かす時に読み、待っている機械に範囲の小さい方から貸す。使われているアドレスは借りた機械が断り（`DHCPDECLINE`）、サーバは捨てる（`abandoned`）。尽きると `no free leases`。本物の形のリースのファイルに書く。`dhcpd -t [-q] -cf`・`dhcp-lease-list`
- `ss` の `-u`（UDP の待ち受けは `UNCONN`）と `Netid` の欄、プログラムの名前（ssh のサービスの `sshd` など）。設定ファイルの行から待ち受けるポートを読むサービス（`sshd_config` の `Port`。動かし直すまで前の番号）
- `grep` の `-A`・`-B`・`-C`（離れた組の間は `--`）。`systemctl status` は最後の 10 行の記録を添える（本物の既定）
- 達成条件: `service` の `listen`、`net` の `reach … from 機器`・`route 機器 宛先 via 次`・`record 名前 種類 値`・`dnat 機器 ポート 先`
- net.b.06 のゾーンファイルに SOA と NS を足した（本物の named は SOA の無いゾーンを読み込まない）。`dig +short www.shop.example` は、本物と同じく別名の先（`shop.example.`）も出す

内容: エラーの案内（`content/errors/net.json`）を本物の出力に当てた（`Network is unreachable`・`Destination Host Unreachable`・`Destination Net Unreachable`・`Address already in use`・`NXDOMAIN`/`ANSWER: 0`・`not loaded due to errors`・`binding state abandoned`・`Configuration file errors encountered`・`Connection timed out`・iptables の誤りの文・nmap の `open`/`filtered` など）。用語集に `iptables` を足した。`docs/lessons/net.md` の 10 本の実戦の設計、`docs/curriculum.md` の記号（模 → 端・編）、目録を直した。

画面の確かめ（`tools/scenarios/rework.mjs`、1920×1080。端末は最後のヒントのコマンドを本物のキー入力で打ち、設定の編集は最後のヒントの中身を保存した。画面の操作は本物のマウスのドラッグ）:

- `rw-net.b.01-start` / `-drag` / `-wrong` / `-done`: 原則 3（部品から部品へドラッグして線を引く。押して送るボタンは「ping 支店のプリンタ」のように何をするかが文字で分かる）・原則 4（つないだ線に光の粒が流れる。つなげない組み合わせは線が引けず、赤い印の付いた理由が 1 行出る。届いた道すじが下に出る）・原則 5（目的の「支店の LAN」「本社のサーバ」「WAN」が部品の名前に同じ名前で出る）を満たす。2 つの段が達成になる
- `rw-net.b.02-start` / `-drag` / `-done`: 原則 3（札を持ち上げて枠へ運ぶ）・原則 4（ドラッグ中は受け口の枠が光り、入れた札は枠の中に移る。置き違えは全て置いた時に赤く示す）・原則 5（目的の「5 つの症状」と層の名前が札と枠に出る）を満たす
- 端末・設定の編集の 9 本（`rw-net.b.03`・`b.04`・`b.05`・`b.08`・`i.01`・`i.02`・`i.03`・`i.05`・`i.06` の `-start` / `-done`）: 原則 1（`ip`・`ping`・`traceroute`・`ss`・`systemctl`・`dhcpd`・`dhcp-lease-list`・`named-checkzone`・`dig`・`iptables`・`bridge vlan`・`nmap`・`curl` の本物の出力が出る）・原則 5（目的の機械の名前（`pc4`・`web-02`・`city-svc`・`office-gw`・`pc-a`・`gw`・`web-01`・`files`・`guest`）・口（`eth0`・`eth3`・`port6`）・アドレスが、プロンプトと出力に同じ名前で出る）を満たす。全ての段が達成になる

検査: `npm run typecheck`・`npm run lint`・`npm run test`（165 ファイル・1800 件。試し台を除く）・`npm run content:check` が通った。

## db（2026-10-14）

5 本の実戦が全て、ブラウザ内の SQLite で本物の SQL を実行する形になった。

| レッスン | 直す前 | 直した後 | 実行する物 |
|---|---|---|---|
| db.b.01 データベースとは | sim-config（記録先と残りの欄） | sql | DB に移したのに、窓口が自分で計算した数を書いて（`SET remaining = 4`）食い違った残りを、`SELECT * FROM tickets`・`SELECT COUNT(*) FROM sales` で調べて本当の残り（3）を答える → `UPDATE tickets SET remaining = 3 WHERE id = 1` → `BEGIN; UPDATE tickets SET remaining = remaining - 1 …; INSERT INTO sales …; COMMIT;` を窓口ごとに実行し、残り 1・記録 4 で合う |
| ほかの 4 本 | sql | そのまま | 本物の SQL |

模擬は足していない（SQLite の 1 行に複数の文とトランザクションを書ける）。用語集に `transaction`（トランザクション）を足した。エラーの案内 `db-remain-misread`・`db-file-still` を新しい段に合わせた。`docs/lessons/db.md` の実戦の設計、`docs/curriculum.md` の記号（模 → S）、目録を直した。

画面の確かめ（`tools/scenarios/rework.mjs`、1920×1080。最後のヒントの SQL を入力欄に入れて実行した）:

- `rw-db.b.01-start` / `-done`: 原則 1（`SELECT`・`COUNT(*)`・`UPDATE`・`BEGIN … COMMIT` と、その結果の表）・原則 5（目的の `tickets`・`sales`・`remaining`・窓口 1・窓口 2 が、表の一覧と結果に同じ名前で出る）を満たす。3 つの段が全て達成になる
- 原則 3・4 は画面の操作の決まりなので、SQL だけの db の分野には当たらない

検査: `npm run typecheck`・`npm run lint`・`npm run test`（165 ファイル・1800 件。試し台を除く）・`npm run content:check` が通った。

## found（2026-10-15）

8 本の実戦のうち、本物の道具がある 4 本が端末（found.b.04〜b.06 は前から、found.b.08 を作り直した）になった。打つコマンドが無い概念の 4 本（found.b.01 部品の配線・found.b.02 メモリとストレージの役割分担・found.b.03 OS の資源の割り振り・found.b.07 網の全体像の配線）は、画面の操作（つなぐ・置く）のまま、原則 3〜5 に合わせて直した。

| レッスン | 直す前 | 直した後 | 打つ物・直した所 |
|---|---|---|---|
| found.b.08 2 進数・文字コード・データ量 | sim-config（読む文字コードの欄） | terminal | 市役所の機械 `city-hall` に古い機械から届いた `matsuri.txt`（Shift_JIS）を `cat` すると化ける → `file`（`Non-ISO extended-ASCII text`）・`nkf -g` で `Shift_JIS` と答える → `iconv -f SHIFT_JIS -t UTF-8 matsuri.txt > matsuri-utf8.txt` → `xxd -b -l 2`・`-l 3` で「こ」の 0 と 1（`10000010 10110001` と `11100011 10000001 10010011`）を見比べ、UTF-8 の「こ」が 3 バイトと答える |
| found.b.07 ネットワークとインターネットの全体像 | sim-connect | sim-connect（そのまま） | 確かめるボタンを「ping 家のもう 1 台」「ping サーバ」にした（本物の道具の名をボタンに出す） |
| found.b.03 OS の役割 | sim-assign | sim-assign（そのまま） | 音楽が使っている「メモリ 1 番」に動かせない理由（`keep`）を書いた。前は、共通の作り直しで札が枠から枠へ移るようになってから、使用中のメモリを黙って別のアプリへ移せてしまい、取り合いのエラー（`os-conflict`）が出なくなっていた。今は、ドラッグすると枠が赤く光り「使っている最中」の理由が出る |
| found.b.01・found.b.02 | sim-connect・sim-assign | そのまま | b.02 の想定エラーから、今の模擬では出ない `sim-taken` を外した |
| found.b.04〜b.06 | terminal | terminal（そのまま） | 本物の Linux のコマンド |

模擬に足した物・直した物（単体テストあり）:

- ファイルの 0 と 1（`src/engines/kernel/bytes.ts`・`bytes.test.ts`）: 中身は文字列のまま持ち、UTF-8 として読めないバイトは 1 バイトを U+DC80〜U+DCFF の 1 文字に置く（Python の surrogateescape と同じ考え）。パイプ・cp・保存を通しても元のバイトに戻る。文字コードは UTF-8・SHIFT_JIS（SJIS・CP932 ほかの別名）・EUC-JP・ASCII。Shift_JIS と EUC-JP の表は、ブラウザの読み方（`TextDecoder`）から初めて使う時に作る（新しい依存は足していない）
- setup の `encodings`（場所 → `SHIFT_JIS`・`EUC-JP`）: `files` の中身を、その文字コードの 0 と 1 で置く（古い機械から届いたファイル）
- `file`（`ASCII text`・`Unicode text, UTF-8 text`・`Non-ISO extended-ASCII text`・`ISO-8859 text`・`with no line terminators`・`with CRLF line terminators`・シェルと Python のスクリプト・`-i`・`-b`・`--mime-encoding`。名前を揃えて並べる）・`iconv`（`-f`・`-t`・`-o`・`-l`。読めない所は `illegal input sequence at position N` で止まり、そこまでは書き出す。知らない名前は本物の glibc の文で断る）・`nkf`（`-g`・`--guess`（改行の形も添える）・`-w`・`-s`・`-e`）・`xxd`（16 進数・`-b`・`-l`・`-s`・`-c`・`-g`・`-p`・`-u`）（`src/engines/kernel/commands/encoding.ts`・`encoding.test.ts`）
- 直した不具合: `wc -c` が UTF-16 の数（日本語 1 文字を 1）で数えていた。本物と同じくバイトで数え、文字を数える `-m` を足した。ファイルの大きさ（`ls -l` など）も同じ数え方にした（先に失敗するテストを `linuxCli.test.ts` に書いた）
- 端末の表示: 読めないバイトは 1 バイトを `?` の 1 文字で出す。初めは `�`（U+FFFD）で出したが、撮影で、多くの書体に `�` が無く代わりの書体の幅の広い字（13.6px。升目は 8.4px）で描かれて隣と重なり、読めなかった
- 置くの盤（`AssignBoard`）: 容量のある枠の単位が揃っていれば、札の大きさに単位を付ける（「2」→「2 GB」）
- 撮影の台本（`tools/scenarios/simDrive.mjs` の `wrongAction`）: 置くの誤りは、動かせない札を別の枠へ動かすか、容量を超える札を入れる（前は、既に入っている枠へもう一度入れる操作を選び、何も起きない画面を撮っていた）

内容: エラーの案内（`content/errors/found.json`）の `found-mojibake` を、本物の出力と答えに当てた `found-encoding-misread`・`found-iconv-illegal`（`iconv: illegal input sequence at position`）・`found-iconv-unknown`（`iconv: conversion from`）・`found-bytes-misread` にした。`os-conflict` を `keep` の文に当てた。用語集に `iconv`・`xxd` を足した。`docs/lessons/found.md` の実戦の設計（b.03・b.07・b.08）、`docs/curriculum.md` の記号（模 → 端）、目録を直した。

画面の確かめ（`tools/scenarios/rework.mjs`、1920×1080。端末は最後のヒントのコマンドを本物のキー入力で打った。画面の操作は本物のマウスのドラッグ）:

- `rw-found.b.08-start` / `-mid` / `-done`: 原則 1（`cat` の化けた行・`file` の `Non-ISO extended-ASCII text`・`nkf -g` の `Shift_JIS`・誤った `-f` の `iconv: illegal input sequence at position 0`（赤）・`xxd` の 16 進数と読める文字・`iconv` の後の読める本文・`xxd -b` の 0 と 1）・原則 5（目的の `matsuri.txt`・`matsuri-utf8.txt`・「こ」・`-f`・`-t` が端末に同じ名前で出る）を満たす。誤った答え（`UTF-8`）には `found-encoding-misread` の案内が出る。3 つの段が全て達成になる
- `rw-found.b.01-start` / `-drag` / `-wrong` / `-done`: 原則 3（部品から部品へドラッグして線を引く。ボタンは「「2+3」を打つ」「結果を記憶に残す」）・原則 4（つないだ線に光の粒が流れる。キーボードから画面へは線が引けず、赤い印の理由が出る。届いた道すじが出る）・原則 5（目的の入力・処理・出力・記憶が部品の名前の下に出る）を満たす。2 つの段が達成になる
- `rw-found.b.02-start` / `-drag` / `-wrong` / `-done`: 原則 3（札を持ち上げると受け口の枠が光る）・原則 4（入れると枠の数とメーターが動き、かかる時間の合計が動く。去年の動画を作業机へ入れると、枠が赤く光り「入りきらない（容量 4GB、入れると 8GB）」が出る）・原則 5（目的の作業机（メモリ）・倉庫（ストレージ）が枠の名前に出る）を満たす。2 つの段が達成になる
- `rw-found.b.03-start` / `-drag` / `-wrong` / `-done`: 原則 3・4（「メモリ 1 番」をブラウザへドラッグすると、ブラウザの枠が赤く光り「音楽が使っている最中」の理由が出て、札は音楽に残る）・原則 5（目的のブラウザ・表計算・音楽・メモリ 1 番〜4 番が枠と札に出る）を満たす。2 つの段が達成になる
- `rw-found.b.07-start` / `-drag` / `-wrong` / `-done`: 原則 3（ボタンは「ping 家のもう 1 台」「ping サーバ」）・原則 4（光の粒・引けない線の赤い理由・届いた道すじ「パソコン → ルータ → プロバイダ → インターネット → サーバ」）・原則 5（目的のパソコン・サーバ・ルータ・プロバイダが部品の名前に出る）を満たす。2 つの段が達成になる
- 残した事: `sim-taken`（`content/errors/found.json`）は今の模擬では出ないが、mon.b.01 が想定エラーに書いているので、mon の分野で直す

検査: `npm run typecheck`・`npm run lint`・`npm run test`（167 ファイル・1821 件。試し台を除く）・`npm run content:check` が通った。
