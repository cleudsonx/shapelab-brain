# Changelog — shapelab-brain

Todas as evoluções notáveis do Shapelab Agent OS são registradas neste arquivo seguindo Semantic Versioning (`VERSION`).

## [2.18.0] - 2026-11-25
### Adicionado & Componentização UI Cross-Produtos (`LL-016`)
- **Developer Terminal Widget Modular (Padrão macOS / Big Tech):**
  - Criação do template HTML autocontido `templates/ui/developer_terminal_widget.html` e da factory JavaScript vanilla `templates/ui/developer_terminal_widget.js` (`createDeveloperTerminal()`), sem nenhuma dependência externa e estilizados com Tailwind CSS + Prism S Neon.
  - Suporte a abas dinâmicas de linguagens (`cURL`, `Node.js`, `Python`, `200 OK Response`), botão de cópia com Clipboard API nativa e feedback visual, e telemetria de latência Edge/JWS com pulso animado.
  - Documentação da Skill Oficial em `skills/ui/developer_terminal_widget.md` com guia de integração para `B2B-personal-ia` (Webhooks WhatsApp/Asaas), `Smart-EV-Hub` (APIs OCPP) e novos SaaS.
  - Registro da Lição Aprendida `LL-016` em `memory/LESSONS_LEARNED.md` e atualização da matriz de adoção em `memory/PRODUCT_MATRIX.md`.
  - Reconstrução do índice semântico (`memory/semantic_index.json`).

## [2.17.2] - 2026-11-25
### Corrigido & Segurança de Mensageria (`LL-015`)
- **Guardrail de Onboarding e Validação Temporal de Convites em Webhooks:**
  - Padronizada a validação temporal estrita de convites pendentes (`expires_at > NOW()`) na identificação de remetentes de mensageria (WhatsApp/SMS).
  - Implementado Guardrail de Onboarding *fail-closed* que intercepta interações e cliques de botões de convidados não cadastrados, orientando a ativação pelo link oficial do convite sem executar regras de negócio nem poluir o painel do profissional.
  - Registrada a lição aprendida `LL-015` em `memory/LESSONS_LEARNED.md`.

## [2.17.1] - 2026-11-25
### Corrigido & Blindagem FinOps CI/CD (`LL-014`)
- **Proteção contra consumo indevido de cota do GitHub Actions:**
  - Adicionado `'.shapelab'` (entrada gitlink do submódulo sem barra) junto a `'.shapelab/**'` no `paths-ignore` de `templates/github_workflow_ci_preflight.yml`, corrigindo o comportamento em que bumps de submódulo ainda disparavam esteiras CI em repositórios privados.
  - Adicionado `[skip ci]` na mensagem de commit de atualização do ponteiro `.shapelab` em `scripts/brain_sync.ps1`, `scripts/brain_sync.sh` e `scripts/cockpit_server.mjs` (que também passa a sincronizar `scripts/brain_sync.ps1`).
  - Documentada a Lição Aprendida `LL-014` em `memory/LESSONS_LEARNED.md` com reconstrução do índice semântico.

## [2.17.0] - 2026-11-25
### Alterado
- **Arquitetura House of Brands & Endosso Institucional (`skills/brand/shapelab_brand_identity.md`, `assets/brand/brand_manifest.json`, `CORE_CONSTITUTION.md`):**
  - Definida a separação estrita entre a marca institucional da Venture Builder (**ShapeLab — Prism S Neon**) e a identidade comercial exclusiva de cada produto (**Mr. Coach**, **ReformAI**, **Smart EV Hub** e novos SaaS).
  - Estabelecida regra *Anti-Override* preservando nome, paleta, ícone do aplicativo (`AppIcon` / `Adaptive Icon`), splash screen e criativos publicitários próprios de cada app.
  - Padronizado o **endosso discreto no rodapé** (`AppVersionFooter` / footer HTML) e nos **metadados das lojas Apple App Store (Guidelines 2.3.7 & 4.3) e Google Play Store** (`Developer/Seller Name: ShapeLab`, `Copyright`, `Privacy Policy` e assinatura no final da descrição).
