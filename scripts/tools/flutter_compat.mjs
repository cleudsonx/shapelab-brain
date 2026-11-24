/**
 * ShapeLab Flutter Compatibility & WCAG Audit Tool
 * Pure ESM, zero external dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import { AUDIT_IGNORED_DIRS } from "../ci_preflight_check.mjs";

export const FLUTTER_COMPAT_CHECK_TOOL = {
  name: "flutter_compat_check",
  description:
    "Audita projetos Flutter/Dart quanto à compatibilidade Material (Barrel Adapter material_compat.dart), regras estritas e fatal_infos em analysis_options.yaml, navegação imersiva Edge-to-Edge (SystemUiMode.edgeToEdge + SafeArea) e contraste WCAG AA (>= 4.5:1) com tokens Prism S Neon (#10B981, #06B6D4, #090D16).",
  inputSchema: {
    type: "object",
    properties: {
      projectPath: {
        type: "string",
        description:
          "Caminho do repositório produto (ex.: raiz contendo mobile/) ou pasta mobile contendo código Flutter/Dart.",
      },
      checkWcagContrast: {
        type: "boolean",
        description:
          "Valida tokens Prism S Neon (#10B981, #06B6D4, #090D16), contraste WCAG AA >= 4.5:1 em ColorScheme e ausência de cores fixas em widgets (padrão: true).",
      },
      checkEdgeToEdge: {
        type: "boolean",
        description:
          "Valida SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge) e padding SafeArea interno ao Scaffold (padrão: true).",
      },
      checkMaterialCompat: {
        type: "boolean",
        description:
          "Varre arquivos .dart procurando conflitos entre package:material_ui/material_ui.dart e package:flutter/material.dart sem Barrel Adapter material_compat.dart (padrão: true).",
      },
    },
    required: ["projectPath"],
  },
};

const FLUTTER_MAX_FILES = 1500;
const FLUTTER_MAX_FILE_BYTES = 256 * 1024; // 256 KB

const PRISM_S_TOKENS = [
  { name: "emerald_neon", hex: "#10B981", dartHex: "10B981" },
  { name: "electric_cyan", hex: "#06B6D4", dartHex: "06B6D4" },
  { name: "obsidian_bg", hex: "#090D16", dartHex: "090D16" },
];

const DART_NAMED_COLORS = {
  "Colors.black": "#000000",
  "Colors.black87": "#000000",
  "Colors.black54": "#000000",
  "Colors.white": "#FFFFFF",
  "Colors.white70": "#FFFFFF",
  "Colors.white60": "#FFFFFF",
};

const COLOR_SCHEME_CONTRAST_PAIRS = [
  ["onPrimary", "primary"],
  ["onSecondary", "secondary"],
  ["onTertiary", "tertiary"],
  ["onSurface", "surface"],
  ["onBackground", "background"],
  ["onError", "error"],
];

function stripDartComments(source) {
  let out = "";
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : "";

    if (ch === "/" && next === "/") {
      while (i < len && source[i] !== "\n") {
        i++;
      }
      continue;
    }

    if (ch === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < len && depth > 0) {
        if (source[i] === "/" && source[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (source[i] === "*" && source[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          if (source[i] === "\n") out += "\n";
          i++;
        }
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      const triple = source.slice(i, i + 3) === ch.repeat(3);
      const quote = triple ? ch.repeat(3) : ch;
      out += quote;
      i += quote.length;
      while (i < len) {
        if (triple) {
          if (source.slice(i, i + 3) === quote) {
            out += quote;
            i += 3;
            break;
          }
        } else {
          if (source[i] === "\\") {
            out += source.slice(i, i + 2);
            i += 2;
            continue;
          }
          if (source[i] === ch) {
            out += ch;
            i++;
            break;
          }
        }
        out += source[i];
        i++;
      }
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function lineFromIndex(text, index) {
  if (!text || index <= 0) return 1;
  let line = 1;
  const limit = Math.min(index, text.length);
  for (let i = 0; i < limit; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractBalancedParenBlock(text, openParenIndex) {
  let depth = 0;
  let i = openParenIndex;
  const len = text.length;
  while (i < len) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      i++;
      while (i < len && text[i] !== ch) {
        if (text[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return text.slice(openParenIndex + 1, i);
    }
    i++;
  }
  return text.slice(openParenIndex + 1, Math.min(len, openParenIndex + 1500));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function blendHexOver(fgHex, fgAlpha, bgHex = "#090D16") {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return fgHex;
  const a = Math.max(0, Math.min(1, fgAlpha));
  const r = Math.round(fg.r * a + bg.r * (1 - a));
  const g = Math.round(fg.g * a + bg.g * (1 - a));
  const b = Math.round(fg.b * a + bg.b * (1 - a));
  const toHex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const norm = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * norm[0] + 0.7152 * norm[1] + 0.0722 * norm[2];
}

function wcagContrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  if (l1 === null || l2 === null) return null;
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

function resolveDartColorExpr(expr, colorMap, fallbackBg = "#090D16") {
  const trimmed = String(expr || "").trim();
  const hexMatch = trimmed.match(/^(?:const\s+)?Color\s*\(\s*0x([0-9A-Fa-f]{8})\s*\)$/);
  if (hexMatch) {
    const argb = hexMatch[1].toUpperCase();
    const alpha = parseInt(argb.slice(0, 2), 16) / 255;
    const hex = `#${argb.slice(2)}`;
    return alpha < 0.99 ? blendHexOver(hex, alpha, fallbackBg) : hex;
  }
  if (Object.prototype.hasOwnProperty.call(DART_NAMED_COLORS, trimmed)) {
    return DART_NAMED_COLORS[trimmed];
  }
  if (colorMap.has(trimmed)) {
    return colorMap.get(trimmed);
  }
  const suffix = trimmed.includes(".") ? trimmed.split(".").pop() : null;
  if (suffix && colorMap.has(suffix)) {
    return colorMap.get(suffix);
  }
  return null;
}

function collectFlutterFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  const ignored =
    typeof AUDIT_IGNORED_DIRS !== "undefined"
      ? AUDIT_IGNORED_DIRS
      : new Set(["node_modules", ".git", "build", ".dart_tool", ".gradle", "Pods", ".shapelab"]);

  while (stack.length > 0 && files.length < FLUTTER_MAX_FILES) {
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
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
        if (files.length >= FLUTTER_MAX_FILES) break;
      }
    }
  }
  return files;
}

function safeReadFlutterText(filePath) {
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile() || st.size > FLUTTER_MAX_FILE_BYTES) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function resolveFlutterRoot(resolvedProject) {
  const candidates = [
    resolvedProject,
    path.join(resolvedProject, "mobile"),
    path.join(resolvedProject, "app"),
    path.join(resolvedProject, "frontend"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "pubspec.yaml"))) {
      return dir;
    }
  }
  return resolvedProject;
}

export function checkFlutterCompat(args = {}) {
  const {
    projectPath,
    checkWcagContrast = true,
    checkEdgeToEdge = true,
    checkMaterialCompat = true,
  } = args && typeof args === "object" ? args : {};

  if (!projectPath || typeof projectPath !== "string") {
    return { error: "Parâmetro 'projectPath' é obrigatório." };
  }
  if (/[\x00-\x1f]/.test(projectPath) || /^[\\/]{2}/.test(projectPath)) {
    return { error: "Parâmetro 'projectPath' inválido ou com caracteres rejeitados." };
  }

  const resolvedProject = path.resolve(projectPath);
  if (!fs.existsSync(resolvedProject)) {
    return { error: `Diretório não encontrado: ${resolvedProject}` };
  }
  try {
    const lst = fs.lstatSync(resolvedProject);
    if (!lst.isDirectory() || lst.isSymbolicLink()) {
      return { error: `Caminho deve ser diretório real (não symlink): ${resolvedProject}` };
    }
  } catch {
    return { error: `Falha ao inspecionar diretório: ${resolvedProject}` };
  }

  const flutterRoot = resolveFlutterRoot(resolvedProject);
  const allFiles = collectFlutterFiles(flutterRoot);
  const relPosix = (abs) => path.relative(resolvedProject, abs).replace(/\\/g, "/");

  const dartFiles = [];
  let pubspecItem = null;
  let analysisOptionsItem = null;
  let mainActivityItem = null;
  const webBrandItems = [];

  for (const full of allFiles) {
    const rel = relPosix(full);
    const base = path.basename(full);
    if (base.endsWith(".dart")) {
      const raw = safeReadFlutterText(full);
      if (raw !== null) {
        dartFiles.push({ full, rel, base, raw, clean: stripDartComments(raw) });
      }
    } else if (base === "pubspec.yaml" && (!pubspecItem || full === path.join(flutterRoot, "pubspec.yaml"))) {
      pubspecItem = { full, rel, raw: safeReadFlutterText(full) || "" };
    } else if (
      base === "analysis_options.yaml" &&
      (!analysisOptionsItem || full === path.join(flutterRoot, "analysis_options.yaml"))
    ) {
      analysisOptionsItem = { full, rel, raw: safeReadFlutterText(full) || "" };
    } else if (base === "MainActivity.kt" || base === "MainActivity.java") {
      mainActivityItem = { full, rel, raw: safeReadFlutterText(full) || "" };
    } else if (base === "manifest.json" || base === "manifest.webmanifest" || base === "index.html") {
      const raw = safeReadFlutterText(full);
      if (raw !== null) webBrandItems.push({ full, rel, raw });
    }
  }

  const issues = [];
  const recSet = new Set();
  const addIssue = (file, line, rule, severity, message, recommendation = null) => {
    issues.push({
      file: file || ".",
      line: Number.isInteger(line) && line > 0 ? line : 1,
      rule,
      severity,
      message,
    });
    if (recommendation) recSet.add(recommendation);
  };

  const filesScanned =
    dartFiles.length +
    (pubspecItem ? 1 : 0) +
    (analysisOptionsItem ? 1 : 0) +
    (mainActivityItem ? 1 : 0) +
    webBrandItems.length;

  if (dartFiles.length === 0 && !pubspecItem) {
    addIssue(
      ".",
      1,
      "flutter-project/not-found",
      "error",
      `Nenhum arquivo .dart ou pubspec.yaml encontrado em '${flutterRoot}'.`,
      "Informe em 'projectPath' a raiz do repositório Flutter ou a subpasta mobile/."
    );
    return {
      compliant: false,
      score: 0,
      filesScanned,
      issues,
      recommendations: Array.from(recSet),
    };
  }

  // 1. Fatal Infos & Lints
  let lintsEarned = 25;

  if (!analysisOptionsItem) {
    lintsEarned = 0;
    addIssue(
      relPosix(path.join(flutterRoot, "analysis_options.yaml")),
      1,
      "lints/missing-analysis-options",
      "error",
      "Arquivo 'analysis_options.yaml' ausente no projeto Flutter.",
      "Crie 'analysis_options.yaml' com 'include: package:flutter_lints/flutter.yaml', regras strict-* e 'fatal_infos: true'."
    );
  } else {
    const aoText = analysisOptionsItem.raw;
    const aoLines = aoText.split(/\r?\n/);
    const nonCommentAo = aoLines
      .map((l) => l.replace(/#.*$/, ""))
      .join("\n");

    const hasFatalInfosTrue = /^\s*fatal_infos\s*:\s*true\b/m.test(nonCommentAo);
    const hasFatalInfosFalse = /^\s*fatal_infos\s*:\s*false\b/m.test(nonCommentAo);

    if (!hasFatalInfosTrue) {
      lintsEarned -= 15;
      const failLine = hasFatalInfosFalse
        ? aoLines.findIndex((l) => /^\s*fatal_infos\s*:\s*false\b/.test(l)) + 1
        : 1;
      addIssue(
        analysisOptionsItem.rel,
        failLine || 1,
        "lints/fatal-infos-disabled",
        "error",
        hasFatalInfosFalse
          ? "'fatal_infos: false' detectado em analysis_options.yaml; deve ser 'fatal_infos: true'."
          : "'fatal_infos: true' não está ativo em analysis_options.yaml.",
        "Adicione 'fatal_infos: true' em 'analyzer:' no analysis_options.yaml e rode 'flutter analyze --fatal-infos'."
      );
    }

    const hasLintInclude =
      /^\s*include\s*:\s*package:(?:flutter_lints|very_good_analysis|lints)\//m.test(nonCommentAo);
    const hasLinterRules = /^\s*linter\s*:\s*[\r\n]+\s*rules\s*:/m.test(nonCommentAo);
    const missingStrictFlags = ["strict-casts", "strict-inference", "strict-raw-types"].filter(
      (flag) => !new RegExp(`^\\s*${flag}\\s*:\\s*true\\b`, "m").test(nonCommentAo)
    );

    if (!hasLintInclude && !hasLinterRules) {
      lintsEarned -= 10;
      addIssue(
        analysisOptionsItem.rel,
        1,
        "lints/missing-lint-rules",
        "error",
        "Nenhuma suíte estrita ('include: package:flutter_lints/...' ou 'linter: rules:') configurada.",
        "Ative 'include: package:flutter_lints/flutter.yaml' e regras explícitas em 'linter: rules:'."
      );
    } else if (missingStrictFlags.length > 0) {
      lintsEarned -= 5;
      addIssue(
        analysisOptionsItem.rel,
        1,
        "lints/missing-strict-mode",
        "warning",
        `Modo estrito do analyzer incompleto; ausente(s): ${missingStrictFlags.join(", ")}.`,
        "Configure 'strict-casts: true', 'strict-inference: true' e 'strict-raw-types: true' sob 'analyzer: language:'."
      );
    }
  }

  const deprecatedPatterns = [
    {
      re: /\.withOpacity\s*\(/g,
      msg: "Uso de '.withOpacity()' falha sob '--fatal-infos'; substitua por '.withValues(alpha: ...)' ou '.withAlpha(...)'.",
    },
    {
      re: /\bWillPopScope\s*\(/g,
      msg: "Uso de 'WillPopScope' depreciado; migre para 'PopScope(canPop: ..., onPopInvokedWithResult: ...)'.",
    },
    {
      re: /\bMaterialStateProperty\b/g,
      msg: "Uso de 'MaterialStateProperty' depreciado; migre para 'WidgetStateProperty'.",
    },
  ];
  let deprecatedPenalty = 0;
  for (const df of dartFiles) {
    for (const pat of deprecatedPatterns) {
      pat.re.lastIndex = 0;
      const m = pat.re.exec(df.clean);
      if (m) {
        if (deprecatedPenalty < 10) deprecatedPenalty += 3;
        addIssue(
          df.rel,
          lineFromIndex(df.clean, m.index),
          "lints/deprecated-flutter-api",
          "warning",
          pat.msg,
          "Substitua APIs legadas conforme tabela --fatal-infos em skills/ui/flutter_edge_to_edge.md (§6.2)."
        );
      }
    }
  }
  lintsEarned = Math.max(0, lintsEarned - Math.min(10, deprecatedPenalty));

  // 2. Material Compat
  let materialEarned = 25;
  if (checkMaterialCompat) {
    const pubspecHasMaterialUi =
      Boolean(pubspecItem) && /^\s*material_ui\s*:/m.test(pubspecItem.raw.replace(/#.*$/gm, ""));

    const barrelFiles = dartFiles.filter((f) => f.base === "material_compat.dart");
    const hasBarrel = barrelFiles.length > 0;

    const flutterMatImportRe = /import\s+['"]package:flutter\/material\.dart['"]/g;
    const materialUiImportRe = /import\s+['"]package:material_ui\/material_ui\.dart['"]/g;
    const flutterMatExportRe = /export\s+['"]package:flutter\/material\.dart['"]/;
    const materialUiExportRe = /export\s+['"]package:material_ui\/material_ui\.dart['"]/;

    const directFlutterImports = [];
    const directMaterialUiImports = [];

    for (const bf of barrelFiles) {
      const expFlutter = flutterMatExportRe.test(bf.clean);
      const expMatUi = materialUiExportRe.test(bf.clean);
      if (expFlutter && expMatUi) {
        materialEarned = 0;
        addIssue(
          bf.rel,
          1,
          "material-compat/barrel-dual-export",
          "error",
          "Barrel Adapter 'material_compat.dart' exporta 'flutter/material.dart' e 'material_ui/material_ui.dart' simultaneamente.",
          "Mantenha apenas um 'export' ativo no material_compat.dart para evitar ambiguidade de símbolos."
        );
      }
    }

    for (const df of dartFiles) {
      if (df.base === "material_compat.dart") continue;
      flutterMatImportRe.lastIndex = 0;
      materialUiImportRe.lastIndex = 0;
      const mFlutter = flutterMatImportRe.exec(df.clean);
      const mMatUi = materialUiImportRe.exec(df.clean);

      if (mFlutter) directFlutterImports.push({ df, index: mFlutter.index });
      if (mMatUi) directMaterialUiImports.push({ df, index: mMatUi.index });

      if (mFlutter && mMatUi) {
        materialEarned = 0;
        addIssue(
          df.rel,
          lineFromIndex(df.clean, mMatUi.index),
          "material-compat/dual-sdk-import",
          "error",
          "Conflito direto no mesmo arquivo entre 'package:flutter/material.dart' e 'package:material_ui/material_ui.dart'.",
          "Centralize o import de Material no Barrel Adapter 'lib/core/ui/material_compat.dart' e importe apenas 'material_compat.dart'."
        );
      }
    }

    const mixesSdksAcrossRepo =
      (directMaterialUiImports.length > 0 || pubspecHasMaterialUi) && directFlutterImports.length > 0;

    if (mixesSdksAcrossRepo && !hasBarrel) {
      materialEarned = 0;
      const first = directMaterialUiImports[0] || directFlutterImports[0];
      addIssue(
        first.df.rel,
        lineFromIndex(first.df.clean, first.index),
        "material-compat/missing-barrel-adapter",
        "error",
        "Projeto mistura 'package:material_ui/material_ui.dart' e 'package:flutter/material.dart' sem o Barrel Adapter 'material_compat.dart'.",
        "Crie 'lib/core/ui/material_compat.dart' exportando apenas o pacote alvo e substitua imports diretos de Material."
      );
    } else if (hasBarrel) {
      const bypassList = [...directMaterialUiImports, ...directFlutterImports];
      const strictMixed = mixesSdksAcrossRepo || pubspecHasMaterialUi;
      let bypassPenalty = 0;
      for (const item of bypassList) {
        if (bypassPenalty < 20) bypassPenalty += strictMixed ? 10 : 5;
        addIssue(
          item.df.rel,
          lineFromIndex(item.df.clean, item.index),
          "material-compat/bypassed-barrel-adapter",
          strictMixed ? "error" : "warning",
          "Import direto de Material detectado ignorando o Barrel Adapter 'material_compat.dart' existente.",
          "Substitua o import direto pelo Barrel Adapter local 'material_compat.dart'."
        );
      }
      materialEarned = Math.max(0, materialEarned - bypassPenalty);
    }
  }

  // 3. Edge-to-Edge Navigation
  let edgeEarned = 25;
  if (checkEdgeToEdge) {
    const setEdgeRe =
      /SystemChrome\s*\.\s*setEnabledSystemUIMode\s*\(\s*SystemUiMode\s*\.\s*edgeToEdge\b/;
    const contrastFalseRe = /systemNavigationBarContrastEnforced\s*:\s*false\b/;
    const annotatedRegionRe = /AnnotatedRegion\s*<\s*SystemUiOverlayStyle\s*>/;
    const scaffoldRe = /\bScaffold\s*\(/g;
    const edgeToEdgeScaffoldRe = /\bEdgeToEdgeScaffold\s*\(/;
    const safeAreaCallRe = /\bSafeArea\s*\(/g;

    let hasEdgeToEdgeMode = false;
    let hasContrastFalse = false;
    let hasAnnotatedRegion = false;
    let hasScaffold = false;
    let hasInternalSafeArea = false;
    let firstScaffoldLoc = null;

    for (const df of dartFiles) {
      if (setEdgeRe.test(df.clean)) hasEdgeToEdgeMode = true;
      if (contrastFalseRe.test(df.clean)) hasContrastFalse = true;
      if (annotatedRegionRe.test(df.clean)) hasAnnotatedRegion = true;

      if (edgeToEdgeScaffoldRe.test(df.clean)) {
        hasScaffold = true;
        hasInternalSafeArea = true;
      }

      scaffoldRe.lastIndex = 0;
      let sm;
      while ((sm = scaffoldRe.exec(df.clean)) !== null) {
        hasScaffold = true;
        if (!firstScaffoldLoc) {
          firstScaffoldLoc = { file: df.rel, line: lineFromIndex(df.clean, sm.index) };
        }
        const openIdx = df.clean.indexOf("(", sm.index);
        if (openIdx !== -1) {
          const scaffoldBlock = extractBalancedParenBlock(df.clean, openIdx);
          if (/\bSafeArea\s*\(/.test(scaffoldBlock)) {
            hasInternalSafeArea = true;
          }
        }
      }

      safeAreaCallRe.lastIndex = 0;
      let sam;
      while ((sam = safeAreaCallRe.exec(df.clean)) !== null) {
        const openIdx = df.clean.indexOf("(", sam.index);
        if (openIdx !== -1) {
          const saBlock = extractBalancedParenBlock(df.clean, openIdx);
          if (/\bchild\s*:\s*(?:const\s+)?Scaffold\s*\(/.test(saBlock)) {
            edgeEarned = Math.max(0, edgeEarned - 15);
            addIssue(
              df.rel,
              lineFromIndex(df.clean, sam.index),
              "edge-to-edge/safearea-wraps-scaffold",
              "error",
              "Anti-padrão detectado: 'SafeArea' envolvendo 'Scaffold' inteiro cria faixas sólidas nas barras de sistema.",
              "Mova 'SafeArea' para dentro do 'Scaffold.body' (ou adote 'EdgeToEdgeScaffold' de skills/ui/flutter_edge_to_edge.md)."
            );
          }
        }
      }
    }

    if (!hasEdgeToEdgeMode) {
      edgeEarned = Math.max(0, edgeEarned - 15);
      const mainDart = dartFiles.find((f) => f.base === "main.dart") || dartFiles[0];
      addIssue(
        mainDart ? mainDart.rel : ".",
        1,
        "edge-to-edge/missing-system-ui-mode",
        "error",
        "Chamada 'SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge)' não encontrada.",
        "Configure 'SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge)' na inicialização do app (initEdgeToEdge)."
      );
    }

    if (hasScaffold && !hasInternalSafeArea) {
      edgeEarned = Math.max(0, edgeEarned - 10);
      addIssue(
        firstScaffoldLoc.file,
        firstScaffoldLoc.line,
        "edge-to-edge/missing-scaffold-safearea",
        "error",
        "Scaffold principal sem padding 'SafeArea' interno (risco de conteúdo sob status bar / barra de gestos).",
        "Aplique 'SafeArea(top: safeTop, bottom: safeBottom, child: body)' dentro do Scaffold ou use 'EdgeToEdgeScaffold'."
      );
    }

    if (!hasContrastFalse || !hasAnnotatedRegion) {
      edgeEarned = Math.max(0, edgeEarned - 5);
      const target = firstScaffoldLoc || { file: dartFiles[0]?.rel || ".", line: 1 };
      addIssue(
        target.file,
        target.line,
        "edge-to-edge/missing-contrast-enforced-false",
        "warning",
        "Recomendado usar 'AnnotatedRegion<SystemUiOverlayStyle>' e 'systemNavigationBarContrastEnforced: false' para transparência real.",
        "Adicione 'systemNavigationBarContrastEnforced: false' e 'AnnotatedRegion<SystemUiOverlayStyle>' sincronizado ao Brightness do tema."
      );
    }

    if (
      mainActivityItem &&
      !/setDecorFitsSystemWindows\s*\(\s*window\s*,\s*false\s*\)|enableEdgeToEdge\s*\(/.test(
        mainActivityItem.raw
      )
    ) {
      edgeEarned = Math.max(0, edgeEarned - 5);
      addIssue(
        mainActivityItem.rel,
        1,
        "edge-to-edge/android-decor-fits-missing",
        "warning",
        "MainActivity Android sem 'WindowCompat.setDecorFitsSystemWindows(window, false)' ou 'enableEdgeToEdge()'.",
        "Adicione 'WindowCompat.setDecorFitsSystemWindows(window, false)' em MainActivity.kt para Android Edge-to-Edge nativo."
      );
    }
  }

  // 4. WCAG Contrast Tokens
  let wcagEarned = 25;
  if (checkWcagContrast) {
    const colorMap = new Map();
    const colorConstRe =
      /\b(?:static\s+)?(?:const|final)\s+(?:Color\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:const\s+)?Color\s*\(\s*0x([0-9A-Fa-f]{8})\s*\)/g;

    for (const df of dartFiles) {
      colorConstRe.lastIndex = 0;
      let cm;
      while ((cm = colorConstRe.exec(df.clean)) !== null) {
        const argb = cm[2].toUpperCase();
        const alpha = parseInt(argb.slice(0, 2), 16) / 255;
        const hex = `#${argb.slice(2)}`;
        const resolved = alpha < 0.99 ? blendHexOver(hex, alpha, "#090D16") : hex;
        colorMap.set(cm[1], resolved);
      }
    }

    const combinedDartClean = dartFiles.map((d) => d.clean).join("\n");
    const combinedWebRaw = webBrandItems.map((w) => w.raw).join("\n");
    const missingPrismTokens = PRISM_S_TOKENS.filter((tok) => {
      const dartRe = new RegExp(`0x[0-9A-Fa-f]{2}${tok.dartHex}\\b`, "i");
      const cssRe = new RegExp(`#${tok.dartHex}\\b`, "i");
      return !dartRe.test(combinedDartClean) && !cssRe.test(combinedWebRaw);
    });

    if (missingPrismTokens.length > 0) {
      wcagEarned = Math.max(0, wcagEarned - (missingPrismTokens.length === 3 ? 10 : 5));
      const themeFile =
        dartFiles.find((f) => /theme|brand|token|color/i.test(f.base)) || dartFiles[0];
      addIssue(
        themeFile ? themeFile.rel : ".",
        1,
        "wcag-contrast/prism-s-tokens-missing",
        "warning",
        `Token(s) oficiais Prism S Neon ausentes: ${missingPrismTokens.map((t) => `${t.name} (${t.hex})`).join(", ")}.`,
        "Adote os tokens Prism S Neon (#10B981, #06B6D4, #090D16) definidos em skills/brand/shapelab_brand_identity.md."
      );
    }

    const colorSchemeRe = /\bColorScheme(?:\.(?:dark|light|fromSeed))?\s*\(/g;
    let contrastViolations = 0;

    for (const df of dartFiles) {
      colorSchemeRe.lastIndex = 0;
      let csm;
      while ((csm = colorSchemeRe.exec(df.clean)) !== null) {
        const openIdx = df.clean.indexOf("(", csm.index);
        if (openIdx === -1) continue;
        const block = extractBalancedParenBlock(df.clean, openIdx);
        const schemeBaseLine = lineFromIndex(df.clean, csm.index);

        const isLightScheme = /\bColorScheme\.light\s*\(/.test(df.clean.slice(csm.index, openIdx + 1));
        const defaultBg = isLightScheme ? "#F8FAFC" : "#090D16";

        const props = {};
        const propRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^,\n)]+)/g;
        let pm;
        while ((pm = propRe.exec(block)) !== null) {
          props[pm[1]] = pm[2].trim();
        }

        const resolvedSurface =
          resolveDartColorExpr(props.surface || props.background, colorMap, defaultBg) || defaultBg;

        for (const [fgKey, bgKey] of COLOR_SCHEME_CONTRAST_PAIRS) {
          if (!props[fgKey] || !props[bgKey]) continue;
          const bgHex = resolveDartColorExpr(props[bgKey], colorMap, resolvedSurface);
          const fgHex = resolveDartColorExpr(props[fgKey], colorMap, bgHex || resolvedSurface);
          if (!fgHex || !bgHex) continue;

          const ratio = wcagContrastRatio(fgHex, bgHex);
          if (ratio !== null && ratio < 4.5) {
            contrastViolations++;
            const propOffset = block.indexOf(`${fgKey}:`);
            const errLine =
              propOffset >= 0
                ? schemeBaseLine + lineFromIndex(block, propOffset) - 1
                : schemeBaseLine;
            addIssue(
              df.rel,
              errLine,
              "wcag-contrast/aa-ratio-violation",
              "error",
              `Contraste WCAG AA insuficiente entre '${fgKey}' (${fgHex}) e '${bgKey}' (${bgHex}): ${ratio.toFixed(2)}:1 (mínimo exigido >= 4.5:1).`,
              `Ajuste '${fgKey}'/'${bgKey}' para atingir contraste >= 4.5:1 (ex.: #F8FAFC ou #090D16 sobre #10B981/#06B6D4).`
            );
          }
        }
      }
    }
    if (contrastViolations > 0) {
      wcagEarned = Math.max(0, wcagEarned - Math.min(25, contrastViolations * 15));
    }

    const hardcodedColorRe = /\bColors\.(black(?:87|54|45|38|26|12)?|white(?:70|60|54|38|30|24|12|10)?)\b/g;
    let hardcodedPenalty = 0;
    for (const df of dartFiles) {
      if (/theme|token|brand|color_scheme/i.test(df.base)) continue;
      hardcodedColorRe.lastIndex = 0;
      const hm = hardcodedColorRe.exec(df.clean);
      if (hm) {
        if (hardcodedPenalty < 10) hardcodedPenalty += 3;
        addIssue(
          df.rel,
          lineFromIndex(df.clean, hm.index),
          "wcag-contrast/hardcoded-surface-color",
          "warning",
          `Cor fixa 'Colors.${hm[1]}' detectada em UI; prejudica Dual-Theme WCAG (Dark/Light).`,
          "Derive cores de superfície/texto via 'Theme.of(context).colorScheme' ao invés de 'Colors.black'/'Colors.white*'."
        );
      }
    }
    wcagEarned = Math.max(0, wcagEarned - Math.min(10, hardcodedPenalty));
  }

  let activeWeight = 25;
  let earnedWeight = lintsEarned;

  if (checkMaterialCompat) {
    activeWeight += 25;
    earnedWeight += materialEarned;
  }
  if (checkEdgeToEdge) {
    activeWeight += 25;
    earnedWeight += edgeEarned;
  }
  if (checkWcagContrast) {
    activeWeight += 25;
    earnedWeight += wcagEarned;
  }

  const score = Math.max(0, Math.min(100, Math.round((earnedWeight / activeWeight) * 100)));
  const hasError = issues.some((i) => i.severity === "error");

  return {
    compliant: !hasError,
    score,
    filesScanned,
    issues,
    recommendations: Array.from(recSet),
  };
}
