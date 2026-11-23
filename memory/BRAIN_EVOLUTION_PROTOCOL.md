# Protocolo de Autoatualização e Evolução do `shapelab-brain`

Este protocolo define como o `shapelab-brain` se mantém vivo e evolui continuamente a partir das descobertas feitas em cada produto da ShapeLab.

## 1. Critérios de Promoção para Conhecimento Genérico
Um aprendizado, ideia, instrução, padrão de código ou regra só deve ser promovido para o `shapelab-brain` quando atender a **todos** os critérios abaixo:
1. **Aplicabilidade Cruzada (`>= 2` produtos ou projetos futuros):** Resolve uma dor recorrente em pelo menos dois produtos atuais (`B2B-personal-ia`, `ReformAI`, `Smart-EV-Hub`) ou estabelece um padrão fundacional para novos MVPs (`Tattoo SaaS`, etc.).
2. **Agnóstico de Segredos e Domínio Específico:** Não contém chaves, URLs privadas, tokens ou regras exclusivas de um único negócio (ex.: regras *Read-Only CAN Bus* permanecem no `AGENTS.md` do `Smart-EV-Hub`, enquanto o padrão de guardrails estáticos no CI pode ser generalizado).
3. **Verificado em Produção ou Validado por Testes:** Soluções promovidas como `skill` devem ter sido testadas ou derivadas de padrões auditados.

## 2. Mapeamento de Destino no `shapelab-brain`
| Natureza da Descoberta | Arquivo de Destino | Bump de Versão (`VERSION`) |
| :--- | :--- | :--- |
| Correção de armadilha, bug recorrente ou ajuste fino de regra | `memory/LESSONS_LEARNED.md` | `PATCH` (`X.Y.Z+1`) |
| Decisão tecnológica / nova biblioteca aprovada ou banida | `memory/TECH_RADAR.md` ou `memory/adrs/ADR-NNN-*.md` | `PATCH` (`X.Y.Z+1`) |
| Novo módulo/padrão reutilizável com boilerplate e critérios de aceite | `skills/<categoria>/<nome>.md` + atualizar `INDEX.md` | `MINOR` (`X.Y+1.0`) |
| Nova diretriz global inegociável ou alteração estrutural de governança | `CORE_CONSTITUTION.md` + `agents/*.md` | `MAJOR` (`X+1.0.0`) |

## 3. Fluxo de Autoatualização (Loop Fechado)
1. **Detecção:** Durante o trabalho em qualquer produto, o agente identifica uma ideia, instrução, melhoria arquitetural ou bug fix com perfil genérico segundo a Seção 1.
2. **Proposta ao Fundador:** Antes de alterar `.shapelab/`, o agente apresenta de forma concisa o **diff proposto**, o destino correto e o incremento de `VERSION` + `CHANGELOG.md`.
3. **Aplicação em `.shapelab/`:** Após aval do usuário, o agente edita os arquivos em `.shapelab/` (incluindo `VERSION` e `CHANGELOG.md`).
4. **Commit & Push no Brain:** O agente (ou o script `scripts/brain_sync.ps1 -Mode contribute -Message "..."`) commita dentro do submódulo `.shapelab` com prefixo semântico `brain: <tipo>: <resumo>` e envia para `origin main` do `shapelab-brain`.
5. **Propagação Automática:** Os demais repositórios recebem a atualização na próxima sessão via `scripts/brain_sync.ps1 -Mode pull` ou automaticamente pelo workflow diário `.github/workflows/brain_sync.yml` (que abre PR `chore/brain-sync` sem disparar deploys diretos na `main`).