- **Matriz de Produtos & Scaffolding (`memory/PRODUCT_MATRIX.md`, `scripts/tools/scaffold_saas.mjs`):**
  - Atualizada a matriz refletindo 100% de adoção do modelo *House of Brands + Endosso* nos produtos e atualizado o `README.md` gerado para novos SaaS com as regras de autonomia visual e boas práticas de loja.
  - Índice semântico (`memory/semantic_index.json`) reconstruído para consulta pelas tools MCP.

## [2.16.0] - 2026-11-25
### Adicionado
- **ShapeLab OS v3.8.0 (`shapelab-os`) & Live Cockpit Server (`scripts/cockpit_server.mjs`):**
  - Integração HTTP local (`http://127.0.0.1:3333`) com rotas reais `/api/sync`, `/api/auto-heal`, `/api/scaffold`, `/api/telemetry`, `/api/semantic-search` e `/api/audit`.
  - Interface do Cockpit (`scripts/cockpit_app.html`) expandida com **7 abas**, incluindo **🏗️ Scaffold SaaS (1-Clique)**, listeners reais de re-auditoria (`btnAuditRunProduct` / `btnAuditRunGlobal`) e **Bridge Dual** (Live Server HTTP + MCP App `postMessage` SEP-1865).
- **5º Healer Autônomo (`ci_preflight_workflow`) & Suporte a `vaccineType` (`scripts/tools/auto_heal.mjs`):**
  - Correção do contrato `apply: true` no `cockpit_server.mjs` e injeção automática de `.github/workflows/ci_preflight.yml` via `templates/github_workflow_ci_preflight.yml`.
- **Alvos de Telemetria Configuráveis (`memory/fleet_targets.json` + `scripts/tools/fleet_telemetry.mjs`):**
  - Suporte a `stage: "production" | "provisioning"` com fallback de probe evitando falsos negativos enquanto domínios aguardam provisionamento.
- **Suíte de Smoke Tests Automatizados (`scripts/test_plugin_mcp.mjs`):**
  - Validação de ponta a ponta via JSON-RPC stdio das 13 tools MCP, 6 resources, portabilidade de caminhos e integridade da UI do Cockpit.

### Alterado
- **Portabilidade Zero-Hardcode & Governança (`hooks/session_start.ps1`, `scripts/brain_doctor.ps1`):**
  - Substituição de caminhos absolutos de usuário por `os.homedir()` / `$HOME` e leitura dinâmica de versões em `plugin.json` e `VERSION`.
  - Validação completa dos 4 scripts de hooks em `scripts/brain_doctor.ps1`.

## [2.15.0] - 2026-11-24
### Adicionado
- **Lição Aprendida `LL-013` (`memory/LESSONS_LEARNED.md`):**
  - Documentação do padrão arquitetural de resiliência para checkout de submódulo cross-repo (`.shapelab`) no GitHub Actions.
  - Desacoplamento do checkout principal, injeção condicional de `SHAPELAB_BRAIN_PAT` (`url..insteadOf`), `continue-on-error: true` e fallback gracioso via `::notice` na ausência do secret em runners ou forks públicos.
- **Resiliência no Template Preflight (`templates/github_workflow_ci_preflight.yml`):**
  - Atualização do template oficial de CI Preflight Gate com checkout tolerante a falhas e verificação condicional de presença de `.shapelab/scripts/ci_preflight_check.mjs`.
  - Suporte dinâmico a versão SemVer do Brain no scaffolding autônomo (`scripts/tools/scaffold_saas.mjs`).

### Alterado
- **Matriz de Produtos (`memory/PRODUCT_MATRIX.md`):**
  - Registro da esteira GitHub Actions com Preflight Gate Resiliente no `ReformAI`.

