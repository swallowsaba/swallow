# 自力で遊んだ時の確認（VERIFY-FREE.txt）

記録を始めた日: 2026-10-23

ヒントを開かず、別の正しい書き方で打つ・間違える・小さい画面で遊ぶ・ミッションを通しで遊ぶ、の 4 つを確かめて直す。
書き方は `docs/progress/verify-all.md` と同じ。この文書は、どこまで終わったかの記録でもある。

## 進み

| 段 | 状態 |
|---|---|
| 【1】ヒントを開かず、別の書き方で通す（`tools/scenarios/verify-free.mjs`） | 1 回目を流した（131 本中 58 本が不合格）。原因ごとに直した（下の「直したこと」）。公開した所で 2 回目を流す |
| 【2】間違えた時の道（`tools/scenarios/verify-wrong.mjs`） | まだ |
| 【3】1280x720 で確かめる | まだ |
| 【4】ミッション 6 本を通しで遊ぶ（`tools/scenarios/verify-mission.mjs`） | まだ |
| 【5】「想定した失敗」の 8 本を、人の目で見直す | まだ |
| 【6】不合格の画像を残す | 【1】1 回目の 73 枚を `docs/progress/shots/verify-free/` に置いた |

## 【1】台本

```text
node tools/scenarios/verify-free.mjs                 全て（失敗しても止めず、最後まで流す。VERIFY_JOBS で同時に通す数）
node tools/scenarios/verify-free.mjs linux k8s.b.01  分野か ID で絞る（前の結果の該当する行だけを置き換える）
node tools/scenarios/verify-free.mjs --table         前の結果（shots/verify-free/results.json）から表だけを作り直す
VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ を付けると、公開した所に対して流す
```

- 別解は `tools/scenarios/variants/<レッスンID>.json`。全 131 本に、2 通り以上（全部で 268 通り）。確かめるための台本側の持ち物で、レッスンの中身（`content/lessons/**`）は変えない。
  手順ごとに、端末・SQL は打つ行（答える手順は最後の物が答え）、設定の編集は保存する中身、画面の操作（模）は操作を書く。
  模の並べる操作は `dropOrder: "reverse"` で下の段から置く（順番の入れ替え）。間違える時の物（【2】で使う）は `wrong` に書く
- 1 つの別解ごとに新しい記録（空の localStorage）で、`tools/scenarios/verify-lesson.mjs` と同じ道（都市 → 学ぶ → 学習ライブラリ → 入口の札 → 解説 → 理解 → クイズ → 実戦 → 結果 → まとめ → 都市）を通す。違いは 2 つ
  - ヒントを一度も開かない
  - 実戦で、最後のヒントの操作の代わりに、別解を行う
- 合格の条件（1 つの別解ごと。レッスンは全ての別解が合格で合格）
  - 全ての手順が達成になる（結果の「できたこと」に全て並び、「まだの手順」が無い）
  - 正しい操作をしたのに、エラーの案内が出ていない。案内は出るたびに拾う（何枚も運ぶ操作は 1 枚放すたびに見る。次の操作で消える案内も逃さない）。
    出てよいのは、想定した失敗の手順（`docs/progress/verify-all.md` の C2 の一覧のレッスンで、その手順の想定エラーが、その手順の間に出た物）だけ
  - まとめの XP の内訳の「実戦の成功」が、ヒント無しの満額（入門 20・中級 35・上級 55。`docs/game-design.md` 3 章）
  - XP とスキルが増え、都市に戻れる。ページの誤り（pageerror）が無い
- 速い下見: ブラウザを使わず、画面と同じ関数（`afterCommand`）で別解を人と同じ順に通す `playSteps`・`playSqlSteps`（`src/learning/practice.ts`）。
  ブラウザで不合格だった物は、全て下見でも不合格だった（下見に無い物は、模の並べる途中の案内と、想定した失敗の一覧に無いレッスンの想定エラーだけ）

## 【1】1 回目（直す前）

- 流した日: 2026-10-23。相手: 公開 URL（https://swallowsaba.github.io/swallow/devlearn-arena/ 。配信されていたのは c681ecc の物。それより後のコミットは文書と台本だけ）
- 画面: 1920×1080。4 通りずつ同時に流し、268 通りで 959 秒
- **131 本中、合格 73・不合格 58（別解 268 通り中、不合格 73 通り）**
- 合格した 195 通りは、全て実戦の XP がヒント無しの満額（入門 20・中級 35）で入った（ヒントありの半分になった物は無い）。都市にも全て戻れた
- 不合格は全て実戦で止まった（解説・理解・クイズ・結果・まとめ・都市へ戻るで止まった物は無い）

### 不合格の内訳（起きたこと）

| 起きたこと | 通り | 別解 |
|---|---|---|
| 正しい操作で、想定していないエラーの案内が出た | 38 | linux.b.07#1 linux.i.04#2 linux.i.06#2 linux.i.07#1 linux.i.08#2 net.b.04#1 net.b.06#1 net.i.02#2 net.i.03#2 web.b.04#1 web.b.05#2 web.b.06#2 web.b.08#1 sec.b.04#1 sec.b.07#1 git.b.01#1 git.b.01#2 git.b.03#1 git.b.04#2 git.b.06#2 git.i.01#2 git.i.02#2 git.i.04#2 git.i.05#2 ctr.b.03#2 ctr.i.02#2 ctr.i.03#1 ctr.i.04#2 docker.b.03#1 docker.b.03#2 docker.b.05#1 docker.b.05#2 docker.i.02#2 docker.i.03#1 docker.i.03#2 docker.i.04#1 docker.i.05#1 k8s.i.06#2 |
| 全ての操作をしたのに、まだの手順がある | 19 | found.b.08#2 linux.b.01#1 linux.b.01#2 linux.b.04#1 linux.b.04#2 linux.b.08#2 linux.i.06#1 linux.i.07#2 linux.i.08#3 web.b.06#1 web.i.04#1 sec.b.05#2 trouble.b.02#2 cicd.b.01#1 ctr.b.04#1 docker.i.01#1 k8s.b.05#1 k8s.i.01#1 k8s.i.05#2 |
| 前の手順が満たされず、答えの欄が出ないまま進めない（台本が 30 秒待って止まった） | 7 | linux.b.00#2 sec.b.04#2 sec.b.07#2 docker.b.02#1 docker.b.02#2 k8s.b.07#1 mon.b.02#1 |
| 想定した失敗の一覧に無いレッスンで、その手順の想定エラーの案内が出た（並べる途中の 1 枚で出た物を含む） | 9 | found.b.07#1 net.b.01#2 web.b.07#1 sec.b.02#1 sec.b.03#1 docker.i.04#2 k8s.i.08#1 devops.b.03#1 devops.b.03#2 |

下見（`playSteps`）で 1 行ずつの出力を見ると、原因は次の 5 つに分かれる。原因ごとにまとめて直す（直した後に、この下に「直したこと」を書く）。

