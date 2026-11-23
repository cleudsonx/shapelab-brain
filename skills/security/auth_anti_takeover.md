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
