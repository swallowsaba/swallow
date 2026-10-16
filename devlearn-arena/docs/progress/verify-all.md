# 全レッスンの通し確認（VERIFY-ALL.txt）

記録を始めた日: 2026-10-17

全 131 本のレッスンを、人と同じ順序・同じ操作で最後まで通し、通らないものを直す。この文書は、どこまで終わったかの記録でもある。

## 進み

| 段 | 状態 |
|---|---|
| 【1】1 本を通す台本（`tools/scenarios/verify-lesson.mjs`） | 済み |
| 【2】131 本に流す（`tools/scenarios/verify-all.mjs`）・1 回目の表 | 済み（この文書の「1 回目」） |
| 【3】不合格を直す | これから |
| 【4】ドラッグの実戦を目で確かめる | これから |
| 【5】ゲームループを通しで確かめる（`tools/scenarios/loop.mjs`） | これから |
| 【6】今打てるコマンドの候補 | これから |

## 台本

```text
node tools/scenarios/verify-lesson.mjs linux.b.04       1 本（開発用のサーバを自分で立てて片付ける）
node tools/scenarios/verify-all.mjs                     全て（失敗しても止めず、最後まで流す。VERIFY_JOBS で同時に通す本数）
node tools/scenarios/verify-all.mjs net git.b.02        分野か ID で絞る（前の結果の該当する行だけを置き換える）
node tools/scenarios/verify-all.mjs --table             前の結果（shots/verify/results.json）から表だけを作り直す
VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ を付けると、公開した所に対して流す
```

1 本ごとに新しい記録（空の localStorage）で、次の道を通る。正解はレッスンの中身（`content/lessons/**`）から読み、台本には書き写さない。

1. 都市の画面を開く（操作説明は閉じる）
2. 上の「学ぶ」→ 学習ライブラリでそのレッスンの行を選ぶ → 入口の札の「始める」（URL を直接開かない）
3. 解説を「次へ」で読み進める
4. 理解の問いに全て正しく答える（図はその部分の真ん中を押す。真ん中で一番上にある物が別の部分なら、そこで不合格）。正解の知らせが出ること
5. クイズに全て正しく答える。正解の知らせが出ること
6. 実戦。手順ごとにヒントを 3 段開き、**最後のヒントに書かれた操作だけ**を行う
   - 端末: 最後のヒントの `` のコマンドを 1 文字ずつ打って Enter。答える手順は、最後の `` を答えの欄に打って Enter
   - SQL・設定の編集: 入力欄に打ち込み、「実行」「保存して確かめる」
   - 画面の操作（模）: 手順の `actions`（最後のヒントで通る操作。`docs/content-spec.md` 2.4.1）を、マウスの down → move → up のドラッグと、押す操作で行う
7. 「結果へ」→ 結果の画面の「できたこと」に全ての手順が並び、「まだの手順」が無い
8. 「まとめへ」→ まとめ → XP / スキル。XP（学習の記録の累計）とスキル（分野の値）が増えている
9. 「都市へ戻る」→ 都市の画面に戻り、レッスンの画面が閉じる。ページの誤り（pageerror）が無い

実戦の途中にエラーの案内（「エラーが出た。調べてみよう」）が出たら、その瞬間の画面を撮り、打った物・その時の手順・案内を記録し、閉じて続ける（達成になるかも確かめる）。

## 1 回目（直す前）

- 流した日: 2026-10-17。相手: 公開 URL（https://swallowsaba.github.io/swallow/devlearn-arena/ 。配信されていたのは 964aab9 の物）
- 画面: 1920×1080。4 本ずつ同時に流し、全 131 本で 458 秒
- **131 本中、合格 117・不合格 14**

### 不合格の内訳

| 止まった段階 | 本数 | レッスン |
|---|---|---|
| 理解 | 2 | found.b.07（図の「ルータ」の真ん中を押すと、上に重なった「LAN」の枠が押される）・net.b.03（図の「/24 の境」が細い点線だけで、真ん中を押すと何も無い所になる） |
| 実戦（最後のヒントの操作でエラーの案内が出た） | 12 | net.b.04・net.i.01・net.i.02・net.i.03・net.i.06・git.b.02・git.b.06・git.i.02・git.i.05・trouble.b.02・docker.b.01・k8s.b.01 |
| 結果・まとめ・XP・都市へ戻る | 0 | 実戦まで通った 129 本は、全て結果に全ての手順が並び、XP とスキルが増え、都市へ戻れた |

