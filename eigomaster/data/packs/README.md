# data/packs — 教材データパック

## 教材の追加方法（v104〜: この2ステップだけで完結）

1. このフォルダに JSON ファイルを置く
   形式: {"collection":"words","type":"array","data":[...]}
   - type "array": 配列に連結（words / idioms / listening など）
   - type "object": オブジェクトへマージ（pronDict / etymology / phonics / grammarDetail）

2. manifest.json を更新
   - "packs" 配列にファイル名を追加
   - "version" を上げる（例: "104" → "105"）

**index.html / js/app.js / sw.js の変更は不要。**
manifest.json の "version" が
- 全パックのキャッシュバスター（?v=<version>）
- 画面右上のバージョンバッジ表示
の唯一の情報源（single source of truth）です。

## 動作の仕組み
- data/loader.js が manifest.json を cache:"no-store" で常時最新取得
- 各パックは ?v=<manifest.version> 付きで取得（version が変わった時だけ再取得）
- sw.js はネットワーク優先。新パックは初回オンラインアクセス時に
  自動でランタイムキャッシュに追加され、オフラインでも利用可能になる

## manifest.json への一括登録（python）
```python
import json, os
P='data/packs'
man=json.load(open(f'{P}/manifest.json'))
allp=sorted(f for f in os.listdir(P) if f.endswith('.json') and f!='manifest.json')
man['packs']=allp
man['version']=str(int(man['version'])+1)
json.dump(man,open(f'{P}/manifest.json','w'),indent=1)
```
