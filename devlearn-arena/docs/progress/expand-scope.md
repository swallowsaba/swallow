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
| 中級 | found | 未着手 |
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
