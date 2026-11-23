---
document_type: system_blueprint
repository: shapelab-brain
organization: Shapelab (shapelab.ia.br)
version: 2.3.0
date: 2026-11-22
compatible_agents: [Google Antigravity, Gemini Pro, ShapeLab Squad (shapelab-os)]
target_products:
  - "Mr. Coach (repo local: B2B-personal-ia)"
  - "ReformAI (repo local: ReformAI)"
  - "Smart EV Hub (repo local: Smart-EV-Hub)"
  - "Tattoo SaaS (planejado)"
core_stack: [Flutter (Mobile/Web/PWA), Python 3.11 (FastAPI + Pydantic v2), Cloudflare Pages/Workers (Edge), Supabase (PostgreSQL + RLS), Firebase, Render, Asaas API v3, Meta Cloud API + Evolution API, Gemini API]
ai_instruction: "Este documento contém a especificação completa do Shapelab Agent OS adaptado à arquitetura real da ShapeLab e integrado nativamente ao plugin shapelab-os do Google Antigravity. Se solicitado a inicializar o repositório, crie cada arquivo listado nas seções abaixo respeitando exatamente os caminhos e conteúdos especificados."
---

# Shapelab Brain — Sistema Operacional de Engenharia Autônoma (v2.3)

Este documento define a arquitetura, a integração com a **Squad ShapeLab (`shapelab-os`)**, os agentes estratégicos, as *skills* testadas em produção e o fluxo operacional do repositório central **`shapelab-brain`**, projetado para escalar múltiplos produtos SaaS da Shapelab operados por um fundador/desenvolvedor solo com **Google Antigravity** e **Gemini**.

---

## 1. Arquitetura Real do Ecossistema e Roteamento de Contexto

Para evitar poluição de contexto, custo excessivo de tokens e divergência entre projetos, o `shapelab-brain` atua como a **Memória Viva, Padrões de Código (Boilerplates) e Governança** que complementa o plugin global **`shapelab-os`** (`ShapeLab OS`) instalado no Antigravity.

### 1.1. Mapeamento Real de Produtos (`PROJETOS 2026`)
| Produto Comercial | Diretório / Repositório Local | Stack Principal & Foco |
| :--- | :--- | :--- |
| **Mr. Coach** | `B2B-personal-ia` | Flutter (Mobile/Web/PWA Dual-Theme) + FastAPI (Python 3.11) + Supabase + Asaas Split/JWS + WORM Ledger + WhatsApp Dual-Channel (Meta Cloud + Evolution) |
| **ReformAI** | `ReformAI` | Web/Edge (Cloudflare Workers/Pages, `_guard.ts`, PBKDF2-HMAC-SHA256) + FastAPI/Python + Motor Tributário (LC 214/2025, IBS/CBS) + Gemini API |
| **Smart EV Hub** | `Smart-EV-Hub` | Plataforma e inteligência para mobilidade elétrica, recarga e integrações IoT/SaaS |
| **Tattoo SaaS** | `tattoo-saas` *(Planejado)* | Vertical B2B2C para estúdios de tatuagem (reuso direto de Agenda, Split Asaas, Anamnese LGPD e WhatsApp Bot do Mr. Coach) |

### 1.2. Sinergia: Plugin Global (`shapelab-os`) vs. Repositório (`shapelab-brain`)
No Google Antigravity, já possuímos subagentes nativos invocáveis via `invoke_subagent`. O `shapelab-brain` não duplica esses subagentes — ele fornece os **contratos de código, ADRs, lições aprendidas e checklists de domínio** que esses subagentes consomem:

| Subagente Nativo (`invoke_subagent`) | Modelo Ideal | Papel Tático (Execução) | Arquivo de Referência no `shapelab-brain` |
| :--- | :--- | :--- | :--- |
| 🔍 `shapelab-spec-research` | `flash` | Varredura 360º *read-only*, mapeamento de impacto e transição Zero-Downtime | `agents/chief_architect.md` + `agents/cross_pollinator.md` |
| 🛡️ `shapelab-security-fintech` | `pro` / `inherit` | Auditoria Red-Team (`auth-anti-takeover`), RBAC/AAL2/RLS, BCB 4893, JWS Split, WORM Ledger e testes de concorrência | `agents/guardian_auditor.md` + `skills/payments/asaas_split.md` + `skills/security/auth_anti_takeover.md` |
| ⚙️ `shapelab-backend-qa` | `flash` / `inherit` | FastAPI, Supabase, Webhooks, Mensageria Dual-Channel e suíte Pytest (`ci-preflight`) | `skills/backend/supabase_rls.md` + `skills/growth/whatsapp_dual_channel.md` |
| 📱 `shapelab-mobile-ui` | `flash` / `inherit` | Flutter (Web/Android/iOS), Dual-Theme WCAG, Edge-to-Edge, cache offline v2 e `flutter test` | `skills/ui/flutter_edge_to_edge.md` |

### 1.3. Estrutura de Diretórios do `shapelab-brain`
~~~text
shapelab-brain/
├── INDEX.md                              # Roteador leve: mapeia "intenção -> subagente + arquivo"
├── CORE_CONSTITUTION.md                  # Regras globais inegociáveis (Spec-First, BCB 4893, Zero-Trust, FinOps)
├── agents/
│   ├── chief_architect.md                # Evolução técnica, Spec-First Gate, ADRs e retrospectiva de sessão
│   ├── cross_pollinator.md               # Extração de módulos e polinização entre B2B-personal-ia, ReformAI e Smart-EV-Hub
│   └── guardian_auditor.md               # Auditoria pré-merge (Red Team, BCB 4893, FinOps, LGPD, CI Preflight)
├── skills/                               # Blocos versionados e testados em produção (com código boilerplate real)
│   ├── payments/asaas_split.md           # Asaas v3 + JWS Split + Locks Anti-Double-Spend + WORM Ledger (BCB 4893)
│   ├── security/auth_anti_takeover.md    # Guards FastAPI/Edge (_guard.ts), Argon2id/PBKDF2, AAL2, Checkout Nonce
│   ├── ui/flutter_edge_to_edge.md        # Edge-to-Edge Bancário + Dual-Theme (Dark/Light WCAG)
│   ├── backend/supabase_rls.md           # Multi-tenant RLS + Anti-Recursão + Storage Privado LGPD
│   ├── growth/whatsapp_dual_channel.md   # Meta Cloud API (Primário) + Evolution API (Fallback Graceful Degradation)
│   ├── devops/versioning_and_ota_update.md # Versionamento Monotônico YYYYMMDDNN, Anti-Cache PWA/OTA e SemVer CI/CD
│   └── brand/shapelab_brand_identity.md  # Identidade Prism S Neon, tokens Web/SEO/PWA/Flutter
├── assets/
│   └── brand/
│       ├── brand_manifest.json           # Manifesto estruturado da marca (machine-readable)
│       ├── shapelab_logo_prism_s.png     # Monograma oficial Prism S (1:1)
│       └── shapelab_banner_prism_s.png   # Banner oficial SHAPELAB — AI VENTURE BUILDER (16:9)
├── memory/
│   ├── LESSONS_LEARNED.md                # Base de conhecimento viva (incidentes reais resolvidos e padrões blindados)
│   ├── TECH_RADAR.md                     # Tecnologias ADOTAR / EXPERIMENTAR / EVITAR na ShapeLab
│   ├── BRAIN_EVOLUTION_PROTOCOL.md       # Protocolo de autoatualização em loop fechado
│   └── adrs/                             # Histórico de decisões arquiteturais (ADR-001.md...)
├── scripts/
│   ├── brain_sync.ps1                    # Sincronização pull/contribute entre produtos e brain
│   └── brain_sync.sh                     # Equivalente Bash/Linux/CI
├── VERSION                               # Versão SemVer do próprio shapelab-brain
├── CHANGELOG.md                          # Histórico de versões do Agent OS
└── templates/
    ├── prd_mvp.md                        # Template Spec-First para novos SaaS ou módulos
    ├── skill_template.md                 # Molde obrigatório para documentar novas skills
    ├── github_workflow_brain_sync.yml    # Workflow diário para sincronizar .shapelab via PR
    └── AGENTS_brain_block.md             # Bloco padrão para AGENTS.md dos produtos
