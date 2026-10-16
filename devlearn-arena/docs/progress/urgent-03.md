# 至急 03: 実戦で、正しいコマンドを打っても達成にならない不具合

記録した日: 2026-10-17

指示（URGENT.txt）の不具合を、`docs/development-plan.md` の Phase より先に直した。

## 症状

linux.b.04（探す）の実戦で `grep -r timeout /var/log/ | wc -l` を打ち、3 が正しく出ても手順を満たさなかった。
「結果」の画面は「まだ達成した手順は無い」になり、答えの欄に 3 を入れても達成にならない（または押せない）ことがあった。

## 原因

- 判定の形: linux.b.04 の 2 つの手順は、判定が `answer`（「端末で調べて答える」の欄への手入力）だった。端末でコマンドを打っても、その結果では何も判定しない。
  打った結果を、もう一度欄に写さないと達成にならなかった。指示書 25 章「実戦ではコマンドを扱う」と、`docs/content-spec.md` 2.4「判定は出力の文字列ではなく、模擬環境の状態で行う」に沿っていない
- 答えの欄の比べ方: 前後の空白と英字の大小しか問わず、日本語の入力のまま全角で `３` と入れると、違う答えとして断っていた（押しても「合っていない」になる）
- 答えの欄のボタンは、欄が空の間は押せない（それ自体は正しい）。画面で確かめると、欄に入れればボタンは押せ、押せば判定していた。
  押しても達成にならなかったのは、上の 2 つ（判定の形・全角の比べ方）のため

## 再現するテスト（先に書いて、失敗を確かめた）

- `src/learning/practice.test.ts` の「端末の実戦は、コマンドの実行の結果で達成する」:
  - linux.b.04: `grep -r timeout /var/log/ | wc -l` で 3 が出た時点で 1 つ目の手順を満たす（答えの欄に入れない）。`find / -name app.conf` で場所が出た時点で 2 つ目を満たし、実戦を達成する
  - 数を自分で書いた（`echo 3`）・別の数え方（`grep -rc`）では満たさない。調べる途中の命令では案内を出さない
  - grep と wc で数えたのに数が違えば（1 つのファイルだけ・`2>&1` で Permission denied まで数えた）、手順で想定した「合っていない」の解説を出す
  - `sudo find …` も、使ったコマンドとして数える
  - 答えの欄は、全角の数字や記号で入れても同じ答えとして受け取る
  - 答えがコマンドの結果そのもの（出力の全体が答え）なら、答える形にした手順は検証で問題として見つかる
- 同じく「ブラウザ内 SQL」: db.b.04 で `SELECT COUNT(*) … WHERE status = '在籍'` が 15 を出した時点で満たす。`SELECT 15` と数を書いただけ・表を見ただけでは満たさない。
  退会の人まで数えた `SELECT COUNT(*) FROM members`（20）は、想定した「合っていない」の解説を出す。SQL の結果がそのまま答えの手順を答える形にしていれば、検証で見つかる
- `src/screens/lesson/LessonScreen.test.tsx`: 画面で linux.b.04 を通し、答えの欄が出ないこと、2 つの命令で手順が 2 つとも満たされること、「結果へ」で「できたこと」が 2 つ並び、
  「まだ達成した手順は無い」と出ないことを確かめる（直す前は、答えの欄が出ていて失敗した）

## 直したこと

- 判定の形 `ran` を足した（`src/content/schema.ts`、`src/learning/practice.ts`）。打った 1 行の区切り（`;` `&&` `||`）のどれかが、`uses` のコマンドを全て使い（パイプでつないでよい。`sudo` の後ろも数える）、
  その結果（標準出力の全体）が `result` と同じ時に満たす。標準エラーは比べない（読めない場所を飛ばした `Permission denied` が出ても、結果が正しければ満たす）
  - 端末は、1 行の実行結果の区切りごとに、使ったコマンドの名前を持つ（`src/engines/kernel/shell.ts` の `CommandPart.commands`）
  - ブラウザ内 SQL は、実行した文と返った表を同じ形にする（`sqlParts`。使ったコマンドは文に出る SQL の語、結果は表の行）。画面（`PracticeStage`）と、最後のヒントの再生（`replaySqlAnswers`）が同じ関数を通る
  - 決めた道具を全て使って結果を出したのに違う時は、手順の想定エラーに「答えが合っていない」の解説があれば出す（数え方・探し方の誤りの原因候補）。無ければ何も出さない（形を見るために同じ道具を打つのは、調べる途中）
