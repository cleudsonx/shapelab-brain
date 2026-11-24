---
id: skill-sre-observability-crash-shield-backup
version: 1.0.0
status: production-verified
last_verified: 2026-11-24
origin_project: shapelab-brain
compatible_subagent: shapelab-backend-qa / shapelab-mobile-ui
stack: [python-3.11, fastapi, httpx, supabase, redis, flutter, dart, pg_dump, cloud-storage]
---

# Skill: Observabilidade Deep Healthcheck, Sanitização HTTP 500, Crash Shield e Backup Contínuo

## 1. Objetivo
Padronizar a resiliência operacional ponta a ponta nos produtos ShapeLab: separação estrita entre *liveness* e *readiness* (`Deep Healthcheck`), sanitização absoluta de respostas `HTTP 500` em produção, captura global de falhas assíncronas e visuais no Flutter/Web (`Crash Shield`) e rotina auditável de backup contínuo + *restore drill* do Supabase em conformidade com LGPD e BCB 4893.

## 2. Contrato de Entrada e Dependências
- **`.env` (Backend FastAPI):**
  - `ENVIRONMENT`: `production` | `staging` | `test`
  - `APP_VERSION`: `MAJOR.MINOR.PATCH+build.<run>.<sha>`
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY` apenas para backend)
  - `REDIS_URL` (ex: `rediss://...`)
  - `QUEUE_HEALTH_KEY`: chave de heartbeat/fila no Redis (ex: `shapelab:queue:heartbeat`)
  - `HEALTHCHECK_TIMEOUT_SEC`: float (padrão `2.0`)
  - `DATABASE_DIRECT_URL`: string PostgreSQL exclusiva do job de backup (Secret Manager / CI)
  - `BACKUP_ENCRYPTION_KEY`: chave/passphrase forte (Secret Manager) para cifragem AES-256/age
  - `BACKUP_BUCKET_URI`: `gs://<bucket>-southamerica-east1/supabase-backups`
- **Pacotes Python:** `fastapi>=0.115.0`, `httpx>=0.27.0`, `redis>=5.0.0`, `pydantic>=2.9.0`.
- **Flutter/Web (`--dart-define`):** `API_BASE_URL`, `APP_VERSION`, `APP_BUILD_NUMBER`, `ENVIRONMENT`.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- **Acoplar banco/Redis ao `/health/live` gera CrashLoop em cascata:** Se o `/health/live` consultar o Supabase e retornar `503` durante uma oscilação de 5 segundos, o Cloud Run mata e reinicia o container, derrubando requisições válidas e provocando tempestade de reconexões. `/health/live` deve validar **apenas** que o processo e o *event loop* estão responsivos (inclusive durante *draining* de shutdown). Somente `/health/ready` testa dependências externas.
- **Vazamento de DSN, tokens ou PII em HTTP 500:** `str(exc)` de erros de rede (`httpx`), SQL ou Redis frequentemente carrega URLs com credenciais (`postgres://user:pass@...`), headers `Authorization`/`apikey` ou dados do usuário. Em `ENVIRONMENT=production`, **nunca** retorne `detail`, `str(exc)` ou `traceback` na resposta HTTP — devolva apenas `error_code` e `correlation_id`, aplicando redator de segredos antes de gravar nos logs JSON do servidor.
- **Falhas assíncronas invisíveis e loop infinito de telemetria no Flutter:** `FlutterError.onError` captura apenas erros da árvore de widgets; exceções em `Future`s, streams ou callbacks web escapam se não houver `PlatformDispatcher.instance.onError` + `runZonedGuarded`. Além disso, se a API de telemetria estiver fora e o envio de erro lançar outra exceção não capturada, ocorre loop recursivo de crashes. É obrigatório usar envio *fire-and-forget* com timeout curto (`3s`), captura silenciosa de falhas e *rate limiting* local.
- **Backup "fantasma" no Supabase (sem teste de restauração):** Backup gerenciado sem validação periódica ou armazenado apenas dentro da mesma conta/região sem imutabilidade não protege contra exclusão acidental, corrupção lógica ou incidente de conta. Combine **PITR nativo** (RPO ≤ 5 min) com **dump lógico diário criptografado (`pg_dump --format=custom`)** em bucket `southamerica-east1` com *Retention Policy* e *Restore Drill* automatizado.

## 4. Implementação Agnóstica (Boilerplate Blindado)

