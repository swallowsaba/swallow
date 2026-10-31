# 残り 80 本のレッスンを書き起こす（EXPAND-SCOPE.txt）

記録を始めた日: 2026-10-31

初回公開の範囲（`docs/decisions.md` Q-04）を `docs/curriculum.md` の 211 本すべてに広げ（Q-04 の決着）、残る 80 本を、既にある 131 本と同じ品質で書き起こして同じ確認を通す。
この文書は、どこまで終わったかの記録でもある。続きは「進み」の表の一番上の「未着手」の分野から。

## 対象（80 本）

`docs/curriculum.md` の目録（`content/catalog.json` の 211 本）から、`content/lessons/` に既にある 131 本を除いた物。数は 80 本で `EXPAND-SCOPE.txt` と合う。

| 難易度 | 分野 | 本数 | ID |
|---|---|---|---|
| 中級 | found | 3 | found.i.01〜03 |
| 中級 | sec | 5 | sec.i.01〜05 |
| 中級 | cicd | 5 | cicd.i.01〜05 |
| 中級 | db | 5 | db.i.01〜05 |
| 中級 | mon | 4 | mon.i.01〜04 |
| 中級 | cloud | 4 | cloud.i.01〜04 |
| 中級 | devops | 3 | devops.i.01〜03 |
| 中級 | trouble | 3 | trouble.i.01〜03 |
| 中級 | lab | 2 | lab.i.01〜02 |
| 上級 | linux | 4 | linux.a.01〜04 |
| 上級 | net | 4 | net.a.01〜04 |
| 上級 | web | 3 | web.a.01〜03 |
| 上級 | sec | 4 | sec.a.01〜04 |
| 上級 | git | 3 | git.a.01〜03 |
| 上級 | cicd | 3 | cicd.a.01〜03 |
| 上級 | ctr | 2 | ctr.a.01〜02 |
| 上級 | docker | 3 | docker.a.01〜03 |
| 上級 | k8s | 4 | k8s.a.01〜04 |
| 上級 | db | 3 | db.a.01〜03 |
| 上級 | cloud | 2 | cloud.a.01〜02 |
| 上級 | mon | 2 | mon.a.01〜02 |
| 上級 | devops | 2 | devops.a.01〜02 |
| 上級 | trouble | 3 | trouble.a.01〜03 |
| 上級 | found | 1 | found.a.01 |
| 上級 | lab | 3 | lab.a.01〜03 |
| **計** | | **80** | 中級 34・上級 46 |

`EXPAND-SCOPE.txt`【2】の中級の並び（found・sec・cicd・db・mon・cloud・devops・trouble）に lab が無いが、中級 34 本には lab.i.01・lab.i.02 が入る（32 + 2）。lab の中級は、総合演習 1〜2 として trouble の中級の後（`docs/curriculum.md` 2 章の 14）に置く。

## 進み

範囲は、書き終えた分野を 1 つずつ足す（`src/content/catalog.ts` の `RELEASE_INTERMEDIATE`・`RELEASE_ADVANCED`）。

| 段 | 分野 | 状態 |
|---|---|---|
| 【1】決着 | — | 終わり（`docs/decisions.md` の「Q-04 の決着」・Q-04 の行・`docs/development-plan.md` の Phase 10） |
| 中級 | found | 終わり（3 本。下の「中級 found」） |
| 中級 | sec | 終わり（5 本。下の「中級 sec」） |
| 中級 | cicd | 終わり（5 本。下の「中級 cicd」） |
| 中級 | db | 終わり（5 本。下の「中級 db」） |
| 中級 | mon | 終わり（4 本。下の「中級 mon」） |
| 中級 | cloud | 終わり（4 本。下の「中級 cloud」） |
| 中級 | devops | 終わり（3 本。下の「中級 devops」） |
| 中級 | trouble | 終わり（3 本。下の「中級 trouble」） |
| 中級 | lab | 終わり（2 本。下の「中級 lab」） |
| 上級 | linux | 終わり（4 本。下の「上級 linux」） |
| 上級 | net | 終わり（4 本。下の「上級 net」） |
| 上級 | web | 終わり（3 本。下の「上級 web」） |
| 上級 | sec | 終わり（4 本。下の「上級 sec」） |
| 上級 | git | 終わり（3 本。下の「上級 git」） |
| 上級 | cicd | 終わり（3 本。下の「上級 cicd」） |
| 上級 | ctr | 終わり（2 本。下の「上級 ctr」） |
| 上級 | docker | 終わり（3 本。下の「上級 docker」） |
| 上級 | k8s | 終わり（4 本。下の「上級 k8s」） |
| 上級 | db | 終わり（3 本。下の「上級 db」） |
| 上級 | cloud | 終わり（2 本。下の「上級 cloud」） |
| 上級 | mon | 終わり（2 本。下の「上級 mon」） |
| 上級 | devops | 終わり（2 本。下の「上級 devops」） |
| 上級 | trouble | 未着手 |
| 上級 | found | 未着手 |
| 上級 | lab | 未着手 |
| 【5】211 本の通しの確認 | — | 未着手 |

## 分野ごとの記録

