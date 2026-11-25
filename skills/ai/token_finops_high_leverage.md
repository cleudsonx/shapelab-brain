---
id: skill-ai-token-finops-high-leverage
version: 1.0.0
status: production-verified
last_verified: 2026-11-25
origin_project: shapelab-brain
compatible_subagent: shapelab-spec-research
stack: [gemini-4-pro, antigravity, mcp, token-finops, context-engineering, subagents]
---

# Skill: Token FinOps & Engenharia de Alta Alavancagem (Gemini 4 Pro + Antigravity)

## 1. Objetivo & Princípio Central

Maximizar a produtividade, qualidade arquitetural, velocidade de execução, assertividade e capacidade de inovação usando **Gemini 4 Pro / Antigravity** e APIs Gemini em produção com **custo mínimo de tokens**.

> **Lei da Física das Sessões Agênticas ($O(T^2)$):**
> Cada novo turno em uma conversa reenvia todo o histórico acumulado ($N$ mensagens + outputs de ferramentas + definições de plugins/MCPs). Portanto, **10 turnos curtos e sujos custam ~5x mais tokens e degradam a atenção do modelo** (*context rot*), enquanto **2–3 turnos bem-planejados, em lote e com contexto limpo custam uma fração do pacote e produzem código significativamente mais assertivo**.

Economia inteligente de tokens não significa cortar rigor técnico: **contexto limpo = menos alucinação = menos retrabalho = maior qualidade**.

---

## 2. Roteamento Assimétrico de Modelos (*"Think with Pro, Grind with Flash"*)

Não gaste cota nobre do **Gemini 4 Pro** com leitura mecânica de dezenas de arquivos, boilerplate ou checagens repetitivas. Use a Squad `shapelab-os` para rotear cada fase pelo custo/benefício exato:

| Natureza da Tarefa | Modelo / Agente Ideal | Justificativa Token FinOps & Qualidade |
| :--- | :--- | :--- |
| Arquitetura Spec-First, trade-offs, inovação, root-cause complexo | **Gemini 4 Pro** (conversa principal ou `shapelab-security-fintech` `Model: "pro"`) | Máximo raciocínio onde a decisão custa caro se errada. |
| Red-Team Auth/RLS/BCB 4893, prevenção de race conditions | `shapelab-security-fintech` (`Model: "pro"` ou `"inherit"`) | Segurança crítica não admite falsos negativos. |
| Varredura 360º multi-arquivo, mapeamento de rotas/contratos | `shapelab-spec-research` (`Model: "flash"`) | Isola centenas de linhas de leitura fora do contexto do Pro. |
| Implementação bem especificada, endpoints CRUD, testes Pytest | `shapelab-backend-qa` (`Model: "flash"`) | Execução rápida e barata seguindo contrato aprovado. |
| Widgets Flutter, ajustes responsivos, `flutter analyze/test` | `shapelab-mobile-ui` (`Model: "flash"`) | Iteração ágil de UI sem inflar o histórico principal. |
| Curadoria de versão, `PRODUCT_MATRIX.md`, `LESSONS_LEARNED.md` | `shapelab-brain-curator` (`Model: "flash"`) | Pós-entrega padronizada com custo mínimo. |
| Execução mecânica de plano já fechado | **Modo Plan → Execute** | Planeja no modelo de raciocínio e executa passos determinísticos no modelo rápido. |

---

## 3. Engenharia da Janela de Contexto (Higiene, Busca Cirúrgica & `/compact`)

### 3.1 Higiene de Plugins, Skills e MCPs (Custo Fixo por Turno)
- Cada plugin e servidor MCP ativo injeta definições de tools e cabeçalhos de skills **em todos os turnos da sessão**.
- Mantenha ativos apenas `shapelab-os` e os plugins estritamente usados no workspace atual (ex.: desative plugins de BigQuery/Spark/Firestore se estiver trabalhando em FastAPI + Supabase + Flutter).