### (a) Deep Healthcheck (`/health/live` vs `/health/ready`) — FastAPI
```python
import asyncio
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/health", tags=["observability"])

HEALTHCHECK_TIMEOUT_SEC = float(os.getenv("HEALTHCHECK_TIMEOUT_SEC", "2.0"))


async def _timed_check(name: str, coro) -> tuple[str, dict[str, Any]]:
    started = time.perf_counter()
    try:
        await asyncio.wait_for(coro, timeout=HEALTHCHECK_TIMEOUT_SEC)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        return name, {"status": "ok", "latency_ms": elapsed_ms}
    except asyncio.TimeoutError:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        return name, {"status": "timeout", "latency_ms": elapsed_ms}
    except Exception:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        # Nunca expor mensagem bruta de exceção (pode conter DSN/secrets)
        return name, {"status": "down", "latency_ms": elapsed_ms}


async def _ping_supabase(http_client: httpx.AsyncClient) -> None:
    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    api_key = os.environ["SUPABASE_ANON_KEY"]
    resp = await http_client.get(
        f"{supabase_url}/rest/v1/",
        headers={"apikey": api_key},
        timeout=HEALTHCHECK_TIMEOUT_SEC,
    )
    if resp.status_code >= 500:
        raise RuntimeError("supabase_5xx")


async def _ping_redis(redis_client) -> None:
    pong = await redis_client.ping()
    if not pong:
        raise RuntimeError("redis_no_pong")


async def _ping_queue(redis_client) -> None:
    queue_key = os.getenv("QUEUE_HEALTH_KEY", "shapelab:queue:heartbeat")
    # Verifica resposta do broker/fila (ex: existência de heartbeat recente ou LLEN <= limite)
    val = await redis_client.get(queue_key)
    if val is None and os.getenv("REQUIRE_QUEUE_HEARTBEAT", "false").lower() == "true":
        raise RuntimeError("queue_heartbeat_missing")


@router.get("/live")
async def liveness_probe(request: Request) -> JSONResponse:
    """Valida apenas responsividade do processo/event-loop. Nunca consulta DB/Redis."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "alive",
            "version": os.getenv("APP_VERSION", "dev"),
            "draining": bool(getattr(request.app.state, "is_draining", False)),
        },
    )


@router.get("/ready")
async def readiness_probe(request: Request) -> JSONResponse:
    """Deep Healthcheck paralelo. Retorna 503 imediatamente durante draining ou falha crítica."""
    if getattr(request.app.state, "is_draining", False):
        return JSONResponse(
            status_code=503,
            content={"status": "draining", "checks": {}},
        )

    http_client: httpx.AsyncClient = request.app.state.http_client
    redis_client = request.app.state.redis_client

    results = await asyncio.gather(
        _timed_check("supabase", _ping_supabase(http_client)),
        _timed_check("redis", _ping_redis(redis_client)),
        _timed_check("queue", _ping_queue(redis_client)),
    )
    checks = dict(results)
    all_ok = all(item["status"] == "ok" for item in checks.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={
            "status": "ready" if all_ok else "degraded",
            "version": os.getenv("APP_VERSION", "dev"),
            "checks": checks,
        },
    )
```

### (b) Sanitização Estrita de HTTP 500 + Correlation ID + Redator de Logs
```python
import json
import logging
import os
import re
import traceback
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("shapelab.sre")

_SECRET_PATTERNS = [
    re.compile(r"(postgres(?:ql)?|redis(?:s)?)://[^\s\"']+", re.IGNORECASE),
    re.compile(r"(Bearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE),
    re.compile(r"((?:apikey|api_key|token|password|secret)\s*[=:]\s*)[^\s,;\"']+", re.IGNORECASE),
]
_UUID_RE = re.compile(r"^[0-9a-fA-F-]{8,64}$")


def redact_sensitive_text(raw: str) -> str:
    sanitized = raw
    for pattern in _SECRET_PATTERNS:
        sanitized = pattern.sub(lambda m: f"{m.group(1) if m.lastindex else ''}[REDACTED]", sanitized)
    return sanitized


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("X-Correlation-ID", "").strip()
        cid = incoming if _UUID_RE.match(incoming) else str(uuid.uuid4())
        request.state.correlation_id = cid
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = cid
        return response


def register_exception_shield(app: FastAPI) -> None:
    app.add_middleware(CorrelationIdMiddleware)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        cid = getattr(request.state, "correlation_id", str(uuid.uuid4()))
        is_prod = os.getenv("ENVIRONMENT", "production").lower() == "production"

        log_record = {
            "severity": "ERROR",
            "event": "unhandled_http_500",
            "correlation_id": cid,
            "method": request.method,
            "path": request.url.path,
            "error_type": type(exc).__name__,
            "error_message": redact_sensitive_text(str(exc)),
            "traceback": redact_sensitive_text(traceback.format_exc()),
            "version": os.getenv("APP_VERSION", "dev"),
        }
        logger.error(json.dumps(log_record, ensure_ascii=False))

        body = {
            "error": "INTERNAL_ERROR",
            "message": "Erro interno inesperado. Informe o código de rastreio ao suporte.",
            "correlation_id": cid,
        }
        if not is_prod:
            body["debug_type"] = type(exc).__name__

        return JSONResponse(
            status_code=500,
            content=body,
            headers={"X-Correlation-ID": cid},
        )
```