### 中級 found（3 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong | verify-drag |
|---|---|---|---|---|---|
| found.i.01 メモリ不足とスワップ | 端（free・ps・kill） | 合格 | 合格（2 通り） | 合格 | — |
| found.i.02 プロセス・スレッド・並行 | 模（並べる） | 1 回目 不合格 → 合格 | 1 回目 不合格 → 合格（2 通り） | 1 回目 不合格 → 合格 | 合格 |
| found.i.03 仮想化の考え方 | 模（置く） | 合格 | 合格（2 通り） | 合格 | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| found.i.02 の verify-all（実戦で札を置き場へ運べない） | 台本の誤り: 並行に並べる板では、札を持ち上げると段の間に「ここに新しい段」の受け口が開き、置き場が下へずれる。台本は持ち上げる前に受け口の場所を測っていた | `tools/scenarios/simDrive.mjs` の `dragTo` で、受け口の場所を持ち上げた後に測る（人はずれた先を見て運ぶ） |
| found.i.02 の verify-all（札が 10 枚・段が 9 つで、置き場が窓の外へ出る） | 書き起こしの誤り: 鍵を取る・返すを別の札にし、鍵を使わない札も置いたので、板が窓より高くなった。人も、巻きながら運ぶ形になる | 鍵を取る・返すを読む・書くの札に含め（「鍵を取って在庫を読む」「1 減らして書き、鍵を返す」）、鍵を使わない昨日の流れは「昨日の記録」として示す。札 6 枚・段 5 つ。設計（`docs/lessons/found.md`）の目的と達成は変わらない |
| found.i.02 の verify-free・verify-wrong（下の段から置く別解が通らない） | 別解の誤り: 並行の板では、並んだ札の上に落とすと同じ段に入る。下の段から置く（`dropOrder: "reverse"`）は 1 列の並びだけの書き方 | 別解を「1 人ずつ順に並べる」と「初めから 2 人とも鍵を使う並び」にした |

設計を直した物: found.i.01 の実戦を「模」から「端」にした（`REWORK-PRACTICE.txt` 原則 1。メモリとプロセスには本物の道具 free・ps・kill がある）。`docs/lessons/found.md` と `docs/curriculum.md` の表を先に直した。

模擬環境に足した物（テストを先に書いた。`src/engines/kernel/commands/proc.test.ts`）:
- 積んでいるメモリとスワップ（setup の `memory: { total, swap }`）。プロセスの使用量の合計がメモリを超えた分をスワップに置き、`free` の `Swap:` の行と `top` の頭の `MiB Swap:` の行に出す（スワップの無い機械は前と同じ出力）
- `ps` の `--sort`（`-%mem`・`-rss`・`-%cpu`・`pid` など本物の鍵の名前。先頭の `-` は多い順）

### 中級 sec（5 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong | verify-drag |
|---|---|---|---|---|---|
| sec.i.01 証明書の検証と連鎖 | 端（curl・openssl・nginx） | 合格 | 合格（2 通り） | 合格 | — |
| sec.i.02 Web サーバに TLS を設定する | 端（openssl・chmod・nginx） | 合格 | 合格（2 通り） | 合格 | — |
| sec.i.03 脆弱性とは（代表例） | S（SQL） | 合格 | 合格（2 通り） | 合格 | — |
| sec.i.04 最小権限 | 端（ps・useradd・sed・systemctl・chown） | 合格 | 合格（2 通り） | 合格 | — |
| sec.i.05 秘密情報の保管と受け渡し | 端（cat・sed・systemctl・curl） | 合格 | 合格（2 通り） | 合格 | — |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| 別解 `cat 鍵 \| sudo tee -a ファイル` が通らない（sec.i.05） | 模擬の不具合: `sudo` が前のコマンドの出力を渡していなかった | `sudo` が標準入力を渡す（テストを先に書いた。`serviceUser.test.ts`） |
| 別解 `sudo sed -i '/^User=/c User=report' …` が enoent で失敗（sec.i.04） | 模擬の不具合: `sudo` が空白を含む引数を分け直していた | `sudo` が分けた引数のまま渡す（同） |
| `sudo sh -c '…'` が `sh: -c: No such file` で失敗 | 模擬に無かった: `sh -c` | `sh`・`bash` の `-c` を足した（同） |
| `id -Gn` の終了の状態が 1 になった（既存のテストで発見） | 足した誤り: `id` の居ない利用者の判定で、オプションを利用者の名前と見た | 名前は `-` で始まらない物だけにした |
| 秘密情報の検査が 6 件（形だけの鍵の頭の行） | 模擬の nginx が読む鍵のファイルの形を、ソースとテストに書いたため。本物の鍵ではない | `tools/secret-scan.mjs` の `ALLOW` に、場所と理由を書いて外した |

設計を直した物: sec.i.01 を「模」から「端」、sec.i.02 と sec.i.05 を「編」から「端」、sec.i.03 を「模」から「S」にした（`REWORK-PRACTICE.txt` 原則 1。sec.i.02 は鍵の権限も変える。sec.i.05 は 2 つのファイルと 2 つのサービスを順に扱うので、1 つのファイルの編集では作れない）。`docs/lessons/sec.md` と `docs/curriculum.md` の表を先に直した。

