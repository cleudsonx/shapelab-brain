import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { auditPreflight, AUDIT_IGNORED_DIRS } from "./ci_preflight_check.mjs";
import { validateJws, FINTECH_VALIDATE_JWS_TOOL } from "./tools/fintech_jws.mjs";
import { validateOtaManifest, OTA_VALIDATE_MANIFEST_TOOL } from "./tools/ota_manifest.mjs";
import { checkFlutterCompat, FLUTTER_COMPAT_CHECK_TOOL } from "./tools/flutter_compat.mjs";
import { semanticSearch, BRAIN_SEMANTIC_SEARCH_TOOL } from "./tools/semantic_search.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_BRAIN_ROOT =
  process.env.SHAPELAB_BRAIN_ROOT ||
  "c:\\Users\\Cleudson\\OneDrive\\Documentos\\PROJETOS 2026\\shapelab-brain";

const ALLOWED_PRODUCTS = new Set(["B2B-personal-ia", "ReformAI", "Smart-EV-Hub"]);
const DEFAULT_PRODUCTS = ["B2B-personal-ia", "ReformAI", "Smart-EV-Hub"];

const COCKPIT_RESOURCE_URI = "ui://cockpit/app.html";
const COCKPIT_RESOURCE_META = {
  ui: {
    prefersBorder: false,
  },
};
const COCKPIT_CACHE_TTL_MS = 15_000;
const cockpitCache = new Map();

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

let syncInProgress = false;

function rpcError(code, message) {
  return { code, message };
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
  const items = Array.from(RESOURCE_REGISTRY.values()).map(
    ({ uri, name, description, mimeType }) => ({
      uri,
      name,
      description,
      mimeType,
    })
  );
  items.push({
    uri: COCKPIT_RESOURCE_URI,
    name: "ShapeLab Founder Cockpit",
    description: "Painel interativo do Fundador (MCP App) com status dos produtos, preflight audit e matriz de vacinas.",
    mimeType: "text/html",
    _meta: COCKPIT_RESOURCE_META,
  });
  return items;
}

function validateBrainUri(uri) {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 256) return null;
  if (uri.includes("%") || uri.includes("\0") || uri.includes("\\")) return null;
  const m = STRICT_BRAIN_URI_RE.exec(uri);
  if (!m) return null;
  return uri;
}

function readBrainResource(rawUri) {
  if (rawUri === COCKPIT_RESOURCE_URI) {
    try {
      const html = buildCockpitHtml();
      return {
        result: {
          contents: [
            {
              uri: COCKPIT_RESOURCE_URI,
              mimeType: "text/html",
              text: html,
              _meta: COCKPIT_RESOURCE_META,
            },
          ],
        },
      };
    } catch (err) {
      return { error: rpcError(-32002, `Failed to load cockpit: ${err?.message || err}`) };
    }
  }

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

function countMarkdownUnder(dirPath) {
  let count = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const stack = [dirPath];
  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!AUDIT_IGNORED_DIRS.has(entry.name)) {
          stack.push(path.join(cur, entry.name));
        }
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        count++;
      }
    }
  }
  return count;
}

function resolveDefaultProjectPath(product) {
  const baseDir = path.dirname(DEFAULT_BRAIN_ROOT);
  return path.join(baseDir, product);
}

async function inspectSingleProduct({ product, workspaceBase, centralHead, centralVersion }) {
  const baseDir = workspaceBase
    ? path.resolve(workspaceBase)
    : path.dirname(DEFAULT_BRAIN_ROOT);
  const prodPath = path.join(baseDir, product);
  const exists = fs.existsSync(prodPath);

  if (!exists) {
    return {
      id: product,
      displayName: product,
      path: prodPath,
      exists: false,
      status: "MISSING",
      appVersion: "unknown",
      shapelabVersion: "missing",
      submoduleHead: "none",
      inSyncWithCentralHead: false,
      auditScore: 0,
      checks: [],
    };
  }

  let appVersion = "unknown";
  try {
    const candidateFiles = [
      path.join(prodPath, "mobile", "pubspec.yaml"),
      path.join(prodPath, "pubspec.yaml"),
      path.join(prodPath, "frontend", "pubspec.yaml"),
      path.join(prodPath, "backend", "pyproject.toml"),
      path.join(prodPath, "pyproject.toml"),
      path.join(prodPath, "package.json"),
      path.join(prodPath, "frontend", "package.json"),
      path.join(prodPath, "web", "package.json"),
    ];

    for (const f of candidateFiles) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, "utf8");
      if (f.endsWith("pubspec.yaml")) {
        const m = content.match(/^version:\s*([^\s+]+)/m);
        if (m) {
          appVersion = m[1];
          break;
        }
      } else if (f.endsWith("pyproject.toml")) {
        const m = content.match(/^version\s*=\s*["']([^"']+)["']/m);
        if (m) {
          appVersion = m[1];
          break;
        }
      } else if (f.endsWith("package.json")) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.version) {
            appVersion = parsed.version;
            break;
          }
        } catch {
          // continue
        }
      }
    }
  } catch {
    // keep unknown
  }

  const subVerPath = path.join(prodPath, ".shapelab", "VERSION");
  const shapelabVersion = fs.existsSync(subVerPath)
    ? fs.readFileSync(subVerPath, "utf8").trim()
    : "missing";

  let submoduleHead = "unknown";
  try {
    const subGitPath = path.join(prodPath, ".shapelab");
    if (fs.existsSync(path.join(subGitPath, ".git")) || fs.existsSync(path.join(prodPath, ".gitmodules"))) {
      const res = await runGit(["rev-parse", "HEAD"], subGitPath);
      submoduleHead = res.stdout ? res.stdout.slice(0, 7) : "unknown";
    }
  } catch {
    submoduleHead = "unknown";
  }

  const inSyncWithCentralHead =
    Boolean(centralHead) &&
    submoduleHead !== "unknown" &&
    centralHead.startsWith(submoduleHead);

  const status = shapelabVersion === centralVersion ? "OK" : "OUT_OF_SYNC";

  let auditScore = 0;
  let checks = [];
  try {
    const auditRes = auditPreflight({ projectPath: prodPath });
    if (!auditRes.error) {
      auditScore = auditRes.score ?? 0;
      checks = auditRes.checks ?? [];
    }
  } catch {
    // audit fallback
  }

  return {
    id: product,
    displayName: product,
    path: prodPath,
    exists: true,
    status,
    appVersion,
    shapelabVersion,
    submoduleHead,
    inSyncWithCentralHead,
    auditScore,
    checks,
  };
}

