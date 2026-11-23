# ADR-001: Arquitetura Híbrida do Shapelab Agent OS (`cleudson-devkit` + `shapelab-brain`)

- **Data:** 2026-11-22
- **Status:** Aceito
- **Autores:** Cleudson & Shapelab Chief Architect

## 1. Contexto
A ShapeLab desenvolve e opera múltiplos SaaS (`B2B-personal-ia` / Mr. Coach, `ReformAI`, `Smart-EV-Hub`, `Tattoo SaaS`) com equipe enxuta (Solo-Founder) apoiada por agentes no Google Antigravity. Precisamos compartilhar padrões de segurança bancária (BCB 4893), blindagem anti-takeover, UI Flutter Dual-Theme e mensageria WhatsApp Dual-Channel entre todos os repositórios sem estourar a janela de contexto nem duplicar manutenção.

## 2. Decisão
Adotar uma arquitetura em duas camadas complementares:
1. **Camada de Execução Global (`cleudson-devkit` plugin no Antigravity):** Fornece as regras globais (`AGENTS.md`) e os 4 subagentes especializados (`shapelab-spec-research`, `shapelab-security-fintech`, `shapelab-backend-qa`, `shapelab-mobile-ui`) para delegação paralela com economia de tokens.
2. **Camada de Memória Viva e Boilerplates (`shapelab-brain` repo):** Repositório versionado contendo o roteador sob demanda (`INDEX.md`), a constituição técnica (`CORE_CONSTITUTION.md`), os boilerplates testados em produção (`skills/`) e o histórico vivo de incidentes e decisões (`memory/LESSONS_LEARNED.md`, `memory/TECH_RADAR.md`).

## 3. Consequências e Impacto FinOps
- **Economia de Tokens:** Nenhum boilerplate pesado é injetado em todo turno; o agente lê `INDEX.md` e carrega apenas a skill exigida pela tarefa.
- **Polinização Rápida:** Qualquer blindagem criada no `B2B-personal-ia` ou `ReformAI` vira uma skill agnóstica pronta para o `Smart-EV-Hub` ou `Tattoo SaaS`.
- **Auditoria Padronizada:** Todo merge passa pelos mesmos critérios objetivos de Red Team, BCB 4893, RLS e CI Preflight.
