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
| 中級 | mon | 未着手 |
| 中級 | cloud | 未着手 |
| 中級 | devops | 未着手 |
| 中級 | trouble | 未着手 |
| 中級 | lab | 未着手 |
| 上級 | linux | 未着手 |
| 上級 | net | 未着手 |
| 上級 | web | 未着手 |
| 上級 | sec | 未着手 |
| 上級 | git | 未着手 |
| 上級 | cicd | 未着手 |
| 上級 | ctr | 未着手 |
| 上級 | docker | 未着手 |
| 上級 | k8s | 未着手 |
| 上級 | db | 未着手 |
| 上級 | cloud | 未着手 |
| 上級 | mon | 未着手 |
| 上級 | devops | 未着手 |
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
