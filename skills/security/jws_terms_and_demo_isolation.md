---
id: skill-security-jws-terms-demo-isolation
version: 1.0.0
status: production-verified
last_verified: 2026-11-24
origin_project: shapelab-brain
compatible_subagent: shapelab-security-fintech
stack: [python-3.11, fastapi, pydantic-v2, cryptography, postgresql, supabase-rls, rfc-7515-jws, bcb-4893, lgpd]
---

# Skill: Assinatura Criptográfica JWS (RFC 7515) para Transações/Termos e Isolamento Estrito de Contas Demo

## 1. Propósito e Escopo
Padronizar duas camadas críticas de defesa em profundidade nos produtos ShapeLab (`B2B-personal-ia`, `ReformAI`, `Smart-EV-Hub` e novos SaaS):

1. **Integridade, Autenticidade e Não-Repúdio via JWS (RFC 7515 — Compact Serialization):**
   - Assinar e verificar transações financeiras/splits, consentimentos LGPD e termos de aceite jurídico utilizando **ES256** (ECDSA P-256 + SHA-256, preferencial para não-repúdio assimétrico) ou **HS256** (HMAC-SHA256 `>= 256 bits`, restrito a comunicação interna servidor-servidor), com rotação segura de chaves por `kid` em duas fases (Zero-Downtime).
2. **Isolamento Absoluto de Contas `is_demo` / `demo_mode`:**
   - Impedir contaminação cruzada entre dados sintéticos/demonstração e dados de produção em queries PostgreSQL/Supabase RLS, webhooks de pagamento, pipelines financeiros BCB 4893, faturamento, logs e disparos externos (WhatsApp/E-mail/Webhooks).

> **Relação com outras skills:** Complementa `skills/payments/asaas_split.md` (elevando assinaturas de split para RFC 7515 com rotação por `kid`), `skills/security/auth_anti_takeover.md` (guards *fail-closed*) e `skills/backend/supabase_rls.md` (RLS multi-tenant).

---

## 2. Contrato de Entrada, Dependências e Pré-Requisitos

### 2.1 Variáveis de Ambiente (`.env`)
- `APP_ENV`: `"production"` | `"staging"` | `"development"`
- `PAYMENT_GATEWAY_ENV`: `"production"` | `"sandbox"` (nunca inferido por header do cliente)
- `JWS_ACTIVE_KID`: ID da chave ativa usada exclusivamente para novas assinaturas (ex.: `"es256-2026-11"`)
- `JWS_KEYRING_JSON`: JSON carregado via Secret Manager / KMS contendo as chaves (`kid`, `alg`, `status`: `active` | `verify_only` | `revoked`, `private_pem` / `public_pem` para `ES256` ou `secret_b64` para `HS256`). **Proibido** commitar em repositório ou expor chaves privadas em logs/bundles.
- `JWS_ALLOWED_ALGS`: `"ES256"` (padrão recomendado) ou `"ES256,HS256"` (nunca incluir `"none"`).
- `DEMO_ISOLATION_STRICT`: `"true"` (obrigatório em produção; modo *fail-closed*).

### 2.2 Dependências Python
- `fastapi>=0.115.0`
- `pydantic>=2.9.0`
- `cryptography>=43.0.0`
- `pytest>=8.3.0` / `pytest-asyncio>=0.24.0` (testes adversariais)

