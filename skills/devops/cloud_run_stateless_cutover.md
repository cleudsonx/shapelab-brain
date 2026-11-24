---
id: skill-devops-cloud-run-stateless-cutover
version: 1.0.0
status: production-verified
last_verified: 2026-11-24
origin_project: shapelab-brain
compatible_subagent: shapelab-backend-qa
stack: [gcp-cloud-run, docker, python-3.11, fastapi, uvicorn, github-actions, artifact-registry]
---

# Skill: Deploy Stateless no Cloud Run (`southamerica-east1`), Graceful Shutdown e Cutover Blue-Green

## 1. Objetivo
Padronizar o empacotamento seguro de APIs stateless ShapeLab, deploy no **Google Cloud Run** na região **`southamerica-east1` (São Paulo)** (conformidade LGPD de residência de dados e baixa latência para usuários e gateways brasileiros como Asaas/Pix), desligamento gracioso de conexões em até 10 segundos (`SIGTERM`/`SIGINT`) e migração de tráfego Blue-Green Zero-Downtime com validação prévia de saúde.

## 2. Contrato de Entrada e Dependências
- **Google Cloud (`southamerica-east1`):**
  - APIs habilitadas: `run.googleapis.com`, `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`.
  - Repositório OCI no Artifact Registry em `southamerica-east1-docker.pkg.dev/<PROJECT_ID>/<REPO>/<SERVICE>`.
  - Runtime Service Account dedicada com mínimo privilégio (`roles/secretmanager.secretAccessor`, sem `roles/owner`).
  - Secrets injetados exclusivamente via `--set-secrets` do Secret Manager (nunca embutidos no `Dockerfile` ou `ENV` plaintext).
- **Arquitetura Stateless Obrigatória:**
  - Nenhuma sessão, arquivo de upload ou lock financeiro em memória/disco local do container (usar Supabase Storage / PostgreSQL / Redis).
  - Endpoints `/health/live` e `/health/ready` implementados conforme `skills/sre/observability_crash_shield_and_backup.md`.
  - Versão rastreável `SemVer+build.<run>.<sha>` e tag Docker `<SemVer>-build.<run>.<sha>` conforme `skills/devops/versioning_and_ota_update.md`.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- **Região errada violando LGPD e adicionando +140ms de RTT:** Omitir `--region` no `gcloud run` pode implantar em `us-central1`. Fixe explicitamente `GCP_REGION="southamerica-east1"` no Cloud Run, Artifact Registry e buckets auxiliares.
- **`CMD` em shell form engolindo `SIGTERM`:** Declarar `CMD uvicorn ...` gera `/bin/sh -c "uvicorn ..."` como PID 1, impedindo o repasse confiável de `SIGTERM` no Cloud Run. Quando uma revisão escala para zero ou é substituída, o container tem no máximo **10 segundos** após `SIGTERM` antes do `SIGKILL`. Use sempre **exec form** com entrypoint Python direto (`ENTRYPOINT ["python", "-m", "app.server"]`) para garantir que o processo Python seja PID 1 e drene conexões ativas antes de encerrar.
- **Container rodando como `root` e imagem pesada:** Usar `python:3.11` completo e usuário `root` aumenta superfície de ataque e latência de *cold start*. Utilize **multi-stage build** em `python:3.11-slim`, copie apenas `/opt/venv` + código da aplicação e execute como usuário `nonroot` (`UID 10001`).
- **Cutover cego para 100% do tráfego:** Um `gcloud run deploy` padrão direciona 100% da produção imediatamente para a nova revisão. Se faltar uma secret ou migração de banco, toda a API cai. Publique sempre com `--no-traffic --tag=candidate`, valide `/health/live` e `/health/ready` na URL isolada da tag e só então vire o tráfego para `100%`.

## 4. Implementação Agnóstica (Boilerplate Blindado)

### (a) `Dockerfile` Multi-Stage Enxuto com Usuário Non-Root
```dockerfile
# syntax=docker/dockerfile:1.7

# --- Stage 1: Builder (compila wheels e isola venv sem sujar runtime) ---
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# --- Stage 2: Runtime Enxuto + Non-Root ---
FROM python:3.11-slim AS runtime

ARG APP_VERSION=0.0.0-dev
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8080 \
    APP_VERSION=${APP_VERSION}

# Cria grupo e usuário sem privilégios (UID/GID fixos 10001)
RUN groupadd --gid 10001 appgroup \
    && useradd --uid 10001 --gid 10001 --shell /usr/sbin/nologin --create-home appuser

WORKDIR /app

COPY --from=builder --chown=appuser:appgroup /opt/venv /opt/venv
COPY --chown=appuser:appgroup app ./app

USER 10001:10001
EXPOSE 8080

# Exec form garante que Python seja PID 1 e receba SIGTERM/SIGINT diretamente
ENTRYPOINT ["python", "-m", "app.server"]
```

