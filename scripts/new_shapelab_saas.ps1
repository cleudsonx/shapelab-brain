param (
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9-]{1,40}$')]
    [string]$Name,
    [string]$DisplayName = "",
    [string]$TargetDir = "",
    [switch]$SkipFlutter,
    [switch]$SkipBackend,
    [switch]$SkipGit
)

$ErrorActionPreference = "Stop"

$brainRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($TargetDir)) {
    $TargetDir = Split-Path $brainRoot -Parent
}
if ([string]::IsNullOrWhiteSpace($DisplayName)) {
    $DisplayName = ($Name -split '-' | ForEach-Object { $_.Substring(0,1).ToUpper() + $_.Substring(1) }) -join ' '
}

$projectRoot = Join-Path $TargetDir $Name
if (Test-Path $projectRoot) {
    throw "Diretório de destino já existe: $projectRoot"
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
function Write-Utf8([string]$RelPath, [string]$Content) {
    $full = Join-Path $projectRoot $RelPath
    $dir = Split-Path $full -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllText($full, $Content.TrimStart("`r","`n") + "`n", $utf8NoBom)
}

Write-Host "Gerando novo SaaS ShapeLab: $DisplayName ($projectRoot)..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $projectRoot | Out-Null

# 1. Raiz, .gitignore, AGENTS.md, brain_sync & workflows
Write-Utf8 ".gitignore" @'
.env
.env.*
!.env.example
__pycache__/
*.py[cod]
.venv/
.pytest_cache/
.ruff_cache/
.mypy_cache/
build/
mobile/.dart_tool/
mobile/build/
scratch/
*.tmp
'@

Write-Utf8 "README.md" @"
# $DisplayName

Produto SaaS do ecossistema **ShapeLab (https://shapelab.ia.br)** gerado via ``new_shapelab_saas.ps1``.

## Governança & Inteligência
- Consulte ``.shapelab/INDEX.md`` e ``.shapelab/CORE_CONSTITUTION.md``.
- Sincronize aprendizados com ``.\scripts\brain_sync.ps1 -Mode pull``.
"@

$agentsBlock = Get-Content (Join-Path $brainRoot "templates\AGENTS_brain_block.md") -Raw -Encoding UTF8
Write-Utf8 "AGENTS.md" (@"
# $DisplayName — Diretrizes de Engenharia ShapeLab

- **Spec-First Gate:** Mapeie impacto e riscos Zero-Downtime antes de alterar contratos ou tabelas.
- **Segurança & BCB 4893:** Zero-Trust (guards fail-closed no servidor), RLS obrigatório no Supabase e centavos inteiros + WORM Ledger em finanças.
- **CI Preflight:** Nunca conclua entrega sem rodar ``pytest`` / ``flutter analyze`` / ``flutter test``.

"@ + $agentsBlock.TrimStart('-', "`r", "`n"))

New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "scripts") | Out-Null
Copy-Item (Join-Path $brainRoot "scripts\brain_sync.ps1") (Join-Path $projectRoot "scripts\brain_sync.ps1") -Force | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot ".github\workflows") | Out-Null
Copy-Item (Join-Path $brainRoot "templates\github_workflow_brain_sync.yml") (Join-Path $projectRoot ".github\workflows\brain_sync.yml") -Force

# 2. Backend FastAPI + SemVer version.py com release_delta.json
if (-not $SkipBackend) {
    Write-Utf8 "backend\pyproject.toml" @"
[build-system]
requires = ["setuptools>=69.0"]
build-backend = "setuptools.build_meta"

[project]
name = "$Name-backend"
version = "0.1.0"
description = "$DisplayName Backend FastAPI - ShapeLab"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn>=0.30.0",
    "pydantic>=2.9.0",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "ruff>=0.6.0",
]
"@

    Write-Utf8 "backend\app\main.py" @"
from fastapi import FastAPI

app = FastAPI(title="$DisplayName API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "$Name"}
"@

    Write-Utf8 "backend\tests\test_health.py" @'
from fastapi.testclient import TestClient
from app.main import app


def test_health() -> None:
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
'@

    Write-Utf8 "scripts\version.py" @'
#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def get_base_version() -> str:
    pyproject = ROOT_DIR / "backend" / "pyproject.toml"
    if pyproject.exists():
        m = re.search(r'^version\s*=\s*"([^"]+)"', pyproject.read_text(encoding="utf-8"), flags=re.MULTILINE)
        if m:
            return m.group(1)
    return "0.1.0"


def get_git_short_sha() -> str:
    env_sha = os.environ.get("GITHUB_SHA") or os.environ.get("COMMIT_SHA")
    if env_sha:
        return env_sha[:7]
    try:
        res = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=str(ROOT_DIR), capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except Exception:
        return "0000000"


def get_changed_files() -> list[str]:
    try:
        res = subprocess.run(["git", "diff", "--name-only", "HEAD~1", "HEAD"], cwd=str(ROOT_DIR), capture_output=True, text=True)
        if res.returncode == 0 and res.stdout.strip():
            return [l.strip() for l in res.stdout.splitlines() if l.strip()]
    except Exception:
        pass
    return []


def compute_version_metadata() -> dict:
    clean_semver = get_base_version()
    sha = get_git_short_sha()
    build_num = os.environ.get("GITHUB_RUN_NUMBER") or os.environ.get("BUILD_NUMBER") or "dev"
    return {
        "version": f"{clean_semver}+build.{build_num}.{sha}",
        "clean_semver": clean_semver,
        "docker_tag": f"{clean_semver}-build.{build_num}.{sha}",
        "git_sha": sha,
        "build_number": build_num,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--delta", action="store_true", help="Gera build/release_delta.json para o Brain Curator")
    args = parser.parse_args()
    meta = compute_version_metadata()

    if args.delta:
        changed = get_changed_files()
        delta = {
            "product": ROOT_DIR.name,
            "version": meta["clean_semver"],
            "build": meta["build_number"],
            "git_sha": meta["git_sha"],
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "changed_files": changed,
        }
        out_dir = ROOT_DIR / "build"
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "release_delta.json").write_text(json.dumps(delta, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(meta, indent=2))
    else:
        print(meta["version"])


if __name__ == "__main__":
    main()
'@
}

# 3. Mobile Flutter + Prism S + Edge-to-Edge + OTA YYYYMMDDNN
if (-not $SkipFlutter) {
    $pkgName = $Name -replace '-', '_'
    Write-Utf8 "mobile\pubspec.yaml" @"
name: $pkgName
description: "$DisplayName - ShapeLab Venture Builder"
publish_to: "none"
version: 0.1.0+1

environment:
  sdk: ^3.5.0

dependencies:
  flutter:
    sdk: flutter

dev_dependencies:
  flutter_lints: ^5.0.0
  flutter_test:
    sdk: flutter

flutter:
  uses-material-design: true
"@

    Write-Utf8 "mobile\lib\core\config\app_config.dart" @"
class AppConfig {
  static const String appVersion = '0.1.0';
  static const int buildNumber = 1;
  static const String buildDate = '23 de Novembro, 2026';
  static const String releaseNotes = 'Scaffolding inicial ShapeLab ($DisplayName).';
  static String get fullVersionString => 'v\$appVersion • Build \$buildNumber';
}
"@

    Write-Utf8 "mobile\lib\main.dart" @"
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  runApp(const ShapeLabApp());
}

class ShapeLabApp extends StatelessWidget {
  const ShapeLabApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '$DisplayName',
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF090D16),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF10B981),
          secondary: Color(0xFF06B6D4),
          surface: Color(0xFF0F172A),
        ),
      ),
      home: const Scaffold(
        body: SafeArea(
          child: Center(child: Text('$DisplayName • ShapeLab OS')),
        ),
      ),
    );
  }
}
"@

    New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "mobile\web\icons") | Out-Null
    Copy-Item (Join-Path $brainRoot "assets\brand\shapelab_logo_prism_s.png") (Join-Path $projectRoot "mobile\web\favicon.png") -Force
    Copy-Item (Join-Path $brainRoot "assets\brand\shapelab_logo_prism_s.png") (Join-Path $projectRoot "mobile\web\icons\Icon-192.png") -Force
    Copy-Item (Join-Path $brainRoot "assets\brand\shapelab_logo_prism_s.png") (Join-Path $projectRoot "mobile\web\icons\Icon-512.png") -Force
    Copy-Item (Join-Path $brainRoot "assets\brand\brand_manifest.json") (Join-Path $projectRoot "mobile\web\brand_manifest.json") -Force

    Write-Utf8 "mobile\web\manifest.json" @"
{
  "name": "$DisplayName • ShapeLab",
  "short_name": "$DisplayName",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#090D16",
  "theme_color": "#090D16",
  "icons": [
    { "src": "icons/Icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/Icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
"@

    Write-Utf8 "mobile\lib\core\ui\material_compat.dart" @"
// Barrel Adapter único de compatibilidade Material (padrão ShapeLab)
export 'package:flutter/material.dart';
"@

    Write-Utf8 "mobile\web\index.html" @"
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <base href="\$FLUTTER_BASE_HREF">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#090D16">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F8FAFC">
  <meta name="theme-color" content="#090D16">
  <link rel="icon" type="image/png" href="favicon.png">
  <link rel="manifest" href="manifest.json">
  <title>$DisplayName • ShapeLab</title>
</head>
<body style="background-color:#090D16;margin:0;">
  <div id="shapelab-splash" style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#090D16;transition:opacity .25s ease;">
    <img src="icons/Icon-192.png" alt="ShapeLab" width="88" height="88" style="filter:drop-shadow(0 0 18px rgba(16,185,129,.35)) drop-shadow(0 0 28px rgba(6,182,212,.25));" />
  </div>
  <script>
    const APP_CURRENT_BUILD = 1;
    (function initAssetCacheGuard() {
      const orig = window.fetch;
      if (typeof orig === 'function') {
        window.fetch = function(input, init) {
          const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
          if (url && (url.includes('AssetManifest') || url.includes('FontManifest') || url.includes('version.json'))) {
            const sep = url.includes('?') ? '&' : '?';
            return orig.call(this, url + sep + '_b=' + APP_CURRENT_BUILD, Object.assign({}, init || {}, { cache: 'no-store' }));
          }
          return orig.apply(this, arguments);
        };
      }
      function hideSplash() {
        var el = document.getElementById('shapelab-splash');
        if (!el) return;
        el.style.opacity = '0';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
      }
      window.addEventListener('flutter-first-frame', hideSplash, { once: true });
      setTimeout(hideSplash, 6000);
      window.syncPwaThemeColor = function (isDark) {
        var color = isDark ? '#090D16' : '#F8FAFC';
        document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
          m.setAttribute('content', color);
        });
      };
    })();
  </script>
  <script src="flutter_bootstrap.js" async></script>
</body>
</html>
"@
}

if (-not $SkipGit) {
    Push-Location $projectRoot
    try {
        git init -b main | Out-Null
        git submodule add https://github.com/cleudsonx/shapelab-brain.git .shapelab
    } catch {
        Write-Warning "Não foi possível adicionar submódulo remoto automaticamente (verifique conexão): $_"
    } finally {
        Pop-Location
    }
}

Write-Host "SaaS $DisplayName criado com sucesso em $projectRoot" -ForegroundColor Green
