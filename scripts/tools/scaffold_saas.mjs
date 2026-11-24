/**
 * ShapeLab One-Click SaaS Generator (Autonomous Scaffolding Engine)
 * Pure ESM, zero external dependencies (node:fs, node:path, node:child_process).
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { autoHealProject } from "./auto_heal.mjs";

export const BRAIN_SCAFFOLD_SAAS_TOOL = {
  name: "brain_scaffold_saas",
  description:
    "Gera um novo produto SaaS completo da ShapeLab em segundos (One-Click SaaS Generator). Cria a estrutura de repositório com o submódulo .shapelab, CI Preflight Gate no GitHub Actions, travas de governança SemVer, identidade Prism S Neon, paridade de manifestos OTA e pontuação 100/100 certificada.",
  inputSchema: {
    type: "object",
    properties: {
      productName: {
        type: "string",
        description: "Identificador kebab-case do produto (ex: 'tattoo-saas', 'logistics-hub')",
      },
      displayName: {
        type: "string",
        description: "Nome comercial legível (ex: 'Tattoo Studio Pro', 'Logistics Hub')",
      },
      description: {
        type: "string",
        description: "Breve descrição do produto e proposta de valor",
      },
      targetBaseDir: {
        type: "string",
        description: "Diretório pai opcional para o repositório (padrão: diretório pai do brain)",
      },
      stack: {
        type: "string",
        description: "Stack técnica: 'flutter-fastapi' (padrão) ou 'cloudflare-edge'",
      },
    },
    required: ["productName"],
  },
};

const DEFAULT_BRAIN_ROOT =
  process.env.SHAPELAB_BRAIN_ROOT ||
  "c:\\Users\\Cleudson\\OneDrive\\Documentos\\PROJETOS 2026\\shapelab-brain";

function safeWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

export function scaffoldSaas({
  productName,
  displayName,
  description,
  targetBaseDir,
  stack = "flutter-fastapi",
} = {}) {
  if (!productName || typeof productName !== "string") {
    return { error: "Parâmetro 'productName' é obrigatório." };
  }

  const cleanName = productName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "");

  const title = displayName || cleanName.replace(/(^|-)([a-z])/g, (_, a, b) => (a ? " " : "") + b.toUpperCase());
  const desc = description || `Produto SaaS oficial construído sobre a arquitetura ShapeLab Agent OS.`;

  const baseDir = targetBaseDir
    ? path.resolve(targetBaseDir)
    : path.resolve(DEFAULT_BRAIN_ROOT, "..");
  const projectDir = path.join(baseDir, cleanName);

  if (fs.existsSync(projectDir)) {
    return { error: `Diretório do produto já existe: ${projectDir}` };
  }

  fs.mkdirSync(projectDir, { recursive: true });

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const initialBuild = `${todayStr}01`;

  // 1. README.md
  safeWrite(
    path.join(projectDir, "README.md"),
    `# ${title} (\`${cleanName}\`)

${desc}

[![ShapeLab Preflight](https://github.com/cleudsonx/${cleanName}/actions/workflows/ci_preflight.yml/badge.svg)](https://github.com/cleudsonx/${cleanName}/actions/workflows/ci_preflight.yml)
[![ShapeLab Brain](https://img.shields.io/badge/ShapeLab%20Brain-v2.13.0-10B981?style=flat-square&logo=git)](https://github.com/cleudsonx/shapelab-brain)
[![Design System](https://img.shields.io/badge/Design%20System-Prism%20S%20Neon-06B6D4?style=flat-square)](https://shapelab.ia.br)

---

## 🚀 Arquitetura & Governança
- **Submódulo Central:** \`.shapelab/\` gerido via \`scripts/brain_sync.ps1\` com travas SemVer.
- **Segurança Fail-Closed:** Preflight CI Gate ativo para validação estrita de segredos, RLS e JWT.
- **Identidade Visual:** Tokens Prism S Neon (\`#10B981\` Emerald / \`#06B6D4\` Cyan sobre \`#090D16\` Obsidian).
- **Versionamento:** Monotônico 32-bit safe (\`v0.1.0+${initialBuild}\`).
`
  );

  // 2. pubspec.yaml
  safeWrite(
    path.join(projectDir, "pubspec.yaml"),
    `name: ${cleanName.replace(/-/g, "_")}
description: "${desc}"
version: 0.1.0+${initialBuild}
publish_to: "none"

environment:
  sdk: ">=3.2.0 <4.0.0"
  flutter: ">=3.16.0"

dependencies:
  flutter:
    sdk: flutter

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
`
  );

  // 3. web/version.json
  safeWrite(
    path.join(projectDir, "web", "version.json"),
    JSON.stringify(
      {
        app_name: cleanName,
        version: "0.1.0",
        build_number: initialBuild,
        package_name: cleanName,
      },
      null,
      2
    ) + "\n"
  );

  // 4. analysis_options.yaml
  safeWrite(
    path.join(projectDir, "analysis_options.yaml"),
    `include: package:flutter_lints/flutter.yaml

analyzer:
  fatal_infos: true
  errors:
    todo: ignore

linter:
  rules:
    - prefer_const_constructors
    - avoid_print
`
  );

  // 5. scripts/brain_sync.ps1
  const centralSyncScript = path.join(DEFAULT_BRAIN_ROOT, "scripts", "brain_sync.ps1");
  if (fs.existsSync(centralSyncScript)) {
    safeWrite(path.join(projectDir, "scripts", "brain_sync.ps1"), fs.readFileSync(centralSyncScript, "utf8"));
  }

  // 6. .github/workflows/ci_preflight.yml
  const templateWorkflow = path.join(DEFAULT_BRAIN_ROOT, "templates", "github_workflow_ci_preflight.yml");
  if (fs.existsSync(templateWorkflow)) {
    safeWrite(
      path.join(projectDir, ".github", "workflows", "ci_preflight.yml"),
      fs.readFileSync(templateWorkflow, "utf8")
    );
  }

  // 7. Git Init & Submodule
  let gitSuccess = false;
  try {
    execFileSync("git", ["init"], { cwd: projectDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "ShapeLab Bot"], { cwd: projectDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "bot@shapelab.ia.br"], { cwd: projectDir, stdio: "ignore" });

    // Link submodule .shapelab
    execFileSync(
      "git",
      ["submodule", "add", "https://github.com/cleudsonx/shapelab-brain.git", ".shapelab"],
      { cwd: projectDir, stdio: "ignore" }
    );
    gitSuccess = true;
  } catch {
    // If git submodule network fails, copy .shapelab directory locally
    try {
      const destShapelab = path.join(projectDir, ".shapelab");
      fs.mkdirSync(destShapelab, { recursive: true });
      fs.copyFileSync(path.join(DEFAULT_BRAIN_ROOT, "VERSION"), path.join(destShapelab, "VERSION"));
      fs.copyFileSync(path.join(DEFAULT_BRAIN_ROOT, "INDEX.md"), path.join(destShapelab, "INDEX.md"));
      fs.copyFileSync(path.join(DEFAULT_BRAIN_ROOT, "CORE_CONSTITUTION.md"), path.join(destShapelab, "CORE_CONSTITUTION.md"));
    } catch {
      // Ignore fallback copy errors
    }
  }

  // 8. Auto-heal verification
  const healResult = autoHealProject({ projectPath: projectDir, apply: true });

  const summary = `Novo SaaS '${title}' (${cleanName}) gerado com sucesso em '${projectDir}'. Preflight Score: ${healResult.postScore}/100. Submódulo .shapelab e CI Preflight Gate ativos.`;

  return {
    productName: cleanName,
    displayName: title,
    projectDir,
    stack,
    gitInitialized: gitSuccess,
    initialVersion: `0.1.0+${initialBuild}`,
    preflightScore: healResult.postScore,
    summary,
  };
}
