---

## Shapelab Brain (`.shapelab`) & Protocolo de Autoatualização

- **Leitura Inicial Sob Demanda:** Antes de planejar, alterar arquitetura ou implementar padrões compartilhados, leia `.shapelab/INDEX.md` e `.shapelab/CORE_CONSTITUTION.md` (carregando apenas as skills e agentes relevantes para a tarefa).
- **Sincronização de Sessão:** No início da sessão (quando houver rede disponível), execute `.\scripts\brain_sync.ps1 -Mode pull` (ou `git submodule update --remote --merge .shapelab`) para receber aprendizados recentes de outros produtos.
- **Autoatualização (Loop Fechado):** Sempre que surgirem ideias, instruções, skills, correções ou melhorias aplicáveis a **>= 2 produtos ou projetos futuros** (sem segredos ou regras exclusivas de domínio), siga `.shapelab/memory/BRAIN_EVOLUTION_PROTOCOL.md`: proponha o diff genérico ao usuário, aplique em `.shapelab/`, atualize `VERSION`/`CHANGELOG.md` e sincronize via `.\scripts\brain_sync.ps1 -Mode contribute -Message "brain: <tipo>: <resumo>"`.