### (b) Graceful Shutdown com Captura de `SIGTERM` / `SIGINT` (Dreno até 10s)
```python
# app/shutdown.py — Middleware de rastreamento de requisições em voo + dreno coordenado
import asyncio
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request


class GracefulShutdownManager:
    def __init__(self, max_drain_seconds: float = 9.0) -> None:
        self.max_drain_seconds = max_drain_seconds
        self.is_draining = False
        self._in_flight = 0
        self._drained_event = asyncio.Event()
        self._drained_event.set()

    def begin_drain(self) -> None:
        self.is_draining = True

    def enter_request(self) -> None:
        self._in_flight += 1
        self._drained_event.clear()

    def exit_request(self) -> None:
        self._in_flight = max(0, self._in_flight - 1)
        if self._in_flight == 0:
            self._drained_event.set()

    async def wait_for_drain(self) -> bool:
        try:
            await asyncio.wait_for(self._drained_event.wait(), timeout=self.max_drain_seconds)
            return True
        except asyncio.TimeoutError:
            return False


def attach_graceful_shutdown(app: FastAPI, shutdown_mgr: GracefulShutdownManager) -> None:
    @app.middleware("http")
    async def track_in_flight_requests(request: Request, call_next):
        # Não bloqueia probes durante o dreno para permitir leitura de status draining
        if request.url.path.startswith("/health/"):
            return await call_next(request)
        shutdown_mgr.enter_request()
        try:
            return await call_next(request)
        finally:
            shutdown_mgr.exit_request()


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    shutdown_mgr: GracefulShutdownManager = app.state.shutdown_mgr
    app.state.is_draining = False
    app.state.http_client = httpx.AsyncClient(timeout=10.0)
    # Inicialize aqui pool Redis / DB (ex: app.state.redis_client)
    try:
        yield
    finally:
        # 1. Sinaliza draining imediatamente (/health/ready -> 503)
        app.state.is_draining = True
        shutdown_mgr.begin_drain()
        # 2. Aguarda requisições ativas por até 9s (margem segura antes dos 10s do Cloud Run)
        await shutdown_mgr.wait_for_drain()
        # 3. Fecha pools e clientes externos ordenadamente
        await app.state.http_client.aclose()
        if getattr(app.state, "redis_client", None) is not None:
            await app.state.redis_client.aclose()
```

```python
# app/server.py — Entrypoint PID 1 com tratamento explícito de SIGTERM / SIGINT
import os
import signal
import uvicorn


class GracefulUvicornServer(uvicorn.Server):
    def handle_exit(self, sig: int, frame) -> None:
        # Marca estado de draining assim que SIGTERM/SIGINT chega ao PID 1
        app_state = getattr(getattr(self.config, "app", None), "state", None)
        if app_state is not None:
            app_state.is_draining = True
            if hasattr(app_state, "shutdown_mgr"):
                app_state.shutdown_mgr.begin_drain()
        super().handle_exit(sig, frame)


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    config = uvicorn.Config(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        workers=1,  # Cloud Run escala horizontalmente por container
        timeout_graceful_shutdown=10,
        proxy_headers=True,
        forwarded_allow_ips="*",
        log_level=os.environ.get("LOG_LEVEL", "info").lower(),
    )
    server = GracefulUvicornServer(config=config)
    signal.signal(signal.SIGTERM, server.handle_exit)
    signal.signal(signal.SIGINT, server.handle_exit)
    server.run()


if __name__ == "__main__":
    main()
```

