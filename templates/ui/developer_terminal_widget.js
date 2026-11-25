/**
 * =============================================================================================
 * ShapeLab OS — Developer Terminal Widget Factory (Vanilla JS / Zero-Dependencies)
 * =============================================================================================
 * Origem: ReformAI Developer Hub & Onboarding Flow
 * Padrão: Prism S Neon / Big Tech macOS Code Terminal
 * =============================================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.createDeveloperTerminal = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let terminalCounter = 0;

  /**
   * Instancia um Terminal de Desenvolvedor no container informado.
   *
   * @param {Object} options
   * @param {string|HTMLElement} options.target Container ID ou elemento DOM alvo.
   * @param {string} [options.endpoint="POST /api/v1/endpoint"] Tag exibida no cabeçalho.
   * @param {Object} options.snippets Dicionário com códigos por linguagem ({ curl, node, python, response }).
   * @param {Object} [options.telemetry] Configuração de telemetria ({ latency: "12ms", signature: "ES256 OK" }).
   * @param {string} [options.defaultTab="curl"] Aba ativa por padrão.
   */
  function createDeveloperTerminal(options) {
    const opts = options || {};
    const container = typeof opts.target === 'string'
      ? document.getElementById(opts.target)
      : opts.target;

    if (!container) {
      console.warn('[ShapeLab Terminal] Container alvo não encontrado:', opts.target);
      return null;
    }

    terminalCounter += 1;
    const termId = 'term_' + terminalCounter;

    const snippets = opts.snippets || {
      curl: 'curl -X GET https://api.exemplo.com/v1/ping',
      node: 'const res = await fetch("https://api.exemplo.com/v1/ping");',
      python: 'import requests\nres = requests.get("https://api.exemplo.com/v1/ping")',
      response: '{\n  "status": "success",\n  "statusCode": 200\n}'
    };

    const telemetry = opts.telemetry || {
      latency: '11ms',
      signature: 'ES256 OK'
    };

    let activeTab = opts.defaultTab || 'curl';

    const markup = `
      <div id="${termId}_wrapper" class="bg-[#0B0F19] text-slate-200 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs flex flex-col transition-all">
        <!-- HEADER MACOS -->
        <div class="bg-[#111827] px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 select-none">
          <div class="flex items-center gap-2">
            <div class="flex gap-1.5" aria-hidden="true">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
            </div>
            <span class="text-[11px] font-semibold text-slate-300 ml-1">${opts.endpoint || 'POST /api/v1/endpoint'}</span>
          </div>

          <!-- TABS -->
          <div class="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800 text-[10px]">
            <button type="button" data-tab="curl" class="term-tab px-2.5 py-1 rounded-md transition cursor-pointer font-bold">cURL</button>
            <button type="button" data-tab="node" class="term-tab px-2.5 py-1 rounded-md transition cursor-pointer">Node</button>
            <button type="button" data-tab="python" class="term-tab px-2.5 py-1 rounded-md transition cursor-pointer">Python</button>
            <button type="button" data-tab="response" class="term-tab px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 text-emerald-400">
              <span>⚡</span> <span>200 OK</span>
            </button>
          </div>
        </div>

        <!-- CODE BLOCK -->
        <div class="p-4 bg-[#0B0F19] relative group">
          <button type="button" class="btn-copy absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 text-[10px] flex items-center gap-1.5 transition shadow-sm cursor-pointer z-10" title="Copiar código">
            <span class="copy-icon">📋</span> <span class="copy-label">Copiar</span>
          </button>
          <pre class="code-pre text-slate-300 text-[11px] leading-relaxed overflow-x-auto whitespace-pre selection:bg-indigo-500/30 pr-16 font-mono"></pre>
        </div>

        <!-- TELEMETRY FOOTER -->
        <div class="bg-[#0e1422] px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 select-none">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1 text-emerald-400">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Latência: <strong class="text-slate-200">${telemetry.latency || '11ms'}</strong>
            </span>
            <span class="text-slate-600">|</span>
            <span>Segurança: <strong class="text-sky-400 font-semibold">${telemetry.signature || 'JWS OK'}</strong></span>
          </div>
          <button type="button" class="btn-toggle px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 font-semibold text-[10px] flex items-center gap-1 transition cursor-pointer">
            <span>▶</span> <span class="toggle-label">Ver Resposta</span>
          </button>
        </div>
      </div>
    `;

    container.innerHTML = markup;

    const rootEl = document.getElementById(`${termId}_wrapper`);
    const preEl = rootEl.querySelector('.code-pre');
    const tabs = rootEl.querySelectorAll('.term-tab');
    const btnCopy = rootEl.querySelector('.btn-copy');
    const copyIcon = rootEl.querySelector('.copy-icon');
    const copyLabel = rootEl.querySelector('.copy-label');
    const btnToggle = rootEl.querySelector('.btn-toggle');
    const toggleLabel = rootEl.querySelector('.toggle-label');

    function renderTab(tabKey) {
      activeTab = tabKey;
      tabs.forEach(function (tab) {
        const key = tab.getAttribute('data-tab');
        if (key === tabKey) {
          if (key === 'response') {
            tab.className = 'term-tab px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold transition cursor-pointer flex items-center gap-1';
          } else {
            tab.className = 'term-tab px-2.5 py-1 rounded-md bg-indigo-600 text-white font-bold transition cursor-pointer';
          }
        } else {
          tab.className = 'term-tab px-2.5 py-1 rounded-md text-slate-400 hover:text-slate-200 transition cursor-pointer' + (key === 'response' ? ' flex items-center gap-1 text-emerald-400' : '');
        }
      });

      preEl.textContent = snippets[tabKey] || '';
      toggleLabel.textContent = tabKey === 'response' ? 'Ver Código' : 'Ver Resposta';
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        renderTab(tab.getAttribute('data-tab'));
      });
    });

    btnCopy.addEventListener('click', function () {
      const code = preEl.textContent || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () {
          copyIcon.textContent = '✓';
          copyLabel.textContent = 'Copiado!';
          setTimeout(function () {
            copyIcon.textContent = '📋';
            copyLabel.textContent = 'Copiar';
          }, 2000);
        });
      }
    });

    btnToggle.addEventListener('click', function () {
      if (activeTab === 'response') {
        renderTab('curl');
      } else {
        renderTab('response');
      }
    });

    // Render inicial
    renderTab(activeTab);

    return {
      setSnippet: function (lang, code) {
        snippets[lang] = code;
        if (activeTab === lang) renderTab(lang);
      },
      switchTab: renderTab
    };
  }

  return createDeveloperTerminal;
});