模擬環境に足した物（テストを先に書いた。`serviceUser.test.ts`・`keyRotation.test.ts`・`openssl.test.ts`・`webConfig.test.ts`）:
- サービスを動かす利用者: setup の `services` の `unit`（ユニットファイル。`User=`・`ExecStart=` を読み、`daemon-reload` で読み直す）と `writes`（書く場所。書けなければ起動に失敗）。居ない利用者は本物と同じく `217/USER`。`ps aux` の 1 列目に出る。判定は `service` の `user`
- `useradd`（`-r`・`-s`・`-d`・`-m`・`-M`。`/etc/passwd` と `/etc/group` に書く）。`id` は居ない利用者を断る
- API の鍵を読むサービス: setup の `services` の `keyGuard`（受ける側。鍵の一覧のファイル。無い鍵は 401）と `keyClient`（頼む側。環境のファイルの鍵を動かす時に読む。断られると 502）。`curl -H 'Authorization: …'` を渡す。判定は `http` の `auth`
- 名前ごとの証明書（SNI）・`openssl` の `-modulus`・`md5`・鍵の対の確かめ（`key values mismatch`）

### 中級 cicd（5 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| cicd.i.01 runner | 編 | 合格 | 合格（2 通り） | 合格 |
| cicd.i.02 設定ファイルを書く | 編 | 合格 | 合格（2 通り） | 合格 |
| cicd.i.03 秘密情報をパイプラインに渡す | 編 | 合格 | 合格（2 通り） | 合格 |
| cicd.i.04 失敗したパイプラインを直す | 端 | 合格 | 合格（2 通り） | 合格 |
| cicd.i.05 開発・検証・本番 | 編 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| cicd.i.03 が最後のヒントで達成にならない | 模擬の不具合: job の `env` に書いた `${{ secrets.… }}` を置き換えていなかった（手順の `env` だけだった） | ワークフローと job の `env` も実行の時に置き換える（テストを先に書いた。`src/engines/cicd/runnerEnv.test.ts`） |
| cicd.i.04 でログを読むだけの `gh run view --log-failed` にエラーの案内が出た | 書き起こしの誤り: テストの失敗の案内を出力に当てたので、読むための打鍵にも当たった | 案内を外した（失敗はログを読むこと自体が手順の目的） |
| cicd.i.05 で誤った設定を保存すると、やり直しても達成にならない | 書き起こしの誤り: 達成の条件に「本番が 1.4.0 のまま」を入れたが、本番に配ると戻せない | 条件から外し、本番に入ったことは案内（`cicd-direct-prod`）で知らせる |

設計を直した物: cicd.i.01 と cicd.i.05 を「模」から「編」、cicd.i.04 を「編」から「端」にした（`REWORK-PRACTICE.txt` 原則 1。ワークフローの YAML という本物の道具がある。cicd.i.04 は設定とコードの 2 つのファイルを直す）。`docs/lessons/cicd.md` と `docs/curriculum.md` の表を先に直した。

模擬環境に足した物（テストを先に書いた。`src/engines/cicd/runnerEnv.test.ts`）:
- `actions.runners`（自前の runner のラベルと網）。`runs-on` のラベルで選び、合う物が無ければ `No runner matching the specified labels`。配る先の `network` は、その網の runner からだけ届く
- `actions.secrets`（`${{ secrets.名前 }}`。ログでは値を `***` に伏せる）と、script の `token`（要る鍵が空か違えば配らない）
- `actions.environments`（`reviewers` のある環境の job は承認を待つ。`gh run view` に `Waiting for review` が出る。承認は GitHub の画面の操作なので、模擬は待つ所までにした）
- `ci` の式の `logged:文字`・`trigger:きっかけ`、結果の `waiting`

コミットの記録: このコミットの本文 `bdc9b2a` は、台本の誤りで本文の無いメッセージになった（検査は全て通っている。main の履歴は書き換えず、この記録に残す）。

### 中級 db（5 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| db.i.01 JOIN | S | 合格 | 合格（2 通り） | 合格 |
| db.i.02 RDB の設計 | S | 合格 | 合格（2 通り） | 合格 |
| db.i.03 インデックス | S | 合格 | 合格（2 通り） | 合格 |
| db.i.04 トランザクション | S | 合格 | 合格（2 通り） | 合格 |
| db.i.05 NoSQL の基本概念 | 模 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| 用語の検証で git.b.02・git.b.03 が落ちた | 書き起こしの誤り: 新しい用語の語を「インデックス」にしたので、Git のインデックスの文にも当たった | 語を「インデックス（索引）」にした |
| db.i.04 の失敗の手順で、何もしなくても達成に見えた | 書き起こしの誤り: 「元の残高のまま」は初めから満たす | `BEGIN` して足した所を 1 つの手順（確定していない状態）にし、断られて `ROLLBACK` した所を次の手順にした |
| db.i.05 の誤りの案内が出ない | 別解の誤り: 最後に置いた札が正しいと「並べ直しの途中」と見られる（`settledAfter`） | 誤った札を最後に置く |

設計は変えていない（db.i.01〜04 は S、db.i.05 は模のまま）。

模擬環境に足した物（テストを先に書いた。`src/engines/db/db.test.ts`）: `sql` の判定の `committed`（トランザクションの途中か・確定したか。`BEGIN` を試して確かめる）。

