#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-pull}"
MESSAGE="${2:-}"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "Erro: execute dentro de um repositório Git de produto." >&2
  exit 1
fi

cd "$REPO_ROOT"

if [[ ! -d ".shapelab" ]]; then
  echo "Erro: submódulo .shapelab não encontrado em $REPO_ROOT" >&2
  exit 1
fi

if [[ "$MODE" == "pull" ]]; then
  echo "Sincronizando .shapelab a partir do remoto (origin)..."
  git submodule sync -- .shapelab
  git submodule update --remote --merge .shapelab
  echo "Submódulo .shapelab atualizado."
elif [[ "$MODE" == "contribute" ]]; then
  if [[ -z "$MESSAGE" ]]; then
    echo "Uso: $0 contribute \"brain: <tipo>: <resumo>\"" >&2
    exit 1
  fi
  echo "Preparando contribuição no submódulo .shapelab..."
  (
    cd .shapelab
    BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "$BRANCH" == "HEAD" ]]; then
      git checkout main
    fi
    git add -A
    if [[ -z "$(git status --porcelain)" ]]; then
      echo "Nenhuma alteração pendente em .shapelab."
      exit 0
    fi
    git commit -m "$MESSAGE"
    git push origin main
  )
  git add .shapelab
  git commit -m "chore(brain): update .shapelab pointer ($MESSAGE)"
  echo "Contribuição enviada ao shapelab-brain e ponteiro atualizado."
else
  echo "Modo inválido: $MODE (use 'pull' ou 'contribute')" >&2
  exit 1
fi
