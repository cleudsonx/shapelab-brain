param (
    [switch]$SyncProducts
)

$ErrorActionPreference = "Stop"

$brainRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceBase = Split-Path $brainRoot -Parent
$pluginRoot = "C:\Users\Cleudson\.gemini\config\plugins\shapelab-os"
$legacyPluginRoot = "C:\Users\Cleudson\.gemini\config\plugins\cleudson-devkit"

$script:failures = 0
$script:warnings = 0

function Report-Check([string]$Status, [string]$Scope, [string]$Message) {
    $color = switch ($Status) {
        "OK"   { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
        default { "White" }
    }
    Write-Host ("[{0}] {1}: {2}" -f $Status, $Scope, $Message) -ForegroundColor $color
    if ($Status -eq "FAIL") { $script:failures++ }
    if ($Status -eq "WARN") { $script:warnings++ }
}

Write-Host "=== ShapeLab Brain & OS Doctor ===" -ForegroundColor Cyan

# 1. Plugin shapelab-os
if (Test-Path $legacyPluginRoot) {
    Report-Check "WARN" "Plugin" "Diretório legado cleudson-devkit ainda existe em $legacyPluginRoot"
} else {
    Report-Check "OK" "Plugin" "Sem conflito de plugin legado (cleudson-devkit ausente)"
}

if (Test-Path $pluginRoot) {
    $pluginJsonPath = Join-Path $pluginRoot "plugin.json"
    $hooksJsonPath = Join-Path $pluginRoot "hooks.json"
    $logoPath = Join-Path $pluginRoot "assets\logo.png"

    try {
        $pJson = Get-Content $pluginJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($pJson.name -eq "shapelab-os") {
            Report-Check "OK" "Plugin" "plugin.json válido (v$($pJson.version), displayName=$($pJson.displayName))"
        } else {
            Report-Check "FAIL" "Plugin" "plugin.json com name inesperado: $($pJson.name)"
        }
    } catch {
        Report-Check "FAIL" "Plugin" "plugin.json inválido ou ausente"
    }

    if (Test-Path $logoPath) {
        Report-Check "OK" "Plugin" "assets/logo.png presente"
    } else {
        Report-Check "FAIL" "Plugin" "assets/logo.png ausente"
    }

    try {
        $hJson = Get-Content $hooksJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $hookScriptsOk = $true
        foreach ($hs in @("hooks\session_start.ps1", "hooks\post_tool_observer.ps1", "hooks\stop_auto_learn.ps1")) {
            if (-not (Test-Path (Join-Path $pluginRoot $hs))) {
                $hookScriptsOk = $false
                Report-Check "FAIL" "Hooks" "Script ausente: $hs"
            }
        }
        if ($hookScriptsOk) {
            Report-Check "OK" "Hooks" "hooks.json válido e 3 scripts de lifecycle presentes"
        }
    } catch {
        Report-Check "FAIL" "Hooks" "hooks.json inválido ou ausente"
    }

    $agentFiles = @(Get-ChildItem (Join-Path $pluginRoot "agents") -Filter "*.md" -ErrorAction SilentlyContinue)
    $skillFiles = @(Get-ChildItem (Join-Path $pluginRoot "skills") -Recurse -Filter "SKILL.md" -ErrorAction SilentlyContinue)
    Report-Check "OK" "Plugin" "Squad carregada: $($agentFiles.Count) subagentes, $($skillFiles.Count) skills globais"
} else {
    Report-Check "FAIL" "Plugin" "Diretório $pluginRoot não encontrado"
}

# 2. Integridade do shapelab-brain
$brainVersion = (Get-Content (Join-Path $brainRoot "VERSION") -Raw -Encoding UTF8).Trim()
if ($brainVersion -match '^\d+\.\d+\.\d+$') {
    Report-Check "OK" "Brain" "VERSION SemVer válido: v$brainVersion"
} else {
    Report-Check "FAIL" "Brain" "VERSION inválido: $brainVersion"
}

$changelogRaw = Get-Content (Join-Path $brainRoot "CHANGELOG.md") -Raw -Encoding UTF8
if ($changelogRaw -match [regex]::Escape("## [$brainVersion]")) {
    Report-Check "OK" "Brain" "CHANGELOG.md possui seção ## [$brainVersion]"
} else {
    Report-Check "FAIL" "Brain" "CHANGELOG.md sem seção ## [$brainVersion]"
}

try {
    $brandManifest = Get-Content (Join-Path $brainRoot "assets\brand\brand_manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    if ((Test-Path (Join-Path $brainRoot $brandManifest.assets.logo_square.path)) -and (Test-Path (Join-Path $brainRoot $brandManifest.assets.banner_wide.path))) {
        Report-Check "OK" "Brand" "brand_manifest.json válido e assets PNG presentes"
    } else {
        Report-Check "FAIL" "Brand" "Assets declarados em brand_manifest.json ausentes"
    }
} catch {
    Report-Check "FAIL" "Brand" "brand_manifest.json inválido ou ausente"
}

$indexRaw = Get-Content (Join-Path $brainRoot "INDEX.md") -Raw -Encoding UTF8
$refMatches = [regex]::Matches($indexRaw, '`((?:skills|memory|agents|templates|scripts)/[^`]+\.(?:md|ps1|sh|yml|json))`')
$missingRefs = @()
foreach ($m in $refMatches) {
    $rel = $m.Groups[1].Value -replace '/', '\'
    if (-not (Test-Path (Join-Path $brainRoot $rel))) {
        $missingRefs += $m.Groups[1].Value
    }
}
if ($missingRefs.Count -eq 0) {
    Report-Check "OK" "Index" "Todas as $($refMatches.Count) referências em INDEX.md existem no disco"
} else {
    Report-Check "FAIL" "Index" ("Referências quebradas em INDEX.md: " + ($missingRefs -join ", "))
}

# 3. Sincronia dos Produtos
$brainHead = (git -C $brainRoot rev-parse HEAD).Trim()
$products = @("B2B-personal-ia", "ReformAI", "Smart-EV-Hub")

foreach ($prod in $products) {
    $prodPath = Join-Path $workspaceBase $prod
    if (-not (Test-Path $prodPath)) {
        Report-Check "WARN" $prod "Diretório não encontrado em $prodPath"
        continue
    }
    $subPath = Join-Path $prodPath ".shapelab"
    if (-not (Test-Path $subPath)) {
        Report-Check "FAIL" $prod "Submódulo .shapelab ausente"
        continue
    }

    if ($SyncProducts) {
        Write-Host "Sincronizando $prod (.shapelab + brain_sync.ps1)..." -ForegroundColor Cyan
        Push-Location $prodPath
        try {
            git submodule sync -- .shapelab | Out-Null
            git submodule update --remote --merge .shapelab | Out-Null
            Copy-Item -Path (Join-Path $subPath "scripts\brain_sync.ps1") -Destination (Join-Path $prodPath "scripts\brain_sync.ps1") -Force
        } finally {
            Pop-Location
        }
    }

    $subHead = (git -C $subPath rev-parse HEAD).Trim()
    $subVerPath = Join-Path $subPath "VERSION"
    $subVer = if (Test-Path $subVerPath) { (Get-Content $subVerPath -Raw -Encoding UTF8).Trim() } else { "?" }
    if ($subHead -eq $brainHead) {
        Report-Check "OK" $prod ".shapelab sincronizado no HEAD v$subVer ($($subHead.Substring(0,7)))"
    } else {
        Report-Check "WARN" $prod ".shapelab em v$subVer ($($subHead.Substring(0,7))), central está em v$brainVersion ($($brainHead.Substring(0,7)))"
    }

    # Normaliza quebras de linha para comparação justa em ambientes Windows/Linux
    $prodSyncRaw = if (Test-Path (Join-Path $prodPath "scripts\brain_sync.ps1")) { (Get-Content (Join-Path $prodPath "scripts\brain_sync.ps1") -Raw -Encoding UTF8) -replace "\r\n", "`n" } else { "" }
    $brainSyncRaw = (Get-Content (Join-Path $brainRoot "scripts\brain_sync.ps1") -Raw -Encoding UTF8) -replace "\r\n", "`n"
    if ($prodSyncRaw -eq $brainSyncRaw -and $prodSyncRaw.Length -gt 0) {
        Report-Check "OK" $prod "scripts/brain_sync.ps1 atualizado com a trava SemVer"
    } else {
        Report-Check "WARN" $prod "scripts/brain_sync.ps1 desatualizado em relação ao brain"
    }
}

Write-Host "=== Resumo: $failures falhas, $warnings avisos ===" -ForegroundColor Cyan
if ($failures -gt 0) { exit 1 }
exit 0
