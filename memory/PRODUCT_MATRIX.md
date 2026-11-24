# ShapeLab — Matriz de Adoção de Skills & Polinização Cruzada (`PRODUCT_MATRIX`)

Esta matriz acompanha em tempo real quais capacidades do `shapelab-brain` já estão implantadas em cada produto da **Shapelab (`shapelab.ia.br`)**, permitindo identificar imediatamente lacunas técnicas ("vacinas pendentes") e oportunidades de reuso.

## 1. Status de Sincronia do `.shapelab` por Produto
| Produto Comercial | Diretório / Repo | Versão `.shapelab` | Sync Automático | CI/Deploy Principal |
| :--- | :--- | :--- | :--- | :--- |
| **Mr. Coach** | `B2B-personal-ia` | `v2.5.0` | `brain_sync.ps1` + `.github/workflows/brain_sync.yml` | Firebase Hosting + Render |
| **ReformAI** | `ReformAI` | `v2.8.0` | `brain_sync.ps1` + `.github/workflows/brain_sync.yml` | Cloudflare Pages/Workers + Docker |
| **Smart EV Hub** | `Smart-EV-Hub` | `v2.5.0` | `brain_sync.ps1` + `.github/workflows/brain_sync.yml` | FastAPI + Flutter BLE/HIL |
| **Tattoo SaaS** | `tattoo-saas` *(Planejado)* | — | Via scaffolding inicial | A definir |

---

## 2. Adoção de Skills Oficiais (`skills/`)

Legenda: ✅ Em produção / ativo | 🟡 Parcial / em evolução | ⏳ Pendente (vacina recomendada) | ➖ Não aplicável

| Skill Oficial (`shapelab-brain`) | `B2B-personal-ia` (Mr. Coach) | `ReformAI` | `Smart-EV-Hub` | `tattoo-saas` (Planejado) |
| :--- | :---: | :---: | :---: | :---: |
| `skills/payments/asaas_split.md` (BCB 4893 + JWS + WORM) | ✅ Origem | ✅ (Asaas + Escrow) | 🟡 (Dual-Gateway Asaas + Efí) | ⏳ Planejado |
| `skills/security/auth_anti_takeover.md` (Guards, PBKDF2/Argon2, AAL2) | ✅ Origem | ✅ (`_guard.ts` + PBKDF2 + `node-rbac-guard.ts` \| P3.2/P3.3/P3.4) | 🟡 (RBAC B2B2C) | ⏳ Planejado |
| `skills/security/auth_anti_takeover.md#6` (WebAuthn L3 Passkeys CBOR/COSE + `signCount`) | ⏳ Pendente (AAL2 Passkeys) | ✅ (`cbor-webauthn` + D1) | ⏳ Pendente (B2B2C Mobile) | ⏳ Planejado |
| `skills/ui/flutter_edge_to_edge.md` (Edge-to-Edge + Dual-Theme WCAG) | ✅ Origem | ➖ (Web/Edge) | 🟡 (Flutter Cockpit) | ⏳ Planejado |
| `skills/backend/supabase_rls.md` (Multi-tenant RLS + Storage LGPD) | ✅ Origem | 🟡 (D1 + Supabase PostGIS \| P3.2/P3.3/P3.4) | 🟡 (Multi-Actor B2B2C) | ⏳ Planejado |
| `skills/growth/whatsapp_dual_channel.md` (Meta Cloud + Evolution) | ✅ Origem | ✅ (Notificações WA) | ⏳ Pendente | ⏳ Planejado |
| `skills/devops/versioning_and_ota_update.md` (`YYYYMMDDNN` + `SemVer+SHA`) | ✅ Origem (Flutter/PWA) | ✅ Origem (`version.py`) | ✅ (`update_version.dart` + `version.py`) | ⏳ Planejado |
| `skills/brand/shapelab_brand_identity.md` (Prism S Neon + `brand_manifest.json`) | ✅ (`shapelab.ia.br` + PWA) | ⏳ Pendente migração visual | ✅ (PWA Icons + `#090D16`) | ⏳ Planejado |
| `skills/sre/observability_crash_shield_and_backup.md` (Deep Health + HTTP 500 Shield) | 🟡 (Crash Shield Web) | 🟡 (Healthcheck) | 🟡 (Deep Ready / Crash Shield) | ⏳ Planejado |
| `skills/devops/cloud_run_stateless_cutover.md` (Cloud Run `southamerica-east1` + Blue-Green) | ➖ (Render) | 🟡 (Docker OCI) | ✅ (Cloud Run Deploy) | ⏳ Planejado |
| `skills/security/jws_terms_and_demo_isolation.md` (JWS RFC 7515 + Isolamento Demo RLS) | ✅ (Asaas Split JWS) | 🟡 (Escrow JWS) | 🟡 (Passaporte WORM) | ⏳ Planejado |

---

## 3. Como Manter Esta Matriz Atualizada
1. Sempre que uma skill for portada para outro produto (ex: aplicar `versioning_and_ota_update.md` no `Smart-EV-Hub` ou aplicar `shapelab_brand_identity.md` no portal `shapelab.ia.br`), atualize a célula correspondente de ⏳/🟡 para ✅.
2. Atualizações apenas em `memory/PRODUCT_MATRIX.md` contam como incremento **`PATCH`** no `VERSION` do `shapelab-brain`.
