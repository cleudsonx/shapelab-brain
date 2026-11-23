# Changelog — shapelab-brain

Todas as evoluções notáveis do Shapelab Agent OS são registradas neste arquivo seguindo Semantic Versioning (`VERSION`).

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
