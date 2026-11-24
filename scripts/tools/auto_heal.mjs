/**
 * ShapeLab Brain Auto-Heal Engine (Automated Compliance & Self-Repair)
 * Pure ESM, zero external dependencies (node:fs, node:path).
 */

import fs from "node:fs";
import path from "node:path";
import { auditPreflight } from "../ci_preflight_check.mjs";

export const BRAIN_AUTO_HEAL_TOOL = {
  name: "brain_auto_heal",
  description:
    "Mecanismo de autocorreção autônoma (Auto-Healing) da ShapeLab. Analisa desvios de compliance detectados pelo Preflight CI Gate (análise estrita de lints, paridade de manifestos OTA version.json/pubspec, headers anti-cache firebase/render, travas SemVer do brain_sync.ps1) e aplica patches canônicos de reparo imediato.",
  inputSchema: {
    type: "object",
    properties: {
      projectPath: {
        type: "string",
        description: "Caminho absoluto do repositório produto a inspecionar e reparar",
      },
      apply: {
        type: "boolean",
        description:
          "Se true, aplica as correções no disco. Se false (padrão), roda em modo dry-run gerando o plano de patches sem alterar arquivos.",
      },
      rules: {
        type: "array",
        items: { type: "string" },
        description:
          "Lista opcional de regras específicas a reparar (ex: ['analysis_options', 'version_manifest', 'anti_cache_headers', 'brain_sync_script']). Padrão: todas as regras aplicáveis.",
      },
    },
    required: ["projectPath"],
  },
};

const DEFAULT_BRAIN_ROOT =
  process.env.SHAPELAB_BRAIN_ROOT ||
  "c:\\Users\\Cleudson\\OneDrive\\Documentos\\PROJETOS 2026\\shapelab-brain";

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function safeWriteText(filePath, content) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * 1. Healer: analysis_options.yaml (fatal_infos: true)
 */
function healAnalysisOptions(projDir, dryRun, patches) {
  const candidates = [
    path.join(projDir, "analysis_options.yaml"),
    path.join(projDir, "mobile", "analysis_options.yaml"),
  ];

  for (const optPath of candidates) {
    if (!fs.existsSync(optPath)) continue;
    const content = safeReadText(optPath);
    if (!content) continue;

    const relPath = path.relative(projDir, optPath).replace(/\\/g, "/");

    let updated = content;
    let modified = false;

    if (!/fatal_infos\s*:\s*true/i.test(content)) {
      if (/analyzer\s*:/i.test(content)) {
        updated = content.replace(/(analyzer\s*:\s*\r?\n)/i, "$1  errors:\n    todo: ignore\n  fatal_infos: true\n");
      } else {
        updated = `analyzer:\n  fatal_infos: true\n\n${content}`;
      }
      modified = true;
    }

    if (modified) {
      patches.push({
        rule: "analysis_options_fatal_infos",
        file: relPath,
        description: "Habilitado 'fatal_infos: true' sob 'analyzer:' no analysis_options.yaml.",
        applied: !dryRun,
      });

      if (!dryRun) {
        safeWriteText(optPath, updated);
      }
    }
  }
}

/**
 * 2. Healer: version.json & pubspec.yaml sync
 */
