/**
 * ShapeLab Semantic Search Engine (Hybrid BM25+ & Cosine Vector Space with RRF)
 * Pure ESM, zero external dependencies (node:fs, node:path, node:crypto).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const BRAIN_SEMANTIC_SEARCH_TOOL = {
  name: "brain_semantic_search",
  description:
    "Busca semântica híbrida (BM25+ ponderado por campos + TF-IDF Cosine Similarity + Expansão de Sinônimos ShapeLab + RRF) no repositório shapelab-brain (.shapelab). Permite consultar conceitos em linguagem natural (PT ou EN), recuperando chunks cirúrgicos de skills, lições aprendidas, ADRs e constituição com economia de tokens.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Consulta conceitual ou termos em linguagem natural (ex: 'como evitar repetição em webhooks de pagamento', 'regras de contraste visual e cores', 'passkeys webauthn signcount')",
      },
      topK: {
        type: "number",
        description: "Número máximo de chunks retornados (padrão: 5, máximo: 15)",
      },
      category: {
        type: "string",
        description:
          "Filtro opcional por categoria (ex: 'payments', 'security', 'backend', 'sre', 'devops', 'ui', 'brand', 'growth', 'memory', 'constitution')",
      },
      docType: {
        type: "string",
        description:
          "Filtro opcional por tipo de documento (ex: 'skill', 'lesson', 'constitution', 'adr', 'matrix', 'radar', 'protocol')",
      },
      minScore: {
        type: "number",
        description: "Pontuação mínima de relevância normalizada 0.0 a 1.0 (padrão: 0.15)",
      },
      fullText: {
        type: "boolean",
        description:
          "Se true, retorna o texto do chunk na íntegra. Se false (padrão), retorna snippet conciso com breadcrumbs e link para arquivo#Lstart-Lend.",
      },
      workspacePath: {
        type: "string",
        description: "Caminho opcional do produto para priorizar .shapelab local",
      },
      includeTemplates: {
        type: "boolean",
        description: "Se true, inclui templates de PRD/Skills na busca (padrão: false)",
      },
    },
    required: ["query"],
  },
};

const DEFAULT_BRAIN_ROOT =
  process.env.SHAPELAB_BRAIN_ROOT ||
  path.join(os.homedir(), "OneDrive", "Documentos", "PROJETOS 2026", "shapelab-brain");

const BLACKLIST_FILES = new Set([
  "shapelab_brain_blueprint.md",
  "CHANGELOG.md",
  "README.md",
]);

const STOPWORDS_PT = new Set([
  "a", "ao", "aos", "as", "ate", "com", "como", "da", "das", "de", "dela", "dele",
  "deles", "delas", "depois", "do", "dos", "e", "ela", "ele", "eles", "elas", "em",
  "entre", "era", "eram", "essa", "esse", "esta", "este", "estao", "eu", "foi",
  "foram", "ha", "isso", "isto", "ja", "la", "lhe", "lhes", "lo", "mas", "me",
  "mesmo", "meu", "minha", "muito", "na", "nas", "nem", "no", "nos", "nossa",
  "nosso", "num", "numa", "o", "os", "ou", "para", "pela", "pelas", "pelo", "pelos",
  "por", "qual", "quando", "que", "quem", "se", "ser", "seu", "seus", "so",
  "sobre", "somos", "sua", "suas", "tambem", "te", "tem", "ter", "teu", "tua", "um",
  "uma", "umas", "uns", "vai", "vao", "voce", "voces", "vos"
]);

const STOPWORDS_EN = new Set([
  "a", "about", "above", "after", "again", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between",
  "both", "but", "by", "can", "could", "did", "do", "does", "doing", "down",
  "during", "each", "few", "for", "from", "further", "had", "has", "have",
  "having", "he", "her", "here", "hers", "herself", "him", "himself", "his",
  "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me",
  "more", "most", "my", "myself", "now", "of", "off", "on",
  "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over",
  "own", "same", "she", "should", "so", "some", "such", "than", "that", "the",
  "their", "theirs", "them", "themselves", "then", "there", "these", "they",
  "this", "those", "through", "to", "too", "under", "until", "up", "very",
  "was", "we", "were", "what", "when", "where", "which", "while", "who",
  "whom", "why", "will", "with", "would", "you", "your", "yours", "yourself"
]);

const ALLOWED_SHORT_TERMS = new Set([
  "id", "ip", "db", "ci", "cd", "ui", "ux", "qa", "os", "js", "ts", "s3",
  "v1", "v2", "v3", "l3", "wa", "rl", "gc", "4g", "pi", "r", "s", "rls", "jwt",
  "jws", "ota", "pwa", "bcb", "worm", "mcp"
]);

const SYNONYM_MAP = new Map([
  ["passkey", ["webauthn", "cbor", "cose", "signcount", "fido2", "biometria"]],
  ["passkeys", ["webauthn", "cbor", "cose", "signcount", "fido2", "biometria"]],
  ["webauthn", ["passkey", "cbor", "cose", "signcount", "fido2"]],
  ["double-spend", ["idempotencia", "durable lease", "for update", "event_id", "concorrencia"]],
  ["duplicidade", ["idempotencia", "durable lease", "for update", "double-spend"]],
  ["concorrencia", ["for update", "lock", "durable lease", "idempotencia"]],
  ["repeticao", ["idempotencia", "idempotency_key", "event_id", "replay"]],
  ["replay", ["idempotency_key", "idempotencia", "nonce", "timestamp"]],
  ["webhook", ["idempotency_key", "asaas", "meta cloud", "evolution", "assinatura", "jws"]],
  ["tela-branca", ["initassetcacheguard", "ota", "cache-busting", "version.json"]],
  ["cache", ["cache-busting", "initassetcacheguard", "version.json", "no-store"]],
  ["erro-500", ["sanitizacao", "correlation_id", "redact", "crash shield", "deep health"]],
  ["vazamento", ["sanitizacao", "correlation_id", "redact", "segredo", "api_key"]],
  ["split", ["asaas", "bcb4893", "worm", "jws", "transacao"]],
  ["pagamento", ["asaas", "split", "bcb4893", "worm", "jws", "pix"]],
  ["pix", ["asaas", "split", "bcb4893", "worm", "jws"]],
  ["multi-tenant", ["rls", "tenant_id", "service_role", "security definer", "supabase"]],
  ["tenant", ["rls", "tenant_id", "service_role", "supabase"]],
  ["desligamento", ["graceful shutdown", "draining", "cloud run", "southamerica-east1", "sigterm"]],
  ["contraste", ["wcag", "dual-theme", "prism s neon", "colorscheme", "10b981", "06b6d4"]],
  ["cores", ["wcag", "prism s neon", "dual-theme", "colorscheme"]],
  ["dark-mode", ["dual-theme", "wcag", "prism s neon", "090d16"]],
]);

function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function tokenize(text, { expandSynonyms = false } = {}) {
  if (!text || typeof text !== "string") return [];
  const normalized = normalizeText(text);

  // Preserve tech codes before punctuation strip
  const rawWords = normalized
    .replace(/[`*_~#|>[\]()]/g, " ")
    .replace(/[.,:;!?&="']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const tokens = [];

  for (const raw of rawWords) {
    if (raw.length === 1 && !ALLOWED_SHORT_TERMS.has(raw)) continue;

    // Check if it's an intact composite token
    const isComposite = raw.includes("-") || raw.includes("_");
    if (isComposite) {
      tokens.push(raw);
      const parts = raw.split(/[-_]+/).filter(Boolean);
      for (const p of parts) {
        if (!STOPWORDS_PT.has(p) && !STOPWORDS_EN.has(p)) {
          if (p.length > 1 || ALLOWED_SHORT_TERMS.has(p)) tokens.push(p);
        }
      }
      continue;
    }

    // Split camelCase/numbers
    const subParts = raw
      .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
      .replace(/([0-9])([a-z])/g, "$1 $2")
      .split(/\s+/)
      .filter(Boolean);

    for (const sp of subParts) {
      if (STOPWORDS_PT.has(sp) || STOPWORDS_EN.has(sp)) continue;
      if (sp.length > 1 || ALLOWED_SHORT_TERMS.has(sp)) {
        tokens.push(sp);
      }
    }
  }

  if (expandSynonyms) {
    const expansions = [];
    for (const t of tokens) {
      if (SYNONYM_MAP.has(t)) {
        const syns = SYNONYM_MAP.get(t);
        for (const s of syns) {
          const sTokens = tokenize(s, { expandSynonyms: false });
          expansions.push(...sTokens);
        }
      }
    }
    tokens.push(...expansions);
  }

  return tokens;
}

function extractFrontmatter(content) {
  if (!content.startsWith("---")) return { frontmatter: {}, body: content };
  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) return { frontmatter: {}, body: content };

  const yamlBlock = content.slice(3, endIdx).trim();
  const body = content.slice(endIdx + 4).trimStart();
  const frontmatter = {};

  for (const line of yamlBlock.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      const key = line.slice(0, colon).trim();
      let val = line.slice(colon + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

function parseMarkdownChunks(relPath, content) {
  const { frontmatter, body } = extractFrontmatter(content);
  const lines = body.split(/\r?\n/);
  const chunks = [];

  const normPath = relPath.replace(/\\/g, "/");
  let category = "general";
  let docType = "general";
  let priorityTier = 2;
  let boostWeight = 1.0;

  if (normPath.startsWith("skills/")) {
    docType = "skill";
    priorityTier = 1;
    boostWeight = 1.4;
    const parts = normPath.split("/");
    if (parts.length > 2) category = parts[1];
  } else if (normPath === "CORE_CONSTITUTION.md") {
    docType = "constitution";
    category = "constitution";
    priorityTier = 1;
    boostWeight = 1.5;
  } else if (normPath.startsWith("memory/")) {
    priorityTier = normPath.includes("LESSONS_LEARNED") || normPath.includes("adrs/") ? 1 : 2;
    boostWeight = priorityTier === 1 ? 1.4 : 1.0;
    if (normPath.includes("LESSONS_LEARNED")) {
      docType = "lesson";
      category = "memory";
    } else if (normPath.includes("PRODUCT_MATRIX")) {
      docType = "matrix";
      category = "governance";
    } else if (normPath.includes("TECH_RADAR")) {
      docType = "radar";
      category = "tech";
    } else if (normPath.includes("BRAIN_EVOLUTION")) {
      docType = "protocol";
      category = "governance";
    } else if (normPath.startsWith("memory/adrs/")) {
      docType = "adr";
      category = "architecture";
    }
  } else if (normPath.startsWith("agents/")) {
    docType = "agent";
    category = "agent";
    priorityTier = 2;
    boostWeight = 1.0;
  } else if (normPath.startsWith("templates/")) {
    docType = "template";
    category = "template";
    priorityTier = 3;
    boostWeight = 0.6;
  } else if (normPath === "INDEX.md") {
    docType = "index";
    category = "navigation";
    priorityTier = 3;
    boostWeight = 0.6;
  }

  let docTitle = path.basename(relPath, ".md");
  let currentH1 = docTitle;
  let currentH2 = "";
  let currentH3 = "";
  let inCodeFence = false;
  let codeFenceChar = "";

  // Buffer for current chunk
  let currentLines = [];
  let chunkStartLine = 1;
  let currentSectionTitle = docTitle;

  function commitChunk(endLine) {
    if (currentLines.length === 0) return;
    const text = currentLines.join("\n").trim();
    if (!text || text.length < 50) {
      currentLines = [];
      return;
    }

    const headingPath = [currentH1];
    if (currentH2) headingPath.push(currentH2);
    if (currentH3 && currentH3 !== currentH2) headingPath.push(currentH3);

    // Extract domain IDs
    const domainIds = Array.from(
      new Set(
        (text.match(/\b(?:LL-\d{3}|ADR-\d{3}|BCB[- ]?4893|RFC[- ]?7515|LC[- ]?214|HTTP[- ]?\d{3})\b/gi) ||
          []
        ).map((d) => d.toUpperCase().replace(/\s+/g, "-"))
      )
    );

    // Code block detection
    const hasCodeBlock = /```|~~~/.test(text);
    const codeLanguages = [];
    const langRe = /(?:```|~~~)([a-zA-Z0-9_-]+)/g;
    let lm;
    while ((lm = langRe.exec(text)) !== null) {
      if (!codeLanguages.includes(lm[1].toLowerCase())) {
        codeLanguages.push(lm[1].toLowerCase());
      }
    }

    const chunkIdx = chunks.length;
    const anchorSlug = currentSectionTitle
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const chunkId = `${normPath}#${anchorSlug || "section"}#${chunkIdx}`;

    // Tags
    const tags = [
      category,
      docType,
      ...(frontmatter.id ? [frontmatter.id] : []),
      ...(frontmatter.stack ? frontmatter.stack.split(",").map((s) => s.trim().toLowerCase()) : []),
      ...domainIds.map((d) => d.toLowerCase()),
    ];

    chunks.push({
      chunkId,
      file: normPath,
      docType,
      category,
      priorityTier,
      boostWeight,
      docTitle: currentH1,
      sectionTitle: currentSectionTitle,
      headingPath,
      anchors: [anchorSlug],
      domainIds,
      tags,
      frontmatter,
      startLine: chunkStartLine,
      endLine,
      hasCodeBlock,
      codeLanguages,
      charCount: text.length,
      tokenEstimate: Math.ceil(text.length / 4),
      text,
    });

    currentLines = [];
  }

  // Handle special case: LESSONS_LEARNED.md table
  if (normPath.includes("LESSONS_LEARNED")) {
    let headerLines = [];
    let lineNum = 1;
    for (const line of lines) {
      if (line.startsWith("| ID") || line.startsWith("| :---")) {
        headerLines.push(line);
      } else if (line.startsWith("| `LL-")) {
        const rowText = `${headerLines.join("\n")}\n${line}`;
        const matchId = line.match(/`LL-\d{3}`/);
        const llId = matchId ? matchId[0].replace(/`/g, "") : "LL-ITEM";
        chunks.push({
          chunkId: `${normPath}#${llId.toLowerCase()}`,
          file: normPath,
          docType: "lesson",
          category: "memory",
          priorityTier: 1,
          boostWeight: 1.4,
          docTitle: "ShapeLab Lessons Learned",
          sectionTitle: `Lição Aprendida ${llId}`,
          headingPath: ["ShapeLab Lessons Learned", llId],
          anchors: [llId.toLowerCase()],
          domainIds: [llId],
          tags: ["memory", "lesson", llId.toLowerCase()],
          frontmatter: {},
          startLine: lineNum,
          endLine: lineNum,
          hasCodeBlock: false,
          codeLanguages: [],
          charCount: rowText.length,
          tokenEstimate: Math.ceil(rowText.length / 4),
          text: rowText,
        });
      }
      lineNum++;
    }
    return chunks;
  }

  // Standard Markdown Parser
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Check code fences
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fChar = fenceMatch[1][0];
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceChar = fChar;
      } else if (codeFenceChar === fChar) {
        inCodeFence = false;
        codeFenceChar = "";
      }
    }

    if (!inCodeFence) {
      // H1 Header
      if (trimmed.startsWith("# ")) {
        commitChunk(lineNum - 1);
        currentH1 = trimmed.slice(2).trim();
        currentH2 = "";
        currentH3 = "";
        currentSectionTitle = currentH1;
        chunkStartLine = lineNum;
        currentLines.push(line);
        continue;
      }

      // H2 Header
      if (trimmed.startsWith("## ")) {
        commitChunk(lineNum - 1);
        currentH2 = trimmed.slice(3).trim();
        currentH3 = "";
        currentSectionTitle = currentH2;
        chunkStartLine = lineNum;
        currentLines.push(line);
        continue;
      }

      // H3 Header - only split if current chunk is getting large
      if (trimmed.startsWith("### ")) {
        const curCharCount = currentLines.join("\n").length;
        if (curCharCount > 1200) {
          commitChunk(lineNum - 1);
          chunkStartLine = lineNum;
        }
        currentH3 = trimmed.slice(4).trim();
        currentSectionTitle = currentH3;
        currentLines.push(line);
        continue;
      }
    }

    currentLines.push(line);

    // Hard max chunk size limit
    if (currentLines.join("\n").length >= 3500 && !inCodeFence) {
      commitChunk(lineNum);
      chunkStartLine = lineNum + 1;
    }
  }

  commitChunk(lines.length);
  return chunks;
}

export function buildIndex(brainRoot, options = {}) {
  const root = path.resolve(brainRoot);
  const includeTemplates = !!options.includeTemplates;

  const targetDirs = ["skills", "memory", "agents"];
  if (includeTemplates) targetDirs.push("templates");

  const filesToIndex = [];

  // Root Markdown files
  const rootFiles = ["CORE_CONSTITUTION.md", "INDEX.md"];
  for (const rf of rootFiles) {
    const full = path.join(root, rf);
    if (fs.existsSync(full)) filesToIndex.push({ rel: rf, full });
  }

  // Recursive scan for targetDirs
  function scanDir(dirRel) {
    const dirFull = path.join(root, dirRel);
    if (!fs.existsSync(dirFull)) return;
    const entries = fs.readdirSync(dirFull, { withFileTypes: true });
    for (const ent of entries) {
      const rel = path.join(dirRel, ent.name);
      if (ent.isDirectory()) {
        scanDir(rel);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        if (!BLACKLIST_FILES.has(ent.name)) {
          filesToIndex.push({ rel, full: path.join(root, rel) });
        }
      }
    }
  }

  for (const td of targetDirs) scanDir(td);

  const allChunks = [];
  for (const { rel, full } of filesToIndex) {
    try {
      const content = fs.readFileSync(full, "utf8");
      const chunks = parseMarkdownChunks(rel, content);
      allChunks.push(...chunks);
    } catch (err) {
      // Ignore unreadable files
    }
  }

  // Pre-tokenize and calculate document statistics for BM25 and Vector Space
  const N = allChunks.length;
  const docFreq = new Map(); // term -> count of docs containing term
  let totalDocLen = 0;

  for (const chunk of allChunks) {
    // Searchable text with context prefix
    const contextText = `${chunk.docTitle} ${chunk.sectionTitle} ${chunk.tags.join(" ")} ${chunk.domainIds.join(" ")} ${chunk.text}`;
    const tokens = tokenize(contextText, { expandSynonyms: false });
    chunk._tokens = tokens;
    chunk._tokenCount = tokens.length;
    totalDocLen += tokens.length;

    // Title & Tags tokens for weighted boosting
    chunk._titleTokens = new Set(tokenize(`${chunk.docTitle} ${chunk.sectionTitle}`, { expandSynonyms: false }));
    chunk._tagTokens = new Set(tokenize(`${chunk.tags.join(" ")} ${chunk.domainIds.join(" ")}`, { expandSynonyms: false }));

    // Term frequencies in this chunk
    const tf = new Map();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    chunk._tf = tf;

    for (const term of tf.keys()) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  const avgDocLen = N > 0 ? totalDocLen / N : 1;

  // Compute IDF for BM25 and Vector TF-IDF
  const idfMap = new Map();
  for (const [term, df] of docFreq.entries()) {
    // Lucene / BM25 IDF: ln(1 + (N - df + 0.5) / (df + 0.5))
    const idf = Math.max(0.1, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
    idfMap.set(term, idf);
  }

  // Precompute vector norms for Cosine Similarity
  for (const chunk of allChunks) {
    let sumSq = 0;
    for (const [term, freq] of chunk._tf.entries()) {
      const idf = idfMap.get(term) || 0.1;
      const tfIdf = (1 + Math.log(freq)) * idf;
      sumSq += tfIdf * tfIdf;
    }
    chunk._vectorNorm = Math.sqrt(sumSq) || 1.0;
  }

  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    brainRoot: root,
    totalChunks: N,
    avgDocLen,
    docFreq: Object.fromEntries(docFreq),
    idf: Object.fromEntries(idfMap),
    chunks: allChunks,
  };
}

let cachedIndex = null;
let cachedIndexTime = 0;

export function getOrLoadIndex(brainRoot, options = {}) {
  const root = path.resolve(brainRoot || DEFAULT_BRAIN_ROOT);
  const indexPath = path.join(root, "memory", "semantic_index.json");

  // Check in-memory cache
  if (cachedIndex && cachedIndex.brainRoot === root && Date.now() - cachedIndexTime < 30_000) {
    return cachedIndex;
  }

  // Check persisted JSON file
  if (fs.existsSync(indexPath)) {
    try {
      const raw = fs.readFileSync(indexPath, "utf8");
      const loaded = JSON.parse(raw);
      if (loaded.chunks && Array.isArray(loaded.chunks) && loaded.chunks.length > 0) {
        // Hydrate Maps and Sets
        const N = loaded.chunks.length;
        const idfMap = new Map(Object.entries(loaded.idf || {}));

        for (const chunk of loaded.chunks) {
          chunk._titleTokens = new Set(tokenize(`${chunk.docTitle} ${chunk.sectionTitle}`, { expandSynonyms: false }));
          chunk._tagTokens = new Set(tokenize(`${chunk.tags.join(" ")} ${chunk.domainIds.join(" ")}`, { expandSynonyms: false }));
          chunk._tokens = tokenize(`${chunk.docTitle} ${chunk.sectionTitle} ${chunk.tags.join(" ")} ${chunk.text}`, { expandSynonyms: false });
          const tf = new Map();
          for (const t of chunk._tokens) tf.set(t, (tf.get(t) || 0) + 1);
          chunk._tf = tf;
          chunk._tokenCount = chunk._tokens.length;

          let sumSq = 0;
          for (const [term, freq] of tf.entries()) {
            const idf = idfMap.get(term) || 0.1;
            const tfIdf = (1 + Math.log(freq)) * idf;
            sumSq += tfIdf * tfIdf;
          }
          chunk._vectorNorm = Math.sqrt(sumSq) || 1.0;
        }

        loaded.idfMap = idfMap;
        cachedIndex = loaded;
        cachedIndexTime = Date.now();
        return loaded;
      }
    } catch (err) {
      // Fallback to building index on the fly
    }
  }

  // Build in-memory
  const built = buildIndex(root, options);
  built.idfMap = new Map(Object.entries(built.idf));
  cachedIndex = built;
  cachedIndexTime = Date.now();
  return built;
}

export function semanticSearch({
  query,
  topK = 5,
  category,
  docType,
  minScore = 0.15,
  fullText = false,
  workspacePath,
  includeTemplates = false,
} = {}) {
  if (!query || typeof query !== "string" || !query.trim()) {
    return { error: "Parâmetro 'query' obrigatório e não vazio." };
  }

  const effectiveTopK = Math.max(1, Math.min(15, Number(topK) || 5));
  const effectiveMinScore = Math.max(0.0, Math.min(1.0, Number(minScore) || 0.15));

  const root = workspacePath ? path.resolve(workspacePath) : DEFAULT_BRAIN_ROOT;
  const index = getOrLoadIndex(root, { includeTemplates });

  if (!index.chunks || index.chunks.length === 0) {
    return { query, totalResults: 0, results: [], summary: "Nenhum documento indexado encontrado." };
  }

  // Query tokenization with ShapeLab conceptual synonyms
  const queryTokens = tokenize(query, { expandSynonyms: true });
  if (queryTokens.length === 0) {
    return { query, totalResults: 0, results: [], summary: "Consulta sem termos significativos (apenas stopwords)." };
  }

  const queryTf = new Map();
  for (const t of queryTokens) {
    queryTf.set(t, (queryTf.get(t) || 0) + 1);
  }

  let queryVectorNormSq = 0;
  for (const [t, freq] of queryTf.entries()) {
    const idf = index.idfMap.get(t) || 0.1;
    const v = (1 + Math.log(freq)) * idf;
    queryVectorNormSq += v * v;
  }
  const queryVectorNorm = Math.sqrt(queryVectorNormSq) || 1.0;

  // BM25 parameters
  const k1 = 1.2;
  const b = 0.75;
  const avgDocLen = index.avgDocLen || 100;

  // Filter candidates
  const candidates = index.chunks.filter((c) => {
    if (category && c.category !== category) return false;
    if (docType && c.docType !== docType) return false;
    return true;
  });

  const scoredBM25 = [];
  const scoredCosine = [];

  for (let i = 0; i < candidates.length; i++) {
    const chunk = candidates[i];
    const docLen = chunk._tokenCount || 50;

    // 1. BM25 with field boosting
    let bm25Score = 0;
    let cosineDot = 0;

    for (const [qTerm, qFreq] of queryTf.entries()) {
      const idf = index.idfMap.get(qTerm) || 0.1;
      const termFreq = chunk._tf.get(qTerm) || 0;

      if (termFreq > 0) {
        // Field boost multiplier
        let fieldMultiplier = 1.0;
        if (chunk._titleTokens.has(qTerm)) fieldMultiplier += 2.0; // 3.0x total
        if (chunk._tagTokens.has(qTerm)) fieldMultiplier += 1.5;   // 2.5x total

        const numerator = termFreq * (k1 + 1);
        const denominator = termFreq + k1 * (1 - b + (b * docLen) / avgDocLen);
        bm25Score += idf * (numerator / denominator) * fieldMultiplier;

        // Cosine Vector Space
        const docV = (1 + Math.log(termFreq)) * idf;
        const qV = (1 + Math.log(qFreq)) * idf;
        cosineDot += docV * qV;
      }
    }

    // Apply Tier boost
    const finalBM25 = bm25Score * (chunk.boostWeight || 1.0);
    const cosineSim = (cosineDot / (chunk._vectorNorm * queryVectorNorm)) * (chunk.boostWeight || 1.0);

    scoredBM25.push({ index: i, score: finalBM25 });
    scoredCosine.push({ index: i, score: cosineSim });
  }

  // Sort by BM25
  scoredBM25.sort((a, b) => b.score - a.score);
  // Sort by Cosine
  scoredCosine.sort((a, b) => b.score - a.score);

  // Reciprocal Rank Fusion (RRF): 1 / (60 + rankBM25) + 1 / (60 + rankCosine)
  const rrfScores = new Map();
  for (let rank = 0; rank < scoredBM25.length; rank++) {
    const idx = scoredBM25[rank].index;
    if (scoredBM25[rank].score <= 0) continue;
    const rrf = 1 / (60 + rank);
    rrfScores.set(idx, (rrfScores.get(idx) || 0) + rrf);
  }

  for (let rank = 0; rank < scoredCosine.length; rank++) {
    const idx = scoredCosine[rank].index;
    if (scoredCosine[rank].score <= 0) continue;
    const rrf = 1 / (60 + rank);
    rrfScores.set(idx, (rrfScores.get(idx) || 0) + rrf);
  }

  // Normalization factor (max potential RRF is 2 / 60 ~ 0.0333)
  const maxRrf = 2 / 60;
  const merged = [];

  for (const [idx, rawRrf] of rrfScores.entries()) {
    const normalizedScore = Math.min(1.0, rawRrf / maxRrf);
    if (normalizedScore >= effectiveMinScore) {
      merged.push({ chunk: candidates[idx], score: Number(normalizedScore.toFixed(3)) });
    }
  }

  merged.sort((a, b) => b.score - a.score);
  const finalResults = merged.slice(0, effectiveTopK);

  // Format outputs
  const formatted = finalResults.map(({ chunk, score }) => {
    let snippet = chunk.text;
    if (!fullText && snippet.length > 900) {
      snippet = snippet.slice(0, 900) + "... [leia arquivo na íntegra para restante]";
    }

    return {
      chunkId: chunk.chunkId,
      file: chunk.file,
      fileLink: `${chunk.file}#L${chunk.startLine}-L${chunk.endLine}`,
      docTitle: chunk.docTitle,
      sectionTitle: chunk.sectionTitle,
      headingPath: chunk.headingPath.join(" > "),
      docType: chunk.docType,
      category: chunk.category,
      score,
      relevance: score >= 0.7 ? "ALTA" : score >= 0.4 ? "MEDIA" : "MODERADA",
      tags: chunk.tags,
      domainIds: chunk.domainIds,
      charCount: chunk.charCount,
      snippet,
    };
  });

  return {
    query,
    tokensUsed: queryTokens,
    totalIndexedChunks: index.totalChunks,
    matchedCount: formatted.length,
    results: formatted,
    summary:
      formatted.length > 0
        ? `Encontrado(s) ${formatted.length} chunk(s) semântico(s) relevante(s) (top score: ${formatted[0]?.score}).`
        : "Nenhum resultado relevante atingiu o score mínimo de corte.",
  };
}
