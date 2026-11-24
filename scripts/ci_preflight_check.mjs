#!/usr/bin/env node
/**
 * ShapeLab CI Preflight Check (Standalone, Zero Dependencies)
 *
 * Execução direta:
 *   node scripts/ci_preflight_check.mjs [projectPath] [flags]
 *   ./.shapelab/scripts/ci_preflight_check.mjs --strict --threshold=80 --github-actions
 *
 * Também exporta `auditPreflight` para reuso como SSOT pelo `shapelab_brain_mcp.mjs`.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEFAULT_THRESHOLD = 80;

export const AUDIT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "build",
  ".venv",
  "venv",
  ".dart_tool",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  "dist",
  ".next",
  "coverage",
  ".firebase",
  ".gradle",
  "Pods",
  "target",
  ".shapelab",
]);

export const SECRET_RULES = [
  { name: "Stripe/Live Secret Key", regex: /\bsk_live_[0-9A-Za-z]{16,128}\b/ },
  { name: "Google/Firebase API Key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Asaas Production Token", regex: /\$aact_prod_[0-9A-Za-z_]{16,128}/ },
  { name: "GitHub Token", regex: /\bgh[pousr]_[0-9A-Za-z]{36,128}\b/ },
  { name: "AWS Access Key ID", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "Private Key PEM Block",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    name: "Hardcoded Service Role JWT",
    regex:
      /(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*[:=]\s*["']eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    name: "Hardcoded DB DSN Password",
    regex:
      /postgres(?:ql)?:\/\/[^:\s/'"]+:(?!<|\$\{|YOUR_|changeme|password|postgres@)[^@\s/'"]{6,}@(?!localhost\b|127\.0\.0\.1\b)[^\s/'"]+/i,
  },
];

export const SOURCE_SCAN_EXTENSIONS = new Set([
  ".py",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".dart",
  ".sql",
  ".sh",
  ".ps1",
  ".yaml",
  ".yml",
  ".toml",
  ".json",
]);

export const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
export const MAX_AUDIT_FILE_BYTES = 256 * 1024; // 256 KB
export const MAX_FINDINGS_PER_CHECK = 15;
export const MAX_AUDIT_FILES = 2000;
export const MAX_LINE_LENGTH = 2000;

function resolveGitBinary() {
  if (process.platform === "win32") {
    const candidates = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Git", "cmd", "git.exe"),
      process.env["ProgramFiles(x86)"] &&
        path.join(process.env["ProgramFiles(x86)"], "Git", "cmd", "git.exe"),
      process.env.LocalAppData &&
        path.join(process.env.LocalAppData, "Programs", "Git", "cmd", "git.exe"),
    ].filter(Boolean);
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return "git";
}

function runGitSafe(args, cwd) {
  try {
    const out = execFileSync(resolveGitBinary(), args, {
      cwd,
      shell: false,
      timeout: 5000,
      windowsHide: true,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        LC_ALL: "C",
      },
    });
    return String(out || "").trim();
  } catch {
    return null;
  }
}

function getGitContext(resolvedProject) {
  const sha = runGitSafe(["rev-parse", "--short", "HEAD"], resolvedProject);
  const branch = runGitSafe(["rev-parse", "--abbrev-ref", "HEAD"], resolvedProject);
  const subDir = path.join(resolvedProject, ".shapelab");
  const submoduleSha = fs.existsSync(subDir)
    ? runGitSafe(["rev-parse", "--short", "HEAD"], subDir)
    : null;
  return {
    isGitRepo: Boolean(sha),
    branch: branch || null,
    sha: sha || null,
    submoduleSha: submoduleSha || null,
  };
}

function walkProjectFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  let scannedCount = 0;

  while (stack.length > 0 && scannedCount < MAX_AUDIT_FILES) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!AUDIT_IGNORED_DIRS.has(entry.name)) {
          stack.push(path.join(current, entry.name));
        }
        continue;
      }
      if (entry.isFile()) {
        files.push(path.join(current, entry.name));
        scannedCount++;
        if (scannedCount >= MAX_AUDIT_FILES) break;
      }
    }
  }
  return files;
}

function safeReadText(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_AUDIT_FILE_BYTES) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function findLineNumber(content, regex) {
  if (!content) return 1;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length <= MAX_LINE_LENGTH && regex.test(lines[i])) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Executa auditoria Preflight em um repositório produto ShapeLab.
 * Compatível com `shapelab_brain_mcp.mjs` (`brain_audit_preflight` e `brain_cockpit`).
 */