### (c) Crash Shield Global para Flutter/Web (`lib/core/sre/crash_shield.dart`)
```dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class CrashShield {
  static final Map<String, DateTime> _dedupCache = {};
  static final List<DateTime> _recentTimestamps = [];
  static const int _maxEventsPerMinute = 5;

  static Future<void> run({
    required Widget Function() appBuilder,
    required String telemetryEndpoint,
    required String appVersion,
    required String environment,
  }) async {
    await runZonedGuarded(() async {
      WidgetsFlutterBinding.ensureInitialized();

      ErrorWidget.builder = (FlutterErrorDetails details) {
        final incidentId = _shortIncidentId(details.exceptionAsString());
        return _SafeCrashFallbackWidget(incidentId: incidentId);
      };

      FlutterError.onError = (FlutterErrorDetails details) {
        if (!kReleaseMode) {
          FlutterError.presentError(details);
        }
        unawaited(_dispatchTelemetry(
          endpoint: telemetryEndpoint,
          appVersion: appVersion,
          environment: environment,
          source: 'flutter_framework',
          error: details.exception,
          stack: details.stack,
        ));
      };

      PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
        unawaited(_dispatchTelemetry(
          endpoint: telemetryEndpoint,
          appVersion: appVersion,
          environment: environment,
          source: 'platform_dispatcher',
          error: error,
          stack: stack,
        ));
        return true;
      };

      runApp(appBuilder());
    }, (Object error, StackTrace stack) {
      unawaited(_dispatchTelemetry(
        endpoint: telemetryEndpoint,
        appVersion: appVersion,
        environment: environment,
        source: 'zone_guard',
        error: error,
        stack: stack,
      ));
    });
  }

  static String _shortIncidentId(String seed) {
    final hash = seed.hashCode.toUnsigned(32).toRadixString(16).padLeft(8, '0');
    return 'SL-$hash'.toUpperCase();
  }

  static String _scrubPii(String input) {
    return input
        .replaceAll(RegExp(r'[\w.+-]+@[\w-]+\.[\w.-]+'), '[EMAIL_REDACTED]')
        .replaceAll(RegExp(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*'), 'Bearer [REDACTED]')
        .replaceAll(RegExp(r'\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b'), '[CPF_REDACTED]');
  }

  static Future<void> _dispatchTelemetry({
    required String endpoint,
    required String appVersion,
    required String environment,
    required String source,
    required Object error,
    StackTrace? stack,
  }) async {
    if (endpoint.isEmpty) return;

    final now = DateTime.now().toUtc();
    _recentTimestamps.removeWhere((ts) => now.difference(ts) > const Duration(minutes: 1));
    if (_recentTimestamps.length >= _maxEventsPerMinute) return;

    final signature = '${error.runtimeType}:${stack?.toString().split('\n').firstOrNull ?? ''}';
    final lastSeen = _dedupCache[signature];
    if (lastSeen != null && now.difference(lastSeen) < const Duration(seconds: 30)) return;

    _dedupCache[signature] = now;
    _recentTimestamps.add(now);

    try {
      final payload = {
        'incident_id': _shortIncidentId('$signature:${now.millisecondsSinceEpoch}'),
        'source': source,
        'platform': kIsWeb ? 'web' : defaultTargetPlatform.name,
        'app_version': appVersion,
        'environment': environment,
        'error_type': error.runtimeType.toString(),
        'message': _scrubPii(error.toString()).characters.take(500).toString(),
        'stack_preview': _scrubPii(stack?.toString() ?? '').characters.take(2000).toString(),
        'occurred_at': now.toIso8601String(),
      };
      await http
          .post(
            Uri.parse(endpoint),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 3));
    } catch (_) {
      // Silencioso por design: falha de telemetria jamais deve gerar crash secundário.
    }
  }
}

class _SafeCrashFallbackWidget extends StatelessWidget {
  final String incidentId;
  const _SafeCrashFallbackWidget({required this.incidentId});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.shield_outlined, size: 40, color: scheme.error),
              const SizedBox(height: 12),
              Text(
                'Algo saiu do esperado neste bloco.',
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                'Código de suporte: $incidentId',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

### (d) Política & Script de Backup Contínuo Supabase (PITR + Dump Criptografado + Restore Drill)
- **Camada 1 (PITR Contínuo Supabase):** Manter Point-in-Time Recovery ativo no projeto Supabase (`RPO <= 5 min`, retenção mínima 7 dias) para reversão granular até o segundo anterior a um incidente lógico.
- **Camada 2 (Dump Diário Criptografado Cross-Bucket LGPD `southamerica-east1`):**
```bash
#!/usr/bin/env bash
set -euo pipefail

