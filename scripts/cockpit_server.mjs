import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRAIN_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SHAPELAB_COCKPIT_PORT) || 3333;

const PLUGIN_MCP_DIR =
  process.env.SHAPELAB_PLUGIN_MCP_DIR ||
  path.join(os.homedir(), '.gemini', 'config', 'plugins', 'shapelab-os', 'mcp');

let autoHealProject = null;
let checkFleetTelemetry = null;
let semanticSearch = null;
let auditPreflight = null;
let scaffoldSaas = null;

async function initModules() {
  try {
    const autoHealMod = await import(pathToFileURL(path.join(PLUGIN_MCP_DIR, 'tools', 'auto_heal.mjs')).href);
    autoHealProject = autoHealMod.autoHealProject;
  } catch (e) {
    console.warn('[CockpitServer] Warning loading auto_heal:', e.message);
  }

  try {
    const fleetMod = await import(pathToFileURL(path.join(PLUGIN_MCP_DIR, 'tools', 'fleet_telemetry.mjs')).href);
    checkFleetTelemetry = fleetMod.checkFleetTelemetry;
  } catch (e) {
    console.warn('[CockpitServer] Warning loading fleet_telemetry:', e.message);
  }

  try {
    const searchMod = await import(pathToFileURL(path.join(PLUGIN_MCP_DIR, 'tools', 'semantic_search.mjs')).href);
    semanticSearch = searchMod.semanticSearch;
  } catch (e) {
    console.warn('[CockpitServer] Warning loading semantic_search:', e.message);
  }

  try {
    const scaffoldMod = await import(pathToFileURL(path.join(PLUGIN_MCP_DIR, 'tools', 'scaffold_saas.mjs')).href);
    scaffoldSaas = scaffoldMod.scaffoldSaas;
  } catch (e) {
    console.warn('[CockpitServer] Warning loading scaffold_saas:', e.message);
  }

  try {
    const auditMod = await import(pathToFileURL(path.join(PLUGIN_MCP_DIR, 'ci_preflight_check.mjs')).href);
    auditPreflight = auditMod.auditPreflight;
  } catch (e) {
    console.warn('[CockpitServer] Warning loading auditPreflight:', e.message);
  }
}

function getGitHead(dir) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim().slice(0, 7);
  } catch {
    return 'unknown';
  }
}

function getBrainVersion() {
  try {
    return fs.readFileSync(path.join(BRAIN_ROOT, 'VERSION'), 'utf-8').trim();
  } catch {
    return '2.16.0';
  }
}