~~~

### 1.4. Integração nos Projetos (Workspace Multi-Root ou Git Submodule)
Você pode consumir o `shapelab-brain` de duas formas:
1. **Via Submódulo Git `.shapelab`** dentro de `B2B-personal-ia`, `ReformAI` e `Smart-EV-Hub`:
   ~~~bash
   git submodule add git@github.com:SEU_USUARIO/shapelab-brain.git .shapelab
   git submodule update --remote
   ~~~
2. **Via Irmão Local em `PROJETOS 2026\shapelab-brain`:** Como todos os projetos residem em `c:\Users\Cleudson\OneDrive\Documentos\PROJETOS 2026\`, os agentes podem consultar diretamente `../shapelab-brain/INDEX.md` ou `.shapelab/INDEX.md`.

---

## 2. Arquivo: `INDEX.md`

~~~markdown
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

## 3. Memória Viva & Templates (`/memory` e `/templates`)
- **Incidentes resolvidos e padrões blindados:** `memory/LESSONS_LEARNED.md`
- **Tecnologias aprovadas vs. banidas:** `memory/TECH_RADAR.md`
- **Protocolo de autoatualização do Brain:** `memory/BRAIN_EVOLUTION_PROTOCOL.md`
- **Decisões Arquiteturais (ADRs):** `memory/adrs/ADR-001-shapelab-agent-os.md`
- **Criar uma nova Skill:** `templates/skill_template.md`
- **Especificar um novo MVP ou Feature (Spec-First):** `templates/prd_mvp.md`
~~~

---

## 3. Arquivo: `CORE_CONSTITUTION.md`

~~~markdown
# Shapelab Core Constitution

Diretrizes técnicas e de governança inegociáveis aplicáveis a todos os produtos da Shapelab (`shapelab.ia.br`): **Mr. Coach (`B2B-personal-ia`)**, **ReformAI**, **Smart EV Hub** e novos SaaS.

## 1. Protocolo Spec-First Gate & Zero-Downtime
- **Levantamento 360º Obrigatório:** Em qualquer mudança arquitetural, sanitização de dados, refatoração ou migração de infraestrutura, execute primeiro um levantamento profundo de impacto (preferencialmente com `shapelab-spec-research`).
- **Trava de Escopo:** **NUNCA altere código** enquanto o escopo ou definições estiverem sob validação ou quando o usuário instruir para não modificar arquivos.
- **Transição em Duas Fases (Zero-Downtime):** Mudanças de chaves, URLs, schemas de banco ou contratos de API devem adotar suporte dual (Fase 1: convivência/fallback transparente; Fase 2: corte definitivo após maturação).

## 2. Stack Padrão e Infraestrutura Real
- **Frontend Mobile/Web/PWA:** Flutter (arquitetura limpa, responsiva, suporte a Edge-to-Edge, Dual-Theme Dark/Light com contraste WCAG e cache offline resiliente) ou Web/Edge leve no Cloudflare Pages quando aplicável (ex: landing/simuladores do ReformAI).
- **Backend / APIs / Edge:** Python 3.11 (FastAPI) com tipagem estrita (Pydantic v2) e operações assíncronas (`async/await` + `httpx.AsyncClient`), complementado por Cloudflare Workers em rotas de borda.
- **Banco de Dados & Storage:** Supabase (PostgreSQL + Auth + Storage Privado com RLS obrigatório).
- **Pagamentos & Fintech (Brasil):** Asaas API v3 (Pix, Cartão, Assinaturas e Split) sob blindagem **BCB 4893**.
- **Mensageria Crítica:** Arquitetura Dual-Channel (Meta Cloud API Oficial como canal primário + Evolution API como fallback automático com *Graceful Degradation*).
- **Inteligência Artificial:** Modelos Gemini via SDK oficial (`google-genai`), otimizando prompts para baixa latência, structured outputs e controle estrito de tokens.

## 3. Segurança Zero-Trust, Auth Anti-Takeover e BCB 4893 (Inviolável)
- **Fail-Closed & Zero Security-by-Obscurity:** Ocultar botões no frontend ou checar `localStorage` não é controle de acesso. Todo endpoint privado e tela interna deve validar sessão e papel (RBAC) no servidor (`Depends(get_current_*)` no FastAPI ou `_guard.ts` recebendo `{ request, env, ctx }` no Cloudflare Worker), negando com HTTP `401`/`403` por padrão.
- **Proteção contra Account Takeover em Fluxos Públicos:** Cadastros simplificados ou checkouts públicos jamais podem sobrescrever senha, role (`trainer`, `admin`) ou metadados de contas existentes. O polling pós-checkout exige `checkout_nonce` criptográfico de uso único e curta expiração.
- **Isolamento de Contas Sintéticas:** Contas de automação (`wa_*`, `aluno_*`, `bot_*`, `*.internal`) são bloqueadas por guard e rotina de startup contra qualquer elevação para `admin` ou `vip`.
- **Criptografia de Credenciais e Anti-Força Bruta:** Quando senhas forem gerenciadas fora do Supabase Auth, usar estritamente **Argon2id** (Python) ou **PBKDF2-HMAC-SHA256** (`>= 100.000` iterações + salt CSPRNG `>= 16 bytes` em Edge Workers), comparação em tempo constante (`hmac.compare_digest` / XOR bitwise) e *lazy rehash* automático. Aplicar lockout (`HTTP 429` + `Retry-After`) após 5 falhas por `(identificador, IP)`.
- **MFA Escalável (AAL2) e Kill-Switch de Sessão:** Operações críticas (saques, split, painel admin, contexto profissional) exigem sessão rastreada por `device_id` (`X-Device-Id`), validação AAL2 quando aplicável e invalidação real no servidor no logout (`sessions_revoked_before` / `DELETE`).
- **Blindagem Financeira BCB 4893:**
  1. **Precisão em Centavos:** Valores monetários internos operam como inteiros em centavos (`amount_cents`) ou `Decimal` estrito, nunca `float` binário solto em cálculos de saldo.
  2. **Locks Pessimistas Anti-Double-Spend:** Mutações de carteira/saque rodam sob `SELECT ... FOR UPDATE` (ou lock atômico com timeout) e validação de saldo não-negativo.
  3. **Split Assinado (JWS):** Regras de split vindas do cliente devem ser assinadas e verificadas via JWS no backend antes do envio ao Asaas.
  4. **Idempotência + WORM Ledger:** Todo webhook financeiro valida token em tempo constante, garante idempotência via constraint `UNIQUE` (`event_id`) e grava na trilha imutável `financial_audit_ledger` encadeada por hash `SHA-256(prev_hash + timestamp + payload)`.

## 4. Higiene de Código, Testes Adversariais e CI Preflight
- **Mentalidade Solo-Founder (Anti-Overengineering):** Priorize arquiteturas modulares fáceis de manter e depurar por uma pessoa, sem infraestrutura ociosa cara.
- **Testes Adversariais & CI Preflight:** Código que manipula saldo, autenticação ou estado compartilhado deve ser testado contra *race conditions* (requisições concorrentes) e payloads adulterados. Nenhuma entrega está pronta sem rodar a suíte de testes local (`pytest` / `flutter analyze` / `flutter test`) e limpar todos os arquivos temporários de scratch.
~~~

---

## 4. Tríade de Agentes Estratégicos (`/agents`)

### 4.1. `agents/chief_architect.md`
~~~markdown
# ROLE: Shapelab Chief Architect & Spec-First Governor

Você é o Arquiteto Principal da Shapelab (`shapelab.ia.br`), responsável pela coerência técnica entre **Mr. Coach (`B2B-personal-ia`)**, **ReformAI**, **Smart EV Hub** e **Tattoo SaaS**. Você trabalha em conjunto com o subagente `shapelab-spec-research`.

## DIRETRIZES DE OPERAÇÃO
1. **Execução do Protocolo Spec-First Gate:**
   - Antes de qualquer refatoração, mudança de contrato ou nova feature, mapeie:
     1. Superfície afetada (rotas, tabelas Supabase, variáveis `.env`, webhooks externos, cache local).
     2. Risco de quebra (QR codes em circulação, sessões ativas, webhooks Asaas/WhatsApp em voo).
     3. Plano de transição Zero-Downtime em 2 fases (Suporte Dual -> Corte Definitivo).
     4. Matriz numerada de decisões em aberto para aprovação do fundador.

2. **Aprendizado Contínuo (Sessão -> Memória Viva):**
   - Sempre que concluirmos uma entrega complexa, blindagem de segurança ou correção de bug crítico, analise o `git diff` da sessão.
   - Extraia: (a) Causa raiz; (b) Padrão definitivo adotado; (c) Quais outros repositórios da Shapelab precisam receber essa vacina.
   - Proponha a atualização concisa em `memory/LESSONS_LEARNED.md` ou na skill correspondente em `skills/`.

3. **Radar Tecnológico & FinOps Solo-Founder:**
   - Antes de introduzir qualquer dependência ou serviço externo, consulte `memory/TECH_RADAR.md`.
   - Se houver alternativa mais simples, nativa ou com menor custo fixo/variável (Render, Supabase, Cloudflare, tokens Gemini, taxas de mensageria), emita um **ADR enxuto** comparando complexidade de manutenção vs. benefício real.
~~~

### 4.2. `agents/cross_pollinator.md`
~~~markdown
# ROLE: Shapelab Cross-Pollinator & Code Reuse Engine

Você é o motor de polinização cruzada da Shapelab. Sua missão é transformar cada problema difícil resolvido em `B2B-personal-ia` (Mr. Coach), `ReformAI` ou `Smart-EV-Hub` em um ativo plugável para todo o portfólio.

## DIRETRIZES DE OPERAÇÃO
1. **Mapeamento de Ativos Exportáveis:**
   - Identifique módulos maduros em um repositório que resolvem dores universais dos nossos SaaS:
     - **De `B2B-personal-ia`:** Motor Asaas Split + WORM Ledger (`asaas_split.md`), Mensageria WhatsApp Dual-Channel (`whatsapp_dual_channel.md`), Shell Flutter Edge-to-Edge Dual-Theme (`flutter_edge_to_edge.md`), Isolamento Multi-Tenant B2B2C (`supabase_rls.md`).
     - **De `ReformAI`:** Guard unificado de Edge Workers (`_guard.ts`), Hashing PBKDF2 Web Crypto sem dependências externas (`auth_anti_takeover.md`), Motor de Regras Tributárias parametrizadas (IBS/CBS/ISS).

2. **Protocolo de Extração de Skill:**
   - Ao extrair um módulo, remova nomes hardcoded de domínio (ex: trocar `trainer_id` / `workout_id` por `tenant_id` / `resource_id`) mantendo 100% das proteções de segurança (locks, RLS, rate limit, logs estruturados).
   - Documente ou atualize o arquivo em `skills/[categoria]/[nome].md` seguindo `templates/skill_template.md`.

3. **Polinização Assistida:**
   - Ao aplicar uma skill em outro projeto, valide a compatibilidade de variáveis de ambiente, crie as migrations SQL com RLS incluído e acione `shapelab-backend-qa` ou `shapelab-mobile-ui` para rodar a suíte de testes do projeto destino.
~~~

### 4.3. `agents/guardian_auditor.md`
~~~markdown
# ROLE: Shapelab Guardian Auditor (Red Team, BCB 4893, FinOps & LGPD)

Você é o Auditor Pré-Merge implacável da Shapelab (`shapelab.ia.br`). Você opera em sinergia direta com o subagente `shapelab-security-fintech` antes que qualquer código chegue à branch `main` ou produção.

## PILARES DE AUDITORIA (CHECKLIST OBRIGATÓRIO)
1. **Auth Anti-Takeover & Zero-Trust (`skills/security/auth_anti_takeover.md`):**
   - Rotas privadas no FastAPI (`Depends(...)`) ou Cloudflare Workers (`_guard.ts` com `{ request, env, ctx }`) operam em modo *fail-closed* retornando `401`/`403`?
   - Há qualquer senha, hash, token administrativo ou fallback hardcoded no código?
   - Fluxos públicos (checkout, lead, webhook) impedem sobrescrita de contas existentes e exigem `checkout_nonce` de uso único?
   - Contas sintéticas (`wa_*`, `aluno_*`, `*.internal`) estão bloqueadas de privilégios administrativos?
   - Senhas locais usam Argon2id ou PBKDF2 (`>= 100k` iterações + salt CSPRNG) com comparação *constant-time* e lockout `429` após 5 tentativas?

2. **Blindagem Financeira BCB 4893 (`skills/payments/asaas_split.md`):**
   - Mutações de saldo/saque usam lock pessimista (`SELECT ... FOR UPDATE` ou equivalente atômico) contra *double-spend* em requisições concorrentes?
   - Regras de split são validadas/assinadas no servidor (JWS) e valores operam sem erro de ponto flutuante (`amount_cents` / `Decimal`)?
   - Webhooks Asaas validam `asaas-access-token` com `hmac.compare_digest`, garantem idempotência por `event_id UNIQUE` e gravam no `financial_audit_ledger` (WORM SHA-256)?

3. **Banco Multi-Tenant, LGPD & FinOps (`skills/backend/supabase_rls.md`):**
   - Toda tabela nova possui `ENABLE ROW LEVEL SECURITY`, políticas com `(select auth.uid())` e índices em `tenant_id` / `client_id`?
   - Arquivos sensíveis (fotos corporais, laudos, documentos fiscais) estão em bucket privado com política RLS por pasta `{tenant_id}/{client_id}/` e nunca vazam em logs?
   - Chamadas à Gemini API e mensageria WhatsApp possuem timeout, limite de tokens/retries e fallback gracioso sem risco de loop infinito de custo?

4. **Qualidade Mobile/Web & CI Preflight:**
   - Telas Flutter respeitam Edge-to-Edge, contraste WCAG nos temas Dark/Light e bloqueio contra clique duplo em pagamentos?
   - A suíte de testes (`pytest` / `flutter analyze` / `flutter test`) passou 100% e o repositório está limpo de arquivos temporários?

## CLASSIFICAÇÃO DE SEVERIDADE
- `[BLOCKER]`: Impede o merge imediatamente (falha de takeover, rota privada sem guard, tabela sem RLS, ausência de lock financeiro/idempotência, segredo exposto, teste quebrado).
- `[HIGH]`: Risco financeiro, ausência de WORM ledger, query sem índice em tabela grande ou falha de fallback Dual-Channel.
- `[MEDIUM]`: Melhoria de UX, contraste, tipagem Pydantic ou observabilidade.
- `[OK]`: Pilar verificado e em conformidade com a Constituição Shapelab.

## FORMATO DE SAÍDA
### Veredito: [APROVADO | APROVADO COM RESSALVAS | BLOQUEADO]
#### Achados
- `[SEVERIDADE]` `arquivo:linha` — Descrição objetiva da vulnerabilidade/risco + Correção exata.
#### Resumo por Pilar
Tabela com status (`OK` / `ALERTA` / `BLOCKER`) para: (1) Auth & Zero-Trust, (2) Fintech BCB 4893, (3) RLS, LGPD & FinOps, (4) Mobile/Web & CI Preflight.
~~~

---

## 5. Template e Biblioteca de Skills Oficiais (`/templates` e `/skills`)

### 5.1. `templates/skill_template.md`
~~~markdown
---
id: skill-[categoria]-[nome]
version: 1.0.0
status: draft | production-verified | deprecated
last_verified: AAAA-MM-DD
origin_project: [B2B-personal-ia | ReformAI | Smart-EV-Hub | tattoo-saas]
compatible_subagent: [shapelab-security-fintech | shapelab-backend-qa | shapelab-mobile-ui | shapelab-spec-research]
stack: [ex: python, fastapi, flutter, cloudflare-workers, supabase, asaas]
---

# Skill: [Nome Claro da Capacidade]

## 1. Objetivo
Descreva em 1 ou 2 frases o problema que esta skill resolve e quando o agente ou subagente deve carregá-la.

## 2. Contrato de Entrada e Dependências
- Variáveis de Ambiente (`.env`), Pacotes/Bibliotecas e Pré-requisitos de Banco/Infra.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- Lições reais aprendidas nos projetos da Shapelab para evitar regressões, brechas de segurança ou custos extras.

## 4. Implementação Agnóstica (Boilerplate Blindado)
- Código limpo, desacoplado de entidades específicas de um único SaaS, pronto para adaptação.

## 5. Critério de Aceite e Testes Adversariais
- Testes objetivos (incluindo concorrência e casos de falha) que provam que a implementação está segura.
~~~

---

### 5.2. `skills/payments/asaas_split.md`
~~~markdown
---
id: skill-payments-asaas-split
version: 2.0.0
status: production-verified
last_verified: 2026-11-22
origin_project: B2B-personal-ia
compatible_subagent: shapelab-security-fintech
stack: [python-3.11, fastapi, pydantic-v2, httpx, supabase, asaas-api-v3, bcb-4893]
---

# Skill: Pagamentos Asaas v3 com Split JWS, Lock Anti-Double-Spend e WORM Ledger (BCB 4893)

## 1. Objetivo
Padronizar cobranças (Pix e Cartão), Split de Pagamentos assinado (JWS), mutações atômicas de carteira e processamento idempotente de webhooks Asaas com trilha de auditoria imutável (WORM Ledger — padrão BCB 4893).

## 2. Contrato de Entrada e Dependências
- **`.env`:** `ASAAS_API_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `SPLIT_JWS_SECRET`.
- **Pacotes:** `fastapi>=0.115.0`, `httpx>=0.27.0`, `pydantic>=2.9.0`.
- **Banco (PostgreSQL / Supabase):**
  - `payment_events (event_id TEXT PRIMARY KEY, event_type TEXT, payload JSONB, processed_at TIMESTAMPTZ)`
  - `financial_audit_ledger (id BIGSERIAL PRIMARY KEY, prev_hash TEXT NOT NULL, entry_hash TEXT UNIQUE NOT NULL, event_type TEXT NOT NULL, reference_id TEXT NOT NULL, amount_cents BIGINT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- **Comparação de Token do Webhook:** Use `hmac.compare_digest` para validar o header `asaas-access-token`, nunca `==` simples.
- **Anti-Double-Spend (Race Condition):** Webhooks simultâneos ou cliques duplos de saque podem creditar/debitar duas vezes. Sempre adquira lock pessimista (`SELECT ... FOR UPDATE`) na linha da carteira/fatura e registre `event_id` com `INSERT ... ON CONFLICT DO NOTHING` dentro da mesma transação.
- **Integridade do Split (JWS):** Nunca confie em percentuais de split enviados pelo frontend sem validar a assinatura HMAC/JWS gerada pelo backend.
- **Precisão Monetária:** Converta e valide valores internamente em centavos (`amount_cents: int`) ou `Decimal`, convertendo para `float(Decimal(amount_cents) / 100)` apenas na serialização do payload para o Asaas.

## 4. Implementação Agnóstica (Boilerplate Blindado)
```python
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
import httpx
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/payments", tags=["Asaas Fintech BCB 4893"])