### 2.3 Pré-Requisitos de Banco (PostgreSQL / Supabase)
- Coluna imutável `is_demo BOOLEAN NOT NULL DEFAULT FALSE` com restrição `UNIQUE (id, is_demo)` em `tenants` e `profiles`, propagada por chave estrangeira composta `(tenant_id, is_demo)` para tabelas de negócio.
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` em todas as tabelas de negócio, consentimentos e sinks de notificação.
- Tabelas dedicadas de prova e anti-replay:
  - `jws_consumed_nonces` (consumo atômico single-use de `jti` em transações).
  - `legal_consents` (histórico WORM de termos/consentimentos assinados via JWS com `doc_sha256`).
  - `financial_audit_ledger` (WORM BCB 4893 com trava física `CHECK (is_demo = FALSE)`).
  - `demo_notification_sink` (repositório isolado para simulações de envio em `demo_mode`).

---

## 3. Armadilhas Conhecidas (Gotchas de Produção — Visão Red-Team)

1. **Ataque `alg: none` e Algorithm Confusion (`ES256` -> `HS256`):**
   - Nunca confie no campo `alg` do cabeçalho JWS recebido para decidir como validar a assinatura. Um atacante pode alterar `"alg": "HS256"` e assinar o token usando os bytes da chave pública `ES256` (PEM) como segredo HMAC. Sempre fixe o algoritmo esperado no registro do `kid` no servidor (`key.alg == header["alg"]`).
2. **Injeção de Chave via Cabeçalho (`jwk`, `jku`, `x5u`, `x5c`):**
   - Bibliotecas mal configuradas aceitam chave embutida no próprio header `jwk` ou buscam URLs externas em `jku`/`x5u` (SSRF + forjamento completo de assinatura). Rejeite qualquer token contendo `jwk`, `jku`, `x5u`, `x5c` ou `crit` desconhecido; resolva `kid` **exclusivamente** no keyring confiável do servidor.
3. **Armadilha de Formato `ES256` (ASN.1 DER vs. IEEE P1363 `R || S`):**
   - A RFC 7515 / RFC 7518 §3.4 exige que a assinatura `ES256` na Compact Serialization seja exatamente **64 bytes brutos** (`R` 32 bytes big-endian || `S` 32 bytes big-endian), enquanto a biblioteca `cryptography` do Python gera e verifica **ASN.1 DER**. Sem conversão explícita (`decode_dss_signature` / `encode_dss_signature`), assinaturas falham na interoperabilidade com Workers/JWKS. Rejeite assinaturas `ES256` com tamanho != 64 bytes ou base64url não canônico (com `=`, espaços ou bits finais alterados).
4. **Termo de Aceite sem `doc_sha256` (Repúdio Contratual):**
   - Registrar apenas `accepted_terms = true` ou `"v1.0"` sem gravar `doc_sha256` (SHA-256 do texto integral exibido) permite alteração retroativa do contrato e invalida prova jurídica/LGPD.
5. **Mutação de `user_metadata` no Supabase Auth e `service_role` Ignorando RLS:**
   - No Supabase, `auth.jwt() -> 'user_metadata'` é editável pelo próprio usuário via SDK cliente. **Jamais** leia `is_demo` de `user_metadata` ou de headers HTTP (`X-Demo-Mode`). Leia apenas de tabelas autoritativas (`profiles` / `tenants`) com `REVOKE UPDATE (is_demo)` e triggers de imutabilidade — inclusive porque o `service_role` do backend ignora RLS (`BYPASSRLS`), exigindo chaves estrangeiras compostas, triggers e `CHECK` no PostgreSQL como última linha de defesa.
6. **Bypass de Faturamento e Envenenamento por Webhook Sandbox:**
   - Um usuário `is_demo=True` pode tentar chamar endpoints de cobrança real, saque ou LLM ilimitado, ou disparar webhook de ambiente `sandbox` apontando `externalReference` de uma fatura real (`is_demo=False`). Imponha paridade estrita entre `PAYMENT_GATEWAY_ENV` e `entity.is_demo`.
7. **Vazamento de Notificações Reais a partir de Dados Demo:**
   - Leads/faturas de teste contendo telefones ou e-mails reais disparam mensagens reais via Meta Cloud API / Evolution API / SMTP se o dispatcher não operar *fail-closed* sobre `is_demo`. Toda notificação originada de contexto `is_demo=True` deve ser interceptada antes da camada HTTP e roteada apenas para `demo_notification_sink` com PII mascarada.

---

## 4. Padrões de Código Blindados

### 4.1 PostgreSQL & Supabase RLS (Anti-Contaminação `is_demo` + WORM Legal/Financeiro)

```sql
-- 1. Tabelas Base com Isolamento Imutável de Modo (Live vs Demo)
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenants_id_demo UNIQUE (id, is_demo)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_profiles_id_demo UNIQUE (id, is_demo)
);

-- Impede que usuários autenticados alterem o próprio is_demo diretamente
REVOKE UPDATE (is_demo) ON public.profiles FROM authenticated, anon;
REVOKE UPDATE (is_demo) ON public.tenants FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.tenant_members (
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'viewer')),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT fk_tm_tenant_mode FOREIGN KEY (tenant_id, is_demo)
    REFERENCES public.tenants (id, is_demo) ON DELETE CASCADE,
  CONSTRAINT fk_tm_profile_mode FOREIGN KEY (user_id, is_demo)
    REFERENCES public.profiles (id, is_demo) ON DELETE CASCADE
);

-- 2. Triggers de Imutabilidade
CREATE OR REPLACE FUNCTION public.forbid_is_demo_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_demo IS DISTINCT FROM NEW.is_demo THEN
    RAISE EXCEPTION 'Violação de segurança: flag is_demo é imutável após criação (tabela %)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.forbid_worm_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Tabela WORM imutável (%): UPDATE e DELETE são proibidos (BCB 4893 / LGPD)', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_immutable_demo ON public.tenants;
