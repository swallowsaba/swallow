# ============================================================================
# Claude Code を止まらずに回し続ける。
# 利用量の上限で落ちても、待ってから自動で再開する。
#
# 使い方:
#   1. このファイルを X:\git\swallow に置く
#   2. PowerShell で:  .\run-claude-loop.ps1
#   3. 放置する。Ctrl+C で止まる
# ============================================================================

$Repo    = "X:\git\swallow"
$Task    = "devlearn-arena\REWORK.md"
$WaitMin = 20        # 上限で落ちたときに待つ分数
$MaxRuns = 200       # 念のための上限

$Prompt = @"
devlearn-arena/REWORK.md を読み、未完了の項目を上から順に実装しろ。
終わった項目は REWORK.md のチェックボックスを [x] に変えてコミットしろ。
各項目ごとに devlearn-arena で npm run typecheck と npm run lint と npm run test を通し、
落ちたら自分で直してからコミットしろ。playwright は実行するな。
確認を求めず、報告のために止まるな。全項目が [x] になるまで進めろ。
全部終わっていたら 'ALL DONE' とだけ出力して終われ。
"@

Set-Location $Repo

for ($i = 1; $i -le $MaxRuns; $i++) {
    Write-Host ""
    Write-Host "===== 実行 $i 回目  $(Get-Date -Format 'MM/dd HH:mm') =====" -ForegroundColor Cyan

    # -p は対話せず一度実行して終わるモード。落ちても次の周回で再開する
    $out = & claude -p $Prompt --dangerously-skip-permissions 2>&1 | Out-String
    Write-Host $out

    if ($out -match "ALL DONE") {
        Write-Host "全項目が完了しました。" -ForegroundColor Green
        break
    }

    if ($out -match "session limit|usage limit|rate limit") {
        Write-Host "上限に達しました。$WaitMin 分待ちます。" -ForegroundColor Yellow
        Start-Sleep -Seconds ($WaitMin * 60)
        continue
    }

    # それ以外の終了。少し待ってから再開する
    Start-Sleep -Seconds 30
}
