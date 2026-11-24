# Shapelab Agent OS — Roteador de Contexto (INDEX)

> **Regra para o Agente Principal e Subagentes (`shapelab-os` / `ShapeLab OS`):**
> 1. Respeite sempre o **Protocolo Spec-First Gate** (`AGENTS.md` / `CORE_CONSTITUTION.md`).
> 2. Carregue os arquivos abaixo **apenas sob demanda**, de acordo com a intenção da tarefa atual, preservando a janela de contexto.
> 3. Para tarefas extensas, delegue ao subagente correspondente via `invoke_subagent` passando o caminho da skill relevante.

## 1. Roteamento de Agentes e Subagentes (`/agents` + `invoke_subagent`)
| Intenção da Tarefa | Subagente Nativo (`invoke_subagent`) | Papel Estratégico no `shapelab-brain` |
| :--- | :--- | :--- |
| Levantamento 360º Spec-First, escolha de arquitetura, ADR ou retrospectiva de sessão | `shapelab-spec-research` (`Model: "flash"`) | `agents/chief_architect.md` |
| Extrair módulo validado de `B2B-personal-ia` / `ReformAI` / `Smart-EV-Hub` para outro SaaS | `shapelab-spec-research` + `shapelab-backend-qa` | `agents/cross_pollinator.md` |
| Auditoria Red-Team, Auth Anti-Takeover, BCB 4893, RLS, LGPD, FinOps e testes de concorrência | `shapelab-security-fintech` (`Model: "pro"`) | `agents/guardian_auditor.md` |
| Implementação FastAPI, Webhooks, Mensageria Dual-Channel e execução Pytest / CI Preflight | `shapelab-backend-qa` (`Model: "flash"`) | `CORE_CONSTITUTION.md` + skills de backend |
| Evolução de UI Flutter/Web, Dual-Theme WCAG, Edge-to-Edge, cache offline v2 e `flutter test` | `shapelab-mobile-ui` (`Model: "flash"`) | `CORE_CONSTITUTION.md` + `skills/ui/flutter_edge_to_edge.md` |
| Auto-aprendizado pós-commit/versão, Rubrica 0–10 e evolução do `.shapelab` | `shapelab-brain-curator` (`Model: "flash"`) | `memory/BRAIN_EVOLUTION_PROTOCOL.md` |

## 2. Biblioteca de Skills de Produção (`/skills`)
| Domínio / Necessidade | Arquivo para Carregar | Status | Origem |
| :--- | :--- | :--- | :--- |
| Pagamentos Asaas v3, Split JWS, Locks Anti-Double-Spend e WORM Ledger (BCB 4893) | `skills/payments/asaas_split.md` | `production-verified` | `B2B-personal-ia` |
| Blindagem Auth Anti-Takeover, Guards (`Depends` / `_guard.ts`), Argon2id/PBKDF2, AAL2 e `checkout_nonce` | `skills/security/auth_anti_takeover.md` | `production-verified` | `B2B-personal-ia` / `ReformAI` |
| Layout Mobile/Web Imersivo Edge-to-Edge + Dual-Theme (Dark/Light WCAG) | `skills/ui/flutter_edge_to_edge.md` | `production-verified` | `B2B-personal-ia` |
| Banco Multi-tenant, Supabase RLS Anti-Recursão e Storage Privado LGPD | `skills/backend/supabase_rls.md` | `production-verified` | `B2B-personal-ia` |
| Mensageria WhatsApp Dual-Channel (Meta Cloud Oficial + Fallback Evolution API) | `skills/growth/whatsapp_dual_channel.md` | `production-verified` | `B2B-personal-ia` |
| Versionamento Monotônico (`YYYYMMDDNN`), Anti-Cache PWA/OTA e SemVer CI/CD | `skills/devops/versioning_and_ota_update.md` | `production-verified` | `B2B-personal-ia` / `ReformAI` |
| Identidade Visual ShapeLab (Prism S Neon), Tokens, SEO, PWA & App Icons | `skills/brand/shapelab_brand_identity.md` | `production-verified` | `shapelab-brain` |
| Deep Healthcheck, Sanitização HTTP 500, Crash Shield Flutter e Backup Supabase | `skills/sre/observability_crash_shield_and_backup.md` | `production-verified` | `shapelab-brain` |
| Deploy Stateless no Cloud Run (`southamerica-east1`), Graceful Shutdown e Cutover Blue-Green | `skills/devops/cloud_run_stateless_cutover.md` | `production-verified` | `shapelab-brain` / `Smart-EV-Hub` |
| Assinatura Criptográfica JWS (RFC 7515) para Transações/Termos e Isolamento Estrito Demo | `skills/security/jws_terms_and_demo_isolation.md` | `production-verified` | `shapelab-brain` |

## 3. Memória Viva, Diagnóstico & Templates (`/memory`, `/scripts` e `/templates`)
- **Incidentes resolvidos e padrões blindados:** `memory/LESSONS_LEARNED.md`
- **Matriz de adoção de skills por produto:** `memory/PRODUCT_MATRIX.md`
- **Tecnologias aprovadas vs. banidas:** `memory/TECH_RADAR.md`
- **Protocolo de autoatualização do Brain (Rubrica 0–10 + Hooks):** `memory/BRAIN_EVOLUTION_PROTOCOL.md`
- **Diagnóstico de saúde e sincronia multi-produto:** `scripts/brain_doctor.ps1`
- **Servidor MCP nativo (Resources & Tools operacionais):** `scripts/shapelab_brain_mcp.mjs`
- **CLI Autônoma Preflight CI Gate (Zero-deps & GitHub Actions):** `scripts/ci_preflight_check.mjs`
- **Cockpit Visual do Fundador (MCP App no Side Pane / Generative UI):** `scripts/cockpit_app.html`
- **Scanner automático de vacinas pendentes:** `scripts/brain_vaccines.ps1`
- **Scaffolder Zero-to-SaaS (novo produto completo):** `scripts/new_shapelab_saas.ps1`
- **Decisões Arquiteturais (ADRs):** `memory/adrs/ADR-001-shapelab-agent-os.md`
- **Criar uma nova Skill:** `templates/skill_template.md`
- **Especificar um novo MVP ou Feature (Spec-First):** `templates/prd_mvp.md`
- **Template de Workflow CI/CD Preflight Gate:** `templates/github_workflow_ci_preflight.yml`