# Pré-requisitos: DATABASE_DIRECT_URL, BACKUP_ENCRYPTION_KEY, BACKUP_BUCKET_URI (southamerica-east1)
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

RAW_DUMP="$WORKDIR/supabase_${STAMP}.dump"
ENC_DUMP="$WORKDIR/supabase_${STAMP}.dump.enc"
SHA_FILE="$WORKDIR/supabase_${STAMP}.dump.enc.sha256"

# 1. Dump lógico consistente em formato custom comprimido
pg_dump "$DATABASE_DIRECT_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file="$RAW_DUMP"

# 2. Criptografia AES-256-CBC com PBKDF2 (600k iterações) + zero plaintext em disco após cifrar
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 \
  -in "$RAW_DUMP" \
  -out "$ENC_DUMP" \
  -pass env:BACKUP_ENCRYPTION_KEY
rm -f "$RAW_DUMP"

# 3. Checksum de integridade e upload para bucket com retenção WORM em São Paulo
(cd "$WORKDIR" && sha256sum "$(basename "$ENC_DUMP")" > "$SHA_FILE")
gcloud storage cp "$ENC_DUMP" "$SHA_FILE" "${BACKUP_BUCKET_URI%/}/"

echo "Backup criptografado publicado: ${BACKUP_BUCKET_URI%/}/$(basename "$ENC_DUMP")"
```
- **Camada 3 (Restore Drill Semanal em CI/Runner Isolado):** Baixar o último `.dump.enc` + `.sha256`, validar `sha256sum -c`, descriptografar em container PostgreSQL efêmero (`postgres:15-alpine`), executar `pg_restore --exit-on-error` e rodar `SELECT count(*) FROM <tabela_critica>;` validando `> 0`.

## 5. Critério de Aceite e Testes Adversariais
1. **Desacoplamento Liveness vs. Readiness (Pytest):** Mockar Supabase e Redis lançando `TimeoutError` / `ConnectionError` -> `GET /health/live` **deve** retornar `200 OK`, enquanto `GET /health/ready` **deve** retornar `503 Service Unavailable` com `checks.supabase.status` e `checks.redis.status` indicando `timeout`/`down` em `< 2.5s`.
2. **Teste Adversarial de HTTP 500 (Zero Secret Leak):** Disparar rota `async def` lançando `RuntimeError("Falha ao conectar postgres://admin:SenhaUltraSecreta@db.internal:5432/prod Bearer eyJhbGciOi...")` com `ENVIRONMENT=production` -> resposta HTTP `500` **não** pode conter `"SenhaUltraSecreta"`, `"postgres://"`, `"eyJhbGciOi"`, `"Traceback"` ou caminhos `.py`, e deve conter `correlation_id` UUID válido idêntico ao header `X-Correlation-ID`.
3. **Crash Shield Anti-Flood (Flutter Test):** Forçar erro de renderização dentro de `CrashShield` -> `ErrorWidget` customizado é renderizado sem stack trace visível ao usuário; disparar 20 erros idênticos em 5 segundos -> no máximo 1–5 requisições HTTP POST são emitidas ao endpoint de telemetria, e se o endpoint retornar `500` ou timeout, o app continua estável sem exceção secundária.
4. **Restore Drill de Backup:** Executar descriptografia + `sha256sum -c` + `pg_restore` em instância PostgreSQL efêmera -> código de saída `0` e validação positiva de schema e contagem de registros.
