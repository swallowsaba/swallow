# このファイル一式の置き方と回し方

## 置き方

zip を展開し、中身を `X:\git\swallow` に重ねてコピーする。

```
X:\git\swallow\loop.ps1                       （上書き）
X:\git\swallow\devlearn-arena\CLAUDE.md       （上書き）
X:\git\swallow\devlearn-arena\PLAN.md         （新規）
X:\git\swallow\devlearn-arena\PROMPT.txt      （上書き）
X:\git\swallow\devlearn-arena\REVIEW.md       （上書き）
X:\git\swallow\devlearn-arena\docs\...        （新規・上書き）
X:\git\swallow\devlearn-arena\tools\...       （上書き）
```

古い `REWORK.md` と `DESIGN.md` は、第 0 章で `docs/archive/` へ移した。

## 回し方

```
cd X:\git\swallow
git add -A
git commit -m "DevLearn FC の指示書一式"
Set-ExecutionPolicy -Scope Process Bypass
.\loop.ps1
```

## 見本の実物

正解の見本は、この会話で作った次の場所にある。第 1 章の確認では、ここと見比べる。
https://claude.ai/artifact/8R55TEaqEgjKuhkTzRSxXB

## 止まったとき

- `REVIEW NEEDED` と出たら、ブラウザに確認ページが開く。見て、`devlearn-arena\REVIEW.md` に承認か指摘を書き、`.\loop.ps1` を回し直す
- `usage limit` と出たら、20 分待って自動で再開する。放置してよい
- `Model not available` と出たら、`claude update` を打ってから回し直す