### 3.2 Busca Semântica & Leitura Cirúrgica (Zero File Dumps)
1. **Consulte o Brain por fragmentos, nunca arquivos inteiros:** Use `brain_semantic_search` com `fullText: false` (padrão) e `topK: 3..5`, ou `brain_query`, trazendo apenas os trechos relevantes (`file#Lstart-Lend`).
2. **Locate before Reading:** Primeiro localize linhas com `rg -n` / `Select-String`; só depois chame `read_file` passando `StartLine` e `EndLine` (faixa de 60–150 linhas ao redor da função alvo).
3. **Nunca releia o que não mudou:** Informações já lidas na sessão permanecem disponíveis; não repita leituras nem buscas equivalentes.

### 3.3 Firewall de Contexto com Subagentes & Filtragem de Terminal
- **Resumo Executivo de Subagentes:** Ao acionar `shapelab-spec-research` ou `shapelab-backend-qa`, exija no prompt: *"Retorne apenas arquivos/linhas relevantes, decisões em aberto e diffs/status em no máximo 25 linhas."*
- **Terminal Silencioso / Tail / Quiet:** Logs gigantes de `pytest`, `flutter test` ou `git diff` inflam a janela em milhares de tokens inúteis. Prefira:
  - `pytest -q --tb=short`
  - `flutter test --reporter compact`
  - `git status -s` / `git diff --stat`
  - Redirecionar saídas extensas ou filtrar com `Select-Object -Last 40` / `tail -n 40`.

### 3.4 Política de `/compact` e Renovação de Sessão
- **Regra de ouro:** Uma conversa = uma entrega coesa (feature, bugfix ou auditoria).
- Use `/compact` quando a conversa passar de ~15–20 turnos ou trocar de sub-domínio.
- Ao abrir uma **nova conversa** para a etapa seguinte (ex.: sair da pesquisa para a implementação), passe um **Briefing de 10 linhas** com: objetivo, arquivos-alvo, restrições e critérios de aceite — você zera a conta quadrática $O(T^2)$ mantendo 100% da precisão.

---

## 4. Batching Radical & Redução de Turnos

Cada ida-e-volta desnecessária reenvia toda a janela de contexto. Reduza o número total de turnos agrupando ações independentes por fase:

1. **Fase 1 — Descoberta em Lote:** Chame todas as buscas e `read_file` independentes **na mesma resposta** (paralelo).
2. **Fase 2 — Edição em Lote:** Aplique múltiplos `edit_file` / `write_file` de arquivos distintos em paralelo.
3. **Fase 3 — Validação Encadeada + Fix-All:**
   - Encadeie checks compatíveis em um único comando (ex.: no Windows PowerShell 5.1, `cmd1; if ($LASTEXITCODE -eq 0) { cmd2 }`; em bash, `cmd1 && cmd2`).
   - Se o teste apontar 4 erros, **corrija todos os 4 erros antes de re-executar a suíte**. Nunca entre em loop de *"edita 1 linha → roda suíte inteira → edita 1 linha"*.

---

## 5. Preservando Qualidade, Assertividade e Inovação (Zero Atalhos Perigosos)

Economizar tokens **jamais** significa pedir "código curto" ou pular validações. O segredo da assertividade econômica é **densidade de especificação**:

### 5.1 Template de Prompt Spec-First de Alta Densidade (Para Você Enviar ao Agente)
```markdown
**Objetivo:** [1 frase clara]
**Escopo / Arquivos:** [caminhos exatos ou "pesquisar via shapelab-spec-research (flash)"]
**Restrições Inegociáveis:** [.shapelab skills aplicáveis, zero-downtime, auth/RLS, etc.]
**Inovação Esperada:** [Compare até 2-3 abordagens em tabela curta antes de editar]
**Critério de Done:** [comando de teste exato que deve passar antes de responder]
```
*Por que funciona:* Elimina 3–5 turnos de perguntas de clarificação e impede que o modelo escreva código no caminho errado.