### 中級 mon（4 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| mon.i.01 トレース | 模 | 合格 | 合格（2 通り） | 合格 |
| mon.i.02 ダッシュボードを読む | 模 | 合格 | 合格（2 通り） | 合格 |
| mon.i.03 障害調査の手順 | 端 | 合格 | 合格（2 通り） | 合格 |
| mon.i.04 SLO の考え方 | S | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| mon.i.01・mon.i.02 の判定の式が読めない | 書き起こしの誤り: `answered` の値は空白を含められない | 答えの札を「予約のDB」「決済のAPI」にした |
| mon.i.04 の別解で、途中の `SUM` に誤りの案内が出た | 別解の誤り: 数える手順で別の数を出すと案内が出る（`docs/content-spec.md` 2.4） | 途中で表を見る別解にした |

設計を直した物: mon.i.03 を「模」から「端」（`curl`・`gh run list`・`git log`・`git revert` の本物の道具がある）、mon.i.04 を「模」から「S」（`ADD-AI.txt` と同じく、数を出す実戦は道具で計算する）にした。`docs/lessons/mon.md` と `docs/curriculum.md` の表を先に直した。模擬環境に足した物は無い。

### 中級 cloud（4 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| cloud.i.01 可用性と冗長化 | 模 | 合格 | 合格（2 通り） | 合格 |
| cloud.i.02 スケーリング | 端 | 合格 | 合格（2 通り） | 合格 |
| cloud.i.03 責任共有モデル | 模 | 合格 | 合格（2 通り） | 合格 |
| cloud.i.04 費用の考え方 | S | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| 既にある cloud.b.02・found.b.03・k8s.b.07 が用語の検証で落ちた | 書き起こしの誤り: 新しい用語の語「責任共有モデル」「区画」が、既にある本文にも当たった | 語を「責任共有モデル（責任の境目）」「区画（ゾーン）」にした（既にある本文は変えない） |
| cloud.i.01 の「区画 A」「区画 B」が用語の検証で落ちた | 書き起こしの誤り: 大文字の英字の語は用語集に載せる決まり | 画面の名前を「東の区画」「西の区画」にした |

設計を直した物: cloud.i.02 を「模」から「端」（`kubectl autoscale` の本物の道具がある。特定のクラウド製品に寄らない）、cloud.i.04 を「模」から「S」（数を出す実戦は道具で計算する）にした。`docs/lessons/cloud.md` と `docs/curriculum.md` の表を先に直した。ドラッグの実戦 cloud.i.01・cloud.i.03 は verify-drag も合格。模擬環境に足した物は無い。

### 中級 devops（3 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| devops.i.01 Infrastructure as Code の基本概念 | 編 | 合格 | 合格（2 通り） | 合格 |
| devops.i.02 監視と改善のループ | 模 | 合格 | 合格（2 通り） | 合格 |
| devops.i.03 ポストモーテム | 模 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| devops.i.02 の札の時間が読めない | 書き起こしの誤り: 枠ごとの時間は 0 以上。減る量でなく、枠に入れた時の時間を書く | 札を初めから「今回は直さない」に置き、枠を移すと合計（測った応答時間）が 1200 → 500 → 300 ms と動く形にした |
| devops.i.02 の別解で、2 回目の札を先に置くと誤りの案内が出た | 別解の誤り: 長い処理から直すのが目的なので、案内は正しい | 別解を、札を戻してから順に置く形にした |

設計は変えていない（devops.i.01 は編、devops.i.02・devops.i.03 は模のまま）。ドラッグの実戦 devops.i.02・devops.i.03 は verify-drag も合格。

模擬環境に足した物（テストを先に書いた。`src/engines/kernel/commands/diskFull.test.ts`）: 次の分野 trouble.i.01 で使う `truncate`・判定の `disk`（`df` の使用率）・サービスの `diskGuard`（満杯の間は 500）・掴まれたまま消されたファイルの大きさ（前は 200KB と決め打ちだった）。

既にあるテストを直した物: `proc.test.ts` の「掴まれたまま消したファイルの分は空きに戻らない」は、決め打ちの 200KB で `df` の値が変わることを確かめていた。本物では消しても使用量は変わらないので、同じ値であることを確かめる形に直した。

### 中級 trouble（3 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| trouble.i.01 サーバの障害 | 端 | 合格 | 合格（2 通り） | 合格 |
| trouble.i.02 繋がらない | 端 | 合格 | 合格（2 通り） | 合格 |
| trouble.i.03 Web の障害 | 端 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| trouble.i.02 の別解 `curl --max-time 3 …` が名前を引けないと失敗 | 模擬の不具合: 網のある実戦の `curl` が、待つ時間の値を URL と取り違えた | `--max-time`・`-m`・`--connect-timeout` を受ける（テストを先に書いた。`curlTimeout.test.ts`） |
| trouble.i.03 の 502 を読む打鍵に誤りの案内が当たった | 書き起こしの誤り: `curl -i` は 502 でも終了の状態が 0 で、うまくいった命令に案内を当てる形になった | 目的を `curl -fsS` にし、失敗（`(22)`）を見せるための手順にした（`designedErrors`） |

