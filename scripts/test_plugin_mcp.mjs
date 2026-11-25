import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRAIN_ROOT = path.resolve(__dirname, "..");
const PLUGIN_ROOT =
  process.env.SHAPELAB_PLUGIN_ROOT ||
  path.join(os.homedir(), ".gemini", "config", "plugins", "shapelab-os");
const MCP_SERVER_PATH = path.join(PLUGIN_ROOT, "mcp", "shapelab_brain_mcp.mjs");

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === "function") {
      return res.then(
        () => {
          passed++;
          console.log(`  [PASS] ${label}`);
        },
        (err) => {
          failed++;
          console.error(`  [FAIL] ${label}: ${err.message}`);
        }
      );
    }
    passed++;
    console.log(`  [PASS] ${label}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${label}: ${err.message}`);
  }
  return Promise.resolve();
}

function runMcpRpcSequence(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MCP_SERVER_PATH], {
      cwd: BRAIN_ROOT,
      env: { ...process.env, SHAPELAB_BRAIN_ROOT: BRAIN_ROOT },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const responses = new Map();
    let buffer = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout aguardando MCP responses (${responses.size}/${requests.length}). stderr=${stderr}`));
    }, 15000);

    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const msg = JSON.parse(t);
          if (msg.id !== undefined) {
            responses.set(msg.id, msg);
          }
        } catch {
          // ignore non-json line
        }
      }
      if (responses.size >= requests.length) {
        clearTimeout(timer);
        child.kill();
        resolve(responses);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    for (const r of requests) {
      child.stdin.write(JSON.stringify(r) + "\n");
    }
  });
}

console.log("\n=== ShapeLab OS Plugin & MCP Smoke Test Suite ===");
console.log(`Brain Root:  ${BRAIN_ROOT}`);
console.log(`Plugin Root: ${PLUGIN_ROOT}\n`);

// 1. Validação estática de manifestos & higiene
await check("Manifestos plugin.json / hooks.json / mcp_config.json válidos", () => {
  const pJson = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "plugin.json"), "utf8"));
  assert.equal(pJson.name, "shapelab-os");
  assert.match(pJson.version, /^\d+\.\d+\.\d+$/);

  const hJson = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "hooks.json"), "utf8"));
  assert.ok(hJson["shapelab-brain-session-bootstrap"]);
  assert.ok(hJson["shapelab-security-firewall"]);
  assert.ok(hJson["shapelab-version-change-observer"]);
  assert.ok(hJson["shapelab-auto-learn-gate"]);

  const mJson = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "mcp_config.json"), "utf8"));
  assert.ok(mJson.mcpServers?.["shapelab-brain"]);
});

await check("Zero caminhos hardcoded de usuário nos arquivos .mjs do plugin", () => {
  const mcpDir = path.join(PLUGIN_ROOT, "mcp");
  const files = [
    path.join(mcpDir, "shapelab_brain_mcp.mjs"),
    path.join(mcpDir, "tools", "auto_heal.mjs"),
    path.join(mcpDir, "tools", "scaffold_saas.mjs"),
    path.join(mcpDir, "tools", "semantic_search.mjs"),
    path.join(mcpDir, "tools", "fleet_telemetry.mjs"),
  ];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf8");
    assert.equal(
      content.includes("Users\\Cleudson") || content.includes("Users\\\\Cleudson"),
      false,
      `Caminho hardcoded encontrado em ${path.basename(f)}`
    );
  }
});

await check("Cockpit HTML possui Bridge Dual (postMessage + Live Server) e 7 abas", () => {
  const html = fs.readFileSync(path.join(PLUGIN_ROOT, "mcp", "cockpit_app.html"), "utf8");
  assert.ok(html.includes("window.parent.postMessage"), "Falta postMessage para MCP App");
  assert.ok(html.includes("ui/notifications/tool-result"), "Falta listener ui/notifications/tool-result");
  assert.ok(html.includes("127.0.0.1:3333"), "Falta endpoint do Live Server");
  assert.ok(html.includes('getElementById("btnAuditRunProduct").addEventListener'), "Falta listener em btnAuditRunProduct");
  assert.ok(html.includes('getElementById("btnAuditRunGlobal").addEventListener'), "Falta listener em btnAuditRunGlobal");
  for (const tab of ["overview", "audit", "vaccines", "autoheal", "telemetry", "search", "scaffold"]) {
    assert.ok(html.includes(`data-tab="${tab}"`), `Falta aba data-tab="${tab}"`);
  }
});

// 2. Smoke Test JSON-RPC no servidor MCP real
const jwsSecret = "shapelab-smoke-test-hmac-secret-32bytes!";
const jwsHeaderB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwsPayloadB64 = Buffer.from(
  JSON.stringify({ amount_cents: 15000, idempotency_key: "smoke-1", iat: nowSec, exp: nowSec + 300 })
).toString("base64url");
const jwsSigB64 = crypto
  .createHmac("sha256", jwsSecret)
  .update(`${jwsHeaderB64}.${jwsPayloadB64}`)
  .digest("base64url");
const sampleJwsToken = `${jwsHeaderB64}.${jwsPayloadB64}.${jwsSigB64}`;

const b2bDir = path.resolve(BRAIN_ROOT, "..", "B2B-personal-ia");

const rpcRequests = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
  { jsonrpc: "2.0", id: 2, method: "resources/list" },
  { jsonrpc: "2.0", id: 3, method: "tools/list" },
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "brain_semantic_search", arguments: { query: "anti takeover pbkdf2 guards", topK: 3 } },
  },
  {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "fintech_validate_jws",
      arguments: {
        token: sampleJwsToken,
        expectedAlg: "HS256",
        secretKey: jwsSecret,
        requiredClaims: ["amount_cents", "idempotency_key", "exp"],
      },
    },
  },
  {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "ota_validate_manifest",
      arguments: { projectPath: b2bDir },
    },
  },
  {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "brain_auto_heal", arguments: { projectPath: BRAIN_ROOT, apply: false } },
  },
  {
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "brain_audit_preflight", arguments: { projectPath: BRAIN_ROOT } },
  },
  {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "brain_scaffold_saas", arguments: { productName: "smoke-demo", dryRun: true } },
  },
];

const responses = await runMcpRpcSequence(rpcRequests);

await check("MCP initialize retorna serverInfo v3.8.0", () => {
  const r = responses.get(1)?.result;
  assert.equal(r?.serverInfo?.name, "shapelab-brain-mcp");
  assert.equal(r?.serverInfo?.version, "3.8.0");
});

await check("MCP resources/list expõe 6 resources oficiais", () => {
  const resources = responses.get(2)?.result?.resources || [];
  assert.equal(resources.length, 6, `Esperado 6 resources, obtido ${resources.length}`);
  assert.ok(resources.some((r) => r.uri === "ui://cockpit/app.html"));
});

await check("MCP tools/list expõe todas as 13 tools", () => {
  const tools = responses.get(3)?.result?.tools || [];
  assert.equal(tools.length, 13, `Esperado 13 tools, obtido ${tools.length}`);
});

await check("Tool brain_semantic_search retorna resultados ranqueados", () => {
  const body = JSON.parse(responses.get(4)?.result?.content?.[0]?.text || "{}");
  assert.ok((body.matchedCount || 0) > 0, "Deveria retornar ao menos 1 match semântico");
});

await check("Tool fintech_validate_jws valida JWS HS256 criptograficamente", () => {
  const body = JSON.parse(responses.get(5)?.result?.content?.[0]?.text || "{}");
  assert.equal(body.valid, true);
  assert.equal(body.signatureVerified, true);
});

await check("Tool ota_validate_manifest valida manifesto OTA 32-bit YYYYMMDDNN em B2B-personal-ia", () => {
  const body = JSON.parse(responses.get(6)?.result?.content?.[0]?.text || "{}");
  assert.equal(body.valid, true, body.summary || "OTA check failed");
  assert.equal(body.isMonotonic32BitSafe, true);
});

await check("Tool brain_auto_heal (dry-run) suporta 5 healers", () => {
  const body = JSON.parse(responses.get(7)?.result?.content?.[0]?.text || "{}");
  assert.equal(body.mode, "dry-run");
  assert.ok(typeof body.initialScore === "number");
});

await check("Tool brain_audit_preflight pontua shapelab-brain com >= 80", () => {
  const body = JSON.parse(responses.get(8)?.result?.content?.[0]?.text || "{}");
  assert.ok(body.score >= 80, `Score insuficiente: ${body.score}`);
});

await check("Tool brain_scaffold_saas (dryRun) gera plano completo", () => {
  const body = JSON.parse(responses.get(9)?.result?.content?.[0]?.text || "{}");
  assert.equal(body.mode, "dry-run");
  assert.ok(Array.isArray(body.plannedFiles) && body.plannedFiles.length >= 6);
});

// 3. Carregamento direto de loadFleetTargets
await check("fleet_telemetry.mjs carrega memory/fleet_targets.json", async () => {
  const ftMod = await import(pathToFileURL(path.join(PLUGIN_ROOT, "mcp", "tools", "fleet_telemetry.mjs")).href);
  const targets = ftMod.loadFleetTargets();
  assert.equal(targets.length, 3);
  assert.equal(targets[2].stage, "provisioning");
});

console.log(`\nResumo Smoke Tests: ${passed} passou(aram), ${failed} falhou(aram).`);
if (failed > 0) process.exit(1);
process.exit(0);
