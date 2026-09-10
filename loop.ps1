# Keep Claude Code running. Auto-resume after usage limit.
# Usage:
#   cd X:\git\swallow
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\loop.ps1

$Repo    = "X:\git\swallow"
$WaitMin = 20
$MaxRuns = 200
$PromptFile = "devlearn-arena\PROMPT.txt"

Set-Location $Repo

if (-not (Test-Path $PromptFile)) {
    Write-Host "PROMPT.txt not found: $PromptFile" -ForegroundColor Red
    exit 1
}

for ($i = 1; $i -le $MaxRuns; $i++) {
    Write-Host ""
    Write-Host ("===== run {0}  {1} =====" -f $i, (Get-Date -Format 'MM/dd HH:mm')) -ForegroundColor Cyan

    $prompt = Get-Content $PromptFile -Raw -Encoding UTF8
    $out = & claude -p $prompt --dangerously-skip-permissions 2>&1 | Out-String
    Write-Host $out

    if ($out -match "ALLDONE") {
        Write-Host "finished." -ForegroundColor Green
        break
    }
    if ($out -match "session limit|usage limit|rate limit|Usage limit") {
        Write-Host ("usage limit. waiting {0} min." -f $WaitMin) -ForegroundColor Yellow
        Start-Sleep -Seconds ($WaitMin * 60)
        continue
    }
    Start-Sleep -Seconds 30
}
