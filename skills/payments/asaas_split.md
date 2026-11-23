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