- 答えの欄の比べ方を、全角の数字・英字・記号も半角と同じに見るようにした（NFKC。日本語の入力のまま答えてよい）
- 最後のヒントの再生（`replayAnswers`・`replaySqlAnswers`）で、答える形の手順の答えが、打ったコマンドの結果の全体と同じなら問題として出す。同じ作りの物が今後入らない
- 答えの欄は、今の手順が `answer` の時だけ出る（今までどおり）。`ran` の手順では出ない

## 同じ作りの実戦の洗い出し

全 131 本のレッスンの実戦で、判定が `answer` の手順を全て（直す前は 107 個）並べ、1 つずつ、答えがコマンドの実行の結果そのものか、結果を読み取って考える値かを見た
（一時の調べの台。コミットしない）。ミッションには `answer` の手順は無かった。

### コマンドの実行で達成する形に直した物（10 個）

| 実戦 | 手順 | 直した判定 | 打つもの |
|---|---|---|---|
| linux.b.04 | count | `ran` grep・wc → `3` | `grep -r timeout /var/log \| wc -l` |
| linux.b.04 | where | `ran` find → `/etc/app/app.conf` | `find / -name app.conf 2>/dev/null` |
| linux.b.00 | os | `ran` uname → `Linux` | `uname` |
| found.b.08 | guess | `ran` nkf → `Shift_JIS` | `nkf -g matsuri.txt` |
| mon.b.02 | count | `ran` grep・wc → `12` | `grep '"level":"ERROR"' app.log \| wc -l` |
| net.b.06 | look | `ran` dig → `203.0.113.10` | `dig +short shop.example` |
| web.i.02 | shape | `ran` jq → `5` | `curl -s … \| jq '.items \| length'` |
| web.i.02 | zero | `ran` jq → `潮見の望遠鏡` | `curl -s … \| jq -r '.items[] \| select(.stock == 0) \| .name'` |
| docker.i.03 | keep | `container`（`rows:db/reservations=4` ほか）。予約が残ることを DB の状態で判定する | `-v db-data:…` を付けて作り直す |
| db.b.04 | count | `ran` COUNT → `15`（SQL） | `SELECT COUNT(*) FROM members WHERE status = '在籍'` |

合わせて、手順の目的・最後のヒント（「〜と打つ。3 と出れば達成」）・結果の文・想定エラーの解説（`linux-wrong-count`・`linux-wrong-place`・`linux-version-mixup`・
`found-encoding-misread`・`mon-counted-warn`・`db-group-misread`）を、答えを入れる形から、出た結果の形に書き直した。答えた値を見ていた解説
（`docker-volume-lost`・`net-dns-answer`）は、当たる場面が無くなったので消した。`docs/lessons/` の設計（found・linux・mon）の達成も合わせた。

### 答えの欄を残した物（97 個。全てコマンドでは得られない、読み取って考える値）

どれも、最後のヒントのコマンドの出力の全体は答えと違う（検証で確かめている）。コマンドの出力を読み、その中から欄・行を選ぶか、考えて決める値。

- 表の 1 つの欄を読む: `docker images` の SIZE・IMAGE ID、`docker ps -a` の Exited の番号、`kubectl get … -o wide` の NODE、`ss -tlnp` の待ち受け、`df -h` の Use%、
  `ip addr` のアドレス、`curl -I` の見出しの値、`openssl s_client` の発行者、`gh run view --log-failed` の場所 など
