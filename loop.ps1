# Keep Claude Code running. Auto-resume after usage limit.
# Usage:
#   cd X:\git\swallow
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\loop.ps1

$Repo       = "X:\git\swallow"
$WaitMin    = 20
$MaxRuns    = 200
$PromptFile = "devlearn-arena\PROMPT.txt"

# Model: Opus 5.5 pinned by full ID. Needs Claude Code v2.1.280 or later.
# Do NOT use fable here: in -p mode, Fable can bill usage credits without asking.
$Model  = "claude-opus-5-5"
$Effort = "high"

Set-Location $Repo

if (-not (Test-Path $PromptFile)) {
    Write-Host "PROMPT.txt not found: $PromptFile" -ForegroundColor Red
    exit 1
}

for ($i = 1; $i -le $MaxRuns; $i++) {
    Write-Host ""
    Write-Host ("===== run {0}  {1}  model={2} effort={3} =====" -f $i, (Get-Date -Format 'MM/dd HH:mm'), $Model, $Effort) -ForegroundColor Cyan

    $prompt = Get-Content $PromptFile -Raw -Encoding UTF8
    $out = & claude -p $prompt --model $Model --effort $Effort --dangerously-skip-permissions 2>&1 | Out-String
    Write-Host $out

    if ($out -match "ALLDONE") {
        Write-Host "finished." -ForegroundColor Green
        break
    }
    if ($out -match "not a recognized model|issue with the selected model|does not support this model") {
        Write-Host "Model not available. Run: claude update" -ForegroundColor Red
        exit 1
    }
    if ($out -match "session limit|usage limit|rate limit|Usage limit") {
        Write-Host ("usage limit. waiting {0} min." -f $WaitMin) -ForegroundColor Yellow
        Start-Sleep -Seconds ($WaitMin * 60)
        continue
    }
    Start-Sleep -Seconds 30
}
