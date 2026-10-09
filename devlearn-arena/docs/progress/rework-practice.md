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
