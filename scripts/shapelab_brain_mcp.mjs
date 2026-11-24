import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_BRAIN_ROOT =
  process.env.SHAPELAB_BRAIN_ROOT ||
  "c:\\Users\\Cleudson\\OneDrive\\Documentos\\PROJETOS 2026\\shapelab-brain";

const ALLOWED_PRODUCTS = new Set(["B2B-personal-ia", "ReformAI", "Smart-EV-Hub"]);
const DEFAULT_PRODUCTS = ["B2B-personal-ia", "ReformAI", "Smart-EV-Hub"];

const RESOURCE_REGISTRY = new Map([
  [
    "brain://constitution",
    {
      uri: "brain://constitution",
      name: "ShapeLab Core Constitution",
      description: "Diretrizes técnicas e de governança inegociáveis da ShapeLab.",
      mimeType: "text/markdown",
      relativePath: "CORE_CONSTITUTION.md",
    },
  ],
  [
    "brain://brand/manifest",
    {
      uri: "brain://brand/manifest",
      name: "ShapeLab Brand Manifest",
      description: "Tokens visuais oficiais, paleta Prism S Neon e targets PWA/SEO/Mobile.",
      mimeType: "application/json",
      relativePath: path.join("assets", "brand", "brand_manifest.json"),
    },
  ],
  [
    "brain://matrix",
    {
      uri: "brain://matrix",
      name: "ShapeLab Product Matrix",
      description: "Matriz de adoção de skills e status de sincronia entre produtos.",
      mimeType: "text/markdown",
      relativePath: path.join("memory", "PRODUCT_MATRIX.md"),
    },
  ],
  [
    "brain://tech-radar",
    {
      uri: "brain://tech-radar",
      name: "ShapeLab Tech Radar",
      description: "Radar de tecnologias aprovadas (ADOTAR), experimentais e banidas.",
      mimeType: "text/markdown",
      relativePath: path.join("memory", "TECH_RADAR.md"),
    },
  ],
  [
    "brain://lessons",
    {
      uri: "brain://lessons",
      name: "ShapeLab Lessons Learned",
      description: "Base viva de incidentes resolvidos e soluções padrão ShapeLab.",
      mimeType: "text/markdown",
      relativePath: path.join("memory", "LESSONS_LEARNED.md"),
    },
  ],
]);