CREATE TRIGGER trg_tenants_immutable_demo
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.forbid_is_demo_mutation();

DROP TRIGGER IF EXISTS trg_profiles_immutable_demo ON public.profiles;
CREATE TRIGGER trg_profiles_immutable_demo
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.forbid_is_demo_mutation();

-- 3. Funções Auxiliares SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.current_user_is_demo()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.is_demo
  FROM public.profiles p
  WHERE p.id = (select auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_isolated_tenants()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tm.tenant_id
  FROM public.tenant_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.user_id = (select auth.uid())
    AND tm.role IN ('owner', 'staff')
    AND t.is_demo = p.is_demo
    AND tm.is_demo = p.is_demo;
$$;

REVOKE ALL ON FUNCTION public.current_user_is_demo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_isolated_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_demo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_isolated_tenants() TO authenticated;

-- 4. Tabelas de Negócio com FK Composta + FORCE RLS
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  client_id UUID NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'canceled', 'simulated')),
  external_reference TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_invoices_tenant_mode FOREIGN KEY (tenant_id, is_demo)
    REFERENCES public.tenants (id, is_demo),
  CONSTRAINT fk_invoices_client_mode FOREIGN KEY (client_id, is_demo)
    REFERENCES public.profiles (id, is_demo),
  CONSTRAINT chk_live_no_simulated CHECK (is_demo = TRUE OR status <> 'simulated')
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_mode ON public.invoices (tenant_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_invoices_client_mode ON public.invoices (client_id, is_demo);

DROP TRIGGER IF EXISTS trg_invoices_immutable_demo ON public.invoices;
CREATE TRIGGER trg_invoices_immutable_demo
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.forbid_is_demo_mutation();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY "staff_isolated_invoices_rw" ON public.invoices
  FOR ALL TO authenticated
  USING (
    is_demo = public.current_user_is_demo()
    AND tenant_id IN (SELECT public.get_my_isolated_tenants())
  )
  WITH CHECK (
    is_demo = public.current_user_is_demo()
    AND tenant_id IN (SELECT public.get_my_isolated_tenants())
  );

CREATE POLICY "client_isolated_invoices_ro" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    is_demo = public.current_user_is_demo()
    AND client_id = (select auth.uid())
  );

-- 5. Tabelas JWS Anti-Replay, Consentimentos/Termos WORM e Ledger BCB 4893
CREATE TABLE IF NOT EXISTS public.jws_consumed_nonces (
  jti UUID PRIMARY KEY,
  scope TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jti UUID NOT NULL UNIQUE,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  doc_type TEXT NOT NULL,
  doc_version TEXT NOT NULL,
  doc_sha256 TEXT NOT NULL,
  purpose TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  jws_kid TEXT NOT NULL,
  jws_alg TEXT NOT NULL CHECK (jws_alg IN ('ES256', 'HS256')),
  jws_compact TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_consents_tenant_mode FOREIGN KEY (tenant_id, is_demo)
    REFERENCES public.tenants (id, is_demo),
  CONSTRAINT fk_consents_user_mode FOREIGN KEY (user_id, is_demo)
    REFERENCES public.profiles (id, is_demo)
);

CREATE INDEX IF NOT EXISTS idx_legal_consents_lookup
  ON public.legal_consents (tenant_id, user_id, doc_type, is_demo, accepted_at DESC);

DROP TRIGGER IF EXISTS trg_legal_consents_worm ON public.legal_consents;
CREATE TRIGGER trg_legal_consents_worm
  BEFORE UPDATE OR DELETE ON public.legal_consents
  FOR EACH ROW EXECUTE FUNCTION public.forbid_worm_mutation();

ALTER TABLE public.legal_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_consents FORCE ROW LEVEL SECURITY;

