// ==UserScript==
// @name         Dinseguro - Digitação automática (Multicorban -> New Corban FACTA/C6 e Daycoval)
// @namespace    dinseguro
// @version      3.1
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

(function () {
  'use strict';
  const REPO = 'atendimentodinseguro-pixel/dinseguro-robo';
  const rodar = (codigo, origem) => {
    try {
      new Function('GM_getValue', 'GM_setValue', 'GM_notification', 'GM_setClipboard', 'unsafeWindow', codigo)(GM_getValue, GM_setValue, GM_notification, GM_setClipboard, typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
      console.log('[Dinseguro] robô carregado (' + origem + ')');
    } catch (e) { console.error('[Dinseguro] erro ao rodar o robô', e); }
  };
  const get = (url, ok, falha) => GM_xmlhttpRequest({ method: 'GET', url, nocache: true, timeout: 15000,
    headers: { 'Cache-Control': 'no-cache' },
    onload: r => (r.status === 200 ? ok(r.responseText) : falha()), onerror: falha, ontimeout: falha });
  const usarCache = () => { const c = GM_getValue('core_cache', ''); if (c) rodar(c, 'cópia guardada'); else console.error('[Dinseguro] sem código do robô'); };
  // sha: só é anotado DEPOIS que o download deu certo. Antes era anotado antes, e um
  // download que falhasse deixava o loader preso na cópia velha para sempre (07/11/2026).
  const baixar = (ref, sha) => get('https://raw.githubusercontent.com/' + REPO + '/' + ref + '/dinseguro-core.js', codigo => {
    if (!/Dinseguro/.test(codigo)) return usarCache();
    GM_setValue('core_cache', codigo);
    if (sha) GM_setValue('core_sha', { sha, t: Date.now() });
    rodar(codigo, ref.slice(0, 7));
  }, usarCache);
  // pega o último commit (evita o cache de 5 min do GitHub); se a API falhar, usa "main"
  // (consulta a API no máximo a cada 3 min, para não estourar o limite do GitHub)
  const ult = GM_getValue('core_sha', { sha: '', t: 0 });
  if (ult.sha && Date.now() - ult.t < 3 * 60 * 1000 && GM_getValue('core_cache', '')) { rodar(GM_getValue('core_cache'), 'cópia ' + ult.sha.slice(0, 7)); return; }
  get('https://api.github.com/repos/' + REPO + '/commits/main', t => {
    let sha = ''; try { sha = JSON.parse(t).sha || ''; } catch (e) {}
    if (!sha) return baixar('main');
    if (sha === ult.sha && GM_getValue('core_cache', '')) {
      GM_setValue('core_sha', { sha, t: Date.now() });
      return rodar(GM_getValue('core_cache'), 'cópia ' + sha.slice(0, 7));
    }
    baixar(sha, sha);
  }, () => baixar('main'));
})();