export function auditPreflight({ projectPath } = {}) {
  if (!projectPath || typeof projectPath !== "string") {
    return { error: "Parâmetro 'projectPath' é obrigatório." };
  }
  if (/[\x00-\x1f]/.test(projectPath) || /^[\\/]{2}/.test(projectPath)) {
    return { error: "Caminho de projeto inválido ou caracteres de controle rejeitados." };
  }

  const resolvedProject = path.resolve(projectPath);
  if (!fs.existsSync(resolvedProject)) {
    return { error: `Diretório não existe: ${resolvedProject}` };
  }
  try {
    const lst = fs.lstatSync(resolvedProject);
    if (!lst.isDirectory() || lst.isSymbolicLink()) {
      return { error: `Caminho deve ser diretório real (não symlink): ${resolvedProject}` };
    }
  } catch {
    return { error: `Erro ao inspecionar diretório: ${resolvedProject}` };
  }

  const files = walkProjectFiles(resolvedProject);
  const relFiles = files.map((f) => ({
    full: f,
    rel: path.relative(resolvedProject, f).replace(/\\/g, "/"),
    ext: path.extname(f).toLowerCase(),
  }));

  const annotations = [];
  const pushFinding = (findingsList, detail) => {
    const loc = detail.file
      ? detail.line
        ? `${detail.file}:${detail.line}`
        : detail.file
      : null;
    findingsList.push(loc ? `${loc} — ${detail.message}` : detail.message);
    annotations.push(detail);
  };

  // ---------------------------------------------------------------------------
  // 1. Zero Segredos Hardcoded (25 pts | Crítico)
  // ---------------------------------------------------------------------------
  const secretFindings = [];
  for (const item of relFiles) {
    if (!SOURCE_SCAN_EXTENSIONS.has(item.ext)) continue;
    const base = path.basename(item.rel).toLowerCase();
    if (
      base === "package-lock.json" ||
      base === "pubspec.lock" ||
      base === "uv.lock" ||
      base.endsWith(".min.js") ||
      base.startsWith(".env.example") ||
      base.startsWith(".env.sample") ||
      base.startsWith(".env.template") ||
      base.startsWith("docker-compose")
    ) {
      continue;
    }
    const content = safeReadText(item.full);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (!line || line.length > MAX_LINE_LENGTH) continue;
      if (line.trimStart().startsWith("#") || line.trimStart().startsWith("//")) continue;
      for (const rule of SECRET_RULES) {
        if (rule.regex.test(line)) {
          // Desconsiderar DSNs para serviços locais em containers (db, localhost, postgres)
          if (
            rule.name === "Hardcoded DB DSN Password" &&
            /@(localhost|127\.0\.0\.1|db|postgres|host\.docker\.internal)\b/i.test(line)
          ) {
            continue;
          }
          pushFinding(secretFindings, {
            checkId: "hardcoded_secrets",
            severity: "error",
            critical: true,
            file: item.rel,
            line: idx + 1,
            message: `[${rule.name}] Possível segredo hardcoded detectado (valor ocultado por segurança).`,
          });
          break;
        }
      }
      if (secretFindings.length >= MAX_FINDINGS_PER_CHECK) break;
    }
    if (secretFindings.length >= MAX_FINDINGS_PER_CHECK) break;
  }
  const secretsOk = secretFindings.length === 0;

  // ---------------------------------------------------------------------------
  // 2. Supabase / PostgreSQL RLS (20 pts | Crítico)
  // ---------------------------------------------------------------------------
  const sqlFiles = relFiles.filter((f) => f.ext === ".sql");
  const rlsFindings = [];
  let hasCreateTable = false;
  let hasEnableRls = false;
  let hasPostgresOrSupabaseSignal = relFiles.some((f) => f.rel.startsWith("supabase/"));
  let firstCreateTableLoc = null;

  for (const item of sqlFiles) {
    const content = safeReadText(item.full);
    if (!content) continue;

    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (!line || line.length > MAX_LINE_LENGTH) continue;
      if (/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(line)) {
        if (rlsFindings.length < MAX_FINDINGS_PER_CHECK) {
          pushFinding(rlsFindings, {
            checkId: "supabase_rls",
            severity: "error",
            critical: true,
            file: item.rel,
            line: idx + 1,
            message: "DISABLE ROW LEVEL SECURITY detectado em script SQL.",
          });
        }
      }
      if (!firstCreateTableLoc && /CREATE\s+TABLE/i.test(line)) {
        firstCreateTableLoc = { file: item.rel, line: idx + 1 };
      }
    }

    if (/CREATE\s+TABLE/i.test(content)) hasCreateTable = true;
    if (/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(content)) hasEnableRls = true;
    if (
      item.rel.startsWith("supabase/") ||
      /\bpublic\.[a-zA-Z_]/i.test(content) ||
      /auth\.uid\s*\(/i.test(content)
    ) {
      hasPostgresOrSupabaseSignal = true;
    }
  }

  if (hasCreateTable && hasPostgresOrSupabaseSignal && !hasEnableRls) {
    pushFinding(rlsFindings, {
      checkId: "supabase_rls",
      severity: "error",
      critical: true,
      file: firstCreateTableLoc ? firstCreateTableLoc.file : null,
      line: firstCreateTableLoc ? firstCreateTableLoc.line : null,
      message: "Tabelas SQL em schema Supabase/PostgreSQL sem 'ENABLE ROW LEVEL SECURITY'.",
    });
  }
  const rlsOk = rlsFindings.length === 0;

  // ---------------------------------------------------------------------------
  // 3. Versionamento YYYYMMDDNN / SemVer (20 pts | Não-crítico)
  // ---------------------------------------------------------------------------
  const versionFindings = [];
  let validVersionManifests = 0;

  const pubspecCandidates = relFiles.filter(
    (f) => f.rel === "pubspec.yaml" || f.rel === "mobile/pubspec.yaml"
  );
  for (const pub of pubspecCandidates) {
    const content = safeReadText(pub.full);
    if (!content) continue;
    const m = content.match(/^version:\s*([^\s#]+)/m);
    if (!m) {
      pushFinding(versionFindings, {
        checkId: "versioning_semver_yyyymmddnn",
        severity: "warning",
        critical: false,
        file: pub.rel,
        line: 1,
        message: "Campo 'version:' ausente no pubspec.yaml.",
      });
      continue;
    }
    const verLine = findLineNumber(content, /^version:\s*/);
    const rawVer = m[1].trim();
    const vm = rawVer.match(/^(\d+\.\d+\.\d+)\+(\d+)$/);
    if (!vm) {
      pushFinding(versionFindings, {
        checkId: "versioning_semver_yyyymmddnn",
        severity: "warning",
        critical: false,
        file: pub.rel,
        line: verLine,
        message: `Versão '${rawVer}' não segue 'X.Y.Z+YYYYMMDDNN'.`,
      });
      continue;
    }
    const buildStr = vm[2];
    const buildNum = Number(buildStr);
    if (buildStr.length !== 10 || !Number.isInteger(buildNum) || buildNum > 2147483647) {
      pushFinding(versionFindings, {
        checkId: "versioning_semver_yyyymmddnn",
        severity: "warning",
        critical: false,
        file: pub.rel,
        line: verLine,
        message: `Build '${buildStr}' deve ter 10 dígitos YYYYMMDDNN <= 2147483647 (32-bit safe).`,
      });
      continue;
    }
    validVersionManifests++;

    const webDir = path.dirname(pub.rel) === "." ? "web" : `${path.dirname(pub.rel)}/web`;
    const versionJsonItem = relFiles.find((f) => f.rel === `${webDir}/version.json`);
    if (versionJsonItem) {
      try {
        const vj = JSON.parse(safeReadText(versionJsonItem.full) || "{}");
        if (String(vj.version) !== vm[1] || String(vj.build) !== buildStr) {
          pushFinding(versionFindings, {
            checkId: "versioning_semver_yyyymmddnn",
            severity: "warning",
            critical: false,
            file: versionJsonItem.rel,
            line: 1,
            message: `Dessincronizado com ${pub.rel} (esperado ${vm[1]}+${buildStr}).`,
          });
        }
      } catch {
        pushFinding(versionFindings, {
          checkId: "versioning_semver_yyyymmddnn",
          severity: "warning",
          critical: false,
          file: versionJsonItem.rel,
          line: 1,
          message: "JSON inválido em version.json.",
        });
      }
    }
  }

  const pkgCandidates = relFiles.filter(
    (f) => f.rel === "package.json" || f.rel === "backend/package.json"
  );
  for (const pkg of pkgCandidates) {
    const raw = safeReadText(pkg.full);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.version !== undefined) {
        if (!SEMVER_REGEX.test(String(parsed.version))) {
          pushFinding(versionFindings, {
            checkId: "versioning_semver_yyyymmddnn",
            severity: "warning",
            critical: false,
            file: pkg.rel,
            line: findLineNumber(raw, /"version"\s*:/),
            message: `Version '${parsed.version}' não é SemVer válido.`,
          });
        } else {
          validVersionManifests++;
        }
      }
    } catch {
      pushFinding(versionFindings, {
        checkId: "versioning_semver_yyyymmddnn",
        severity: "warning",
        critical: false,
        file: pkg.rel,
        line: 1,
        message: "JSON inválido em package.json.",
      });
    }
  }

  const pyprojectCandidates = relFiles.filter(
    (f) => f.rel === "pyproject.toml" || f.rel === "backend/pyproject.toml"
  );
  for (const pyproj of pyprojectCandidates) {
    const content = safeReadText(pyproj.full);
    if (!content) continue;
    const m = content.match(/^version\s*=\s*["']([^"']+)["']/m);
    if (m) {
      if (!SEMVER_REGEX.test(m[1].trim())) {
        pushFinding(versionFindings, {
          checkId: "versioning_semver_yyyymmddnn",
          severity: "warning",
          critical: false,
          file: pyproj.rel,
          line: findLineNumber(content, /^version\s*=/),
          message: `Version '${m[1]}' não é SemVer válido.`,
        });
      } else {
        validVersionManifests++;
      }
    }
  }

  const versionFile = relFiles.find((f) => f.rel === "VERSION");
  if (versionFile) {
    const content = safeReadText(versionFile.full);
    if (content && SEMVER_REGEX.test(content.trim())) {
      validVersionManifests++;
    } else {
      pushFinding(versionFindings, {
        checkId: "versioning_semver_yyyymmddnn",
        severity: "warning",
        critical: false,
        file: versionFile.rel,
        line: 1,
        message: `'${content?.trim() || ""}' não é SemVer válido.`,
      });
    }
  }

  if (validVersionManifests === 0 && versionFindings.length === 0) {
    pushFinding(versionFindings, {
      checkId: "versioning_semver_yyyymmddnn",
      severity: "warning",
      critical: false,
      file: null,
      line: null,
      message:
        "Nenhum manifesto de versionamento válido encontrado (pubspec.yaml, package.json, pyproject.toml ou VERSION).",
    });
  }
  const versioningOk = versionFindings.length === 0 && validVersionManifests > 0;

  // ---------------------------------------------------------------------------
  // 4. Async HTTP & Security Hygiene (20 pts | Crítico)
  // ---------------------------------------------------------------------------
  const hygieneFindings = [];
  const syncRequestsRe = /\brequests\.(get|post|put|delete|patch|request)\s*\(/;
  const algNoneRe = /\balg["']?\s*[:=]\s*["']none["']/i;

  for (const item of relFiles) {
    if (item.ext === ".py") {
      const content = safeReadText(item.full);
      if (content && /\basync\s+def\b/.test(content) && syncRequestsRe.test(content)) {
        const lines = content.split(/\r?\n/);
        for (let idx = 0; idx < lines.length; idx++) {
          const line = lines[idx];
          if (!line || line.length > MAX_LINE_LENGTH) continue;
          if (line.trimStart().startsWith("#")) continue;
          if (syncRequestsRe.test(line)) {
            pushFinding(hygieneFindings, {
              checkId: "async_http_and_security_hygiene",
              severity: "error",
              critical: true,
              file: item.rel,
              line: idx + 1,
              message:
                "Uso de 'requests' síncrono em módulo com 'async def' (substitua por httpx.AsyncClient).",
            });
            if (hygieneFindings.length >= MAX_FINDINGS_PER_CHECK) break;
          }
        }
      }
    }

    const isTestFile =
      item.rel.includes("/tests/") ||
      item.rel.includes("/test/") ||
      item.rel.includes("test_") ||
      item.rel.includes("_test.");

    if (
      !isTestFile &&
      hygieneFindings.length < MAX_FINDINGS_PER_CHECK &&
      [".py", ".ts", ".js", ".mjs"].includes(item.ext)
    ) {
      const content = safeReadText(item.full);
      if (content && algNoneRe.test(content)) {
        const lines = content.split(/\r?\n/);
        for (let idx = 0; idx < lines.length; idx++) {
          const line = lines[idx];
          if (!line || line.length > MAX_LINE_LENGTH) continue;
          const trimmed = line.trimStart();
          if (trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
          if (/\b(reject|unsupported|insecure|invalid|forbid|raise|assert|!=|!==)\b/i.test(line)) continue;
          if (algNoneRe.test(line)) {
            pushFinding(hygieneFindings, {
              checkId: "async_http_and_security_hygiene",
              severity: "error",
              critical: true,
              file: item.rel,
              line: idx + 1,
              message: "Referência suspeita a JWT 'alg: none' detectada.",
            });
            if (hygieneFindings.length >= MAX_FINDINGS_PER_CHECK) break;
          }
        }
      }
    }

    if (hygieneFindings.length >= MAX_FINDINGS_PER_CHECK) break;
  }
  const hygieneOk = hygieneFindings.length === 0;

  // ---------------------------------------------------------------------------
  // 5. Governança ShapeLab (.shapelab + brain_sync.ps1) (15 pts)
  //    - Ausência de .shapelab/INDEX.md é gate crítico (--strict falha)
  //    - Ausência apenas de scripts/brain_sync.ps1 gera ::warning
  // ---------------------------------------------------------------------------
  const govFindings = [];
  const hasSubmodule =
    fs.existsSync(path.join(resolvedProject, ".shapelab", "INDEX.md")) ||
    fs.existsSync(path.join(resolvedProject, "INDEX.md"));
  const hasSyncScript = fs.existsSync(
    path.join(resolvedProject, "scripts", "brain_sync.ps1")
  );

  if (!hasSubmodule) {
    pushFinding(govFindings, {
      checkId: "shapelab_governance_sync",
      severity: "error",
      critical: true,
      file: null,
      line: null,
      message: "Submódulo .shapelab/INDEX.md ausente (governança ShapeLab não inicializada).",
    });
  }
  if (!hasSyncScript) {
    pushFinding(govFindings, {
      checkId: "shapelab_governance_sync",
      severity: "warning",
      critical: false,
      file: null,
      line: null,
      message: "Script scripts/brain_sync.ps1 ausente no repositório produto.",
    });
  }
  const govOk = govFindings.length === 0;

  const checks = [
    {
      id: "hardcoded_secrets",
      name: "Zero Segredos Hardcoded",
      status: secretsOk ? "OK" : "FAIL",
      critical: true,
      hasCriticalFailure: !secretsOk,
      weight: 25,
      score: secretsOk ? 25 : 0,
      findings: secretFindings,
    },
    {
      id: "supabase_rls",
      name: "Supabase / PostgreSQL RLS",
      status: rlsOk ? "OK" : "FAIL",
      critical: true,
      hasCriticalFailure: !rlsOk,
      weight: 20,
      score: rlsOk ? 20 : 0,
      findings: rlsFindings,
    },
    {
      id: "versioning_semver_yyyymmddnn",
      name: "Versionamento YYYYMMDDNN / SemVer",
      status: versioningOk ? "OK" : "FAIL",
      critical: false,
      hasCriticalFailure: false,
      weight: 20,
      score: versioningOk ? 20 : 0,
      findings: versionFindings,
    },
    {
      id: "async_http_and_security_hygiene",
      name: "Higiene Async HTTP & JWT",
      status: hygieneOk ? "OK" : "FAIL",
      critical: true,
      hasCriticalFailure: !hygieneOk,
      weight: 20,
      score: hygieneOk ? 20 : 0,
      findings: hygieneFindings,
    },
    {
      id: "shapelab_governance_sync",
      name: "Governança .shapelab & brain_sync.ps1",
      status: govOk ? "OK" : "FAIL",
      critical: !hasSubmodule,
      hasCriticalFailure: !hasSubmodule,
      weight: 15,
      score: govOk ? 15 : 0,
      findings: govFindings,
    },
  ];

  const totalScore = checks.reduce((acc, c) => acc + c.score, 0);
  const okCount = checks.filter((c) => c.status === "OK").length;
  const failCount = checks.length - okCount;
  const criticalFailCount = checks.filter((c) => c.hasCriticalFailure).length;
  const git = getGitContext(resolvedProject);

  return {
    projectPath: resolvedProject,
    score: totalScore,
    maxScore: 100,
    passed: failCount === 0,
    criticalFailCount,
    git,
    summary: {
      filesScanned: relFiles.length,
      totalChecks: checks.length,
      okCount,
      failCount,
      criticalFailCount,
    },
    checks,
    annotations,
  };
}

// =============================================================================
// CLI Argument Parser & Output Formatters
// =============================================================================

function printHelp() {
  const helpText = `
ShapeLab CI Preflight Check (Zero Dependencies)

Uso:
  node scripts/ci_preflight_check.mjs [projectPath] [flags]
  ./.shapelab/scripts/ci_preflight_check.mjs [projectPath] [flags]

Argumentos:
  projectPath             Diretório raiz do projeto (padrão: diretório atual / cwd)

Flags:
  --strict                Encerra com exit code 1 se qualquer gate crítico falhar
                          (segredos hardcoded, RLS ausente/desabilitado, requests
                          síncrono em async def / JWT alg:none, ausência de .shapelab)
  --threshold=<0..100>    Score mínimo exigido para aprovação (padrão: ${DEFAULT_THRESHOLD})
  --fix                   Auto-Healing: detecta e aplica correções canônicas automaticamente
  --warn-only             Executa em modo observacional: relata tudo mas sai com código 0
  --github-actions        Emite anotações ::error / ::warning e grava $GITHUB_STEP_SUMMARY
                          (ativado automaticamente quando GITHUB_ACTIONS=true)
  --json                  Imprime resultado completo em JSON no stdout
  --no-color              Desativa cores ANSI no terminal (respeita NO_COLOR)
  -h, --help              Exibe esta ajuda

Exit Codes:
  0  Preflight aprovado (ou --warn-only ativo)
  1  Preflight reprovado (score < threshold ou falha em gate crítico com --strict)
  2  Argumentos inválidos ou diretório inacessível
`.trimStart();
  process.stdout.write(helpText);
}

function parseCliArgs(argv) {
  let projectPath = null;
  let strict = false;
  let autoFix = false;
  let warnOnly = false;
  let threshold = Number(process.env.SHAPELAB_PREFLIGHT_THRESHOLD || DEFAULT_THRESHOLD);
  let githubActions = process.env.GITHUB_ACTIONS === "true";
  let jsonOutput = false;
  let noColor = process.env.NO_COLOR !== undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      help = true;
    } else if (arg === "--strict") {
      strict = true;
    } else if (arg === "--fix") {
      autoFix = true;
    } else if (arg === "--warn-only") {
      warnOnly = true;
    } else if (arg === "--github-actions") {
      githubActions = true;
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--no-color") {
      noColor = true;
    } else if (arg.startsWith("--threshold=")) {
      threshold = Number(arg.slice("--threshold=".length));
    } else if (arg === "--threshold") {
      if (i + 1 >= argv.length) {
        return { error: "Flag '--threshold' requer um valor numérico (0..100)." };
      }
      threshold = Number(argv[++i]);
    } else if (arg.startsWith("--project=")) {
      projectPath = arg.slice("--project=".length);
    } else if (arg === "--project") {
      if (i + 1 >= argv.length) {
        return { error: "Flag '--project' requer um caminho de diretório." };
      }
      projectPath = argv[++i];
    } else if (arg.startsWith("-")) {
      return { error: `Flag desconhecida: ${arg}` };
    } else if (!projectPath) {
      projectPath = arg;
    } else {
      return { error: `Argumento posicional inesperado: ${arg}` };
    }
  }

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    return { error: `Threshold inválido: '${threshold}'. Informe um número entre 0 e 100.` };
  }

  return {
    help,
    projectPath: projectPath || process.cwd(),
    strict,
    autoFix,
    warnOnly,
    threshold,
    githubActions,
    jsonOutput,
    noColor,
  };
}