CREATE POLICY "user_read_own_isolated_consents" ON public.legal_consents
  FOR SELECT TO authenticated
  USING (
    is_demo = public.current_user_is_demo()
    AND user_id = (select auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.financial_audit_ledger (
  id BIGSERIAL PRIMARY KEY,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL UNIQUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE CHECK (is_demo = FALSE),
  event_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  jws_kid TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_financial_ledger_worm ON public.financial_audit_ledger;
CREATE TRIGGER trg_financial_ledger_worm
  BEFORE UPDATE OR DELETE ON public.financial_audit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.forbid_worm_mutation();

CREATE TABLE IF NOT EXISTS public.demo_notification_sink (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT TRUE CHECK (is_demo = TRUE),
  channel TEXT NOT NULL,
  masked_recipient TEXT NOT NULL,
  payload_sanitized JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_demo_sink_tenant FOREIGN KEY (tenant_id, is_demo)
    REFERENCES public.tenants (id, is_demo)
);
```

### 4.2 Módulo JWS RFC 7515 Compact Serialization (`ES256` & `HS256` + Rotação por `kid`)

```python
# backend/app/security/jws_crypto.py
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import re
import time
import uuid
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)
from pydantic import BaseModel, Field

_B64URL_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_FORBIDDEN_HEADER_KEYS = frozenset({"jwk", "jku", "x5u", "x5c", "x5t", "x5t#S256", "crit"})
_ES256_COORD_SIZE = 32
_MIN_HS256_KEY_BYTES = 32


class JwsVerificationError(ValueError):
    """Falha determinística na verificação criptográfica ou semântica do JWS."""


class KeyStatus(StrEnum):
    ACTIVE = "active"
    VERIFY_ONLY = "verify_only"
    REVOKED = "revoked"


class JwsAlgorithm(StrEnum):
    ES256 = "ES256"
    HS256 = "HS256"


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(segment: str) -> bytes:
    if not segment or not _B64URL_RE.fullmatch(segment):
        raise JwsVerificationError("Segmento JWS contém caracteres fora de base64url sem padding")
    if len(segment) % 4 == 1:
        raise JwsVerificationError("Comprimento base64url inválido")
    padded = segment + "=" * (-len(segment) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
    except (binascii.Error, ValueError) as exc:
        raise JwsVerificationError("Falha ao decodificar base64url") from exc
    if b64url_encode(decoded) != segment:
        raise JwsVerificationError("Codificação base64url não canônica")
    return decoded


def _der_to_p1363(der_sig: bytes) -> bytes:
    r, s = decode_dss_signature(der_sig)
    return r.to_bytes(_ES256_COORD_SIZE, "big") + s.to_bytes(_ES256_COORD_SIZE, "big")


def _p1363_to_der(raw_sig: bytes) -> bytes:
    if len(raw_sig) != _ES256_COORD_SIZE * 2:
        raise JwsVerificationError("Assinatura ES256 deve conter exatamente 64 bytes (R||S)")
    r = int.from_bytes(raw_sig[:_ES256_COORD_SIZE], "big")
    s = int.from_bytes(raw_sig[_ES256_COORD_SIZE:], "big")
    if r == 0 or s == 0:
        raise JwsVerificationError("Componentes ECDSA nulos inválidos")
    return encode_dss_signature(r, s)


@dataclass(frozen=True)
class JwsKeyMaterial:
    kid: str
    alg: JwsAlgorithm
    status: KeyStatus
    private_key: ec.EllipticCurvePrivateKey | None = None
    public_key: ec.EllipticCurvePublicKey | None = None
    hmac_secret: bytes | None = None

    def __post_init__(self) -> None:
        if not self.kid:
            raise ValueError("kid obrigatório")
        if self.alg == JwsAlgorithm.ES256:
            if self.hmac_secret is not None:
                raise ValueError("Chave ES256 não pode possuir hmac_secret")
            if self.private_key is not None and not isinstance(self.private_key.curve, ec.SECP256R1):
                raise ValueError("ES256 exige curva NIST P-256 (SECP256R1)")
            if self.public_key is None and self.private_key is not None:
                object.__setattr__(self, "public_key", self.private_key.public_key())
            if self.public_key is None or not isinstance(self.public_key.curve, ec.SECP256R1):
                raise ValueError("ES256 exige public_key na curva NIST P-256")
            if self.status == KeyStatus.ACTIVE and self.private_key is None:
                raise ValueError("Chave ES256 ACTIVE exige private_key para assinatura")
        elif self.alg == JwsAlgorithm.HS256:
            if self.private_key is not None or self.public_key is not None:
                raise ValueError("Chave HS256 não pode possuir chaves assimétricas")
            if self.hmac_secret is None or len(self.hmac_secret) < _MIN_HS256_KEY_BYTES:
                raise ValueError("HS256 exige segredo mínimo de 256 bits (32 bytes)")


class JwsKeyRing:
    """Gerenciador de chaves JWS com rotação zero-downtime e pinagem alg<->kid."""

    def __init__(
        self,
        keys: list[JwsKeyMaterial],
        active_kid: str,
        allowed_algs: frozenset[JwsAlgorithm] = frozenset({JwsAlgorithm.ES256}),
    ) -> None:
        self._keys: dict[str, JwsKeyMaterial] = {}
        self._allowed_algs = allowed_algs
        for key in keys:
            if key.kid in self._keys:
                raise ValueError(f"kid duplicado no keyring: {key.kid}")
            if key.alg not in allowed_algs:
                raise ValueError(f"Algoritmo {key.alg} da chave {key.kid} fora da allowlist")
            self._keys[key.kid] = key

        active = self._keys.get(active_kid)
        if active is None or active.status != KeyStatus.ACTIVE:
            raise ValueError(f"active_kid '{active_kid}' inexistente ou não está ACTIVE")
        self._active_kid = active_kid

    @classmethod
    def from_json_config(cls, raw_json: str, active_kid: str, allowed_algs: set[str] | None = None) -> "JwsKeyRing":
        data = json.loads(raw_json)
        algs = frozenset(JwsAlgorithm(a) for a in (allowed_algs or {"ES256"}))
        materials: list[JwsKeyMaterial] = []
        for item in data["keys"]:
            alg = JwsAlgorithm(item["alg"])
            status = KeyStatus(item["status"])
            if alg == JwsAlgorithm.ES256:
                priv = (
                    serialization.load_pem_private_key(item["private_pem"].encode("utf-8"), password=None)
                    if item.get("private_pem")
                    else None
                )
                pub = (
                    serialization.load_pem_public_key(item["public_pem"].encode("utf-8"))
                    if item.get("public_pem")
                    else None
                )
                materials.append(
                    JwsKeyMaterial(kid=item["kid"], alg=alg, status=status, private_key=priv, public_key=pub)
                )
            else:
                secret = b64url_decode(item["secret_b64"])
                materials.append(
                    JwsKeyMaterial(kid=item["kid"], alg=alg, status=status, hmac_secret=secret)
                )
        return cls(keys=materials, active_kid=active_kid, allowed_algs=algs)

    def sign(self, payload: dict[str, Any], typ: str) -> tuple[str, str]:
        key = self._keys[self._active_kid]
        if key.status != KeyStatus.ACTIVE:
            raise RuntimeError("Chave ativa indisponível para assinatura")

        header = {"alg": key.alg.value, "typ": typ, "kid": key.kid}
        header_b64 = b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        payload_b64 = b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")

        if key.alg == JwsAlgorithm.ES256:
            assert key.private_key is not None
            der_sig = key.private_key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
            raw_sig = _der_to_p1363(der_sig)
        else:
            assert key.hmac_secret is not None
            raw_sig = hmac.new(key.hmac_secret, signing_input, hashlib.sha256).digest()

        return f"{header_b64}.{payload_b64}.{b64url_encode(raw_sig)}", key.kid

    def verify(
        self,
        jws_compact: str,
        expected_typ: str | None = None,
        require_exp: bool = True,
        max_clock_skew_sec: int = 30,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        if not jws_compact or len(jws_compact) > 16_384:
            raise JwsVerificationError("JWS ausente ou excede limite seguro de tamanho")
        parts = jws_compact.split(".")
        if len(parts) != 3:
            raise JwsVerificationError("JWS Compact Serialization exige exatamente 3 segmentos")

        header_b64, payload_b64, sig_b64 = parts
        header_raw = b64url_decode(header_b64)
        payload_raw = b64url_decode(payload_b64)
        raw_sig = b64url_decode(sig_b64)

        try:
            header = json.loads(header_raw.decode("utf-8"))
            payload = json.loads(payload_raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise JwsVerificationError("Header ou payload JWS malformado") from exc

        if not isinstance(header, dict) or not isinstance(payload, dict):
            raise JwsVerificationError("Header e payload JWS devem ser objetos JSON")
        if _FORBIDDEN_HEADER_KEYS & header.keys():
            raise JwsVerificationError("Cabeçalho JWS proibido detectado (jwk/jku/x5u/x5c/crit)")

        alg_str = header.get("alg")
        kid = header.get("kid")
        typ = header.get("typ")

        if not isinstance(alg_str, str) or alg_str.lower() == "none":
            raise JwsVerificationError("Algoritmo JWS ausente ou 'none' proibido")
        if not isinstance(kid, str) or kid not in self._keys:
            raise JwsVerificationError("kid desconhecido no keyring")
        if expected_typ is not None and typ != expected_typ:
            raise JwsVerificationError("typ JWS divergente do contexto esperado")

        key = self._keys[kid]
        if key.status == KeyStatus.REVOKED:
            raise JwsVerificationError("Chave JWS revogada")
        if key.alg not in self._allowed_algs or alg_str != key.alg.value:
            raise JwsVerificationError("Algoritmo JWS incompatível com a política ou kid (key confusion)")

        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        if key.alg == JwsAlgorithm.ES256:
            assert key.public_key is not None
            der_sig = _p1363_to_der(raw_sig)
            try:
                key.public_key.verify(der_sig, signing_input, ec.ECDSA(hashes.SHA256()))
            except InvalidSignature as exc:
                raise JwsVerificationError("Assinatura ES256 inválida") from exc
        else:
            assert key.hmac_secret is not None
            expected_sig = hmac.new(key.hmac_secret, signing_input, hashlib.sha256).digest()
            if len(raw_sig) != 32 or not hmac.compare_digest(expected_sig, raw_sig):
                raise JwsVerificationError("Assinatura HS256 inválida")

        now = int(time.time())
        if require_exp:
            exp = payload.get("exp")
            if not isinstance(exp, int) or exp + max_clock_skew_sec < now:
                raise JwsVerificationError("JWS expirado ou sem claim exp")
        nbf = payload.get("nbf")
        if nbf is not None and (not isinstance(nbf, int) or nbf - max_clock_skew_sec > now):
            raise JwsVerificationError("JWS ainda não válido (nbf)")

        return header, payload


# Schemas Pydantic de Negócio
class TransactionJwsPayload(BaseModel):
    jti: str = Field(default_factory=lambda: str(uuid.uuid4()))
    iat: int = Field(default_factory=lambda: int(time.time()))
    exp: int = Field(default_factory=lambda: int(time.time()) + 300)
    tenant_id: str
    actor_user_id: str
    external_reference: str
    amount_cents: int = Field(gt=0)
    currency: str = Field(default="BRL", pattern="^BRL$")
    splits_sha256: str = Field(min_length=64, max_length=64)
    is_demo: bool


class TermsConsentJwsPayload(BaseModel):
    jti: str = Field(default_factory=lambda: str(uuid.uuid4()))
    iat: int = Field(default_factory=lambda: int(time.time()))
    sub: str
    tenant_id: str
    doc_type: str = Field(pattern="^(terms_of_service|privacy_policy|lgpd_sensitive_health|financial_mandate)$")
    doc_version: str = Field(min_length=1, max_length=64)
    doc_sha256: str = Field(min_length=64, max_length=64)
    purpose: str = Field(min_length=3, max_length=128)
    granted: bool
    context_sha256: str = Field(min_length=64, max_length=64)
    is_demo: bool


def compute_canonical_sha256(obj: Any) -> str:
    canonical = json.dumps(obj, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def sign_transaction_jws(keyring: JwsKeyRing, data: TransactionJwsPayload) -> tuple[str, str]:
    if data.is_demo:
        raise ValueError("Transações financeiras reais não podem ser assinadas com is_demo=True")
    return keyring.sign(data.model_dump(mode="json"), typ="vnd.shapelab.tx+jws")


def verify_transaction_jws(
    keyring: JwsKeyRing,
    jws_compact: str,
    expected_external_ref: str,
    expected_amount_cents: int,
    expected_splits: list[dict[str, Any]],
) -> TransactionJwsPayload:
    _, raw_claims = keyring.verify(jws_compact, expected_typ="vnd.shapelab.tx+jws", require_exp=True)
    claims = TransactionJwsPayload.model_validate(raw_claims)
    if claims.is_demo:
        raise JwsVerificationError("JWS marcado como is_demo=True é inválido para transação real")
    if not hmac.compare_digest(claims.external_reference, expected_external_ref):
        raise JwsVerificationError("Divergência de external_reference no payload")
    if claims.amount_cents != expected_amount_cents:
        raise JwsVerificationError("Adulteração de amount_cents detectada")
    expected_splits_hash = compute_canonical_sha256(expected_splits)
    if not hmac.compare_digest(claims.splits_sha256, expected_splits_hash):
        raise JwsVerificationError("Adulteração das regras de split detectada")
    return claims


def sign_terms_consent_jws(keyring: JwsKeyRing, consent: TermsConsentJwsPayload) -> tuple[str, str]:
    return keyring.sign(consent.model_dump(mode="json"), typ="vnd.shapelab.consent+jws")


def verify_terms_consent_jws(
    keyring: JwsKeyRing,
    jws_compact: str,
    expected_doc_sha256: str,
    require_live_validity: bool = True,
) -> TermsConsentJwsPayload:
    _, raw_claims = keyring.verify(jws_compact, expected_typ="vnd.shapelab.consent+jws", require_exp=False)
    claims = TermsConsentJwsPayload.model_validate(raw_claims)
    if require_live_validity and claims.is_demo:
        raise JwsVerificationError("Aceite de termos emitido em demo_mode não possui validade em produção")
    if not hmac.compare_digest(claims.doc_sha256, expected_doc_sha256):
        raise JwsVerificationError("Hash do documento (doc_sha256) não confere com a versão auditada")
    return claims
```

### 4.3 Guards FastAPI, Anti-Bypass de Faturamento e Isolamento de Notificações

```python
# backend/app/security/demo_isolation.py
from __future__ import annotations

import ipaddress
import logging
import re
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlparse

from fastapi import Depends, HTTPException, status

_DEMO_CONTEXT_VAR: ContextVar[bool] = ContextVar("actor_is_demo", default=True)
_DEMO_PREFIXES = ("demo_", "sandbox_", "test_demo_")
_SENSITIVE_LOG_KEYS = frozenset(
    {
        "authorization",
        "access_token",
        "asaas_access_token",
        "private_pem",
        "hmac_secret",
        "password",
        "jws_compact",
        "cpf",
        "cnpj",
    }
)


@dataclass(frozen=True)
class ActorContext:
    user_id: str
    tenant_id: str
    role: str
    user_is_demo: bool
    tenant_is_demo: bool
    aal: str = "aal1"

    @property
    def is_demo(self) -> bool:
        return bool(self.user_is_demo or self.tenant_is_demo)


def bind_actor_log_context(actor: ActorContext) -> None:
    _DEMO_CONTEXT_VAR.set(actor.is_demo)


def require_live_billing_account(actor: ActorContext) -> ActorContext:
    if actor.user_is_demo != actor.tenant_is_demo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inconsistência de isolamento tenant/usuário detectada.",
        )
    if actor.is_demo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conta em modo demo não pode executar cobranças, saques ou ativações reais.",
        )
    return actor


def verify_webhook_environment_parity(
    *,
    gateway_env: str,
    external_reference: str,
    entity_is_demo: bool,
) -> None:
    normalized_ref = (external_reference or "").strip().lower()
    has_demo_prefix = any(normalized_ref.startswith(p) for p in _DEMO_PREFIXES)

    if gateway_env == "production":
        if entity_is_demo or has_demo_prefix:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Webhook de produção rejeitou entidade ou referência marcada como demo.",
            )
    elif gateway_env == "sandbox":
        if not entity_is_demo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Webhook sandbox não pode liquidar entidade de produção (is_demo=False).",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PAYMENT_GATEWAY_ENV inválido.",
        )


def mask_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) <= 4:
        return "***"
    return f"{digits[:2]}***{digits[-4:]}"


def mask_email(email: str) -> str:
    if "@" not in (email or ""):
        return "***"
    local, domain = email.split("@", 1)
    prefix = local[:2] if len(local) >= 2 else "*"
    return f"{prefix}***@{domain}"


def assert_safe_outbound_webhook_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Webhook externo exige HTTPS válido.")
    host = parsed.hostname.lower()
    if host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".internal") or host.endswith(".local"):
        raise HTTPException(status_code=403, detail="Destino de webhook proibido (rede interna).")
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise HTTPException(status_code=403, detail="IP privado/reservado bloqueado em webhook.")
    except ValueError:
        pass


