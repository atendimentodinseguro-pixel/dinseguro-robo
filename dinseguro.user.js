// ==UserScript==
// @name         Dinseguro - Digitação automática (Multicorban -> New Corban FACTA/C6/Qualibank, Quero Mais, Daycoval e BMG)
// @namespace    dinseguro
// @version      3.12
// @description  Carregador: busca sempre a versão mais nova do robô no GitHub (sem precisar atualizar o Tampermonkey).
// @updateURL    https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro.user.js
// @downloadURL  https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro.user.js
// @match        https://app.multicorban.com/*
// @match        https://romulorochadesouza.newcorban.com.br/*
// @match        https://go.botmaker.com/*
// @match        https://web.whatsapp.com/*
// @match        https://portaldecredito.daycoval.com.br/*
// @match        https://portaldecredito.queromaisconsignado.com.br/*
// @match        https://consigmais.bancobmg.com.br/*
// @match        https://c6.c6consig.com.br/*
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
  // ===================================================================== 3.7 — WHATSAPP WEB DIRETO NO CARREGADOR
  // (Stefany 11/11 08:47). O WhatsApp Web não deixa rodar código baixado (new Function), então o robô principal
  // nunca rodava lá e as mensagens da varredura ficavam paradas na fila. Agora o envio mora aqui, sem baixar nada.
  // Regras: só seg–sex 8h–16h; uma mensagem de cada vez, com PAUSA SORTEADA de 4 a 6 min entre uma e outra
  // ("o WhatsApp é meio chato com robô"); no máximo 10 por hora; abre a conversa direto pelo número
  // (web.whatsapp.com/send?phone=…) e confere os 8 últimos dígitos do cabeçalho antes de escrever.
  // Fila: GM 'wa_fila' (quem põe é a varredura do Botmaker). Depois de enviado, o Botmaker fecha a conversa vencida.
  if (location.host === 'web.whatsapp.com') {
    try { localStorage.setItem('dins_loader', JSON.stringify({ v: '3.12', t: Date.now() })); } catch (e) {}
    const esp = ms => new Promise(r => setTimeout(r, ms));
    const dig = s => String(s || '').replace(/\D/g, '');
    const chave = v => { const n = dig(v); return n.length >= 8 ? n.slice(-8) : ''; };
    const primeiroNome = n => { const p = String(n || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/)[0] || ''; return p.length >= 3 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''; };
    const texto = (caso, nome) => {
      const pn = primeiroNome(nome);
      const ola = pn ? ('Oi, ' + pn + '! Tudo bem?') : 'Oi! Tudo bem?';
      const seg = 'Pode ficar tranquilo(a): não cobramos nada antecipado e nada é feito sem a sua confirmação.';
      const fim = 'Qualquer dúvida, me chama que eu te ajudo.';
      if (caso === 'link') return [ola, 'Passando para falar da sua proposta, que continua disponível e é rápido de concluir.', seg, 'Quer que eu reenvie o link para você finalizar?', fim].join('\n\n');
      if (caso === 'atendimento') return [ola, 'Estou retomando o seu atendimento, que ficou parado porque o WhatsApp encerra a conversa depois de 24 horas.', seg, 'Posso seguir de onde a gente parou?', fim].join('\n\n');
      return [ola, 'Passando para falar da sua simulação, que ficou pendente só do seu CPF para eu conferir o valor liberado certinho.', seg, 'Se ainda tiver interesse, é só me mandar o número do seu CPF ou do seu benefício que eu confiro para você na hora.', fim].join('\n\n');
    };
    const fila = () => { try { return GM_getValue('wa_fila', []) || []; } catch (e) { return []; } };
    const salva = f => { try { GM_setValue('wa_fila', f); } catch (e) {} };
    const horario = () => { const d = new Date(); return d.getDay() >= 1 && d.getDay() <= 5 && d.getHours() >= 8 && d.getHours() < 17; };
    const marca = (it, mud) => { const f = fila(); const i = f.findIndex(x => x.hash === it.hash && x.criado === it.criado); if (i >= 0) { Object.assign(f[i], mud); salva(f); } };
    let ocupado = false;
    const tick = async () => {
      if (ocupado || !horario()) return;
      const pend = fila().filter(x => x.estado === 'pendente' && x.fone);
      if (!pend.length) return;
      const prox = +GM_getValue('wa_prox', 0) || 0;
      if (prox - Date.now() > 86400000) return;                            // pausado à mão (dinsWaPausar)
      const hora = new Date(); const mh = 'wa_hora_' + hora.toDateString() + '_' + hora.getHours();
      if ((+GM_getValue(mh, 0) || 0) >= 10) return;                       // no máximo 10 por hora
      const alvo = pend[0];
      // 3.8: o WhatsApp Web troca o endereço "send?phone=…" por "/" assim que abre a conversa — então a prova de que a
      // conversa aberta é a do cliente é a marca "abrindo este cliente" (desta aba) + a conversa aberta na tela.
      const abrindo = (() => { try { return JSON.parse(sessionStorage.getItem('dins_wa_abrindo') || 'null'); } catch (e) { return null; } })();
      // 3.12 (Stefany 13/11 15:36: "de 15 em 15 minutos… o combinado era 4 a 6"): abrir a conversa recarrega o WhatsApp Web (1–2 min) e isso
      // somava à pausa. Agora a próxima conversa é aberta JÁ durante a pausa, e a mensagem sai quando a pausa acaba.
      if (!abrindo || abrindo.hash !== alvo.hash || Date.now() - abrindo.t > 3 * 60000) {
        if (Date.now() < prox && prox - Date.now() > 3 * 60000) return;   // ainda falta muito: abre a conversa só nos 3 últimos minutos da pausa
        sessionStorage.setItem('dins_wa_abrindo', JSON.stringify({ hash: alvo.hash, t: Date.now() }));
        location.href = 'https://web.whatsapp.com/send?phone=' + (alvo.foneAlt || dig(alvo.fone)); return;
      }
      if (Date.now() < prox) { if (document.querySelector('#main footer [contenteditable="true"]')) sessionStorage.setItem('dins_wa_abrindo', JSON.stringify({ hash: alvo.hash, t: Date.now() })); return; }   // 3.12: conversa já aberta, espera a pausa acabar
      ocupado = true;
      try {
        let cx = null; for (let i = 0; i < 90 && !cx; i++) { cx = document.querySelector('#main footer [contenteditable="true"]'); if (!cx) { if (/inv[aá]lido|não está no WhatsApp|isn.t on WhatsApp/i.test(document.body.innerText)) break; await esp(1000); } }
        // 3.11 (Stefany 10:06, caso Carlos Henrique: "todos já estão conversando no WhatsApp… não deveria dar erro"): o número
        // é bom — o WhatsApp é que demorou. Antes de dar erro, tenta de novo (2ª vez) e, para celular 55+DDD+9+8, também sem o 9.
        if (!cx) { sessionStorage.removeItem('dins_wa_abrindo'); const tent = (alvo.tentAbrir || 0) + 1; const semNove = /^55\d{2}9\d{8}$/.test(dig(alvo.fone)) && tent === 2;
          if (tent < 3) { marca(alvo, { tentAbrir: tent, foneAlt: semNove ? dig(alvo.fone).replace(/^(55\d{2})9/, '$1') : '' }); GM_setValue('wa_prox', Date.now() + 30000); return; }
          marca(alvo, { estado: 'erro', motivo: 'a conversa não abriu em 3 tentativas (com e sem o 9) — conferir o número' }); GM_setValue('wa_prox', Date.now() + 60000); return; }
        sessionStorage.removeItem('dins_wa_abrindo');
        const h = document.querySelector('#main header'); const tel = ((h && h.innerText) || '').match(/\+?\d[\d\s().-]{9,}\d/); const cab = tel ? chave(tel[0]) : '', al = chave(alvo.foneAlt || alvo.fone);   // só um número de telefone do cabeçalho (não a data do "visto por último")
        // o cabeçalho às vezes mostra o NOME salvo e não o número: aí vale o número da URL, que é o do cliente
        if (cab && cab !== al) { marca(alvo, { estado: 'erro', motivo: 'número do cabeçalho não confere' }); return; }
        // 3.9 — quem já tem mensagem nossa sem resposta (outra campanha, envio de antes) NÃO recebe outra (caso Silvia 11/11).
        await esp(2500);
        const linhas = [...document.querySelectorAll('#main [role="row"]')].filter(r => r.innerText.trim() && !/protegidas com a criptografia/i.test(r.innerText));
        const ehNossa = r => !!r.querySelector('[data-icon*="tail-out"],[data-icon*="msg-dblcheck"],[data-icon*="msg-check"],[data-icon*="msg-time"]');
        // 3.10: só conta mensagem nossa RECENTE (últimos 7 dias). Mensagem de um mês atrás não impede o reenvio (caso Antônio, link de 08/10).
        const dataDe = r => { const e = r && r.querySelector('[data-pre-plain-text]'); const m = e && /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(e.getAttribute('data-pre-plain-text') || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; };
        const ult = linhas[linhas.length - 1];
        if (ult && ehNossa(ult)) { const dt = dataDe(ult); const dias = dt ? (Date.now() - dt) / 86400000 : 0;
          if (!dt || dias < 7) { marca(alvo, { estado: 'pulado', motivo: 'já tem mensagem nossa sem resposta no WhatsApp' + (dt ? ' (há ' + Math.floor(dias) + ' dia(s))' : '') }); GM_setValue('wa_prox', Date.now() + 30000); return; } }
        if ((cx.innerText || '').trim()) { marca(alvo, { estado: 'erro', motivo: 'a caixa já tinha texto (rascunho)' }); GM_setValue('wa_prox', Date.now() + 60000); return; }
        // 3.9 — o texto entra COLADO (evento de colar), que é o que mantém as quebras de linha; o insertText juntava tudo
        // ("Oi! Tudo bem?Passando…"). Se as quebras não vierem, não envia.
        const msg = texto(alvo.caso, alvo.nome);
        cx.focus(); await esp(400);
        try { const dt = new DataTransfer(); dt.setData('text/plain', msg); cx.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (e) {}
        await esp(1500);
        if (!cx.innerText.trim()) { marca(alvo, { estado: 'erro', motivo: 'o texto não entrou na caixa' }); GM_setValue('wa_prox', Date.now() + 60000); return; }
        const quebras = cx.querySelectorAll('p, br').length > 2 || (cx.innerText.match(/\n/g) || []).length >= 4;
        if (!quebras) { marca(alvo, { estado: 'erro', motivo: 'o texto entrou sem as quebras de linha — NÃO enviado (rascunho na caixa)' }); GM_setValue('wa_prox', Date.now() + 365 * 86400000); return; }
        const bt = document.querySelector('#main footer button[aria-label="Enviar"]') || ((document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"]') || {}).closest || (() => null)).call(document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"]'), 'button');
        if (!bt) { marca(alvo, { estado: 'erro', motivo: 'botão de enviar não encontrado (rascunho na caixa)' }); GM_setValue('wa_prox', Date.now() + 365 * 86400000); return; }
        bt.click(); await esp(3000);
        if (cx.innerText.trim()) { marca(alvo, { estado: 'erro', motivo: 'a caixa continuou cheia depois de enviar' }); return; }
        marca(alvo, { estado: 'enviado', quando: Date.now() });
        GM_setValue(mh, (+GM_getValue(mh, 0) || 0) + 1);
        GM_setValue('wa_prox', Date.now() + (4 + Math.random() * 2) * 60000);   // próxima entre 4 e 6 min
        try { localStorage.setItem('dins_wa_ultimo', JSON.stringify({ nome: alvo.nome, caso: alvo.caso, hora: new Date().toLocaleTimeString('pt-BR').slice(0, 5) })); } catch (e) {}
      } catch (e) { marca(alvo, { estado: 'erro', motivo: String(e.message || e) }); }
      finally { ocupado = false; }
    };
    setInterval(tick, 15000); setTimeout(tick, 12000);
    return;   // no WhatsApp Web o robô principal não roda (não precisa)
  }
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
