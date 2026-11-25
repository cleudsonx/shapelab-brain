# Shapelab Core Constitution

Diretrizes técnicas e de governança inegociáveis aplicáveis a todos os produtos da Shapelab (`shapelab.ia.br`): **Mr. Coach (`B2B-personal-ia`)**, **ReformAI**, **Smart EV Hub** e novos SaaS.

## 1. Protocolo Spec-First Gate & Zero-Downtime
- **Levantamento 360º Obrigatório:** Em qualquer mudança arquitetural, sanitização de dados, refatoração ou migração de infraestrutura, execute primeiro um levantamento profundo de impacto (preferencialmente com `shapelab-spec-research`).
- **Trava de Escopo:** **NUNCA altere código** enquanto o escopo ou definições estiverem sob validação ou quando o usuário instruir para não modificar arquivos.
- **Transição em Duas Fases (Zero-Downtime):** Mudanças de chaves, URLs, schemas de banco ou contratos de API devem adotar suporte dual (Fase 1: convivência/fallback transparente; Fase 2: corte definitivo após maturação).

## 2. Stack Padrão e Infraestrutura Real
- **Frontend Mobile/Web/PWA:** Flutter (arquitetura limpa, responsiva, suporte a Edge-to-Edge, Dual-Theme Dark/Light com contraste WCAG e cache offline resiliente) ou Web/Edge leve no Cloudflare Pages quando aplicável (ex: landing/simuladores do ReformAI).
- **Backend / APIs / Edge:** Python 3.11 (FastAPI) com tipagem estrita (Pydantic v2) e operações assíncronas (`async/await` + `httpx.AsyncClient`), hospedado no Google Cloud Run (`southamerica-east1` São Paulo para conformidade LGPD e baixa latência) ou Render, complementado por Cloudflare Workers em rotas de borda.
- **Observabilidade & Resiliência SRE:** Deep Healthcheck desacoplado (`/health/live` responsivo sem consultar DB/Redis vs `/health/ready` paralelo com timeout <= 2s), sanitização total de erros HTTP 500 em produção (retornando apenas `correlation_id`), Crash Shield global no Flutter e desligamento gracioso (`SIGTERM` com dreno <= 9s).
- **Banco de Dados & Storage:** Supabase (PostgreSQL + Auth + Storage Privado com RLS obrigatório).
- **Pagamentos & Fintech (Brasil):** Asaas API v3 (Pix, Cartão, Assinaturas e Split) sob blindagem **BCB 4893** e JWS RFC 7515 com isolamento estrito de contas `is_demo` / `demo_mode`.
- **Mensageria Crítica:** Arquitetura Dual-Channel (Meta Cloud API Oficial como canal primário + Evolution API como fallback automático com *Graceful Degradation*).
- **Inteligência Artificial:** Modelos Gemini via SDK oficial (`google-genai`), otimizando prompts para baixa latência, structured outputs e controle estrito de tokens.
- **Identidade de Marca (*House of Brands* & Boas Práticas de Lojas):** A marca **ShapeLab (`Prism S Neon`)** é exclusiva da Venture Builder/Plataforma (`shapelab.ia.br`, Cockpit e plugin `shapelab-os`). Cada app/produto (**Mr. Coach**, **ReformAI**, **Smart EV Hub**, novos SaaS) preserva integralmente sua marca comercial, paleta, ícone do aplicativo (`AppIcon` iOS / `Adaptive Icon` Android / PWA) e criativos publicitários próprios, mantendo apenas o **endosso discreto da ShapeLab no rodapé** (`AppVersionFooter` / `<footer>`), tela Sobre e nos metadados de publicador/copyright exigidos pelas políticas da **Apple App Store** e **Google Play Store** (`skills/brand/shapelab_brand_identity.md`).

