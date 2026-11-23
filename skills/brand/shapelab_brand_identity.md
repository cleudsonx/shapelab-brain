---
id: skill-brand-shapelab-identity
version: 1.0.0
status: production-verified
last_verified: 2026-11-22
origin_project: shapelab-brain
compatible_subagent: shapelab-mobile-ui
stack: [brand, design-tokens, html-seo, pwa, flutter, material-3]
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

# Skill: Identidade Visual Oficial ShapeLab (Prism S & Efeito Neon)

## 1. Objetivo
Padronizar o uso do símbolo oficial **Prism S** e do banner horizontal **SHAPELAB — AI VENTURE BUILDER** em todas as superfícies digitais da plataforma (`shapelab.ia.br`, apps Flutter Android/iOS, PWA, Meta/OpenGraph, favicons e repositórios GitHub), garantindo legibilidade tanto para designers humanos quanto para agentes de IA.

## 2. Contrato de Ativos e Paleta Oficial
- **Manifesto estruturado (Machine-Readable):** [`assets/brand/brand_manifest.json`](../../assets/brand/brand_manifest.json)
- **Logo Oficial (1:1):** [`assets/brand/shapelab_logo_prism_s.png`](../../assets/brand/shapelab_logo_prism_s.png) — Monograma geométrico `"S"` escultórico em duas fitas de vidro metálico entrelaçadas com brilho neon esmeralda/ciano sobre fundo obsidiana.
- **Banner Oficial (16:9):** [`assets/brand/shapelab_banner_prism_s.png`](../../assets/brand/shapelab_banner_prism_s.png) — Logo Prism S à esquerda + wordmark `"SHAPELAB"` e subtítulo `"AI VENTURE BUILDER"` à direita.

### Paleta Oficial & Tokens de Efeito Neon
| Token | Hex | Uso Recomendado |
| :--- | :--- | :--- |
| `obsidian_bg` | `#090D16` | Fundo principal Dark Mode, Splash Screen, `<meta name="theme-color">`, Adaptive Icon Background |
| `surface_dark` | `#0F172A` | Cards elevados, headers, modais em modo escuro |
| `emerald_neon` | `#10B981` | Cor primária de marca, CTA principal, início do gradiente Prism S, brilho neon esquerdo |
| `electric_cyan` | `#06B6D4` | Acento tecnológico, fim do gradiente Prism S, brilho neon direito |
| `platinum_ink` | `#F8FAFC` | Texto principal sobre fundos escuros e superfície base em Light Mode |
| `muted_slate` | `#94A3B8` | Subtítulos (`AI VENTURE BUILDER`), rótulos secundários e bordas sutis |
| `light_ink` | `#0F172A` | Texto principal em Light Mode (contraste WCAG AA/AAA) |

- **Gradiente Primário (CSS / Flutter):** `linear-gradient(135deg, #10B981 0%, #06B6D4 100%)`
- **Glow Neon (CSS):** `drop-shadow(0 0 18px rgba(16, 185, 129, 0.35)) drop-shadow(0 0 28px rgba(6, 182, 212, 0.25))`

## 3. Aplicação em `shapelab.ia.br` (Web, PWA & Mobile)

### (a) Páginas Web & SEO (`index.html`)
```html
<meta name="theme-color" content="#090D16" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="ShapeLab — AI Venture Builder" />
<meta property="og:url" content="https://shapelab.ia.br/" />
<meta property="og:image" content="https://shapelab.ia.br/assets/brand/shapelab_banner_prism_s.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://shapelab.ia.br/assets/brand/shapelab_banner_prism_s.png" />
```

### (b) PWA (`manifest.json` / `manifest.webmanifest`)
```json
{
  "name": "ShapeLab",
  "short_name": "ShapeLab",
  "theme_color": "#090D16",
  "background_color": "#090D16",
  "display": "standalone",
  "icons": [
    { "src": "icons/Icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/Icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/Icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
> **Atenção Maskable Icon:** Mantenha o monograma Prism S dentro dos **66% centrais** (margem segura >= 17% em cada borda) para que cortes circulares ou *squircle* do Android/Chrome nunca cortem o brilho neon.

### (c) App Flutter (`ThemeData` Dual-Theme + Launcher Icons)
- **Android Adaptive Icon:** `adaptive_icon_background: "#090D16"`, foreground centralizado com zona segura de `66%` (`108dp` canvas / `72dp` safe zone).
- **iOS AppIcon:** Sem canal alpha transparente sobre o fundo (`#090D16` sólido preenchido até as bordas).
- **Splash Screen:** Cor de fundo `#090D16` com o emblema Prism S centralizado.

```dart
class ShapeLabBrandTokens {
  static const Color obsidianBg = Color(0xFF090D16);
  static const Color surfaceDark = Color(0xFF0F172A);
  static const Color emeraldNeon = Color(0xFF10B981);
  static const Color electricCyan = Color(0xFF06B6D4);
  static const Color platinumInk = Color(0xFFF8FAFC);
  static const Color mutedSlate = Color(0xFF94A3B8);

  static const LinearGradient prismGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [emeraldNeon, electricCyan],
  );
}
```

## 4. Regras de Proteção da Marca (Do / Don't) e Prompt para Agentes de IA
- **NÃO** distorcer proporções, alterar o ângulo do monograma `"S"` nem aplicar cores sólidas fora da paleta Esmeralda (`#10B981`) / Ciano (`#06B6D4`) / Platina (`#F8FAFC`).
- **NÃO** usar o banner horizontal em espaços menores que `240px` de largura; abaixo disso, use exclusivamente o ícone quadrado `shapelab_logo_prism_s.png`.
- **Prompt Canônico para Geração Derivada por IA:**
  > *"Preserve exactly the ShapeLab Prism S monogram (interlocking geometric S sculpted from folded metallic-glass ribbons with emerald #10B981 to electric cyan #06B6D4 neon glow on #090D16 obsidian background). Pair with geometric uppercase sans-serif 'SHAPELAB' (#F8FAFC) and tracked subtitle 'AI VENTURE BUILDER' (#94A3B8)."*

## 5. Critério de Aceite
1. `assets/brand/brand_manifest.json` válido em JSON e alinhado com os hexes e caminhos desta skill.
2. Ícones PWA maskable e Adaptive Icons mantêm margem segura sem corte do brilho neon.
3. OpenGraph (`og:image`) e `theme-color` (`#090D16`) configurados nos portais `shapelab.ia.br`.
