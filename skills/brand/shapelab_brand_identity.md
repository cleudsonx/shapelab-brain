---
id: skill-brand-shapelab-identity
version: 2.0.0
status: production-verified
last_verified: 2026-11-25
origin_project: shapelab-brain
compatible_subagent: shapelab-mobile-ui
stack: [brand, house-of-brands, store-compliance, design-tokens, html-seo, pwa, flutter, material-3]
brand_architecture: house_of_brands_with_venture_endorsement
canonical_domain: https://shapelab.ia.br
primary_colors:
  obsidian_bg: "#090D16"
  surface_dark: "#0F172A"
  emerald_neon: "#10B981"
  electric_cyan: "#06B6D4"
  platinum_ink: "#F8FAFC"
  muted_slate: "#94A3B8"
official_assets:
  logo_square: assets/brand/shapelab_logo_prism_s.png
  banner_wide: assets/brand/shapelab_banner_prism_s.png
  brand_manifest_json: assets/brand/brand_manifest.json
---

# Skill: Arquitetura House of Brands & Identidade ShapeLab

## 1. Princípio Arquitetural — Autonomia do Produto + Endosso Institucional

O ecossistema ShapeLab adota estritamente o modelo **House of Brands com Endosso Institucional da Venture Builder** (*Endorsed Brand Architecture*):

1. **Cada produto tem identidade 100% própria:** **Mr. Coach (`B2B-personal-ia`)**, **ReformAI** e **Smart EV Hub** (bem como qualquer novo SaaS incubado) mantêm suas próprias marcas comerciais, nomes, logotipos, paletas de cores, ícones de aplicativo (`AppIcon` iOS / `Adaptive Icon` Android / ícones PWA), *splash screens*, capturas de loja (*screenshots*) e criativos publicitários.
2. **A marca `ShapeLab` (`Prism S Neon`) pertence exclusivamente à Venture Builder / Plataforma:** É utilizada no portal institucional (`shapelab.ia.br`), no plugin `shapelab-os`, no `shapelab-brain`, no Founder Cockpit e como **selo discreto de autoria/endosso** nos rodapés, telas "Sobre" e metadados de publicador das lojas.
3. **Regra Inviolável Anti-Override para Agentes de IA:**
   - **NUNCA** substitua o ícone de launcher do app (`ic_launcher`, `AppIcon`, PWA `Icon-192`/`Icon-512` de produto final), logotipo principal, paleta comercial ou peças publicitárias de um produto pelo monograma **Prism S** da ShapeLab.
   - Um novo produto nasce com `AppIcon` e identidade visual próprios do seu segmento — nunca clonando o branding institucional da ShapeLab como marca final ao consumidor.

---

## 2. Perfis de Identidade Própria por Produto

| Produto | Repositório | Personalidade Visual & Paleta Própria | Ativos Exclusivos do Produto | Endosso ShapeLab Aplicado |
| :--- | :--- | :--- | :--- | :--- |
| **Mr. Coach** | `B2B-personal-ia` | Fitness, Performance & IA Biomecânica (*Modern Editorial Clean / Apple Fitness & Whoop Style*); acentos `Emerald #059669 / #10B981`, `Tangerine #EA580C`, `Cobalt`. | Ícone próprio do Mr. Coach, criativos publicitários fitness/personal trainer, identidade em landing B2B e onboarding do aluno. | Rodapé (`AppVersionFooter`), tela Sobre, e-mails transacionais (`by ShapeLab`) e conta de publicador nas lojas. |
| **ReformAI** | `ReformAI` | Inteligência Tributária LC 214/2025 & Marketplace (`RestituiAI`, `SplitFácil AI`, `TratoJusto AI`). | Logotipos e paleta próprios para mercado fiscal/B2B, criativos publicitários fiscais/NFC-e e PWA próprio. | Rodapé institucional das páginas/portais e metadados de publicador/legal. |
| **Smart EV Hub** | `Smart-EV-Hub` | Mobilidade Elétrica, Forense de Bateria & Passaporte Digital WORM B2B2C (alto contraste WCAG para pátios, concessionárias e oficinas ao ar livre). | Ícone próprio de telemetria/EV, visual cockpit motorista & pit-stop 180s, criativos B2B2C automotivos. | Rodapé do app/passaporte WORM (`Smart EV Hub — A ShapeLab Venture`) e conta de publicador nas lojas. |