### (c) Estratégia Blue-Green / Traffic Migration Zero-Downtime (`southamerica-east1`)
```bash
#!/usr/bin/env bash
set -euo pipefail

# Parâmetros obrigatórios vindos do CI (GitHub Actions / Cloud Build)
PROJECT_ID="${GCP_PROJECT_ID:?}"
REGION="southamerica-east1" # Obrigatório: São Paulo (LGPD + baixa latência BR)
SERVICE="${CLOUD_RUN_SERVICE:?}"
IMAGE_URI="${IMAGE_URI:?}"     # Ex: southamerica-east1-docker.pkg.dev/proj/repo/api:1.2.0-build.42.a1b2c3d
RUNTIME_SA="${RUNTIME_SA:?}"
APP_VERSION="${APP_VERSION:?}"

# 0. Captura revisão ativa atual para rollback instantâneo em caso de falha
PREV_REV="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format='value(status.latestReadyRevisionName)' 2>/dev/null || true)"

# 1. Deploy da nova revisão SEM tráfego de produção, sob tag isolada 'candidate'
gcloud run deploy "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE_URI" \
  --service-account="$RUNTIME_SA" \
  --no-traffic \
  --tag="candidate" \
  --port=8080 \
  --concurrency=80 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=60 \
  --set-env-vars="ENVIRONMENT=production,APP_VERSION=${APP_VERSION}" \
  --set-secrets="SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,REDIS_URL=REDIS_URL:latest"

# 2. Resolve URL exclusiva da revisão candidata e revisão criada
CANDIDATE_URL="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format='value(status.traffic[?tag=="candidate"].url)')"
CANDIDATE_REV="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format='value(status.latestCreatedRevisionName)')"

if [[ -z "$CANDIDATE_URL" || -z "$CANDIDATE_REV" ]]; then
  echo "ERRO: Falha ao resolver URL ou revisão candidata." >&2
  exit 1
fi

# 3. Smoke Test de Liveness + Deep Readiness antes de virar qualquer tráfego
echo "Validando saúde da revisão candidata: $CANDIDATE_REV ($CANDIDATE_URL)"
for attempt in 1 2 3 4 5; do
  if curl -fsS --max-time 5 "${CANDIDATE_URL}/health/live" >/dev/null && \
     curl -fsS --max-time 5 "${CANDIDATE_URL}/health/ready" | grep -q '"status":"ready"'; then
    echo "Candidate healthy na tentativa ${attempt}."
    break
  fi
  if [[ "$attempt" -eq 5 ]]; then
    echo "ABORTADO: Revisão candidata reprovada no Deep Healthcheck. Produção mantida 100% em ${PREV_REV}." >&2
    exit 1
  fi
  sleep 3
done

# 4. Cutover Zero-Downtime Blue-Green para 100% do tráfego na nova revisão
gcloud run services update-traffic "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --to-revisions="${CANDIDATE_REV}=100"

# Opcional: remover tag temporária mantendo revisão anterior pronta para rollback instantâneo:
# gcloud run services update-traffic "$SERVICE" --region="$REGION" --remove-tags=candidate
# Rollback instantâneo (< 5s) caso necessário pós-cutover:
# gcloud run services update-traffic "$SERVICE" --region="$REGION" --to-revisions="${PREV_REV}=100"

echo "Cutover concluído com sucesso: ${CANDIDATE_REV} -> 100% em ${REGION}."
```

## 5. Critério de Aceite e Testes Adversariais
1. **Hardening do Container (Non-Root & Região):** Inspecionar imagem gerada (`docker run --rm --entrypoint id <image>`) -> deve retornar `uid=10001(appuser) gid=10001(appgroup)` (nunca `root`). No serviço Cloud Run publicado, `gcloud run services describe` deve confirmar `region: southamerica-east1` e segredos referenciados via `secretKeyRef` (zero credenciais plaintext).
2. **Teste Adversarial de Graceful Shutdown (`SIGTERM`):** Iniciar o container localmente, disparar uma requisição longa simulada de `3.5s` em paralelo e enviar `docker kill --signal=SIGTERM <container>` após `0.5s`:
   - `/health/ready` passa imediatamente para `503` (`"status": "draining"`).
   - A requisição de `3.5s` em andamento termina com `HTTP 200` completo (sem *connection reset*).
   - O processo encerra com exit code `0` em `< 10s`.
   - Caso uma tarefa trave por `> 9s`, o dreno expira no teto seguro antes do `SIGKILL` de `10s`.
3. **Teste Adversarial de Blue-Green Abortado (Fail-Safe Cutover):** Subir uma revisão candidata intencionalmente quebrada (ex: `REDIS_URL` inválida fazendo `/health/ready` retornar `503`) usando `--no-traffic --tag=candidate` -> o script de cutover **deve** abortar na etapa de smoke test com exit code `!= 0`, sem executar `update-traffic`, mantendo `100%` dos usuários na revisão anterior com `0` erros `5xx`.
