# 教材パック（data/packs/）

## 教材の追加方法
1. このフォルダに JSON ファイルを置く:
```json
{"collection":"words","type":"array","data":[
  {"id":"new_w1","en":"example word","ja":"例の単語","level":"B2","tag":"NEW"}
]}
```
2. `manifest.json` の `packs` 配列にファイル名を1行追加する。
→ 次回ロード時に自動で読み込まれる。ビルド不要。

## 形式
- `collection`: words / idioms / grammar / readingSamples / listening / pronSentences /
  pronDict / trainingItems / stressItems / intonationItems / rhythmItems / qrtItems /
  chunkItems / thinkingItems / cultureItems / discussionItems / collocationItems / ...
- `type`: `"array"`（既存配列に連結）または `"object"`（pronDict 等のオブジェクトへマージ）
- words / idioms は読込後に `en` の小文字一致で自動重複除去される。

## 命名規約（推奨）
`<collection>_<レベル|カテゴリ|追加日>.json`
例: `words_B2_2026-08-01_medical.json`, `listening_C1_2.json`

## 分割の目安
1ファイル 2,500 項目以下（オブジェクトは 1,500 キー以下）。
