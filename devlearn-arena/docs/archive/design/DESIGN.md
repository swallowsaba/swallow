# デザインの決まり

`docs/design/mockups/` の 4 枚から抜き出した値。`src/ui/tokens.ts` にそのまま定義し、全ての画面はここから引く。

## 1. 色

| 名前 | 値 | 用途 |
|---|---|---|
| `navy950` | `#0a1424` | 話題の帯、最も暗い地 |
| `navy900` | `#0e1b2e` | 上の帯の始まり、左のメニュー、試合画面の地、文字（濃） |
| `navy800` | `#13284a` | 上の帯の中ほど、暗い札、見出しの帯 |
| `terminal` | `#060a10` | 端末の地 |
| `gold` | `#f2b632` | 強調、選択中、上の帯の下線、次の試合の札の見出し |
| `goldLight` | `#ffd66b` | 金のボタンの上側、進捗の棒の先 |
| `goldDark` | `#b9851a` | 金のボタンの押し込みの影 |
| `pitch` | `#1f7a4d` | ピッチ、緑のボタンの下側、上の帯の終わり |
| `pitchDark` | `#155a38` | 緑のボタンの押し込みの影 |
| `mint` | `#3ae08a` | 好調、経験値、緑のボタンの上側 |
| `mintLight` | `#8ff0bb` | 暗い地の上の良い知らせ |
| `red` | `#e04a3a` | 相手（障害）、不調、警告 |
| `redLight` | `#ff8a7a` | 暗い地の上の悪い知らせ |
| `redDeep` | `#7a1d24` / `#3b1115` | 次の試合の札の相手側 |
| `bg` | `#eef2f6` → `#e3e8ee`（上から下へ） | 明るい画面の地 |
| `card` | `#ffffff` | 札 |
| `cardSub` | `#f5f7fa` | 札の中の行 |
| `border` | `#dde4ec` / `#e6ebf1` | 札の枠、区切り線 |
| `ink` | `#13223a` | 本文 |
| `inkSub` | `#5b6b82` | 補足 |
| `inkMuted` | `#6b7a90` | さらに弱い補足 |
| `locked` | `#b8c2cf` / `#8a97a8` | 未解放 |
| `construction` | `#e0a32a` | 建設中 |

**役割の色**（選手の役割と施設で使う）

| 役割 | 値 | 主な分野 |
|---|---|---|
| 探索 | `#1a6fd6` | ls, find, du, pwd, git log, kubectl get |
| 加工 | `#1f7a4d` | grep, sed, cat, cut, sort |
| 移動 | `#c46a1c` | cd, cp, mv, mkdir, git switch |
| 記録 | `#7a3fd0` | git add, git commit, git tag |
| 運用 | `#0f8b8d` | kubectl apply, scale, rollout, drain |
| 通信 | `#8a4fd0` | ping, curl, dig, traceroute, ip |
| 協働 | `#2b3a4f` | gh pr, gh review, gh workflow |

**上の帯**: `linear-gradient(100deg, navy900 0%, navy800 60%, pitch 100%)` ＋ 下に 4px の `gold` の線

## 2. 字体と文字の大きさ

- **Barlow Condensed**（600 / 700 / 800）: 数字、英字の見出し（`NEXT MATCH` `SQUAD` など）
- **Noto Sans JP**（400 / 500 / 700 / 900）: 日本語の全て
- **JetBrains Mono**（500 / 700）: コマンド名、オプション、端末
- Google Fonts から読み込む。読み込めないときの代わりの字体も指定する

**文字の大きさはこの 10 段だけ**: `12 / 13 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64`（px）

| 用途 | 大きさ | 太さ |
|---|---|---|
| 補足・小さな札 | 12 | 400〜700 |
| 行の本文 | 13 | 400〜700 |
| 本文 | 14 | 400〜700 |
| 札の見出し | 16 | 900 |
| 画面の見出し | 18 | 900 |
| 指標の数字 | 22 | Barlow 700 |
| 上の帯のクラブ名 | 28 | Barlow 800 |
| 選手の札の能力値 | 36 | Barlow 800 |
| VS の表記 | 48 | Barlow 800 |
| 選手の詳細の能力値 | 64 | Barlow 800 |

## 3. 余白・角丸・影

