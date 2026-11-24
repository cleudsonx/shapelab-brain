# Shapelab Tech Radar (2026)

Guia rápido de tecnologias aprovadas para manter a velocidade e o baixo custo de manutenção de um fundador solo.

## 1. ADOTAR (Padrão Oficial em Produção)
- **Mobile & Web App:** Flutter 3.24+ (Material 3, Edge-to-Edge, Dual-Theme WCAG, Cache Offline v2).
- **Web Edge & Guardas Leves:** Cloudflare Pages + Cloudflare Workers (`_guard.ts` fail-closed + Web Crypto PBKDF2).
- **Backend Core:** Python 3.11 + FastAPI + Pydantic v2 + `httpx.AsyncClient` (Cloud Run `southamerica-east1` São Paulo ou Render).
- **Observabilidade & SRE:** Deep Healthcheck (`/health/live` vs `/health/ready`), Sanitização HTTP 500 com correlation_id, Crash Shield Flutter e PITR Supabase.
- **Banco, Auth & Storage:** Supabase (PostgreSQL 15+ com RLS estrito e Storage privado LGPD) + Firebase Hosting.
- **Pagamentos, Split & JWS:** Asaas API v3 + JWS RFC 7515 Compact Serialization (ES256/HS256) + Isolamento Estrito Demo + WORM Ledger (BCB 4893).
- **Mensageria:** Meta Cloud API Oficial (primário) + Evolution API (fallback com degradação graciosa).
- **IA Generativa:** Gemini API via SDK `google-genai` (Structured Outputs, roteamento Flash vs. Pro por complexidade).
- **Versionamento & OTA:** Versionamento SemVer + Build `YYYYMMDDNN` + OTA PWA (com `initAssetCacheGuard`, `version.json`, GC Firebase Hosting e `SemVer+build.<run>.<sha>` no backend).

## 2. EXPERIMENTAR (Uso Controlado)
- **Automação de Testes E2E de Persona:** Subagentes simulando usuários reais em rede 4G instável.
- **Motores de Regras Parametrizadas (ReformAI):** Tabelas de alíquotas e feature flags legislativas (LC 214/2025, IBS/CBS) desacopladas de deploy.

## 3. EVITAR / BANIDO (Anti-Patterns na ShapeLab)
- **Proibido:** Senhas/chaves hardcoded, hash rápido sem salt (`MD5`/`SHA-256` puro para senhas), endpoints privados sem guard no servidor ou tabelas Supabase sem RLS.
- **Proibido:** `requests` síncrono dentro de rotas `async def` no FastAPI (trava o event loop no Render).
- **Evitar:** Microsserviços fragmentados, Kafka/RabbitMQ autogerenciados ou Kubernetes para MVPs e produtos em tração inicial.