## [2.14.0] - 2026-11-24
### Adicionado
- **Brain Auto-Heal Engine (Inovação 1 — `brain_auto_heal` & CLI `--fix`):**
  - Implementação de `scripts/tools/auto_heal.mjs` para autocorreção automática de conformidade pré-commit e pré-push.
  - Correção autônoma de `analysis_options.yaml` (injeção de `fatal_infos: true`), sincronização de manifestos `version.json` e `pubspec.yaml` (32-bit safe `YYYYMMDDNN`), injeção de headers anti-cache `no-store` no `firebase.json` e alinhamento de scripts `brain_sync.ps1`.
  - Suporte à flag `--fix` na CLI `scripts/ci_preflight_check.mjs`.
- **Central Fleet Telemetry (Inovação 3 — `brain_fleet_telemetry`):**
  - Implementação de `scripts/tools/fleet_telemetry.mjs` para monitoramento ativo e contínuo de endpoints em produção (Firebase/Render, Cloudflare, Cloud Run), medindo latência RTT em ms, headers de segurança HSTS/CSP e taxa de disponibilidade da frota.
- **One-Click SaaS Generator (Inovação 4 — `brain_scaffold_saas`):**
  - Implementação de `scripts/tools/scaffold_saas.mjs` permitindo a criação de um novo produto SaaS completo em segundos: inicialização Git, submódulo `.shapelab` apontado para o HEAD central, workflow de Preflight CI Gate configurado, manifestos e lints 100% blindados de fábrica.
- **Total de 13 Ferramentas MCP Ativas:**
  - Atualização do servidor central `scripts/shapelab_brain_mcp.mjs` e do plugin global `shapelab-os` (**v3.7.0**).


