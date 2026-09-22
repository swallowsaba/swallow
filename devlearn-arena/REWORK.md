# 全面作り直し指示（第3版）

**これは実装指示書である。上から順に実装し、終えた項目を [x] にしてコミットすること。**
各項目ごとに `npm run typecheck` `npm run lint` `npm run test` を通す。playwright は実行しない。
確認を求めず、報告のために止まらない。全項目が [x] になるまで進める。

---

## 0. 前提：古いものを捨てる

過去2回の指示が守られなかった。原因は既存の可視化を部分的に手直ししようとしたこと。
**今回は作り直す。既存の見た目・発想を引き継がない。**

- [x] 0-1. 次のファイルを**削除**する。移植も参照もしない。
  - `src/visual/FileWorld.tsx`
  - `src/visual/worldGrid.ts` と `worldGrid.test.ts`
  - `src/visual/treeLayout.ts` と `treeLayout.test.ts`
  - `src/visual/ClusterCanvas.tsx`
  - `src/visual/CommitGraph.tsx`
  - `src/visual/PacketFlow.tsx`
  - `src/visual/PrTimeline.tsx`

- [x] 0-2. **絵文字を絵として使うことを禁止する。**
  人・建物・道具を絵文字（🧑‍🌾 🏠 📦 🌳 など）で描いている箇所を全て廃し、SVG で描く。
  検査用のテスト `src/city/noEmoji.test.ts` を作り、
  `src/city/**` と `src/visual/**` の全 `.tsx` に絵文字の符号位置
  （U+1F300–U+1FAFF, U+2600–U+27BF, U+FE0F, U+200D）が含まれないことを検証する。
  **このテストが通るまで項目1に進まない。**

---

## 1. 街づくりのモデル（純粋なデータ。React に依存しない）

学習の状態から街の姿を導く。**街は状態の写像であり、飾りではない。**

- [x] 1-1. `src/city/model.ts` を作る。

  ```ts
  export interface CityTile { x: number; y: number; kind: 'grass' | 'road' | 'plot' | 'water'; }
  export interface Building {
    id: string;                 // 元になった資源の識別子（ノード名、ディレクトリのパス等）
    kind: BuildingKind;         // 下の表を参照
    x: number; y: number;       // 区画の左上（タイル座標）
    w: number; h: number;       // 大きさ。規模が大きいほど広い／高い
    level: number;              // 1..5。使われるほど育つ
    label: string;
    /** 中にいる住人（Pod / ファイル / コミットなど） */
    occupants: Occupant[];
    state: 'building' | 'normal' | 'busy' | 'broken';
  }
  export interface Occupant {
    id: string; label: string;
    state: 'moving' | 'settled' | 'sick' | 'gone';
    /** 引っ越し中なら移動元の建物 */
    from?: string;
  }
  export interface City {
    width: number; height: number;
    tiles: CityTile[];
    buildings: Building[];
    roads: { from: string; to: string; active: boolean }[];
    /** 解放済みの区域。学習が進むと増える */
    districts: { track: string; unlocked: boolean; x: number; y: number; w: number; h: number }[];
  }
  export function buildCity(input: CityInput): City;   // 純粋関数
  ```

- [x] 1-2. **開始時は更地である。** 建物が0、道も最小限。
  `buildCity` に空の状態を渡したとき `buildings.length === 0` になることをテストする。
  いま `/etc` や `/home` があるだけで建物が建っているのは誤り。
  **学習者が作った資源だけが建物になる。** 初期から存在する OS のディレクトリは、
  小さな既存施設として端に置くか、そもそも描かない。

- [x] 1-3. 学習内容と街の対応を、次の表のとおりに実装する。

  | 学ぶ対象 | 街での姿 | 動き |
  |---|---|---|
  | k8s のノード | **高層ビル**（worker tower） | `kubectl` でノードが増えると**建設が始まり、数 tick かけて建つ** |
  | k8s の Pod | ビルの中の**住人** | 配置されるとビルへ**歩いて入る**。別ノードへ移ると**引っ越す** |
  | k8s の Deployment | **建設会社の事務所** | replicas を増やすと住人の募集が始まる |
  | k8s の Service | **バス停** | Endpoints に載った Pod のいるビルにだけ**バス路線が伸びる** |
  | k8s の CrashLoopBackOff | 住人が**倒れて運ばれ、また戻る** | 繰り返すほど戻りが遅くなる |
  | git のコミット | **記念碑**が歴史通り沿いに並ぶ | commit のたびに**新しい碑が建つ** |
  | git のブランチ | 通りが**分岐する** | merge で**合流する**。switch で旗が移動する |
  | git の index | **倉庫** | `add` でファイルが家から倉庫へ**運ばれる**。`commit` で倉庫から碑へ |
  | ネットワークの機器 | **施設**（家・中継塔・関所） | |
  | ネットワークのリンク | **道路** | 切れると道が崩れる |
  | パケット | **荷車** | 1ホップずつ道を走る。TTL が減るたび荷が軽くなる表現 |
  | GitHub の PR | **市役所の審査窓口** | 承認が揃うと門が開く |
  | CI の job | **検査ライン** | 依存順に流れ、失敗で下流が止まる |
  | ディレクトリ | **区画** | `mkdir` で更地に**区画が引かれる** |
  | ファイル | **小屋** | 中身が増えると大きくなる |