- F1 模擬環境が、別の正しい書き方を知らない（`docker container ls`・`docker image pull`・`docker logs --tail 20`・`docker stop -t 1`・`--mount`・`exec 名前 sh -c`・`git add -A`・`git log -S`・
  `git checkout 記録 -- ファイル`・`kubectl -n dev create …`・`find -exec`・`find -iname`・`head -c 3`・`uname --kernel-name`・`ip -4 addr show eth0`・`iptables -R` など）
- F2 判定が、打った文字そのものに頼っている（`ls -al` が `ls -l` の文字を含まない・`"$HOME/bin"` が `$HOME/bin` の文字と違う・`00 02 * * *`・`grep -c` で数えると `wc` を使っていない）
- F3 別のコマンドを動かすコマンドが、動かした先の変化を捨てる（`… | xargs kubectl delete` で消した Pod が戻る。`xargs` はファイルの変化しか返さなかった）
- F4 正しい途中・様子見の操作に、エラーの案内が当たる（模の札を並べる途中の 1 枚・別の機械からの `nmap`）
- F5 別解そのものの誤り（台本側。例: `~/.ssh` が無いのに `ssh-keygen -f ~/.ssh/id_ed25519`。本物でも失敗する）

### 直したこと（【1】1 回目の後）

先に、全 268 通りを画面と同じ関数で通す失敗するテスト（`src/content/variants.test.ts`）を書き、原因ごとに、その振る舞いのテストを書いてから直した。

- F1 模擬環境に、本物にある書き方を足した（テスト: `src/engines/docker/alternatives.test.ts`・`src/engines/kernel/commands/gitAlternatives.test.ts`・`linuxAlternatives.test.ts`・`awk.test.ts` ほか）
  - docker・podman: `container …`・`image …` の管理の命令の形、置き場まで書いた名前、`logs --tail`・`-n`、`stop -t`、`network create --driver`、`top`、`--mount`、`exec 名前 sh -c "…"`・`grep`、中の相対パスはイメージの WORKDIR から、`COPY package*.json ./`（* の写す元）、`psql` で DB を書かなければ初めから在る `postgres` の DB
  - git: `add -A`・`checkout 記録 -- ファイル`・`log -S`・`log ファイル`・`rev-list --count`・`diff --name-only`・`config --get`・取り込みの途中の `commit --no-edit`・`rebase 先 枝`
  - Linux: `awk`（無かった。列・`-F`・`NR`・`BEGIN`・`END`・配列・`printf`・`gsub` など）、`gpasswd -a`・`sg グループ -c`、`find -exec … {} +`・`-iname`・`-maxdepth`、`head -c`、`uname --kernel-name`、`pkill -f`、`sed -e` を何度も・`c`・`a`・`i`、代入とリダイレクト先の `~`（ssh で入ったサーバでは、そこのホーム）、どの機械にも `/tmp`
  - 網・Web: `ip -4 addr show eth0`、網の構成が無い機械の `netstat -tlnp`、`rndc reload`、`iptables -nL`・`-R`、`curl -D -`・`-d` を 2 つ、`nginx -s reload`、nginx の `expires 1y`、`sshd` は `ssh` のサービスの別名、`cat 鍵.pub | ssh サーバ 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'`（ssh に流し込んだ物をサーバの命令が読む）
  - Kubernetes: 区画の旗を命令の前に書く（`kubectl -n dev get pods`）、`rollout undo --to-revision 2`、設計図（template）の注釈を変えると Pod を作り直す、確かめ（probe）のポートを名前（`port: http`）で指す、HPA を様子見の後で付けても `get hpa -w` が増えるまで見る
  - GitHub Actions の判定: `npm run test` は `npm test` と同じ手順として当てる
- F2 判定を、打った文字から結果と状態に替えた（`docs/content-spec.md` 2.4 に書いた）
  - `ran` に `shows`（出力にその行が全てある）を足した。linux.b.01 の 2 つの手順を、履歴の文字から `ran` に替えた（`pwd` の結果・`ls` の詳しい一覧の行）
  - 数える手順で、ファイルごとの数（`grep -rc` の「名前:数」）は合計で比べる。linux.b.04・mon.b.02 の `uses` から `wc` を外した（`grep -c` で数えてもよい）。一致した行を並べて見ただけでは「合っていない」を出さない
  - 答えの欄: 数の後ろの単位（`3 バイト`）と、場所の最後の `/`（`/srv/report/out/`）を問わない
  - linux.i.06（`bin:$PATH` を含む）・linux.i.08（`/srv/backup.sh` の行がある。時刻は次の手順の `timeskip` で確かめる）・sec.b.05（`WEATHER_TOKEN` を含み、鍵の値が無い）の `fs` の文字を、書き方に依らない形にした
- F3 `xargs`・`find -exec`・`sg`・`nginx -s`・`rndc` は、動かした先で変わった物を全て返す（`changedState`）
- F4 正しい途中・様子見の操作に案内を当てない
  - 模: 並べるは、式に出てくる札が全て並ぶまで出来上がりと見ない。札を置き場へ戻した後と、置くで条件を 1 つ満たして崩さなかった後は「答えが合っていない」を出さない（`settledAfter`。sec.b.02・sec.b.03・devops.b.03）
  - `docker-name-unresolved` の出力への当て方を、頼む命令（`curl`・`ping` など）だけにした（`docker logs` で様子を見ても出さない）。`sec-chain-incomplete` も `curl` だけ（`openssl s_client` の正しい出力に当てない）
- F5 別解の誤りを直した（git.i.01 #2: 鍵の無い SSH で複製を試してから https で複製する道を、場所を移ってから複製する道に。sec.b.04 #2: `~/.ssh` を作ってから `ssh-keygen -f`）
- 想定した失敗のレッスン: 目的の文そのものが、失敗を見て読むことを書いている手順を、C2 の一覧に足した（最後のヒントは先に直すので通らないが、目的の文のとおりに打つと通る）。
  found.b.07（「ping サーバ」で、どこで止まるかを見る）・net.b.01（本社のサーバへ送り、どこで止まるかを見る）・k8s.i.08（1.2 を配り、入れ替えが進むかを見る）・
  sec.b.07（`curl https://shop.example/` の誤りを読み…。この手順の想定エラーに `sec-chain-incomplete` を足した）・web.b.07（curl で確かめ、200 とページが返らなければ、返事の数から原因を探す）
- 下見で全 268 通りが通ることを確かめた（`src/content/variants.test.ts`）。並べるの arrange を、ブラウザの台本と同じく 1 枚ずつのドラッグに分けて通しても、途中で案内は出ない

### 表（1 回目）

別解の欄は「番号○×」。不合格の物は、止まった段階と起きたことを書く。画像は不合格の瞬間（エラーの案内が出た瞬間か、止まった瞬間）の画面。