設計は変えていない。trouble.i.02・trouble.i.03 は、目的の文が失敗を読むことなので、想定した失敗のレッスン（`DESIGNED_FAILURES`）に足した。

模擬環境に足した物は `truncate`・判定の `disk`・サービスの `diskGuard`（devops の記録に書いた）と、`curl` の待つ時間の指定。

### 中級 lab（2 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| lab.i.01 Web サービスを公開する | 端 | 合格 | 合格（2 通り） | 合格 |
| lab.i.02 チーム開発から自動デプロイ | 端 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| lab.i.02 の別解 `sed 's/…/…\n…/'` が通らない | 模擬の不具合: `sed` の置き換える文の `\n`・`\t` を文字のまま出していた | 改行・タブにする（テストを先に書いた。`sedReplace.test.ts`） |
| 秘密情報の検査が trouble.i.03・lab.i.01 に当たった | 実戦に置く、形だけの鍵のファイル | `tools/secret-scan.mjs` の `ALLOW` に場所と理由を書いた |

設計を直した物: lab.i.02 を「編」から「端」にした（ワークフローとコードの 2 つのファイルを直して push する。壊れた変更が止まることを見るには、コードの変更が要る）。`docs/lessons/lab.md` を先に直した。

模擬環境に足した物（テストを先に書いた。`ufw.test.ts`）: `ufw`（`allow`・`deny`・`delete`・`enable`・`disable`・`status`。`/etc/ufw/user.rules` に書く）と `reboot`（有効なサービスだけが動き出す）。外からの通信の模型は無いので、`ufw` は規則を決めるところまでを扱う（届くかは `curl` を手元から打って確かめる）。

### 上級 linux（4 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| linux.a.01 起動しないサービスを直す | 端 | 合格 | 合格（2 通り） | 合格 |
| linux.a.02 遅いサーバを調べる | 端 | 合格 | 合格（2 通り） | 合格 |
| linux.a.03 マウントとファイルシステム | 端 | 合格 | 合格（2 通り） | 合格 |
| linux.a.04 サーバを堅くする | 端 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| linux.a.01 の手順 `nginx -t` で一般の案内が出た | 書き起こしの誤り: `nginx -t` の失敗に当てる解説が無かった | 解説 `linux-nginx-emerg` を足し、読むための失敗（`designedErrors`）にした |

設計は変えていない（4 本とも端）。

模擬環境に足した物（テストを先に書いた。`block.test.ts`）:
- 記憶装置とマウント: setup の `blockDevices`。`lsblk`・`mkfs.ext4`・`mkfs -t`・`blkid`・`mount`（`-a` で /etc/fstab）・`umount`・`findmnt`。再起動すると fstab の物だけが取り付き、誤りがあれば緊急モードの文で止まる。判定の `mount`
- 資源の計器: setup の `meters`。`uptime`・`top` の負荷平均と `wa`、`vmstat`、`iostat -x`、`iotop`（プロセスの `ioMBs`）
- `sshd -t`（`/etc/ssh/sshd_config` の検査。本物の文で断る）

### 上級 net（4 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| net.a.01 繋がらない原因を層ごとに探す | 端 | 合格 | 合格（2 通り） | 合格 |
| net.a.02 MTU と断片化 | 端 | 合格 | 合格（2 通り） | 合格 |
| net.a.03 ロードバランサ | 端 | 合格 | 合格（2 通り） | 1 回目 不合格 → 合格 |
| net.a.04 IPv6 の基本 | 端 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| net.a.03 の「読み直さずに確かめる」にエラーの案内が出ない | 台本の誤り: 読み直す前の `curl` はうまくいった命令なので、案内は出ない（正しい） | 間違える操作を、`upstream` の名前を変えて `nginx -t` に断られる形にした |
| net.a.03 の手順 stop が最後のヒントで達成にならない | 書き起こしの誤り: 判定を `ran` にしたが、振り分けの番で最後の 1 行の結果が 200 になる | 1 行の `for` で 3 回打ち、読み取った番号を答える形にした（結果の全体と答えは違う） |
| 既にあるテスト `loadLesson('net.a.01')` が null でなくなった | テストが「書き起こしていないレッスン」の例に net.a.01 を使っていた | どの範囲にも無い ID（`found.z.99`）にした |

設計を直した物: 4 本とも「模」から「端」にした（`REWORK-PRACTICE.txt` 原則 1。ネットワークには ping・ip・dig・curl・iptables、ロードバランサには nginx の本物の設定がある）。`docs/lessons/net.md` と `docs/curriculum.md` の表を先に直した。

