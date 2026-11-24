/**
 * ShapeLab Fintech & JWS Validation Tool (RFC 7515 Compact Serialization)
 * Pure ESM, zero external dependencies (node:crypto only).
 */

import crypto from "node:crypto";

export const FINTECH_VALIDATE_JWS_TOOL = {
  name: "fintech_validate_jws",
  description:
    "Valida tokens JWS (RFC 7515 Compact Serialization) com proteção Zero-Trust contra alg:none, Key Confusion, header injection (jwk/jku/x5u/x5c/crit) e base64url não-canônico. Executa verificação criptográfica nativa via node:crypto (ES256/ES384/ES512 IEEE P1363, RS256/RS384/RS512, PS256/PS384/PS512 e HS256/HS384/HS512), checagem de exp/nbf e requiredClaims.",
  inputSchema: {
    type: "object",
    properties: {
      token: {
        type: "string",
        description:
          "Token JWS em Compact Serialization (header.payload.signature) codificado em base64url.",
      },
      expectedAlg: {
        type: "string",
        description:
          "Algoritmo JWS esperado/pinado opcional (ex: 'ES256', 'HS256', 'RS256'). Rejeita divergências e previne Key Confusion.",
      },
      publicKeyPem: {
        type: "string",
        description:
          "Chave pública PEM (SPKI ou certificado X.509) opcional para validação criptográfica assimétrica (ES256/ES384/ES512, RS256/RS384/RS512, PS256/PS384/PS512).",
      },
      secretKey: {
        type: "string",
        description:
          "Chave secreta opcional para validação criptográfica HMAC simétrica (HS256/HS384/HS512).",
      },
      requiredClaims: {
        type: "array",
        items: { type: "string" },
        description:
          "Lista opcional de claims obrigatórias verificadas no header ou payload (ex: ['kid', 'sub', 'exp', 'iat', 'amount', 'idempotency_key']).",
      },
    },
    required: ["token"],
  },
};

const MAX_JWS_TOKEN_BYTES = 32 * 1024;
const BASE64URL_STRICT_RE = /^[A-Za-z0-9_-]+$/;
const FORBIDDEN_JWS_HEADER_KEYS = new Set(["jwk", "jku", "x5u", "x5c", "crit"]);
const IGNORED_THUMBPRINT_HEADER_KEYS = new Set(["x5t", "x5t#S256"]);
const PRIVATE_PEM_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const PUBLIC_PEM_RE = /-----BEGIN (?:PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY|CERTIFICATE)-----/;
const UTF8_FATAL_DECODER = new TextDecoder("utf-8", { fatal: true });

const PAYLOAD_SEMANTIC_CLAIMS = new Set([
  "iss",
  "sub",
  "aud",
  "exp",
  "nbf",
  "iat",
  "jti",
  "amount",
  "amount_cents",
  "idempotency_key",
  "splits_sha256",
  "is_demo",
  "tenant_id",
]);

const JWS_ALGORITHMS = Object.freeze({
  HS256: Object.freeze({ family: "hmac", hash: "SHA256", minSecretBytes: 32 }),
  HS384: Object.freeze({ family: "hmac", hash: "SHA384", minSecretBytes: 48 }),
  HS512: Object.freeze({ family: "hmac", hash: "SHA512", minSecretBytes: 64 }),
  ES256: Object.freeze({
    family: "ec",
    hash: "SHA256",
    curves: new Set(["prime256v1", "secp256r1"]),
    rawSigBytes: 64,
  }),
  ES384: Object.freeze({
    family: "ec",
    hash: "SHA384",
    curves: new Set(["secp384r1"]),
    rawSigBytes: 96,
  }),
  ES512: Object.freeze({
    family: "ec",
    hash: "SHA512",
    curves: new Set(["secp521r1"]),
    rawSigBytes: 132,
  }),
  RS256: Object.freeze({ family: "rsa", hash: "SHA256", minModulusBits: 2048 }),
  RS384: Object.freeze({ family: "rsa", hash: "SHA384", minModulusBits: 2048 }),
  RS512: Object.freeze({ family: "rsa", hash: "SHA512", minModulusBits: 2048 }),
  PS256: Object.freeze({ family: "rsa-pss", hash: "SHA256", minModulusBits: 2048 }),
  PS384: Object.freeze({ family: "rsa-pss", hash: "SHA384", minModulusBits: 2048 }),
  PS512: Object.freeze({ family: "rsa-pss", hash: "SHA512", minModulusBits: 2048 }),
});