ASAAS_API_URL = os.getenv("ASAAS_API_URL", "https://sandbox.asaas.com/api/v3")
ASAAS_API_KEY = os.getenv("ASAAS_API_KEY", "")
ASAAS_WEBHOOK_TOKEN = os.getenv("ASAAS_WEBHOOK_TOKEN", "")
SPLIT_JWS_SECRET = os.getenv("SPLIT_JWS_SECRET", "")


class SplitRule(BaseModel):
    walletId: str = Field(min_length=8)
    percentualValue: Decimal | None = Field(default=None, gt=0, le=100)
    fixedValueCents: int | None = Field(default=None, gt=0)


class CreateChargeRequest(BaseModel):
    customer_id: str
    billing_type: str = Field(pattern="^(PIX|CREDIT_CARD)$")
    amount_cents: int = Field(gt=0)
    due_date: str  # YYYY-MM-DD
    description: str
    external_reference: str
    splits: list[SplitRule] = []
    split_signature: str | None = None


def sign_split_rules(external_reference: str, amount_cents: int, splits: list[SplitRule]) -> str:
    if not SPLIT_JWS_SECRET:
        raise RuntimeError("SPLIT_JWS_SECRET não configurado")
    canonical = json.dumps(
        {
            "ref": external_reference,
            "amount_cents": amount_cents,
            "splits": [s.model_dump(mode="json", exclude_none=True) for s in splits],
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hmac.new(SPLIT_JWS_SECRET.encode(), canonical, hashlib.sha256).hexdigest()


def compute_worm_hash(prev_hash: str, timestamp_iso: str, payload: dict) -> str:
    canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    raw = f"{prev_hash}|{timestamp_iso}|{canonical_payload}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


async def create_asaas_charge(payload: CreateChargeRequest) -> dict:
    if payload.splits:
        expected_sig = sign_split_rules(payload.external_reference, payload.amount_cents, payload.splits)
        if not payload.split_signature or not hmac.compare_digest(payload.split_signature, expected_sig):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assinatura JWS de split inválida")

    headers = {"access_token": ASAAS_API_KEY, "Content-Type": "application/json"}
    value_reais = float(Decimal(payload.amount_cents) / Decimal(100))
    body: dict = {
        "customer": payload.customer_id,
        "billingType": payload.billing_type,
        "value": value_reais,
        "dueDate": payload.due_date,
        "description": payload.description,
        "externalReference": payload.external_reference,
    }
    if payload.splits:
        body["split"] = [
            {
                "walletId": s.walletId,
                **(
                    {"percentualValue": float(s.percentualValue)}
                    if s.percentualValue is not None
                    else {}
                ),
                **(
                    {"fixedValue": float(Decimal(s.fixedValueCents) / Decimal(100))}
                    if s.fixedValueCents is not None
                    else {}
                ),
            }
            for s in payload.splits
        ]

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(f"{ASAAS_API_URL}/payments", json=body, headers=headers)
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Erro Asaas: {resp.text}")
        return resp.json()


@router.post("/webhook/asaas", status_code=status.HTTP_200_OK)
async def asaas_webhook(
    request: Request,
    asaas_access_token: str | None = Header(default=None, alias="asaas-access-token"),
):
    if (
        not ASAAS_WEBHOOK_TOKEN
        or not asaas_access_token
        or not hmac.compare_digest(asaas_access_token.encode(), ASAAS_WEBHOOK_TOKEN.encode())
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    payload = await request.json()
    event_id = payload.get("id")
    event_type = payload.get("event")
    payment = payload.get("payment") or {}

    if not event_id or not event_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload malformado")

    # 1. Idempotência atômica: INSERT INTO payment_events (event_id, ...) ON CONFLICT DO NOTHING
    # Se 0 linhas inseridas -> retornar {"status": "ignored", "event_id": event_id}
    # 2. Adquirir lock pessimista na carteira/fatura (SELECT ... FOR UPDATE)
    # 3. Registrar bloco no WORM Ledger (financial_audit_ledger) com compute_worm_hash(prev_hash, now_iso, payload)
    now_iso = datetime.now(timezone.utc).isoformat()
    entry_hash = compute_worm_hash("GENESIS_OR_LAST_HASH", now_iso, payload)

    return {"status": "processed", "event_id": event_id, "ledger_hash": entry_hash}
```

## 5. Critério de Aceite e Testes Adversariais
1. `POST /payments/webhook/asaas` com token ausente ou divergente -> `401 Unauthorized` (comparação em tempo constante).
2. Disparo de 10 requisições simultâneas (`asyncio.gather`) com o mesmo `event.id` ou tentativa de saque concorrente -> apenas 1 mutação efetivada, saldo nunca negativo e 1 único registro de crédito no `financial_audit_ledger`.
3. Tentativa de adulterar `percentualValue` do split no payload sem atualizar `split_signature` -> bloqueado com `403 Forbidden`.
~~~

---

### 5.3. `skills/security/auth_anti_takeover.md`
~~~markdown
---
id: skill-security-auth-anti-takeover
version: 1.0.0
status: production-verified
last_verified: 2026-11-22
origin_project: B2B-personal-ia
compatible_subagent: shapelab-security-fintech
stack: [python-3.11, fastapi, cloudflare-workers, typescript, web-crypto-pbkdf2, argon2id, rbac, aal2]
---

# Skill: Blindagem Auth Anti-Takeover, Guards Fail-Closed e Hashing Seguro

## 1. Objetivo
Impedir elevação de privilégio, sobrescrita de contas em checkouts públicos, força bruta e acesso não autorizado a endpoints/telas internas tanto em backends **FastAPI** quanto em **Cloudflare Edge Workers**.

## 2. Contrato de Entrada e Dependências
- **Regras Universais:**
  - Zero senhas ou chaves estáticas em código-fonte.
  - Resposta uniforme em falha de login (`401`: `"Credenciais inválidas ou acesso não autorizado."`) para impedir enumeração de usuários.
  - Lockout (`429 Too Many Requests` + header `Retry-After`) após 5 falhas em janela de 15 min por `(identificador, IP)`.
  - Contas sintéticas (`wa_*`, `aluno_*`, `bot_*`, `*.internal`) proibidas de receber `role in ('admin', 'vip')`.
  - Fluxo público pós-checkout utiliza `checkout_nonce` de uso único (TTL <= 5 min) e jamais sobrescreve usuário já existente.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- **Cloudflare Workers CPU Limit:** Em Edge Workers sem bibliotecas nativas C, use **PBKDF2-HMAC-SHA256** via Web Crypto API com `100.000` iterações e salt CSPRNG de 16 bytes (`pbkdf2_sha256$100000$<saltHex>$<hashHex>`), implementando *lazy rehash* no login caso encontre formato legado.
- **FastAPI Guard:** Sempre valide se o token foi emitido após `user.sessions_revoked_before` e se a rota exige `AAL2` (MFA verificado).
- **Telas Internas Web:** Nunca embuta dados sensíveis no HTML estático; exija validação prévia no servidor e adicione `<meta name="robots" content="noindex, nofollow" />`.

## 4. Implementação Agnóstica (Boilerplate Edge Worker + FastAPI)
```typescript
// Cloudflare Worker: PBKDF2-HMAC-SHA256 Zero-Dependency + Constant-Time Compare
const ITERATIONS = 100_000;

export async function verifyPasswordPBKDF2(password: string, stored: string): Promise<boolean> {
  if (!password || password.length > 256 || !stored.startsWith("pbkdf2_sha256$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const salt = hexToBytes(parts[2]);
  const expectedHash = hexToBytes(parts[3]);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    expectedHash.length * 8
  );
  const actualHash = new Uint8Array(derivedBits);
  if (actualHash.length !== expectedHash.length) return false;

  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) {
    diff |= actualHash[i] ^ expectedHash[i];
  }
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
```

## 5. Critério de Aceite e Testes Adversariais
1. Submeter checkout público com e-mail de um `admin` ou `trainer` existente -> sistema cria a cobrança vinculada mas **não** altera senha, role nem retorna sessão sem autenticação.
2. 6 tentativas seguidas de login com senha errada -> 6ª tentativa bloqueada com `429 Too Many Requests` e header `Retry-After`.
3. Acesso a qualquer rota privada ou download de PDF/relatório sem `Authorization: Bearer <jwt_valido>` -> `401 Unauthorized` imediato.
~~~

---

### 5.4. `skills/ui/flutter_edge_to_edge.md`
~~~markdown
---
id: skill-ui-flutter-edge-to-edge
version: 2.0.0
status: production-verified
last_verified: 2026-11-22
origin_project: B2B-personal-ia
compatible_subagent: shapelab-mobile-ui
stack: [flutter, dart, material-3, dual-theme-wcag]
---

# Skill: Layout Imersivo Edge-to-Edge + Dual-Theme WCAG no Flutter

## 1. Objetivo
Configurar apps Flutter (Android, iOS e Web/PWA) para renderização imersiva de ponta a ponta (padrão Nubank/Itaú) com suporte nativo a **Dual-Theme (Dark/Light)** e contraste estrito WCAG AA/AAA.

## 2. Contrato de Entrada e Dependências
- **SDK:** Flutter >= 3.24 (Dart >= 3.5) com `useMaterial3: true`.
- **Android (`MainActivity.kt`):** `WindowCompat.setDecorFitsSystemWindows(window, false)`.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- Nunca envolva o `Scaffold` inteiro em um `SafeArea` (cria faixas pretas/brancas sólidas no topo e na barra de gestos).
- Defina `systemNavigationBarContrastEnforced: false` para remover o *scrim* translúcido cinza na barra de gestos do Android.
- **Dual-Theme WCAG:** Nunca use cores fixas (`Colors.black`, `Colors.white70`) em textos ou ícones de superfície; derive sempre de `Theme.of(context).colorScheme` e ajuste `darkSystemIcons` dinamicamente conforme `Theme.of(context).brightness`.

## 4. Implementação Agnóstica (Boilerplate)
```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void initEdgeToEdge() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarDividerColor: Colors.transparent,
      systemNavigationBarContrastEnforced: false,
    ),
  );
}

class EdgeToEdgeScaffold extends StatelessWidget {
  final Widget body;
  final PreferredSizeWidget? appBar;
  final Widget? bottomNavigationBar;
  final Color? backgroundColor;
  final bool? darkSystemIcons;
  final bool safeTop;
  final bool safeBottom;

  const EdgeToEdgeScaffold({
    super.key,
    required this.body,
    this.appBar,
    this.bottomNavigationBar,
    this.backgroundColor,
    this.darkSystemIcons,
    this.safeTop = false,
    this.safeBottom = true,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isLight = theme.brightness == Brightness.light;
    final useDarkIcons = darkSystemIcons ?? isLight;

    final overlayStyle = SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarContrastEnforced: false,
      statusBarIconBrightness: useDarkIcons ? Brightness.dark : Brightness.light,
      statusBarBrightness: useDarkIcons ? Brightness.light : Brightness.dark,
      systemNavigationBarIconBrightness: useDarkIcons ? Brightness.dark : Brightness.light,
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlayStyle,
      child: Scaffold(
        backgroundColor: backgroundColor ?? theme.colorScheme.surface,
        extendBody: true,
        extendBodyBehindAppBar: true,
        appBar: appBar,
        body: SafeArea(top: safeTop, bottom: safeBottom, child: body),
        bottomNavigationBar: bottomNavigationBar,
      ),
    );
  }
}
```

## 5. Critério de Aceite
1. Fundo/header estende-se por trás do relógio e da barra de gestos sem faixas sólidas tanto no tema Dark quanto no Light.
2. Ícones da barra de status alternam automaticamente entre claros e escuros ao trocar o tema do app.
3. `flutter analyze` com zero avisos e widget tests validando ausência de `RenderFlex overflowed`.
~~~

---

### 5.5. `skills/backend/supabase_rls.md`
~~~markdown
---
id: skill-backend-supabase-rls
version: 1.1.0
status: production-verified
last_verified: 2026-11-22
origin_project: B2B-personal-ia
compatible_subagent: shapelab-security-fintech
stack: [supabase, postgresql, rls, sql, fastapi, flutter]
---

# Skill: Blindagem Multi-Tenant com Supabase RLS (B2B2C)

## 1. Objetivo
Garantir isolamento estrito de dados em bancos multi-tenant (Profissional/Estúdio/Operador -> Cliente/Aluno) usando Row Level Security (RLS) no PostgreSQL e no Supabase Storage (LGPD).

## 2. Contrato de Entrada e Dependências
- **Chaves:** `SUPABASE_ANON_KEY` (Flutter/Web, sujeita a RLS) e `SUPABASE_SERVICE_ROLE_KEY` (restrita exclusivamente ao backend FastAPI).
- **Schema:** Tabelas com `tenant_id UUID NOT NULL`, `client_id UUID` e tabela `tenant_members (tenant_id, user_id, role)`.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- **Performance (*initPlan*):** Envolva sempre em `(select auth.uid())` para que o PostgreSQL faça cache do UID por query em vez de reavaliar linha a linha.
- **Recursão Infinita:** Use função `SECURITY DEFINER` com `SET search_path = public` para consultar `tenant_members`.
- **Índices Obrigatórios:** Crie índices em `tenant_id` e `client_id` em todas as tabelas protegidas por RLS.
- **Storage LGPD:** Fotos corporais, anamneses e documentos fiscais devem ficar em buckets privados (`public = false`) com RLS em `storage.objects` validando `{tenant_id}/{client_id}/{filename}`.

## 4. Implementação Agnóstica (Boilerplate SQL)
```sql
-- 1. Função auxiliar anti-recursão
CREATE OR REPLACE FUNCTION public.get_my_staff_tenants()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT tenant_id FROM public.tenant_members
  WHERE user_id = (select auth.uid()) AND role IN ('owner', 'staff');
$$;

-- 2. Índices + RLS em tabela multi-tenant (ex: records)
CREATE INDEX IF NOT EXISTS idx_records_tenant_id ON public.records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_records_client_id ON public.records (client_id);
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all_tenant_records" ON public.records FOR ALL TO authenticated
USING (tenant_id IN (SELECT public.get_my_staff_tenants()))
WITH CHECK (tenant_id IN (SELECT public.get_my_staff_tenants()));

CREATE POLICY "client_select_own_records" ON public.records FOR SELECT TO authenticated
USING (client_id = (select auth.uid()));

-- 3. Blindagem de Storage Privado ({tenant_id}/{client_id}/{filename})
CREATE POLICY "tenant_and_client_read_private_media" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'private-media' AND (
    (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_staff_tenants())
    OR (storage.foldername(name))[2]::uuid = (select auth.uid())
  )
);
```

## 5. Critério de Aceite
1. Tenant A tentando ler/alterar dados do Tenant B -> `[]` / `0 rows affected`.
2. Cliente 1 tentando ler dados ou mídia do Cliente 2 no mesmo tenant -> `[]`.
3. Supabase Security Advisor retorna zero tabelas de negócio com `rowsecurity = false`.
~~~

---

### 5.6. `skills/growth/whatsapp_dual_channel.md`
~~~markdown
---
id: skill-growth-whatsapp-dual-channel
version: 1.0.0
status: production-verified
last_verified: 2026-11-22
origin_project: B2B-personal-ia
compatible_subagent: shapelab-backend-qa
stack: [python-3.11, fastapi, httpx, meta-cloud-api, evolution-api]
---

# Skill: Mensageria WhatsApp Dual-Channel com Graceful Degradation

## 1. Objetivo
Garantir entrega resiliente de mensagens transacionais e fluxos conversacionais no WhatsApp usando a **Meta Cloud API Oficial** como canal primário e a **Evolution API** como contingência automática, sem ponto único de falha.

## 2. Contrato de Entrada e Dependências
- **`.env`:** `META_WA_TOKEN`, `META_WA_PHONE_ID`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_FALLBACK_INSTANCE`.
- **Pacotes:** `httpx>=0.27.0`, `pydantic>=2.9.0`.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- **Limite de 20 Caracteres da Meta:** Botões interativos na Meta Cloud API falham com HTTP 400 se o título ultrapassar 20 caracteres. Trunque ou valide previamente no schema Pydantic.
- **Graceful Degradation para Texto Numérico:** Quando o canal primário falhar ou a instância de contingência não suportar botões nativos, converta automaticamente os botões em lista numerada em texto puro (`*1* - Confirmar\n*2* - Reagendar`) e marque `interactive_degraded: true` no resultado para o parser de webhook saber interpretar a resposta `"1"` ou `"2"`.
- **Roteamento Multi-Instância:** Se a instância dedicada do profissional/tenant estiver desconectada, faça fallback transparente para a instância oficial da plataforma (`EVOLUTION_FALLBACK_INSTANCE`).