| レッスン | 結果 | 別解 | 起きたこと | 画像 |
|---|---|---|---|---|
| found.b.01 | 合格 | 1○ 2○ |  |  |
| found.b.02 | 合格 | 1○ 2○ |  |  |
| found.b.03 | 合格 | 1○ 2○ |  |  |
| found.b.04 | 合格 | 1○ 2○ |  |  |
| found.b.05 | 合格 | 1○ 2○ |  |  |
| found.b.06 | 合格 | 1○ 2○ |  |  |
| found.b.07 | 不合格 | 1× 2○ | #1「プロバイダからルータへ逆向きに線を引く」[実戦] 正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: {"op":"send","from":"pc","to":"server"} → not-reached | `docs/progress/shots/verify-free/found.b.07-1.png` |
| found.b.08 | 不合格 | 1○ 2× | #2「パイプで当てる・CP932 から読み直す」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: 同じ文字「こ」の 0 と 1 を見比べる。xxdの -b は、ファイルの中身を 0 と 1 で、8 けた（8 ビット＝1 バイト）ずつ区切って出す。xxd -b -l 2 matsuri.txt と xxd -b -l 3 matsuri-utf8.txt を打ち、UTF-8 では「こ」1 文字が何バイトかを答える。（端末: matsuri.txt > matsuri-utf8.txt learner@city-hall:~$ head -n 1 matsuri-utf8.txt こんにちは。港の祭りは土曜日です。 learner@ci… | `docs/progress/shots/verify-free/found.b.08-2.png` |
| linux.b.00 | 不合格 | 1○ 2× | #2「長い名前の指定・ファイルを読み込んで変数で見る」[実戦] 台本が進めない: page.click: Timeout 30000ms exceeded. | `docs/progress/shots/verify-free/linux.b.00-2.png` |
| linux.b.01 | 不合格 | 1× 2× 3○ | #1「ls -al（並びの違い）」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: ホームディレクトリ（~）の中身を、詳しい形で一覧する。（端末: home/learner learner@arena:~$ ls -al ~ drwxr-xr-x 1 learner learner 4096 ./ drwxr-xr-x 1 learner learner 4096 ../ -rw-r--r-- 1 learner learner 7 .bash_history -rw-r--r-- 1 learner learner 36 notes.txt drwxr-xr-x 1 learner learner 4096 photo… ／ #2「ls --all -l（長い名前）」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: ホームディレクトリ（~）の中身を、詳しい形で一覧する。（端末: # help で使えるコマンドの一覧が出る learner@arena:~$ pwd && ls /home/learner notes.txt photos/ plan.txt learner@arena:~$ ls --all -l /home/learner -rw-r--r-- 1 learner learner 36 notes.txt drwxr-xr-x 1 learner learner 4096 photos/ -rw-r--r-- 1 learner le… | `docs/progress/shots/verify-free/linux.b.01-1.png` `docs/progress/shots/verify-free/linux.b.01-2.png` |
| linux.b.02 | 合格 | 1○ 2○ |  |  |
| linux.b.03 | 合格 | 1○ 2○ |  |  |
| linux.b.04 | 不合格 | 1× 2× 3○ | #1「grep -rc で数える・-type f を付けて探す」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: /var/log の中の全てのファイルから timeout を含む行を探し、その行の数を出す。 ／ app.conf という名前のファイルを、/ から探し、その場所（パス）を出す。（端末: # help で使えるコマンドの一覧が出る learner@arena:~$ grep -rc timeout /var/log grep: /var/log/secure: Permission denied /var/log/app/batch.log:1 /var/log/app/web.log:2 learner@arena:~$ find /… ／ #2「find -exec grep -c で数える・-iname で探す」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: /var/log の中の全てのファイルから timeout を含む行を探し、その行の数を出す。 ／ app.conf という名前のファイルを、/ から探し、その場所（パス）を出す。（端末: /var/log/app/web.log /var/log/secure learner@arena:~$ find / -iname app.conf 2>/dev/null / /dev /dev/null /etc /etc/app /etc/app/app.conf /home /home/learner /home/learner/.bash… | `docs/progress/shots/verify-free/linux.b.04-1.png` `docs/progress/shots/verify-free/linux.b.04-2.png` |
| linux.b.05 | 合格 | 1○ 2○ |  |  |
| linux.b.06 | 合格 | 1○ 2○ |  |  |
| linux.b.07 | 不合格 | 1× 2○ | #1「gpasswd で入れる・sg で書く」[実戦] 正しい操作でエラーの案内が出た: sudo gpasswd -a learner web → エラーが出た。調べてみよう sudo gpasswd -a learner web gpasswd: command not found 何と言われたか その名前の命令（コマンド）が見つからなかった。 考えられる理由 命令の綴りが違う（1 文字の打ち間違い）。 大文字と小文字が違う。Linux では ls と LS は ／ sg web -c 'touch /srv/web/index.html' → エラーが出た。調べてみよう sg web -c 'touch /srv/web/index.html… | `docs/progress/shots/verify-free/linux.b.07-1.png` |
| linux.b.08 | 不合格 | 1○ 2× | #2「top を一度だけ・名前で止める」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: 見つけた処理だけを止め、一覧から消えたことを確かめる。（端末: 6 free, 386 used PID USER %CPU MEM(MiB) COMMAND 102 learner 98.7 210 python3 resize.py 100 learner 1.2 48 nginx: worker process 101 learner 0.4 96 python3 report.py 103 root 0.1 12 /usr/sbin/sshd 1 root 0.0 8 /sbin/init 2 learner 0.0 12 /bi… | `docs/progress/shots/verify-free/linux.b.08-2.png` |
| linux.i.01 | 合格 | 1○ 2○ |  |  |
| linux.i.02 | 合格 | 1○ 2○ |  |  |
| linux.i.03 | 合格 | 1○ 2○ |  |  |
| linux.i.04 | 不合格 | 1○ 2× | #2「口を絞って見る・netstat」[実戦] 正しい操作でエラーの案内が出た: ip -4 addr show eth0 → エラーが出た。調べてみよう ip -4 addr show eth0 ネットワークが用意されていません。ネットワークの任務を選んでください。 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマンドの名前や、その後に書いた名前・場所の綴りが違う。 この場面 ／ netstat -tlnp → エラーが出た。調べてみよう netstat -tlnp ネットワークが用意されていません。ネットワークの任務を選んでください。 何と言われたか コマンドがうまくい… | `docs/progress/shots/verify-free/linux.i.04-2.png` |
| linux.i.05 | 合格 | 1○ 2○ |  |  |
| linux.i.06 | 不合格 | 1× 2× | #1「引用符で囲んだ PATH・. で読み直す」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: 次にログインした時も効くように、シェルの設定ファイル ~/.bashrc の最後に、~/bin を PATH の先頭に足す行を書く。 ／ 今のシェルにも設定を読み直させ、report を名前だけで動かす。（端末: # help で使えるコマンドの一覧が出る learner@arena:~$ echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc learner@arena:~$ . ~/.bashrc learner@arena:~$ report report: done learner@ar… ／ #2「~ で書く PATH・場所を書いて読み直す」[実戦] 正しい操作でエラーの案内が出た: source /home/learner/.bashrc && report → エラーが出た。調べてみよう source /home/learner/.bashrc && report report: command not found 何と言われたか その名前の命令（コマンド）が見つからなかった。 考えられる理由 命令の綴りが違う（1 文字の打ち間違い）。 大文字と小文字が違う。Linux では。最後のヒントの操作を全て行ったのに、まだの手順がある: 次にログインした時も効くように、シェルの設定ファイル ~/.bashrc の最後に、~/bin を PAT… | `docs/progress/shots/verify-free/linux.i.06-1.png` `docs/progress/shots/verify-free/linux.i.06-2.png` |
| linux.i.07 | 不合格 | 1× 2× | #1「awk で使用率を取る・sh で動かす」[実戦] 正しい操作でエラーの案内が出た: cat alert.txt → エラーが出た。調べてみよう cat alert.txt cat: alert.txt: No such file or directory 何と言われたか 「そのようなファイルやディレクトリは無い」と言われた。打ったパスの先に、何も見つからなかった。 考えられる理由 名前の綴りが違う（1 文字の打ち間違い・大文字と小文。最後のヒントの操作を全て行ったのに、まだの手順がある: check.sh を名前で動かし、警告が書き出されることを確かめる。（端末: #!/bin/sh > used=$(df / \| awk 'NR==2 {p… ／ #2「&& で 1 行にする・u+x で動かす」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: check.sh を名前で動かし、警告が書き出されることを確かめる。（端末: るコマンドの一覧が出る learner@arena:~$ cat > check.sh <<'EOF' > #!/bin/bash > used=$(df -P / \| tail -1 \| awk '{print $5}' \| sed 's/%//') > [ "$used" -gt 80 ] && echo "警告: ディスクを ${used}% 使っている" > alert.txt > EOF learner@arena:~$ chmod u+x check… | `docs/progress/shots/verify-free/linux.i.07-1.png` `docs/progress/shots/verify-free/linux.i.07-2.png` |
| linux.i.08 | 不合格 | 1○ 2× 3× | #2「ファイルに書いて crontab に渡す」[実戦] 正しい操作でエラーの案内が出た: echo '0 2 * * * /srv/backup.sh >> /var/log/backup.log 2>&1' > /tmp/mycron → エラーが出た。調べてみよう echo '0 2 * * * /srv/backup.sh >> /var/log/backup.log 2>&1' > /tmp/mycron echo: /tmp: No such file or directory 何と言われたか 「そのようなファイルやディレクトリは無い」と言われた ／ crontab /tmp/mycron → エラーが出た。調べてみよう crontab … ／ #3「分と時を 2 けたで書く」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: 毎日 2 時 0 分に /srv/backup.sh を動かし、出力とエラーを /var/log/backup.log に足す仕事を登録する。 ／ 模擬の時計を 2 時より後まで進め、仕事が動いて記録が残ったことを確かめる。この機械には、時計を進める timeskip がある（本物の Linux には無い）。（端末: # help で使えるコマンドの一覧が出る root@db01:/root# echo '00 02 * * * /srv/backup.sh >> /var/log/backup.log 2>&1' \| crontab -… | `docs/progress/shots/verify-free/linux.i.08-2.png` `docs/progress/shots/verify-free/linux.i.08-3.png` |
| net.b.01 | 不合格 | 1○ 2× | #2「先に線を引いてから LAN の中を確かめる」[実戦] 正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: {"op":"send","from":"pc","to":"srv"} → net-lan-only | `docs/progress/shots/verify-free/net.b.01-2.png` |
| net.b.02 | 合格 | 1○ 2○ |  |  |
| net.b.03 | 合格 | 1○ 2○ | 想定した案内: net-unreachable（`ping -c 3 192.168.10.1`）・net-host-unreachable（`ping -c 1 192.168.10.13`）・net-unreachable（`ping -c 1 192.168.10.1`） |  |
| net.b.04 | 不合格 | 1× 2○ | #1「先に古い Web を止めてから直す」[実戦] 正しい操作でエラーの案内が出た: systemctl restart sshd → エラーが出た。調べてみよう systemctl restart sshd Failed to restart sshd.service: Unit sshd.service not found. 何と言われたか 「その名前のサービスは登録されていない」と言われた。systemd が知らない名前を指定した。 考えられる理。最後のヒントの操作を全て行ったのに、まだの手順がある: SSH のサーバを、既定の 22 番で待たせる。設定 /etc/ssh/sshd_config の Port の行を直し、ssh を動かし… | `docs/progress/shots/verify-free/net.b.04-1.png` |
| net.b.05 | 合格 | 1○ 2○ |  |  |
| net.b.06 | 不合格 | 1× 2○ | #1「+short を後ろに・rndc で読み直す」[実戦] 正しい操作でエラーの案内が出た: rndc reload → エラーが出た。調べてみよう rndc reload rndc: command not found 何と言われたか その名前の命令（コマンド）が見つからなかった。 考えられる理由 命令の綴りが違う（1 文字の打ち間違い）。 大文字と小文字が違う。Linux では ls と LS は別の物。 次に確かめること 打った行の。最後のヒントの操作を全て行ったのに、まだの手順がある: 名前の答えを書いたゾーンファイル（/etc/bind/db.shop.example）の古いアドレスを新しいアドレスに直し、DNS のサーバ（named）に読み… | `docs/progress/shots/verify-free/net.b.06-1.png` |
| net.b.07 | 合格 | 1○ 2○ |  |  |
| net.b.08 | 合格 | 1○ 2○ |  |  |
| net.i.01 | 合格 | 1○ 2○ | 想定した案内: net-one-way（`ip netns exec srv-c ping -c 1 10.0.1.10`） |  |
| net.i.02 | 不合格 | 1○ 2× | #2「規則を置き換える・NEW だけ通す」[実戦] 正しい操作でエラーの案内が出た: ip netns exec outside curl -s https://203.0.113.5/ → エラーが出た。調べてみよう ip netns exec outside curl -s https://203.0.113.5/ curl: (28) Failed to connect to 203.0.113.5 port 443: Connection timed out 何と言われたか 名前で届けようとしたが、。最後のヒントの操作を全て行ったのに、まだの手順がある: 誤った転送の規則を消し、外（eth0）から来た 443 番を web の 192.… | `docs/progress/shots/verify-free/net.i.02-2.png` |
| net.i.03 | 不合格 | 1○ 2× | #2「DROP を消して最後に付け直す・規則を置き換える」[実戦] 正しい操作でエラーの案内が出た: iptables -nL INPUT --line-numbers → エラーが出た。調べてみよう iptables -nL INPUT --line-numbers iptables v1.8.10 (nf_tables): no command specified Try `iptables -h' or 'iptables --help' for more information. 。最後のヒントの操作を全て行ったのに、まだの手順がある: 誰からでも入れる SSH の許可（tcp dpt:22）を消し、社内の網（10.0.0.0/8）からだけ 22 番を… | `docs/progress/shots/verify-free/net.i.03-2.png` |
| net.i.04 | 合格 | 1○ 2○ |  |  |
| net.i.05 | 合格 | 1○ 2○ |  |  |
| net.i.06 | 合格 | 1○ 2○ |  |  |
| web.b.01 | 合格 | 1○ 2○ |  |  |
| web.b.02 | 合格 | 1○ 2○ |  |  |
| web.b.03 | 合格 | 1○ 2○ |  |  |
| web.b.04 | 不合格 | 1× 2○ | #1「xargs で 1 つずつ送る」[実戦] 正しい操作でエラーの案内が出た: cat urls.txt \| xargs -n 1 curl -I → エラーが出た。調べてみよう cat urls.txt \| xargs -n 1 curl -I xargs: option requires an argument -- 'I' 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマンドの名前や、その後に書 | `docs/progress/shots/verify-free/web.b.04-1.png` |
| web.b.05 | 不合格 | 1○ 2× | #2「grep で見出しを拾う・-D で頭を出す」[実戦] 正しい操作でエラーの案内が出た: curl -s -D - -o /dev/null http://shop.example/menu → エラーが出た。調べてみよう curl -s -D - -o /dev/null http://shop.example/menu curl: (6) Could not resolve host: - 何と言われたか 「その名前が見つからない」と言われた。アプリが、相手のコンテナの名前から IP アドレスを引けなかった | `docs/progress/shots/verify-free/web.b.05-2.png` |
| web.b.06 | 不合格 | 1× 2× | #1「置き換えの式を広く・-e で 2 つ直す」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: 札が盗まれにくいように、php.ini の session.cookie_secure（暗号化した通信 HTTPS の時だけ送る）と session.cookie_httponly（ページの中のプログラムから読めなくする）を、両方 On にする。apache2 を再起動し、ログインの返事の Set-Cookie に secure と HttpOnly が付いたことを確かめる。（端末: ssion.cookie_httponly = On/' /etc/php/8.3/apache2/php.ini root@shop-web:/root#… ／ #2「-d を 2 つに分ける・行を選んで直す」[実戦] 正しい操作でエラーの案内が出た: cat cookies.txt → エラーが出た。調べてみよう cat cookies.txt cat: cookies.txt: No such file or directory 何と言われたか 「そのようなファイルやディレクトリは無い」と言われた。打ったパスの先に、何も見つからなかった。 考えられる理由 名前の綴りが違う（1 文字の打ち間違い・大文 | `docs/progress/shots/verify-free/web.b.06-1.png` `docs/progress/shots/verify-free/web.b.06-2.png` |
| web.b.07 | 不合格 | 1× 2○ | #1「名前まで書いて写す・o+r で読めるようにする」[実戦] 正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: curl -I http://localhost/ → web-403 | `docs/progress/shots/verify-free/web.b.07-1.png` |
| web.b.08 | 不合格 | 1× 2○ | #1「c で行を置き換える・nginx -s reload」[実戦] 正しい操作でエラーの案内が出た: sed -i '4c\ return 301 https://$host$request_uri;' /etc/nginx/conf.d/city.conf → エラーが出た。調べてみよう sed -i '4c\ return 301 https://$host$request_uri;' /etc/nginx/conf.d/city.conf sed: unsupported command: 4c\ return 301 https://$host$request_uri（ ／ nginx -s reload → エラーが出た。調べてみよう nginx -… | `docs/progress/shots/verify-free/web.b.08-1.png` |
| web.i.01 | 合格 | 1○ 2○ |  |  |
| web.i.02 | 合格 | 1○ 2○ 3○ |  |  |
| web.i.03 | 合格 | 1○ 2○ |  |  |
| web.i.04 | 不合格 | 1× 2○ | #1「引用符を付けない値・expires で 1 年」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: 変わらない画像（location /images/）は、長く（1 年 = 31536000 秒）保存して、開くたびに取り直さないようにする。確かめた結果で、http://port.example/images/logo.v3.png の返事が Cache-Control: max-age=31536000 になったことを見る。 | `docs/progress/shots/verify-free/web.i.04-1.png` |
| web.i.05 | 合格 | 1○ 2○ |  |  |
| web.i.06 | 合格 | 1○ 2○ |  |  |
| sec.b.01 | 合格 | 1○ 2○ |  |  |
| sec.b.02 | 不合格 | 1× 2○ | #1「見る操作から入れる・運営係から」[実戦] 正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: {"op":"put","item":"全員の予約を見る","slot":"窓口係"}（途中の 1 枚） → sec-authz-excess | `docs/progress/shots/verify-free/sec.b.02-1.png` |
| sec.b.03 | 不合格 | 1× 2○ | #1「強い札を先に入れてから弱い札を戻す」[実戦] 正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: {"op":"put","item":"lock","slot":"rules"}（途中の 1 枚） → sec-password-weak ／ {"op":"take","item":"free"}（途中の 1 枚） → sec-password-weak | `docs/progress/shots/verify-free/sec.b.03-1.png` |
| sec.b.04 | 不合格 | 1× 2× | #1「名前の印を付けて作る・-i を省いて登録する」[実戦] 正しい操作でエラーの案内が出た: ssh deploy@web01 'cat ~/.ssh/authorized_keys' → エラーが出た。調べてみよう ssh deploy@web01 'cat ~/.ssh/authorized_keys' cat: ~/.ssh/authorized_keys: No such file or directory 何と言われたか 「そのようなファイルやディレクトリは無い」と言われた。打ったパスの先に、何 ／ #2「置き場所と空の合言葉を指定して作る・手で足す」[実戦] 台本が進めない: page.click: Timeout 30000ms exceeded. | `docs/progress/shots/verify-free/sec.b.04-1.png` `docs/progress/shots/verify-free/sec.b.04-2.png` |
| sec.b.05 | 不合格 | 1○ 2× | #2「引用符と {} で読む・まとめて記録する」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: app.sh から鍵の値を消し、環境変数 WEATHER_TOKEN から読む形に直す。 ／ 鍵の値は、リポジトリに入れない .env に置く。.env を .gitignore に足して、記録の対象から外す。 ／ .env の値を環境変数に読み込んで、app.sh が動くことを確かめる（掲示板 board.txt ができる）。 ／ 直した app.sh と .gitignore だけを記録する。記録にも履歴にも、鍵の値が入っていない状態にする。（端末: ." to unstage) new file: .gitignore new fi… | `docs/progress/shots/verify-free/sec.b.05-2.png` |
| sec.b.06 | 合格 | 1○ 2○ |  |  |
| sec.b.07 | 不合格 | 1× 2× | #1「-showcerts で見る・cd してつなぐ・動かし直す」[実戦] 正しい操作でエラーの案内が出た: curl https://shop.example/ → エラーが出た。調べてみよう curl https://shop.example/ curl: (60) SSL certificate problem: unable to get local issuer certificate 何と言われたか curl が、サーバの証明書の発行者を、手元で信頼するルートまでたどれな ／ #2「標準入力を空にして打つ・nginx -s reload」[実戦] 台本が進めない: page.click: Timeout 30000ms exceeded. | `docs/progress/shots/verify-free/sec.b.07-1.png` `docs/progress/shots/verify-free/sec.b.07-2.png` |
| git.b.01 | 不合格 | 1× 2× | #1「1 行ずつの履歴・checkout -- で取り出す」[実戦] 正しい操作でエラーの案内が出た: git checkout 11da075 -- plan.txt → エラーが出た。調べてみよう git checkout 11da075 -- plan.txt fatal: invalid reference: 11da075 何と言われたか その名前の枝が見つからない。 考えられる理由 まだ枝を作っていない（作って移るのは git switch -c）。 枝の名前の綴りが違う。 次。最後のヒントの操作を全て行ったのに、まだの手順がある: 見つけた版の設計図を、記録から取り出して、今の plan.txt に書き戻す。履歴は消さずに残す。（端末: # hel… ／ #2「差分つきの履歴・HEAD~2 から取り出す」[実戦] 正しい操作でエラーの案内が出た: git log -p plan.txt → エラーが出た。調べてみよう git log -p plan.txt fatal: ambiguous argument 'plan.txt': unknown revision or path not in the working tree. 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起き | `docs/progress/shots/verify-free/git.b.01-1.png` `docs/progress/shots/verify-free/git.b.01-2.png` |
| git.b.02 | 合格 | 1○ 2○ |  |  |
| git.b.03 | 不合格 | 1× 2○ | #1「日付で絞る・-S で値の変わった記録を探す」[実戦] 正しい操作でエラーの案内が出た: git log -S timeout=3 --oneline → エラーが出た。調べてみよう git log -S timeout=3 --oneline fatal: ambiguous argument 'timeout=3': unknown revision or path not in the working tree. 何と言われたか コマンドがうまくいかず、エラーの文が | `docs/progress/shots/verify-free/git.b.03-1.png` |
| git.b.04 | 不合格 | 1○ 2× | #2「作ってから移る・printf で足す・数を数える」[実戦] 正しい操作でエラーの案内が出た: git rev-list --count main → エラーが出た。調べてみよう git rev-list --count main git: 'rev-list' is not a git command. See 'git help'. 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマンドの名前や、そ | `docs/progress/shots/verify-free/git.b.04-2.png` |
| git.b.05 | 合格 | 1○ 2○ |  |  |
| git.b.06 | 不合格 | 1○ 2× | #2「衝突したファイルだけを出す・ヒアドキュメント・--no-edit」[実戦] 正しい操作でエラーの案内が出た: git add -A → エラーが出た。調べてみよう git add -A Nothing specified, nothing added. 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマンドの名前や、その後に書いた名前・場所の綴りが違う。 この場面では使えない書き方をした ／ git commit --no-edit → エラーが出た。調べてみよう git commit --no-edit error: メッセージが要ります。git commit -m "..." の形で指定してください… | `docs/progress/shots/verify-free/git.b.06-2.png` |
| git.i.01 | 不合格 | 1○ 2× | #2「SSH で断られてから https で複製・設定から読む」[実戦] 正しい操作でエラーの案内が出た: git config --get remote.origin.url → エラーが出た。調べてみよう git config --get remote.origin.url git: 'config' is not a git command. See 'git help'. 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマン | `docs/progress/shots/verify-free/git.i.01-2.png` |
| git.i.02 | 不合格 | 1○ 2× | #2「取ってきた物を merge で取り込む」[実戦] 正しい操作でエラーの案内が出た: git add -A → エラーが出た。調べてみよう git add -A Nothing specified, nothing added. 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマンドの名前や、その後に書いた名前・場所の綴りが違う。 この場面では使えない書き方をした ／ git commit --no-edit → エラーが出た。調べてみよう git commit --no-edit error: メッセージが要ります。git commit -m "..." の形で指定してください… | `docs/progress/shots/verify-free/git.i.02-2.png` |
| git.i.03 | 合格 | 1○ 2○ |  |  |
| git.i.04 | 不合格 | 1○ 2× | #2「-S で値を探す・番号で打ち消す」[実戦] 正しい操作でエラーの案内が出た: git log -S 3500 --oneline → エラーが出た。調べてみよう git log -S 3500 --oneline fatal: ambiguous argument '3500': unknown revision or path not in the working tree. 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が | `docs/progress/shots/verify-free/git.i.04-2.png` |
| git.i.05 | 不合格 | 1○ 2× | #2「載せ替える枝を書いて 1 行で・ヒアドキュメント」[実戦] 正しい操作でエラーの案内が出た: git add -A → エラーが出た。調べてみよう git add -A Nothing specified, nothing added. 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマンドの名前や、その後に書いた名前・場所の綴りが違う。 この場面では使えない書き方をした ／ git rebase --continue → エラーが出た。調べてみよう git rebase --continue fatal: No rebase in progress? 何と言われたか コマンドがうまくい… | `docs/progress/shots/verify-free/git.i.05-2.png` |
| git.i.06 | 合格 | 1○ 2○ |  |  |
| trouble.b.01 | 合格 | 1○ 2○ |  |  |
| trouble.b.02 | 不合格 | 1○ 2× | #2「bash で動かす・場所を / で終える」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: 5 つ目: 日報を作るスクリプト sh /srv/report/build.sh を打つ。エラーが何行も出る。最初の誤りを読み、無かったディレクトリの場所を答える。（端末: e port 8080: Connection refused learner@ops:~$ bash /srv/report/build.sh cp: cannot create regular file '/srv/report/out/today.txt': No such file or directory sed: can't read /srv/repor… | `docs/progress/shots/verify-free/trouble.b.02-2.png` |
| trouble.b.03 | 合格 | 1○ 2○ 3○ |  |  |
| db.b.01 | 合格 | 1○ 2○ |  |  |
| db.b.02 | 合格 | 1○ 2○ |  |  |
| db.b.03 | 合格 | 1○ 2○ |  |  |
| db.b.04 | 合格 | 1○ 2○ |  |  |
| db.b.05 | 合格 | 1○ 2○ |  |  |
| cicd.b.01 | 不合格 | 1× 2○ | #1「名前を外し npm run test と書く」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: まず、組み立てとテスト（CI）までの流れにする。npm test を npm run build の直後に動かし、npm run deploy の手順は、いったん外す。確かめた結果の gh run view で、#42 が npm test で止まったことを見る。 ／ 検査を通った物だけが本番に届くように、配る手順（CD）を、検査の後ろの一番最後に足す。 | `docs/progress/shots/verify-free/cicd.b.01-1.png` |
| cicd.b.02 | 合格 | 1○ 2○ |  |  |
| cicd.b.03 | 合格 | 1○ 2○ |  |  |
| cicd.b.04 | 合格 | 1○ 2○ |  |  |
| cicd.b.05 | 合格 | 1○ 2○ |  |  |
| ctr.b.01 | 合格 | 1○ 2○ |  |  |
| ctr.b.02 | 合格 | 1○ 2○ |  |  |
| ctr.b.03 | 不合格 | 1○ 2× | #2「sh -c で直す・指定の並びを替える・localhost/ の名前で動かす」[実戦] 正しい操作でエラーの案内が出た: podman exec web sh -c "sed -i 's/17:00/19:00/' server.js" → エラーが出た。調べてみよう podman exec web sh -c "sed -i 's/17:00/19:00/' server.js" この練習の端末では、コンテナの中の対話の端末は開けない。podman exec 名前 コマンド の形で、1 つずつ打つ 何と言われたか コマンドがうまくいかず、エラーの文が出た。最後のヒントの操作を全て行ったのに、まだの手順がある: 更新のたびに、コンテナは消して作り直す。podman rm -f w… | `docs/progress/shots/verify-free/ctr.b.03-2.png` |
| ctr.b.04 | 不合格 | 1× 2○ | #1「package*.json を写してから残りを全て写す」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: Containerfileの命令を、変わる回数の少ない順に上から並べる。npm install が読むのは package.json だけ。確かめた結果で、最後の podman build -t reserve:1.2 . の RUN npm install の下に --> Using cache が出ることを見る。 | `docs/progress/shots/verify-free/ctr.b.04-1.png` |
| ctr.b.05 | 合格 | 1○ 2○ |  |  |
| ctr.i.01 | 合格 | 1○ 2○ |  |  |
| ctr.i.02 | 不合格 | 1○ 2× | #2「ps -ef・docker top・= で書く上限」[実戦] 正しい操作でエラーの案内が出た: docker top web → エラーが出た。調べてみよう docker top web docker: 'top' is not a docker command. See 'docker --help' 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマンドの名前や、その後に書いた | `docs/progress/shots/verify-free/ctr.i.02-2.png` |
| ctr.i.03 | 不合格 | 1× 2○ | #1「止まった物も並べて見る・作ってから確かめる」[実戦] 正しい操作でエラーの案内が出た: podman logs --tail 5 web → エラーが出た。調べてみよう podman logs --tail 5 web Error: no container with name or ID "5" found: no such container 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 | `docs/progress/shots/verify-free/ctr.i.03-1.png` |
| ctr.i.04 | 不合格 | 1○ 2× | #2「--mount の書き方で付ける」[実戦] 正しい操作でエラーの案内が出た: podman run -d --name db --mount type=volume,source=db-data,target=/var/lib/postgresql/data city-db:1.0 → エラーが出た。調べてみよう podman run -d --name db --mount type=volume,source=db-data,target=/var/lib/postgresql/data city-db:1.0 Error: unknown flag: --mount See 'podman ru ／ podman exec db … | `docs/progress/shots/verify-free/ctr.i.04-2.png` |
| ctr.i.05 | 合格 | 1○ 2○ |  |  |
| docker.b.01 | 合格 | 1○ 2○ | 想定した案内: docker-daemon（`docker --version`）・docker-daemon（`docker version`）・docker-daemon（`docker -v`） |  |
| docker.b.02 | 不合格 | 1× 2× | #1「image pull・image ls」[実戦] 台本が進めない: page.click: Timeout 30000ms exceeded. ／ #2「置き場まで書いた名前で取る・名前で絞って見る」[実戦] 台本が進めない: page.click: Timeout 30000ms exceeded. | `docs/progress/shots/verify-free/docker.b.02-1.png` `docs/progress/shots/verify-free/docker.b.02-2.png` |
| docker.b.03 | 不合格 | 1× 2× | #1「--name を先に書く・container の名前の命令」[実戦] 正しい操作でエラーの案内が出た: docker container ls → エラーが出た。調べてみよう docker container ls docker: 'container' is not a docker command. See 'docker --help' 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマンドの ／ docker container stop web → エラーが出た。調べてみよう docker container stop web docker: 'container' is not a d… ／ #2「= で書く・待ち時間を決めて止める・&& でつなぐ」[実戦] 正しい操作でエラーの案内が出た: docker container run -d --name=web nginx:1.27 → エラーが出た。調べてみよう docker container run -d --name=web nginx:1.27 docker: 'container' is not a docker command. See 'docker --help' 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何 ／ docker stop -t 1 web → エラーが出た。調べてみよう docker stop -t 1 web Error response… | `docs/progress/shots/verify-free/docker.b.03-1.png` `docs/progress/shots/verify-free/docker.b.03-2.png` |
| docker.b.04 | 合格 | 1○ 2○ |  |  |
| docker.b.05 | 不合格 | 1× 2× | #1「名前で絞る・末尾だけ読む・grep で root を拾う」[実戦] 正しい操作でエラーの案内が出た: docker logs --tail 20 reserve → エラーが出た。調べてみよう docker logs --tail 20 reserve Error response from daemon: No such container: 20 何と言われたか 「その名前（または ID）のコンテナは無い」と言われた。 考えられる理由 名前の綴りの誤り（web を wed と書 ／ docker exec web grep root /etc/nginx/conf.d/default.conf → エラーが出た。調べてみよう docker exec web… ／ #2「container ls --all・エラーも grep・sh -c で読む」[実戦] 正しい操作でエラーの案内が出た: docker container ls --all → エラーが出た。調べてみよう docker container ls --all docker: 'container' is not a docker command. See 'docker --help' 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 ／ docker exec web sh -c 'cat /etc/nginx/conf.d/default.conf' → エラーが出た。調べてみよう docker exec web s… | `docs/progress/shots/verify-free/docker.b.05-1.png` `docs/progress/shots/verify-free/docker.b.05-2.png` |
| docker.i.01 | 不合格 | 1× 2○ | #1「package*.json を写す・EXPOSE を書く」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: /app で作業し、アプリのファイルを写し、npm install で部品（express）を入れ、動かす時に node server.js を実行する Dockerfile にする。確かめた結果で、8080 番が「本日は受付中」と答えることを見る。 | `docs/progress/shots/verify-free/docker.i.01-1.png` |
| docker.i.02 | 不合格 | 1○ 2× | #2「&& で移って作る・image ls」[実戦] 正しい操作でエラーの案内が出た: docker image ls → エラーが出た。調べてみよう docker image ls docker: 'image' is not a docker command. See 'docker --help' 何と言われたか コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。 考えられる理由 コマンドの名前や、その後に | `docs/progress/shots/verify-free/docker.i.02-2.png` |
| docker.i.03 | 不合格 | 1× 2× | #1「作って一覧で見る・--mount で付ける」[実戦] 正しい操作でエラーの案内が出た: docker run -d --name db --mount source=db-data,target=/var/lib/postgresql/data city-db:1.0 → エラーが出た。調べてみよう docker run -d --name db --mount source=db-data,target=/var/lib/postgresql/data city-db:1.0 docker: unknown flag: --mount. See 'docker run --help'. ／ docker exec -it db psql -U … ／ #2「-v で付けると同時に作られる」[実戦] 正しい操作でエラーの案内が出た: docker run -d --name db --mount source=db-data,target=/var/lib/postgresql/data city-db:1.0 → エラーが出た。調べてみよう docker run -d --name db --mount source=db-data,target=/var/lib/postgresql/data city-db:1.0 docker: unknown flag: --mount. See 'docker run --help'. ／ docker exec db psql -U post… | `docs/progress/shots/verify-free/docker.i.03-1.png` `docs/progress/shots/verify-free/docker.i.03-2.png` |
| docker.i.04 | 不合格 | 1× 2× | #1「種類を書いて作る・--net で入れる」[実戦] 正しい操作でエラーの案内が出た: docker network create --driver bridge city-net → エラーが出た。調べてみよう docker network create --driver bridge city-net Error response from daemon: network with name bridge already exists 何と言われたか その場所には、もう鍵がある。上書きせずに止まっ ／ docker network connect city-net db → エラーが出た。調べてみよう docker network conne… ／ #2「作って一覧で見る・= で書く・&& でつなぐ」[実戦] 正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: docker logs web → docker-name-unresolved | `docs/progress/shots/verify-free/docker.i.04-1.png` `docs/progress/shots/verify-free/docker.i.04-2.png` |
| docker.i.05 | 不合格 | 1× 2○ | #1「利用者を書いてログイン・image の名前の命令・run で取ってくる」[実戦] 正しい操作でエラーの案内が出た: docker image tag shop/web:1.2 registry.city.example/shop/web:1.2 → エラーが出た。調べてみよう docker image tag shop/web:1.2 registry.city.example/shop/web:1.2 docker: 'image' is not a docker command. See 'docker --help' 何と言われたか コマンドがうまくいかず、 ／ docker image push registry.city.example/shop/web:1.2 … | `docs/progress/shots/verify-free/docker.i.05-1.png` |
| docker.i.06 | 合格 | 1○ 2○ |  |  |
| k8s.b.01 | 合格 | 1○ 2○ | 想定した案内: k8s-no-controller（`kubectl drain node-2`） |  |
| k8s.b.02 | 合格 | 1○ 2○ |  |  |
| k8s.b.03 | 合格 | 1○ 2○ |  |  |
| k8s.b.04 | 合格 | 1○ 2○ |  |  |
| k8s.b.05 | 不合格 | 1× 2○ | #1「deploy の短い名前・rollout status・一覧の 1 つ目を xargs で消す」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: web の Pod を 1 つ消し、別の名前の Pod が作り直されて、また 3 つが動くことを確かめる。（端末: ole:~$ kubectl get pods -o name \| head -n 1 \| xargs kubectl delete pod "web-77bfcfdff-vpcvj" deleted learner@console:~$ kubectl get pods -w NAME READY STATUS RESTARTS AGE web-77bfcfdff-vpcvj 1/1 Running 0 8s web-77… | `docs/progress/shots/verify-free/k8s.b.05-1.png` |
| k8s.b.06 | 合格 | 1○ 2○ |  |  |
| k8s.b.07 | 不合格 | 1× 2○ | #1「ns の短い名前・-n を前に書く・全ての区画」[実戦] 台本が進めない: page.click: Timeout 30000ms exceeded. | `docs/progress/shots/verify-free/k8s.b.07-1.png` |
| k8s.i.01 | 不合格 | 1× 2○ | #1「1 つの値を configMapKeyRef で受け取る・同じ名前の値を変えて札で入れ替える」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: 検証の DB が、新しい機械 db-staging-2 に移った。web の Pod が、新しい接続先 postgres://reserve@db-staging-2:5432/reserve を持って動くようにする。 | `docs/progress/shots/verify-free/k8s.i.01-1.png` |
| k8s.i.02 | 合格 | 1○ 2○ |  |  |
| k8s.i.03 | 合格 | 1○ 2○ |  |  |
| k8s.i.04 | 合格 | 1○ 2○ |  |  |
| k8s.i.05 | 不合格 | 1○ 2× | #2「名前を付けたポートを指す・liveness を先に書く」[実戦] 最後のヒントの操作を全て行ったのに、まだの手順がある: コンテナに readiness（8080 番の /ready）と liveness（8080 番の /healthz）を付ける。読み込みの途中は Ready にならず、止めた Pod が作り直されて Ready に戻ればよい。 | `docs/progress/shots/verify-free/k8s.i.05-2.png` |
| k8s.i.06 | 不合格 | 1○ 2× | #2「--replicas を先に書く・コンテナを指定して 0.2 個」[実戦] 正しい操作でエラーの案内が出た: kubectl get hpa web --watch → エラーが出た。調べてみよう kubectl get hpa web --watch NAME REFERENCE TARGETS MINPODS MAXPODS REPLICAS AGE web Deployment/web cpu: <unknown>/50% 2 10 4 43s web Deployment/we。最後のヒントの操作を全て行ったのに、まだの手順がある: 利用者の波を起こし（crowd を 1 つに）、HPA が web を 6 つ以上に増やすことを確かめる。 ／ 波を止め（cro… | `docs/progress/shots/verify-free/k8s.i.06-2.png` |
| k8s.i.07 | 合格 | 1○ 2○ |  |  |
| k8s.i.08 | 不合格 | 1× 2○ | #1「deploy/web の形・時間を区切って見る」[実戦] 正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: kubectl rollout status deploy/web --timeout=30s → k8s-rollout-stuck | `docs/progress/shots/verify-free/k8s.i.08-1.png` |
| mon.b.01 | 合格 | 1○ 2○ |  |  |
| mon.b.02 | 不合格 | 1× 2○ 3○ | #1「grep -c で数える・jq で選んで数える」[実戦] 台本が進めない: page.click: Timeout 30000ms exceeded. | `docs/progress/shots/verify-free/mon.b.02-1.png` |
| mon.b.03 | 合格 | 1○ 2○ |  |  |
| mon.b.04 | 合格 | 1○ 2○ |  |  |
| cloud.b.01 | 合格 | 1○ 2○ |  |  |
| cloud.b.02 | 合格 | 1○ 2○ |  |  |
| cloud.b.03 | 合格 | 1○ 2○ |  |  |
| devops.b.01 | 合格 | 1○ 2○ |  |  |
| devops.b.02 | 合格 | 1○ 2○ |  |  |
| devops.b.03 | 不合格 | 1× 2× | #1「下の段から並べる」[実戦] 正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: {"op":"arrange","stages":[["ci"],["approve"],["deploy"]],"dropOrder":"reverse"}（途中の 1 枚） → devops-flow-order ／ {"op":"arrange","stages":[["ci"],["approve"],["deploy"]],"dropOrder":"reverse"}（途中の 1 枚） → devops-flow-order ／ {"op":"arrange","stages":[["ci"],["auto"],[… ／ #2「上の段から並べる（並びは 1 通り）」[実戦] 正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: {"op":"arrange","stages":[["ci"],["auto"],["deploy"]]}（途中の 1 枚） → devops-fast-step ／ {"op":"arrange","stages":[["ci"],["auto"],["deploy"]]}（途中の 1 枚） → devops-fast-step | `docs/progress/shots/verify-free/devops.b.03-1.png` `docs/progress/shots/verify-free/devops.b.03-2.png` |
