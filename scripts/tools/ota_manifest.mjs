/**
 * ShapeLab OTA & PWA Manifest Validation Tool
 * Pure ESM, zero external dependencies.
 */

import fs from "node:fs";
import path from "node:path";

export const OTA_VALIDATE_MANIFEST_TOOL = {
  name: "ota_validate_manifest",
  description:
    "Valida a conformidade completa de versionamento OTA PWA e cache-busting de um repositório produto: integridade de version.json, sincronia com pubspec.yaml (X.Y.Z+YYYYMMDDNN), regra monotônica 32-bit safe (10 dígitos <= 2147483647), headers anti-cache (firebase.json, render.yaml, Cloudflare _headers) para version.json/index.html e cache-busting de assets estáticos.",
  inputSchema: {
    type: "object",
    properties: {
      projectPath: {
        type: "string",
        description:
          "Caminho absoluto do repositório produto a validar (ex: C:\\...\\B2B-personal-ia)",
      },
      manifestRelPath: {
        type: "string",
        description:
          "Caminho relativo opcional para o manifesto OTA (padrão: 'web/version.json' ou auto-detecção entre web/, mobile/web/, frontend/web/, raiz)",
      },
    },
    required: ["projectPath"],
  },
};

const MAX_OTA_FILE_BYTES = 256 * 1024; // 256 KB
const MAX_INT32_BUILD = 2147483647;
const OTA_SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PUBSPEC_VERSION_RE =
  /^version\s*:\s*["']?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\+([0-9A-Za-z.-]+)["']?/m;

function isPathInside(baseRealPath, targetRealPath, allowSame = false) {
  const b = process.platform === "win32" ? baseRealPath.toLowerCase() : baseRealPath;
  const t = process.platform === "win32" ? targetRealPath.toLowerCase() : targetRealPath;
  if (b === t) return allowSame;
  const rel = path.relative(b, t);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function otaSafeReadRegularFile(baseRealDir, targetPath, maxBytes = MAX_OTA_FILE_BYTES) {
  const resolved = path.resolve(targetPath);
  if (!isPathInside(baseRealDir, resolved, false)) {
    return { error: `Caminho fora dos limites do repositório: ${targetPath}` };
  }
  try {
    const lst = fs.lstatSync(resolved);
    if (lst.isSymbolicLink() || !lst.isFile()) {
      return { error: `Arquivo inválido ou symlink bloqueado: ${targetPath}` };
    }
    if (lst.size > maxBytes) {
      return { error: `Arquivo excede limite de ${maxBytes} bytes: ${targetPath}` };
    }
    const realTarget = fs.realpathSync(resolved);
    if (!isPathInside(baseRealDir, realTarget, false)) {
      return { error: `Realpath escapa dos limites do repositório: ${targetPath}` };
    }
    return { path: resolved, content: fs.readFileSync(resolved, "utf8") };
  } catch (err) {
    return { error: `Falha ao ler ${targetPath}: ${err?.message || err}` };
  }
}

function isValidYYYYMMDDNN(buildStr) {
  if (typeof buildStr !== "string" || !/^\d{10}$/.test(buildStr)) {
    return { ok: false, reason: "deve conter exatamente 10 dígitos numéricos (YYYYMMDDNN)" };
  }
  const num = Number(buildStr);
  if (!Number.isSafeInteger(num) || num <= 0 || num > MAX_INT32_BUILD) {
    return {
      ok: false,
      reason: `valor ${buildStr} excede o limite assinado de 32 bits (${MAX_INT32_BUILD})`,
    };
  }
  const year = Number(buildStr.slice(0, 4));
  const month = Number(buildStr.slice(4, 6));
  const day = Number(buildStr.slice(6, 8));
  if (year < 2020 || year > 2147 || month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, reason: `prefixo de data inválido em '${buildStr}'` };
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return { ok: false, reason: `data inexistente no calendário em '${buildStr}'` };
  }
  return { ok: true };
}

function hasAntiCacheDirectives(headerValue) {
  if (typeof headerValue !== "string") return false;
  const tokens = new Set(
    headerValue
      .toLowerCase()
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
  );
  return (
    tokens.has("no-cache") &&
    tokens.has("no-store") &&
    tokens.has("must-revalidate")
  );
}

function globMatchesTarget(rawPattern, targetFile) {
  if (typeof rawPattern !== "string" || !rawPattern.trim()) return false;
  const pattern = rawPattern.trim().replace(/^\/+/, "");
  const target = targetFile.replace(/^\/+/, "");

  let regexStr = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        regexStr += "(?:.*/)?";
        i += 2;
      } else {
        regexStr += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      regexStr += "[^/]*";
    } else if (ch === "?") {
      regexStr += "[^/]";
    } else if (ch === "@" && pattern[i + 1] === "(") {
      const close = pattern.indexOf(")", i + 2);
      if (close !== -1) {
        const alts = pattern
          .slice(i + 2, close)
          .split("|")
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        regexStr += `(?:${alts.join("|")})`;
        i = close;
      } else {
        regexStr += "@";
      }
    } else if (ch === "{") {
      const close = pattern.indexOf("}", i + 1);
      if (close !== -1) {
        const alts = pattern
          .slice(i + 1, close)
          .split(",")
          .map((s) => s.trim().replace(/^\/+/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        regexStr += `(?:${alts.join("|")})`;
        i = close;
      } else {
        regexStr += "\\{";
      }
    } else {
      regexStr += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  regexStr += "$";
  try {
    return new RegExp(regexStr, "i").test(target);
  } catch {
    return false;
  }
}

function stripYamlValue(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseRenderYamlHeaderRules(content) {
  const lines = content.split(/\r?\n/);
  const rules = [];
  let inHeaders = false;
  let headersIndent = -1;
  let current = null;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const indent = rawLine.match(/^(\s*)/)[1].length;
    const trimmed = rawLine.trim();

    if (!inHeaders) {
      if (/^(?:-\s*)?headers\s*:\s*(?:#.*)?$/.test(trimmed)) {
        inHeaders = true;
        headersIndent = indent;
        current = null;
      }
      continue;
    }

    if (indent < headersIndent || (indent === headersIndent && !trimmed.startsWith("-"))) {
      if (current) {
        rules.push(current);
        current = null;
      }
      inHeaders = false;
      if (/^(?:-\s*)?headers\s*:\s*(?:#.*)?$/.test(trimmed)) {
        inHeaders = true;
        headersIndent = indent;
      }
      continue;
    }

    if (trimmed.startsWith("-")) {
      if (current) rules.push(current);
      current = { path: "", name: "", value: "" };
      const afterDash = trimmed.slice(1).trim();
      const kv = afterDash.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (kv) current[kv[1].toLowerCase()] = stripYamlValue(kv[2]);
    } else if (current) {
      const kv = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (kv) current[kv[1].toLowerCase()] = stripYamlValue(kv[2]);
    }
  }
  if (current) rules.push(current);
  return rules;
}

function parseCloudflareHeadersRules(content) {
  const lines = content.split(/\r?\n/);
  const rules = [];
  let currentPath = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^\s/.test(rawLine) && currentPath) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        rules.push({
          path: currentPath,
          key: trimmed.slice(0, colonIdx).trim(),
          value: trimmed.slice(colonIdx + 1).trim(),
        });
      }
    } else {
      currentPath = trimmed;
    }
  }
  return rules;
}

/**
 * Valida o manifesto OTA PWA (version.json), sincronia com pubspec.yaml,
 * regra 32-bit safe (YYYYMMDDNN <= 2147483647), headers anti-cache e cache-busting de assets.
 */
export function validateOtaManifest(args = {}) {
  const projectPath = args?.projectPath;
  const manifestRelPath = args?.manifestRelPath;

  const failFast = (message) => ({
    valid: false,
    appVersion: "",
    buildNumber: "",
    isMonotonic32BitSafe: false,
    inSyncWithPubspec: false,
    cacheHeadersCompliant: false,
    issues: [message],
    summary: `Falha na validação OTA: ${message}`,
    error: message,
  });

  if (!projectPath || typeof projectPath !== "string") {
    return failFast("Parâmetro 'projectPath' é obrigatório.");
  }
  if (/[\x00-\x1f]/.test(projectPath) || /^[\\/]{2}/.test(projectPath)) {
    return failFast("Caminho 'projectPath' inválido ou com caracteres de controle.");
  }

  const resolvedProject = path.resolve(projectPath);
  if (!fs.existsSync(resolvedProject)) {
    return failFast(`Diretório do projeto não existe: ${resolvedProject}`);
  }
  let projectRealDir;
  try {
    const lst = fs.lstatSync(resolvedProject);
    if (!lst.isDirectory() || lst.isSymbolicLink()) {
      return failFast(`'projectPath' deve ser diretório real (não symlink): ${resolvedProject}`);
    }
    projectRealDir = fs.realpathSync(resolvedProject);
  } catch (err) {
    return failFast(`Erro ao inspecionar 'projectPath': ${err?.message || err}`);
  }

  const issues = [];

  let manifestFull = null;
  let manifestRel = null;

  if (manifestRelPath !== undefined && manifestRelPath !== null && String(manifestRelPath).trim() !== "") {
    if (typeof manifestRelPath !== "string" || /[\x00-\x1f]/.test(manifestRelPath)) {
      return failFast("Parâmetro 'manifestRelPath' inválido.");
    }
    const cleanRel = manifestRelPath.trim().replace(/\\/g, "/");
    const candidate = path.resolve(projectRealDir, cleanRel);
    if (!isPathInside(projectRealDir, candidate, false)) {
      return failFast(`'manifestRelPath' escapa do diretório do projeto: ${manifestRelPath}`);
    }
    if (!fs.existsSync(candidate)) {
      issues.push(`Manifesto OTA não encontrado em '${cleanRel}'.`);
    } else {
      manifestFull = candidate;
      manifestRel = cleanRel;
    }
  } else {
    const candidates = [
      "web/version.json",
      "mobile/web/version.json",
      "frontend/web/version.json",
      "app/web/version.json",
      "version.json",
      "public/version.json",
      "build/web/version.json",
    ];
    for (const rel of candidates) {
      const full = path.resolve(projectRealDir, rel);
      if (fs.existsSync(full)) {
        try {
          const lst = fs.lstatSync(full);
          if (lst.isFile() && !lst.isSymbolicLink()) {
            manifestFull = full;
            manifestRel = rel;
            break;
          }
        } catch {
          // continua
        }
      }
    }
    if (!manifestFull) {
      issues.push(
        "Manifesto OTA 'web/version.json' (ou 'version.json') não encontrado no repositório."
      );
    }
  }

  let appVersion = "";
  let buildNumber = "";
  let manifestValid = false;

  if (manifestFull) {
    const readRes = otaSafeReadRegularFile(projectRealDir, manifestFull);
    if (readRes.error) {
      issues.push(readRes.error);
    } else {
      try {
        const parsed = JSON.parse(readRes.content);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          issues.push(`'${manifestRel}' deve conter um objeto JSON válido.`);
        } else {
          appVersion = parsed.version !== undefined ? String(parsed.version).trim() : "";
          const hasBuildField = parsed.build !== undefined && parsed.build !== null;
          buildNumber = hasBuildField
            ? String(parsed.build).trim()
            : parsed.buildNumber !== undefined
              ? String(parsed.buildNumber).trim()
              : "";

          if (!appVersion) {
            issues.push(`Campo obrigatório 'version' ausente ou vazio em '${manifestRel}'.`);
          } else if (!OTA_SEMVER_RE.test(appVersion)) {
            issues.push(`Campo 'version' ('${appVersion}') em '${manifestRel}' não segue SemVer X.Y.Z.`);
          }

          if (!hasBuildField) {
            issues.push(
              buildNumber
                ? `Campo 'build' ausente em '${manifestRel}' (encontrado 'buildNumber'; padrão ShapeLab exige chave 'build').`
                : `Campo obrigatório 'build' ausente ou vazio em '${manifestRel}'.`
            );
          }

          if (parsed.updated_at !== undefined && Number.isNaN(Date.parse(String(parsed.updated_at)))) {
            issues.push(`Campo 'updated_at' inválido em '${manifestRel}' (esperado ISO-8601).`);
          }

          manifestValid = Boolean(appVersion && OTA_SEMVER_RE.test(appVersion) && hasBuildField && buildNumber);
        }
      } catch {
        issues.push(`JSON inválido ou corrompido em '${manifestRel}'.`);
      }
    }
  }

  let isMonotonic32BitSafe = false;
  if (buildNumber) {
    const check32 = isValidYYYYMMDDNN(buildNumber);
    if (!check32.ok) {
      issues.push(`Build '${buildNumber}' em '${manifestRel}' viola regra 32-bit safe: ${check32.reason}.`);
    } else {
      isMonotonic32BitSafe = true;
    }
  }

  let inSyncWithPubspec = false;
  const pubspecCandidates = [];
  if (manifestRel) {
    const dirParts = path.posix.dirname(manifestRel).split("/").filter((p) => p && p !== ".");
    if (dirParts.length >= 2 && dirParts[dirParts.length - 1] === "web") {
      pubspecCandidates.push(`${dirParts.slice(0, -1).join("/")}/pubspec.yaml`);
    }
  }
  for (const fallbackPub of [
    "pubspec.yaml",
    "mobile/pubspec.yaml",
    "frontend/pubspec.yaml",
    "app/pubspec.yaml",
  ]) {
    if (!pubspecCandidates.includes(fallbackPub)) pubspecCandidates.push(fallbackPub);
  }

  let pubspecRel = null;
  let pubspecFull = null;
  for (const rel of pubspecCandidates) {
    const full = path.resolve(projectRealDir, rel);
    if (fs.existsSync(full)) {
      pubspecRel = rel;
      pubspecFull = full;
      break;
    }
  }

  if (!pubspecFull) {
    issues.push("Arquivo 'pubspec.yaml' não encontrado para validar sincronia X.Y.Z+YYYYMMDDNN.");
  } else {
    const pubRead = otaSafeReadRegularFile(projectRealDir, pubspecFull);
    if (pubRead.error) {
      issues.push(pubRead.error);
    } else {
      const m = pubRead.content.match(PUBSPEC_VERSION_RE);
      if (!m) {
        issues.push(
          `Versão em '${pubspecRel}' ausente ou fora do formato obrigatório 'X.Y.Z+YYYYMMDDNN'.`
        );
      } else {
        const pubVer = m[1].trim();
        const pubBuild = m[2].trim();
        const pubCheck32 = isValidYYYYMMDDNN(pubBuild);
        if (!pubCheck32.ok) {
          issues.push(`Build '${pubBuild}' em '${pubspecRel}' viola regra 32-bit safe: ${pubCheck32.reason}.`);
          isMonotonic32BitSafe = false;
        }
        if (manifestValid) {
          if (pubVer !== appVersion || pubBuild !== buildNumber) {
            issues.push(
              `Dessincronia entre '${pubspecRel}' (${pubVer}+${pubBuild}) e '${manifestRel}' (${appVersion}+${buildNumber}).`
            );
          } else {
            inSyncWithPubspec = true;
          }
        }
      }
    }
  }

  const requiredTargets = ["version.json", "index.html"];
  const coveredTargets = new Set();
  const antiCacheProvidersChecked = [];

  const firebaseCandidates = ["firebase.json", "mobile/firebase.json", "frontend/firebase.json"];
  for (const rel of firebaseCandidates) {
    const full = path.resolve(projectRealDir, rel);
    if (!fs.existsSync(full)) continue;
    const readRes = otaSafeReadRegularFile(projectRealDir, full);
    if (readRes.error) {
      issues.push(readRes.error);
      continue;
    }
    antiCacheProvidersChecked.push(rel);
    try {
      const fb = JSON.parse(readRes.content);
      const hostings = Array.isArray(fb?.hosting) ? fb.hosting : fb?.hosting ? [fb.hosting] : [];
      for (const h of hostings) {
        const headerBlocks = Array.isArray(h?.headers) ? h.headers : [];
        for (const block of headerBlocks) {
          const source = String(block?.source || "");
          const hdrs = Array.isArray(block?.headers) ? block.headers : [];
          const cc = hdrs.find((x) => String(x?.key || "").toLowerCase() === "cache-control");
          if (!cc || !hasAntiCacheDirectives(String(cc.value || ""))) continue;
          for (const target of requiredTargets) {
            if (globMatchesTarget(source, target)) coveredTargets.add(target);
          }
        }
      }
    } catch {
      issues.push(`JSON inválido em '${rel}' ao inspecionar headers anti-cache.`);
    }
  }

  for (const rel of ["render.yaml", "render.yml"]) {
    const full = path.resolve(projectRealDir, rel);
    if (!fs.existsSync(full)) continue;
    const readRes = otaSafeReadRegularFile(projectRealDir, full);
    if (readRes.error) {
      issues.push(readRes.error);
      continue;
    }
    antiCacheProvidersChecked.push(rel);
    const rules = parseRenderYamlHeaderRules(readRes.content);
    for (const rule of rules) {
      if (String(rule.name || "").toLowerCase() !== "cache-control") continue;
      if (!hasAntiCacheDirectives(rule.value)) continue;
      for (const target of requiredTargets) {
        if (globMatchesTarget(rule.path, target)) coveredTargets.add(target);
      }
    }
  }

  for (const rel of ["_headers", "web/_headers", "public/_headers", "mobile/web/_headers", "frontend/web/_headers"]) {
    const full = path.resolve(projectRealDir, rel);
    if (!fs.existsSync(full)) continue;
    const readRes = otaSafeReadRegularFile(projectRealDir, full);
    if (readRes.error) {
      issues.push(readRes.error);
      continue;
    }
    antiCacheProvidersChecked.push(rel);
    const rules = parseCloudflareHeadersRules(readRes.content);
    for (const rule of rules) {
      if (String(rule.key || "").toLowerCase() !== "cache-control") continue;
      if (!hasAntiCacheDirectives(rule.value)) continue;
      for (const target of requiredTargets) {
        if (globMatchesTarget(rule.path, target)) coveredTargets.add(target);
      }
    }
  }

  let cacheHeadersCompliant = false;
  if (antiCacheProvidersChecked.length === 0) {
    issues.push(
      "Nenhuma configuração de headers HTTP anti-cache encontrada ('firebase.json', 'render.yaml' ou Cloudflare '_headers')."
    );
  } else {
    const missingTargets = requiredTargets.filter((t) => !coveredTargets.has(t));
    if (missingTargets.length > 0) {
      issues.push(
        `Headers 'Cache-Control: no-cache, no-store, must-revalidate' ausentes ou incompletos para: ${missingTargets.join(", ")} (inspecionado: ${antiCacheProvidersChecked.join(", ")}).`
      );
    } else {
      cacheHeadersCompliant = true;
    }
  }

  const webDirRel = manifestRel ? path.posix.dirname(manifestRel) : "web";
  const indexCandidates = [
    webDirRel === "." ? "index.html" : `${webDirRel}/index.html`,
    "web/index.html",
    "mobile/web/index.html",
    "frontend/web/index.html",
    "index.html",
  ];
  let indexRel = null;
  let indexFull = null;
  for (const rel of [...new Set(indexCandidates)]) {
    const full = path.resolve(projectRealDir, rel);
    if (fs.existsSync(full)) {
      indexRel = rel;
      indexFull = full;
      break;
    }
  }

  if (!indexFull) {
    issues.push("Arquivo 'index.html' não encontrado para validar cache-busting de assets estáticos.");
  } else {
    const idxRead = otaSafeReadRegularFile(projectRealDir, indexFull);
    if (idxRead.error) {
      issues.push(idxRead.error);
    } else {
      const html = idxRead.content;
      const appBuildMatch = html.match(/\bAPP_CURRENT_BUILD\s*=\s*["']?(\d+)["']?/);
      if (appBuildMatch && buildNumber && appBuildMatch[1] !== buildNumber) {
        issues.push(
          `APP_CURRENT_BUILD (${appBuildMatch[1]}) em '${indexRel}' dessincronizado com '${manifestRel}' (${buildNumber}).`
        );
      }

      const hasAssetCacheGuard =
        /window\.fetch\s*=/.test(html) &&
        (/AssetManifest/.test(html) || /FontManifest/.test(html)) &&
        (/cache\s*:\s*['"]no-store['"]/.test(html) || /_b=/.test(html));

      const assetTags = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)];
      const unbustedAssets = [];
      const versionedQueryRe = /[?&](?:v|ver|version|_b|b|build|hash|h|t)=[^&#"'\s]+/i;
      const hashedFilenameRe = /(?:[.-][a-f0-9]{6,32}|-[A-Za-z0-9_-]{8,})\.(?:js|mjs|css)(?:$|[?#])/i;

      for (const m of assetTags) {
        const ref = m[1].trim();
        if (!ref || /^(?:https?:)?\/\//i.test(ref) || ref.startsWith("data:")) continue;
        const cleanRef = ref.split("?")[0].toLowerCase();
        const isStaticBundle =
          cleanRef.endsWith("main.dart.js") ||
          cleanRef.endsWith("flutter_bootstrap.js") ||
          cleanRef.endsWith("flutter.js") ||
          /\.(?:js|mjs|css)$/.test(cleanRef);
        if (!isStaticBundle) continue;

        const hasDynamicBust =
          versionedQueryRe.test(ref) ||
          hashedFilenameRe.test(ref) ||
          /\{\{[^}]+\}\}/.test(ref);

        if (!hasDynamicBust) {
          if (cleanRef.endsWith("flutter_bootstrap.js")) {
            const bootstrapPath = path.resolve(path.dirname(indexFull), cleanRef.replace(/^\/+/, ""));
            const bootRead = fs.existsSync(bootstrapPath)
              ? otaSafeReadRegularFile(projectRealDir, bootstrapPath)
              : null;
            const hasInternalBust =
              bootRead &&
              !bootRead.error &&
              (/serviceWorkerVersion/.test(bootRead.content) ||
                /main\.dart\.js\?[a-zA-Z0-9_]+=/.test(bootRead.content) ||
                hashedFilenameRe.test(bootRead.content));
            if (!hasInternalBust && !hasAssetCacheGuard) {
              unbustedAssets.push(ref);
            }
          } else {
            unbustedAssets.push(ref);
          }
        }
      }

      const mentionsFlutterBootstrap = /flutter_bootstrap\.js/.test(html);
      const mentionsMainDart = /main\.dart\.js/.test(html);
      if (!hasAssetCacheGuard && !mentionsFlutterBootstrap && !mentionsMainDart) {
        issues.push(
          `Nenhum mecanismo de cache-busting (initAssetCacheGuard ou referências versionadas a flutter_bootstrap.js/main.dart.js) detectado em '${indexRel}'.`
        );
      } else if (unbustedAssets.length > 0) {
        issues.push(
          `Assets estáticos sem hash ou query string de cache-busting em '${indexRel}': ${unbustedAssets.join(", ")}.`
        );
      } else if (!hasAssetCacheGuard) {
        issues.push(
          `Guarda anti-cache de manifests ('initAssetCacheGuard' interceptando AssetManifest/FontManifest/version.json com _b= & cache:'no-store') ausente em '${indexRel}'.`
        );
      }
    }
  }

  const valid =
    manifestValid &&
    isMonotonic32BitSafe &&
    inSyncWithPubspec &&
    cacheHeadersCompliant &&
    issues.length === 0;

  const summary = valid
    ? `OTA válido: v${appVersion}+${buildNumber} (32-bit safe, sincronizado com ${pubspecRel}, anti-cache e cache-busting conformes).`
    : `OTA inválido (${issues.length} problema(s)): ${issues[0] || "verifique os detalhes em issues."}`;

  return {
    valid,
    appVersion,
    buildNumber,
    isMonotonic32BitSafe,
    inSyncWithPubspec,
    cacheHeadersCompliant,
    issues,
    summary,
  };
}