## 4. Implementação Agnóstica (Boilerplate)
```python
import httpx
from pydantic import BaseModel, Field


class InteractiveButton(BaseModel):
    id: str
    title: str = Field(max_length=20)


def format_degraded_text(body_text: str, buttons: list[InteractiveButton]) -> str:
    if not buttons:
        return body_text
    options = "\n".join(f"*{idx}* - {btn.title}" for idx, btn in enumerate(buttons, start=1))
    return f"{body_text}\n\nResponda com o número da opção:\n{options}"


async def send_whatsapp_dual_channel(
    phone_e164: str,
    body_text: str,
    buttons: list[InteractiveButton] | None = None,
    meta_token: str = "",
    meta_phone_id: str = "",
    evolution_url: str = "",
    evolution_key: str = "",
    evolution_instance: str = "shapelab-default",
) -> dict:
    buttons = buttons or []

    # 1. Tentativa no Canal Primário (Meta Cloud API Oficial)
    if meta_token and meta_phone_id:
        try:
            meta_url = f"https://graph.facebook.com/v21.0/{meta_phone_id}/messages"
            headers = {"Authorization": f"Bearer {meta_token}", "Content-Type": "application/json"}
            if buttons:
                payload = {
                    "messaging_product": "whatsapp",
                    "to": phone_e164,
                    "type": "interactive",
                    "interactive": {
                        "type": "button",
                        "body": {"text": body_text},
                        "action": {
                            "buttons": [
                                {"type": "reply", "reply": {"id": b.id, "title": b.title[:20]}}
                                for b in buttons[:3]
                            ]
                        },
                    },
                }
            else:
                payload = {
                    "messaging_product": "whatsapp",
                    "to": phone_e164,
                    "type": "text",
                    "text": {"body": body_text},
                }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(meta_url, json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    return {"channel": "meta_cloud", "interactive_degraded": False, "data": resp.json()}
        except httpx.HTTPError:
            pass  # Cai graciosamente para o canal de contingência

    # 2. Fallback Automático com Graceful Degradation (Evolution API)
    degraded_text = format_degraded_text(body_text, buttons)
    evo_endpoint = f"{evolution_url.rstrip('/')}/message/sendText/{evolution_instance}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            evo_endpoint,
            json={"number": phone_e164, "text": degraded_text},
            headers={"apikey": evolution_key, "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return {
            "channel": "evolution_fallback",
            "interactive_degraded": bool(buttons),
            "data": resp.json(),
        }
```

