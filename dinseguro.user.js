// ==UserScript==
// @name         Dinseguro - Digitação automática (Multicorban -> New Corban FACTA/C6/Qualibank, Quero Mais, Daycoval e BMG)
// @namespace    dinseguro
// @version      3.4
// @description  Carregador: busca sempre a versão mais nova do robô no GitHub (sem precisar atualizar o Tampermonkey).
// @updateURL    https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro.user.js
// @downloadURL  https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro.user.js
// @match        https://app.multicorban.com/*
// @match        https://romulorochadesouza.newcorban.com.br/*
// @match        https://go.botmaker.com/*
// @match        https://portaldecredito.daycoval.com.br/*
// @match        https://portaldecredito.queromaisconsignado.com.br/*
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

/* Carregador 3.3 — 07/11/2026. Três problemas já resolvidos aqui:

   1. (3.2) Só sabia baixar com GM_xmlhttpRequest, que o Tampermonkey às vezes
      bloqueia esperando uma confirmação que ninguém vê. Agora tenta primeiro o
      fetch normal do navegador, que não precisa de permissão.

   2. (3.2) A decisão de baixar dependia de um commit anotado que podia estar
      errado, e isso travava o robô na cópia velha. Agora roda já a cópia
      guardada e baixa a nova em segundo plano, sem travar.

   3. (3.3) Baixava do endereço do "main", que o GitHub guarda em cache por
      alguns minutos: o robô ficava uma versão atrás mesmo com F5. Agora pergunta
      à API qual é o último commit e baixa pelo endereço DESSE commit, que é
      único e nunca vem velho. Sem a API, cai no main como antes.

   Qual versão está rodando: localStorage.getItem('dins_versao')
   Se baixou uma mais nova que ainda não entrou: localStorage.getItem('dins_versao_nova') */

(function () {
  'use strict';
  const REPO = 'atendimentodinseguro-pixel/dinseguro-robo';
  const RAW = ref => 'https://raw.githubusercontent.com/' + REPO + '/' + ref + '/dinseguro-core.js';

  const rodar = (codigo, origem) => {
    try {
      new Function('GM_getValue', 'GM_setValue', 'GM_notification', 'GM_setClipboard', 'unsafeWindow', codigo)(
        GM_getValue, GM_setValue, GM_notification, GM_setClipboard,
        typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
      console.log('[Dinseguro] robô carregado (' + origem + ')');
    } catch (e) { console.error('[Dinseguro] erro ao rodar o robô', e); }
  };

  // baixa um endereço: fetch primeiro (não precisa de permissão), GM_xmlhttpRequest como reserva
  const pegar = url => new Promise(resolve => {
    const reserva = () => {
      try {
        GM_xmlhttpRequest({ method: 'GET', url, nocache: true, timeout: 15000,
          headers: { 'Cache-Control': 'no-cache' },
          onload: r => resolve(r.status === 200 ? r.responseText : ''),
          onerror: () => resolve(''), ontimeout: () => resolve('') });
      } catch (e) { resolve(''); }
    };
    try {
      fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(t => (t ? resolve(t) : reserva())).catch(reserva);
    } catch (e) { reserva(); }
  });

  // o endereço do "main" fica em cache no GitHub; o do commit não.
  async function baixarCore() {
    const t = await pegar('https://api.github.com/repos/' + REPO + '/commits/main');
    let sha = ''; try { sha = JSON.parse(t).sha || ''; } catch (e) {}
    if (sha) { const c = await pegar(RAW(sha)); if (c) return c; }
    return await pegar(RAW('main') + '?t=' + Date.now());
  }

  const guardado = GM_getValue('core_cache', '');

  // 1. começa já com o que tem guardado
  if (guardado) rodar(guardado, 'cópia guardada');

  // 2. busca a versão nova em segundo plano; vale no próximo F5
  baixarCore().then(codigo => {
    if (!codigo || !/Dinseguro/.test(codigo)) {
      if (!guardado) console.error('[Dinseguro] não consegui baixar o robô e não tenho cópia guardada');
      return;
    }
    const v = (codigo.match(/Versão: ([\d.]+)/) || [])[1] || '?';
    if (codigo === guardado) { try { localStorage.removeItem('dins_versao_nova'); } catch (e) {} return; }
    GM_setValue('core_cache', codigo);
    if (guardado) {
      try { localStorage.setItem('dins_versao_nova', v); } catch (e) {}
      console.log('[Dinseguro] versão ' + v + ' baixada; entra no próximo F5');
    } else rodar(codigo, 'baixado ' + v);   // primeira vez: roda na hora
  });
})();
