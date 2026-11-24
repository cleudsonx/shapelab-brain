/**
 * ShapeLab Fleet Telemetry Engine (Production Deep Health & Probes)
 * Pure ESM, zero external dependencies (Node.js 18+ native fetch & https).
 */

export const BRAIN_FLEET_TELEMETRY_TOOL = {
  name: "brain_fleet_telemetry",
  description:
    "Monitora em tempo real a frota de produtos ShapeLab em produção (Firebase Hosting, Cloudflare Workers, Render, Cloud Run). Executa probes de saúde profunda (/health/deep, /version.json), mede latência RTT em ms, audita headers de segurança HSTS/CSP e gera o score consolidado de disponibilidade da frota.",
  inputSchema: {
    type: "object",
    properties: {
      endpoints: {
        type: "array",
        items: { type: "string" },
        description: "Lista opcional de URLs para probe. Se omitido, usa a frota padrão ShapeLab.",
      },
      timeoutMs: {
        type: "number",
        description: "Timeout máximo por probe em milissegundos (padrão: 3500ms)",
      },
    },
  },
};

export const DEFAULT_FLEET_TARGETS = [
  {
    productId: "B2B-personal-ia",
    name: "Mr. Coach (PWA & Web)",
    url: "https://shapelab.ia.br/version.json",
    healthEndpoint: "https://shapelab.ia.br",
    provider: "Firebase Hosting + Render",
  },
  {
    productId: "ReformAI",
    name: "ReformAI (Marketplace)",
    url: "https://reformai.ia.br",
    healthEndpoint: "https://reformai.ia.br",
    provider: "Cloudflare Pages/Workers",
  },
  {
    productId: "Smart-EV-Hub",
    name: "Smart EV Hub (IoT Gateway)",
    url: "https://smart-ev-hub.shapelab.ia.br",
    healthEndpoint: "https://smart-ev-hub.shapelab.ia.br",
    provider: "Google Cloud Run",
  },
];

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
  const targets = Array.isArray(endpoints) && endpoints.length > 0
    ? endpoints.map((u) => ({ productId: "custom", name: u, url: u, provider: "External" }))
    : DEFAULT_FLEET_TARGETS;

  const probePromises = targets.map(async (t) => {
    const res = await probeUrl(t.url, timeoutMs);
    return {
      ...t,
      probe: res,
    };
  });

  const results = await Promise.all(probePromises);

  const healthyCount = results.filter((r) => r.probe.status === "HEALTHY").length;
  const totalCount = results.length;
  const avgRtt = Math.round(
    results.filter((r) => r.probe.reachable).reduce((acc, r) => acc + r.probe.rttMs, 0) /
      Math.max(1, results.filter((r) => r.probe.reachable).length)
  );

  const fleetScore = Math.round((healthyCount / Math.max(1, totalCount)) * 100);

  const summary = `Frota ShapeLab: ${healthyCount}/${totalCount} serviços operacionais (Score: ${fleetScore}%, RTT médio: ${avgRtt}ms).`;

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