---

## 3. Padrão Canônico de Endosso no Rodapé (In-App, PWA & Web)

Nos rodapés de aplicativo (`AppVersionFooter` em Flutter ou `<footer>` HTML), telas de Configurações/Sobre e Passaportes Públicos:

- **Hierarquia Visual:** O **nome e o ícone do produto** aparecem em primeiro plano junto à versão monotônica (`vX.Y.Z • Build YYYYMMDDNN`); a referência à ShapeLab entra como **chancela institucional discreta** logo abaixo ou ao lado, utilizando o micro-selo `ShapeLabIcon` (`14px–16px`) apenas como assinatura da fabricante/venture builder.
- **Texto Canônico:**
  - Compacto (in-app footer): `Um produto ShapeLab — AI Venture Builder`
  - Web / Institucional: `Desenvolvido por ShapeLab (shapelab.ia.br) • © 2026 ShapeLab AI Venture Builder`

### Exemplo Flutter (`AppVersionFooter` + Selo de Endosso)
```dart
Column(
  mainAxisSize: MainAxisSize.min,
  children: [
    // 1. Linha principal: Identidade PRÓPRIA do App + Versão OTA
    Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ProductAppLogo(size: 16), // Ícone do próprio Mr. Coach / Smart EV Hub
        const SizedBox(width: 8),
        Text(AppConfig.productDisplayName), // Ex: 'Mr. Coach'
        const Text(' • '),
        Text(AppConfig.fullVersionString),  // Ex: 'v1.18.7 • Build 2026112501'
      ],
    ),
    const SizedBox(height: 4),
    // 2. Linha de endosso institucional da Venture Builder
    Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ShapeLabIcon(size: 12, isDark: isDark), // Micro-selo Prism S opcional (<= 14px)
        const SizedBox(width: 5),
        Text(
          'Um produto ShapeLab • shapelab.ia.br',
          style: TextStyle(fontSize: 10, color: subtextColor),
        ),
      ],
    ),
  ],
)
```

---

## 4. Boas Práticas e Compliance Google Play Store & Apple App Store

Para evitar reprovações por *Generic Wrapper*, *Design Spam (Guideline 4.3)*, *Misleading Metadata (Guideline 2.3.7)* ou violação de *Impersonation/Brand Metadata*:

### (a) Apple App Store (App Store Review Guidelines)
1. **App Name & Subtitle:** Pertencem 100% à marca do produto (ex.: `Mr. Coach — Treinos com IA`). **Não** prefixar todos os apps com `ShapeLab - ...` no título principal de loja, prevenindo conflito de identidade e rejeição por spam de portfólio (*Guideline 4.3*).
2. **AppIcon (`1024x1024`):** Exclusivo da marca do produto, sem canal alpha/transparência e sem sobrepor badges ou textos promocionais.
3. **Screenshots & App Previews:** Mostram exclusivamente a UI e os criativos do produto específico, proibindo mockups genéricos com logo gigante da Venture Builder cobrindo o produto.
4. **Onde entra a marca ShapeLab na Apple:**
   - **Seller / Developer Name:** `ShapeLab` (razão social/conta organizacional).
   - **Copyright:** `© 2026 ShapeLab AI Venture Builder`
   - **Rodapé da Descrição e Tela "Sobre":** Parágrafo curto no final da descrição (*"Desenvolvido por ShapeLab — AI Venture Builder (shapelab.ia.br)"*), **Privacy Policy URL** e **Support URL** sob domínio oficial validado.