function decodeBase64UrlStrict(segment, label) {
  if (typeof segment !== "string" || segment.length === 0) {
    return { error: `EMPTY_SEGMENT: segmento '${label}' do JWS está vazio.` };
  }
  if (!BASE64URL_STRICT_RE.test(segment)) {
    return {
      error: `INVALID_BASE64URL: segmento '${label}' contém caracteres fora do alfabeto base64url sem padding.`,
    };
  }
  if (segment.length % 4 === 1) {
    return {
      error: `INVALID_BASE64URL_LENGTH: segmento '${label}' possui comprimento base64url inválido (${segment.length}).`,
    };
  }
  const decoded = Buffer.from(segment, "base64url");
  if (decoded.length === 0 || decoded.toString("base64url") !== segment) {
    return {
      error: `NON_CANONICAL_BASE64URL: segmento '${label}' possui codificação base64url não-canônica.`,
    };
  }
  return { buffer: decoded };
}

function parseJsonObjectSegment(buffer, label, errors) {
  let text;
  try {
    text = UTF8_FATAL_DECODER.decode(buffer);
  } catch {
    errors.push(`INVALID_UTF8: segmento '${label}' não contém UTF-8 válido.`);
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    errors.push(`INVALID_JSON: segmento '${label}' não é um JSON válido.`);
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push(`INVALID_${label.toUpperCase()}_OBJECT: '${label}' do JWS deve ser um objeto JSON.`);
    return null;
  }

  if (Object.hasOwn(parsed, "__proto__")) {
    errors.push(`PROTOTYPE_POLLUTION_KEY: chave '__proto__' proibida detectada em '${label}'.`);
  }

  const clean = {};
  for (const key of Object.keys(parsed)) {
    if (key === "__proto__") continue;
    Object.defineProperty(clean, key, {
      value: parsed[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return clean;
}

function hasPresentClaim(obj, key) {
  if (!obj || !Object.hasOwn(obj, key)) return false;
  const val = obj[key];
  if (val === undefined || val === null) return false;
  if (typeof val === "string" && val.trim() === "") return false;
  return true;
}

function verifyCryptographicSignature({
  alg,
  algSpec,
  signingInput,
  rawSig,
  publicKeyPem,
  secretKey,
  hasPublicKeyParam,
  hasSecretKeyParam,
  errors,
  warnings,
}) {
  if (hasSecretKeyParam) {
    try {
      const secretBuf = Buffer.from(secretKey, "utf8");
      if (secretBuf.length < algSpec.minSecretBytes) {
        warnings.push(
          `WEAK_HMAC_SECRET: secretKey possui ${secretBuf.length} bytes; RFC 7518 §3.2 recomenda >= ${algSpec.minSecretBytes} bytes para ${alg}.`
        );
      }
      const expectedSig = crypto
        .createHmac(algSpec.hash, secretBuf)
        .update(signingInput, "ascii")
        .digest();

      if (rawSig.length === expectedSig.length && crypto.timingSafeEqual(expectedSig, rawSig)) {
        return true;
      }
      errors.push("INVALID_SIGNATURE: assinatura HMAC não confere com a secretKey fornecida.");
      return false;
    } catch (err) {
      errors.push(`HMAC_VERIFICATION_ERROR: falha ao validar assinatura HMAC (${err?.message || "erro interno"}).`);
      return false;
    }
  }

  if (hasPublicKeyParam) {
    let keyObj;
    try {
      keyObj = crypto.createPublicKey(publicKeyPem);
    } catch {
      errors.push("INVALID_PUBLIC_KEY_PEM: falha ao interpretar publicKeyPem como chave pública/certificado X.509 válido.");
      return false;
    }

    const keyType = keyObj.asymmetricKeyType;

    if (algSpec.family === "ec") {
      if (keyType !== "ec") {
        errors.push(`KEY_ALGORITHM_MISMATCH: algoritmo ${alg} exige chave EC, recebido '${keyType || "desconhecido"}'.`);
        return false;
      }
      const curve = keyObj.asymmetricKeyDetails?.namedCurve;
      if (!algSpec.curves.has(curve)) {
        errors.push(
          `INVALID_EC_CURVE: algoritmo ${alg} exige curva ${[...algSpec.curves].join("/")}, recebido '${curve || "desconhecida"}'.`
        );
        return false;
      }
      if (rawSig.length !== algSpec.rawSigBytes) {
        errors.push(
          `INVALID_ECDSA_SIGNATURE_LENGTH: assinatura ${alg} deve ter exatamente ${algSpec.rawSigBytes} bytes (IEEE P1363 R||S), recebido ${rawSig.length} bytes.`
        );
        return false;
      }
      const half = algSpec.rawSigBytes / 2;
      const rAllZero = rawSig.subarray(0, half).every((b) => b === 0);
      const sAllZero = rawSig.subarray(half).every((b) => b === 0);
      if (rAllZero || sAllZero) {
        errors.push(`INVALID_ECDSA_SIGNATURE_COMPONENTS: componente R ou S nulo inválido para ${alg}.`);
        return false;
      }
      try {
        const ok = crypto
          .createVerify(algSpec.hash)
          .update(signingInput, "ascii")
          .verify({ key: keyObj, dsaEncoding: "ieee-p1363" }, rawSig);
        if (!ok) {
          errors.push(`INVALID_SIGNATURE: assinatura ${alg} não confere com publicKeyPem.`);
        }
        return ok;
      } catch (err) {
        errors.push(`ECDSA_VERIFICATION_ERROR: falha na verificação ${alg} (${err?.message || "erro interno"}).`);
        return false;
      }
    }

    if (algSpec.family === "rsa") {
      if (keyType !== "rsa") {
        errors.push(`KEY_ALGORITHM_MISMATCH: algoritmo ${alg} exige chave RSA, recebido '${keyType || "desconhecido"}'.`);
        return false;
      }
      const modulusBits = keyObj.asymmetricKeyDetails?.modulusLength ?? 0;
      if (modulusBits < algSpec.minModulusBits) {
        errors.push(`WEAK_RSA_KEY: chave RSA com ${modulusBits} bits é inferior ao mínimo seguro de ${algSpec.minModulusBits} bits.`);
        return false;
      }
      try {
        const ok = crypto
          .createVerify(algSpec.hash)
          .update(signingInput, "ascii")
          .verify(keyObj, rawSig);
        if (!ok) {
          errors.push(`INVALID_SIGNATURE: assinatura ${alg} não confere com publicKeyPem.`);
        }
        return ok;
      } catch (err) {
        errors.push(`RSA_VERIFICATION_ERROR: falha na verificação ${alg} (${err?.message || "erro interno"}).`);
        return false;
      }
    }

    if (algSpec.family === "rsa-pss") {
      if (keyType !== "rsa" && keyType !== "rsa-pss") {
        errors.push(`KEY_ALGORITHM_MISMATCH: algoritmo ${alg} exige chave RSA/RSA-PSS, recebido '${keyType || "desconhecido"}'.`);
        return false;
      }
      const modulusBits = keyObj.asymmetricKeyDetails?.modulusLength ?? 0;
      if (modulusBits < algSpec.minModulusBits) {
        errors.push(`WEAK_RSA_KEY: chave RSA-PSS com ${modulusBits} bits é inferior ao mínimo seguro de ${algSpec.minModulusBits} bits.`);
        return false;
      }
      try {
        const ok = crypto
          .createVerify(algSpec.hash)
          .update(signingInput, "ascii")
          .verify(
            {
              key: keyObj,
              padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
              saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
            },
            rawSig
          );
        if (!ok) {
          errors.push(`INVALID_SIGNATURE: assinatura ${alg} não confere com publicKeyPem.`);
        }
        return ok;
      } catch (err) {
        errors.push(`RSA_PSS_VERIFICATION_ERROR: falha na verificação ${alg} (${err?.message || "erro interno"}).`);
        return false;
      }
    }
  }

  return false;
}

export function validateJws(args, options = {}) {
  const errors = [];
  const warnings = [];
  let algorithm = "";
  let keyId = null;
  let header = {};
  let payload = {};
  let signatureVerified = false;

  const buildResult = () => ({
    valid: errors.length === 0,
    algorithm,
    keyId,
    header,
    payload,
    signatureVerified,
    errors,
    warnings,
  });

  if (!args || typeof args !== "object" || Array.isArray(args)) {
    errors.push("INVALID_INPUT: argumentos devem ser um objeto JSON.");
    return buildResult();
  }

  const { token, expectedAlg, publicKeyPem, secretKey, requiredClaims } = args;

  let expectedAlgSpec = null;
  if (expectedAlg !== undefined && expectedAlg !== null) {
    if (typeof expectedAlg !== "string" || expectedAlg.trim().length === 0) {
      errors.push("INVALID_EXPECTED_ALG: expectedAlg deve ser uma string não vazia.");
    } else if (expectedAlg.trim().toLowerCase() === "none") {
      errors.push("ALG_NONE_FORBIDDEN: expectedAlg não pode ser 'none'.");
    } else if (!Object.hasOwn(JWS_ALGORITHMS, expectedAlg)) {
      errors.push(`UNSUPPORTED_EXPECTED_ALG: expectedAlg '${expectedAlg}' não é suportado.`);
    } else {
      expectedAlgSpec = JWS_ALGORITHMS[expectedAlg];
    }
  }

  const hasPublicKeyParam = publicKeyPem !== undefined && publicKeyPem !== null;
  const hasSecretKeyParam = secretKey !== undefined && secretKey !== null;

  if (hasPublicKeyParam) {
    if (typeof publicKeyPem !== "string" || publicKeyPem.trim().length === 0) {
      errors.push("INVALID_PUBLIC_KEY: publicKeyPem deve ser uma string PEM não vazia.");
    } else if (PRIVATE_PEM_RE.test(publicKeyPem)) {
      errors.push("PRIVATE_KEY_REJECTED: publicKeyPem não pode conter bloco de chave privada.");
    }
  }

  if (hasSecretKeyParam) {
    if (typeof secretKey !== "string" || secretKey.length === 0) {
      errors.push("INVALID_SECRET_KEY: secretKey deve ser uma string não vazia.");
    } else if (PUBLIC_PEM_RE.test(secretKey)) {
      warnings.push(
        "SUSPICIOUS_SECRET_KEY_PEM: secretKey aparenta conter PEM de chave pública/certificado; risco de Key Confusion."
      );
    }
  }

  if (hasPublicKeyParam && hasSecretKeyParam) {
    errors.push("AMBIGUOUS_KEY_MATERIAL: forneça apenas publicKeyPem OU secretKey, nunca ambos simultaneamente.");
  }

  let normalizedRequiredClaims = null;
  if (requiredClaims !== undefined && requiredClaims !== null) {
    if (!Array.isArray(requiredClaims)) {
      errors.push("INVALID_REQUIRED_CLAIMS: requiredClaims deve ser um array de strings.");
    } else {
      const seen = new Set();
      normalizedRequiredClaims = [];
      for (const claim of requiredClaims) {
        if (typeof claim !== "string" || claim.trim().length === 0) {
          errors.push("INVALID_REQUIRED_CLAIM_ITEM: cada item em requiredClaims deve ser string não vazia.");
        } else if (!seen.has(claim)) {
          seen.add(claim);
          normalizedRequiredClaims.push(claim);
        }
      }
    }
  }

  if (typeof token !== "string" || token.length === 0) {
    errors.push("MISSING_OR_INVALID_TOKEN: token JWS deve ser uma string não vazia.");
    return buildResult();
  }
  if (Buffer.byteLength(token, "utf8") > MAX_JWS_TOKEN_BYTES) {
    errors.push(`TOKEN_TOO_LARGE: token JWS excede o limite seguro de ${MAX_JWS_TOKEN_BYTES} bytes.`);
    return buildResult();
  }
  if (/\s/.test(token)) {
    errors.push("MALFORMED_JWS_WHITESPACE: token JWS Compact não pode conter espaços ou quebras de linha.");
    return buildResult();
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    errors.push(
      `INVALID_COMPACT_SERIALIZATION: JWS Compact exige exatamente 3 partes separadas por '.' (recebido ${parts.length}).`
    );
    return buildResult();
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const headerDecoded = decodeBase64UrlStrict(headerB64, "header");
  const payloadDecoded = decodeBase64UrlStrict(payloadB64, "payload");
  const sigDecoded = decodeBase64UrlStrict(signatureB64, "signature");

  if (headerDecoded.error) errors.push(headerDecoded.error);
  if (payloadDecoded.error) errors.push(payloadDecoded.error);
  if (sigDecoded.error) errors.push(sigDecoded.error);

  const parsedHeader = headerDecoded.buffer
    ? parseJsonObjectSegment(headerDecoded.buffer, "header", errors)
    : null;
  const parsedPayload = payloadDecoded.buffer
    ? parseJsonObjectSegment(payloadDecoded.buffer, "payload", errors)
    : null;

  if (parsedHeader) header = parsedHeader;
  if (parsedPayload) payload = parsedPayload;

  let algSpec = null;
  if (parsedHeader) {
    if (Object.hasOwn(header, "b64") && header.b64 !== true) {
      errors.push("UNSUPPORTED_B64_HEADER: header.b64 !== true (RFC 7797 unencoded payload) não é suportado.");
    }

    for (const forbidden of FORBIDDEN_JWS_HEADER_KEYS) {
      if (Object.hasOwn(header, forbidden)) {
        errors.push(`FORBIDDEN_HEADER_PARAM: cabeçalho '${forbidden}' proibido (anti-SSRF / anti-key-injection).`);
      }
    }

    for (const thumb of IGNORED_THUMBPRINT_HEADER_KEYS) {
      if (Object.hasOwn(header, thumb)) {
        warnings.push(`HEADER_THUMBPRINT_IGNORED: parâmetro '${thumb}' no header não é usado como âncora de confiança.`);
      }
    }

    if (Object.hasOwn(header, "kid")) {
      if (typeof header.kid === "string" && header.kid.trim().length > 0) {
        keyId = header.kid;
      } else {
        warnings.push("INVALID_KID_HEADER: header.kid presente, porém vazio ou não-string.");
      }
    }

    const rawAlg = Object.hasOwn(header, "alg") ? header.alg : undefined;
    algorithm = typeof rawAlg === "string" ? rawAlg : "";

    if (typeof rawAlg !== "string" || rawAlg.trim().length === 0) {
      errors.push("MISSING_ALGORITHM: header.alg ausente ou inválido.");
    } else if (rawAlg.trim().toLowerCase() === "none") {
      errors.push("ALG_NONE_FORBIDDEN: algoritmo 'none' é terminantemente proibido.");
    } else if (!Object.hasOwn(JWS_ALGORITHMS, rawAlg)) {
      errors.push(`UNSUPPORTED_ALGORITHM: algoritmo '${rawAlg}' não é permitido pela política JWS.`);
    } else {
      algSpec = JWS_ALGORITHMS[rawAlg];
      if (expectedAlgSpec && rawAlg !== expectedAlg) {
        errors.push(`ALGORITHM_MISMATCH: header.alg ('${rawAlg}') diverge de expectedAlg ('${expectedAlg}').`);
      }
    }
  }

  if (hasPublicKeyParam) {
    if (algSpec?.family === "hmac" || expectedAlgSpec?.family === "hmac") {
      errors.push(
        "KEY_CONFUSION_DETECTED: algoritmo simétrico HMAC não pode ser usado com publicKeyPem (chave pública assimétrica)."
      );
    }
  }
  if (hasSecretKeyParam) {
    if ((algSpec && algSpec.family !== "hmac") || (expectedAlgSpec && expectedAlgSpec.family !== "hmac")) {
      errors.push(
        "KEY_CONFUSION_DETECTED: algoritmo assimétrico não pode ser validado com secretKey (chave simétrica HMAC)."
      );
    }
  }

  const hasSingleKeyMaterial =
    (hasPublicKeyParam && !hasSecretKeyParam) || (hasSecretKeyParam && !hasPublicKeyParam);

  if (hasSingleKeyMaterial) {
    if (errors.length === 0 && algSpec && sigDecoded.buffer) {
      signatureVerified = verifyCryptographicSignature({
        alg: algorithm,
        algSpec,
        signingInput: `${headerB64}.${payloadB64}`,
        rawSig: sigDecoded.buffer,
        publicKeyPem,
        secretKey,
        hasPublicKeyParam,
        hasSecretKeyParam,
        errors,
        warnings,
      });
    }
  } else {
    warnings.push(
      "SIGNATURE_NOT_VERIFIED: nenhuma chave criptográfica (publicKeyPem ou secretKey) foi fornecida; validação apenas estrutural/claims."
    );
  }

  if (parsedPayload) {
    const nowSec = Number.isFinite(options?.nowSec)
      ? Math.floor(options.nowSec)
      : Math.floor(Date.now() / 1000);

    const hasExp = Object.hasOwn(payload, "exp");
    const hasNbf = Object.hasOwn(payload, "nbf");
    let validExp = null;
    let validNbf = null;

    if (hasExp) {
      if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
        errors.push("INVALID_EXP_CLAIM: claim 'exp' deve ser um timestamp numérico Unix finito.");
      } else {
        validExp = payload.exp;
        if (payload.exp <= nowSec) {
          errors.push(`TOKEN_EXPIRED: token expirado em exp=${payload.exp} (agora=${nowSec}).`);
        }
      }
    } else {
      warnings.push("MISSING_EXP_CLAIM: token sem claim 'exp'; risco de replay em fluxos financeiros.");
    }

    if (hasNbf) {
      if (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf)) {
        errors.push("INVALID_NBF_CLAIM: claim 'nbf' deve ser um timestamp numérico Unix finito.");
      } else {
        validNbf = payload.nbf;
        if (payload.nbf > nowSec) {
          errors.push(`TOKEN_NOT_YET_VALID: token válido apenas após nbf=${payload.nbf} (agora=${nowSec}).`);
        }
      }
    }

    if (validExp !== null && validNbf !== null && validNbf >= validExp) {
      errors.push(`INVALID_TIME_WINDOW: claim 'nbf' (${validNbf}) é maior ou igual a 'exp' (${validExp}).`);
    }

    if (Object.hasOwn(payload, "iat")) {
      if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) {
        errors.push("INVALID_IAT_CLAIM: claim 'iat' deve ser um timestamp numérico Unix finito.");
      } else if (payload.iat > nowSec + 60) {
        warnings.push(`FUTURE_IAT_CLAIM: claim 'iat' (${payload.iat}) está no futuro em relação a now=${nowSec}.`);
      }
    }

    if (Object.hasOwn(payload, "is_demo") && payload.is_demo === true) {
      warnings.push(
        "DEMO_MODE_TOKEN: payload marcado com is_demo=true; bloquear liquidações reais e gravação no WORM Ledger BCB 4893."
      );
    }

    if (Object.hasOwn(payload, "amount") && typeof payload.amount === "number" && !Number.isInteger(payload.amount)) {
      warnings.push(
        "NON_INTEGER_AMOUNT: claim 'amount' em ponto flutuante; padrão BCB 4893 recomenda valores inteiros em centavos (amount_cents)."
      );
    }
  }

  if (parsedHeader && parsedPayload && normalizedRequiredClaims) {
    for (const claim of normalizedRequiredClaims) {
      const inHeader = hasPresentClaim(header, claim);
      const inPayload = hasPresentClaim(payload, claim);
      if (!inHeader && !inPayload) {
        errors.push(`MISSING_REQUIRED_CLAIM: claim obrigatória '${claim}' ausente ou vazia no header e no payload.`);
      } else if (inHeader && !inPayload && PAYLOAD_SEMANTIC_CLAIMS.has(claim)) {
        warnings.push(`CLAIM_IN_HEADER_ONLY: claim '${claim}' encontrada apenas no header e não no payload.`);
      }
    }
  }

  return buildResult();
}
