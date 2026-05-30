# Swallow AI Academy

AI/ML 資格学習のための、編集デザイン志向の独立した学習ジャーナル。
G検定・E資格・統計検定・Python 認定・AWS MLA-C01・画像処理エンジニア検定・Jetson AI Specialist を横断的にカバー。

[https://swallowsaba.github.io/swallow/](https://swallowsaba.github.io/swallow/)

---

## 特徴

- **完全独立のオリジナルUI** — エディトリアル × ミニマル（オフホワイト × ネイビー × 朱）
- **静的サイト** — バックエンド不要、API キー不要、即動作
- **7資格を一冊に** — G検定 / E資格 / 統計検定 / Python認定 / AWS MLA-C01 / 画像処理 / Jetson AI を体系で
- **420問以上のオリジナル問題** — G検定 97 / E資格 81 / 統計検定 59 / Python 50 / AWS MLA-C01 50 / 画像処理 40 / Jetson 30 ＋ 横断ミニ問題集。すべて独自執筆、即時採点・出典付き解説
- **対話的シミュレーション 8 種** — 勾配降下／活性化関数／過学習／決定境界／バックプロパゲーション／Attention重み／K-means／PCA をブラウザ内で動かせる
- **ローカル保存** — 進捗・連続学習・正答率は `localStorage` に保存（アカウント登録なし、トラッキングなし）
- **モバイル対応** — レスポンシブ、軽量

## 構成

```
swallow/
├── index.html                    # トップページ（ダッシュボード・資格マップ）
├── quiz.html                     # 問題演習ハブ（9トピック）
├── README.md
├── .nojekyll                     # GitHub Pages Jekyll 無効化
├── .github/
│   └── workflows/
│       └── deploy.yml            # Push 時に Pages を自動ビルド・公開
├── assets/
│   ├── css/main.css              # 全ページ共通スタイル
│   ├── js/main.js                # 進捗・ストア・ナビゲーション
│   ├── js/quiz.js                # クイズエンジン
│   └── data/                     # 問題セット (JSON)
│       ├── quiz-g-kentei.json    # G検定 97問
│       ├── quiz-e-shikaku.json   # E資格 81問
│       ├── quiz-tokei.json       # 統計検定 59問
│       ├── quiz-python.json      # Python認定 50問
│       ├── quiz-aws-mla.json     # AWS MLA-C01 50問
│       ├── quiz-image.json       # 画像処理 40問
│       ├── quiz-jetson.json      # Jetson AI 30問
│       ├── quiz-llm.json         # LLM 横断 12問
│       └── quiz-stats.json       # 統計DS 横断ミニ 10問
├── certifications/
│   ├── g-kentei.html             # G検定 (詳細)
│   ├── e-shikaku.html            # E資格 (詳細)
│   ├── tokei-kentei.html         # 統計検定 (2級→1級・DS系まで)
│   ├── python-cert.html          # Python エンジニア認定 (4試験)
│   ├── aws-mla-c01.html          # AWS MLA-C01 (4ドメイン詳細)
│   ├── image-engineer.html       # 画像処理エンジニア検定 (古典〜DL)
│   └── jetson-ai.html            # Jetson AI Specialist (エッジAI)
└── learn/
    ├── basics.html               # 基本: 線形代数・確率統計・最適化・ML/DL の基礎
    ├── advanced.html             # 応用: Transformer・LLM・拡散モデル・RL・RAG・Agent・MLOps
    ├── simulation.html           # 対話的シミュレーション 8 種
    └── hands-on.html             # PyTorch / Hugging Face / SageMaker / Jetson のコード
```

## ローカルでの確認

依存関係はゼロ。Python があれば組み込みサーバで即起動できます。

```bash
git clone https://github.com/swallowsaba/swallow.git
cd swallow
python -m http.server 8000
# → http://localhost:8000/ にアクセス
```

または Node 派なら:

```bash
npx serve
```

## GitHub Pages へのデプロイ（自動）

このリポジトリには **GitHub Actions による自動デプロイ** が組み込まれています（`.github/workflows/deploy.yml`）。
main ブランチに push するたびに、Pages が自動でビルド・公開されます。

### 初回セットアップ（1度だけ）

1. **リポジトリ作成 & プッシュ**
   ```bash
   git init
   git add .
   git commit -m "Initial: Swallow AI Academy"
   git branch -M main
   git remote add origin https://github.com/swallowsaba/swallow.git
   git push -u origin main
   ```

2. **GitHub Pages を「Actions」モードに切替**
   - リポジトリの `Settings → Pages` を開く
   - **Source** を **「GitHub Actions」** に変更（「Deploy from a branch」ではなく）
   - 保存ボタンは不要、選択した瞬間に反映される

3. **初回ワークフローを実行**
   - すでに main に push 済みであれば、`Actions` タブで `Deploy to GitHub Pages` が自動実行されている
   - 走っていない場合は `Actions` タブ → ワークフローを選択 → `Run workflow`

4. **公開URLにアクセス**
   - 1〜2 分でデプロイ完了
   - `https://swallowsaba.github.io/swallow/` で公開される
   - ワークフロー実行ログの末尾にもURLが表示される

### 以降の更新

```bash
# 編集
git add .
git commit -m "update"
git push
```

これだけで GitHub Actions が自動で再デプロイします。`Actions` タブで進捗確認可能。

### カスタムドメインを使う場合

`Settings → Pages → Custom domain` でドメイン名を入力し、DNS の `CNAME` レコードを `swallowsaba.github.io` に向ければOK。リポジトリ直下に `CNAME` ファイルが自動生成されます（このファイルは Actions ワークフローにより一緒に配信されます）。

## 技術メモ

- 純HTML + CSS + バニラJS (フレームワーク・ビルドステップなし)
- フォント: Google Fonts (Cormorant Garamond / Noto Serif JP / DM Sans / Noto Sans JP / JetBrains Mono)
- LocalStorage キー: `swallow_ai_academy_v1`
- すべての問題は本サイトオリジナル（公式テキスト・他社問題集からの転載は一切なし）

## 学習の進め方

```
HOME
 │
 ├── 資格ページで全体像 (g-kentei, e-shikaku, ...)
 │
 ├── 基本 (learn/basics.html)        ←─ ここから
 │    ↓
 ├── 応用 (learn/advanced.html)
 │    ↓
 ├── シミュレーション (learn/simulation.html)
 │    ↓
 ├── ハンズオン (learn/hands-on.html)
 │    ↓
 └── 問題演習 (quiz.html)            ←─ 仕上げと弱点発見
```

学習履歴はブラウザ内に蓄積され、トップページのダッシュボードに反映されます（連続学習日数・チェック完了数・クイズ正答率）。

## ライセンス

このサイトのコード・文章・問題はすべて独立に書かれたオリジナルです。
個人学習目的での利用は自由ですが、コンテンツの転載・再配布は控えてください。

## 参考にした公的リソース

- [JDLA (日本ディープラーニング協会)](https://www.jdla.org/) — G検定・E資格 シラバスおよび出題範囲
- [統計検定 / 日本統計学会](https://www.toukei-kentei.jp/)
- [Python エンジニア育成推進協会](https://www.pythonic-exam.com/)
- [AWS Certified Machine Learning Engineer - Associate (MLA-C01)](https://aws.amazon.com/certification/certified-machine-learning-engineer-associate/)
- [CG-ARTS 画像処理エンジニア検定](https://www.cgarts.or.jp/)
- [NVIDIA Jetson AI Courses and Certifications](https://www.nvidia.com/en-us/training/jetson-ai-certification-programs/)

---

© 2026 Swallow AI Academy · Independent Project · Built on GitHub Pages · No tracking · No ads