- ログ・一覧の中の 1 行を選んで、その一部を読む: 最初のエラーの時刻（linux.b.03・linux.i.02・trouble.b.03）、refused の相手（net.i.04）、衝突したファイル（git.b.06・git.i.05）、
  記録の説明（git.b.01・git.i.02・git.i.04）、最も CPU を使うプロセスの PID（found.b.05・linux.b.08）など
- 一覧を見て数える（数えることが目的でなく、一覧の読み方を学ぶ）: `kubectl get pods`・`get nodes`・`get endpoints`・`get deployments -A`、`git log --oneline`、
  `curl` の一覧の件数、SELECT の結果の行の数（db.b.03）
- 読んで考える・選ぶ: 権限の欄から書ける人（found.b.06）、エラーの種類（trouble.b.02）、UDP を使う理由（net.b.05）、原因の側（web.b.04）、本当の残り（db.b.01。売った枚数から計算する）、
  一番多い・2 番目に多い地域（db.b.04 の group・second。集計の結果を読む）など

## 仕様書に書いたこと

- `docs/content-spec.md` 2.4: 「端末の実戦は、コマンドの実行の結果と模擬環境の状態で判定する。答えの欄は、コマンドでは得られない値を答える時だけ使う」。
  `ran` の満たし方・比べ方・数え違いの解説・ブラウザ内 SQL での `ran`。最後のヒントの書き方（`ran` は出る結果を `` で囲まずに書く）。ブラウザ内 SQL の判定の選び方
- `docs/learning-design.md` 6 章: 数える・探す・取り出す手順は、正しいコマンドを打って正しい結果が出た時点で達成する。打った結果を、答えの欄に写させない

## 画面で確かめたこと

`tools/scenarios/search.mjs`（1920×1080 と 1280×720）で撮り、開いて確かめた。

- `u3-grep`: linux.b.04 を始めた時から答えの欄は無い。`grep -r timeout /var/log | wc -l` を打つと、赤い Permission denied と 3 が出て、案内は出ず、1 つ目の手順に印と「何が起きたか」が付く
- `u3-find`: `find / -name app.conf` を打つと、2 つ目の手順にも印が付き「達成した」。「結果へ」が押せる
- `u3-result`: 「自分の手で通せた」。「できたこと」に 2 つの手順の文が並ぶ。「まだ達成した手順は無い」は出ない。打ったコマンドに 2 行
- `u3-wrong-count`（比べる）: 1 つのファイルだけを数えた（2）時は、手順を満たさず、「grep と wc で数えたが、出た数は、当てはまる行の数ではない」と原因候補・次に確かめることが出る
- `u3-cat-denied`（比べる）: 読めないファイルを `cat` すると、今までどおり案内が出る
- `u3-answer-button`: 答えの欄が残る手順（linux.b.00 の配布物の名前）で、全角の `Ｕｂｕｎｔｕ` を入れると「答える」が押せ、押すと手順を満たす。`uname` の手順は打っただけで満たした
- `u3-sql-count`: db.b.04 で `SELECT COUNT(*) FROM members`（20）は数え違いの解説、`… WHERE status = '在籍'`（15）で手順を満たす。答えの欄は次の手順（読み取る順位）で初めて出る

### 視覚確認（docs/visual-design.md 8 章）

| # | 結果 |
|---|---|
| V1 | 都市画面は変えていない |
| V2 | 実戦の画面の形は変えていない。数える・探す手順で答えの欄が出なくなった分、端末が広い |
| V3・V4・V10 | 都市・建物・名札は変えていない |
| V5 | 標準のボタン・青いリンクは無い |
| V6 | 指定のフォントで出ている（端末は等幅、文は指定の書体） |
| V7 | 札は増やしていない |
| V8 | 施設（サーバ施設・データセンター）の景色はそのまま敷かれている |
| V9 | 常時の UI は増えていない |
| V11 | 絵文字は無い |

## 検査

`npm run typecheck`・`npm run lint`・`npm run test`（176 ファイル・1,942 件）・`npm run content:check`・`npm run secrets` が通った。
