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

- [x] 4-1. 左（問題・端末）と右（街）の仕切りは既存のまま。
  左の中で「問題・ヒント」と「端末」の間にも**ドラッグできる横の仕切り**を入れる。
- [x] 4-2. ヒントや解答で問題エリアの高さが変わっても、**端末の高さが変わらない**こと。
- [x] 4-3. ヒントは端末で `hint` と打ったときだけ出す。`answer` で模範解答を出す。
  Enter の回数では出さない。

## 5. 内容（前回からの継続。まだなら実装する）

- [x] 5-1. 全任務の最後のヒントが、そのまま打てば通る完全なコマンドであることをテストで担保する
- [x] 5-2. 全任務に `intro`（何を学ぶか / なぜ必要か / 用語の平易な言い換え / 使うコマンド）がある
- [x] 5-3. Kubernetes の最初の任務が、**空のクラスタから作るところ**で始まる
- [x] 5-4. 専門用語は初出で必ず平易な言い換えを添える

---

## 守ること

- 出力をハードコードしない。状態機械から導出する
- エンジン層は React 非依存・決定論（`Date` と `Math.random` は禁止）
- 街も純粋関数で導く。同じ状態からは必ず同じ街になる
- 失敗を罰にしない
- 斜め45度にしない。絵文字を絵として使わない
- テストを必ず書く

---

## 6. 3D の街に作り直す（DESIGN.md 3D 版）

`DESIGN.md` が 3D 版に差し替わった。「SVG で描け」「3D ライブラリを入れるな」
「斜め45度にしない」は撤回された。Cities: Skylines II のような 3D の街として作り直す。
2D の `src/city/`（`model.ts` / `CityCanvas.tsx`）は、街の元データと
**WebGL が無い環境での落とし先**として残す。捨てない。

- [x] 6-1. `three` / `@react-three/fiber` / `@react-three/drei` を依存に加える。
  CDN からは読まない（バンドルに含める）。外部から 3D モデル（glTF）を取らない。
  `src/city3d/palette.ts` に DESIGN.md §7 の色と材質を定義し、全てそこから引く。
- [x] 6-2. `src/city3d/seed.ts` と `src/city3d/model.ts`。
  街の状態 → 3D の街の配置（`CityLayout`）を導く**純粋関数**。
  乱数を使わず seed から決める。テスト（決定論・更地は建物0・区域）。
- [ ] 6-3. `src/city3d/buildings.ts`。`BuildingParams` → `THREE.Group` の純粋関数。
  基壇・セットバック・屋上設備 2 つ以上・入口（扉と庇）・高さで変わる材質・
  **窓 40 枚以上**（`InstancedMesh`）・円柱の高層ビル・切妻屋根。テスト。
- [ ] 6-4. `src/city3d/terrain.ts`。8m のタイル、**曲線の海岸線**、**蛇行する川**（スプライン）、
  岸の砂の帯、草地の起伏、川を渡る**橋**。四角い地盤にしない。テスト。
- [ ] 6-5. `src/city3d/roads.ts`。**縁石・車線の白線・横断歩道**を持つ押し出しの道路。
  格子とは別に**弧を描く大通り**を 1 本、主要な交差点に**ロータリー**。
  交差点で道が繋がり、行き止まりを作らない。テスト。
- [ ] 6-6. `src/city3d/props.ts`。街路樹（幹＋丸い葉の塊 3 つ以上）・街灯・車・人・
  生垣・ベンチ・柵・看板を seed から置く。**地面がむき出しのまま残らない**こと。テスト。
- [ ] 6-7. `src/city3d/scene.ts`。`CityLayout` → 街ひとつ分の `THREE.Group`。
  同じ形は `InstancedMesh` にまとめ、**描画呼び出しを 200 以下**に保つ。テストで数える。
  遠くの建物は窓を省く（LOD）。
- [ ] 6-8. `src/city3d/CityScene.tsx`。太陽（`DirectionalLight` + 影、PCFSoft）、
  空の間接光、`fog`、時間帯と**夜に灯る窓**（`emissive`）。
  カメラは水平から 35 度の固定角・**水平回転のみ**。寄るときは 0.6 秒で補間。
  `prefers-reduced-motion` のときは動きを即時にする。
- [ ] 6-9. `src/city3d/CityView.tsx`。`React.lazy` で遅延読み込みし、`CityPane` から使う。
  WebGL が使えない環境では 2D（`CityCanvas`）に落とす。真っ白にしない。
  街を押すと端末にコマンドが入るのは 3D でも同じ。
- [ ] 6-10. 街は**学習者が設計する**。勝手に配置しない。
  **コマンドの成功でもクイズの正解でも必ず育つ**（`TownGrowth` を街の姿に反映する）。テスト。
- [ ] 6-11. `npm run build` が通り、**GitHub Pages で動く**（相対パス・CDN 参照なし）。
