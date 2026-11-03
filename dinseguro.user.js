// ==UserScript==
// @name         Dinseguro - Digitação automática (Multicorban -> New Corban FACTA/C6)
// @namespace    dinseguro
// @version      2.2
// @description  No Multicorban monta a ficha do cliente; no New Corban digita a proposta (auto-complete, simulação, tabela, dados, banco) e para antes de Gravar.
// @match        https://app.multicorban.com/*
// @match        https://romulorochadesouza.newcorban.com.br/*
// @match        https://go.botmaker.com/*
// @updateURL    https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro.user.js
// @downloadURL  https://raw.githubusercontent.com/atendimentodinseguro-pixel/dinseguro-robo/main/dinseguro.user.js
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  // ------------------------------------------------------------------ REGRAS
  const PEGAR_LINK = false;   // true = depois de gravar também busca o link e copia a mensagem /n54n
  const INVALIDEZ = ['04', '05', '06', '32', '33', '34', '51', '83', '92'];
  const PADRAO = {
    dt_emissao: '01/11/2026',
    email: 'naoinformado@gmail.com',
    cep: '00000000', endereco: 'Não informado', numero: '0', bairro: 'Não informado',
  };
  const NOME_BANCO = { '001': 'Banco do Brasil', '104': 'Caixa', '237': 'Bradesco', '341': 'Itaú', '033': 'Santander',
    '389': 'Mercantil do Brasil', '260': 'Nubank', '336': 'C6 Bank', '077': 'Inter', '623': 'Pan', '756': 'Sicoob', '748': 'Sicredi',
    '041': 'Banrisul', '070': 'BRB', '004': 'Banco do Nordeste', '037': 'Banpará', '021': 'Banestes', '047': 'Banese', '290': 'PagBank', '380': 'PicPay' };

  const so = s => (s || '').replace(/\D/g, '');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const num = s => parseFloat(String(s || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  const brl = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Decide banco destino pelas regras combinadas
  function decidirBanco(f) {
    const idade = parseInt(f.idade) || 0;
    const esp = String(f.especie || '').padStart(2, '0');
    const liberadoEst = num(f.parcela) * 28400 / 648.39;
    if (idade > 76) return { banco: 'NAO', motivo: 'Acima de 76 anos: não fazer.' };
    if (idade > 73) return { banco: 'HUMANO', motivo: 'Acima de 73 anos: passar para atendente.' };
    if (esp === '87' || esp === '88') return { banco: 'HUMANO', motivo: 'Espécie 87/88: R$400+ vai para atendente, senão /n30.' };
    if (num(f.parcela) < 20) return { banco: 'NAO', motivo: 'Margem abaixo de R$ 20: /n30.' };
    let banco = 'C6';
    if (INVALIDEZ.includes(esp)) {
      if (idade >= 60) banco = 'FACTA';
      else if (idade >= 58) return { banco: 'HUMANO', motivo: 'Invalidez 58–59 anos: vai para QUALI (fora deste script).' };
    }
    if (liberadoEst < 6000) banco = 'FACTA';
    return { banco, motivo: `Liberado estimado R$ ${brl(liberadoEst)}${INVALIDEZ.includes(esp) ? ' · invalidez' : ''}` };
  }

  // Ficha em texto (chave: valor) <-> objeto
  const CAMPOS = ['banco_destino', 'nome', 'cpf', 'beneficio', 'especie', 'idade', 'ddb', 'parcela', 'prazo', 'telefone', 'email',
    'cep', 'endereco', 'numero', 'bairro', 'cidade', 'banco', 'agencia', 'conta'];
  const fichaParaTexto = f => CAMPOS.map(k => `${k}: ${f[k] ?? ''}`).join('\n');
  function textoParaFicha(t) {
    const f = {};
    t.split('\n').forEach(l => { const m = l.match(/^\s*([\w_]+)\s*:\s*(.*)$/); if (m) f[m[1].toLowerCase()] = m[2].trim(); });
    return f;
  }

  // ------------------------------------------------------------------ PAINEL
  function painel(titulo) {
    const p = document.createElement('div');
    p.id = 'dins-painel';
    p.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <b>🤖 ${titulo}</b><span id="dins-min" style="cursor:pointer;padding:0 6px">—</span></div>
      <div id="dins-corpo"></div>
      <div id="dins-log" style="margin-top:6px;max-height:130px;overflow:auto;font:12px monospace;white-space:pre-wrap"></div>`;
    p.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;width:360px;background:#0f172a;color:#e2e8f0;' +
      'border:1px solid #334155;border-radius:12px;padding:12px;font:13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45)';
    document.body.appendChild(p);
    p.querySelector('#dins-min').onclick = () => {
      const c = p.querySelector('#dins-corpo'), l = p.querySelector('#dins-log');
      const esc = c.style.display !== 'none'; c.style.display = l.style.display = esc ? 'none' : '';
    };
    return p;
  }
  const botao = (txt, cor) => `<button data-a="${txt}" style="margin:3px 4px 0 0;padding:7px 10px;border:0;border-radius:8px;background:${cor};color:#fff;font-weight:600;cursor:pointer">${txt}</button>`;
  function log(msg, tipo) {
    const l = document.getElementById('dins-log'); if (!l) return;
    const cor = tipo === 'erro' ? '#f87171' : tipo === 'ok' ? '#4ade80' : '#cbd5e1';
    l.innerHTML += `<div style="color:${cor}">${new Date().toLocaleTimeString().slice(0, 5)} ${msg}</div>`;
    l.scrollTop = l.scrollHeight;
  }

  // ================================================================== MANTER SESSÃO ATIVA
  // A cada 10 min faz uma consulta silenciosa à própria página para a sessão do Multicorban
  // e do New Corban não expirar por inatividade (não recarrega a tela, não digita nada).
  if (window.top === window && /multicorban\.com|newcorban\.com\.br/.test(location.host)) {
    const ehLogin = () => /login|entrar/i.test(document.title) || !!document.querySelector('input[type=password]');
    setInterval(() => { if (!ehLogin()) fetch(location.href, { credentials: 'include', cache: 'no-store' }).catch(() => {}); }, 10 * 60 * 1000);
  }

  // ================================================================== BOTMAKER: VIGIA
  // Roda dentro da lista de chats. Não gasta nada: só anota cliente NOVO derivado para atendimento
  // em localStorage 'dins_fila' (o Claude lê essa fila) e avisa com som + notificação.
  if (location.host === 'go.botmaker.com') {
    if (!/moduleForward\/chats/.test(location.pathname)) return;
    const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
    const gravar = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    const bip = () => { try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 250); } catch (e) {} };

    // v2.0: a fila é recalculada a cada 30s a partir da lista. Cliente fica na fila enquanto estiver
    // "esperando" (última mensagem é dele, ou o bot mandou "aguarde um atendente") e ninguém marcou
    // como feito. Feito = dins_feito[id] guarda a mensagem que estava na tela quando foi resolvido;
    // se o cliente mandar algo novo, a mensagem muda e ele volta para a fila sozinho.
    function vigiar() {
      const itens = [...document.querySelectorAll('.customer-item')].map(ci => {
        const id = (ci.parentElement || {}).id;
        const chip = [...ci.querySelectorAll('.MuiChip-label')].map(c => c.textContent.trim()).join(',');
        const info = ci.querySelector('.customer-main-info');
        const linhas = info ? info.innerText.split('\n').map(s => s.trim()).filter(Boolean) : [];
        // linhas: [nome, (ícone check/done_all = mensagem NOSSA | nº de não lidas)?, mensagem?, hora, ...selo]
        let i = 1, nossa = false, naoLidas = 0, msg = '';
        if (/^(check|done_all|done|schedule)$/.test(linhas[i] || '')) { nossa = true; i++; }
        if (/^\d{1,3}$/.test(linhas[i] || '')) { naoLidas = +linhas[i]; i++; }
        if (linhas[i] && !/^(\d{1,2}:\d{2}|\d+\s*[smhd]|ontem|\d{1,2}\/\d{1,2})/i.test(linhas[i])) msg = linhas[i];
        if (/^\[(🤖\s*)?Dinseguro\]|^\[R[ôo]mulo/i.test(msg)) nossa = true;
        return { id, nome: linhas[0] || '', chip, naoLidas, msg, nossa };
      }).filter(x => x.id);
      if (!itens.length) return;

      const feito = ler('dins_feito', {});
      const ignorar = ler('dins_ignorar', []);
      const antiga = ler('dins_fila', []);
      const naTela = new Set(itens.map(x => x.id));
      const fila = [];
      for (const x of itens) {
        if (ignorar.includes(x.id)) continue;
        const sig = x.msg.slice(0, 60);
        if (feito[x.id] === sig) continue;
        // Chat com atendente humano (Romulo Rocha ou outro nome) fica com ele: o vigia não mexe.
        const humano = !!x.chip && !/credsegurobank|Dinseguro|Bot desligado/i.test(x.chip);
        if (humano) continue;
        const handoff = /atendente humano|Aguarde um momento/i.test(x.msg);
        const nosso = /Dinseguro|Bot desligado/i.test(x.chip);
        const esperando = handoff || (nosso && !x.nossa && (x.naoLidas > 0 || /Bot desligado/i.test(x.chip)));
        if (!esperando) continue;
        const velho = antiga.find(f => f.id === x.id);
        fila.push({ id: x.id, nome: x.nome, msg: x.msg.slice(0, 80), sig, quando: velho ? velho.quando : new Date().toISOString() });
      }
      // quem saiu da tela (rolou para baixo) continua na fila até ser marcado como feito
      for (const f of antiga) if (!naTela.has(f.id) && !fila.some(g => g.id === f.id) && feito[f.id] !== f.sig && !ignorar.includes(f.id)) fila.push(f);
      const novos = fila.filter(f => !antiga.some(g => g.id === f.id));
      gravar('dins_fila', fila);
      try {
        const t = window.top.document.title.replace(/(\)?\s*\(💬\)\s*)+/g, ' ').replace(/🔔\(\d+\)\s*/g, '').trim();
        window.top.document.title = (fila.length ? `🔔(${fila.length}) ` : '') + t;
      } catch (e) {}
      if (novos.length) {
        bip(); setTimeout(bip, 400);
        const ult = novos[novos.length - 1];
        GM_notification({
          title: `🔔 Cliente esperando (${fila.length} na fila)`,
          text: novos.map(f => f.nome).join(', ') + ' — clique para abrir',
          timeout: 0,
          onclick: () => { try { window.top.focus(); window.top.location.hash = '#/chats/' + ult.id; } catch (e) {} },
        });
      }
      desenharQuadro(fila);
    }

    // Quadrinho no canto do Botmaker: quem está esperando. Clique abre o chat; ✓ tira da lista.
    function desenharQuadro(fila) {
      let top; try { top = window.top.document; } catch (e) { return; }
      let q = top.getElementById('dins-fila');
      if (!fila.length) { if (q) q.remove(); return; }
      if (!q) {
        q = top.createElement('div'); q.id = 'dins-fila';
        q.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99999;background:#7c2d12;color:#fff;border-radius:10px;' +
          'padding:8px 10px;font:13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:280px';
        top.body.appendChild(q);
        q.addEventListener('click', ev => {
          const id = ev.target.dataset.abrir, ok = ev.target.dataset.ok;
          if (id) window.top.location.hash = '#/chats/' + id;
          if (ok) { const fl = ler('dins_fila', []); const it = fl.find(f => f.id === ok); const fe = ler('dins_feito', {}); if (it) { fe[ok] = it.sig; gravar('dins_feito', fe); } gravar('dins_fila', fl.filter(f => f.id !== ok)); desenharQuadro(ler('dins_fila', [])); }
        });
      }
      const hora = s => new Date(s).toLocaleTimeString('pt-BR').slice(0, 5);
      q.innerHTML = `<b>🔔 Esperando atendimento (${fila.length})</b>` + fila.map(f =>
        `<div style="display:flex;justify-content:space-between;gap:8px;margin-top:4px">
           <span data-abrir="${f.id}" style="cursor:pointer;text-decoration:underline">${hora(f.quando)} · ${f.nome || 'sem nome'}</span>
           <span data-ok="${f.id}" title="Já atendido" style="cursor:pointer">✓</span></div>`).join('');
    }
    setInterval(vigiar, 30000);
    setTimeout(vigiar, 4000);
    return;
  }

  // ================================================================== MULTICORBAN
  if (location.host === 'app.multicorban.com') {
    if (!/\/search\//.test(location.pathname)) return;   // só na tela de consulta (não no login)
    const p = painel('Ficha do cliente');
    p.querySelector('#dins-corpo').innerHTML =
      `<div style="color:#94a3b8">Abra a consulta INSS do benefício (Consultar) e clique:</div>` +
      botao('Gerar ficha', '#2563eb') + `<textarea id="dins-ficha" style="width:100%;height:170px;margin-top:6px;font:12px monospace;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px"></textarea>` +
      botao('Salvar ficha', '#16a34a');
    const ta = p.querySelector('#dins-ficha');

    p.addEventListener('click', async e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'Gerar ficha') {
        // abre "Informações complementares" para aparecer banco/agência/conta
        const acc = [...document.querySelectorAll('button.accordion-button')].find(b => /Clique aqui para exibir/i.test(b.textContent));
        if (acc && acc.classList.contains('collapsed')) { acc.click(); await sleep(1500); }
        const t = document.body.innerText;
        const g = r => ((t.match(r) || [])[1] || '').trim();
        const f = {
          nome: g(/\nNome\s*\n+([^\n]+)/),
          cpf: so(g(/\nCPF\s*\n+(\d[\d.\-]*)\s*\n/)).padStart(11, '0'),
          beneficio: so(g(/\nBenef[íi]cio\s*\n+(\d[^\n]*)/)),
          especie: g(/Descri[çc][ãa]o da Esp[ée]cie\s*\n+(\d+)/),
          idade: so(g(/\nIdade\s*\n+([^\n]+)/)),
          ddb: g(/\nDDB\s*\n+([^\n]+)/),
          cidade: g(/Munic[íi]pio\s*\n+([^\n]+)/),
          prazo: '108',
        };
        const margem = num(g(/Margem Dispon[íi]vel\s*\n+([^\n]+)/));
        f.parcela = margem > 0 ? brl(Math.max(0, margem - 0.01)) : '0,00';
        // Regra Stefany: margem de R$ 531,30 (35% do mínimo antigo, R$ 1.518) => considerar mínimo 2026 (R$ 1.621): parcela R$ 567,34
        if (Math.abs(margem - 531.30) < 0.005) { f.parcela = '567,34'; log('Margem 531,30 → parcela 567,34 (salário mínimo 2026).', 'ok'); }
        const bancoTxt = g(/Dados Banc[áa]rio[s]?\s*\n+([^\n]+)/);
        f.banco = so(bancoTxt.split('-')[0]).padStart(3, '0').replace(/^000$/, '');
        f.agencia = so(g(/N[úu]mero da Ag[êe]ncia\s*\n+([^\n]+)/));
        f.conta = so(g(/N[úu]mero da Conta\s*\n+([^\n]+)/));
        if (!f.agencia || f.agencia.length > 4) f.agencia = '0001'; else f.agencia = f.agencia.padStart(4, '0');
        const d = decidirBanco(f);
        f.banco_destino = d.banco;
        if (!f.beneficio) { log('Não achei o benefício. Clique em "Consultar" no benefício ativo antes.', 'erro'); return; }
        ta.value = fichaParaTexto(f);
        log(`${f.nome} · espécie ${f.especie} · ${f.idade} anos · margem R$ ${brl(margem)}`);
        log(`Destino: ${d.banco} — ${d.motivo}`, ['NAO', 'HUMANO'].includes(d.banco) ? 'erro' : 'ok');
        const ddb = f.ddb.split('/').reverse().join('-'); const dias = (Date.now() - new Date(ddb)) / 864e5;
        if (dias >= 90 && margem >= 20) {
          const h = new Date().getHours();
          if (h >= 8 && h < 18) log(`DDB há ${Math.floor(dias)} dias: confirme a margem no OnlineFlash (8h–18h).`);
          else log(`DDB há ${Math.floor(dias)} dias, mas OnlineFlash só 8h–18h: seguir com a consulta normal.`);
        }
        log('Complete telefone, e-mail e endereço (se o cliente mandou) e clique Salvar ficha.');
      }
      if (a === 'Salvar ficha') {
        const f = textoParaFicha(ta.value);
        if (!f.cpf) { log('Ficha vazia.', 'erro'); return; }
        GM_setValue('ficha_atual', f);
        log(`Ficha salva. Abra o New Corban em ?p=${(f.banco_destino || 'facta').toLowerCase()} e clique "Digitar".`, 'ok');
      }
    });
    return;
  }

  // ================================================================== NEW CORBAN
  const pagina = (location.search.match(/p=(facta|c6)\b/) || [])[1];
  if (!pagina) return;
  const $ = window.jQuery || (window.unsafeWindow && window.unsafeWindow.jQuery);

  const el = id => document.getElementById(id);
  function setv(id, v) {
    const e = typeof id === 'string' ? el(id) : id; if (!e || v === undefined || v === null) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v);
    ['input', 'keyup', 'change', 'blur'].forEach(t => e.dispatchEvent(new Event(t, { bubbles: true })));
    if ($) $(e).trigger('change');
  }
  function setSelect(id, v) {
    const e = el(id); if (!e) return false;
    const opt = [...e.options].find(o => o.value === v || so(o.value) === so(v) && so(v));
    if (!opt) return false;
    if ($ && $(e).selectpicker) { $(e).selectpicker('val', opt.value); $(e).trigger('change'); }
    else { e.value = opt.value; e.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  }
  async function esperar(fn, ms = 15000, passo = 300) {
    for (let t = 0; t < ms; t += passo) { const r = fn(); if (r) return r; await sleep(passo); }
    return null;
  }

  const p = painel(`Digitação ${pagina.toUpperCase()}`);
  p.querySelector('#dins-corpo').innerHTML =
    botao('Carregar ficha', '#2563eb') +
    `<textarea id="dins-ficha" style="width:100%;height:170px;margin-top:6px;font:12px monospace;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px" placeholder="Cole a ficha aqui (chave: valor) ou clique Carregar ficha"></textarea>` +
    botao('Digitar', '#16a34a') + botao('Gravar', '#dc2626') + (PEGAR_LINK ? botao('Copiar mensagem', '#7c3aed') : '');
  const ta = p.querySelector('#dins-ficha');
  let mensagem = '';

  // ---- 1. Auto-complete pelo CPF + benefício
  async function autoComplete(f) {
    el('autocomplete-span').click();
    await esperar(() => el('autocomplete-api-cpf') && el('autocomplete-api-cpf').offsetParent);
    setv('autocomplete-api-cpf', so(f.cpf));
    const fonte = el('autocomplete-api-fonte'); fonte.value = 'inss'; if ($) $(fonte).trigger('change');
    el('autocomplete-api-btn_buscar').click();
    const btn = await esperar(() => el('autocomplete-btn-inss' + so(f.beneficio)), 20000);
    if (!btn) throw new Error('Benefício ' + f.beneficio + ' não apareceu no auto-complete.');
    btn.click();
    const ok = await esperar(() => so(el('matricula_preferencial').value) === so(f.beneficio) && el('nome_cliente') && el('nome_cliente').value, 20000);
    if (!ok) throw new Error('Auto-complete não preencheu os dados.');
    await sleep(800);
    log('Auto-complete OK: ' + el('nome_cliente').value, 'ok');
  }

  // ---- 2. Simulação e escolha da tabela
  async function simular(f) {
    setv('valor_parcela', f.parcela);
    const prazoId = pagina === 'facta' ? 'facta-prazo' : 'prazo';
    setSelect(prazoId, String(f.prazo || '108'));
    el('btn_simular').click();
    const invalidez = INVALIDEZ.includes(String(f.especie || '').padStart(2, '0'));
    const linhas = await esperar(() => {
      const r = [...document.querySelectorAll('table tbody tr')].filter(x => x.offsetParent && /1,85\s*%/.test(x.innerText)
        && !x.classList.contains('bg-light') && !x.classList.contains('iv2-offer-refused') && !/n[ãa]o dispon[íi]vel|n[ãa]o pode|extrapola/i.test(x.innerText));
      return r.length ? r : null;
    }, 30000, 700);
    if (!linhas) throw new Error('Nenhuma tabela 1,85% disponível. Confira a simulação na tela.');
    let cand = linhas.filter(x => /inval/i.test(x.innerText) === invalidez);
    if (!cand.length && pagina === 'facta') cand = linhas;            // FACTA não separa invalidez
    if (!cand.length) throw new Error(invalidez ? 'Sem tabela INVAL 1,85%.' : 'Sem tabela DWeb-ML (sem INVAL) 1,85%.');
    const escolhida = cand[0];
    escolhida.click();
    await sleep(1200);
    const txt = escolhida.innerText.replace(/\s+/g, ' ');
    log('Tabela: ' + txt.slice(0, 90), 'ok');
    const lib = (txt.match(/R\$\s*[\d.,]+/g) || []).pop();
    f._liberado = lib ? lib.replace('R$', '').trim() : '';
  }

  // ---- 3. Dados pessoais e endereço
  async function dadosPessoais(f) {
    setv('documento', so(f.cpf));
    if (!el('dt_emissao').value) setv('dt_emissao', PADRAO.dt_emissao);
    setSelect('estado_civil', 'SOLTEIRO') || setSelect('estado_civil', 'Solteiro');
    const tel = so(f.telefone).replace(/^55(?=\d{10,11}$)/, '');
    if (tel.length >= 10) {
      let n = tel.slice(2); if (n.length === 8) n = '9' + n;
      setv('ddd_cliente', tel.slice(0, 2)); setv('telefone_cliente', n);
    }
    setv('email', f.email || PADRAO.email);
    if (f.cep) {
      setv('cep', so(f.cep));
      await sleep(3000);                       // espera a busca do CEP preencher rua/bairro/cidade
      if (f.endereco && !el('endereco').value) setv('endereco', f.endereco.toUpperCase());
      if (f.bairro && !el('bairro').value) setv('bairro', f.bairro.toUpperCase());
      setv('endereco_numero', f.numero || '0');
    } else if (!so(el('cep').value)) {
      setv('cep', PADRAO.cep); setv('endereco', PADRAO.endereco); setv('bairro', PADRAO.bairro); setv('endereco_numero', PADRAO.numero);
    } else if (!el('endereco_numero').value) {
      const m = el('endereco').value.match(/^(.*?)[,\s]+(\d+)\s*$/);   // "RUA X 130" -> rua + número
      if (m) { setv('endereco', m[1]); setv('endereco_numero', m[2]); } else setv('endereco_numero', '0');
    }
    // Cidade: se o auto-complete não preencheu, recarrega a lista pelo estado e escolhe pelo nome
    const cidId = el('facta-cidade') ? 'facta-cidade' : 'cidade';
    const cid = el(cidId);
    if (cid && !cid.value) {
      const est = el('estado');
      if ($ && est) { $(est).selectpicker && $(est).selectpicker('val', est.value); $(est).trigger('change'); }
      await esperar(() => cid.options.length > 5, 15000, 500);
      const alvo = (f.cidade || '').trim().toUpperCase();
      const opt = [...cid.options].find(o => o.text.trim().toUpperCase() === alvo);
      if (opt) { if ($ && $(cid).selectpicker) $(cid).selectpicker('val', opt.value); else cid.value = opt.value; $ && $(cid).trigger('change'); log('Cidade: ' + opt.text, 'ok'); }
      else log('Cidade não preenchida' + (alvo ? ' (' + alvo + ' não achada)' : '') + '. Escolha na tela.', 'erro');
    }
    const origem = el('proposta-origem_venda'); if (origem && $) { $(origem).selectpicker && $(origem).selectpicker('val', ''); }
    log('Dados pessoais preenchidos.', 'ok');
  }

  // ---- 4. Banco: Histórico Bancário (salvo no sistema) > ficha (Multicorban) > 0001/001-1
  async function dadosBancarios(f) {
    el('btn-historico-bancario').click();
    const pick = await esperar(() => {
      const m = el('integrationsv2-bank-history-modal');
      if (!m || !m.classList.contains('show')) return null;
      const b = m.querySelector('.iv2-bh-pick');
      if (b) return b;
      return /nenhum|n[ãa]o h[áa]|sem hist/i.test(m.innerText) ? 'vazio' : null;
    }, 12000);
    if (pick && pick !== 'vazio') {
      pick.click(); await sleep(1200);
      const mh = el('integrationsv2-bank-history-modal');
      if (mh && mh.classList.contains('show') && $) { $(mh).modal('hide'); await sleep(500); }
      log('Conta do Histórico Bancário (salva no sistema).', 'ok');
    } else {
      const m = el('integrationsv2-bank-history-modal'); if (m && $) $(m).modal('hide');
      await sleep(500);
      if (!so(f.banco) || /^0+$/.test(so(f.banco))) {
        throw new Error('Cliente SEM conta bancária: NÃO gravar. Mande a simulação e, quando ele aceitar, o atalho /08 pedindo a conta.');
      }
      const banco = so(f.banco).padStart(3, '0');
      const agencia = so(f.agencia) && so(f.agencia).length <= 4 ? so(f.agencia).padStart(4, '0') : '0001';
      let conta = so(f.conta), dv;
      if (conta) { dv = conta.slice(-1); conta = conta.slice(0, -1); } else { conta = '001'; dv = '1'; }
      if (pagina === 'facta') { if (!setSelect('banco', banco)) log('Banco ' + banco + ' não existe na lista do FACTA.', 'erro'); }
      else setv('banco', banco);
      setv('agencia', agencia); setv('conta', conta); setv('conta_digito', dv);
      log(`Conta da ficha: ${banco} ag ${agencia} (${so(f.conta) ? 'Multicorban/ficha' : 'padrão 001-1'}).`, so(f.conta) ? 'ok' : 'erro');
    }
    if (pagina === 'c6') {   // C6 também pede o banco do benefício
      ['banco', 'agencia', 'conta', 'conta_digito'].forEach(k => { if (el('beneficio_' + k) && !el('beneficio_' + k).value) setv('beneficio_' + k, el(k).value); });
    }
    // FACTA: confere se o banco visível bate com o valor real
    if (pagina === 'facta') {
      const bs = el('banco').closest('.bootstrap-select');
      const vis = bs ? ((bs.querySelector('.filter-option-inner-inner, .filter-option') || {}).innerText || '') : '';
      if (vis && !vis.startsWith(el('banco').value)) {
        $(el('banco')).selectpicker('val', el('banco').value);
        log('Banco na tela corrigido para ' + el('banco').value + '. Confira.', 'erro');
      } else log('Banco: ' + vis, 'ok');
    }
  }

  // ---- 5. Gravar e pegar o link
  async function gravarELink(f) {
    const bv = so((el('banco') || {}).value);
    if (!bv || /^0+$/.test(bv)) throw new Error('Sem banco preenchido (000/vazio): proposta NÃO gravada. Peça a conta ao cliente (/08).');
    el('btn_gravar_proposta').click();
    const modal = await esperar(() => {
      const m = [...document.querySelectorAll('.modal.show, .swal2-popup')].find(x => /Proposta gerada|criada com sucesso|erro|inv[áa]lid/i.test(x.innerText));
      return m || null;
    }, 30000, 500);
    if (!modal) throw new Error('Não apareceu confirmação. Veja se faltou algum campo (a tela rola até ele).');
    if (!/Proposta gerada|criada com sucesso/i.test(modal.innerText)) throw new Error('Banco recusou: ' + modal.innerText.slice(0, 200));
    const nro = (modal.innerText.match(/N[º°o]\s*(\d+)/) || [])[1] || '';
    log('Proposta gravada Nº ' + nro, 'ok');
    GM_setValue('ultimo_resultado', { cpf: f.cpf, proposta: nro, quando: new Date().toISOString() });
    if (!PEGAR_LINK) return;                     // por enquanto para aqui: link é pego à mão
    const achaLink = () => {
      const i = [...modal.querySelectorAll('input')].map(x => x.value).find(v => /^https?:\/\//.test(v));
      return i || (modal.innerText.match(/https?:\/\/\S+/) || [])[0];
    };
    let link = achaLink();
    // C6: link demora 1–3 min. Clica "consultar link" 1x por minuto, até 5x.
    for (let i = 0; !link && i < 5; i++) {
      const b = [...modal.querySelectorAll('button,a')].find(x => /consultar link|tentar de novo|link de formaliza/i.test(x.innerText));
      if (b) b.click();
      log(`Aguardando link (${i + 1}/5)...`);
      link = await esperar(achaLink, 60000, 2000);
    }
    if (!link) { log('Sem link após 5 tentativas. Regra: refazer no FACTA.', 'erro'); return; }
    const bancoNome = NOME_BANCO[so(el('banco').value).padStart(3, '0')] || ('banco ' + el('banco').value);
    const nome = (el('nome_cliente').value || f.nome || '').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase());
    mensagem = `✅ *Proposta aprovada! Valor autorizado para liberação na conta do banco ${bancoNome}.*\n\n` +
      `Para não perder a liberação, é necessário concluir agora.\n\n` +
      `⏰ *Você tem até 10 minutos para acessar o link e finalizar a formalização digital.*\n\n\n${link}\n\n\n` +
      `O acesso é feito pela plataforma do Banco.\n📸 No final, será solicitada apenas a foto do rosto do beneficiário *${nome}* para validação de segurança.\n\n` +
      `Concluindo, me avise imediatamente para dar sequência.`;
    GM_setClipboard(mensagem);
    GM_setValue('ultimo_resultado', { cpf: f.cpf, proposta: nro, link, quando: new Date().toISOString() });
    log('Link: ' + link + '\nMensagem /n54n copiada — é só colar no Botmaker.', 'ok');
  }

  // ---- Ações do painel
  p.addEventListener('click', async e => {
    const a = e.target.dataset.a; if (!a) return;
    try {
      if (a === 'Carregar ficha') {
        const f = GM_getValue('ficha_atual');
        if (!f) return log('Nenhuma ficha salva no Multicorban.', 'erro');
        ta.value = fichaParaTexto(f);
        if (f.banco_destino && f.banco_destino.toLowerCase() !== pagina) log(`Ficha é para ${f.banco_destino}, mas esta tela é ${pagina.toUpperCase()}.`, 'erro');
        else log('Ficha carregada: ' + (f.nome || f.cpf));
      }
      if (a === 'Digitar') {
        const f = textoParaFicha(ta.value);
        if (!so(f.cpf) || !so(f.beneficio) || !num(f.parcela)) return log('Ficha precisa de cpf, beneficio e parcela.', 'erro');
        if (['NAO', 'HUMANO'].includes((f.banco_destino || '').toUpperCase())) return log('Ficha marcada como ' + f.banco_destino + '. Não digitar.', 'erro');
        e.target.disabled = true;
        await autoComplete(f);
        await simular(f);
        await dadosPessoais(f);
        await dadosBancarios(f);
        ta.dataset.ficha = JSON.stringify(f);
        log(`Pronto (liberado R$ ${f._liberado || '?'}). CONFIRA a tela e clique "Gravar".`, 'ok');
        e.target.disabled = false;
      }
      if (a === 'Gravar') {
        const f = ta.dataset.ficha ? JSON.parse(ta.dataset.ficha) : textoParaFicha(ta.value);
        e.target.disabled = true;
        await gravarELink(f);
        e.target.disabled = false;
      }
      if (a === 'Copiar mensagem') {
        if (!mensagem) return log('Ainda não há mensagem (grave primeiro).', 'erro');
        GM_setClipboard(mensagem); log('Mensagem copiada.', 'ok');
      }
    } catch (err) {
      log(err.message, 'erro');
      p.querySelectorAll('button').forEach(b => (b.disabled = false));
    }
  });
})();