模擬環境に足した物（テストを先に書いた。`netAdvanced.test.ts`）:
- MTU: setup の網の `mtus`（口ごとの上限。線は両端の小さいほう）と `pages`（道ごとの頁と大きさ）。`ping -M do -s`（手元で `message too long`、途中で `Frag needed and DF set`）・`tracepath`・大きな頁の返事が上限を超えると `curl: (28)`（接続の時に伝える大きさの分だけ小さくなるので、どちらかの口を下げれば届く）
- 振り分け: nginx の `upstream`（`weight`・`down`・`backup`・`ip_hash`・`least_conn`）と `proxy_next_upstream off`。本物と同じ文で断る（`no servers are inside upstream`・`host not found in upstream`）。番は `curl` を打つたびに進む。判定の `http` の `turns`・`seen`
- IPv6: 口の `ip6`（setup の `addrs6`）。`ip -6 addr`・`ip -6 route`・`ping -6`・`ping6`・`curl -6`・`http://[住所]/`・AAAA の検査（`bad IPv6 address`）。判定の `reach6`・`addr6`。線と経路は 4 の計算を使う（デュアルスタックの網）
- 網の `curl` の `-o`・`-w`（`%{http_code}`）

### 上級 web（3 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| web.a.01 遅い Web を調べる | 端 | 合格 | 合格（2 通り） | 合格 |
| web.a.02 4xx と 5xx を直す | 端 | 合格 | 合格（2 通り） | 合格 |
| web.a.03 認証付き API | 端 | 合格 | 合格（2 通り） | 合格 |

不合格は無かった。

設計を直した物: web.a.01 を「模」から「端」にした（`curl -w` の `time_` という本物の道具がある）。対策は押して選ばず、手順の後に示す。web.a.02・web.a.03 は達成の中身を手順に分けて書いた。`docs/lessons/web.md` と `docs/curriculum.md` の表を先に直した。

模擬環境に足した物（テストを先に書いた。`webAdvanced.test.ts`）:
- `curl -w` の `%{time_namelookup}`・`%{time_connect}`・`%{time_appconnect}`・`%{time_pretransfer}`・`%{time_starttransfer}`・`%{time_total}`・`%{size_download}`（本物と同じく累計）。setup の `sites` の `timing`
- サービスの `envCheck`（動かす時に環境のファイルの値を読み、違えば頼みに 500 を返してログに理由を書く）
- サービスの `tokenApi`（`POST /token` で秘密と引き換えにトークンを渡し、`Authorization: Bearer` を確かめる。無い・綴りの誤り・期限切れは 401）

### 上級 sec（4 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong | verify-drag |
|---|---|---|---|---|---|
| sec.a.01 脆弱性の報告から更新まで | 端 | 合格 | 合格（2 通り） | 合格 | — |
| sec.a.02 ログと監査 | 端 | 合格 | 合格（2 通り） | 合格 | — |
| sec.a.03 インシデント対応の基本 | 模（並べる） | 合格 | 合格（2 通り） | 合格 | 合格 |
| sec.a.04 依存関係の安全 | 端 | 合格 | 合格（2 通り） | 合格 | — |

不合格は無かった。

設計を直した物: sec.a.01 を「模」から「端」（`dpkg`・`ss`・`apt` の本物の道具がある）、sec.a.04 を「模」から「端」（`npm audit`・`npm ls` の本物の道具がある）にした。`docs/lessons/sec.md` と `docs/curriculum.md` の表を先に直した。sec.a.03 は打つコマンドの無い手順の考え方なので模のまま。

模擬環境に足した物（テストを先に書いた。`npmAudit.test.ts`）: npm の間接の依存（`actions.packages` の `deps`。`node_modules` とロックファイルに入る）・`npm ls [名前]`・`npm audit`（`actions.advisories`。残っていれば終了の状態 1）・`npm install` の最後の行が警告の数を言う。

### 上級 git（3 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| git.a.01 壊れた変更を探す | 端 | 合格 | 合格（2 通り） | 1 回目 不合格 → 合格 |
| git.a.02 チームのブランチ戦略 | 端 | 合格 | 1 回目 不合格 → 合格（2 通り） | 1 回目 不合格 → 合格 |
| git.a.03 秘密情報をコミットしてしまったら | 端 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| `git bisect reset` の後、元の枝に戻らない（既にある不具合。テストで発見） | 模擬の不具合: 調べる間は HEAD が離れるので、離れたままの場所に戻していた。index も合わせていなかった | 始めた時の枝を控えて枝に戻し、index も合わせる（テストを先に書いた。`gitRewrite.test.ts`） |
| `grep -q` が結果を出す | 模擬の不具合: `-q` が無かった | `-q` を足した（同） |
| 別解 `gh pr create --fill` が断られる | 模擬に無かった | `--fill` を足した（同） |
| git.a.01 の間違える操作で `git revert` が記録を見つけない | 台本の誤り: `who` の答えだけを打つと `git bisect reset` を飛ばす | 間違える手順を `find` にした |
| lab.i.02 の用語の検証が落ちた | 書き起こしの誤り: 新しい用語の語「枝の保護」が、既にある本文にも当たった | 語を「枝の保護（ブランチ保護）」にした（既にある本文は変えない） |

設計を直した物: git.a.02 を「模」から「端」にした（`gh api` の本物の API と `git push` がある）。`docs/lessons/git.md` と `docs/curriculum.md` の表を先に直した。git.a.03 は達成の中身を手順に分けて書いた。

