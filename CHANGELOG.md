# Changelog — shapelab-brain

Todas as evoluções notáveis do Shapelab Agent OS são registradas neste arquivo seguindo Semantic Versioning (`VERSION`).

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