class LiveTransport(Protocol):
    async def send(self, *, channel: str, recipient: str, payload: dict[str, Any]) -> dict[str, Any]: ...


class DemoSinkRepo(Protocol):
    async def record(
        self, *, tenant_id: str, channel: str, masked_recipient: str, payload_sanitized: dict[str, Any]
    ) -> str: ...


class IsolatedNotificationDispatcher:
    def __init__(self, live_transport: LiveTransport, demo_sink: DemoSinkRepo) -> None:
        self._live_transport = live_transport
        self._demo_sink = demo_sink

    async def dispatch(
        self,
        *,
        tenant_id: str,
        entity_is_demo: bool,
        actor_is_demo: bool,
        channel: str,
        recipient: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if entity_is_demo or actor_is_demo:
            masked = (
                mask_phone(recipient)
                if channel == "whatsapp"
                else mask_email(recipient)
                if channel == "email"
                else "https://redacted.demo.invalid/webhook"
            )
            sanitized = sanitize_dict(payload)
            sink_id = await self._demo_sink.record(
                tenant_id=tenant_id,
                channel=channel,
                masked_recipient=masked,
                payload_sanitized=sanitized,
            )
            return {
                "delivered_externally": False,
                "isolated_demo_sink": True,
                "sink_id": sink_id,
                "channel": channel,
                "masked_recipient": masked,
            }

        if channel == "webhook":
            assert_safe_outbound_webhook_url(recipient)

        return await self._live_transport.send(channel=channel, recipient=recipient, payload=payload)


def sanitize_dict(data: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for k, v in data.items():
        if k.lower() in _SENSITIVE_LOG_KEYS:
            clean[k] = "[REDACTED]"
        elif isinstance(v, dict):
            clean[k] = sanitize_dict(v)
        elif k.lower() in {"phone", "telefone", "whatsapp"} and isinstance(v, str):
            clean[k] = mask_phone(v)
        elif k.lower() in {"email", "e-mail"} and isinstance(v, str):
            clean[k] = mask_email(v)
        else:
            clean[k] = v
    return clean
```

---

## 5. Checklist de Auditoria Red-Team (`shapelab-security-fintech`)
- [ ] **[BLOCKER]** `alg: "none"` e cabeçalhos `jwk` / `jku` / `x5u` / `x5c` / `crit` são rejeitados antes da verificação de assinatura.
- [ ] **[BLOCKER]** O algoritmo (`ES256` ou `HS256`) é pinado no registro do `kid` no servidor; impossível forçar *key confusion* (`ES256` PEM -> `HS256`).
- [ ] **[BLOCKER]** Assinaturas `ES256` validam comprimento exato de 64 bytes (IEEE P1363 `R||S`) e base64url estrito sem padding.
- [ ] **[BLOCKER]** Rotação de chaves suporta fase `ACTIVE` -> `VERIFY_ONLY` -> `REVOKED` via `kid`, e chaves revogadas falham imediatamente.
- [ ] **[BLOCKER]** Transações financeiras assinadas validam `jti` single-use no banco, `exp` curto (`<= 300s`), `amount_cents`, `splits_sha256` e `is_demo == False`.
- [ ] **[HIGH]** Termos de aceite / consentimentos LGPD vinculam `doc_type`, `doc_version`, `doc_sha256`, `purpose`, `sub` e são gravados em tabela WORM (`legal_consents`) com bloqueio de `UPDATE`/`DELETE`.
- [ ] **[BLOCKER]** Aceite de termo assinado com `is_demo=True` é rejeitado como prova válida em fluxos de produção.
- [ ] **[BLOCKER]** `is_demo` nunca é lido de `user_metadata` do JWT, query string, body JSON ou header `X-Demo-Mode`; é resolvido no banco.
- [ ] **[BLOCKER]** Tabelas multi-tenant possuem `is_demo` imutável, FK composta `(tenant_id, is_demo)` e `FORCE ROW LEVEL SECURITY`.
- [ ] **[BLOCKER]** Endpoints de cobrança real, split Asaas/Efí e saque aplicam `require_live_billing_account`.
- [ ] **[BLOCKER]** Webhooks de pagamento validam paridade entre `PAYMENT_GATEWAY_ENV`, prefixos `demo_*` e `entity.is_demo`.
- [ ] **[BLOCKER]** Tabela `financial_audit_ledger` (BCB 4893) possui restrição física `CHECK (is_demo = FALSE)`.
- [ ] **[HIGH]** Dispatcher de mensageria/webhooks (`IsolatedNotificationDispatcher`) intercepta `is_demo=True` antes do transporte HTTP, mascarando PII e gravando apenas em `demo_notification_sink`.

---

## 6. Critério de Aceite e Casos Adversariais de Teste (`pytest`)
1. **Rejeição de `alg: none` e Injeção de Header:** Tentar validar token com `"alg": "none"` ou com header `"jku": "https://..."` deve lançar `JwsVerificationError` determinístico.
2. **Prevenção de Key Confusion (ES256 -> HS256):** Tentar assinar token com HMAC usando a chave pública PEM do servidor como segredo deve falhar com `"key confusion"`.
3. **Validação de Transação e Adulteração de Split:** Assinar transação com regras de split e tentar verificar alterando qualquer percentual ou valor em centavos deve ser rejeitado com `"Adulteração detectada"`.
4. **Isolamento de Contas Demo:** Tentar cobrar ou faturar conta com `is_demo=True` deve disparar HTTP `403 Forbidden` no guard `require_live_billing_account`.
5. **Zero Leaks de Notificações Demo:** Disparar notificação para cliente/lead demo deve gravar no `demo_notification_sink` com destinatário mascarado (`55***8888`), com zero requisições HTTP externas emitidas.