模擬環境に足した物（テストを先に書いた。`gitRewrite.test.ts`）:
- `git blame`（`-L`）・`git bisect run`・`git log --grep`・`git log --format`・`git commit --author`
- `git filter-repo --path … --invert-paths --force`（本物と同じく `--force` を求め、`origin` を外す）・`git filter-branch --index-filter`・`git push --all`
- 枝の保護の API: `gh api --method PUT repos/持ち主/名前/branches/枝/protection --input ファイル`（本物と同じく 4 つの項目を求め、足りなければ 422）。入れた後の直接の push は GH006 で断る。判定の `protected:`・`protected-approvals:`・`protected-checks:`

### 上級 cicd（3 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| cicd.a.01 デプロイ戦略 | 端 | 合格 | 合格（2 通り） | 合格 |
| cicd.a.02 パイプラインを速くする | 編 | 合格 | 合格（2 通り） | 合格 |
| cicd.a.03 品質の門 | 編 | 合格 | 合格（2 通り） | 合格 |

不合格は無かった。

設計を直した物: cicd.a.01 を「模」から「端」にした（`kubectl set image`・`kubectl set selector`・`kubectl scale` の本物の道具で 3 つの届け方を行う）。cicd.a.02・cicd.a.03 は達成の中身を手順に分けて書いた。`docs/lessons/cicd.md` と `docs/curriculum.md` の表を先に直した。

模擬環境に足した物（テストを先に書いた。`cicdAdvanced.test.ts`）:
- `actions/cache@`（`key`・`hashFiles`）と `actions/setup-node` の `cache: npm`。保存は実行の後で、次の実行から当たる。`actions.cachedInstallSeconds`
- `git commit --allow-empty`
- `kubectl set selector` の札のコンマ区切り、判定の `service/名前 selector.札=値`
- 枝の保護の `enforce_admins`（判定の `protected-admins:`）と、`null` の項目

### 上級 ctr（2 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| ctr.a.01 コンテナ運用 | 端 | 合格 | 1 回目 不合格 → 合格（2 通り） | 1 回目 不合格 → 合格 |
| ctr.a.02 コンテナの安全 | 編 | 合格 | 合格（2 通り） | 1 回目 不合格 → 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| 別解 `podman inspect -f '{{.RestartCount}}'` が読めない | 模擬に無かった: podman の inspect の項目 | `.RestartCount`・`.HostConfig.RestartPolicy.Name`・`.Config.User` を足した |
| ctr.a.02 の間違える操作で手順が達成になる | 別解の誤り: 先に一般の利用者の土台を保存する別解を 1 つ目にしたので、次の手順が初めから満たされた | 別解の順を入れ替えた |
| k8s.i.07 の用語の検証が落ちた | 書き起こしの誤り: 新しい用語の語が、既にある本文にも当たった | 語を「終了コード 137（強制終了）」にした（既にある本文は変えない） |

設計を直した物: ctr.a.01 を「模」から「端」にした（`podman run --restart`・`kill`・`podman logs` の本物の道具がある）。ctr.a.02 は達成の中身を手順に分けて書いた。`docs/lessons/ctr.md` と `docs/curriculum.md` の表を先に直した。

模擬環境に足した物（テストを先に書いた。`src/engines/docker/advanced.test.ts`）:
- `--restart`（`no`・`always`・`on-failure`・`unless-stopped`）・`--log-driver`・`--log-opt`・`--user`・`docker update --restart`。機械から主のプロセスに `kill -9` すると止まり、方針があれば動かし直す。設定の誤りは `Restarting` を繰り返す。`podman`・`docker` の両方
- `trivy image`（件数は土台から受け継ぐ。`--exit-code`）・イメージの `USER`（一般の利用者は 1024 より小さいポートで待てない）・`exec id`・`whoami`・土台 `nginxinc/nginx-unprivileged:1.27-alpine`
- 判定の `vulns:`・`size:`・`user:`・`restart:`・`restarts:`・`limit:`・`logopt:`

### 上級 docker（3 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| docker.a.01 マルチステージビルド | 編 | 合格 | 合格（2 通り） | 合格 |
| docker.a.02 起動しないコンテナを直す | 端 | 合格 | 合格（2 通り） | 合格 |
| docker.a.03 Docker 以外の道具 | 端 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| k8s.i.07 の用語の検証が落ちた | 書き起こしの誤り: 新しい用語の語「終了コード」が既にある本文に当たった | 語を「終了コード（終わりの番号）」にした |

設計を直した物: docker.a.03 を「模」から「端」にした（`podman`・`diff` の本物の道具がある）。docker.a.02 は達成の中身を手順に分けて書いた。`docs/lessons/docker.md` と `docs/curriculum.md` の表を先に直した。

模擬環境に足した物（テストを先に書いた。`src/engines/docker/advanced.test.ts`）:
- マルチステージ: `FROM … AS 名前`・`COPY --from=名前か番号`・`RUN npm run build`。イメージになるのは最後の段だけで、大きさも最後の段で決まる。土台 `node:20`（1.1GB）。nginx の土台から作ったイメージは、写した頁を答える
- イメージ `city-batch:1.0`（環境変数とメモリの 2 つの原因が重なる）
- `podman` の手元の 1024 より小さいポートの断り（本物の文）・`diff -s`

