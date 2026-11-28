// ==UserScript==
// @name         Dinseguro - Chama o Claude (Ronda imediata)
// @namespace    dinseguro
// @version      1.0
// @description  Aba fixa da tarefa "Ronda imediata": quando a nuvem avisa que um cliente precisa de gente, clica em "Executar agora".
// @updateURL    https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro-claude.user.js
// @downloadURL  https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro-claude.user.js
// @match        https://claude.ai/scheduled-task/trig_01YMkjmG4bSPSMyBQhKzqfrY*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      dinseguro-zap.dinseguro.workers.dev
// ==/UserScript==

/* Stefany 27/11/2026 22:25–22:38: "é fundamental esse atendimento rápido" / "faz aí".
   A nuvem (Cloudflare) guarda um pedido quando um cliente cai em "precisa de gente" (no máximo 1 a cada 3 min).
   Esta aba olha a cada 15 s (GET /clique, só devolve o horário do pedido) e, se houver pedido novo de menos de 10 min,
   clica em "Executar agora" da tarefa "Ronda imediata". A ronda tem trava própria: se outra já estiver trabalhando, sai na hora. */
(function () {
  'use strict';
  const URL_CLIQUE = 'https://dinseguro-zap.dinseguro.workers.dev/clique';
  const marca = (txt) => { try { let d = document.getElementById('dins-chama'); if (!d) { d = document.createElement('div'); d.id = 'dins-chama'; d.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:99999;background:#1f6feb;color:#fff;font:12px sans-serif;padding:6px 10px;border-radius:6px;opacity:.85'; document.body.appendChild(d); } d.textContent = '🤖 Dinseguro: ' + txt; } catch (e) {} };
  const botao = () => [...document.querySelectorAll('button')].find(b => /Executar agora/i.test(b.textContent || ''));
  const olha = () => {
    GM_xmlhttpRequest({ method: 'GET', url: URL_CLIQUE + '?n=' + Date.now(), timeout: 10000,
      onload: r => { try {
        const j = JSON.parse(r.responseText || '{}'); const t = +j.t || 0; const ult = +GM_getValue('ult_t', 0) || 0; const ag = Date.now();
        if (!t || t <= ult) { marca('aguardando (último chamado ' + (ult ? new Date(ult).toLocaleTimeString('pt-BR').slice(0, 5) : '—') + ')'); return; }
        if (ag - t > 10 * 60000) { GM_setValue('ult_t', t); marca('pedido velho ignorado'); return; }
        const b = botao(); if (!b) { marca('não achei o botão "Executar agora"'); return; }
        GM_setValue('ult_t', t); b.click(); marca('chamei o Claude às ' + new Date().toLocaleTimeString('pt-BR').slice(0, 5));
      } catch (e) { marca('erro: ' + e.message); } },
      onerror: () => marca('sem conexão com a nuvem'), ontimeout: () => marca('nuvem demorou') });
  };
  setTimeout(olha, 5000); setInterval(olha, 15000);
  // recarrega a aba a cada 3 h para a sessão do claude.ai não ficar velha
  setTimeout(() => location.reload(), 3 * 3600000);
})();
