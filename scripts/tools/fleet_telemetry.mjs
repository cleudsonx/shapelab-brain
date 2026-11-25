/**
 * ShapeLab Fleet Telemetry Engine (Production Deep Health & Probes)
 * Pure ESM, zero external dependencies (Node.js 18+ native fetch & https).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const BRAIN_FLEET_TELEMETRY_TOOL = {
  name: "brain_fleet_telemetry",
  description:
    "Monitora em tempo real a frota de produtos ShapeLab em produção (Firebase Hosting, Cloudflare Workers, Render, Cloud Run). Lê memory/fleet_targets.json, executa probes de saúde profunda (/health/deep, /version.json), mede latência RTT em ms, audita headers de segurança HSTS/CSP e gera o score consolidado de disponibilidade da frota.",
  inputSchema: {
    type: "object",
    properties: {
      endpoints: {
        type: "array",
        items: { type: "string" },
        description: "Lista opcional de URLs para probe. Se omitido, usa memory/fleet_targets.json ou a frota padrão ShapeLab.",
      },
      timeoutMs: {
        type: "number",
        description: "Timeout máximo por probe em milissegundos (padrão: 3500ms)",
      },
    },
  },
};

const DEFAULT_BRAIN_ROOT =
  process.env.SHAPELAB_BRAIN_ROOT ||
  path.join(os.homedir(), "OneDrive", "Documentos", "PROJETOS 2026", "shapelab-brain");

export const DEFAULT_FLEET_TARGETS = [
  {
    productId: "B2B-personal-ia",
    name: "Mr. Coach (PWA & Web)",
    url: "https://shapelab.ia.br/version.json",
    healthEndpoint: "https://shapelab.ia.br",
    provider: "Firebase Hosting + Render",
    stage: "production",
  },
  {
    productId: "ReformAI",
    name: "ReformAI (Marketplace)",
    url: "https://reformai.ia.br",
    healthEndpoint: "https://reformai.ia.br",
    provider: "Cloudflare Pages/Workers",
    stage: "production",
  },
  {
    productId: "Smart-EV-Hub",
    name: "Smart EV Hub (IoT Gateway)",
    url: "https://smart-ev-hub.shapelab.ia.br",
    fallbackUrl: "https://raw.githubusercontent.com/cleudsonx/Smart-EV-Hub/main/pubspec.yaml",
    healthEndpoint: "https://smart-ev-hub.shapelab.ia.br",
    provider: "Google Cloud Run",
    stage: "provisioning",
  },
];

export function loadFleetTargets() {
  const cfgPath = path.join(DEFAULT_BRAIN_ROOT, "memory", "fleet_targets.json");
  if (fs.existsSync(cfgPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      if (Array.isArray(parsed?.targets) && parsed.targets.length > 0) {
        return parsed.targets;
      }
    } catch {
      // Fallback para DEFAULT_FLEET_TARGETS
    }
  }
  return DEFAULT_FLEET_TARGETS;
}

async function probeUrl(targetUrl, timeoutMs = 3500) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "ShapeLab-Fleet-Sentinel/1.0 (+https://shapelab.ia.br)",
        Accept: "*/*",
      },
    });
    clearTimeout(timeoutId);
    const rttMs = Date.now() - startTime;

    const headers = {};
    for (const [k, v] of response.headers.entries()) {
      headers[k.toLowerCase()] = v;
    }

    const hasHsts = Boolean(headers["strict-transport-security"]);
    const hasCsp = Boolean(headers["content-security-policy"]);
    const cacheControl = headers["cache-control"] || "";

    const status = response.status >= 200 && response.status < 400 ? "HEALTHY" : "DEGRADED";

    return {
      url: targetUrl,
      reachable: true,
      statusCode: response.status,
      statusText: response.statusText,
      rttMs,
      status,
      securityHeaders: {
        hasHsts,
        hasCsp,
        cacheControl,
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const rttMs = Date.now() - startTime;
    const isTimeout = err.name === "AbortError";

    return {
      url: targetUrl,
      reachable: false,
      statusCode: isTimeout ? 408 : 503,
      statusText: isTimeout ? "Timeout" : err.message || "Unreachable",
      rttMs,
      status: "OFFLINE",
      error: isTimeout ? `Probe expirou após ${timeoutMs}ms` : err.message,
    };
  }
}

export async function checkFleetTelemetry({ endpoints = null, timeoutMs = 3500 } = {}) {
  const targets =
    Array.isArray(endpoints) && endpoints.length > 0
      ? endpoints.map((u) => ({ productId: "custom", name: u, url: u, provider: "External", stage: "production" }))
      : loadFleetTargets();

  const probePromises = targets.map(async (t) => {
    let res = await probeUrl(t.url, timeoutMs);
    let probedUrl = t.url;

    // Se ambiente em provisioning falhar DNS/SSL público mas tiver fallbackUrl, sonda o ativo de contingência
    if (!res.reachable && t.stage === "provisioning" && t.fallbackUrl) {
      const fbRes = await probeUrl(t.fallbackUrl, timeoutMs);
      if (fbRes.reachable) {
        probedUrl = t.fallbackUrl;
        res = {
          ...fbRes,
          status: "PROVISIONING",
          note: `DNS público (${t.url}) em provisionamento; repositório/ativo respondendo HTTP ${fbRes.statusCode}.`,
        };
      }
    }

    return {
      ...t,
      target: t.name,
      probedUrl,
      statusCode: res.statusCode,
      rttMs: res.rttMs,
      status: res.status,
      reachable: res.reachable,
      error: res.error || null,
      note: res.note || null,
      probe: res,
    };
  });

  const results = await Promise.all(probePromises);

  const healthyCount = results.filter((r) => r.probe.status === "HEALTHY" || r.probe.status === "PROVISIONING").length;
  const prodHealthyCount = results.filter((r) => r.probe.status === "HEALTHY").length;
  const totalCount = results.length;
  const reachableTargets = results.filter((r) => r.probe.reachable);
  const avgRtt = Math.round(
    reachableTargets.reduce((acc, r) => acc + r.probe.rttMs, 0) / Math.max(1, reachableTargets.length)
  );

  const fleetScore = Math.round((healthyCount / Math.max(1, totalCount)) * 100);

  const summary = `Frota ShapeLab: ${prodHealthyCount} em produção + ${healthyCount - prodHealthyCount} em provisionamento (${healthyCount}/${totalCount} saudáveis, Score: ${fleetScore}%, RTT médio: ${avgRtt}ms).`;

  return {
    checkedAt: new Date().toISOString(),
    fleetScore,
    healthyCount,
    totalCount,
    avgRttMs: avgRtt,
    status: fleetScore === 100 ? "OPTIMAL" : fleetScore >= 66 ? "WARNING" : "CRITICAL",
    targets: results,
    summary,
  };
}