## 5. Critério de Aceite
1. Com Meta Cloud API online -> envia mensagem interativa com botões nativos (`channel: "meta_cloud"`, `interactive_degraded: false`).
2. Simulando timeout/erro 500 na Meta Cloud API -> faz fallback transparente para Evolution API convertendo botões para opções numéricas (`channel: "evolution_fallback"`, `interactive_degraded: true`).
~~~

---

### 5.7. `skills/devops/versioning_and_ota_update.md`
Skill de produção unificando o motor Flutter/PWA (`tool/update_version.dart` com build monotônico `YYYYMMDDNN`, `initAssetCacheGuard`, `PwaUpdateWrapper` anti-loop e GC no Firebase Hosting) com o gerador SemVer 2.0 + Git SHA (`scripts/version.py`) do `ReformAI`.
Consulte o arquivo completo em [skills/devops/versioning_and_ota_update.md](skills/devops/versioning_and_ota_update.md).

---

## 6. Memória Inicial e Templates (`/memory` e `/templates`)

### 6.1. `memory/LESSONS_LEARNED.md`
~~~markdown
# Shapelab — Base de Conhecimento Viva (Lessons Learned)

Registro consolidado de aprendizados reais extraídos de **Mr. Coach (`B2B-personal-ia`)**, **ReformAI** e **Smart EV Hub**.

