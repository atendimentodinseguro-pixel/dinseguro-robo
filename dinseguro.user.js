// ==UserScript==
// @name         Dinseguro - Digitação automática (Multicorban -> New Corban FACTA/C6 e Daycoval)
// @namespace    dinseguro
// @version      3.2
// @description  Carregador: busca sempre a versão mais nova do robô no GitHub (sem precisar atualizar o Tampermonkey).
// @updateURL    https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro.user.js
// @downloadURL  https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro.user.js
// @match        https://app.multicorban.com/*
// @match        https://romulorochadesouza.newcorban.com.br/*
// @match        https://go.botmaker.com/*
// @match        https://portaldecredito.daycoval.com.br/*
// @match        https://consigmais.bancobmg.com.br/*
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// ==/UserScript==

/* Carregador 3.2 — reescrito em 07/11/2026.
   Dois problemas do 3.0/3.1, resolvidos aqui:

   1. Ele só sabia baixar com GM_xmlhttpRequest, que o Tampermonkey às vezes
      bloqueia esperando uma confirmação que ninguém vê. Quando isso acontecia,
      o robô ficava rodando a cópia guardada para sempre, sem avisar.
      → Agora tenta primeiro o fetch normal do navegador, que não precisa de
        permissão nenhuma (raw.githubusercontent.com libera CORS), e só cai no
        GM_xmlhttpRequest se o fetch falhar.

   2. Ele decidia na hora se baixava ou não, e a decisão dependia de um commit
      anotado que podia estar errado — o que travava tudo.
      → Agora é simples: roda JÁ a cópia guardada (início rápido, sempre
        funciona offline) e baixa a versão nova em segundo plano, que passa a
        valer no próximo F5. Sem travar, sem poder ficar preso.

   Para saber qual versão está rodando: localStorage.getItem('dins_versao') */

(function () {
  'use strict';
  const REPO = 'atendimentodinseguro-pixel/dinseguro-robo';
  const URL_CORE = 'https://raw.githubusercontent.com/' + REPO + '/main/dinseguro-core.js';

  const rodar = (codigo, origem) => {
    try {
      new Function('GM_getValue', 'GM_setValue', 'GM_notification', 'GM_setClipboard', 'unsafeWindow', codigo)(
        GM_getValue, GM_setValue, GM_notification, GM_setClipboard,
        typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
      console.log('[Dinseguro] robô carregado (' + origem + ')');
    } catch (e) { console.error('[Dinseguro] erro ao rodar o robô', e); }
  };

  // baixa: fetch primeiro (não precisa de permissão), GM_xmlhttpRequest como reserva
  const baixar = () => new Promise(resolve => {
    const url = URL_CORE + '?t=' + Date.now();
    const reserva = () => {
      try {
        GM_xmlhttpRequest({ method: 'GET', url, nocache: true, timeout: 15000,
          headers: { 'Cache-Control': 'no-cache' },
          onload: r => resolve(r.status === 200 ? r.responseText : ''),
          onerror: () => resolve(''), ontimeout: () => resolve('') });
      } catch (e) { resolve(''); }
    };
    try {
      fetch(url, { cache: 'no-store' })
        .then(r => (r.ok ? r.text() : ''))
        .then(t => (t ? resolve(t) : reserva()))
        .catch(reserva);
    } catch (e) { reserva(); }
  });

  const guardado = GM_getValue('core_cache', '');

  // 1. começa já com o que tem guardado
  if (guardado) rodar(guardado, 'cópia guardada');

  // 2. busca a versão nova em segundo plano; vale no próximo F5
  baixar().then(codigo => {
    if (!codigo || !/Dinseguro/.test(codigo)) {
      if (!guardado) console.error('[Dinseguro] não consegui baixar o robô e não tenho cópia guardada');
      return;
    }
    if (codigo === guardado) return;
    GM_setValue('core_cache', codigo);
    const v = (codigo.match(/Versão: ([\d.]+)/) || [])[1] || '?';
    if (guardado) console.log('[Dinseguro] versão ' + v + ' baixada; entra no próximo F5');
    else rodar(codigo, 'baixado ' + v);   // primeira vez: roda na hora
  });
})();
