# Protocolo de Autoatualização e Evolução do `shapelab-brain`

Este protocolo define o loop fechado de auto-aprendizado que mantém o `shapelab-brain` e o plugin `shapelab-os` em evolução contínua a cada versão, commit relevante ou incidente resolvido nos produtos da ShapeLab.

## 1. Rubrica Quantitativa de Promoção (Score 0 a 10 | Corte >= 7)

Antes de promover qualquer ideia, correção ou padrão para o `.shapelab/`, o subagente `shapelab-brain-curator` (ou o agente principal via skill `brain-self-learning`) deve pontuar a descoberta:

| Critério | Peso | O que avaliar |
| :--- | :---: | :--- |
| **Impacto Multi-Produto** | `0–4` | Aplica-se a `>= 2` produtos atuais (`B2B-personal-ia`, `ReformAI`, `Smart-EV-Hub`) ou a futuros MVPs (`Tattoo SaaS`)? (`0` = específico de 1 produto; `4` = universal) |
| **Redução de Risco ou Custo** | `0–3` | Mitiga vulnerabilidade (takeover, double-spend, RLS), falha de produção (cache, quota 429) ou reduz custo de tokens/infra? |
| **Reusabilidade Agnóstica** | `0–3` | Está livre de segredos, URLs privadas e entidades hardcoded de um único domínio (ex.: regras *Read-Only CAN Bus* ficam apenas no `Smart-EV-Hub`)? |

- **Score `>= 7`:** Promover para `.shapelab/` (deduplicando antes contra `LESSONS_LEARNED.md` e `skills/`).
- **Score `< 7`:** Manter apenas no repositório local do produto.

## 2. Ciclo de Vida de Skills & Destinos de Promoção

- **Estágios de Skill:** `draft` (em validação inicial) → `production-verified` (validada em produção com testes) → `deprecated` (substituída por versão superior).

| Natureza da Descoberta | Arquivo de Destino | Bump SemVer (`VERSION`) |
| :--- | :--- | :---: |
| Correção de armadilha, bug recorrente ou ajuste de adoção | `memory/LESSONS_LEARNED.md` ou `memory/PRODUCT_MATRIX.md` | `PATCH` (`X.Y.Z+1`) |
| Decisão tecnológica / nova biblioteca aprovada ou banida | `memory/TECH_RADAR.md` ou `memory/adrs/ADR-NNN-*.md` | `PATCH` (`X.Y.Z+1`) |
| Novo módulo/padrão reutilizável com boilerplate e critérios de aceite | `skills/<categoria>/<nome>.md` + atualizar `INDEX.md` | `MINOR` (`X.Y+1.0`) |
| Nova diretriz global inegociável ou alteração estrutural de governança | `CORE_CONSTITUTION.md` + `agents/*.md` | `MAJOR` (`X+1.0.0`) |

## 3. Integração Automática via Lifecycle Hooks (`shapelab-os v3.0`)

O plugin `shapelab-os` fecha o loop de aprendizado sem exigir memória humana:
1. **`SessionStart` (`hooks/session_start.ps1`):** Injeta a versão ativa de `.shapelab` + versão do produto e avisa caso `.shapelab` esteja atrás da versão central do `shapelab-brain`.
2. **`PostToolUse` (`hooks/post_tool_observer.ps1`):** Monitora `run_command`, `write_file` e `edit_file`. Ao detectar edição em arquivos de versão (`pubspec.yaml`, `package.json`, `pyproject.toml`, `app_changelog.dart`, `version.json`, `app_config.dart`) ou comando de commit/versionamento (`git commit`, `update_version.dart`, `version.py`), grava um marcador leve de pendência (ignorando edições feitas dentro do próprio `.shapelab`).
3. **`Stop` (`hooks/stop_auto_learn.ps1`):** Ao concluir normalmente uma resposta com pendência marcada (e `continuationActive == false`), solicita uma reflexão rápida pela skill `brain-self-learning` / `shapelab-brain-curator`, removendo o marcador para impedir loops infinitos.

## 4. Fluxo de Contribuição e Propagação Multi-Produto
1. **Aplicar em `.shapelab/`:** Editar o arquivo de destino, atualizar `VERSION` + `CHANGELOG.md` e validar consistência com `scripts/brain_doctor.ps1`.
2. **Contribuir:** Executar `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\brain_sync.ps1 -Mode contribute -Message "brain: <tipo>: <resumo>"` (a trava SemVer impede envios sem bump válido).
3. **Release Automática:** O workflow `.github/workflows/release.yml` valida o SemVer, cria a tag `vX.Y.Z` e publica a GitHub Release.
4. **Propagar:** Os demais produtos puxam via `scripts/brain_sync.ps1 -Mode pull` ou pelo PR automático diário (`.github/workflows/brain_sync.yml`).
