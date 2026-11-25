param (
    [ValidateSet("pull", "contribute")]
    [string]$Mode = "pull",
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

function Test-SemVerTuple {
    param([string]$Version)
    if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
        return $null
    }
    return @([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
}

function Compare-SemVerGreater {
    param([int[]]$NewVer, [int[]]$OldVer)
    for ($i = 0; $i -lt 3; $i++) {
        if ($NewVer[$i] -gt $OldVer[$i]) { return $true }
        if ($NewVer[$i] -lt $OldVer[$i]) { return $false }
    }
    return $false
}

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

        $stagedFiles = @(git diff --cached --name-only)
        $requiresVersionBump = $false
        foreach ($file in $stagedFiles) {
            if ($file -match '^(skills/|agents/|memory/|CORE_CONSTITUTION\.md$)') {
                $requiresVersionBump = $true
                break
            }
        }

        if ($requiresVersionBump) {
            $newVersion = (Get-Content -Path "VERSION" -Raw -Encoding UTF8).Trim()
            $newTuple = Test-SemVerTuple -Version $newVersion
            if (-not $newTuple) {
                git reset | Out-Null
                Write-Error "VERSION inválido ('$newVersion'). Esperado SemVer X.Y.Z."
                exit 1
            }

            $oldVersion = (git show HEAD:VERSION 2>$null)
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($oldVersion)) {
                $oldTuple = Test-SemVerTuple -Version $oldVersion.Trim()
                if ($oldTuple -and -not (Compare-SemVerGreater -NewVer $newTuple -OldVer $oldTuple)) {
                    git reset | Out-Null
                    Write-Error "Contribuição recusada: alterações em skills/, agents/, memory/ ou CORE_CONSTITUTION.md exigem incremento de VERSION ($($oldVersion.Trim()) -> maior)."
                    exit 1
                }
            }

            $changelogContent = Get-Content -Path "CHANGELOG.md" -Raw -Encoding UTF8
            if ($changelogContent -notmatch [regex]::Escape("## [$newVersion]")) {
                git reset | Out-Null
                Write-Error "Contribuição recusada: CHANGELOG.md deve conter a seção '## [$newVersion]'."
                exit 1
            }
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
    git commit -m "chore(brain): update .shapelab pointer ($Message) [skip ci]"
    Write-Host "Contribuição enviada ao shapelab-brain e ponteiro atualizado no produto." -ForegroundColor Green
}
