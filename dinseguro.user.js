// ==UserScript==
// @name         Dinseguro - Digitação automática (Multicorban -> New Corban FACTA/C6/Qualibank, Quero Mais, Daycoval e BMG)
// @namespace    dinseguro
// @version      3.41
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
// @match        https://sistema.fullconsig.com.br/*
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @require      https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro-core.js?v=7.25
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      developers.newcorban.com.br
// @connect      api.botmaker.com
// @connect      sistema.fullconsig.com.br
// @connect      api.zapresponder.com.br
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
    // 3.34 (17/11): cópia embutida = WA 1.5 (confere o próximo da fila durante a espera; pulado não gasta o tempo do envio).
    // 3.28 (Stefany 16/11 12:41): o envio mora no módulo dinseguro-wa.js do GitHub (abre a conversa pelo + "Nova conversa",
    // sem recarregar o WhatsApp). O carregador baixa a versão mais nova a cada abertura do WhatsApp; se o site não deixar
    // rodar o código baixado, usa a cópia embutida abaixo (mesmo código, versão WA 1.0).
    try { localStorage.setItem('dins_loader', JSON.stringify({ v: '3.34', t: Date.now() })); } catch (e) {}
    const UW = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const embutido = () => {
      // Dinseguro — envio da varredura pelo WhatsApp Web (módulo baixado do GitHub pelo carregador 3.28+). Versão WA: 1.9
      // 1.0 (Stefany 16/11 12:41): "era melhor deixar o WhatsApp aberto… colocar o número naquele maisinho de nova conversa…
      //      de vez de ficar reabrindo o WhatsApp". Antes cada cliente = recarregar o WhatsApp Business (3+ min "mensagens sendo
      //      baixadas") e a marca vencia no meio → abria, fechava, abria… sem enviar.
      //  Agora: o WhatsApp fica aberto; a conversa abre pelo botão "Nova conversa" (+) → digita 55+DDD+número → clica no resultado.
      //  Só se o + não achar o número é que tenta UMA vez pelo endereço (send?phone=), o jeito antigo.
      //  Regras mantidas: seg–sex 8h–17h · uma por vez · 4 a 6 min entre envios · no máximo 10 por hora · confere o número
      //  do cabeçalho · não manda para quem já tem mensagem nossa sem resposta nos últimos 7 dias · texto com as quebras de linha.
      // 1.3 (Stefany 16/11 15:35 "uma mensagem a cada 15 minutos"): a aba do WhatsApp fica em segundo plano e o Chrome freia os
      // temporizadores (1 por minuto) → cada espera de 0,7 s virava 1 min. Agora as esperas usam um Worker, que o Chrome não freia.
      // 1.4: o WhatsApp bloqueia Worker por CSP (o 1.3 travou o laço inteiro às 15:43). Agora testa o Worker com um "ping";
      // se não responder em 1,5 s, usa setTimeout normal (como no 1.2).
      // 1.5 (Stefany 17/11 15:42 "já tinha enviado não conta… segue a lista, segue mandando, até completar os 10 por hora enviados"):
      // quem é PULADO (já tem mensagem nossa sem resposta) custava 1–2 min cada e a hora fechava com 6–7 envios. Agora, DURANTE a espera
      // de 4–6 min entre envios, o módulo já abre o próximo da fila e confere (só lê): quem é para pular é pulado na hora e o primeiro
      // que pode receber fica marcado (preOk) esperando o horário. O intervalo entre ENVIOS e o teto de 10 por hora não mudam.
      let ESP_W = null;
      try { const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' }))); const cb = new Map(); let n = 0;
        w.onmessage = e => { const f = cb.get(e.data); cb.delete(e.data); if (f) f(); };
        const viaW = ms => new Promise(r => { const id = ++n; cb.set(id, r); w.postMessage({ id, ms }); });
        Promise.race([viaW(10).then(() => 1), new Promise(r => setTimeout(() => r(0), 1500))]).then(ok => { if (ok) ESP_W = viaW; });
      } catch (e) {}
      const esp = ms => ESP_W ? ESP_W(ms) : new Promise(r => setTimeout(r, ms));
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
      const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const appPronto = () => !!document.querySelector('#pane-side, #side, [aria-label="Lista de conversas"], [data-testid="chat-list"]');
      const caixaMsg = () => document.querySelector('#main footer [contenteditable="true"]');
      const numeroCab = () => { const h = document.querySelector('#main header'); const tel = ((h && h.innerText) || '').match(/\+?\d[\d\s().-]{9,}\d/); return tel ? chave(tel[0]) : ''; };
      // 1.1 (teste 16/11 12:57): no Tampermonkey o 'view: window' quebra o MouseEvent; e o resultado clicável é o [role=button] de dentro
      const clicar = el => { const alvo = el.closest('[role="button"], button') || el; ['mousedown', 'mouseup', 'click'].forEach(t => alvo.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }))); };
      const log = (...a) => { try { console.log('[Dinseguro WA]', ...a); localStorage.setItem('dins_wa_log', JSON.stringify({ t: new Date().toLocaleTimeString('pt-BR'), m: a.join(' ') })); } catch (e) {} };

      // escreve num campo de busca (input comum ou caixa editável do WhatsApp)
      async function escrever(campo, valor) {
        campo.focus(); await esp(300);
        if (campo.tagName === 'INPUT' || campo.tagName === 'TEXTAREA') {
          const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(campo), 'value').set; set.call(campo, ''); campo.dispatchEvent(new Event('input', { bubbles: true }));
          set.call(campo, valor); campo.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          document.execCommand('selectAll', false, null); document.execCommand('delete', false, null);
          document.execCommand('insertText', false, valor);
        }
      }

      // abre a conversa pelo botão "Nova conversa" (+) sem recarregar o WhatsApp
      async function abrirPeloMais(numero) {
        const k = chave(numero);
        if (caixaMsg() && numeroCab() === k) return 'já aberta';
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch (e) {}
        await esp(500);
        const botao = [...document.querySelectorAll('[aria-label="Nova conversa"], [title="Nova conversa"], [aria-label="New chat"], [data-icon="new-chat-outline"], [data-icon="new-chat"], [data-icon*="new-chat"]')].find(vis);
        if (!botao) return 'sem botão +';
        clicar(botao); await esp(1500);
        let campo = null;
        for (let i = 0; i < 10 && !campo; i++) {
          // 1.1: o campo da "Nova conversa" é o input "Pesquisar nome, número ou @nomedeusuário" (o outro é a busca da lista de conversas)
          campo = [...document.querySelectorAll('input, div[contenteditable="true"][role="textbox"]')].filter(vis)
            .find(e => !e.closest('#main') && /n[úu]mero|number/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('placeholder') || '')));
          if (!campo) await esp(500);
        }
        if (!campo) return 'sem campo de busca';
        await escrever(campo, dig(numero));
        // o resultado do número (contato salvo ou "não está nos seus contatos") — confere os 8 últimos dígitos
        let item = null;
        for (let i = 0; i < 20 && !item; i++) {
          await esp(700);
          if (i > 8 && /nenhum resultado|no results/i.test(document.body.innerText.slice(0, 4000))) break;
          item = [...document.querySelectorAll('[role="button"], [role="listitem"], [role="option"]')].filter(vis)
            .find(e => !e.closest('#main') && !e.contains(campo) && String(e.innerText || '').length < 80 && dig(e.innerText).length >= 10 && dig(e.innerText).endsWith(k));
        }
        if (!item) return 'número não apareceu na busca';
        clicar(item);
        for (let i = 0; i < 20; i++) { await esp(700); if (caixaMsg() && (numeroCab() === k || !numeroCab())) return 'ok'; }
        return 'a conversa não abriu depois do clique';
      }

      // 1.2 (16/11 13:04): uma cópia antiga do envio (rodarWA, do core velho guardado no Tampermonkey) continua rodando no WhatsApp e
      // recarrega a página para send?phone=… a cada minuto. Ela para sozinha quando o contador dela ('wa_feitas_ANO-MES-DIA-HORA')
      // passa de 10 → este módulo deixa esse contador sempre cheio (o nosso contador é outro: 'wa_hora_…').
      const calaAntigo = () => { try { const d = new Date(); for (let h = 0; h < 24; h++) GM_setValue('wa_feitas_' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '-' + h, 99); } catch (e) {} };
      calaAntigo(); setInterval(calaAntigo, 10 * 60000);
      // 1.8 (Stefany 18/11 14:42, José …6520 e Drika …8589 "não enviou"): o robô dava como ENVIADA só porque a caixa esvaziou;
      // com o WhatsApp Web sem conexão a mensagem fica no reloginho e nunca sai — e a conversa ainda era fechada no Botmaker.
      // Agora: (a) sem conexão (aviso "Computador não conectado" / "Conectando…" / "Telefone não conectado") NÃO envia, só espera;
      // (b) depois do clique espera até 25 s o ✓ da mensagem — se ficar no reloginho = ERRO "não confirmado" e o envio PAUSA (não fecha no Botmaker);
      // (c) comando de fora GM 'wa_recarregar' (dinsWaRecarregar() no Botmaker) recarrega esta aba.
      const CARREGOU = Date.now();
      const semConexao = () => { try { if (document.querySelector('[data-icon="alert-computer"],[data-icon="alert-phone"],[data-icon*="alert-offline"],[data-icon="alert-update"]')) return true;
        const sd = document.querySelector('#side'), pn = document.querySelector('#pane-side'); const t = sd ? (sd.innerText || '').replace((pn && pn.innerText) || '', '').slice(0, 800) : (document.body.innerText || '').slice(0, 800);   // só o aviso de cima, nunca as conversas
        return /computador n[ãa]o (est[áa] )?conectado|telefone n[ãa]o (est[áa] )?conectado|conectando\.\.\.|conectando…|tentando (se )?conectar|sem conex[ãa]o|computer not connected|phone not connected|connecting/i.test(t); } catch (e) { return false; } };
      setInterval(() => { try { const rq = +GM_getValue('wa_recarregar', 0) || 0; if (rq > CARREGOU && Date.now() - rq < 10 * 60000 && !ocupado) { GM_setValue('wa_recarregar', 0); location.reload(); } } catch (e) {} }, 15000);
      let ocupado = false;
      const tick = async () => {
        if (ocupado || !horario() || !appPronto()) return;   // WhatsApp ainda carregando: só espera (nunca recarrega)
        if (semConexao()) { GM_setValue('wa_status', { t: Date.now(), m: 'WhatsApp Web sem conexão — esperando para enviar' }); return; }   // 1.8
        const pend = fila().filter(x => x.estado === 'pendente' && x.fone);
        if (!pend.length) return;
        const prox = +GM_getValue('wa_prox', 0) || 0;
        if (prox - Date.now() > 86400000) return;                            // pausado à mão (dinsWaPausar)
        const naEspera = Date.now() < prox;                                  // 4 a 6 min entre envios (1.5: na espera só confere o próximo, não envia)
        const hora = new Date(); const mh = 'wa_hora_' + hora.toDateString() + '_' + hora.getHours();
        // 1.6 (Stefany 18/11 11:37: "como a varredura está atrasada… não precisa limitar no máximo 10 por hora, vou deixar ele rodar direto"): sem teto por hora; a cadência de 4 a 6 min entre envios continua
        if ((+GM_getValue(mh, 0) || 0) >= 999) return;
        const alvo = pend[0];
        if (naEspera && alvo.preOk && Date.now() - alvo.preOk < 15 * 60000) return;   // o próximo já foi conferido: só espera o horário
        const adia = ms => GM_setValue('wa_prox', naEspera ? Math.max(prox, Date.now() + ms) : Date.now() + ms);   // na espera nunca encurta o intervalo
        const numero = alvo.foneAlt || dig(alvo.fone);
        ocupado = true;
        try {
          // conversa aberta pelo endereço (jeito antigo, só como reserva) já está na tela?
          const abrindo = (() => { try { return JSON.parse(sessionStorage.getItem('dins_wa_abrindo') || 'null'); } catch (e) { return null; } })();
          let r = (abrindo && abrindo.hash === alvo.hash && caixaMsg()) ? 'aberta pelo endereço' : await abrirPeloMais(numero);
          log(alvo.nome || alvo.hash.slice(0, 5), '→', r);
          if (!/ok|já aberta|aberta pelo endereço/.test(r)) {
            if (/inv[aá]lido|não está no WhatsApp|isn.t on WhatsApp/i.test(document.body.innerText)) { marca(alvo, { estado: 'erro', motivo: 'número não está no WhatsApp' }); adia(60000); return; }
            const tent = (alvo.tentAbrir || 0) + 1;
            const semNove = /^55\d{2}9\d{8}$/.test(dig(alvo.fone)) && tent === 1 && /não apareceu/.test(r);
            if (semNove) { marca(alvo, { tentAbrir: tent, foneAlt: dig(alvo.fone).replace(/^(55\d{2})9/, '$1') }); adia(20000); return; }
            if (tent <= 2 && !(abrindo && abrindo.hash === alvo.hash)) {   // reserva: UMA vez pelo endereço
              marca(alvo, { tentAbrir: tent });
              sessionStorage.setItem('dins_wa_abrindo', JSON.stringify({ hash: alvo.hash, t: Date.now() }));
              location.href = 'https://web.whatsapp.com/send?phone=' + dig(alvo.fone); return;
            }
            sessionStorage.removeItem('dins_wa_abrindo');
            marca(alvo, { estado: 'erro', motivo: 'a conversa não abriu (' + r + ') — conferir o número' }); adia(60000); return;
          }
          sessionStorage.removeItem('dins_wa_abrindo');
          const cx = caixaMsg();
          const cab = numeroCab(), al = chave(numero);
          if (cab && cab !== al && cab !== chave(alvo.fone)) { marca(alvo, { estado: 'erro', motivo: 'número do cabeçalho não confere' }); adia(30000); return; }
          // quem já tem mensagem nossa sem resposta (últimos 7 dias) NÃO recebe outra
          await esp(2500);
          const linhas = [...document.querySelectorAll('#main [role="row"]')].filter(x => x.innerText.trim() && !/protegidas com a criptografia/i.test(x.innerText));
          const ehNossa = x => !!x.querySelector('[data-icon*="tail-out"],[data-icon*="msg-dblcheck"],[data-icon*="msg-check"],[data-icon*="msg-time"]');
          const dataDe = x => { const e = x && x.querySelector('[data-pre-plain-text]'); const m = e && /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(e.getAttribute('data-pre-plain-text') || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; };
          const ult = linhas[linhas.length - 1];
          if (ult && ehNossa(ult)) { const dt = dataDe(ult); const dias = dt ? (Date.now() - dt) / 86400000 : 0;
            if (!dt || dias < 7) { marca(alvo, { estado: 'pulado', motivo: 'já tem mensagem nossa sem resposta no WhatsApp' + (dt ? ' (há ' + Math.floor(dias) + ' dia(s))' : '') }); adia(20000); return; } }
          if ((cx.innerText || '').trim()) { marca(alvo, { estado: 'erro', motivo: 'a caixa já tinha texto (rascunho)' }); adia(60000); return; }
          if (naEspera) { marca(alvo, { preOk: Date.now() }); log(alvo.nome || alvo.hash.slice(0, 5), '→ conferido, espera o horário'); return; }   // 1.5: pode receber — envia quando o intervalo fechar
          const msg = texto(alvo.caso, alvo.nome);
          cx.focus(); await esp(400);
          try { const dt = new DataTransfer(); dt.setData('text/plain', msg); cx.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (e) {}
          await esp(1500);
          if (!cx.innerText.trim()) { marca(alvo, { estado: 'erro', motivo: 'o texto não entrou na caixa' }); adia(60000); return; }
          const quebras = cx.querySelectorAll('p, br').length > 2 || (cx.innerText.match(/\n/g) || []).length >= 4;
          if (!quebras) { marca(alvo, { estado: 'erro', motivo: 'o texto entrou sem as quebras de linha — NÃO enviado (rascunho na caixa)' }); GM_setValue('wa_prox', Date.now() + 365 * 86400000); return; }
          const ic = document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"]');
          const bt = document.querySelector('#main footer button[aria-label="Enviar"]') || (ic && ic.closest('button, [role="button"]'));
          if (!bt) { marca(alvo, { estado: 'erro', motivo: 'botão de enviar não encontrado (rascunho na caixa)' }); GM_setValue('wa_prox', Date.now() + 365 * 86400000); return; }
          bt.click(); await esp(3000);
          if (cx.innerText.trim()) { marca(alvo, { estado: 'erro', motivo: 'a caixa continuou cheia depois de enviar' }); GM_setValue('wa_prox', Date.now() + 365 * 86400000); return; }
          // 1.8: só é ENVIADA com o ✓ do WhatsApp (reloginho = ainda não saiu)
          { const ini = msg.replace(/\s+/g, ' ').trim().slice(0, 25); let st = '';
            for (let i = 0; i < 25; i++) { await esp(1000);
              const rows = [...document.querySelectorAll('#main [role="row"]')].filter(x => (x.innerText || '').replace(/\s+/g, ' ').includes(ini));
              const r0 = rows[rows.length - 1];
              // 1.9 (14:58: o ✓ do WhatsApp novo não tem mais o nome "msg-check" → deu "sem ícone" numa mensagem que saiu): ok = qualquer ícone de check; reloginho = ícone de relógio/pendente
              const relo = r0 && r0.querySelector('[data-icon*="time"],[data-icon*="clock"],[data-icon*="pending"],[aria-label*="endente"],[aria-label*="ending"]');
              st = !r0 ? 'sem balão' : relo ? 'reloginho' : r0.querySelector('[data-icon*="check"],[aria-label*="Enviada"],[aria-label*="Entregue"],[aria-label*="Lida"],[aria-label*="Sent"],[aria-label*="Delivered"],[aria-label*="Read"]') ? 'ok' : 'sem ícone';
              if (st === 'ok') break; }
            if (st === 'sem ícone') st = 'ok';   // balão saiu e não está no reloginho → enviado
            if (st !== 'ok') { marca(alvo, { estado: 'erro', motivo: 'mensagem NÃO confirmada pelo WhatsApp (' + st + ' depois de 25 s) — conferir a conexão do WhatsApp Web' });
              GM_setValue('wa_prox', Date.now() + 365 * 86400000); GM_setValue('wa_status', { t: Date.now(), m: 'PAUSADO: mensagem ficou no ' + st }); log(alvo.nome || alvo.hash.slice(0, 5), '→ NÃO confirmada (' + st + ') — envio pausado'); return; } }
          marca(alvo, { estado: 'enviado', quando: Date.now() });
          GM_setValue('wa_status', { t: Date.now(), m: 'ok ' + (alvo.nome || alvo.hash.slice(0, 5)) });
          GM_setValue(mh, (+GM_getValue(mh, 0) || 0) + 1);
          GM_setValue('wa_prox', Date.now() + (3 + Math.random() * 1.5) * 60000);   // 1.7 (Stefany 18/11 11:58: 'demorou 8 min de intervalo'): espera 3 a 4,5 min — com a conferência do próximo, o envio fica entre 4 e 6 min
          try { localStorage.setItem('dins_wa_ultimo', JSON.stringify({ nome: alvo.nome, caso: alvo.caso, hora: new Date().toLocaleTimeString('pt-BR').slice(0, 5) })); } catch (e) {}
        } catch (e) { marca(alvo, { estado: 'erro', motivo: String(e.message || e) }); }
        finally { ocupado = false; }
      };
      (async () => { await esp(12000); for (;;) { try { await tick(); } catch (e) {} await esp(15000); } })();   // 1.3: laço pelo Worker (sem freio de aba em segundo plano)
      try { (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window).dinsWaAbrirTeste = abrirPeloMais; } catch (e) {}   // teste à mão: só abre, não envia
    };
    const pegarWa = url => new Promise(res => { try { GM_xmlhttpRequest({ method: 'GET', url, nocache: true, timeout: 15000, headers: { 'Cache-Control': 'no-cache' }, onload: r => res(r.status === 200 ? r.responseText : ''), onerror: () => res(''), ontimeout: () => res('') }); } catch (e) { res(''); } });
    const WAURL = ref => 'https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/' + ref + '/dinseguro-wa.js';
    (async () => {
      let codigo = '';
      try { let sha = ''; try { sha = JSON.parse(await pegarWa('https://api.github.com/repos/atendimentodinseguro-pixel/dinseguro-robo/commits/main')).sha || ''; } catch (e) {}
        codigo = sha ? await pegarWa(WAURL(sha)) : ''; if (!codigo) codigo = await pegarWa(WAURL('main') + '?t=' + Date.now()); } catch (e) {}
      if (codigo && /Dinseguro — envio da varredura/.test(codigo)) { GM_setValue('wa_cache', codigo); } else codigo = GM_getValue('wa_cache', '');
      if (codigo) { try { new Function('GM_getValue', 'GM_setValue', 'unsafeWindow', codigo)(GM_getValue, GM_setValue, UW); console.log('[Dinseguro] WhatsApp: módulo do GitHub', (codigo.match(/Versão WA: ([\d.]+)/) || [])[1]); try { localStorage.setItem('dins_wa_modulo', 'github ' + ((codigo.match(/Versão WA: ([\d.]+)/) || [])[1] || '')); } catch (e) {} return; } catch (e) { console.warn('[Dinseguro] WhatsApp: não deu para rodar o módulo baixado — uso a cópia embutida', e); } }
      try { localStorage.setItem('dins_wa_modulo', 'embutido 1.9'); } catch (e) {}
      embutido();
    })();
    return;   // no WhatsApp Web o robô principal não roda (não precisa)
  }
  const REPO = 'atendimentodinseguro-pixel/dinseguro-robo';
  const RAW = ref => 'https://raw.githubusercontent.com/' + REPO + '/' + ref + '/dinseguro-core.js';

  const rodar = (codigo, origem) => {
    try {
      if (window.__dinsCoreRodou) { console.log('[Dinseguro] robô já rodando pela cópia do @require (eval bloqueado neste site)'); return; }
      // 3.35 (17/11 20:30): passa também GM_xmlhttpRequest e GM_registerMenuCommand (digitação pela API do New Corban — robô 7.86)
      new Function('GM_getValue', 'GM_setValue', 'GM_notification', 'GM_setClipboard', 'unsafeWindow', 'GM_xmlhttpRequest', 'GM_registerMenuCommand', 'var __dinsViaEvalLocal = 1;\n' + codigo)(   // 3.13: avisa o core que veio pelo eval
        GM_getValue, GM_setValue, GM_notification, GM_setClipboard,
        typeof unsafeWindow !== 'undefined' ? unsafeWindow : window,
        typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : undefined,
        typeof GM_registerMenuCommand !== 'undefined' ? GM_registerMenuCommand : undefined);
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