| ID | Data | Origem | Categoria | Causa Raiz / Problema | Solução Definitiva (Padrão ShapeLab) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `LL-001` | 2026-11 | `B2B-personal-ia` | Fintech / BCB 4893 | Webhooks concorrentes do Asaas ou cliques duplos em saque podiam gerar condição de corrida (*double-spend*). | Lock pessimista (`SELECT ... FOR UPDATE`), idempotência por `event_id UNIQUE` e trilha imutável `financial_audit_ledger` (WORM SHA-256) com split assinado via JWS. |
| `LL-002` | 2026-11 | `B2B-personal-ia` / `ReformAI` | Segurança / Auth | Fluxos públicos de checkout ou chaves/fallbacks estáticos em rotas privadas permitiam risco de *account takeover* ou bypass. | Guard centralizado *fail-closed* (`Depends` no FastAPI / `_guard.ts` no Worker), PBKDF2 100k iterações ou Argon2id, `checkout_nonce` de uso único e bloqueio de contas sintéticas (`wa_*`, `aluno_*`). |
| `LL-003` | 2026-11 | `B2B-personal-ia` | WhatsApp / Growth | Oscilações na API de mensageria ou botões > 20 caracteres quebravam fluxos críticos de treino/cobrança. | Arquitetura Dual-Channel: Meta Cloud API primária + fallback automático para Evolution API convertendo botões em menu numérico (`interactive_degraded: true`). |
| `LL-004` | 2026-11 | `B2B-personal-ia` | Flutter UI | Contraste quebrado ao alternar entre Dark e Light Theme e faixas sólidas nas barras do sistema Android/iOS. | `EdgeToEdgeScaffold` acoplado ao `Theme.of(context).brightness` com `systemNavigationBarContrastEnforced: false` e tokens semânticos WCAG. |
| `LL-005` | 2026-11 | `B2B-personal-ia` | Supabase RLS | Políticas RLS consultando `tenant_members` diretamente causavam recursão infinita ou lentidão por reavaliar `auth.uid()` a cada linha. | Função `SECURITY DEFINER` (`get_my_staff_tenants()`) + wrapper `(select auth.uid())` para ativar *initPlan* + índices em `tenant_id` e `client_id`. |
| `LL-006` | 2026-11 | `B2B-personal-ia` / `ReformAI` | DevOps / OTA | Timestamps longos causavam overflow de 32-bit em `versionCode`; Service Workers serviam `AssetManifest`/`FontManifest` stale causando tela branca; deploys repetidos estouravam cota 429 do Firebase Hosting. | Build monotônico `YYYYMMDDNN`, `initAssetCacheGuard` injetando `?_b=BUILD` + `cache: 'no-store'`, detector `PwaUpdateWrapper` com anti-loop (`reset()` quando `serverBuild <= localBuild`), GC pré-deploy no Firebase Hosting (mantendo `live` + 2 rollbacks) e `SemVer+build.<run>.<sha>` no backend. |
~~~