function getVaccines() {
  try {
    const matrixPath = path.join(BRAIN_ROOT, 'memory', 'PRODUCT_MATRIX.md');
    if (!fs.existsSync(matrixPath)) return [];
    const content = fs.readFileSync(matrixPath, 'utf-8');
    const rows = content.split(/\r?\n/).filter(l => l.startsWith('| `skills/'));
    return rows.map(row => {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      return {
        skill: cols[0]?.replace(/`/g, '') || '',
        'B2B-personal-ia': cols[1] || '',
        'ReformAI': cols[2] || '',
        'Smart-EV-Hub': cols[3] || '',
        'tattoo-saas': cols[4] || ''
      };
    });
  } catch {
    return [];
  }
}

function getProductInfo(id, relPath) {
  const prodPath = path.resolve(BRAIN_ROOT, '..', relPath);
  const exists = fs.existsSync(prodPath);
  if (!exists) {
    return {
      id,
      displayName: id,
      path: prodPath,
      exists: false,
      status: 'MISSING',
      appVersion: '0.0.0',
      shapelabVersion: '0.0.0',
      submoduleHead: 'unknown',
      inSyncWithCentralHead: false,
      auditScore: 0,
      checks: []
    };
  }

  const submodVersionPath = path.join(prodPath, '.shapelab', 'VERSION');
  const shapelabVersion = fs.existsSync(submodVersionPath)
    ? fs.readFileSync(submodVersionPath, 'utf-8').trim()
    : 'unknown';

  let submoduleHead = 'unknown';
  try {
    submoduleHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(prodPath, '.shapelab'), encoding: 'utf-8' }).trim().slice(0, 7);
  } catch {}

  const centralHead = getGitHead(BRAIN_ROOT);

  let appVersion = '1.0.0';
  const pubspecPath = path.join(prodPath, 'mobile', 'pubspec.yaml');
  const packageJsonPath = path.join(prodPath, 'package.json');
  const versionPyPath = path.join(prodPath, 'backend', 'version.py');

  if (fs.existsSync(pubspecPath)) {
    const pub = fs.readFileSync(pubspecPath, 'utf-8');
    const m = pub.match(/version:\s*([^\s+]+)/);
    if (m) appVersion = m[1];
  } else if (fs.existsSync(versionPyPath)) {
    const py = fs.readFileSync(versionPyPath, 'utf-8');
    const m = py.match(/__version__\s*=\s*['"]([^'"]+)['"]/);
    if (m) appVersion = m[1];
  } else if (fs.existsSync(packageJsonPath)) {
    try {
      appVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')).version || appVersion;
    } catch {}
  }

  let auditScore = 100;
  let checks = [];
  if (auditPreflight) {
    try {
      const report = auditPreflight({ projectPath: prodPath });
      auditScore = report.score ?? 100;
      checks = report.checks || [];
    } catch {}
  }

  return {
    id,
    displayName: id === 'B2B-personal-ia' ? 'Mr. Coach (B2B)' : id,
    path: prodPath,
    exists: true,
    status: submoduleHead === centralHead ? 'OK' : 'PENDING_SYNC',
    appVersion,
    shapelabVersion,
    submoduleHead,
    inSyncWithCentralHead: submoduleHead === centralHead,
    auditScore,
    checks
  };
}

function getFullCockpitData() {
  const centralHead = getGitHead(BRAIN_ROOT);
  const centralVersion = getBrainVersion();
  const products = [
    getProductInfo('B2B-personal-ia', 'B2B-personal-ia'),
    getProductInfo('ReformAI', 'ReformAI'),
    getProductInfo('Smart-EV-Hub', 'Smart-EV-Hub')
  ];

  const vaccines = getVaccines();

  return {
    brain: {
      root: BRAIN_ROOT,
      version: centralVersion,
      head: centralHead,
      totalSkills: 10
    },
    centralVersion,
    centralHead,
    totalSkills: 10,
    products,
    vaccines,
    hostMode: `LIVE SERVER (localhost:${PORT})`,
    generatedAt: new Date().toISOString()
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost:' + PORT}`);

  const sendJson = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
  };

  const readBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });

  try {
    if (url.pathname === '/' || url.pathname === '/cockpit') {
      const templatePath = path.join(__dirname, 'cockpit_app.html');
      if (!fs.existsSync(templatePath)) {
        res.writeHead(404);
        res.end('cockpit_app.html not found');
        return;
      }
      let html = fs.readFileSync(templatePath, 'utf-8');
      const liveData = getFullCockpitData();
      const injection = `<script id="shapelab-live-data">window.__SHAPELAB_COCKPIT_DATA__ = ${JSON.stringify(liveData)};</script>`;
      html = html.replace('</head>', `${injection}\n</head>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (url.pathname === '/api/status') {
      sendJson({
        online: true,
        version: getBrainVersion(),
        centralHead: getGitHead(BRAIN_ROOT),
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === '/api/data') {
      sendJson(getFullCockpitData());
      return;
    }

    if (url.pathname === '/api/sync' && req.method === 'POST') {
      const body = await readBody();
      const targetProd = body.product || 'ALL';
      const results = [];
      const prodsToSync = targetProd === 'ALL'
        ? ['B2B-personal-ia', 'ReformAI', 'Smart-EV-Hub']
        : [targetProd];

      const centralHead = getGitHead(BRAIN_ROOT);
      const centralSyncScript = path.join(BRAIN_ROOT, 'scripts', 'brain_sync.ps1');
      for (const pid of prodsToSync) {
        const prodDir = path.resolve(BRAIN_ROOT, '..', pid);
        const submodDir = path.join(prodDir, '.shapelab');
        if (fs.existsSync(submodDir)) {
          try {
            execFileSync('git', ['fetch', 'origin', 'main'], { cwd: submodDir, encoding: 'utf-8' });
            execFileSync('git', ['checkout', centralHead], { cwd: submodDir, encoding: 'utf-8' });
            if (fs.existsSync(centralSyncScript)) {
              const destSyncDir = path.join(prodDir, 'scripts');
              fs.mkdirSync(destSyncDir, { recursive: true });
              fs.copyFileSync(centralSyncScript, path.join(destSyncDir, 'brain_sync.ps1'));
            }
            execFileSync('git', ['add', '.shapelab', 'scripts/brain_sync.ps1'], { cwd: prodDir, encoding: 'utf-8' });
            try {
              execFileSync('git', ['commit', '-m', `chore(shapelab): sync submodule to ${centralHead} [skip ci]`], { cwd: prodDir, encoding: 'utf-8' });
            } catch {}
            results.push({ product: pid, status: 'SYNCED', head: centralHead });
          } catch (e) {
            results.push({ product: pid, status: 'ERROR', error: e.message });
          }
        }
      }
      sendJson({ success: true, results, liveData: getFullCockpitData() });
      return;
    }

    if (url.pathname === '/api/auto-heal' && req.method === 'POST') {
      const body = await readBody();
      const pid = body.projectId || 'B2B-personal-ia';
      const prodDir = path.resolve(BRAIN_ROOT, '..', pid);
      if (autoHealProject) {
        const healResult = autoHealProject({
          projectPath: prodDir,
          apply: body.apply !== false,
          rules: Array.isArray(body.rules) ? body.rules : null,
          vaccineType: body.vaccineType || null
        });
        sendJson({ success: !healResult?.error, healResult, liveData: getFullCockpitData() });
      } else {
        sendJson({ success: false, message: 'autoHealProject module not loaded' }, 500);
      }
      return;
    }

    if (url.pathname === '/api/scaffold' && req.method === 'POST') {
      const body = await readBody();
      if (scaffoldSaas) {
        const result = scaffoldSaas({
          productName: body.productName,
          displayName: body.displayName,
          description: body.description,
          stack: body.stack || 'flutter-fastapi',
          dryRun: body.dryRun !== false
        });
        sendJson({ success: !result?.error, result });
      } else {
        sendJson({ success: false, message: 'scaffoldSaas module not loaded' }, 500);
      }
      return;
    }

    if (url.pathname === '/api/telemetry' && (req.method === 'GET' || req.method === 'POST')) {
      if (checkFleetTelemetry) {
        const report = await checkFleetTelemetry({});
        sendJson({
          success: true,
          report: {
            ...report,
            normalizedTargets: report.targets
          }
        });
      } else {
        sendJson({ success: false, message: 'checkFleetTelemetry module not loaded' }, 500);
      }
      return;
    }

    if (url.pathname === '/api/semantic-search' && req.method === 'POST') {
      const body = await readBody();
      const query = body.query || 'anti takeover';
      if (semanticSearch) {
        const results = semanticSearch({ query, topK: 5, minScore: 0.1 });
        sendJson({ success: true, query, results });
      } else {
        sendJson({ success: false, message: 'semanticSearch module not loaded' }, 500);
      }
      return;
    }

    if (url.pathname === '/api/audit' && req.method === 'POST') {
      const body = await readBody();
      const pid = body.projectId || 'ALL';
      if (!auditPreflight) {
        sendJson({ success: false, message: 'auditPreflight module not loaded' }, 500);
        return;
      }
      if (pid === 'ALL') {
        const reports = ['B2B-personal-ia', 'ReformAI', 'Smart-EV-Hub'].map((id) => ({
          projectId: id,
          report: auditPreflight({ projectPath: path.resolve(BRAIN_ROOT, '..', id) })
        }));
        sendJson({ success: true, projectId: 'ALL', reports, liveData: getFullCockpitData() });
      } else {
        const prodDir = path.resolve(BRAIN_ROOT, '..', pid);
        const report = auditPreflight({ projectPath: prodDir });
        sendJson({ success: true, projectId: pid, report, liveData: getFullCockpitData() });
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (err) {
    sendJson({ success: false, error: err.message }, 500);
  }
});

await initModules();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 ShapeLab Founder Cockpit Live API Server`);
  console.log(`URL Local: http://localhost:${PORT}/`);
  console.log(`Endpoints: /api/status, /api/data, /api/sync, /api/auto-heal, /api/scaffold, /api/telemetry, /api/semantic-search, /api/audit`);
  console.log(`Brain Root: ${BRAIN_ROOT} (${getBrainVersion()} @ ${getGitHead(BRAIN_ROOT)})`);
  console.log(`======================================================\n`);
});