async function getCockpitData(workspaceBase) {
  const cacheKey = workspaceBase || "default";
  const cached = cockpitCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < COCKPIT_CACHE_TTL_MS) {
    return cached.data;
  }

  let centralHead = null;
  try {
    const res = await runGit(["rev-parse", "HEAD"], DEFAULT_BRAIN_ROOT);
    centralHead = res.stdout ? res.stdout.slice(0, 7) : null;
  } catch {
    centralHead = null;
  }

  const centralVersionPath = path.join(DEFAULT_BRAIN_ROOT, "VERSION");
  const centralVersion = fs.existsSync(centralVersionPath)
    ? fs.readFileSync(centralVersionPath, "utf8").trim()
    : "unknown";

  const totalSkills = countMarkdownUnder(path.join(DEFAULT_BRAIN_ROOT, "skills"));
  const vaccines = vaccineStatus({});

  const products = await Promise.all(
    DEFAULT_PRODUCTS.map((product) =>
      inspectSingleProduct({
        product,
        workspaceBase,
        centralHead,
        centralVersion,
      })
    )
  );

  const data = {
    brain: {
      root: DEFAULT_BRAIN_ROOT,
      version: centralVersion,
      head: centralHead,
      totalSkills,
    },
    centralVersion,
    centralHead,
    totalSkills,
    products,
    vaccines: vaccines.matrix || [],
    generatedAt: new Date().toISOString(),
  };

  cockpitCache.set(cacheKey, { timestamp: now, data });
  return data;
}

function buildCockpitHtml(injectedData = null) {
  let template = "";
  const candidatePaths = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), "cockpit_app.html"),
    path.join(DEFAULT_BRAIN_ROOT, "scripts", "cockpit_app.html"),
    "C:\\Users\\Cleudson\\.gemini\\antigravity\\brain\\6de40630-d886-4f90-996a-c7ddd129afa1\\shapelab_founder_cockpit.html",
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        template = fs.readFileSync(p, "utf8");
        if (template && template.length > 500) break;
      } catch {
        // continue
      }
    }
  }

  if (!template) {
    throw new Error("cockpit_app.html template not found");
  }

  if (injectedData) {
    const injectionScript = `<script>window.__SHAPELAB_COCKPIT_DATA__ = ${JSON.stringify(
      injectedData
    )};</script>`;
    if (template.includes("</head>")) {
      return template.replace("</head>", `${injectionScript}\n</head>`);
    }
    return `${injectionScript}\n${template}`;
  }

  return template;
}

const TOOLS = [
  {
    name: "brain_cockpit",
    description:
      "Abre o Cockpit Visual do Fundador da ShapeLab (MCP App no Side Pane) exibindo métricas de saúde, auditoria de segurança (preflight), sincronia de submódulos e matriz de vacinas dos produtos em tempo real.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceBase: {
          type: "string",
          description:
            "Diretório pai opcional contendo os repositórios dos produtos",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: COCKPIT_RESOURCE_URI,
      },
      "com.google.antigravity/ui": {
        entrypoints: [
          {
            type: "aux_pane",
            title: "ShapeLab Cockpit",
          },
        ],
      },
    },
  },
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
  FINTECH_VALIDATE_JWS_TOOL,
  OTA_VALIDATE_MANIFEST_TOOL,
  FLUTTER_COMPAT_CHECK_TOOL,
  BRAIN_SEMANTIC_SEARCH_TOOL,
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

      if (name === "brain_cockpit") {
        const cockpit = await getCockpitData(args?.workspaceBase);
        const summaryText =
          `ShapeLab Founder Cockpit v${cockpit.centralVersion} (${cockpit.centralHead || "unknown"})\n` +
          `Produtos monitorados: ${cockpit.products.length} | Skills ativas: ${cockpit.totalSkills}\n` +
          cockpit.products
            .map(
              (p) =>
                ` - ${p.id}: App v${p.appVersion} | Submodule v${p.shapelabVersion} [${p.status}] | Preflight: ${p.auditScore}/100`
            )
            .join("\n");

        return send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: summaryText }],
            structuredContent: cockpit,
            _meta: {
              ui: {
                resourceUri: COCKPIT_RESOURCE_URI,
              },
            },
          },
        });
      }

      let payload;

      if (name === "brain_query") payload = queryBrain(args);
      else if (name === "brain_vaccine_status") payload = vaccineStatus(args);
      else if (name === "brain_propose_lesson") payload = proposeLesson(args);
      else if (name === "brain_audit_preflight") payload = auditPreflight(args);
      else if (name === "brain_sync_all") payload = await syncAllProducts(args);
      else if (name === "fintech_validate_jws") payload = validateJws(args);
      else if (name === "ota_validate_manifest") payload = validateOtaManifest(args);
      else if (name === "flutter_compat_check") payload = checkFlutterCompat(args);
      else if (name === "brain_semantic_search") payload = semanticSearch(args);
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
