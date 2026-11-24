param (
    [switch]$Json
)

$ErrorActionPreference = "Stop"
$brainRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceBase = Split-Path $brainRoot -Parent

$products = @("B2B-personal-ia", "ReformAI", "Smart-EV-Hub")
$report = @()

function Test-PatternInTree([string]$BaseDir, [string[]]$SubDirs, [string]$Pattern) {
    foreach ($sub in $SubDirs) {
        $target = Join-Path $BaseDir $sub
        if (-not (Test-Path $target)) { continue }
        $hit = Get-ChildItem -Path $target -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch 'node_modules|\.git\\|\.venv|build\\|\.dart_tool' } |
            Select-String -Pattern $Pattern -Quiet -ErrorAction SilentlyContinue
        if ($hit) { return $true }
    }
    return $false
}

foreach ($prod in $products) {
    $p = Join-Path $workspaceBase $prod
    if (-not (Test-Path $p)) { continue }

    $hasVersioning = (Test-Path "$p\mobile\tool\update_version.dart") -or (Test-Path "$p\scripts\version.py")
    $hasBrand = (Test-Path "$p\mobile\web\brand_manifest.json") -or (Test-PatternInTree $p @("mobile\web", "public") "#090D16")
    $hasAsaas = Test-PatternInTree $p @("backend", "packages", "apps") "asaas"
    $hasAuthGuard = Test-PatternInTree $p @("backend", "packages", "apps", "worker.ts") "PBKDF2|argon2|_guard|get_current_user|checkout_nonce"
    $hasWhatsApp = Test-PatternInTree $p @("backend", "packages") "evolution|interactive_degraded|graph\.facebook\.com"
    $hasRls = Test-PatternInTree $p @("supabase") "ENABLE ROW LEVEL SECURITY"

    $checks = [ordered]@{
        versioning_and_ota_update = $hasVersioning
        shapelab_brand_identity   = $hasBrand
        asaas_split_fintech       = $hasAsaas
        auth_anti_takeover        = $hasAuthGuard
        whatsapp_dual_channel     = $hasWhatsApp
        supabase_rls              = $hasRls
    }

    $pending = @()
    foreach ($k in $checks.Keys) {
        if (-not $checks[$k]) { $pending += $k }
    }

    $report += [PSCustomObject]@{
        product        = $prod
        checks         = $checks
        pendingCount   = $pending.Count
        pendingVaccines = $pending
    }
}

if ($Json) {
    $report | ConvertTo-Json -Depth 5
    exit 0
}

Write-Host "=== ShapeLab Vaccine Audit Scanner ===" -ForegroundColor Cyan
foreach ($item in $report) {
    Write-Host "`n[$($item.product)] Vacinas pendentes: $($item.pendingCount)" -ForegroundColor Yellow
    foreach ($k in $item.checks.Keys) {
        if ($item.checks[$k]) {
            Write-Host "  [OK]       $k" -ForegroundColor Green
        } else {
            Write-Host "  [PENDENTE] $k" -ForegroundColor Red
        }
    }
}
exit 0