function escapeGhProperty(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function escapeGhData(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function emitGitHubActionsAnnotations(result, { warnOnly }) {
  if (!Array.isArray(result.annotations) || result.annotations.length === 0) return;
  for (const ann of result.annotations) {
    const level = warnOnly ? "warning" : (ann.severity === "error" ? "error" : "warning");
    const msg = escapeGhData(`[${ann.checkId}] ${ann.message}`);
    if (ann.file) {
      const line = Number.isInteger(ann.line) && ann.line > 0 ? ann.line : 1;
      process.stdout.write(
        `::${level} file=${escapeGhProperty(ann.file)},line=${line}::${msg}\n`
      );
    } else {
      process.stdout.write(`::${level}::${msg}\n`);
    }
  }
}

function writeGitHubStepSummary(result, { threshold, strict, warnOnly, approved, failReasons }) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const statusBadge = approved ? "✅ APROVADO" : (warnOnly ? "⚠️ AVISO (Modo Observacional)" : "❌ REPROVADO");
  const gitDesc = result.git?.isGitRepo
    ? `\`${result.git.branch || "HEAD"}@${result.git.sha}\`` +
      (result.git.submoduleSha ? ` | \`.shapelab@${result.git.submoduleSha}\`` : "")
    : "Não versionado";

  const lines = [
    `## 🛡️ ShapeLab CI Preflight Audit — ${statusBadge}`,
    "",
    `- **Score:** \`${result.score}/${result.maxScore}\` (mínimo: \`${threshold}\`)`,
    `- **Modo Strict:** \`${strict ? "ON" : "OFF"}\` | **Warn Only:** \`${warnOnly ? "SIM" : "NÃO"}\` | **Arquivos Escaneados:** \`${result.summary.filesScanned}\``,
    `- **Contexto Git:** ${gitDesc}`,
  ];

  if (!approved && failReasons.length > 0) {
    lines.push(`- **Motivo do Bloqueio:** ${failReasons.join(" | ")}`);
  }

  lines.push(
    "",
    "| Status | Gate | Crítico | Pontuação | Ocorrências |",
    "| :--- | :--- | :---: | :---: | :---: |"
  );

  for (const c of result.checks) {
    const icon = c.status === "OK" ? "✅ OK" : c.hasCriticalFailure ? "❌ FAIL" : "⚠️ WARN";
    const crit = c.critical ? "Sim" : "Não";
    lines.push(
      `| ${icon} | ${c.name} | ${crit} | \`${c.score}/${c.weight}\` | ${c.findings.length} |`
    );
  }

  if (result.annotations.length > 0) {
    lines.push("", "<details>", `<summary>Detalhes das ocorrências (${result.annotations.length})</summary>`, "");
    for (const ann of result.annotations) {
      const badge = ann.severity === "error" ? "🔴" : "🟡";
      const loc = ann.file ? `\`${ann.file}:${ann.line || 1}\`` : "`repo`";
      lines.push(`- ${badge} ${loc} **(${ann.checkId})**: ${ann.message}`);
    }
    lines.push("", "</details>");
  }

  lines.push("");

  try {
    fs.appendFileSync(summaryPath, lines.join("\n"), "utf8");
  } catch (err) {
    process.stderr.write(
      `Aviso: falha ao gravar GITHUB_STEP_SUMMARY (${summaryPath}): ${err?.message || err}\n`
    );
  }
}

function makeColorizer(disabled) {
  const wrap = (code) => (txt) => (disabled ? String(txt) : `\x1b[${code}m${txt}\x1b[0m`);
  return {
    bold: wrap("1"),
    dim: wrap("2"),
    red: wrap("31"),
    green: wrap("32"),
    yellow: wrap("33"),
    cyan: wrap("36"),
    bgRed: wrap("41;37;1"),
    bgGreen: wrap("42;30;1"),
  };
}

function renderTerminalReport(result, { threshold, strict, warnOnly, approved, failReasons, noColor }) {
  const c = makeColorizer(noColor);
  const sep = c.dim("─".repeat(78));
  const out = [];

  out.push("");
  out.push(c.bold(c.cyan("🛡️  ShapeLab CI Preflight Audit")));
  out.push(sep);
  out.push(`  ${c.dim("Projeto:")}    ${result.projectPath}`);
  if (result.git?.isGitRepo) {
    const subInfo = result.git.submoduleSha ? ` | .shapelab@${result.git.submoduleSha}` : "";
    out.push(`  ${c.dim("Git:")}        ${result.git.branch || "HEAD"}@${result.git.sha}${subInfo}`);
  }
  out.push(
    `  ${c.dim("Política:")}   threshold=${c.bold(threshold)}/100 | strict=${strict ? c.bold("ON") : "OFF"} | warn-only=${warnOnly ? "SIM" : "NÃO"} | arquivos=${result.summary.filesScanned}`
  );
  out.push(sep);

  const colGate = 38;
  const colCrit = 9;
  const colScore = 10;
  out.push(
    `  ${c.bold("Status".padEnd(10))} ${c.bold("Gate".padEnd(colGate))} ${c.bold("Crítico".padEnd(colCrit))} ${c.bold("Score".padStart(colScore))}`
  );
  out.push(c.dim(`  ${"-".repeat(10)} ${"-".repeat(colGate)} ${"-".repeat(colCrit)} ${"-".repeat(colScore)}`));

  for (const check of result.checks) {
    let statusLabel;
    if (check.status === "OK") {
      statusLabel = c.green("✅ OK  ");
    } else if (check.hasCriticalFailure) {
      statusLabel = c.red("❌ FAIL");
    } else {
      statusLabel = c.yellow("⚠️ WARN");
    }

    const critLabel = check.critical ? (check.hasCriticalFailure ? c.red("SIM") : "SIM") : c.dim("NÃO");
    const scoreStr = `${check.score}/${check.weight}`.padStart(colScore);
    const coloredScore = check.status === "OK" ? c.green(scoreStr) : c.yellow(scoreStr);

    const rawCritPad = " ".repeat(Math.max(0, colCrit - 3));
    const gateName = check.name.slice(0, colGate).padEnd(colGate);
    out.push(`  ${statusLabel}   ${gateName} ${critLabel}${rawCritPad} ${coloredScore}`);

    for (const finding of check.findings) {
      const prefix = check.hasCriticalFailure ? c.red("     └─ ") : c.yellow("     └─ ");
      out.push(`${prefix}${finding}`);
    }
  }

  out.push(sep);

  const filledBlocks = Math.round((result.score / result.maxScore) * 20);
  const bar = "█".repeat(filledBlocks) + "░".repeat(20 - filledBlocks);
  const scoreColor = approved ? c.green : (warnOnly ? c.yellow : c.red);
  const badge = approved ? c.bgGreen(" APPROVED ") : (warnOnly ? c.yellow(" OBSERVE ") : c.bgRed(" REJECTED "));

  out.push(
    `  ${badge}  Score: ${scoreColor(c.bold(`${result.score}/${result.maxScore}`))} [${scoreColor(bar)}] (min: ${threshold})`
  );

  if (!approved && failReasons.length > 0) {
    for (const reason of failReasons) {
      const icon = warnOnly ? c.yellow("▲") : c.red("✖");
      out.push(`  ${icon} ${reason}`);
    }
  }
  out.push("");

  process.stdout.write(out.join("\n"));
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(`Erro de argumento: ${parsed.error}\nUse --help para ver as opções.\n`);
    process.exit(2);
  }
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  if (parsed.autoFix) {
    try {
      const { autoHealProject } = await import("./tools/auto_heal.mjs");
      const healRes = autoHealProject({ projectPath: parsed.projectPath, apply: true });
      if (!parsed.jsonOutput && healRes.patchesCount > 0) {
        process.stdout.write(`\n🔧 [Auto-Heal] ${healRes.summary}\n`);
        for (const p of healRes.patches) {
          process.stdout.write(`   └─ [${p.rule}] ${p.file}: ${p.description}\n`);
        }
        process.stdout.write("\n");
      }
    } catch (healErr) {
      process.stderr.write(`Aviso: Falha ao executar auto-heal: ${healErr?.message || healErr}\n`);
    }
  }

  const result = auditPreflight({ projectPath: parsed.projectPath });
  if (result.error) {
    if (parsed.githubActions) {
      process.stdout.write(`::error::${escapeGhData(result.error)}\n`);
    }
    process.stderr.write(`Erro no preflight: ${result.error}\n`);
    process.exit(2);
  }

  const failReasons = [];
  if (result.score < parsed.threshold) {
    failReasons.push(`Score ${result.score}/100 abaixo do threshold mínimo (${parsed.threshold}).`);
  }
  if (parsed.strict && result.criticalFailCount > 0) {
    failReasons.push(
      `Modo --strict ativo: ${result.criticalFailCount} gate(s) crítico(s) reprovado(s).`
    );
  }

  const approved = failReasons.length === 0;

  if (parsed.githubActions) {
    emitGitHubActionsAnnotations(result, { warnOnly: parsed.warnOnly });
    writeGitHubStepSummary(result, {
      threshold: parsed.threshold,
      strict: parsed.strict,
      warnOnly: parsed.warnOnly,
      approved,
      failReasons,
    });
  }

  if (parsed.jsonOutput) {
    process.stdout.write(
      JSON.stringify(
        {
          ...result,
          policy: {
            threshold: parsed.threshold,
            strict: parsed.strict,
            warnOnly: parsed.warnOnly,
            approved,
            failReasons,
          },
        },
        null,
        2
      ) + "\n"
    );
  } else {
    renderTerminalReport(result, {
      threshold: parsed.threshold,
      strict: parsed.strict,
      warnOnly: parsed.warnOnly,
      approved,
      failReasons,
      noColor: parsed.noColor,
    });
  }

  if (parsed.warnOnly) {
    process.exit(0);
  }

  process.exit(approved ? 0 : 1);
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main();
}