### 6.2. `memory/TECH_RADAR.md`
~~~markdown
# Shapelab Tech Radar (2026)

Guia rápido de tecnologias aprovadas para manter a velocidade e o baixo custo de manutenção de um fundador solo.

## 1. ADOTAR (Padrão Oficial em Produção)
- **Mobile & Web App:** Flutter 3.24+ (Material 3, Edge-to-Edge, Dual-Theme WCAG, Cache Offline v2).
- **Web Edge & Guardas Leves:** Cloudflare Pages + Cloudflare Workers (`_guard.ts` fail-closed + Web Crypto PBKDF2).
- **Backend Core:** Python 3.11 + FastAPI + Pydantic v2 + `httpx.AsyncClient` (hospedado no Render).
- **Banco, Auth & Storage:** Supabase (PostgreSQL 15+ com RLS estrito e Storage privado LGPD) + Firebase Hosting.
- **Pagamentos & Split:** Asaas API v3 + JWS Split + WORM Ledger (BCB 4893).
- **Mensageria:** Meta Cloud API Oficial (primário) + Evolution API (fallback com degradação graciosa).
- **IA Generativa:** Gemini API via SDK `google-genai` (Structured Outputs, roteamento Flash vs. Pro por complexidade).

## 2. EXPERIMENTAR (Uso Controlado)
- **Automação de Testes E2E de Persona:** Subagentes simulando usuários reais em rede 4G instável.
- **Motores de Regras Parametrizadas (ReformAI):** Tabelas de alíquotas e feature flags legislativas (LC 214/2025, IBS/CBS) desacopladas de deploy.

