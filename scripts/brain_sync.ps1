param (
    [ValidateSet("pull", "contribute")]
    [string]$Mode = "pull",
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

# Encontra a raiz do repositório produto
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) {
    Write-Error "Este script deve ser executado dentro de um repositório Git de produto."
    exit 1
}

Set-Location $repoRoot

if (-not (Test-Path ".shapelab")) {
    Write-Error "Submódulo .shapelab não encontrado em $repoRoot"
    exit 1
}

if ($Mode -eq "pull") {
    Write-Host "Sincronizando .shapelab a partir do remoto (origin)..." -ForegroundColor Cyan
    git submodule sync -- .shapelab
    git submodule update --remote --merge .shapelab
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Falha ao atualizar o submódulo .shapelab."
        exit $LASTEXITCODE
    }
    Write-Host "Submódulo .shapelab atualizado." -ForegroundColor Green
}
elseif ($Mode -eq "contribute") {
    if ([string]::IsNullOrWhiteSpace($Message)) {
        Write-Error "Informe -Message 'brain: <tipo>: <resumo>' no modo contribute."
        exit 1
    }

    Write-Host "Preparando contribuição no submódulo .shapelab..." -ForegroundColor Cyan
    Push-Location ".shapelab"
    try {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        if ($branch -eq "HEAD") {
            git checkout main
        }
        git add -A
        $status = git status --porcelain
        if ([string]::IsNullOrWhiteSpace($status)) {
            Write-Host "Nenhuma alteração pendente em .shapelab para enviar." -ForegroundColor Yellow
            exit 0
        }
        git commit -m $Message
        git push origin main
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Falha no git push de .shapelab."
            exit $LASTEXITCODE
        }
    }
    finally {
        Pop-Location
    }

    Write-Host "Atualizando ponteiro do submódulo no repositório produto..." -ForegroundColor Cyan
    git add .shapelab
    git commit -m "chore(brain): update .shapelab pointer ($Message)"
    Write-Host "Contribuição enviada ao shapelab-brain e ponteiro atualizado no produto." -ForegroundColor Green
}