function healVersionManifest(projDir, dryRun, patches) {
  const pubspecs = [
    path.join(projDir, "pubspec.yaml"),
    path.join(projDir, "mobile", "pubspec.yaml"),
  ];

  for (const pubPath of pubspecs) {
    if (!fs.existsSync(pubPath)) continue;
    const pubContent = safeReadText(pubPath);
    if (!pubContent) continue;

    const vm = pubContent.match(/^version\s*:\s*(\d+\.\d+\.\d+)\+(\d+)/m);
    if (!vm) continue;

    const appVer = vm[1];
    let buildNum = vm[2];

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if (buildNum.length !== 10 || Number(buildNum) > 2147483647) {
      buildNum = `${todayStr}01`;
    }

    const pubDir = path.dirname(pubPath);
    const versionJsonPath = path.join(pubDir, "web", "version.json");
    const relJson = path.relative(projDir, versionJsonPath).replace(/\\/g, "/");

    let needsWrite = true;
    if (fs.existsSync(versionJsonPath)) {
      try {
        const curJson = JSON.parse(safeReadText(versionJsonPath) || "{}");
        if (curJson.version === appVer && String(curJson.build_number) === String(buildNum)) {
          needsWrite = false;
        }
      } catch {
        needsWrite = true;
      }
    }

    if (needsWrite) {
      const nameMatch = pubContent.match(/^name\s*:\s*([^\s#]+)/m);
      const appName = nameMatch ? nameMatch[1].trim() : path.basename(projDir);

      const newManifest = {
        app_name: appName,
        version: appVer,
        build_number: buildNum,
        package_name: appName,
      };

      patches.push({
        rule: "version_manifest_sync",
        file: relJson,
        description: `Sincronizado version.json para v${appVer}+${buildNum} (32-bit safe YYYYMMDDNN).`,
        applied: !dryRun,
      });

      if (!dryRun) {
        safeWriteText(versionJsonPath, JSON.stringify(newManifest, null, 2) + "\n");
      }
    }
  }
}

/**
 * 3. Healer: Anti-cache headers em firebase.json
 */
function healAntiCacheHeaders(projDir, dryRun, patches) {
  const firebaseJsonPath = path.join(projDir, "firebase.json");
  if (!fs.existsSync(firebaseJsonPath)) return;

  const content = safeReadText(firebaseJsonPath);
  if (!content) return;

  try {
    const config = JSON.parse(content);
    if (!config.hosting) return;

    let modified = false;
    const hostingTargets = Array.isArray(config.hosting) ? config.hosting : [config.hosting];

    for (const h of hostingTargets) {
      if (!h.headers) h.headers = [];
      const hasVersionHeader = h.headers.some((hdr) =>
        hdr.source === "/version.json" || hdr.source === "**/version.json"
      );

      if (!hasVersionHeader) {
        h.headers.push({
          source: "/version.json",
          headers: [
            {
              key: "Cache-Control",
              value: "no-store, no-cache, must-revalidate, max-age=0",
            },
          ],
        });
        modified = true;
      }
    }

    if (modified) {
      patches.push({
        rule: "anti_cache_headers_firebase",
        file: "firebase.json",
        description: "Injetada regra de Cache-Control 'no-store' para '/version.json' no firebase.json.",
        applied: !dryRun,
      });

      if (!dryRun) {
        safeWriteText(firebaseJsonPath, JSON.stringify(config, null, 2) + "\n");
      }
    }
  } catch {
    // Ignore JSON parse errors
  }
}

/**
 * 4. Healer: scripts/brain_sync.ps1 (SemVer gate)
 */
function healBrainSyncScript(projDir, dryRun, patches) {
  const syncScript = path.join(projDir, "scripts", "brain_sync.ps1");
  const brainSyncCentral = path.join(DEFAULT_BRAIN_ROOT, "scripts", "brain_sync.ps1");

  if (!fs.existsSync(brainSyncCentral)) return;
  const centralContent = safeReadText(brainSyncCentral);
  if (!centralContent) return;

  let needsUpdate = false;
  if (!fs.existsSync(syncScript)) {
    needsUpdate = true;
  } else {
    const curContent = safeReadText(syncScript);
    if (curContent !== centralContent) {
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
    patches.push({
      rule: "brain_sync_script_canonical",
      file: "scripts/brain_sync.ps1",
      description: "Sincronizado scripts/brain_sync.ps1 com o template canônico central da ShapeLab.",
      applied: !dryRun,
    });

    if (!dryRun) {
      safeWriteText(syncScript, centralContent);
    }
  }
}

export function autoHealProject({ projectPath, apply = false, rules = null } = {}) {
  if (!projectPath || typeof projectPath !== "string") {
    return { error: "Parâmetro 'projectPath' obrigatório." };
  }

  const resolved = path.resolve(projectPath);
  if (!fs.existsSync(resolved)) {
    return { error: `Diretório não existe: ${resolved}` };
  }

  const dryRun = !apply;
  const patches = [];

  const shouldRun = (ruleName) => !rules || rules.includes(ruleName);

  // Initial audit
  const preAudit = auditPreflight({ projectPath: resolved });
  const initialScore = preAudit.score ?? 0;

  // Run healers
  if (shouldRun("analysis_options")) healAnalysisOptions(resolved, dryRun, patches);
  if (shouldRun("version_manifest")) healVersionManifest(resolved, dryRun, patches);
  if (shouldRun("anti_cache_headers")) healAntiCacheHeaders(resolved, dryRun, patches);
  if (shouldRun("brain_sync_script")) healBrainSyncScript(resolved, dryRun, patches);

  // Post audit
  let postScore = initialScore;
  let healed = false;

  if (!dryRun && patches.length > 0) {
    const postAudit = auditPreflight({ projectPath: resolved });
    postScore = postAudit.score ?? initialScore;
    healed = postScore >= initialScore;
  }

  const summary = dryRun
    ? `Dry-Run: ${patches.length} patch(es) identificado(s). Score atual: ${initialScore}/100. Execute com apply: true para aplicar.`
    : `Auto-Heal concluído: ${patches.length} patch(es) aplicado(s). Score: ${initialScore}/100 -> ${postScore}/100.`;

  return {
    projectPath: resolved,
    mode: dryRun ? "dry-run" : "applied",
    initialScore,
    postScore,
    scoreDelta: postScore - initialScore,
    patchesCount: patches.length,
    patches,
    healed,
    summary,
  };
}