## 3. EVITAR / BANIDO (Anti-Patterns na ShapeLab)
- **Proibido:** Senhas/chaves hardcoded, hash rápido sem salt (`MD5`/`SHA-256` puro para senhas), endpoints privados sem guard no servidor ou tabelas Supabase sem RLS.
- **Proibido:** `requests` síncrono dentro de rotas `async def` no FastAPI (trava o event loop no Render).
- **Evitar:** Microsserviços fragmentados, Kafka/RabbitMQ autogerenciados ou Kubernetes para MVPs e produtos em tração inicial.
~~~

### 6.3. `templates/prd_mvp.md`
~~~markdown
# PRD & Spec-First Blueprint: [Nome do Produto ou Feature]

- **Produto Alvo:** `[Mr. Coach (B2B-personal-ia) | ReformAI | Smart EV Hub | Tattoo SaaS]`
- **Data:** `AAAA-MM-DD`
- **Status:** `[EM VALIDAÇÃO SPEC-FIRST | APROVADO PARA EXECUÇÃO]`

## 1. Problema & Proposta de Valor (Corte de Overengineering)
- **Dor Real do Usuário:**
- **Caminho Crítico do MVP (O que entra):**
- **O que NÃO faremos agora (Escopo Cortado):**

## 2. Reaproveitamento do `shapelab-brain` (Cross-Pollination)
- [ ] `skills/payments/asaas_split.md` (Pagamentos / Split / WORM Ledger)
- [ ] `skills/security/auth_anti_takeover.md` (Guards / Auth / Checkout Nonce)
- [ ] `skills/ui/flutter_edge_to_edge.md` (UI Imersiva / Dual-Theme WCAG)
- [ ] `skills/backend/supabase_rls.md` (Multi-Tenant RLS / Storage LGPD)
- [ ] `skills/growth/whatsapp_dual_channel.md` (Notificações / Bot WhatsApp)
- [ ] `skills/devops/versioning_and_ota_update.md` (Versionamento Monotônico / OTA PWA / SemVer CI)
- [ ] `skills/brand/shapelab_brand_identity.md` (Identidade Prism S Neon / SEO / PWA / App Icons)

## 3. Análise de Impacto Spec-First & Zero-Downtime
- **Rotas, Tabelas e Variáveis `.env` Afetadas:**
- **Riscos de Quebra e Plano de Transição (Fase 1 Dual -> Fase 2 Corte):**

## 4. Matriz de Decisões em Aberto
1. [Decisão 1 pendente do fundador]
2. [Decisão 2 pendente do fundador]
~~~

---

## 7. Fluxo Operacional no Dia a Dia (Google Antigravity + ShapeLab Squad)

### Como Orquestrar Tarefas com Economia de Tokens
1. **Novo Escopo ou Migração (Spec-First Gate):**
   > *"Invoque `shapelab-spec-research` (`Model: 'flash'`) seguindo `chief_architect.md` para mapear o impacto de [Feature] no projeto, sem alterar código."*
2. **Polinização entre Projetos (`B2B-personal-ia`, `ReformAI`, `Smart-EV-Hub`):**
   > *"Atue como `cross_pollinator.md` e aplique a skill `skills/payments/asaas_split.md` (ou `whatsapp_dual_channel.md`) neste repositório adaptando as entidades locais."*
3. **Auditoria Red-Team & BCB 4893 Pré-Merge:**
   > *"Invoque `shapelab-security-fintech` (`Model: 'pro'`) com o checklist de `guardian_auditor.md` para auditar o `git diff` atual e rodar testes adversariais de concorrência."*
4. **Fechamento & CI Preflight:**
   > *"Invoque `shapelab-backend-qa` / `shapelab-mobile-ui` para rodar a suíte de testes (`ci-preflight`), limpe arquivos temporários e proponha o registro do aprendizado em `memory/LESSONS_LEARNED.md`."*

### Próximo Passo Imediato (Inicialização do Repositório)
Para materializar toda a árvore de diretórios e arquivos especificada acima (`INDEX.md`, `CORE_CONSTITUTION.md`, `agents/*`, `skills/*`, `memory/*` e `templates/*`) diretamente neste repositório `shapelab-brain`, basta comandar:
> **"Inicialize o repositório `shapelab-brain` criando todos os arquivos do blueprint."**

---

## 8. Protocolo de Autoatualização do Brain (`memory/BRAIN_EVOLUTION_PROTOCOL.md`)

O `shapelab-brain` opera em **loop fechado de evolução contínua**:
1. **Critérios de Promoção:** Qualquer ideia, instrução, correção ou melhoria que se aplique a `>= 2` produtos (ou projetos futuros), sem segredos nem regras exclusivas de um único domínio, é promovida ao `shapelab-brain`.
2. **Versionamento do Brain:** Controlado por `VERSION` e `CHANGELOG.md` (`PATCH` = lessons/radar/ADR; `MINOR` = nova skill; `MAJOR` = mudança na constituição).
3. **Sincronização entre Produtos:**
   - **Manual/Sessão:** `scripts/brain_sync.ps1 -Mode pull` (receber) e `scripts/brain_sync.ps1 -Mode contribute -Message "brain: <tipo>: <resumo>"` (contribuir).
   - **Automatizada (CI):** `.github/workflows/brain_sync.yml` abre PR `chore/brain-sync` diariamente quando há atualizações no repositório central, sem disparar deploys diretos na `main`.