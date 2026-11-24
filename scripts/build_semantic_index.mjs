#!/usr/bin/env node
/**
 * ShapeLab Semantic Index Builder CLI
 * Scans markdown assets, segments chunks and pre-computes semantic index in memory/semantic_index.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex } from "./tools/semantic_search.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const brainRoot = path.resolve(__dirname, "..");

console.log("=== SHAPELAB SEMANTIC INDEX BUILDER ===");
console.log(`Brain Root: ${brainRoot}`);

const startTime = Date.now();
const index = buildIndex(brainRoot, { includeTemplates: false });

const outputPath = path.join(brainRoot, "memory", "semantic_index.json");

// Prepare compact payload without temporary object keys (_tokens, _tf, etc.)
const compactPayload = {
  version: index.version,
  generatedAt: index.generatedAt,
  brainRoot: index.brainRoot,
  totalChunks: index.totalChunks,
  avgDocLen: Number(index.avgDocLen.toFixed(2)),
  docFreq: index.docFreq,
  idf: index.idf,
  chunks: index.chunks.map((c) => ({
    chunkId: c.chunkId,
    file: c.file,
    docType: c.docType,
    category: c.category,
    priorityTier: c.priorityTier,
    boostWeight: c.boostWeight,
    docTitle: c.docTitle,
    sectionTitle: c.sectionTitle,
    headingPath: c.headingPath,
    anchors: c.anchors,
    domainIds: c.domainIds,
    tags: c.tags,
    frontmatter: c.frontmatter,
    startLine: c.startLine,
    endLine: c.endLine,
    hasCodeBlock: c.hasCodeBlock,
    codeLanguages: c.codeLanguages,
    charCount: c.charCount,
    tokenEstimate: c.tokenEstimate,
    text: c.text,
  })),
};

fs.writeFileSync(outputPath, JSON.stringify(compactPayload, null, 2), "utf8");

const elapsed = Date.now() - startTime;
const stats = fs.statSync(outputPath);
const sizeKb = (stats.size / 1024).toFixed(1);

console.log(`\n✓ Índice Semântico construído com sucesso em ${elapsed}ms!`);
console.log(`Arquivo: ${outputPath} (${sizeKb} KB)`);
console.log(`Total de Chunks Indexados: ${compactPayload.totalChunks}`);
console.log(`Comprimento médio de documento: ${compactPayload.avgDocLen} tokens`);

// Category breakdown
const categoryCounts = {};
for (const c of compactPayload.chunks) {
  categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
}

console.log("\nDistribuição por Categoria:");
for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
  console.log(` - ${cat}: ${count} chunks`);
}
