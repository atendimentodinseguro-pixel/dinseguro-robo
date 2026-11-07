// Dinseguro - código principal do robô (carregado pelo dinseguro.user.js). Versão: 3.23


(function () {
  'use strict';

  const VERSAO = '3.23';
  // carimbo para saber, de fora do robô, qual versão está realmente rodando em cada aba
  try {
    const m = JSON.parse(localStorage.getItem('dins_versao') || '{}');
    m[location.host] = { v: VERSAO, t: Date.now() };
    localStorage.setItem('dins_versao', JSON.stringify(m));
  } catch (e) {}

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
  // v3.10: agência válida = 4 dígitos (ou 4 + dígito); fora disso está errada → 0001. Banco do cliente sempre que existir.
  const agOk = a => { const d = so(a); return d.length === 4 ? d : d.length === 3 ? '0' + d : d.length === 5 ? d.slice(0, 4) : '0001'; };   // v3.14: 3 dígitos → zero na frente
  const bancoOk = b => { const d = so(b); return d && !/^0+$/.test(d) ? d.padStart(3, '0') : ''; };
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
    // regra de 04/11/2026: demais espécies → BMG; invalidez NUNCA no BMG: até 57 → C6, 58–59 → QUALI (humano), 60–73 → FACTA
    let banco = 'BMG';
    if (INVALIDEZ.includes(esp)) {
      if (idade >= 60) banco = 'FACTA';
      else if (idade >= 58) return { banco: 'HUMANO', motivo: 'Invalidez 58–59 anos: vai para QUALI (fora deste script).' };
      else banco = 'C6';
    }
    if (liberadoEst < 6000 && !INVALIDEZ.includes(esp)) banco = 'BMG';   // abaixo de R$ 6 mil → BMG (só não-invalidez)
    return { banco, motivo: `Liberado estimado R$ ${brl(liberadoEst)}${INVALIDEZ.includes(esp) ? ' · invalidez' : ''}` };
  }

  // Ficha em texto (chave: valor) <-> objeto
  const CAMPOS = ['recusa', 'banco_destino', 'nome', 'cpf', 'beneficio', 'especie', 'idade', 'ddb', 'parcela', 'prazo', 'telefone', 'email',
    'nascimento', 'mae', 'sexo', 'renda', 'uf', 'cep', 'endereco', 'numero', 'bairro', 'cidade', 'banco', 'agencia', 'conta', 'tipo_conta',
    // campos de ANALISE: nao vao para a digitacao, servem para decidir se atendemos
    'margem', 'rmc', 'rcc', 'rg', 'situacao', 'pensao', 'representante', 'rep_dados', 'conta_origem', 'conta_sugerida'];
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
        // ícone de enviada (check/done_all) aparece tanto para o bot quanto para atendente: só pula o ícone
        if (/^(check|done_all|done|schedule)$/.test(linhas[i] || '')) { i++; }
        if (/^\d{1,3}$/.test(linhas[i] || '')) { naoLidas = +linhas[i]; i++; }
        if (linhas[i] && !/^(\d{1,2}:\d{2}|\d+\s*[smhd]|ontem|\d{1,2}\/\d{1,2})/i.test(linhas[i])) msg = linhas[i];
        // regra da Stefany: mensagem de ATENDENTE vem com o nome em cima ([Dinseguro], [Rômulo Lima], Stefany…);
        // mensagem SEM nome é do bot → o cliente ainda não foi atendido por ninguém.
        if (/^\[[^\]]{2,40}\]/.test(msg)) nossa = true;
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
        // Chat com atendente humano: também entra na fila quando o cliente está esperando (mandou mensagem e
        // ninguém respondeu) ou quando o atendente só disse que vai verificar/analisar. O vigia decide pelo
        // conteúdo: CPF/simulação/link ele faz; dúvida ou assunto fora do roteiro fica com o humano.
        const humano = !!x.chip && !/credsegurobank|Dinseguro|Bot desligado/i.test(x.chip);
        const handoff = /atendente humano|Aguarde um momento|Estou analisando suas informa|Assim que concluir irei avisar|Para agilizar o seu atendimento|pedimos por gentileza que nos envie/i.test(x.msg);
        const nosso = /Dinseguro|Bot desligado/i.test(x.chip);
        const verificando = x.nossa && /verific|analis|consult|um momento|aguard|j[áa] volto/i.test(x.msg);
        // v3.8: chat ainda com o bot (credsegurobank) mas o cliente escreveu e ficou sem resposta por 90s → o bot
        // não vai responder (já passou o fluxo) → está esperando atendente
        const pend = ler('dins_pend', {});
        const semResposta = !x.nossa && x.naoLidas > 0;
        if (semResposta) { if (!pend[x.id] || pend[x.id].sig !== x.msg.slice(0, 60)) pend[x.id] = { t: Date.now(), sig: x.msg.slice(0, 60) }; } else delete pend[x.id];
        gravar('dins_pend', pend);
        const parado = semResposta && Date.now() - pend[x.id].t > 90000;
        const esperando = humano ? ((!x.nossa && x.naoLidas > 0) || verificando)
                                 : (!x.nossa && (handoff || parado || (nosso && (x.naoLidas > 0 || /Bot desligado/i.test(x.chip)))));
        if (!esperando) continue;
        const velho = antiga.find(f => f.id === x.id);
        fila.push({ id: x.id, nome: x.nome, msg: x.msg.slice(0, 80), sig, humano: humano ? x.chip : '', quando: velho ? velho.quando : new Date().toISOString() });
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
  // ================================================================ DESFECHO (patches 3.19 + 3.21)
  // O Claude tria e consulta; este robô só executa a ordem já decidida:
  // resposta rápida (ou texto livre) + tag + nota + fechar conversa.
  // Ordem em localStorage.dins_ordem, resultado em localStorage.dins_ordem_status.
  const DESFECHOS = {
    sem_margem:       { atalho: '/n30', tags: ['01 I - INSS Sem margem 2026'], fechar: true },
    sem_margem_k:     { atalho: '/n30', tags: ['01 k SEM Margem Nao Rodar Whats'], fechar: true },
    loas_sem:         { atalho: '/n30', tags: ['02 I - LOAS Sem margem 2026'], fechar: true },
    loas_com:         { atalho: '/n30', tags: ['02 A - Loas Sem Rep Com Margem'], fechar: true, editar: true },
    especie_fora:     { atalho: '/07',  tags: ['07 - Nao Identificado'], fechar: true },
    sem_cpf:          { atalho: '/n23', tags: ['01 C - Inss Nao Informou CPF - SEM 87 e 88'], fechar: false },
    com_margem:       { atalho: null,   tags: ['01 A - Inss Com Margem - SEM 87 E 88'], fechar: false },
    representante:    { atalho: '/inss13', tags: ['03 A - Loas Com Rep Com Margem'], fechar: true },
    representante_sm: { atalho: '/inss13', tags: ['03 B - Loas Com Rep Sem Margem'], fechar: true },
    pensao:           { atalho: null,   tags: ['07 - Nao Identificado'], fechar: true,
                        texto: 'Infelizmente não atendemos benefício com pensão alimentícia. Agradecemos o seu contato!' },
    so_tag:           { atalho: null,   tags: [], fechar: false },
  };
  const TAG_Q15 = 'Q15 - tem margem para cartão';
  const EDICAO_LOAS = [
    [/não há margem disponível para liberar seu empréstimo/i,
     'não temos propostas disponíveis e por isso estamos encerrando este atendimento'],
    [/avisar assim que surgir margem de crédito/i, 'avisar assim que surgir uma nova oportunidade'],
  ];

  (function desfecho() {
    const esp = ms => new Promise(r => setTimeout(r, ms));
    const vis = e => !!e && e.offsetParent !== null;
    const txt = e => ((e && e.textContent) || '').replace(/\s+/g, ' ').trim();
    const setNativo = (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const clicar = el => ['mousedown', 'mouseup', 'click'].forEach(t =>
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, view: window })));
    async function ate(fn, ms = 15000, passo = 300) {
      const fim = Date.now() + ms;
      while (Date.now() < fim) { try { const r = fn(); if (r) return r; } catch (e) {} await esp(passo); }
      return null;
    }
    // ⚠️ erro 33: conferir tag no texto da PÁGINA dá falso positivo (o nome está na lista aberta).
    // A área das tags vai do rótulo "Tags" até "Variáveis".
    function areaTags() {
      const T = document.body.innerText;
      const i = T.indexOf('Tags'); if (i < 0) return '';
      const j = T.indexOf('Variáveis');
      return T.slice(i, j > i ? j : i + 400);
    }
    async function fecharMenus() {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const bd = document.querySelector('.cdk-overlay-backdrop,.MuiBackdrop-root');
      if (bd) clicar(bd);
      await esp(1500);
    }

    // 1. abrir o chat certo  ⚠️ o hash fica na janela de CIMA
    async function abrir(hash) {
      const alvo = '#/chats/' + hash.replace(/^#\/chats\//, '');
      if (window.top.location.hash !== alvo) { window.top.location.hash = alvo; await esp(4000); }
      const ok = await ate(() => window.top.location.hash === alvo && document.querySelector('.entries'), 15000);
      if (!ok) throw new Error('não consegui abrir o chat ' + hash);
      if (/Chat em atendimento com/.test(document.body.innerText))
        throw new Error('chat bloqueado por atendente — liberar no ⋮ antes');
    }

    // 2. resposta rápida
    async function respostaRapida(atalho, editar) {
      const ta = await ate(() => document.querySelector('textarea'));
      if (!ta) throw new Error('caixa de mensagem não encontrada');
      ta.focus(); setNativo(ta, atalho);
      await esp(2500);
      const linha = await ate(() => [...document.querySelectorAll('tr,li,div')]
        .filter(vis).find(x => x.children.length < 8 && new RegExp('^\\' + atalho + '\\b').test(txt(x))), 10000);
      if (!linha) throw new Error('resposta rápida ' + atalho + ' não apareceu');
      clicar(linha);
      const cheio = await ate(() => document.querySelector('textarea').value.length > 40, 10000);
      if (!cheio) throw new Error('a resposta rápida não entrou na caixa');
      if (editar) {
        const ta2 = document.querySelector('textarea');
        let v = ta2.value; EDICAO_LOAS.forEach(([de, para]) => { v = v.replace(de, para); });
        ta2.focus(); setNativo(ta2, v); await esp(600);
      }
      const trecho = document.querySelector('textarea').value
        .replace(/[*_]/g, '').split('\n').find(l => l.trim().length > 20) || '';
      clicar(await ate(() => document.querySelector('button.send-button-component')));
      await esp(4000);
      const chegou = document.querySelector('.entries').innerText.slice(-4000)
        .replace(/[*_]/g, '').includes(trecho.trim().slice(0, 30));
      if (!chegou) throw new Error('mandei mas a mensagem não apareceu no chat (chat bloqueado?)');
      return trecho.trim().slice(0, 40);
    }

    // 2b. texto escrito, sem atalho (pensão alimentícia)
    async function mensagemLivre(texto) {
      const ta = await ate(() => document.querySelector('textarea'));
      if (!ta) throw new Error('caixa de mensagem não encontrada');
      ta.focus(); setNativo(ta, texto); await esp(800);
      clicar(await ate(() => document.querySelector('button.send-button-component')));
      await esp(4000);
      const chegou = document.querySelector('.entries').innerText.slice(-4000)
        .replace(/[*_]/g, '').includes(texto.replace(/[*_]/g, '').slice(0, 30));
      if (!chegou) throw new Error('mandei mas a mensagem não apareceu no chat (chat bloqueado?)');
      return texto.slice(0, 40);
    }

    // o botão "+" ao lado de um rótulo do painel direito (Tags, Notas)
    function maisDe(rotuloRe) {
      const rot = [...document.querySelectorAll('*')]
        .filter(e => e.children.length === 0 && rotuloRe.test(txt(e)))[0];
      if (!rot) return null;
      let cx = rot, mais = null;
      for (let k = 0; k < 5 && cx && !mais; k++) {
        cx = cx.parentElement;
        mais = cx && [...cx.querySelectorAll('*')].find(x => x.children.length === 0 && /add_circle/.test(txt(x)));
      }
      return mais;
    }

    // 3. tag (a caixa de busca tem id "addtag")
    async function addTag(nome) {
      if (new RegExp(nome.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(areaTags())) return nome + ' (já tinha)';
      const mais = maisDe(/^Tags$/);
      if (!mais) throw new Error('botão + das Tags não encontrado');
      clicar(mais);
      const campo = await ate(() => document.getElementById('addtag'), 10000);
      if (!campo) throw new Error('caixa de tag não abriu');
      campo.focus(); setNativo(campo, nome.slice(0, 11));
      const op = await ate(() => [...document.querySelectorAll('li,[role=option]')]
        .filter(vis).find(o => txt(o) === nome), 10000);
      if (!op) {
        const ops = [...document.querySelectorAll('li,[role=option]')].filter(vis).map(txt).slice(0, 8).join(' / ');
        await fecharMenus();
        throw new Error('tag "' + nome + '" não apareceu na lista. Tem: ' + ops);
      }
      clicar(op); await esp(1500);
      const add = await ate(() => [...document.querySelectorAll('button')]
        .filter(vis).find(b => /^Adicionar$/i.test(txt(b)) && !b.disabled), 8000);
      if (!add) throw new Error('botão Adicionar da tag não ficou disponível');
      clicar(add); await esp(3000);
      await fecharMenus();
      if (!new RegExp(nome.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(areaTags()))
        throw new Error('a tag "' + nome + '" NÃO entrou (conferido na área das tags)');
      return nome;
    }

    // 4. nota permanente
    async function addNota(texto) {
      const mais = maisDe(/^Notas$/);
      if (!mais) throw new Error('botão + das Notas não encontrado');
      clicar(mais);
      const principal = document.querySelector('textarea');
      const cxTexto = await ate(() => [...document.querySelectorAll('textarea')]
        .filter(vis).find(t => t !== principal), 10000);
      if (!cxTexto) throw new Error('caixa da nota não abriu');
      cxTexto.focus(); setNativo(cxTexto, texto); await esp(800);
      const perm = [...document.querySelectorAll('input[type=checkbox]')].filter(vis)
        .find(c => /Permanente/i.test(txt(c.closest('label,div')) || ''));
      if (perm && !perm.checked) clicar(perm);
      const criar = await ate(() => [...document.querySelectorAll('button')]
        .filter(vis).find(b => /^Criar$/i.test(txt(b))), 8000);
      if (!criar) throw new Error('botão Criar da nota não encontrado');
      clicar(criar); await esp(2500);
      return 'nota criada';
    }

    // 5. fechar a conversa: ícone "stop" no topo -> escolher o tipo -> Confirmar
    async function fecharConversa() {
      const ic = [...document.querySelectorAll('*')].filter(vis)
        .find(e => e.children.length === 0 && txt(e) === 'stop' && e.getBoundingClientRect().top < 140);
      if (!ic) throw new Error('ícone de fechar conversa (stop) não encontrado');
      clicar(ic.closest('button') || ic);
      const lista = await ate(() => [...document.querySelectorAll('[role=combobox],.MuiSelect-select,input')]
        .filter(vis).find(x => /Selecionar tipo de conversa/i.test(txt(x) || x.placeholder || '')), 10000);
      if (lista) {
        clicar(lista); await esp(1500);
        const op = await ate(() => [...document.querySelectorAll('li,[role=option]')]
          .filter(vis).find(o => /^Fechar Conversa$/i.test(txt(o))), 8000);
        if (!op) throw new Error('tipo de conversa "Fechar Conversa" não apareceu');
        clicar(op); await esp(1200);
      }
      const conf = await ate(() => [...document.querySelectorAll('button')]
        .filter(vis).find(b => /^Confirmar$/i.test(txt(b)) && !b.disabled), 8000);
      if (!conf) throw new Error('botão Confirmar não ficou disponível (faltou escolher o tipo?)');
      clicar(conf); await esp(3000);
      return 'fechada';
    }

    // 6. limpar o filtro da lista (senão a triagem não vê clientes novos)
    function limparFiltro() {
      const chip = [...document.querySelectorAll('*')].filter(vis)
        .find(e => /^Usuários com o texto/i.test(txt(e)) && txt(e).length < 60);
      if (chip) { const x = chip.querySelector('svg,button') || chip.nextElementSibling; if (x) clicar(x); }
    }

    // de `recusa` (ficha do Multicorban) para a ação da tabela
    window.dinsAcaoDaRecusa = recusa => {
      const s = String(recusa || ''), m = s.split('|')[0];
      if (m === 'PENSAO') return 'pensao';
      if (m === 'REPRESENTANTE') return /03 B/.test(s) ? 'representante_sm' : 'representante';
      if (m === 'SEM_MARGEM') return 'sem_margem';
      return '';
    };

    // laço: a cada 3s procura uma ordem nova
    let rodando = false, ultima = '';
    async function olharOrdem() {
      if (rodando) return;
      let o; try { o = JSON.parse(localStorage.getItem('dins_ordem') || 'null'); } catch (e) { return; }
      if (!o || !o.hash || !o.acao) return;
      const id = o.hash + '|' + o.acao + '|' + (o.t || '');
      if (id === ultima) return;
      const d = DESFECHOS[o.acao];
      if (!d) { localStorage.setItem('dins_ordem_status', JSON.stringify({ st: 'erro', erro: 'ação desconhecida: ' + o.acao })); ultima = id; return; }
      rodando = true; ultima = id;
      const passos = [];
      const grava = (st, extra) => localStorage.setItem('dins_ordem_status',
        JSON.stringify(Object.assign({ st, hash: o.hash, acao: o.acao, passos, t: Date.now() }, extra || {})));
      grava('rodando');
      try {
        await abrir(o.hash);                               passos.push('abriu');
        if (d.atalho) { passos.push('msg:' + await respostaRapida(d.atalho, d.editar)); }
        else if (o.texto || d.texto) { passos.push('msg:' + await mensagemLivre(o.texto || d.texto)); }
        const tags = (o.tags && o.tags.length ? o.tags : d.tags).slice();
        if (o.q15 && /^(sem_margem|sem_margem_k)$/.test(o.acao)) tags.push(TAG_Q15);
        for (const t of tags) { passos.push('tag:' + await addTag(t)); }
        if (o.nota) { passos.push(await addNota(o.nota)); }
        if (d.fechar) { passos.push(await fecharConversa()); limparFiltro(); }
        grava('ok');
        log && log('Desfecho ' + o.acao + ' concluído: ' + passos.join(' · '), 'ok');
      } catch (e) {
        grava('erro', { erro: e.message });
        log && log('Desfecho PAROU: ' + e.message, 'erro');
      } finally { rodando = false; }
    }
    setInterval(olharOrdem, 3000);
  })();

    setInterval(vigiar, 30000);
    setTimeout(vigiar, 4000);
    return;
  }

  // ================================================================== DAYCOVAL (Portal do Correspondente)
  // Fluxo: Simulação de Ofertas → Cadastrar → Dados Cadastrais → Dados Complementares → Resumo → Gerar → Formalizar → link.
  // Usa a ficha salva no Multicorban ("Salvar ficha"). Não recarregue a página: o portal perde o login no F5.
  if (location.host === 'portaldecredito.daycoval.com.br') {
    if (window.top !== window) return;
    const tx = e => (e && e.textContent || '').replace(/\s+/g, ' ').trim();
    const vis = e => !!e && e.getBoundingClientRect().width > 0;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const PENSAO = ['01', '02', '03', '19', '20', '21', '22', '23', '24', '26', '27', '28', '29', '54', '55', '56', '59', '93'];
    const AGENTE = /JADY/i;

    async function esperar(fn, ms = 20000, passo = 300) {
      const fim = Date.now() + ms;
      while (Date.now() < fim) { try { const r = fn(); if (r) return r; } catch (e) {} await sleep(passo); }
      return null;
    }
    // digita como teclado (o portal só aceita assim em alguns campos)
    async function digitar(inp, txt) {
      if (!inp) throw new Error('Campo não encontrado para digitar ' + txt);
      inp.focus(); setter.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true }));
      for (const ch of String(txt)) {
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        setter.call(inp, inp.value + ch);
        inp.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
        inp.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
      }
      inp.dispatchEvent(new Event('change', { bubbles: true })); inp.dispatchEvent(new Event('blur', { bubbles: true }));
      await sleep(250);
    }
    // caixa (mat-form-field) pelo rótulo, opcionalmente dentro de uma seção
    function caixa(re, raiz = document) {
      return [...raiz.querySelectorAll('mat-form-field')].find(f => vis(f) && re.test(tx(f.querySelector('label')).replace(/\*/g, '').trim()));
    }
    const entrada = (re, raiz) => { const c = caixa(re, raiz); return c && c.querySelector('input'); };
    const lista = (re, raiz) => { const c = caixa(re, raiz); return c && c.querySelector('mat-select'); };
    const valorSel = sel => tx(sel && sel.querySelector('.mat-mdc-select-value-text, .mat-mdc-select-min-line'));
    async function fecharLista() {
      const bd = document.querySelector('.cdk-overlay-backdrop'); if (bd) bd.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(500);
    }
    async function escolher(sel, re, busca) {
      if (!sel) throw new Error('Lista não encontrada: ' + re);
      const atual = valorSel(sel);
      if (atual && re.test(atual)) return atual;
      await fecharLista();
      sel.click(); await sleep(800);
      // só as opções da lista que abriu agora (o portal deixa opções de outras listas no DOM)
      const id = sel.getAttribute('aria-controls');
      const pane = await esperar(() => (id && document.getElementById(id)) || [...document.querySelectorAll('.cdk-overlay-pane')].filter(x => x.querySelector('mat-option')).pop(), 10000);
      if (!pane) throw new Error('Lista não abriu: ' + re);
      const s = busca && pane.closest('.cdk-overlay-pane') && pane.closest('.cdk-overlay-pane').querySelector('input');
      if (s) { await digitar(s, busca); await sleep(900); }
      const o = await esperar(() => [...pane.querySelectorAll('mat-option')].find(x => re.test(tx(x))), 8000);
      if (!o) { const ops = [...pane.querySelectorAll('mat-option')].map(tx).slice(0, 8).join(' / '); await fecharLista(); throw new Error('Opção não encontrada (' + re + '). Tem: ' + ops); }
      o.click(); await sleep(600); return tx(o);
    }
    const botaoTxt = (re, raiz = document) => [...raiz.querySelectorAll('button, a')].filter(vis).find(b => re.test(tx(b)));
    const clicar = async (re, raiz) => { const b = await esperar(() => botaoTxt(re, raiz), 15000); if (!b) throw new Error('Botão não encontrado: ' + re); b.click(); await sleep(800); return b; };
    function secao(re) {
      const t = [...document.querySelectorAll('.card-title, h5, h4')].find(e => vis(e) && re.test(tx(e)));   // cartões do formulário (o menu lateral tem os mesmos nomes)
      const card = t && t.closest('.card'); if (card && card.querySelector('mat-form-field')) return card;
      const h =[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,div,strong')].find(e => vis(e) && e.children.length === 0 && re.test(tx(e)));
      let e = h; while (e && !e.querySelector('mat-form-field')) e = e.parentElement; return e || document;
    }
    const alertas = () => [...document.querySelectorAll('.cdk-overlay-pane')].map(tx).filter(t => /Alerta|Erro|Sucesso|warning/i.test(t));
    async function fecharAlertas() {
      const t = alertas().join(' | ');
      [...document.querySelectorAll('.cdk-overlay-pane button')].filter(b => /OK, ENTENDI/i.test(tx(b))).forEach(b => b.click());
      await sleep(500); return t;
    }
    async function semErro(etapa) {
      await sleep(1200);
      const t = alertas().join(' | ');
      if (/Erro|Alerta|obrigat|inválid|não informado/i.test(t)) { await fecharAlertas(); throw new Error(etapa + ': ' + t.replace(/close|warning|cancel|×|OK, ENTENDI/g, '').trim()); }
    }
    const cent = v => so(v);  // "567,34" -> "56734"

    // ---- 1. Simulação
    async function simular(f) {
      if (!/simulacao-ofertas\/simulacao/.test(location.pathname)) {
        const a = document.querySelector('a[href*="simulacao-ofertas/simulacao"]'); if (!a) throw new Error('Menu Simulação de Ofertas não achado (está logado?)');
        a.click(); await sleep(2500);
      }
      const cpf = await esperar(() => document.querySelector('input[formcontrolname=cpf]'));
      if (so(cpf.value) !== f.cpf) { await digitar(cpf, f.cpf); const pr = botaoTxt(/^PRÓXIMO$/); if (pr) pr.click(); }
      await esperar(() => document.querySelector('input[formcontrolname=nome]'));
      await sleep(1500);
      const nome = document.querySelector('input[formcontrolname=nome]');
      if (!nome.value) await digitar(nome, f.nome);
      const nasc = document.querySelector('input[formcontrolname=dataNascimento]');
      if (nasc && !so(nasc.value)) { if (!f.nascimento) throw new Error('Falta data de nascimento na ficha'); await digitar(nasc, so(f.nascimento)); }
      const cel = document.querySelector('input[formcontrolname=nroTelefoneCelular]');
      if (cel && so(cel.value).length < 10) { const t = so(f.telefone).replace(/^55(?=\d{10,11}$)/, ''); if (t.length < 10) throw new Error('Falta telefone (celular) na ficha'); await digitar(cel, t); }
      log('Dados do cliente ok.');
      const achaCard = () => [...document.querySelectorAll('a')].find(a => vis(a) && new RegExp('Matr[íi]cula ' + f.beneficio).test(tx(a)));
      if (!achaCard()) {
        await clicar(/Adicionar Matr[íi]cula/);
        await esperar(() => document.querySelector('input[formcontrolname=matricula]'));
        await escolher(lista(/^Empregador/), /^INSS$/, 'INSS');
        await digitar(document.querySelector('input[formcontrolname=matricula]'), f.beneficio);
        await digitar(document.querySelector('input[formcontrolname=vlrRendaLiquida]'), cent(f.renda || '1621,00'));
        await clicar(/INCLUIR MATR[ÍI]CULA/);
        await semErro('Incluir matrícula');
      }
      const card = await esperar(achaCard, 15000); if (!card) throw new Error('Matrícula não apareceu');
      card.click(); await sleep(1500);
      // autorização de consulta do benefício (SMS ao cliente), como a Stefany faz
      if (alertas().join() .match(/Consulta dados do benef/i) || botaoTxt(/OK, ENVIAR/)) {
        const env = botaoTxt(/OK, ENVIAR/); if (env) { env.click(); await sleep(2500); await fecharAlertas(); log('SMS de autorização enviado ao cliente.'); }
        const c2 = achaCard(); if (c2) { c2.click(); await sleep(1500); }
        if (botaoTxt(/OK, ENVIAR/)) { const cc = botaoTxt(/CANCELAR/); if (cc) cc.click(); await sleep(800); }
      }
      await esperar(() => /Produtos Dispon[íi]veis/.test(document.body.innerText), 20000);
      let p = document.getElementById('margemconsignado');
      if (!vis(p)) {
        const h = [...document.querySelectorAll('div,span,h5,h6,button')].find(e => vis(e) && e.children.length < 4 && /^Empréstimo Consignado$/.test(tx(e)));
        if (h) h.click(); p = await esperar(() => { const x = document.getElementById('margemconsignado'); return vis(x) && x; }, 10000);
      }
      if (!p) throw new Error('Painel Empréstimo Consignado/Margem não abriu');
      const s = p.querySelectorAll('mat-select');
      const esp = String(f.especie || '').padStart(2, '0');
      const orgao = (esp === '87' || esp === '88') ? /LOAS/ : PENSAO.includes(esp) ? /PENSIONISTA/ : /APOSENTADO/;
      await escolher(s[1], orgao);
      await escolher(s[2], new RegExp('^' + (f.prazo || '108') + '$'));
      await digitar(p.querySelector('input[formcontrolname=valorParcela]'), cent(f.parcela));
      p.querySelectorAll('button')[0].click();   // ⟳ simular
      const res = await esperar(() => { const m = tx(p).match(/Valor ClienteR\$ ?([\d.,]+).{0,200}?Tabela ?(\d{4,}[^]{3,40}?) ?(?:Seguro|Editar)/); return m && m[1] !== '0,00' && m; }, 40000);
      await semErro('Simulação');
      if (!res) throw new Error('Simulação não retornou valor');
      f._liberado_daycoval = res[1]; f._tabela_daycoval = res[2].replace(/border_color.*/, '').trim();
      log(`Simulado: R$ ${res[1]} · ${f.prazo || 108}x R$ ${f.parcela} · ${f._tabela_daycoval}`, 'ok');
      await clicar(/^ADICIONAR OFERTA$/i);
      await clicar(/VER RESUMO DE OFERTAS/i);
      await sleep(1000);
      const irRes = botaoTxt(/IR PARA O RESUMO/i); if (irRes) { irRes.click(); await sleep(1500); }
      await clicar(/CADASTRAR PROPOSTA/i);
      await esperar(() => /Dados de Contato/.test(document.body.innerText), 30000);
      const n = (tx(document.body).match(/N° ?(\d{6,})/) || [])[1]; f._simulacao_daycoval = n;
      log('Cadastro aberto Nº ' + (n || '?'), 'ok');
    }

    // ---- 2. Dados Cadastrais
    async function cadastrais(f) {
      await sleep(1500);
      const email = entrada(/^Email$/); if (email && !email.value) await digitar(email, f.email || PADRAO.email);
      const nome = f.nome || ''; const sexo = f.sexo || (/A$/i.test(nome.split(' ')[0]) ? 'FEMININO' : 'MASCULINO');
      await escolher(lista(/^Sexo$/), new RegExp('^' + sexo + '$'));
      await escolher(lista(/^Estado Civil$/), /^SOLTEIRO$/);
      const mae = entrada(/^Nome M[ãa]e$/);
      if (mae && !mae.value) { if (!f.mae) throw new Error('Falta o nome da mãe na ficha (pegue no Auto-Complete do New Corban)'); await digitar(mae, f.mae); }
      await escolher(lista(/^Tipo DOC$/), /^RG/);
      const doc = entrada(/^Nº DOC$/); if (doc && !doc.value) await digitar(doc, f.cpf);
      const emi = entrada(/^Emissor$/); if (emi && !emi.value) await digitar(emi, 'SSP');
      const sc = secao(/^Dados do Cliente$/);
      if (f.uf) await escolher(lista(/^UF$/, sc), new RegExp('^' + f.uf + '$'), f.uf);
      const dem = entrada(/^Data Emiss[ãa]o$/); if (dem && !so(dem.value)) await digitar(dem, so(PADRAO.dt_emissao));
      // endereço
      const sr = secao(/^Dados Residenciais$/);
      const cep = entrada(/^CEP$/, sr);
      if (cep && !so(cep.value)) {
        if (!f.cep) throw new Error('Falta CEP na ficha');
        await digitar(cep, f.cep);
        const lupa = caixa(/^CEP$/, sr).querySelector('mat-icon, button, [class*=search]'); if (lupa) lupa.click();
        await esperar(() => (entrada(/^Endere[çc]o$/, sr) || {}).value, 10000);
      }
      const numero = entrada(/^Nº$/, sr); if (numero && !numero.value) await digitar(numero, '0');
      await clicar(/^PRÓXIMO$/);
      await semErro('Dados cadastrais');
      await esperar(() => /Natureza de Relacionamento/.test(document.body.innerText), 20000);
      log('Dados cadastrais ok.', 'ok');
    }

    // ---- 3. Dados Complementares
    function proximaConta() { const n = Math.max(GM_getValue('conta_seq', 14), 14); return { banco: '001', agencia: '0001', conta: String(n), dv: '8', seq: n }; }
    async function complementares(f) {
      await sleep(1500);
      const sb = secao(/^Dados Banc[áa]rios$/);
      const real = f.banco && so(f.conta).length >= 3 && f.banco !== '000';
      const c = real ? { banco: f.banco.padStart(3, '0'), agencia: agOk(f.agencia), conta: so(f.conta).slice(0, -1), dv: so(f.conta).slice(-1) } : { ...proximaConta(), banco: bancoOk(f.banco) || '001', agencia: agOk(f.agencia) };
      const jaTem = () => [...document.querySelectorAll('*')].some(e => e.children.length === 0 && new RegExp(c.conta + '/' + c.dv).test(tx(e)));
      if (!jaTem()) {
        await escolher(lista(/^Banco$/, sb), new RegExp('^' + c.banco + ' -'), c.banco);
        await digitar(entrada(/^Ag[êe]ncia$/, sb), c.agencia);
        const contas = [...sb.querySelectorAll('mat-form-field')].filter(vis);
        await digitar(entrada(/^Conta$/, sb), c.conta);
        const dvs = contas.filter(x => /^DV/.test(tx(x.querySelector('label')))); const dvConta = dvs[dvs.length - 1];
        await digitar(dvConta.querySelector('input'), c.dv);
        await clicar(/^INCLUIR$/, sb);
        await sleep(1200);
        if (/outro CPF/i.test(alertas().join())) { await fecharAlertas(); if (real) throw new Error('A conta do cliente (' + c.banco + ' ' + c.conta + '-' + c.dv + ') está cadastrada para outro CPF no Daycoval.'); GM_setValue('conta_seq', c.seq + 1); throw new Error('Conta já usada em outro CPF (' + c.conta + '-' + c.dv + ').'); }
        await semErro('Incluir conta');
        log(`Conta incluída: ${c.banco} ag ${c.agencia} cc ${c.conta}-${c.dv}${real ? '' : ' (aleatória da sequência)'}`);
      }
      const re = new RegExp(c.conta + '/' + c.dv);
      const sbn = secao(/^Dados do Benef[íi]cio$/);
      if (f.uf) await escolher(lista(/^UF Do Benef[íi]cio$/, sbn), new RegExp('^' + f.uf + '$'), f.uf);
      const esp = String(f.especie || '').padStart(2, '0');
      await escolher(lista(/^Tipo de Benef/, sbn), new RegExp('^' + esp + ' -'), esp + ' -');
      await escolher(lista(/^Dados Banc[áa]rios$/, sbn), re);
      // liberação (tabela): meio, conta, tipo
      const lib = secao(/^Dados de Libera[çc][ãa]o$/);
      const sels = [...lib.querySelectorAll('mat-select')].filter(vis);
      await esperar(() => valorSel(sels[0]), 5000);
      if (!/PIX/.test(valorSel(sels[0]))) { try { await escolher(sels[0], /PIX/); } catch (e) { if (!/TED/.test(valorSel(sels[0]))) await escolher(sels[0], /TED/); } }
      await escolher(sels[1], re);
      await escolher(sels[2], /CONTA CORRENTE INDIVIDUAL/);
      // vendedor
      const sv = secao(/^Dados do Vendedor$/);
      await escolher(lista(/^Agente$/, sv), AGENTE);
      const v = lista(/^Vendedor$/, sv); if (v && !valorSel(v)) await escolher(v, /\d/);
      const cm = lista(/^Comercial$/, sv); if (cm && !valorSel(cm)) await escolher(cm, /\d/);
      await clicar(/^PRÓXIMO$/);
      await sleep(1500);
      const al = alertas().join(' | ');
      if (/j[áa] cadastrado para outro CPF/i.test(al)) {
        await fecharAlertas();
        if (real) throw new Error('A conta do cliente está cadastrada para outro CPF no Daycoval.');
        GM_setValue('conta_seq', c.seq + 1);
        throw new Error('Conta já usada em outro CPF. Avancei a sequência.');
      }
      await semErro('Dados complementares');
      await esperar(() => /GERAR PROPOSTAS/.test(document.body.innerText), 20000);
      if (!real) GM_setValue('conta_seq', c.seq + 1);
      log('Dados complementares ok. Resumo pronto.', 'ok');
    }

    // ---- 4. Gerar, formalizar e pegar o link
    async function gerarELink(f) {
      await clicar(/^GERAR PROPOSTAS$/);
      await esperar(() => /cadastradas com sucesso|Link enviado/i.test(document.body.innerText + alertas().join()), 60000);
      await semErro('Gerar propostas').catch(e => { if (!/Sucesso/i.test(e.message)) throw e; });
      await fecharAlertas();
      const nro = (tx(document.body).match(/N[ºo°]? ?Proposta.{0,40}?(\d{8,10})/) || tx(document.body).match(/\b(8\d{8})\b/) || [])[1] || ('simulação ' + ((tx(document.body).match(/N° ?(\d{6,})/) || [])[1] || ''));
      await clicar(/FORMALIZAR PROPOSTAS/i);
      await esperar(() => /Formaliza[çc][ãa]o Digital/.test(document.body.innerText), 30000);
      let copiado = '';
      const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;   // o portal copia no contexto da página
      try { const cb = W.navigator.clipboard; const orig = cb.writeText.bind(cb); cb.writeText = t => { copiado = String(t); try { return orig(t); } catch (e) { return Promise.resolve(); } }; } catch (e) {}
      try { const ex = W.document.execCommand.bind(W.document); W.document.execCommand = (c, ...r) => { if (/copy/i.test(c)) { const sel = W.getSelection && String(W.getSelection()); const ta = W.document.activeElement; copiado = copiado || (ta && ta.value) || sel || ''; } return ex(c, ...r); }; } catch (e) {}
      // ícone de link à direita de "LINK DE FORMALIZAÇÃO" (img.icon-link); a tela demora a carregar
      const icone = await esperar(() => { const im = [...document.querySelectorAll('img.icon-link, img[class*=link]')].filter(vis).pop(); if (im) return im.closest('button,a') || im; const mi = [...document.querySelectorAll('mat-icon')].filter(e => vis(e) && /^link$/i.test(tx(e))).pop(); return mi && (mi.closest('button,a') || mi); }, 60000, 500);
      if (!icone) throw new Error('Ícone de link não encontrado');
      await sleep(1000); icone.click(); await sleep(2500);
      await fecharAlertas();
      if (!/^https?:/.test(copiado)) { const m = tx(document.body).match(/https?:\/\/dcy\.app\/\w+/); if (m) copiado = m[0]; }
      if (!/^https?:/.test(copiado)) { try { copiado = await navigator.clipboard.readText(); } catch (e) {} }
      if (!/^https?:\/\//.test(copiado || '')) throw new Error('Não consegui ler o link copiado');
      const r = { cpf: f.cpf, nome: f.nome, proposta: nro, link: copiado, liberado: f._liberado_daycoval || '', parcela: f.parcela, prazo: f.prazo || '108', banco: 'DAYCOVAL', quando: new Date().toISOString() };
      GM_setValue('daycoval_resultado', r);
      try { localStorage.setItem('dins_daycoval_res', JSON.stringify(r)); } catch (e) {}
      log(`PROPOSTA ${nro} · LINK ${copiado}`, 'ok');
      document.getElementById('dins-res').value = `Proposta Daycoval ${nro}\nLiberado R$ ${r.liberado} · ${r.prazo}x R$ ${r.parcela}\nLink: ${copiado}`;
      return r;
    }

    // ---- painel
    const p = painel('Digitação DAYCOVAL');
    p.querySelector('#dins-corpo').innerHTML =
      botao('Carregar ficha', '#475569') + botao('Fazer tudo', '#7c3aed') + botao('Digitar Daycoval', '#2563eb') + botao('Gerar e pegar link', '#16a34a') +
      `<div style="margin-top:6px;color:#94a3b8;font-size:12px">Conta aleatória: próxima 001/0001/<span id="dins-seq"></span>-8</div>` +
      `<textarea id="dins-res" readonly style="width:100%;height:70px;margin-top:6px;font:12px monospace;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px"></textarea>`;
    p.querySelector('#dins-seq').textContent = Math.max(GM_getValue('conta_seq', 11), 11);
    let rodando = false;
    p.addEventListener('click', async e => {
      const a = e.target.dataset.a; if (!a || rodando) return;
      const f = GM_getValue('ficha_atual');
      if (!f || !f.cpf) { log('Nenhuma ficha salva. No Multicorban: Gerar ficha → Salvar ficha.', 'erro'); return; }
      if (a === 'Carregar ficha') { log(`${f.nome} · CPF ${f.cpf} · benef ${f.beneficio} (esp ${f.especie}) · parcela ${f.parcela} · ${f.uf || '?'} · mãe ${f.mae || '—'}`); return; }
      if (f.recusa) { log('Ficha marcada como RECUSA (' + f.recusa.split('|')[0] + '). NÃO digitar.', 'erro'); return; }
      rodando = true;
      const status = (st, extra) => { try { localStorage.setItem('dins_daycoval_status', JSON.stringify(Object.assign({ st, cpf: f.cpf, nome: f.nome, t: Date.now() }, extra || {}))); } catch (e) {} };
      status('rodando');
      try {
        if (a === 'Digitar Daycoval' || a === 'Fazer tudo') {
          const pg = location.pathname;
          if (/dados-cliente/.test(pg)) await cadastrais(f);
          else if (!/dados-complementares|resumo|formalizacao/.test(pg)) { await simular(f); await cadastrais(f); }
          if (!/resumo|formalizacao/.test(location.pathname) || /dados-complementares/.test(location.pathname)) {
            for (let i = 0; ; i++) {      // conta aleatória já usada em outro CPF → próxima da sequência, até 6 tentativas
              try { await complementares(f); break; }
              catch (err) { if (!/já usada em outro CPF/.test(err.message) || i >= 5) throw err; log('Conta já usada; tentando a próxima da sequência…'); await sleep(1000); }
            }
          }
          GM_setValue('ficha_atual', f);
          if (a === 'Digitar Daycoval') log('Pronto para gerar. Confira o Resumo e clique "Gerar e pegar link".', 'ok');
        }
        if (a === 'Gerar e pegar link' || a === 'Fazer tudo') { const r = await gerarELink(f); status('ok', r); }
        else status('pronto_para_gerar', { liberado: f._liberado_daycoval || '' });
      } catch (err) { log('PAROU: ' + err.message, 'erro'); status('erro', { erro: err.message }); }
      finally { rodando = false; p.querySelector('#dins-seq').textContent = Math.max(GM_getValue('conta_seq', 11), 11); }
    });
    return;
  }

  // ================================================================== BMG (ConsigMais / Nova plataforma)
  // Fluxo: Identificação → Benefício → Ofertas (Empréstimo Consignado) → Simular por parcela → Dados → Resumo → Gerar proposta → Link.
  // Abrir pelo BMG Consig (menu "Nova plataforma"). Regras: documento = CPF; órgão SSP; UF/estado/cidade de nascimento = endereço;
  // solteiro; grau de instrução Não declarado; número 0; Transferência Bancária, Conta Corrente.
  if (location.host === 'consigmais.bancobmg.com.br') {
    if (window.top !== window) return;
    const tx = e => (e && e.textContent || '').replace(/\s+/g, ' ').trim();
    const vis = e => !!e && e.getBoundingClientRect().width > 0;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    async function esperar(fn, ms = 20000, passo = 300) {
      const fim = Date.now() + ms;
      while (Date.now() < fim) { try { const r = fn(); if (r) return r; } catch (e) {} await sleep(passo); }
      return null;
    }
    // campo pelo rótulo (aria-label das listas ou <label> acima do campo)
    function campo(re) {
      return [...document.querySelectorAll('input')].filter(vis).find(i => {
        if (re.test((i.getAttribute('aria-label') || '').replace('*', '').trim())) return true;
        let p = i; for (let k = 0; k < 5 && p; k++) { p = p.parentElement; const l = p && p.querySelector('label, span[id^=label]'); if (l) return re.test(tx(l).replace('*', '').trim()); }
        return false;
      });
    }
    async function digitar(i, t) {
      if (!i) throw new Error('Campo não encontrado para ' + t);
      i.focus(); setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true }));
      for (const ch of String(t)) { setter.call(i, i.value + ch); i.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' })); }
      i.dispatchEvent(new Event('change', { bubbles: true })); i.dispatchEvent(new Event('blur', { bubbles: true }));
      await sleep(300);
    }
    async function preencher(re, valor) { const i = await esperar(() => campo(re), 10000); if (!i) throw new Error('Campo não achado: ' + re); if (!i.value) await digitar(i, valor); return i; }
    async function combo(re, busca, opRe) {
      const i = await esperar(() => { const c = campo(re); return c && !c.disabled && c; }, 15000);
      if (!i) throw new Error('Lista não achada: ' + re);
      if (i.value && opRe.test(i.value)) return i.value;
      i.click(); i.focus(); await digitar(i, busca);
      const lb = () => document.getElementById(i.getAttribute('aria-controls')) || document;
      const o = await esperar(() => [...lb().querySelectorAll('[role=option]')].find(x => opRe.test(tx(x))), 8000);
      if (!o) throw new Error('Opção ' + opRe + ' não encontrada em ' + re + '. Tem: ' + [...lb().querySelectorAll('[role=option]')].map(tx).slice(0, 5).join(' / '));
      o.click(); await sleep(500); return tx(o);
    }
    const btn = re => [...document.querySelectorAll('button')].filter(vis).find(b => re.test(tx(b)) && !b.disabled);
    const clicar = async (re, ms = 20000) => { const b = await esperar(() => btn(re), ms); if (!b) throw new Error('Botão não encontrado: ' + re); b.click(); await sleep(1200); return b; };
    // modal "Os campos a seguir precisam de correção"
    function modalErro() { const m = [...document.querySelectorAll('div')].filter(vis).find(d => /precisam de corre[çc][ãa]o/i.test(tx(d)) && tx(d).length < 400); return m && tx(m); }
    async function semErro(etapa) {
      await sleep(1500);
      const m = modalErro(); if (m) { const f = btn(/^Fechar$/); if (f) f.click(); throw new Error(etapa + ': ' + m.replace(/Fechar/g, '').trim()); }
      const aviso = [...document.querySelectorAll('span,p,div')].filter(e => vis(e) && e.children.length === 0 && /cadastrado para outro CPF/i.test(tx(e))).map(tx)[0];
      if (aviso) throw new Error(etapa + ': ' + aviso);
    }
    const dataISO = d => { const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };

    async function identificacao(f) {
      if (!/identificacao/.test(location.pathname)) throw new Error('Abra a tela de Identificação (BMG Consig → Nova plataforma)');
      const cpf = await esperar(() => campo(/^CPF$/));
      if (so(cpf.value) !== f.cpf) { await digitar(cpf, f.cpf); await sleep(1500); }
      const d = campo(/^Data de nascimento$/);
      if (d && !d.value) { const iso = dataISO(f.nascimento); if (!iso) throw new Error('Falta data de nascimento na ficha'); d.focus(); setter.call(d, iso); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })); d.dispatchEvent(new Event('blur', { bubbles: true })); }
      await preencher(/^Nome completo$/, f.nome);
      await combo(/^Entidade$/, 'INSS', /1581 - INSS/);
      await clicar(/^Continuar$/);
      const m = await esperar(() => campo(/^Matrícula$/), 30000); if (!m) throw new Error('Bloco Benefício não apareceu');
      if (!m.value) await digitar(m, f.beneficio);
      const esp = String(f.especie || '').padStart(2, '0');
      await combo(/^Tipo benefício$/, String(+esp), new RegExp('^' + (+esp) + ' -'));
      if (!f.uf) throw new Error('Falta UF na ficha');
      await combo(/^UF$/, f.uf, new RegExp('^' + f.uf + '$'));
      if ((campo(/^UF$/) || {}).value !== f.uf) { await sleep(800); await combo(/^UF$/, f.uf, new RegExp('^' + f.uf + '$')); }
      // v3.7: a Renda vem "R$ 0,00" (não vazia) — sem renda o BMG não presume a margem e some a oferta de empréstimo
      // v3.15: renda mínima = salário mínimo (R$ 1.621,00)
      const num = v => +String(v || '').replace(/[^\d,]/g, '').replace(',', '.') || 0;
      const rendaOk = Math.max(num(f.renda), 1621);
      const renda = campo(/^Renda$/); if (num(renda.value) < 1621 || !+so(renda.value)) { await digitar(renda, String(Math.round(rendaOk * 100))); renda.dispatchEvent(new Event('blur', { bubbles: true })); }
      const temMargem = () => +so((campo(/^Empréstimo Consignado$/) || {}).value) > 0;
      await esperar(temMargem, 10000);
      if (!temMargem()) throw new Error('BMG não presumiu a margem (confira Renda e UF na Identificação)');
      // v3.15: o BMG presume 35% da renda; troca pela MARGEM REAL (Multicorban/OnlineFlash) antes de continuar
      const mReal = num(f.margem) || (num(f.parcela) ? num(f.parcela) + 0.01 : 0);
      const mc = campo(/^Empréstimo Consignado$/);
      if (mReal > 0 && Math.abs(num(mc.value) - mReal) > 0.009) { const pres = mc.value; await digitar(mc, String(Math.round(mReal * 100))); mc.dispatchEvent(new Event('blur', { bubbles: true })); await sleep(800); log('Margem BMG ' + pres + ' → margem real R$ ' + mReal.toFixed(2).replace('.', ',')); }
      log('Identificação ok · margem BMG ' + (campo(/^Empréstimo Consignado$/) || {}).value);
      await clicar(/^Continuar$/);
    }

    async function simulacao(f) {
      for (let k = 0; k < 5; k++) {
        const r = await esperar(() => btn(/^Tentar novamente$/) || [...document.querySelectorAll('div')].find(d => /^Empréstimo Consignado/.test(tx(d)) && d.querySelector('button') && tx(d).length < 200), 45000);
        if (!r) throw new Error('Ofertas do BMG não carregaram');
        if (r.tagName === 'BUTTON') { log('BMG: erro ao consultar ofertas, tentando de novo…'); r.click(); await sleep(3000); continue; }
        const ad = [...r.querySelectorAll('button')].find(b => /^Adicionar$/.test(tx(b))); if (!ad) throw new Error('Sem botão Adicionar no Empréstimo Consignado');
        ad.click(); break;
      }
      await esperar(() => campo(/^Simular por$/), 30000);
      await combo(/^Simular por$/, 'parcela', /Valor da parcela/);
      const v = await esperar(() => campo(/^Valor da parcela$/)); await digitar(v, so(f.parcela));
      await sleep(500); await clicar(/Atualizar simula/);
      await esperar(() => !btn(/Atualizar simula/), 20000); await sleep(1500);
      const prazo = campo(/^Prazo$/);
      if (prazo && !new RegExp('^' + (f.prazo || 108) + 'x').test(prazo.value)) { await combo(/^Prazo$/, String(f.prazo || 108), new RegExp('^' + (f.prazo || 108) + 'x')); await clicar(/Atualizar simula/).catch(() => {}); await sleep(3000); }
      const lib = (tx(document.body).match(/Valor liberado:?\s*R\$\s*([\d.,]+)/) || [])[1];
      const sel = [...document.querySelectorAll('input[type=radio]')].find(r => r.checked);
      f._liberado_bmg = lib; f._tabela_bmg = sel ? (tx(sel.closest('label,div')).match(/\d{3,5} - [^\n]*?(?=\s*(MELHOR|1[,.]\d|$))/) || [''])[0] : '';
      if (!lib) throw new Error('Simulação BMG sem valor liberado');
      log(`BMG simulado: R$ ${lib} · ${f.prazo || 108}x R$ ${f.parcela} · ${f._tabela_bmg}`, 'ok');
      await clicar(/^Adicionar$/);
      await clicar(/^Continuar$/, 30000);
    }

    function proximaConta() { const n = Math.max(GM_getValue('conta_seq', 14), 14); return { banco: '001', agencia: '0001', conta: String(n), dv: '8', seq: n }; }
    async function dados(f) {
      await esperar(() => campo(/^Nome da mãe$/), 30000);
      if (!f.mae && !campo(/^Nome da mãe$/).value) throw new Error('Falta o nome da mãe na ficha');
      await preencher(/^Nome da mãe$/, f.mae);
      await combo(/^Tipo de documento$/, 'CPF', /^CPF$/);
      const doc = campo(/^Número do documento$/); if (so(doc.value) !== f.cpf) await digitar(doc, f.cpf);
      const de = campo(/^Data da emissão$/); if (de && !de.value) { de.focus(); setter.call(de, dataISO(PADRAO.dt_emissao)); de.dispatchEvent(new Event('input', { bubbles: true })); de.dispatchEvent(new Event('change', { bubbles: true })); de.dispatchEvent(new Event('blur', { bubbles: true })); }
      await combo(/^Órgão emissor$/, 'SECRETARIA', /SECRETARIA DA SEGURAN/);
      await combo(/^UF$/, f.uf, new RegExp('^' + f.uf + '$'));
      const sexo = f.sexo || (/A$/i.test((f.nome || '').split(' ')[0]) ? 'FEMININO' : 'MASCULINO');
      await combo(/^Sexo$/, sexo.slice(0, 4), new RegExp('^' + sexo + '$', 'i'));
      await combo(/^Estado de nascimento$/, f.uf, new RegExp('^' + f.uf + '$'));
      const cn = campo(/^Cidade de nascimento$/);
      if (cn && !cn.value) { if (cn.getAttribute('role') === 'combobox') await combo(/^Cidade de nascimento$/, f.cidade || '', new RegExp('^' + (f.cidade || 'x') + '$', 'i')); else await digitar(cn, f.cidade || ''); }
      await combo(/^Estado civil$/, 'SOLT', /^SOLTEIRO$/);
      const cel = campo(/^Celular$/); const t = so(f.telefone).replace(/^55(?=\d{10,11}$)/, '');
      if (cel && so(cel.value).length < 10) { if (t.length < 10) throw new Error('Falta celular na ficha'); await digitar(cel, t); await sleep(1500); }
      // v3.16: BMG não aceita o mesmo e-mail em CPFs diferentes → naoinformado1@, 2@, 3@… (sequência)
      const em = campo(/^Email$/); if (em && !em.value) { let mail = f.email; if (!mail || /^naoinformado@/i.test(mail)) { const n = GM_getValue('email_seq', 1); mail = 'naoinformado' + n + '@gmail.com'; GM_setValue('email_seq', n + 1); log('E-mail usado: ' + mail); } await digitar(em, mail); }
      await combo(/^Grau de instrução$/, 'NAO', /N[ÃA]O DECLARADO/);
      // v3.12: a UF do documento às vezes não fica gravada (mostra RR mas o BMG acusa "UF") → seleciona de novo no fim
      await sleep(500); await combo(/^UF$/, f.uf, new RegExp('^' + f.uf + '$'));
      // endereço
      const cep = campo(/^CEP$/); if (cep && !so(cep.value)) { if (!f.cep) throw new Error('Falta CEP na ficha'); await digitar(cep, f.cep); await esperar(() => (campo(/^Endereço$/) || {}).value, 10000); }
      const nu = campo(/^Número$/); if (nu && (!nu.value || nu.value === '0') && so(f.numero)) await digitar(nu, so(f.numero)); else if (nu && !nu.value) await digitar(nu, '0');
      // banco
      await combo(/^Tipo de crédito$/, 'Transf', /Transfer/);
      const real = f.banco && so(f.conta).length >= 3 && f.banco !== '000';
      // v3.12 (Stefany): no BMG agência inválida/aleatória = 3880; Caixa (104) = Conta Poupança
      const agB = a => { const x = agOk(a); return x === '0001' && cod0 === '104' ? '3880' : x; };
      const cod0 = String(+so(real ? f.banco : (bancoOk(f.banco) || '001')));
      const c = real ? { banco: f.banco, agencia: agB(f.agencia), conta: so(f.conta).slice(0, -1), dv: so(f.conta).slice(-1) } : { ...proximaConta(), banco: bancoOk(f.banco) || '001', agencia: agB(f.agencia) };
      const cod = String(+so(c.banco));
      await combo(/^Banco$/, cod + ' - ', new RegExp('^' + cod + ' - '));
      if (cod === '104') await combo(/^Tipo de conta$/, 'Poup', /^Conta Poupan/); else await combo(/^Tipo de conta$/, 'Corrente', /^Conta Corrente$/);
      await digitar(campo(/^Agência$/), c.agencia); await digitar(campo(/^Conta$/), c.conta); await digitar(campo(/^DV$/), c.dv);
      log(`BMG conta: ${c.banco} ag ${c.agencia} cc ${c.conta}-${c.dv}${real ? '' : ' (aleatória da sequência)'}`);
      if (!real) GM_setValue('conta_seq', c.seq + 1);   // v3.13: conta aleatória usada = já passa para a próxima (nunca repetir)
      await semErro('Dados');
      await clicar(/^Continuar$/);
      await semErro('Dados');
      await esperar(() => btn(/^Gerar proposta$/), 30000) || (() => { throw new Error('Resumo não abriu'); })();
      f._conta_aleatoria = !real;
      log('Dados ok. Resumo pronto.', 'ok');
    }

    async function gerarELink(f) {
      await clicar(/^Gerar proposta$/);
      const ade = await esperar(() => (tx(document.body).match(/Gerada com sucesso.{0,60}?(\d{8,10})/) || [])[1], 90000);
      if (!ade) { const st = (tx(document.body).match(/Status.{0,200}/) || [''])[0]; throw new Error('Proposta não gerada. ' + st.slice(0, 150)); }
      log('Proposta BMG ' + ade, 'ok');
      // o botão "Gerar link" às vezes não responde ao 1º clique: clica de novo (com eventos de mouse) até aparecer "Copiar link"
      const cliqueReal = el => { el.scrollIntoView({ block: 'center' }); const q = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, clientX: q.x + q.width / 2, clientY: q.y + q.height / 2, view: window }; ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => el.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, o) : new MouseEvent(t, o))); };
      await esperar(() => btn(/^Gerar link de formaliza/i), 30000);
      for (let k = 0; k < 8 && !btn(/^Copiar link$/); k++) { const g = btn(/^Gerar link de formaliza/i); if (g) cliqueReal(g); await esperar(() => btn(/^Copiar link$/), 5000); }
      if (!btn(/^Copiar link$/)) throw new Error('Botão Copiar link não apareceu (proposta ' + ade + ' já gerada)');
      let copiado = '';
      const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
      try { const cb = W.navigator.clipboard; const orig = cb.writeText.bind(cb); cb.writeText = t => { copiado = String(t); try { return orig(t); } catch (e) { return Promise.resolve(); } }; } catch (e) {}
      btn(/^Copiar link$/).click(); await sleep(2500);
      if (!/^https?:/.test(copiado)) { const m = tx(document.body).match(/https?:\/\/www\.bancobmg\.com\.br\/formalizacao\/\S+/) || [...document.querySelectorAll('input')].map(i => i.value).join(' ').match(/https?:\/\/\S*formalizacao\S+/); if (m) copiado = m[0]; }
      if (!/^https?:\/\//.test(copiado)) throw new Error('Não consegui ler o link do BMG');
      const r = { cpf: f.cpf, nome: f.nome, proposta: ade, link: copiado, liberado: f._liberado_bmg || '', parcela: f.parcela, prazo: f.prazo || '108', banco: 'BMG', conta_aleatoria: !!f._conta_aleatoria, quando: new Date().toISOString() };
      GM_setValue('bmg_resultado', r);
      log(`PROPOSTA BMG ${ade} · LINK ${copiado}`, 'ok');
      document.getElementById('dins-res').value = `Proposta BMG ${ade}\nLiberado R$ ${r.liberado} · ${r.prazo}x R$ ${r.parcela}\nLink: ${copiado}`;
      return r;
    }

    const p = painel('Digitação BMG');
    p.querySelector('#dins-corpo').innerHTML =
      botao('Carregar ficha', '#475569') + botao('Fazer tudo', '#7c3aed') + botao('Digitar BMG', '#2563eb') + botao('Gerar e pegar link', '#16a34a') +
      `<div style="margin-top:6px;color:#94a3b8;font-size:12px">Conta aleatória: próxima 001/0001/<span id="dins-seq"></span>-8</div>` +
      `<textarea id="dins-res" readonly style="width:100%;height:70px;margin-top:6px;font:12px monospace;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px"></textarea>`;
    p.querySelector('#dins-seq').textContent = Math.max(GM_getValue('conta_seq', 11), 11);
    let rodando = false;
    p.addEventListener('click', async e => {
      const a = e.target.dataset.a; if (!a || rodando) return;
      const f = GM_getValue('ficha_atual');
      if (!f || !f.cpf) { log('Nenhuma ficha salva. No Multicorban: Gerar ficha → Salvar ficha.', 'erro'); return; }
      if (a === 'Carregar ficha') { log(`${f.nome} · CPF ${f.cpf} · benef ${f.beneficio} (esp ${f.especie}) · parcela ${f.parcela} · ${f.uf || '?'} · ${f.cidade || '?'} · mãe ${f.mae || '—'}`); return; }
      if (f.recusa) { log('Ficha marcada como RECUSA (' + f.recusa.split('|')[0] + '). NÃO digitar.', 'erro'); return; }
      rodando = true;
      const status = (st, extra) => { try { localStorage.setItem('dins_bmg_status', JSON.stringify(Object.assign({ st, cpf: f.cpf, nome: f.nome, t: Date.now() }, extra || {}))); } catch (er) {} };
      status('rodando');
      try {
        if (a === 'Digitar BMG' || a === 'Fazer tudo') {
          const pg = location.pathname;
          if (/identificacao/.test(pg)) { await identificacao(f); await simulacao(f); await dados(f); }
          else if (/simulacao/.test(pg)) { await simulacao(f); await dados(f); }
          else if (/dados/.test(pg)) await dados(f);
          GM_setValue('ficha_atual', f);
          if (a === 'Digitar BMG') log('Pronto para gerar. Confira o Resumo e clique "Gerar e pegar link".', 'ok');
        }
        if (a === 'Gerar e pegar link' || a === 'Fazer tudo') { const r = await gerarELink(f); status('ok', r); }
        else status('pronto_para_gerar', { liberado: f._liberado_bmg || '' });
      } catch (err) { log('PAROU: ' + err.message, 'erro'); status('erro', { erro: err.message }); }
      finally { rodando = false; p.querySelector('#dins-seq').textContent = Math.max(GM_getValue('conta_seq', 11), 11); }
    });
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
        // Leitor por rótulo: a tela mostra o rótulo numa linha e o valor na linha seguinte.
        // Funciona igual na Versão 1 e na Versão 2.
        const LINHAS = t.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
        // ⚠️ Campo VAZIO não aparece vazio: a linha seguinte é o PRÓXIMO RÓTULO.
        // (No Marcos Aurélio, "RG" vinha seguido de "DIB".) Esta lista evita gravar rótulo como valor.
        const ROTULOS = /^(Nome|CPF|RG|DIB|DDB|UF|CEP|Endere[çc]o|Munic[íi]pio|Sexo|Idade|Benef[íi]cio|Esp[ée]cie|Situa[çc][ãa]o|Margem|Somar|Nome da M[ãa]e|Data Nascimento|Data Inclus[ãa]o|Data da Extin[çc][ãa]o|Tipo de conta|Dados Banc[áa]rio[s]?|N[úu]mero da (Ag[êe]ncia|Conta)|Valor (do Benef[íi]cio|L[íi]quido|da parcela)|Limite Cart[ãa]o|Banco|Sistema|Prazo|Informa[çc][õo]es complementares|Clique aqui para exibir\.?|Telefone\(s\) do Benefici[áa]rio|Margem Dispon[íi]vel|Margem Benef[íi]cio|Observa[çc][ãa]o do Bloqueio|Descri[çc][ãa]o do Bloqueio|Pens[ãa]o Aliment[íi]cia|Possui Representante|Bloqueado para Empr[ée]stimo|Eleg[íi]vel para Empr[ée]stimo|Dados do Representante Legal|Liberado p\/ Desbloqueio|Consulta Saque BMG|Cart[ãa]o (Pessoal|Benef[íi]cio) \(R[MC]C\))$/i;
        const depois = (lbl, q = 1) => {
          const re = new RegExp('^' + lbl + '\\s*:?$', 'i');
          const i = LINHAS.findIndex(x => re.test(x));
          if (i < 0) return q === 1 ? '' : [];
          const v = [];
          for (let k = i + 1; k < i + 1 + q && k < LINHAS.length; k++) { if (ROTULOS.test(LINHAS[k])) break; v.push(LINHAS[k]); }
          return q === 1 ? (v[0] || '') : v;
        };
        // RMC / RCC não têm rótulo próprio: cabeçalho da seção -> primeira "Margem" depois dele -> valor.
        // "NNN - Banco" no meio é o banco que já está com aquele cartão.
        const cartao = re => {
          const i = LINHAS.findIndex(x => re.test(x)); if (i < 0) return '';
          const j = LINHAS.findIndex((x, k) => k > i && /^Margem$/i.test(x)); if (j < 0) return '';
          const bco = LINHAS.slice(i + 1, j).find(x => /^\d{3} - /.test(x)) || '';
          return (LINHAS[j + 1] || '') + (bco ? ' (' + bco + ')' : '');
        };
        // "Não é pensão alimentícia" / "Não possui representante legal" => negativo
        const negativo = v => !v || /^n[ãa]o\b/i.test(v);
        const f = {
          nome: g(/\nNome\s*\n+([^\n]+)/),
          cpf: so(g(/\nCPF\s*\n+(\d[\d.\-]*)\s*\n/)).padStart(11, '0'),
          beneficio: so(g(/\nBenef[íi]cio\s*\n+(\d[^\n]*)/)),
          especie: g(/Descri[çc][ãa]o da Esp[ée]cie\s*\n+(\d+)/),
          idade: so(g(/\nIdade\s*\n+([^\n]+)/)),
          ddb: g(/\nDDB\s*\n+([^\n]+)/),
          cidade: g(/Munic[íi]pio\s*\n+([^\n]+)/),
          prazo: '108',
          nascimento: g(/Data Nascimento\s*\n+(\d{2}\/\d{2}\/\d{4})/),
          mae: (m => /^[A-ZÀ-Ú' ]{6,}$/.test(m) ? m : '')(g(/Nome da M[ãa]e\s*\n+([^\n]+)/)),
          sexo: (m => /^(M|F|MASC|FEM)/i.test(m) ? (/^F/i.test(m) ? 'FEMININO' : 'MASCULINO') : '')(g(/\nSexo\s*\n+([^\n]+)/)),
          uf: g(/\nUF\s*\n+([A-Z]{2})\s*\n/),
          cep: so(g(/\nCEP\s*\n+(\d[\d.\-]{4,9})/)),
          endereco: g(/\nEndere[çc]o\s*\n+([^\n]+)/),
        };
        // renda = valor do benefício (salário mínimo antigo 1.518 => 1.621 de 2026)
        { const vb = num(g(/Valor do Benef[íi]cio\s*\n+([^\n]+)/)); f.renda = brl(Math.abs(vb - 1518) < 0.01 ? 1621 : vb); }
        const margem = num(g(/Margem Dispon[íi]vel\s*\n+([^\n]+)/));
        f.parcela = margem > 0 ? brl(Math.max(0, margem - 0.01)) : '0,00';
        // Regra Stefany: margem de R$ 531,30 (35% do mínimo antigo, R$ 1.518) => considerar mínimo 2026 (R$ 1.621): parcela R$ 567,34
        if (Math.abs(margem - 531.30) < 0.005) { f.parcela = '567,34'; log('Margem 531,30 → parcela 567,34 (salário mínimo 2026).', 'ok'); }
        const bancoTxt = g(/Dados Banc[áa]rio[s]?\s*\n+([^\n]+)/);
        f.banco = so(bancoTxt.split('-')[0]).padStart(3, '0').replace(/^000$/, '');
        f.agencia = so(g(/N[úu]mero da Ag[êe]ncia\s*\n+([^\n]+)/));
        f.conta = so(g(/N[úu]mero da Conta\s*\n+([^\n]+)/));
        f.agencia = agOk(f.agencia);
        // ---- campos de análise (decidem se atendemos) ----
        f.tipo_conta    = depois('Tipo de conta');
        f.rg            = so(depois('RG'));
        f.situacao      = depois('Situa[çc][ãa]o');
        f.margem        = brl(margem);
        f.rmc           = cartao(/Cart[ãa]o Pessoal \(RMC\)/i);
        f.rcc           = cartao(/Cart[ãa]o Benef[íi]cio \(RCC\)/i);
        f.pensao        = depois('Pens[ãa]o Aliment[íi]cia');
        f.representante = depois('Possui Representante');
        f.rep_dados     = depois('Dados do Representante Legal', 4).join(' | ');
        if (!f.telefone) f.telefone = so(depois('Telefone\\(s\\) do Benefici[áa]rio'));
        // ---- conta: de onde ela vem (regra da Stefany, 07/11/2026) ----
        // 1) conta real: Multicorban -> New Corban (Histórico Bancário) -> FullConsig (ignorar banco "V8")
        // 2) tem banco e AGÊNCIA real, sem conta  -> conta = número da agência, dígito = último dígito dela
        // 3) tem só o banco, sem agência         -> agência e conta aleatórias do procedimento
        // 4) não tem nem o banco em lugar nenhum -> /08, pedir a conta ao cliente
        // Aleatório é só quando a informação não existe: tendo a agência certa, usa ela.
        {
          const agRaw = so(f.agencia), agReal = agRaw.length >= 3 && !/^0+$/.test(agRaw);
          if (so(f.conta)) f.conta_origem = 'Multicorban';
          else if (!so(f.banco)) f.conta_origem = 'SEM BANCO — conferir New Corban e FullConsig; se não houver, /08';
          else if (agReal) {
            f.conta_origem = 'conferir New Corban e FullConsig; se não tiverem, usar a derivada da agência';
            f.conta_sugerida = agOk(f.agencia) + '-' + agOk(f.agencia).slice(-1);
          } else {
            f.conta_origem = 'só o banco — agência e conta aleatórias do procedimento';
          }
        }
        // ---- veredito: por que NÃO atendemos ----
        // ⛔ BLOQUEIO DE EMPRÉSTIMO NÃO ENTRA AQUI. Decisão da Stefany em 07/11/2026:
        //    "Você não analisa bloqueio de empréstimo" — padrão. Nem o rótulo "Bloqueado para
        //    Empréstimo", nem a "Descrição do Bloqueio", nem "Elegível para Empréstimo".
        // formato MOTIVO|tag|o que fazer  -> o robô de desfecho lê isso
        f.recusa = '';
        if (!negativo(f.pensao))             f.recusa = 'PENSAO|07|avisar que não atendemos pensão alimentícia e FECHAR a conversa';
        else if (!negativo(f.representante)) f.recusa = 'REPRESENTANTE|' + (margem >= 20 ? '03 A' : '03 B') + '|/inss13 — não fazemos proposta com representante legal';
        else if (margem < 20)                f.recusa = 'SEM_MARGEM|01 I|/n30';
        const d = decidirBanco(f);
        f.banco_destino = d.banco;
        if (!f.beneficio) { log('Não achei o benefício. Clique em "Consultar" no benefício ativo antes.', 'erro'); return; }
        ta.value = fichaParaTexto(f);
        log(`${f.nome} · espécie ${f.especie} · ${f.idade} anos · margem R$ ${brl(margem)} · ${f.situacao || '?'}`);
        log(`Pensão: ${f.pensao || '?'} · Representante: ${f.representante || '?'}`);
        if (f.rmc || f.rcc) log(`RMC: ${f.rmc || '—'} · RCC: ${f.rcc || '—'}`);
        if (f.rep_dados) log('Representante legal: ' + f.rep_dados);
        if (f.conta_origem) log('Conta: ' + f.conta_origem + (f.conta_sugerida ? ' → sugerida ' + f.conta_sugerida : ''));
        if (f.recusa) {
          const r = f.recusa.split('|');
          log(`⛔ NÃO ATENDEMOS — ${r[0]}. Tag ${r[1]}. ${r[2]}`, 'erro');
        } else {
          log(`Destino: ${d.banco} — ${d.motivo}`, ['NAO', 'HUMANO'].includes(d.banco) ? 'erro' : 'ok');
        }
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
        if (f.recusa) {
          const r = f.recusa.split('|');
          // deixa a ordem pronta para o robô de desfecho do Botmaker
          try { localStorage.setItem('dins_ficha_recusa', JSON.stringify({ cpf: f.cpf, nome: f.nome, motivo: r[0], tag: r[1], oque: r[2], t: Date.now() })); } catch (er) {}
          log(`Ficha salva como RECUSA (${r[0]}). No Botmaker: tag ${r[1]} · ${r[2]}`, 'erro');
        } else {
          log(`Ficha salva. Abra o New Corban em ?p=${(f.banco_destino || 'facta').toLowerCase()} e clique "Digitar".`, 'ok');
        }
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
    // v3.9 (regra da Stefany): sempre tabela SEM carência — "(+90d Car)"/"Carência" só quando ela pedir
    const semCar = cand.filter(x => !/\(\+?\s*\d+\s*d\s*Car\)|car[êe]ncia/i.test(x.innerText));
    if (semCar.length) cand = semCar;
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
      // Sem BANCO em lugar nenhum (nem Multicorban, nem Histórico do New Corban, nem FullConsig):
      // aí sim é /08. Com banco, a conta sai pela cascata abaixo. (Regra da Stefany, 07/11/2026.)
      if (!so(f.banco) || /^0+$/.test(so(f.banco))) {
        throw new Error('Cliente SEM BANCO: NÃO gravar. Confira o FullConsig (banco "V8" não vale). Se não houver banco em lugar nenhum, mande o /08 pedindo a conta.');
      }
      const banco = so(f.banco).padStart(3, '0');
      const agencia = agOk(f.agencia);
      const agReal = so(f.agencia).length >= 3 && !/^0+$/.test(so(f.agencia));
      let conta = so(f.conta), dv, origemConta;
      if (conta) { dv = conta.slice(-1); conta = conta.slice(0, -1); origemConta = 'conta real da ficha'; }
      else if (agReal) {
        // agência certa na mão: o número dela vira a conta, e o último dígito dela vira o DV.
        conta = agencia; dv = agencia.slice(-1); origemConta = 'derivada da agência ' + agencia;
      } else {
        const n = Math.max(GM_getValue('conta_seq', 14), 14);
        conta = String(n); dv = '8'; GM_setValue('conta_seq', n + 1);
        origemConta = 'aleatória da sequência (não havia agência)';
      }
      if (pagina === 'facta') { if (!setSelect('banco', banco)) log('Banco ' + banco + ' não existe na lista do FACTA.', 'erro'); }
      else setv('banco', banco);
      setv('agencia', agencia); setv('conta', conta); setv('conta_digito', dv);
      log(`Conta: ${banco} ag ${agencia} cc ${conta}-${dv} — ${origemConta}.`, so(f.conta) ? 'ok' : 'erro');
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
        if (f.recusa) return log('Ficha marcada como RECUSA (' + f.recusa.split('|')[0] + '). NÃO digitar.', 'erro');
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