## 3. Segurança Zero-Trust, Auth Anti-Takeover e BCB 4893 (Inviolável)
- **Fail-Closed & Zero Security-by-Obscurity:** Ocultar botões no frontend ou checar `localStorage` não é controle de acesso. Todo endpoint privado e tela interna deve validar sessão e papel (RBAC) no servidor (`Depends(get_current_*)` no FastAPI ou `_guard.ts` recebendo `{ request, env, ctx }` no Cloudflare Worker), negando com HTTP `401`/`403` por padrão.
- **Proteção contra Account Takeover em Fluxos Públicos:** Cadastros simplificados ou checkouts públicos jamais podem sobrescrever senha, role (`trainer`, `admin`) ou metadados de contas existentes. O polling pós-checkout exige `checkout_nonce` criptográfico de uso único e curta expiração.
- **Isolamento de Contas Sintéticas:** Contas de automação (`wa_*`, `aluno_*`, `bot_*`, `*.internal`) são bloqueadas por guard e rotina de startup contra qualquer elevação para `admin` ou `vip`.
- **Criptografia de Credenciais e Anti-Força Bruta:** Quando senhas forem gerenciadas fora do Supabase Auth, usar estritamente **Argon2id** (Python) ou **PBKDF2-HMAC-SHA256** (`>= 100.000` iterações + salt CSPRNG `>= 16 bytes` em Edge Workers), comparação em tempo constante (`hmac.compare_digest` / XOR bitwise) e *lazy rehash* automático. Aplicar lockout (`HTTP 429` + `Retry-After`) após 5 falhas por `(identificador, IP)`.
- **MFA Escalável (AAL2) e Kill-Switch de Sessão:** Operações críticas (saques, split, painel admin, contexto profissional) exigem sessão rastreada por `device_id` (`X-Device-Id`), validação AAL2 quando aplicável e invalidação real no servidor no logout (`sessions_revoked_before` / `DELETE`).
- **Blindagem Financeira BCB 4893:**
  1. **Precisão em Centavos:** Valores monetários internos operam como inteiros em centavos (`amount_cents`) ou `Decimal` estrito, nunca `float` binário solto em cálculos de saldo.
  2. **Locks Pessimistas Anti-Double-Spend:** Mutações de carteira/saque rodam sob `SELECT ... FOR UPDATE` (ou lock atômico com timeout) e validação de saldo não-negativo.
  3. **Split Assinado (JWS):** Regras de split vindas do cliente devem ser assinadas e verificadas via JWS no backend antes do envio ao Asaas.
  4. **Idempotência + WORM Ledger:** Todo webhook financeiro valida token em tempo constante, garante idempotência via constraint `UNIQUE` (`event_id`) e grava na trilha imutável `financial_audit_ledger` encadeada por hash `SHA-256(prev_hash + timestamp + payload)`.

## 4. Higiene de Código, Testes Adversariais e CI Preflight
- **Mentalidade Solo-Founder (Anti-Overengineering):** Priorize arquiteturas modulares fáceis de manter e depurar por uma pessoa, sem infraestrutura ociosa cara.
- **Testes Adversariais & CI Preflight:** Código que manipula saldo, autenticação ou estado compartilhado deve ser testado contra *race conditions* (requisições concorrentes) e payloads adulterados. Nenhuma entrega está pronta sem rodar a suíte de testes local (`pytest` / `flutter analyze` / `flutter test`) e limpar todos os arquivos temporários de scratch.

## 5. Versionamento & Rastreabilidade
- **Frontend Flutter / PWA:** Todo produto Flutter/Web deve publicar `version.json` sincronizado com `pubspec.yaml`, `app_config.dart`, `app_changelog.dart` e `index.html` (`APP_CURRENT_BUILD`) usando build monotônico de 32 bits (`YYYYMMDDNN`), `initAssetCacheGuard` contra cache stale de manifests, detector OTA (`PwaUpdateWrapper`) e changelog segmentado por `targetRoles` (`skills/devops/versioning_and_ota_update.md`).
- **Backend / Edge / Containers:** Todo serviço de backend deve expor sua versão no formato `MAJOR.MINOR.PATCH+build.<run>.<sha>` (e tag Docker com hífen) para rastreabilidade em logs de auditoria, WORM Ledger e CI/CD.

## 6. Evolução Contínua do Brain (Loop Fechado Automático)
- O plugin `shapelab-os` (`v3.0+`) monitora automaticamente alterações de versão e commits via Lifecycle Hooks (`SessionStart`, `PostToolUse`, `Stop`).
- Sempre que uma nova regra, padrão reutilizável, skill ou lição atingir **Score `>= 7/10`** na Rubrica de `memory/BRAIN_EVOLUTION_PROTOCOL.md` (aplicável a `>= 2` produtos atuais ou projetos futuros, sem segredos nem regras exclusivas de domínio), o agente deve acionar `shapelab-brain-curator` / `brain-self-learning`, atualizar `memory/PRODUCT_MATRIX.md`, incrementar `VERSION` + `CHANGELOG.md` e sincronizar o `.shapelab`.