## [2.13.0] - 2026-11-24
### Adicionado
- **Busca Semântica Híbrida no Servidor MCP (Opção D — `brain_semantic_search`):**
  - Implementação da engine semântica híbrida em `scripts/tools/semantic_search.mjs` (Zero-Dependencies, Node.js ESM nativo):
    - **Chunking Semântico com Máquina de Estados:** Rastreamento rigoroso de blocos de código (` ``` ` e `~~~`) prevenindo falsos cabeçalhos, divisão inteligente por seções `##` e `###`, e segmentação de tabelas em `LESSONS_LEARNED.md` preservando cabeçalhos em cada chunk.
    - **Normalização e Dual-Tokenization:** Tratamento Unicode NFKD, remoção de diacríticos, preservação de identificadores compostos (`is_demo`, `amount_cents`, `anti-takeover`, `southamerica-east1`), splitting em camelCase/snake_case/kebab-case e extração automática de `domainIds` (`RFC-7515`, `BCB-4893`, `LL-xxx`).
    - **Stopwords Bilíngues (PT-BR / EN):** Lista otimizada com allowlist de termos técnicos essenciais (`id`, `ip`, `db`, `ui`, `ux`, `qa`, `os`, `js`, `ts`, `rls`, `jwt`, `jws`, `ota`, `pwa`, `bcb`, `worm`, `mcp`).
    - **Expansão de Sinônimos Conceituais ShapeLab:** Mapeamento determinístico de conceitos (ex.: `passkeys` ↔ `webauthn`/`cbor`/`signcount`, `double-spend` ↔ `durable lease`/`for update`/`idempotencia`, `tela-branca` ↔ `initassetcacheguard`/`ota`/`cache-busting`).
    - **Ranqueamento Híbrido BM25+ & Vector Space:** BM25 com saturação $k_1 = 1.2$, $b = 0.75$, ponderação de campos (3.0x em títulos, 2.5x em tags/domínios, 1.0x no corpo) e pesos por tier, somado ao Cosine Similarity TF-IDF.
    - **Fusão Recíproca de Ranks (RRF):** Algoritmo $\frac{1}{60 + Rank_{BM25}} + \frac{1}{60 + Rank_{Cosine}}$ com normalização de pontuação entre 0.0 e 1.0.
  - **Gerador de Índice CLI (`scripts/build_semantic_index.mjs`):** Gera `memory/semantic_index.json` (123 chunks indexados em 15 categorias, tempo de geração < 100ms e carregamento < 5ms).
  - **Tool MCP `brain_semantic_search`:** Exposta no servidor central (`shapelab_brain_mcp.mjs`) e no plugin `shapelab-os` (`v3.6.0`), suportando filtros estruturados por `category`, `docType`, `topK`, `minScore` e snippet inteligente (`fullText: false` padrão para máxima economia de tokens).


## [2.12.0] - 2026-11-24
### Adicionado
- **MCPs Verticais de Domínio no Servidor MCP Nativo (Opção C):**
  - Implementação modular de 3 ferramentas de alta precisão em `scripts/tools/` (Zero-Dependencies, Node.js ESM puro):
    - `fintech_validate_jws` (`scripts/tools/fintech_jws.mjs`): Validação completa de JWS Compact Serialization (RFC 7515). Proteção Zero-Trust contra `alg: none`, Key Confusion, injeção de headers críticos (`jwk`, `jku`, `x5u`, `x5c`, `crit`) e base64url não-canônico. Verificação criptográfica nativa via `node:crypto` (ES256/ES384/ES512 IEEE P1363, RS256/RS384/RS512, PS256/PS384/PS512 e HS256/HS384/HS512), conferência estrita de janela temporal (`exp`/`nbf`/`iat`) e claims obrigatórias de negócio (ex.: `idempotency_key`, `amount`, `kid`).
    - `ota_validate_manifest` (`scripts/tools/ota_manifest.mjs`): Validação de conformidade OTA PWA e cache-busting. Checagem de integridade de `version.json`, sincronia estrita com `pubspec.yaml` (`X.Y.Z+YYYYMMDDNN`), regra monotônica 32-bit safe (`YYYYMMDDNN <= 2147483647`), headers anti-cache (`firebase.json`, `render.yaml`, Cloudflare `_headers`) para manifestos e `index.html`, e detecção de cache-busting em assets estáticos.
    - `flutter_compat_check` (`scripts/tools/flutter_compat.mjs`): Auditoria estática de código Flutter/Dart. Varredura de barrel adapter `material_compat.dart` (prevenindo colisões entre `material_ui` e `flutter/material`), regras estritas em `analysis_options.yaml` (`fatal_infos: true`), suporte a Edge-to-Edge (`SystemUiMode.edgeToEdge` + `SafeArea` interno a `Scaffold`) e contraste WCAG AA (>= 4.5:1) com tokens Prism S Neon (`#10B981`, `#06B6D4`, `#090D16`).
  - Registro de todas as ferramentas no servidor MCP central (`scripts/shapelab_brain_mcp.mjs`) e no plugin global `shapelab-os` (`v3.5.0`).
  - Suíte de testes automatizada JSON-RPC validando as novas tools com simulações reais de tokens HMAC, rejeição de algoritmos inseguros e auditoria nos repositórios dos produtos.


## [2.11.0] - 2026-11-24
### Adicionado
- **Preflight CI Gate nos Workflows GitHub Actions (Opção B):**
  - Implementação da CLI autônoma `scripts/ci_preflight_check.mjs` sem nenhuma dependência externa (Node.js nativo >= 18 ESM), auditando os 5 gates essenciais de segurança, RLS, versionamento e governança.
  - Suporte completo às flags `--strict`, `--threshold=<num>`, `--warn-only`, `--github-actions` (com emissão de anotações nativas `::error::` / `::warning::` e geração do relatório Markdown no `$GITHUB_STEP_SUMMARY`) e `--json`.
  - Refatoração do servidor MCP (`scripts/shapelab_brain_mcp.mjs`) para importar `auditPreflight` de `ci_preflight_check.mjs` como *Single Source of Truth (SSOT)*, eliminando mais de 350 linhas de duplicação.
  - Criação do template `templates/github_workflow_ci_preflight.yml` e integração do job `shapelab-preflight` nos workflows dos produtos (`B2B-personal-ia`, `ReformAI`, `Smart-EV-Hub`).
  - Refinamento de heurísticas para prevenir falsos positivos em testes adversariais (`alg: none`) e hosts de contêineres Docker locais (`db`, `postgres`, `localhost`).

## [2.10.0] - 2026-11-24
### Adicionado
- **Cockpit Visual do Fundador (MCP App SEP-1865 & Generative UI):**
  - Implementação da interface visual completa em `scripts/cockpit_app.html` e artefato standalone `shapelab_founder_cockpit.html` (Prism S Neon `#10B981` Emerald -> `#06B6D4` Cyan sobre Obsidian Canvas `#090D16`), com suporte total a Dual-Theme WCAG AA/AAA.
  - Painel interativo com 3 tabs principais:
    - *Visão Geral dos Produtos:* Cartões de métricas em tempo real (`B2B-personal-ia`, `ReformAI`, `Smart-EV-Hub`), badges de sincronia de submódulo (`ALIGNED` / `OUT_OF_SYNC`), versão do app extraída automaticamente de manifestos (`pubspec.yaml`, `pyproject.toml`, `package.json`), gauges de preflight audit (0-100) e atalhos de sincronização individual.
    - *Auditoria Preflight:* Inspeção aprofundada dos 5 gates de segurança (Anti-Takeover / Segredos, Isolamento RLS / Tenants, Versionamento Monotônico, Conexões Assíncronas HTTP/JWT, Governança `.shapelab`), com listagem detalhada de checks aprovados e falhas.
    - *Matriz de Vacinas & Polinização:* Visualização interativa da adoção de skills com busca textual por termos (`cbor`, `jws`, `asaas`, `ota`, etc.) e filtros por status (Todas, Ativas, Parciais, Pendentes).
- **Tool `brain_cockpit` & Recurso `ui://cockpit/app.html`:**
  - Exposição da tool nativa `brain_cockpit` no servidor MCP (`shapelab_brain_mcp.mjs`) com metadados UI (`resourceUri: "ui://cockpit/app.html"` e entrypoint `aux_pane: "ShapeLab Cockpit"`).
  - Suporte a leitura direta do recurso HTML via `resources/read` e retorno de `structuredContent` hidratado com cache inteligente TTL de 15s.
  - Bridge JSON-RPC bidirecional via `postMessage` permitindo ao Cockpit acionar `brain_sync_all` e `brain_audit_preflight` diretamente da UI.
- **Exportação Executiva:** Botão de exportação instantânea do status consolidado de governança e preflight para JSON.

### Alterado
- **Matriz de Adoção (`memory/PRODUCT_MATRIX.md`):** Atualizado status de sincronia dos 3 produtos para `.shapelab v2.10.0`.
- **Roteador `INDEX.md`:** Documentado o Cockpit Visual do Fundador e sua integração via MCP App no Side Pane.

## [2.9.0] - 2026-11-24
### Adicionado
- **MCP Resources (`brain://...`):** Exposição nativa de recursos no servidor MCP (`shapelab_brain_mcp.mjs` v2.0.0) sob o protocolo 2024-11-05 com allowlist estrita e proteção anti-traversal em duas camadas:
  - `brain://constitution`: Devolve `CORE_CONSTITUTION.md` (`text/markdown`).
  - `brain://brand/manifest`: Devolve `assets/brand/brand_manifest.json` (`application/json`).
  - `brain://matrix`: Devolve `memory/PRODUCT_MATRIX.md` (`text/markdown`).
  - `brain://tech-radar`: Devolve `memory/TECH_RADAR.md` (`text/markdown`).
  - `brain://lessons`: Devolve `memory/LESSONS_LEARNED.md` (`text/markdown`).
- **Nova Tool Operacional `brain_audit_preflight`:** Varredura local automatizada de conformidade (0-100 pts) validando ausência de segredos hardcoded mascarados, políticas de RLS no PostgreSQL/Supabase, conformidade de versionamento YYYYMMDDNN/SemVer, higiene assíncrona HTTP/JWT e sincronia de governança `.shapelab` + `brain_sync.ps1`.
- **Nova Tool Operacional `brain_sync_all`:** Sincronização paralela robusta via `child_process.execFile` (sem shell interpolation e com mutex contra concorrência) para atualização atômica de `.shapelab` e `scripts/brain_sync.ps1` em `B2B-personal-ia`, `ReformAI` e `Smart-EV-Hub`.
- **Blindagem Red-Team & Anti-DoS:** Validação estrita de caminhos (`isPathInside`), limites duros por arquivo (256 KB) e teto de arquivos (2000), teto de linha para prevenção de ReDoS e mascaramento automático de credenciais nos relatórios.
- **Versão do Plugin `shapelab-os`:** Atualizado para `v3.3.0` com suporte nativo a Resources e Tools operacionais de auditoria e sincronização.

## [2.8.1] - 2026-11-24
### Adicionado
- **Blindagem Anti-IDOR sob `service_role`:** Adicionada Seção 6 em `skills/backend/supabase_rls.md` documentando a prevenção do ponto cego do `service_role` (que ignora RLS do Postgres), com exigência de escopo explícito `.eq("tenant_id", caller_id)` em mutações, guardas server-side fail-closed e proteção contra sequestro cross-tenant de vínculos em checkout público.
- **Padrão Concorrência Durable Lease & Cota IA:** Documentação do padrão Durable Lease (`claim_token` UUID + TTL + RPC de liberação em falha transitória) para idempotência estrita de webhooks de pagamento (zero double-credit) e padrão *Reserve-Execute-Release* atômico para cotas de IA sem race condition.
- **Lições Aprendidas:** Registradas lições `LL-011` (Anti-IDOR sob `service_role` + Fail-Closed) e `LL-012` (Durable Lease & Reserva Atômica de Cota IA) em `memory/LESSONS_LEARNED.md`.

### Alterado
- **Matriz de Adoção (`memory/PRODUCT_MATRIX.md`):** Atualizado status do `ReformAI` para `.shapelab v2.8.0`, registrando cobertura de `auth_anti_takeover.md` (`_guard.ts` + PBKDF2 + `node-rbac-guard.ts`), `supabase_rls.md` (`D1 + Supabase PostGIS`) e entregas `P3.2`/`P3.3`/`P3.4`, e `Mr. Coach` atualizado para `v2.8.1`.

## [2.8.0] - 2026-11-24
### Adicionado
- **Nova Skill SRE:** `skills/sre/observability_crash_shield_and_backup.md` cobrindo Deep Healthcheck (`/health/live` desacoplado de dependências vs `/health/ready` paralelo com timeout de 2s), sanitização estrita de HTTP 500 com `correlation_id` e redator de segredos, Crash Shield global para Flutter/Web com anti-flood de telemetria e política de backup contínuo Supabase (PITR + dump diário criptografado com AES-256 e restore drill).
- **Nova Skill DevOps Cloud Run:** `skills/devops/cloud_run_stateless_cutover.md` padronizando deploy no Google Cloud Run na região `southamerica-east1` (São Paulo - conformidade LGPD e baixa latência), Dockerfile multi-stage com usuário non-root, graceful shutdown com captura de SIGTERM/SIGINT (dreno de requisições ativas até 9s) e estratégia Blue-Green Zero-Downtime com smoke test em `--tag=candidate` antes do corte de tráfego.
- **Nova Skill Segurança Fintech & JWS:** `skills/security/jws_terms_and_demo_isolation.md` especificando assinatura RFC 7515 Compact Serialization (ES256/HS256) para transações financeiras e consentimentos LGPD/termos de aceite, com rotação de chaves em duas fases por `kid`, blindagem contra key confusion/alg-none e isolamento estrito de contas `is_demo` (RLS imutável em FKs compostas, anti-bypass de faturamento e redirecionamento de notificações para `demo_notification_sink`).
- **Compatibilidade Multi-SDK Flutter & `--fatal-infos`:** Adicionada Seção 6 em `skills/ui/flutter_edge_to_edge.md` documentando Barrel Adapter `lib/core/ui/material_compat.dart` para interoperabilidade entre `package:flutter/material.dart` e `package:material_ui/material_ui.dart` (Dart ^3.8.0) e regras estritas para CI sem quebras.
- **Splash Prism S Zero-FOUC & Scaffolder:** Atualizada `skills/devops/versioning_and_ota_update.md` e `scripts/new_shapelab_saas.ps1` com `#shapelab-splash` instantâneo em `#090D16` com remoção no evento `flutter-first-frame` e `syncPwaThemeColor`.
- **Governança & Resiliência Git:** Criação de `.gitattributes` para normalização de quebras de linha (`eol=lf`), ajuste no `scripts/brain_doctor.ps1` para comparação justa de hashes ignorando variações CRLF/LF do Windows, e adição de `paths-ignore` FinOps nos workflows de CI/CD de `ReformAI` e `Smart-EV-Hub`.
- **Lições Aprendidas:** Registradas lições `LL-008` (SRE / Probes), `LL-009` (Cloud Run / Graceful Shutdown) e `LL-010` (JWS RFC 7515 / Demo Isolation) em `memory/LESSONS_LEARNED.md`.
- **Matriz de Adoção:** Atualizada `memory/PRODUCT_MATRIX.md` e `memory/TECH_RADAR.md` com as novas capacidades de produção.

## [2.7.0] - 2026-11-23
### Adicionado
- Lição `LL-007` em `memory/LESSONS_LEARNED.md` e nova seção **WebAuthn L3 / Passkeys (CBOR/COSE & Anti-Clonagem)** em `skills/security/auth_anti_takeover.md` (`v1.1.0`), cobrindo decodificação CBOR/COSE sem dependências externas, validação estrita de `rpIdHash`/origem/assinatura ECDSA, consumo atômico de desafios em banco e revogação automática por regressão de `signCount`.
- Atualização da `memory/PRODUCT_MATRIX.md` registrando adoção de Passkeys WebAuthn L3 em `ReformAI` (✅) e recomendação pendente para `B2B-personal-ia` e `Smart-EV-Hub` (⏳).

## [2.6.0] - 2026-11-23
### Adicionado
- **Inovação #3 (Zero-to-SaaS):** Scaffolder `scripts/new_shapelab_saas.ps1` gerando estrutura completa (FastAPI + Flutter Edge-to-Edge + Prism S + `.shapelab` + `update_version.dart`/`version.py` com `release_delta.json`).
- **Inovação #4 (`release_delta.json`):** Integração de extrator de delta de release em `shapelab-os v3.2.0` (`post_tool_observer.ps1` + `shapelab-brain-curator.md`) e `scripts/version.py --delta`.
- **Inovação #5 (Scanner de Vacinas):** `scripts/brain_vaccines.ps1` + workflow semanal `.github/workflows/vaccine_audit.yml` para auditoria automatizada de adoção nos repositórios.

## [2.5.0] - 2026-11-23
### Adicionado
- Suporte documentado ao servidor MCP nativo (`shapelab-brain` via `mcp_config.json` / `shapelab_brain_mcp.mjs`) e ao Firewall preventivo `PreToolUse` (`pre_tool_firewall.ps1`) do plugin `shapelab-os v3.1.0`.
- Atualização da `memory/PRODUCT_MATRIX.md`: `Smart-EV-Hub` atualizado com `versioning_and_ota_update.md` (`update_version.dart` + `version.py` + `initAssetCacheGuard`) e `B2B-personal-ia` (`shapelab.ia.br`) + `Smart-EV-Hub` atualizados com identidade oficial **Prism S** (`shapelab_brand_identity.md`).

## [2.4.0] - 2026-11-23
### Adicionado
- Matriz viva de adoção e polinização cruzada: `memory/PRODUCT_MATRIX.md`.
- Diagnóstico automatizado e sincronizador multi-produto: `scripts/brain_doctor.ps1`.
- Rubrica Quantitativa de Promoção (`0–10`, corte `>= 7`) e integração com os Lifecycle Hooks (`SessionStart`, `PostToolUse`, `Stop`) do plugin `shapelab-os v3.0.0` + 5º subagente `shapelab-brain-curator` em `memory/BRAIN_EVOLUTION_PROTOCOL.md`.

### Alterado
- `INDEX.md`, `CORE_CONSTITUTION.md`, `README.md` e `shapelab_brain_blueprint.md` atualizados para a arquitetura de auto-aprendizado contínuo por versão/commit (`v2.4.0` / `shapelab-os v3.0.0`).

## [2.3.0] - 2026-11-22
### Adicionado
- Identidade visual oficial **Prism S** com efeito neon (`#10B981` → `#06B6D4` sobre `#090D16`): assets oficiais `assets/brand/shapelab_logo_prism_s.png` e `assets/brand/shapelab_banner_prism_s.png`.
- Especificação de marca legível por humanos e modelos de IA: `skills/brand/shapelab_brand_identity.md` e manifesto estruturado `assets/brand/brand_manifest.json` para aplicação em `shapelab.ia.br`, páginas web, PWA e apps Flutter.
- Banner oficial aplicado no `README.md`.

### Alterado
- Migração das referências do plugin global de `cleudson-devkit` para **`shapelab-os`** (`ShapeLab OS`) no `INDEX.md`, `README.md`, `ADR-001` e `shapelab_brain_blueprint.md`.

## [2.2.1] - 2026-11-22
### Adicionado
- Workflow `.github/workflows/release.yml` para validar incremento SemVer de `VERSION` + presença de seção correspondente no `CHANGELOG.md` em PRs/pushes na `main`, criando automaticamente a tag `vX.Y.Z` e publicando a GitHub Release.
- Trava de versionamento no modo `contribute` de `scripts/brain_sync.ps1` e `scripts/brain_sync.sh`, bloqueando envios que alterem `skills/`, `agents/`, `memory/` ou `CORE_CONSTITUTION.md` sem incremento válido de `VERSION` e entrada no `CHANGELOG.md`.

## [2.2.0] - 2026-11-22
### Adicionado
- Nova skill oficial `skills/devops/versioning_and_ota_update.md` (unificando versionamento monotônico `YYYYMMDDNN`, anti-cache `initAssetCacheGuard`, detector OTA `PwaUpdateWrapper`, GC do Firebase Hosting e `SemVer+build.<run>.<sha>` para backends).
- Seção 5 (*Versionamento & Rastreabilidade*) e Seção 6 (*Evolução Contínua do Brain*) no `CORE_CONSTITUTION.md`.
- Aprendizado `LL-006` em `memory/LESSONS_LEARNED.md` e entrada de Versionamento/OTA no `memory/TECH_RADAR.md`.
- Mecanismo completo de autoatualização: `memory/BRAIN_EVOLUTION_PROTOCOL.md`, `VERSION`, `CHANGELOG.md`, `scripts/brain_sync.ps1`, `scripts/brain_sync.sh`, `templates/github_workflow_brain_sync.yml` e `templates/AGENTS_brain_block.md`.

## [2.1.0] - 2026-11-22
### Adicionado
- Adaptação do blueprint para a realidade dos projetos `B2B-personal-ia` (Mr. Coach), `ReformAI`, `Smart-EV-Hub` e `Tattoo SaaS`, integrando aos subagentes do `cleudson-devkit`.
- Skills de produção: `asaas_split.md` (BCB 4893), `auth_anti_takeover.md`, `flutter_edge_to_edge.md`, `supabase_rls.md` e `whatsapp_dual_channel.md`.
- Inicialização da árvore de diretórios, `INDEX.md`, `CORE_CONSTITUTION.md`, `agents/*`, `memory/*` (`LL-001` a `LL-005`, `ADR-001`) e `templates/*`.

## [2.0.0] - 2026-11-22
### Adicionado
- Especificação inicial do blueprint `shapelab_brain_blueprint.md` (Shapelab Agent OS).
