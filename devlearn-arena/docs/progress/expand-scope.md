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
| 中級 | sec | 未着手 |
| 中級 | cicd | 未着手 |
| 中級 | db | 未着手 |
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
