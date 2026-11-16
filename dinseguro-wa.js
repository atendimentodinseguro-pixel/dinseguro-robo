// Dinseguro — envio da varredura pelo WhatsApp Web (módulo baixado do GitHub pelo carregador 3.28+). Versão WA: 1.4
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
let ocupado = false;
const tick = async () => {
  if (ocupado || !horario() || !appPronto()) return;   // WhatsApp ainda carregando: só espera (nunca recarrega)
  const pend = fila().filter(x => x.estado === 'pendente' && x.fone);
  if (!pend.length) return;
  const prox = +GM_getValue('wa_prox', 0) || 0;
  if (prox - Date.now() > 86400000) return;                            // pausado à mão (dinsWaPausar)
  if (Date.now() < prox) return;                                       // 4 a 6 min entre envios
  const hora = new Date(); const mh = 'wa_hora_' + hora.toDateString() + '_' + hora.getHours();
  if ((+GM_getValue(mh, 0) || 0) >= 10) return;                       // no máximo 10 por hora
  const alvo = pend[0];
  const numero = alvo.foneAlt || dig(alvo.fone);
  ocupado = true;
  try {
    // conversa aberta pelo endereço (jeito antigo, só como reserva) já está na tela?
    const abrindo = (() => { try { return JSON.parse(sessionStorage.getItem('dins_wa_abrindo') || 'null'); } catch (e) { return null; } })();
    let r = (abrindo && abrindo.hash === alvo.hash && caixaMsg()) ? 'aberta pelo endereço' : await abrirPeloMais(numero);
    log(alvo.nome || alvo.hash.slice(0, 5), '→', r);
    if (!/ok|já aberta|aberta pelo endereço/.test(r)) {
      if (/inv[aá]lido|não está no WhatsApp|isn.t on WhatsApp/i.test(document.body.innerText)) { marca(alvo, { estado: 'erro', motivo: 'número não está no WhatsApp' }); GM_setValue('wa_prox', Date.now() + 60000); return; }
      const tent = (alvo.tentAbrir || 0) + 1;
      const semNove = /^55\d{2}9\d{8}$/.test(dig(alvo.fone)) && tent === 1 && /não apareceu/.test(r);
      if (semNove) { marca(alvo, { tentAbrir: tent, foneAlt: dig(alvo.fone).replace(/^(55\d{2})9/, '$1') }); GM_setValue('wa_prox', Date.now() + 20000); return; }
      if (tent <= 2 && !(abrindo && abrindo.hash === alvo.hash)) {   // reserva: UMA vez pelo endereço
        marca(alvo, { tentAbrir: tent });
        sessionStorage.setItem('dins_wa_abrindo', JSON.stringify({ hash: alvo.hash, t: Date.now() }));
        location.href = 'https://web.whatsapp.com/send?phone=' + dig(alvo.fone); return;
      }
      sessionStorage.removeItem('dins_wa_abrindo');
      marca(alvo, { estado: 'erro', motivo: 'a conversa não abriu (' + r + ') — conferir o número' }); GM_setValue('wa_prox', Date.now() + 60000); return;
    }
    sessionStorage.removeItem('dins_wa_abrindo');
    const cx = caixaMsg();
    const cab = numeroCab(), al = chave(numero);
    if (cab && cab !== al && cab !== chave(alvo.fone)) { marca(alvo, { estado: 'erro', motivo: 'número do cabeçalho não confere' }); GM_setValue('wa_prox', Date.now() + 30000); return; }
    // quem já tem mensagem nossa sem resposta (últimos 7 dias) NÃO recebe outra
    await esp(2500);
    const linhas = [...document.querySelectorAll('#main [role="row"]')].filter(x => x.innerText.trim() && !/protegidas com a criptografia/i.test(x.innerText));
    const ehNossa = x => !!x.querySelector('[data-icon*="tail-out"],[data-icon*="msg-dblcheck"],[data-icon*="msg-check"],[data-icon*="msg-time"]');
    const dataDe = x => { const e = x && x.querySelector('[data-pre-plain-text]'); const m = e && /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(e.getAttribute('data-pre-plain-text') || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; };
    const ult = linhas[linhas.length - 1];
    if (ult && ehNossa(ult)) { const dt = dataDe(ult); const dias = dt ? (Date.now() - dt) / 86400000 : 0;
      if (!dt || dias < 7) { marca(alvo, { estado: 'pulado', motivo: 'já tem mensagem nossa sem resposta no WhatsApp' + (dt ? ' (há ' + Math.floor(dias) + ' dia(s))' : '') }); GM_setValue('wa_prox', Date.now() + 20000); return; } }
    if ((cx.innerText || '').trim()) { marca(alvo, { estado: 'erro', motivo: 'a caixa já tinha texto (rascunho)' }); GM_setValue('wa_prox', Date.now() + 60000); return; }
    const msg = texto(alvo.caso, alvo.nome);
    cx.focus(); await esp(400);
    try { const dt = new DataTransfer(); dt.setData('text/plain', msg); cx.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (e) {}
    await esp(1500);
    if (!cx.innerText.trim()) { marca(alvo, { estado: 'erro', motivo: 'o texto não entrou na caixa' }); GM_setValue('wa_prox', Date.now() + 60000); return; }
    const quebras = cx.querySelectorAll('p, br').length > 2 || (cx.innerText.match(/\n/g) || []).length >= 4;
    if (!quebras) { marca(alvo, { estado: 'erro', motivo: 'o texto entrou sem as quebras de linha — NÃO enviado (rascunho na caixa)' }); GM_setValue('wa_prox', Date.now() + 365 * 86400000); return; }
    const ic = document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"]');
    const bt = document.querySelector('#main footer button[aria-label="Enviar"]') || (ic && ic.closest('button, [role="button"]'));
    if (!bt) { marca(alvo, { estado: 'erro', motivo: 'botão de enviar não encontrado (rascunho na caixa)' }); GM_setValue('wa_prox', Date.now() + 365 * 86400000); return; }
    bt.click(); await esp(3000);
    if (cx.innerText.trim()) { marca(alvo, { estado: 'erro', motivo: 'a caixa continuou cheia depois de enviar' }); GM_setValue('wa_prox', Date.now() + 365 * 86400000); return; }
    marca(alvo, { estado: 'enviado', quando: Date.now() });
    GM_setValue(mh, (+GM_getValue(mh, 0) || 0) + 1);
    GM_setValue('wa_prox', Date.now() + (4 + Math.random() * 2) * 60000);   // próxima entre 4 e 6 min
    try { localStorage.setItem('dins_wa_ultimo', JSON.stringify({ nome: alvo.nome, caso: alvo.caso, hora: new Date().toLocaleTimeString('pt-BR').slice(0, 5) })); } catch (e) {}
  } catch (e) { marca(alvo, { estado: 'erro', motivo: String(e.message || e) }); }
  finally { ocupado = false; }
};
(async () => { await esp(12000); for (;;) { try { await tick(); } catch (e) {} await esp(15000); } })();   // 1.3: laço pelo Worker (sem freio de aba em segundo plano)
try { (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window).dinsWaAbrirTeste = abrirPeloMais; } catch (e) {}   // teste à mão: só abre, não envia