実戦の 12 本は、どれもエラーの案内を閉じて続ければ、最後のヒントの操作で全ての手順を満たした（「ヒントの最後まで従ったのに達成にならない」物は無かった）。
画像は `shots/verify/<ID>.png`（コミットしない。エラーの案内が出た瞬間・止まった瞬間の画面）。

### 表（1 回目）

| レッスン | 結果 | 止まった段階 | した操作 | 起きたこと | 画像 |
|---|---|---|---|---|---|
| found.b.01 | 合格 | | | XP +205・スキル 50 | |
| found.b.02 | 合格 | | | XP +205・スキル 50 | |
| found.b.03 | 合格 | | | XP +205・スキル 50 | |
| found.b.04 | 合格 | | | XP +210・スキル 50 | |
| found.b.05 | 合格 | | | XP +205・スキル 50 | |
| found.b.06 | 合格 | | | XP +205・スキル 50 | |
| found.b.07 | 不合格 | 理解 | 解説の「次へ」 / 解説の「次へ」 / 解説の「次へ」 | 図の「router」の真ん中を押すと、上に重なった「lan」が押される | `shots/verify/found.b.07.png` |
| found.b.08 | 合格 | | | XP +205・スキル 50 | |
| linux.b.00 | 合格 | | | XP +155・スキル 49 | |
| linux.b.01 | 合格 | | | XP +155・スキル 49 | |
| linux.b.02 | 合格 | | | XP +155・スキル 49 | |
| linux.b.03 | 合格 | | | XP +155・スキル 49 | |
| linux.b.04 | 合格 | | | XP +155・スキル 49 | |
| linux.b.05 | 合格 | | | XP +155・スキル 49 | |
| linux.b.06 | 合格 | | | XP +160・スキル 49 | |
| linux.b.07 | 合格 | | | XP +160・スキル 49 | |
| linux.b.08 | 合格 | | | XP +155・スキル 49 | |
| linux.i.01 | 合格 | | | XP +233・スキル 50 | |
| linux.i.02 | 合格 | | | XP +233・スキル 50 | |
| linux.i.03 | 合格 | | | XP +233・スキル 50 | |
| linux.i.04 | 合格 | | | XP +233・スキル 50 | |
| linux.i.05 | 合格 | | | XP +233・スキル 50 | |
| linux.i.06 | 合格 | | | XP +233・スキル 50 | |
| linux.i.07 | 合格 | | | XP +233・スキル 50 | |
| linux.i.08 | 合格 | | | XP +233・スキル 50 | |
| net.b.01 | 合格 | | | XP +155・スキル 49 | |
| net.b.02 | 合格 | | | XP +155・スキル 49 | |
| net.b.03 | 不合格 | 理解 | 解説の「次へ」 / 解説の「次へ」 / 解説の「次へ」 | 図の「boundary」の真ん中を押すと、何も無い所を押したことになる（当たりが狭い） | `shots/verify/net.b.03.png` |
| net.b.04 | 不合格 | 実戦 | `systemctl restart nginx` | エラーの案内（service-failed）: Job for nginx.service failed because the control process exited with error code. See "systemctl status nginx.service" and "journalctl -xeu n… | `shots/verify/net.b.04.png` |
| net.b.05 | 合格 | | | XP +160・スキル 49 | |
| net.b.06 | 合格 | | | XP +155・スキル 49 | |
| net.b.07 | 合格 | | | XP +155・スキル 49 | |
| net.b.08 | 合格 | | | XP +155・スキル 49 | |
| net.i.01 | 不合格 | 実戦 | `ip netns exec srv-c ping -c 1 10.0.1.10` | エラーの案内（net-one-way）: From 10.0.3.1 icmp_seq=1 Destination Net Unreachable | `shots/verify/net.i.01.png` |
| net.i.02 | 不合格 | 実戦 | `ip netns exec outside curl https://shop.example/` | エラーの案内（net-fw-timeout）: curl: (28) Failed to connect to shop.example port 443: Connection timed out | `shots/verify/net.i.02.png` |
| net.i.03 | 不合格 | 実戦 | `ip netns exec outside nmap -p 22,80,443 203.0.113.10` | エラーの案内（net-fw-open。手順 web の行が次の手順 ssh で）: 22/tcp open ssh | `shots/verify/net.i.03.png` |
| net.i.04 | 合格 | | | XP +238・スキル 50 | |
| net.i.05 | 合格 | | | XP +233・スキル 50 | |
| net.i.06 | 不合格 | 実戦 | `ip netns exec pc1 nmap -p 445 10.0.20.50`・`ip netns exec guest nmap -p 445 10.0.20.50` | エラーの案内（net-seg-same。手順 split の行が次の手順 rules で・net-seg-same）: Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-10-03 09:00 UTC Nmap scan report for 10.0.20.50 Host is up (0.00040s latency). PORT STATE… | `shots/verify/net.i.06.png` |
| web.b.01 | 合格 | | | XP +155・スキル 49 | |
| web.b.02 | 合格 | | | XP +155・スキル 49 | |
| web.b.03 | 合格 | | | XP +155・スキル 49 | |
| web.b.04 | 合格 | | | XP +155・スキル 49 | |
| web.b.05 | 合格 | | | XP +155・スキル 49 | |
| web.b.06 | 合格 | | | XP +155・スキル 49 | |
| web.b.07 | 合格 | | | XP +155・スキル 49 | |
| web.b.08 | 合格 | | | XP +155・スキル 49 | |
| web.i.01 | 合格 | | | XP +233・スキル 50 | |
| web.i.02 | 合格 | | | XP +233・スキル 50 | |
| web.i.03 | 合格 | | | XP +233・スキル 50 | |
| web.i.04 | 合格 | | | XP +233・スキル 50 | |
| web.i.05 | 合格 | | | XP +233・スキル 50 | |
| web.i.06 | 合格 | | | XP +233・スキル 50 | |
| sec.b.01 | 合格 | | | XP +155・スキル 49 | |
| sec.b.02 | 合格 | | | XP +155・スキル 49 | |
| sec.b.03 | 合格 | | | XP +155・スキル 49 | |
| sec.b.04 | 合格 | | | XP +155・スキル 49 | |
| sec.b.05 | 合格 | | | XP +155・スキル 49 | |
| sec.b.06 | 合格 | | | XP +155・スキル 49 | |
| sec.b.07 | 合格 | | | XP +155・スキル 49 | |
| git.b.01 | 合格 | | | XP +155・スキル 49 | |
| git.b.02 | 不合格 | 実戦 | `git status` | エラーの案内（git-nothing-added。手順 init の行が次の手順 record で）: nothing added to commit but untracked files present (use "git add" to track) | `shots/verify/git.b.02.png` |
| git.b.03 | 合格 | | | XP +155・スキル 49 | |
| git.b.04 | 合格 | | | XP +155・スキル 49 | |
| git.b.05 | 合格 | | | XP +155・スキル 49 | |
| git.b.06 | 不合格 | 実戦 | `git merge feature` | エラーの案内（git-conflict）: Auto-merging price.txt CONFLICT (content): Merge conflict in price.txt Automatic merge failed; fix conflicts and then commit the result. | `shots/verify/git.b.06.png` |
| git.i.01 | 合格 | | | XP +233・スキル 50 | |
| git.i.02 | 不合格 | 実戦 | `git push`・`git pull` | エラーの案内（git-push-rejected・git-conflict）: To https://git.city.example/park/reserve.git ! [rejected] main -> main (fetch first) error: failed to push some refs to 'https://git.city.ex… | `shots/verify/git.i.02.png` |
| git.i.03 | 合格 | | | XP +233・スキル 50 | |
| git.i.04 | 合格 | | | XP +238・スキル 50 | |
| git.i.05 | 不合格 | 実戦 | `git rebase main` | エラーの案内（git-rebase-conflict）: Auto-merging boat.txt CONFLICT (content): Merge conflict in boat.txt error: could not apply 8fb4008... 雨の日は休みにする hint: Resolve all conflicts… | `shots/verify/git.i.05.png` |
| git.i.06 | 合格 | | | XP +233・スキル 50 | |
| trouble.b.01 | 合格 | | | XP +205・スキル 50 | |
| trouble.b.02 | 不合格 | 実戦 | `cat /srv/report/summary.txt`・`cat /srv/report/dayly.log`・`curl http://report.city.example:8080/`・`curl https://api.city.example/`・`sh /srv/report/build.sh` | エラーの案内（trouble-read-denied・trouble-read-notfound・trouble-read-refused・trouble-read-timeout・trouble-read-first）: cat: /srv/report/summary.txt: Permission denied | `shots/verify/trouble.b.02.png` |
| trouble.b.03 | 合格 | | | XP +205・スキル 50 | |
| db.b.01 | 合格 | | | XP +155・スキル 49 | |
| db.b.02 | 合格 | | | XP +155・スキル 49 | |
| db.b.03 | 合格 | | | XP +155・スキル 49 | |
| db.b.04 | 合格 | | | XP +155・スキル 49 | |
| db.b.05 | 合格 | | | XP +155・スキル 49 | |
| cicd.b.01 | 合格 | | | XP +155・スキル 49 | |
| cicd.b.02 | 合格 | | | XP +155・スキル 49 | |
| cicd.b.03 | 合格 | | | XP +160・スキル 49 | |
| cicd.b.04 | 合格 | | | XP +155・スキル 49 | |
| cicd.b.05 | 合格 | | | XP +155・スキル 49 | |
| ctr.b.01 | 合格 | | | XP +155・スキル 49 | |
| ctr.b.02 | 合格 | | | XP +160・スキル 49 | |
| ctr.b.03 | 合格 | | | XP +155・スキル 49 | |
| ctr.b.04 | 合格 | | | XP +155・スキル 49 | |
| ctr.b.05 | 合格 | | | XP +155・スキル 49 | |
| ctr.i.01 | 合格 | | | XP +233・スキル 51 | |
| ctr.i.02 | 合格 | | | XP +233・スキル 51 | |
| ctr.i.03 | 合格 | | | XP +233・スキル 51 | |
| ctr.i.04 | 合格 | | | XP +233・スキル 51 | |
| ctr.i.05 | 合格 | | | XP +233・スキル 51 | |
| docker.b.01 | 不合格 | 実戦 | `docker version` | エラーの案内（docker-daemon）: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running? | `shots/verify/docker.b.01.png` |
| docker.b.02 | 合格 | | | XP +155・スキル 49 | |
| docker.b.03 | 合格 | | | XP +155・スキル 49 | |
| docker.b.04 | 合格 | | | XP +155・スキル 49 | |
| docker.b.05 | 合格 | | | XP +155・スキル 49 | |
| docker.i.01 | 合格 | | | XP +233・スキル 51 | |
| docker.i.02 | 合格 | | | XP +233・スキル 51 | |
| docker.i.03 | 合格 | | | XP +233・スキル 51 | |
| docker.i.04 | 合格 | | | XP +233・スキル 51 | |
| docker.i.05 | 合格 | | | XP +233・スキル 51 | |
| docker.i.06 | 合格 | | | XP +233・スキル 51 | |
| k8s.b.01 | 不合格 | 実戦 | `kubectl drain node-2` | エラーの案内（k8s-no-controller）: error: unable to drain node "node-2" due to error: cannot delete Pods that declare no controller (use --force to override): default/web-2, c… | `shots/verify/k8s.b.01.png` |
| k8s.b.02 | 合格 | | | XP +155・スキル 49 | |
| k8s.b.03 | 合格 | | | XP +155・スキル 49 | |
| k8s.b.04 | 合格 | | | XP +155・スキル 49 | |
| k8s.b.05 | 合格 | | | XP +155・スキル 49 | |
| k8s.b.06 | 合格 | | | XP +155・スキル 49 | |
| k8s.b.07 | 合格 | | | XP +155・スキル 49 | |
| k8s.i.01 | 合格 | | | XP +238・スキル 50 | |
| k8s.i.02 | 合格 | | | XP +233・スキル 50 | |
| k8s.i.03 | 合格 | | | XP +233・スキル 50 | |
| k8s.i.04 | 合格 | | | XP +238・スキル 50 | |
| k8s.i.05 | 合格 | | | XP +238・スキル 50 | |
| k8s.i.06 | 合格 | | | XP +238・スキル 50 | |
| k8s.i.07 | 合格 | | | XP +238・スキル 50 | |
| k8s.i.08 | 合格 | | | XP +238・スキル 50 | |
| mon.b.01 | 合格 | | | XP +205・スキル 50 | |
| mon.b.02 | 合格 | | | XP +205・スキル 50 | |
| mon.b.03 | 合格 | | | XP +205・スキル 50 | |
| mon.b.04 | 合格 | | | XP +205・スキル 50 | |
| cloud.b.01 | 合格 | | | XP +205・スキル 50 | |
| cloud.b.02 | 合格 | | | XP +205・スキル 50 | |
| cloud.b.03 | 合格 | | | XP +205・スキル 50 | |
| devops.b.01 | 合格 | | | XP +205・スキル 50 | |
| devops.b.02 | 合格 | | | XP +205・スキル 50 | |
| devops.b.03 | 合格 | | | XP +205・スキル 50 | |