- 余白は `4 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 28` のみ
- 角丸: 小札 `4`、行 `8`、ボタン `10`、札 `12`、大きな札 `14`、画面の区画 `16`、丸い札 `999`
- 影:
  - 札 `0 6px 20px rgba(14,27,46,.08)`
  - 浮いた札 `0 10px 30px rgba(14,27,46,.25)`
  - 押せるボタン: 下に 4px の濃い色の影（`0 4px 0 goldDark` など）。押すと 2px 沈む

## 4. 画面の骨組み

全ての画面で共通。

| 区画 | 大きさ | 中身 |
|---|---|---|
| 上の帯 | 高さ 72〜84 | エンブレム、画面名、日付、指標（リーグ順位・信頼・経験値・所属選手）、昇格までの棒 |
| 左のメニュー | 幅 96 | 事務所・街・練習・選手・施設・スカウト・リーグ・日程。選択中は `gold` の地 |
| 本体 | 残り | 画面ごとの中身 |
| 話題の帯 | 高さ 44 | 左に `gold` の見出し、右に流れる話題 |

画面の最小の大きさは 1280×800。それより広い画面では本体が広がる。

## 5. 部品

`src/ui/` に作る。**画面はこの部品を組み合わせて作る。** 見本の中の対応する箇所をそのまま再現すること。

| 部品 | 見本での場所 |
|---|---|
| `TopBar` | 全ての見本の上の帯 |
| `SideRail` | office.html の左のメニュー |
| `Ticker` | office.html と hometown.html の下の帯 |
| `Crest` | エンブレム（盾の中に端末の記号） |
| `StatChip` | 上の帯の指標 |
| `WeekStrip` / `DayCard` | office.html の 1 週間の日程 |
| `NextMatchCard` | office.html の次の試合の札（ピッチの線が薄く透ける） |
| `FacilityTile` | office.html の施設の並び |
| `SquadRow` | office.html の主力選手の行（役割・名前・棒・能力値・調子） |
| `PlayerCard` | squad.html の選手の札（役割の色の帯・能力値・名前・役目・調子・技の数） |
| `PlayerDetail` | squad.html の右の詳細（見出し・五角形・技・成長の記録・ボタン） |
| `RadarChart` | 能力の五角形（正確さ・速さ・応用・組み合わせ・記憶） |
| `MoveRow` | 技の行（習得済み・もう少し・未習得の 3 色） |
| `Scoreboard` | match.html の上の得点板（残り時間・目標の棒） |
| `Pitch` | match.html のピッチ（相手・自軍の選手・パスの線） |
| `TacticsBoard` | match.html の作戦ボード |
| `Commentary` | match.html の実況 |
| `BenchStrip` | match.html の控え |
| `Terminal` | 既存の端末。見た目だけ `terminal` の地と JetBrains Mono に揃える |
| `TownView` | hometown.html の街（Canvas で描く）と名札 |
| `Pin` | 街の名札。重ならず、建物を隠さない |
| `GrowthList` | この 1 年で増えたもの |
| `NextDevelopment` | 次の発展の条件と棒 |
| `GoldButton` / `GreenButton` / `GhostButton` | 押し込みの影を持つボタン |

## 6. 動き

- 次の試合のボタンは金の光がゆっくり脈打つ
- 選んだ選手の札は 4px 浮き、金の枠になる
- 話題の帯は右から左へ流れ続ける
- ピッチのパスの線は破線が流れ、見つけた選手の周りに輪が広がる
- 街の名札はゆっくり上下する
- 能力値が上がるときは数字が回って増える
- `prefers-reduced-motion` のときは全て止める

## 7. 街の描き方

`docs/design/town-reference.py` を TypeScript と Canvas 2D に移す（`src/town/`）。

- 等角投影、浮いた島、蛇行する川と橋、弧を描く大通り、格子の道、並木
- 中央にホームスタジアム。リーグが上がると大きくなり、照明塔が立ち、屋根が付く
- スタジアムの周りに 5 つの施設。未解放は空き地、建設中は足場とクレーン、完成後は施設の色の屋根
- 利用者が増えるほど、スタジアムから外側へ建物が広がり、高くなる。高層には窓の灯りが付く
- **見た目は `docs/design/images/town1〜3.png` と同じ水準にする。** 段階は 3 つに限らず、利用者と施設の状態から連続的に決まる
- 同じ状態からは必ず同じ街になる（seed から決める）
