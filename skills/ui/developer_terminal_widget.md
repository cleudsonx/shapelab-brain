# ShapeLab Skill — Developer Terminal Widget & Live Snippets (Big Tech / macOS Standard)

Esta skill documenta o padrão oficial da **ShapeLab** para documentação de APIs, portais de desenvolvedores, fluxos de onboarding técnico e vitrines comerciais B2B interativas.

---

## 1. Motivação & Causa Raiz (`LL-016`)
Portais SaaS B2B frequentemente apresentam snippets de código em blocos `<pre>` opacos, terminais retrô com visual verde DOS ou tabelas estáticas sem syntax highlighting.
Essa abordagem gera:
- **Alto Atrito de Onboarding:** Desenvolvedores demoram para testar chamadas reais e têm dificuldade para converter cURL em código nativo (Node, Python).
- **Baixa Conversão B2B:** CTOs e tomadores de decisão técnicos não conseguem validar a agilidade de integração antes de assinar o plano.
- **Inconsistência Visual:** Cada produto acabava implementando terminais com layouts e comportamentos heterogêneos.

---

## 2. Padrão ShapeLab: Developer Terminal Widget
O componente modular segue o design system **Prism S Neon** com moldura autêntica macOS (`● ● ●`):

```
┌────────────────────────────────────────────────────────┐
│ ● ● ●  POST /api/v1/tax/calculate       [cURL][Node][Py][200 OK]│
├────────────────────────────────────────────────────────┤
│ curl -X POST https://reformai.ia.br/api/v1/tax/calc... │
│   -H "Authorization: Bearer rfm_live_sua_chave"        │
│   -H "Content-Type: application/json"                  │
│   -d '{ "ruleCode": "PERSONAL_PF_30" }'                │
├────────────────────────────────────────────────────────┤
│ 🟢 Latência: 11ms  |  Segurança: ES256 OK    [▶ Ver Resposta]   │
└────────────────────────────────────────────────────────┘
```

### Características Técnicas:
- **Zero Dependências Externas:** Escrito em JavaScript vanilla nativo (`window.createDeveloperTerminal`) e estilizado com classes utilitárias Tailwind CSS padrão.
- **Multilíngue Instantâneo:** Suporte nativo a abas configuráveis (`cURL`, `Node.js`, `Python`, `C#`, `PHP`, `200 OK Response`).
- **1-Click Copy com Feedback Visual:** Utiliza a Clipboard API (`navigator.clipboard.writeText`) com transição de ícone `📋 Copiar` ➔ `✓ Copiado!` com debounce de 2 segundos.
- **Telemetria Edge em Tempo Real:** Indicador de pulso verde com latência RTT em ms e selo de assinatura criptográfica (`ES256 OK` / `JWS RFC 7515`).
- **Acessibilidade WCAG AA:** Relação de contraste mínima de 4.5:1 com paleta escura `#0B0F19` e texto `#E2E8F0`, suporte a navegação por teclado e atributos `aria-hidden` nos controles estéticos.

---

## 3. Como Utilizar nos Produtos ShapeLab

### Opção A: Markup Estático (HTML + Tailwind)
Copie o template de `.shapelab/templates/ui/developer_terminal_widget.html` diretamente na página desejada e preencha os snippets de código.

### Opção B: Instanciação Dinâmica (Vanilla JS Factory)
Importe `.shapelab/templates/ui/developer_terminal_widget.js` e inicialize com 1 chamada:

```javascript
const terminal = createDeveloperTerminal({
  target: 'meu-container-id',
  endpoint: 'POST /api/v1/split/calculate',
  snippets: {
    curl: 'curl -X POST https://api.reformai.ia.br/api/v1/split/calculate ...',
    node: 'const res = await fetch("https://api.reformai.ia.br/api/v1/split/calculate", { ... });',
    python: 'import requests\nres = requests.post("https://api.reformai.ia.br/api/v1/split/calculate", json={ ... })',
    response: '{\n  "splitStatus": "CALCULATED",\n  "bacenPixHold": 26.50\n}'
  },
  telemetry: {
    latency: '14ms',
    signature: 'JWS ES256 OK'
  }
});
```

---

## 4. Matriz de Adoção Recomendada
- **`ReformAI`:** ✅ Em produção no Developer Hub (`portal_desenvolvedor.html`), Landing Page (`landing_page_reformai.html`) e Onboarding (`onboarding_reformai.html`).
- **`B2B-personal-ia` (Mr. Coach):** ⏳ Recomendado para a documentação técnica dos Webhooks de WhatsApp e split Asaas.
- **`Smart-EV-Hub`:** ⏳ Recomendado para os endpoints de telemetria OCPP e autorização de recarga de frotas elétricas.
- **Novos SaaS (`scaffold_saas.mjs`):** ⏳ Scaffold pré-instalado em rotas `/developers` ou `/docs`.