### 5.2 Inovação Sem Desperdício
- Antes de escrever código complexo, peça ao Gemini 4 Pro uma **Matriz de Opções de 3–5 linhas**: *Abordagem | Complexidade | Risco | Custo/Impacto*. Escolha em 1 palavra ("Opção B") e execute.
- **Reuso Obrigatório do Brain (`.shapelab`):** Nunca gaste tokens reinventando JWS Split, PBKDF2/Argon2id, Dual-Channel WhatsApp, `initAssetCacheGuard` ou RLS. Consulte `brain_semantic_search` e adapte o padrão já provado em produção.

### 5.3 Limite Inviolável (Onde NUNCA Economizar Tokens)
- **NUNCA** omita testes unitários, testes de concorrência (*race conditions*) ou `ci_preflight_check.mjs`. Um bug em produção ou regressão de segurança consome 20x mais tokens para depurar depois.
- **NUNCA** suprima tratamento de erros, guards RBAC ou sanitização de logs HTTP 500 para encurtar respostas.

---

## 6. Token FinOps em Produção (Gemini API SDK nos Produtos ShapeLab)

Ao usar `google-genai` dentro de **Mr. Coach**, **ReformAI** ou **Smart EV Hub**, aplique os 5 pilares abaixo:

1. **Context Caching Explícito:** System prompts longos, catálogos de exercícios, regras LC 214/2025 e schemas fixos (> 32k tokens ou alto reuso) devem usar *Context Caching* (redução de **75% a 90%** no custo de input repetido).
2. **Structured Outputs (`response_schema`):** Sempre exija JSON via schema Pydantic v2 estrito — evita texto conversacional inútil na saída e elimina loops de *retry* por erro de parser.
3. **Model Tiering no Backend:** Classificação, extração de texto e triagem rodam no modelo **Flash**; raciocínio clínico/jurídico/financeiro complexo escala sob demanda para **Pro**.
4. **Controle de `thinking_budget` & `max_output_tokens`:** Ajuste o orçamento de raciocínio por complexidade do endpoint (baixo/médio para formulários e resumos, alto apenas em análises críticas).
5. **Cota Atômica Anti-Race (`LL-012`):** Toda chamada LLM faturável deve executar o padrão **Reserve → Execute → Release** no banco para impedir estouro de pacote sob requisições paralelas concorrentes.

---

## 7. Armadilhas Clássicas vs. Padrão Cirúrgico

| ❌ Anti-Padrão (Desperdício / Baixa Qualidade) | ✅ Padrão ShapeLab Cirúrgico |
| :--- | :--- |
| Sessão única de 60 turnos misturando 4 features diferentes | 1 sessão curta por entrega + `/compact` ou briefing de 10 linhas |
| Ler 5 arquivos de 800 linhas no modelo Pro para achar 1 função | `rg -n` / `shapelab-spec-research (flash)` + `read_file` de 80 linhas |
| Colar stack traces ou logs de build inteiros no chat | `tail -n 30`, `--tb=short` ou resumo de erro por arquivo/linha |
| 10 plugins/MCPs ativos fora de uso no projeto atual | Manter apenas plugins do domínio ativo no workspace |
| Pedir "crie algo completo e inovador" sem escopo/restrições | Prompt Spec-First de 5 blocos + tabela comparativa antes de codar |
| Rodar suíte de testes a cada 1 pequena correção | Corrigir todos os erros reportados em lote antes de re-validar |

---

## 8. Checklist Rápido & Critérios de Aceite

1. [ ] Plugins/MCPs desnecessários desativados no workspace atual?
2. [ ] Descoberta multi-arquivo delegada para `shapelab-spec-research` (`Model: "flash"`) ou `brain_semantic_search` (`fullText: false`)?
3. [ ] Leituras diretas restritas ao intervalo exato (`StartLine`..`EndLine`) e edições agrupadas em paralelo?
4. [ ] Logs de teste/build compactados (`-q --tb=short` / `--reporter compact`)?
5. [ ] Decisão arquitetural/inovação validada em tabela compacta antes da codificação?
6. [ ] Qualidade comprovada ao final com testes locais + `ci_preflight_check.mjs` passando sem relaxar asserções?