### (b) Google Play Store (Store Listing & Metadata Policy)
1. **App Title (máx. 30 caracteres), Short Description & Full Description:** Focados integralmente no valor e marca comercial do produto. Proibido keyword stuffing com nomes de outros produtos da casa.
2. **Hi-Res Icon (`512x512`) & Adaptive Icon (`108dp` canvas / `66%` safe zone):** Ícone próprio do produto em PNG 32-bit, mantendo o símbolo principal dentro dos `66%` centrais para não sofrer corte circular/*squircle*.
3. **Feature Graphic (`1024x500`) e Criativos Publicitários (Google Ads / Meta Ads):** Identidade visual e copy 100% do produto anunciado; opcionalmente incluir um micro selo `"by ShapeLab"` discreto no canto inferior, sem competir com o logo do app.
4. **Onde entra a marca ShapeLab no Google Play:**
   - **Developer Account Name:** `ShapeLab` (exibido nativamente abaixo do nome do app pela Play Store).
   - **Developer Contact / Website / Privacy Policy:** `https://shapelab.ia.br` ou subdomínio oficial do produto vinculado à Privacy Policy corporativa.

---

## 5. Identidade Exclusiva da Venture Builder (`ShapeLab Prism S Neon`)

Estes ativos e tokens são reservados ao **ecossistema institucional da plataforma ShapeLab** (`shapelab.ia.br`, `shapelab-brain`, plugin `shapelab-os`, Founder Cockpit e selos discretos de rodapé):

- **Manifesto estruturado:** [`assets/brand/brand_manifest.json`](../../assets/brand/brand_manifest.json)
- **Logo Oficial da Venture Builder (1:1):** [`assets/brand/shapelab_logo_prism_s.png`](../../assets/brand/shapelab_logo_prism_s.png)
- **Banner Oficial da Venture Builder (16:9):** [`assets/brand/shapelab_banner_prism_s.png`](../../assets/brand/shapelab_banner_prism_s.png)

### Paleta Institucional ShapeLab (Plataforma / Venture Builder)
| Token | Hex | Uso Exclusivo da Plataforma / Endosso |
| :--- | :--- | :--- |
| `obsidian_bg` | `#090D16` | Fundo institucional `shapelab.ia.br`, Founder Cockpit, banners da Venture Builder |
| `surface_dark` | `#0F172A` | Cards elevados e painéis internos do ShapeLab OS |
| `emerald_neon` | `#10B981` | Cor primária institucional ShapeLab e início do gradiente Prism S |
| `electric_cyan` | `#06B6D4` | Acento tecnológico institucional ShapeLab e fim do gradiente Prism S |
| `platinum_ink` | `#F8FAFC` | Texto principal sobre fundos escuros da plataforma |
| `muted_slate` | `#94A3B8` | Subtítulos (`AI VENTURE BUILDER`), rótulos de rodapé institucional |

```html
<!-- Metatags de Site Institucional da Venture Builder (shapelab.ia.br) -->
<meta name="theme-color" content="#090D16" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="ShapeLab — AI Venture Builder" />
<meta property="og:image" content="https://shapelab.ia.br/assets/brand/shapelab_banner_prism_s.png" />
<meta name="twitter:card" content="summary_large_image" />
```

## 6. Critério de Aceite
1. Nenhum produto comercial (`Mr. Coach`, `ReformAI`, `Smart EV Hub`, novos SaaS) tem seu `AppIcon`, ícone publicitário ou marca comercial sobrescritos pelo `Prism S`.
2. Todo produto exibe endosso institucional discreto da ShapeLab no rodapé/Sobre e nos metadados de publicador (`Developer`/`Seller`, `Copyright`, `Privacy Policy`) conforme políticas Apple App Store e Google Play Store.
3. `assets/brand/brand_manifest.json` mantém os caminhos dos ativos da Venture Builder válidos e lista explicitamente as garantias de preservação da marca de cada produto.
