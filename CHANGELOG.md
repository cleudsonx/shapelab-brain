# Changelog — shapelab-brain

Todas as evoluções notáveis do Shapelab Agent OS são registradas neste arquivo seguindo Semantic Versioning (`VERSION`).

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