const STRICT_BRAIN_URI_RE = /^brain:\/\/([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/;
const MAX_RESOURCE_BYTES = 512 * 1024; // 512 KB

const AUDIT_IGNORED_DIRS = new Set([
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

const SECRET_RULES = [
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

const SOURCE_SCAN_EXTENSIONS = new Set([
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

const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const MAX_AUDIT_FILE_BYTES = 256 * 1024; // 256 KB
const MAX_FINDINGS_PER_CHECK = 15;
const MAX_AUDIT_FILES = 2000;
const MAX_LINE_LENGTH = 2000;

let syncInProgress = false;

function rpcError(code, message) {
  return { code, message };
}

function maskSecret(s) {
  if (typeof s !== "string") return "****";
  return s.length <= 12 ? "****" : `${s.slice(0, 6)}****${s.slice(-4)}`;
}

function isPathInside(baseRealPath, targetRealPath, allowSame = false) {
  const b = process.platform === "win32" ? baseRealPath.toLowerCase() : baseRealPath;
  const t = process.platform === "win32" ? targetRealPath.toLowerCase() : targetRealPath;
  const rel = path.relative(b, t);
  if (rel === "") return allowSame;
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function resolveBrainRoot(workspacePath) {
  if (workspacePath && typeof workspacePath === "string") {
    const cleanPath = path.resolve(workspacePath);
    const sub = path.join(cleanPath, ".shapelab");
    if (fs.existsSync(path.join(sub, "INDEX.md"))) return sub;
  }
  return DEFAULT_BRAIN_ROOT;
}

function collectMarkdownFiles(rootDir) {
  const results = [];
  const folders = ["skills", "agents", "memory", "templates"];
  for (const top of ["CORE_CONSTITUTION.md", "INDEX.md"]) {
    const p = path.join(rootDir, top);
    if (fs.existsSync(p)) results.push(p);
  }
  for (const folder of folders) {
    const base = path.join(rootDir, folder);
    if (!fs.existsSync(base)) continue;
    try {
      const lst = fs.lstatSync(base);
      if (lst.isSymbolicLink()) continue;
    } catch {
      continue;
    }
    const walk = (dir) => {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".md")) results.push(full);
      }
    };
    walk(base);
  }
  return results;
}

function queryBrain({ query, workspacePath, maxResults = 5 }) {
  const root = resolveBrainRoot(workspacePath);
  if (!fs.existsSync(root)) {
    return { error: `Brain root not found: ${root}` };
  }
  const max = Math.max(1, Math.min(Number(maxResults) || 5, 20));
  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const files = collectMarkdownFiles(root);
  const scored = [];

  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    let content = "";
    try {
      const st = fs.statSync(file);
      if (st.size > MAX_RESOURCE_BYTES) continue;
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lower = content.toLowerCase();
    const relLower = rel.toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (relLower.includes(term)) score += 10;
      const matches = lower.split(term).length - 1;
      if (matches > 0) score += Math.min(matches, 8) * 2;
    }
    if (score === 0) continue;

    const lines = content.split(/\r?\n/);
    const snippets = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase();
      if (terms.some((t) => l.includes(t))) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 4);
        snippets.push(`L${start + 1}-${end}: ${lines.slice(start, end).join("\n")}`);
        i = end;
        if (snippets.length >= 2) break;
      }
    }
    scored.push({ file: rel, score, snippets });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    brainRoot: root,
    query,
    matches: scored.slice(0, max),
  };
}

function vaccineStatus({ product, workspacePath }) {
  const root = resolveBrainRoot(workspacePath);
  const matrixPath = path.join(root, "memory", "PRODUCT_MATRIX.md");
  const versionPath = path.join(root, "VERSION");
  if (!fs.existsSync(matrixPath)) {
    return { error: "PRODUCT_MATRIX.md not found" };
  }
  const brainVersion = fs.existsSync(versionPath)
    ? fs.readFileSync(versionPath, "utf8").trim()
    : "unknown";
  const matrix = fs.readFileSync(matrixPath, "utf8");
  const rows = matrix.split(/\r?\n/).filter((l) => l.startsWith("| `skills/"));
  const parsed = rows.map((row) => {
    const cols = row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    return {
      skill: cols[0]?.replace(/`/g, ""),
      "B2B-personal-ia": cols[1] || "",
      ReformAI: cols[2] || "",
      "Smart-EV-Hub": cols[3] || "",
      "tattoo-saas": cols[4] || "",
    };
  });

  if (product && typeof product === "string") {
    const safeProd = product.trim();
    const filtered = parsed.map((r) => ({
      skill: r.skill,
      status: Object.prototype.hasOwnProperty.call(r, safeProd) ? r[safeProd] : "unknown",
    }));
    return { brainVersion, product: safeProd, skills: filtered };
  }
  return { brainVersion, matrix: parsed };
}

function proposeLesson({
  title,
  origin,
  category,
  rootCause,
  solution,
  scoreMultiProduct = 3,
  scoreRiskCost = 2,
  scoreAgnostic = 3,
}) {
  const total =
    Number(scoreMultiProduct) + Number(scoreRiskCost) + Number(scoreAgnostic);
  const approved = total >= 7;
  const dateStr = new Date().toISOString().slice(0, 7);
  const row = `| \`LL-NEW\` | ${dateStr} | \`${origin}\` | ${category} | ${rootCause} | ${solution} |`;
  return {
    rubricScore: total,
    threshold: 7,
    eligibleForBrain: approved,
    recommendation: approved
      ? "Score >= 7: Promova para .shapelab/memory/LESSONS_LEARNED.md, incremente VERSION (PATCH) + CHANGELOG.md e rode brain_sync.ps1 -Mode contribute."
      : "Score < 7: Mantenha apenas no repositório local do produto.",
    proposedMarkdownRow: row,
    title,
  };
}

function listBrainResources() {
  return Array.from(RESOURCE_REGISTRY.values()).map(
    ({ uri, name, description, mimeType }) => ({
      uri,
      name,
      description,
      mimeType,
    })
  );
}

function validateBrainUri(uri) {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 256) return null;
  if (uri.includes("%") || uri.includes("\0") || uri.includes("\\")) return null;
  const m = STRICT_BRAIN_URI_RE.exec(uri);
  if (!m) return null;
  return uri;
}

function readBrainResource(rawUri) {
  const uri = validateBrainUri(rawUri);
  if (!uri) {
    return { error: rpcError(-32602, "Invalid brain:// URI format") };
  }

  const entry = RESOURCE_REGISTRY.get(uri);
  if (!entry) {
    return { error: rpcError(-32002, `Resource not in whitelist: ${uri}`) };
  }

  const resolvedRoot = path.resolve(DEFAULT_BRAIN_ROOT);
  const resolvedTarget = path.resolve(resolvedRoot, entry.relativePath);
  if (!isPathInside(resolvedRoot, resolvedTarget, false)) {
    return { error: rpcError(-32602, "Resolved path escapes brain root boundary") };
  }

  try {
    const lst = fs.lstatSync(resolvedTarget);
    if (!lst.isFile() || lst.isSymbolicLink()) {
      return { error: rpcError(-32002, "Forbidden non-regular or symlink file") };
    }
    if (lst.size > MAX_RESOURCE_BYTES) {
      return { error: rpcError(-32603, "Resource exceeds maximum allowed size (512 KB)") };
    }
    const text = fs.readFileSync(resolvedTarget, "utf8");
    return {
      result: {
        contents: [
          {
            uri: entry.uri,
            mimeType: entry.mimeType,
            text,
          },
        ],
      },
    };
  } catch (err) {
    return { error: rpcError(-32002, `Failed to read resource: ${err?.message || err}`) };
  }
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

function auditPreflight({ projectPath }) {
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

  // 1. Check Segredos Hardcoded (25 pts)
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
      base.startsWith(".env.template")
    ) {
      continue;
    }
    const content = safeReadText(item.full);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (!line || line.length > MAX_LINE_LENGTH) continue;
      for (const rule of SECRET_RULES) {
        if (rule.regex.test(line)) {
          secretFindings.push(`${item.rel}:${idx + 1} [${rule.name}]`);
          break;
        }
      }
      if (secretFindings.length >= MAX_FINDINGS_PER_CHECK) break;
    }
    if (secretFindings.length >= MAX_FINDINGS_PER_CHECK) break;
  }
  const secretsOk = secretFindings.length === 0;

  // 2. Check Supabase RLS (20 pts)
  const sqlFiles = relFiles.filter((f) => f.ext === ".sql");
  const rlsFindings = [];
  let hasCreateTable = false;
  let hasEnableRls = false;
  let hasPostgresOrSupabaseSignal = relFiles.some((f) => f.rel.startsWith("supabase/"));

  for (const item of sqlFiles) {
    const content = safeReadText(item.full);
    if (!content) continue;
    if (/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(content)) {
      rlsFindings.push(`${item.rel}: DISABLE ROW LEVEL SECURITY detectado`);
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
    rlsFindings.push(
      "Tabelas SQL em schema Supabase/PostgreSQL sem 'ENABLE ROW LEVEL SECURITY'."
    );
  }
  const rlsOk = rlsFindings.length === 0;

  // 3. Check Versionamento YYYYMMDDNN / SemVer (20 pts)
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
      versionFindings.push(`${pub.rel}: campo 'version:' ausente`);
      continue;
    }
    const rawVer = m[1].trim();
    const vm = rawVer.match(/^(\d+\.\d+\.\d+)\+(\d+)$/);
    if (!vm) {
      versionFindings.push(`${pub.rel}: '${rawVer}' não segue 'X.Y.Z+YYYYMMDDNN'`);
      continue;
    }
    const buildStr = vm[2];
    const buildNum = Number(buildStr);
    if (buildStr.length !== 10 || !Number.isInteger(buildNum) || buildNum > 2147483647) {
      versionFindings.push(
        `${pub.rel}: build '${buildStr}' deve ter 10 dígitos YYYYMMDDNN <= 2147483647 (32-bit safe)`
      );
      continue;
    }
    validVersionManifests++;

    const webDir = path.dirname(pub.rel) === "." ? "web" : `${path.dirname(pub.rel)}/web`;
    const versionJsonItem = relFiles.find((f) => f.rel === `${webDir}/version.json`);
    if (versionJsonItem) {
      try {
        const vj = JSON.parse(safeReadText(versionJsonItem.full) || "{}");
        if (String(vj.version) !== vm[1] || String(vj.build) !== buildStr) {
          versionFindings.push(
            `${versionJsonItem.rel}: dessincronizado com ${pub.rel} (esperado ${vm[1]}+${buildStr})`
          );
        }
      } catch {
        versionFindings.push(`${versionJsonItem.rel}: JSON inválido`);
      }
    }
  }

  const pkgCandidates = relFiles.filter(
    (f) => f.rel === "package.json" || f.rel === "backend/package.json"
  );
  for (const pkg of pkgCandidates) {
    try {
      const parsed = JSON.parse(safeReadText(pkg.full) || "{}");
      if (parsed.version !== undefined) {
        if (!SEMVER_REGEX.test(String(parsed.version))) {
          versionFindings.push(`${pkg.rel}: version '${parsed.version}' não é SemVer válido`);
        } else {
          validVersionManifests++;
        }
      }
    } catch {
      versionFindings.push(`${pkg.rel}: JSON inválido`);
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
        versionFindings.push(`${pyproj.rel}: version '${m[1]}' não é SemVer válido`);
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
      versionFindings.push(`${versionFile.rel}: '${content?.trim()}' não é SemVer válido`);
    }
  }

  if (validVersionManifests === 0 && versionFindings.length === 0) {
    versionFindings.push(
      "Nenhum manifesto de versionamento válido encontrado (pubspec.yaml, package.json, pyproject.toml ou VERSION)."
    );
  }
  const versioningOk = versionFindings.length === 0 && validVersionManifests > 0;

  // 4. Check Async HTTP & Security Hygiene (20 pts)
  const hygieneFindings = [];
  for (const item of relFiles) {
    if (item.ext === ".py") {
      const content = safeReadText(item.full);
      if (!content) continue;
      if (
        /\basync\s+def\b/.test(content) &&
        /\brequests\.(get|post|put|delete|patch|request)\s*\(/.test(content)
      ) {
        hygieneFindings.push(
          `${item.rel}: uso de 'requests' síncrono em arquivo com rotas/funções 'async def' (use httpx.AsyncClient)`
        );
      }
    }
    if ([".py", ".ts", ".js", ".mjs"].includes(item.ext)) {
      const content = safeReadText(item.full);
      if (content && /\balg["']?\s*[:=]\s*["']none["']/i.test(content)) {
        hygieneFindings.push(`${item.rel}: referência suspeita a JWT 'alg: none'`);
      }
    }
    if (hygieneFindings.length >= MAX_FINDINGS_PER_CHECK) break;
  }
  const hygieneOk = hygieneFindings.length === 0;

  // 5. Check Governança ShapeLab (.shapelab + brain_sync.ps1) (15 pts)
  const govFindings = [];
  const hasSubmodule =
    fs.existsSync(path.join(resolvedProject, ".shapelab", "INDEX.md")) ||
    fs.existsSync(path.join(resolvedProject, "INDEX.md"));
  const hasSyncScript = fs.existsSync(
    path.join(resolvedProject, "scripts", "brain_sync.ps1")
  );
  if (!hasSubmodule) {
    govFindings.push("Submódulo .shapelab/INDEX.md ausente.");
  }
  if (!hasSyncScript) {
    govFindings.push("Script scripts/brain_sync.ps1 ausente.");
  }
  const govOk = govFindings.length === 0;

  const checks = [
    {
      id: "hardcoded_secrets",
      name: "Zero Segredos Hardcoded",
      status: secretsOk ? "OK" : "FAIL",
      weight: 25,
      score: secretsOk ? 25 : 0,
      findings: secretFindings,
    },
    {
      id: "supabase_rls",
      name: "Supabase / PostgreSQL RLS",
      status: rlsOk ? "OK" : "FAIL",
      weight: 20,
      score: rlsOk ? 20 : 0,
      findings: rlsFindings,
    },
    {
      id: "versioning_semver_yyyymmddnn",
      name: "Versionamento YYYYMMDDNN / SemVer",
      status: versioningOk ? "OK" : "FAIL",
      weight: 20,
      score: versioningOk ? 20 : 0,
      findings: versionFindings,
    },
    {
      id: "async_http_and_security_hygiene",
      name: "Higiene Async HTTP & JWT",
      status: hygieneOk ? "OK" : "FAIL",
      weight: 20,
      score: hygieneOk ? 20 : 0,
      findings: hygieneFindings,
    },
    {
      id: "shapelab_governance_sync",
      name: "Governança .shapelab & brain_sync.ps1",
      status: govOk ? "OK" : "FAIL",
      weight: 15,
      score: govOk ? 15 : 0,
      findings: govFindings,
    },
  ];

  const totalScore = checks.reduce((acc, c) => acc + c.score, 0);
  const okCount = checks.filter((c) => c.status === "OK").length;
  const failCount = checks.length - okCount;

  return {
    projectPath: resolvedProject,
    score: totalScore,
    maxScore: 100,
    passed: failCount === 0,
    summary: {
      filesScanned: relFiles.length,
      totalChecks: checks.length,
      okCount,
      failCount,
    },
    checks,
  };
}

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

async function runGit(args, cwd) {
  const gitBin = resolveGitBinary();
  const { stdout, stderr } = await execFileAsync(gitBin, args, {
    cwd,
    shell: false,
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_ALLOW_PROTOCOL: "https:ssh",
      LC_ALL: "C",
    },
  });
  return {
    stdout: String(stdout || "").trim(),
    stderr: String(stderr || "").trim(),
  };
}

async function syncSingleProduct({ product, workspaceBase, centralHead, centralSyncRaw }) {
  const prodPath = path.join(workspaceBase, product);
  const subPath = path.join(prodPath, ".shapelab");

  if (!fs.existsSync(prodPath)) {
    return {
      product,
      path: prodPath,
      status: "ERROR",
      error: `Diretório do produto não encontrado: ${prodPath}`,
    };
  }
  try {
    const lst = fs.lstatSync(prodPath);
    if (lst.isSymbolicLink()) {
      return {
        product,
        path: prodPath,
        status: "ERROR",
        error: "Diretório de produto é um symlink bloqueado.",
      };
    }
  } catch {
    return {
      product,
      path: prodPath,
      status: "ERROR",
      error: "Falha ao verificar atributos do diretório.",
    };
  }

  if (!fs.existsSync(subPath)) {
    return {
      product,
      path: prodPath,
      status: "ERROR",
      error: "Submódulo .shapelab ausente no produto.",
    };
  }

  try {
    await runGit(["-c", "protocol.ext.allow=never", "submodule", "sync", "--", ".shapelab"], prodPath);
    await runGit(
      [
        "-c",
        "protocol.ext.allow=never",
        "-c",
        "core.symlinks=false",
        "submodule",
        "update",
        "--remote",
        "--merge",
        "--",
        ".shapelab",
      ],
      prodPath
    );

    let subHead = (await runGit(["rev-parse", "HEAD"], subPath)).stdout;
    if (centralHead && subHead !== centralHead) {
      try {
        await runGit(["fetch", DEFAULT_BRAIN_ROOT, "HEAD"], subPath);
        await runGit(["checkout", centralHead], subPath);
        subHead = (await runGit(["rev-parse", "HEAD"], subPath)).stdout;
      } catch {
        // Mantém subHead
      }
    }

    const subVerPath = path.join(subPath, "VERSION");
    const subVersion = fs.existsSync(subVerPath)
      ? (await fsp.readFile(subVerPath, "utf8")).trim()
      : "unknown";

    const subSyncScript = path.join(subPath, "scripts", "brain_sync.ps1");
    const centralSyncScript = path.join(DEFAULT_BRAIN_ROOT, "scripts", "brain_sync.ps1");
    const destSyncDir = path.join(prodPath, "scripts");
    const destSyncScript = path.join(destSyncDir, "brain_sync.ps1");

    const sourceScript = fs.existsSync(subSyncScript)
      ? subSyncScript
      : fs.existsSync(centralSyncScript)
        ? centralSyncScript
        : null;

    if (sourceScript) {
      await fsp.mkdir(destSyncDir, { recursive: true });
      await fsp.copyFile(sourceScript, destSyncScript);
    }

    const destSyncRaw = fs.existsSync(destSyncScript)
      ? (await fsp.readFile(destSyncScript, "utf8")).replace(/\r\n/g, "\n")
      : "";
    const brainSyncScriptSynced =
      Boolean(centralSyncRaw) && destSyncRaw === centralSyncRaw;
    const inSyncWithCentralHead = Boolean(centralHead) && subHead === centralHead;

    const statusRes = await runGit(
      ["status", "--porcelain", "--", ".shapelab", "scripts/brain_sync.ps1"],
      prodPath
    );

    const isFullyOk = inSyncWithCentralHead && brainSyncScriptSynced;
    return {
      product,
      path: prodPath,
      status: isFullyOk ? "OK" : "WARN",
      inSyncWithCentralHead,
      centralHead: centralHead ? centralHead.slice(0, 7) : null,
      submoduleHead: subHead ? subHead.slice(0, 7) : null,
      submoduleVersion: subVersion,
      brainSyncScriptSynced,
      pendingPointerChanges: statusRes.stdout ? statusRes.stdout.split(/\r?\n/) : [],
    };
  } catch (err) {
    return {
      product,
      path: prodPath,
      status: "ERROR",
      error: (err?.stderr || err?.message || String(err)).replace(/\/\/[^@\s/]+@/g, "//***@"),
    };
  }
}

async function syncAllProducts({ workspaceBase, products } = {}) {
  if (syncInProgress) {
    return { error: "Operação brain_sync_all já em andamento." };
  }
  syncInProgress = true;

  try {
    const baseDir = workspaceBase
      ? path.resolve(workspaceBase)
      : path.dirname(DEFAULT_BRAIN_ROOT);
    const targetProducts =
      Array.isArray(products) && products.length > 0
        ? products.filter((p) => typeof p === "string" && ALLOWED_PRODUCTS.has(p))
        : DEFAULT_PRODUCTS;

    let centralHead = null;
    try {
      centralHead = (await runGit(["rev-parse", "HEAD"], DEFAULT_BRAIN_ROOT)).stdout;
    } catch {
      centralHead = null;
    }

    const centralVersionPath = path.join(DEFAULT_BRAIN_ROOT, "VERSION");
    const centralVersion = fs.existsSync(centralVersionPath)
      ? fs.readFileSync(centralVersionPath, "utf8").trim()
      : "unknown";

    const centralSyncPath = path.join(DEFAULT_BRAIN_ROOT, "scripts", "brain_sync.ps1");
    const centralSyncRaw = fs.existsSync(centralSyncPath)
      ? fs.readFileSync(centralSyncPath, "utf8").replace(/\r\n/g, "\n")
      : "";

    const results = await Promise.all(
      targetProducts.map((product) =>
        syncSingleProduct({
          product,
          workspaceBase: baseDir,
          centralHead,
          centralSyncRaw,
        })
      )
    );

    const okCount = results.filter((r) => r.status === "OK").length;
    const warnCount = results.filter((r) => r.status === "WARN").length;
    const errorCount = results.filter((r) => r.status === "ERROR").length;

    return {
      centralBrainRoot: DEFAULT_BRAIN_ROOT,
      centralVersion,
      centralHead: centralHead ? centralHead.slice(0, 7) : null,
      workspaceBase: baseDir,
      summary: {
        total: results.length,
        okCount,
        warnCount,
        errorCount,
      },
      products: results,
    };
  } finally {
    syncInProgress = false;
  }
}

const TOOLS = [
  {
    name: "brain_query",
    description:
      "Busca ranqueada no shapelab-brain (.shapelab) por skills, agentes, ADRs, constituição e lições aprendidas, retornando apenas os trechos relevantes para economizar tokens.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Termos de busca (ex: 'asaas split jws', 'pbkdf2 guard', 'versioning ota')",
        },
        workspacePath: {
          type: "string",
          description:
            "Caminho opcional do repositório produto para priorizar .shapelab local",
        },
        maxResults: {
          type: "number",
          description: "Máximo de arquivos retornados (padrão 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "brain_vaccine_status",
    description:
      "Consulta a matriz PRODUCT_MATRIX.md do shapelab-brain e lista quais skills/vacinas estão aplicadas, parciais ou pendentes por produto.",
    inputSchema: {
      type: "object",
      properties: {
        product: {
          type: "string",
          description:
            "Opcional: B2B-personal-ia, ReformAI, Smart-EV-Hub ou tattoo-saas",
        },
        workspacePath: {
          type: "string",
          description: "Caminho opcional do repositório produto",
        },
      },
    },
  },
  {
    name: "brain_propose_lesson",
    description:
      "Avalia um aprendizado pela Rubrica 0-10 do BRAIN_EVOLUTION_PROTOCOL.md e gera a linha formatada para LESSONS_LEARNED.md quando elegível (score >= 7).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        origin: { type: "string" },
        category: { type: "string" },
        rootCause: { type: "string" },
        solution: { type: "string" },
        scoreMultiProduct: { type: "number", description: "0 a 4" },
        scoreRiskCost: { type: "number", description: "0 a 3" },
        scoreAgnostic: { type: "number", description: "0 a 3" },
      },
      required: ["title", "origin", "category", "rootCause", "solution"],
    },
  },
  {
    name: "brain_audit_preflight",
    description:
      "Audita um repositório produto (ignorando node_modules, .git, build, .venv) verificando RLS, segredos hardcoded, versionamento YYYYMMDDNN/SemVer, higiene async HTTP e governança .shapelab, retornando score 0-100 com checks OK/FAIL.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Caminho absoluto do repositório produto a auditar",
        },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "brain_sync_all",
    description:
      "Executa sincronização paralela nos produtos (B2B-personal-ia, ReformAI, Smart-EV-Hub), atualizando o submódulo .shapelab para o HEAD central e sincronizando scripts/brain_sync.ps1.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceBase: {
          type: "string",
          description:
            "Diretório pai opcional contendo os repositórios dos produtos",
        },
        products: {
          type: "array",
          items: { type: "string" },
          description:
            "Lista opcional de produtos (padrão: B2B-personal-ia, ReformAI, Smart-EV-Hub)",
        },
      },
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    return;
  }
  const { id, method, params } = req;

  if (method === "notifications/initialized") return;

  try {
    if (method === "initialize") {
      return send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2024-11-05",
          capabilities: {
            tools: {},
            resources: { subscribe: false, listChanged: false },
          },
          serverInfo: { name: "shapelab-brain-mcp", version: "2.0.0" },
        },
      });
    }

    if (method === "ping") {
      return send({ jsonrpc: "2.0", id, result: {} });
    }

    if (method === "resources/list") {
      return send({
        jsonrpc: "2.0",
        id,
        result: { resources: listBrainResources() },
      });
    }

    if (method === "resources/templates/list") {
      return send({
        jsonrpc: "2.0",
        id,
        result: { resourceTemplates: [] },
      });
    }

    if (method === "resources/read") {
      const outcome = readBrainResource(params?.uri);
      if (outcome.error) {
        return send({ jsonrpc: "2.0", id, error: outcome.error });
      }
      return send({ jsonrpc: "2.0", id, result: outcome.result });
    }

    if (method === "tools/list") {
      return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    }

    if (method === "tools/call") {
      const name = params?.name;
      const rawArgs = params?.arguments;
      const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {};
      let payload;

      if (name === "brain_query") payload = queryBrain(args);
      else if (name === "brain_vaccine_status") payload = vaccineStatus(args);
      else if (name === "brain_propose_lesson") payload = proposeLesson(args);
      else if (name === "brain_audit_preflight") payload = auditPreflight(args);
      else if (name === "brain_sync_all") payload = await syncAllProducts(args);
      else {
        return send({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        });
      }

      return send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          ...(payload?.error ? { isError: true } : {}),
        },
      });
    }

    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    }
  } catch (err) {
    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: err?.message || "Internal server error",
        },
      });
    }
  }
});