### 上級 k8s（4 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong |
|---|---|---|---|---|
| k8s.a.01 Kubernetes 上のアプリ | 編 | 合格 | 合格（2 通り） | 合格 |
| k8s.a.02 動かない Pod を直す | 端 | 合格 | 合格（2 通り） | 合格 |
| k8s.a.03 繋がらない Service を直す | 端 | 合格 | 合格（2 通り） | 合格 |
| k8s.a.04 Node の保守 | 端 | 合格 | 合格（2 通り） | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| 別解 `kubectl set selector service/shop app=shop` が断られる | 模擬の不具合: `種類/名前` の形を受けていなかった | 両方の形を受ける（テストを先に書いた。`kubectlApp.test.ts`） |
| `全ての端末の実戦で…候補に出る` が 5 秒で時間切れ | テストの時間: レッスンが増え、全てを動かすのに 5 秒を超えた | このテストの期限を 60 秒にした |
| `中身をまだ書き起こしていないレッスン` のテストが落ちた | テストが k8s.a.04 を例にしていた。範囲が全てに広がると、書いていないレッスンは無くなる | テストの中だけで k8s.a.04 を書き起こしていない形にした |

設計は変えていない。k8s.a.01 の実戦は設計どおり「編」で、達成の「全経路で 200」を 3 つの道（`/`・`/api/items`・`POST /api/login`）で確かめる。k8s.a.03 は設計の札とポートの誤りに、到達目標にある Ingress の誤りを足した（`docs/content-spec.md` 5.1 の「足すのはよい」）。

模擬環境に足した物（テストを先に書いた。`kubectlApp.test.ts`）:
- イメージ `city-store-api:1.0`: `DATABASE_URL` が無ければ起動直後に止まり、その名前の Service に DB が居なければ頼みに 500 で理由を答える。`POST /api/login` に答える
- `kubectl set env`（`名前=値`・`名前-`）
- 判定の `node/名前 schedulable`（`uncordon` で戻したことを確かめる）

### 上級 db（3 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong | verify-drag |
|---|---|---|---|---|---|
| db.a.01 バックアップと復元 | S | 合格 | 合格（2 通り） | 合格 | — |
| db.a.02 DB の障害対応 | S | 合格 | 合格（2 通り） | 合格 | — |
| db.a.03 レプリケーションの考え方 | 模（置く） | 合格 | 合格（2 通り） | 合格 | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| db.a.01 の用語の検証で「A」「B」が落ちた | 書き起こしの誤り: ヒントの文に大文字の英字の語を地の文で書いた | 文を「前の結果」「後ろの結果」にした |

設計は変えていない。

模擬環境に足した物（テストを先に書いた。`src/engines/db/db.test.ts`）: ブラウザ内の DB に `pg_blocking_pids(pid)` と `pg_terminate_backend(pid)`（PostgreSQL と同じ名前と結果の形。初期状態の表 `pg_stat_activity` と `_pg_locks` を読み書きし、止めると待っていた処理の待ちが解ける。表の無い実戦では本物と同じく読めない）。遅い処理の記録は、初期状態の表 `pg_stat_statements` として置く。

### 上級 cloud（2 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong | verify-drag |
|---|---|---|---|---|---|
| cloud.a.01 同じ要件を 3 つの形で作る | 模（つなぐ） | 合格 | 合格（2 通り） | 合格 | 合格 |
| cloud.a.02 障害に強い構成 | 模（置く） | 合格 | 合格（2 通り） | 合格 | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| cloud.a.02 の別解で途中の札に案内が出た | 別解の誤り: 札を別の地域へ置いてから戻すと、達成の条件を崩す操作になる（案内は正しい） | 札を戻してから置く別解にした |

設計は変えていない。模擬環境に足した物は無い。

### 上級 mon（2 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong | verify-drag |
|---|---|---|---|---|---|
| mon.a.01 鳴りすぎないアラート | 模（置く） | 合格 | 合格（2 通り） | 合格 | 合格 |
| mon.a.02 分散システムの調査 | 模（置く） | 合格 | 合格（2 通り） | 合格 | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| 新しい用語の関連に、用語集に無い語を書いた | 書き起こしの誤り | 関連を用語集にある語にした |
| mon.a.01 の別解で先に置いた札に案内が出た | 別解の誤り: 手順の条件に無い札を先に置くと、答えの違いと見られる（`settledAfter`） | 札を戻してから置く別解にした |

設計は変えていない。模擬環境に足した物は無い。

### 上級 devops（2 本）

| ID | 実戦 | verify-all | verify-free（別解） | verify-wrong | verify-drag |
|---|---|---|---|---|---|
| devops.a.01 小さく頻繁に変える | 模（並べる） | 合格 | 合格（2 通り） | 合格 | 合格 |
| devops.a.02 チームと文化 | 模（置く） | 合格 | 合格（2 通り） | 合格 | 合格 |

| 不合格 | 原因 | 直したこと |
|---|---|---|
| devops.a.01 の最後のヒントに札の名前が足りない | 書き起こしの誤り: 操作に出る札の名前を全てヒントに書く決まり | 全ての札の名前を書いた |
| 間違える操作で手順が達成になる（2 本） | 別解の誤り: 1 つ目の別解が先の手順の分まで置いていた（間違える操作は 1 つ目の別解で通す） | 別解の順を入れ替えた |

設計は変えていない。模擬環境に足した物は無い。