- [x] 1-4. **街は学習とともに育つ。** `src/city/growth.ts` を作る。
  クリアした任務の数と種類に応じて、区域（district）が解放される。
  - 最初は中央の小さな区画だけ。他は霧（未解放）
  - kernel の任務をクリア → 住宅街が解放
  - git → 歴史通りが解放
  - k8s → 工業区（高層ビルが建てられる）が解放
  - net → 道路網が解放
  - github → 市役所が解放
  テスト: 任務0本なら解放区域は1つ。任務を5本クリアすると2つ以上になること。

- [x] 1-5. テストを書く（`src/city/model.test.ts`）。最低これらを検証する。
  - 空の状態 → 建物0
  - ノードを2つ足す → 高層ビルが2棟（kind が 'tower'）
  - Pod を配置 → そのノードのビルの occupants に入る
  - Pod を別ノードへ移す → occupants が移り、`from` に元のビルが入る
  - Pod を消す → occupants から消える
  - `mkdir` でディレクトリを作る → 区画が1つ増える
  - commit を2回 → 記念碑が2つ、歴史通りに沿って並ぶ
  - ブランチを分ける → 通りが分岐する（road が増える）
  - 同じ状態からは必ず同じ街になる（決定論）

## 2. 描画（SVG。絵文字を使わない）

- [x] 2-1. `src/city/CityCanvas.tsx` を作る。`buildCity` の結果を描くだけの純粋な表示。
  - 真上から見た 2D。斜め45度にしない
  - 建物は SVG の図形で描く。高層ビルは階層を線で表し、level が上がると階が増える
  - 住人は小さな丸（色で状態を示す）。移動は座標の補間で歩かせる
  - 道路は太い帯。使われている道は明るく、切れている道は途切れさせる
  - 未解放の区域は暗く沈め、輪郭だけ見せる

- [x] 2-2. 画風を1つに統一する。`src/city/palette.ts` に色を定義し、全てそこから引く。
  影は右下に1段だけ。輪郭線は同じ太さ。角丸は使わないか、全体で統一する。
  **手描き風・絵文字・写実のどれとも混ぜない。**

- [x] 2-3. `src/city/Viewport.tsx` を作り、CityCanvas を包む。
  ホイールで拡大縮小、ドラッグで移動、ダブルクリックで全体表示。
  **初期表示で街全体が枠に収まること。**

- [x] 2-4. 変化を見せる。新しい建物は基礎→骨組み→完成の3段階で建つ。
  住人の移動は歩く。倒れた住人は色が変わる。

## 3. 街から操作する

- [x] 3-1. `CityCanvas` に `onCommand: (line: string) => void` を渡す。
  クリックされたら対応するコマンドを**端末に入力して実行する**（`TerminalHandle.submit`）。
  端末に文字が出るのが見えること。

- [x] 3-2. 対応表。
  - 高層ビル（ノード）をクリック → `kubectl describe node <名前>`
  - ビルの「停止」印 → `kubectl cordon <名前>`
  - 住人（Pod）をクリック → `kubectl describe pod <名前>`
  - 住人の×→ `kubectl delete pod <名前>`
  - 建設会社の ± → `kubectl scale deploy <名前> --replicas=N`
  - 記念碑（コミット）→ `git show <hash>`
  - 旗（ブランチ）→ `git switch <名前>`
  - 倉庫に運ぶ → `git add <path>`
  - 道路 → `ip link set <dev> down` / `up`
  - 施設 → `ping <相手>`
  - 審査窓口 → `gh pr view <番号>`

- [x] 3-3. 操作したとき、**なぜそのコマンドかを一行で出す。**

## 4. 画面の作り

- [ ] 4-1. 左（問題・端末）と右（街）の仕切りは既存のまま。
  左の中で「問題・ヒント」と「端末」の間にも**ドラッグできる横の仕切り**を入れる。
- [ ] 4-2. ヒントや解答で問題エリアの高さが変わっても、**端末の高さが変わらない**こと。
- [ ] 4-3. ヒントは端末で `hint` と打ったときだけ出す。`answer` で模範解答を出す。
  Enter の回数では出さない。

## 5. 内容（前回からの継続。まだなら実装する）

- [ ] 5-1. 全任務の最後のヒントが、そのまま打てば通る完全なコマンドであることをテストで担保する
- [ ] 5-2. 全任務に `intro`（何を学ぶか / なぜ必要か / 用語の平易な言い換え / 使うコマンド）がある
- [ ] 5-3. Kubernetes の最初の任務が、**空のクラスタから作るところ**で始まる
- [ ] 5-4. 専門用語は初出で必ず平易な言い換えを添える

---

## 守ること

- 出力をハードコードしない。状態機械から導出する
- エンジン層は React 非依存・決定論（`Date` と `Math.random` は禁止）
- 街も純粋関数で導く。同じ状態からは必ず同じ街になる
- 失敗を罰にしない
- 斜め45度にしない。絵文字を絵として使わない
- テストを必ず書く
