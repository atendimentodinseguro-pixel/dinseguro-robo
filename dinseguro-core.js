// Dinseguro - código principal do robô (carregado pelo dinseguro.user.js). Versão: 3.35


(function () {
  'use strict';

  const VERSAO = '3.59';
  // carimbo para saber, de fora do robô, qual versão está realmente rodando em cada aba
  try {
    const m = JSON.parse(localStorage.getItem('dins_versao') || '{}');
    m[location.host] = { v: VERSAO, t: Date.now() };
    localStorage.setItem('dins_versao', JSON.stringify(m));
  } catch (e) {}

  // ------------------------------------------------------------------ REGRAS
  const PEGAR_LINK = false;   // true = depois de gravar também busca o link e copia a mensagem /n54n
  const INVALIDEZ = ['04', '05', '06', '32', '33', '34', '51', '83', '92'];
  // Pensão por morte (urbana e rural). Usado só para a trava de idade da Qualibank.
  // ⚠️ CONFIRMAR COM A STEFANY: a "regra de pensão abaixo de 45 anos" dela ainda não
  // está escrita em lugar nenhum; até ela passar, pensionista com menos de 45 anos
  // NÃO vai para a Qualibank — fica na FACTA e o robô avisa.
  const PENSAO = ['01', '02', '03', '21', '23', '27', '28', '29'];

  // Espécies que a Dinseguro atende (Prompt-Atendimento, passo 4.2). Fora desta lista
  // é /07 e fecha. 87 e 88 (LOAS) têm regra própria: também não fazemos proposta.
  const ESPECIES_OK = ['01','02','03','04','05','06','07','08','19','20','21','22','23','24','26','27','28','29',
    '32','33','34','37','38','41','42','43','44','45','46','49','51','52','54','55','56','57','58','59',
    '72','78','82','83','89','92','93'];
  const LOAS = ['87', '88'];

  // Janela de fim de semana (Stefany, 07/11/2026 14:55): da SEXTA às 17h até a
  // MEIA-NOITE de DOMINGO, quem está abaixo de R$ 6 mil vai para o C6 em vez da
  // Qualibank. Fora dessa janela (segunda a sexta até as 17h), segue na Qualibank.
  // Usa a hora do computador, que é a hora de Brasília da Stefany.
  function janelaC6(agora) {
    const d = agora || new Date();
    const dia = d.getDay();                 // 0 = domingo, 5 = sexta, 6 = sábado
    return dia === 6 || dia === 0 || (dia === 5 && d.getHours() >= 17);
  }
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
  // ⚠️ 07/11/2026: a versão antiga apagava o sinal de menos (o filtro era [^\d,]).
  // Margem "R$ -322,18" virava +322,18 e o robô montava proposta para quem está com a
  // margem estourada. Cliente João Bosco — pego pela Stefany a um clique de gravar.
  const num = s => {
    const t = String(s || '').trim().replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  };
  const brl = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Decide banco destino pelas regras combinadas
  // Tabela do claude/REGRAS-BANCOS.md, atualizada em 07/11/2026.
  // ⚠️ O BMG saiu em 05/11: tudo que ia para ele vai para a FACTA.
  function decidirBanco(f) {
    const idade = parseInt(f.idade) || 0;
    const esp = String(f.especie || '').padStart(2, '0');
    const parcela = num(f.parcela);
    const liberado = parcela * 28400 / 648.39;
    const inval = INVALIDEZ.includes(esp);
    if (parcela < 20) return { banco: 'NAO', motivo: 'Margem abaixo de R$ 20: /n30.' };
    if (idade > 76) return { banco: 'NAO', motivo: 'Acima de 76 anos: não fazemos.' };
    if (idade >= 74) return { banco: 'HUMANO', motivo: '74 a 76 anos: perguntar à Stefany antes de simular ou digitar.' };
    if (esp === '87' || esp === '88') return { banco: 'HUMANO', motivo: 'LOAS (87/88): regra própria, não fazemos proposta.' };
    const nota = ` · liberado estimado R$ ${brl(liberado)}`;
    if (inval) {
      if (idade >= 60) return { banco: 'FACTA', motivo: 'Invalidez 60–73: FACTA mesmo acima de R$ 20 mil' + nota };
      if (idade >= 58) return { banco: 'QUALIBANK', motivo: 'Invalidez 58–59: Qualibank, tabela de invalidez (566), 108x' + nota };
      if (idade >= 53) return { banco: 'C6', motivo: 'Invalidez 53–57: C6, sempre 108x' + nota };
      if (idade >= 40) return { banco: 'QUEROMAIS', motivo: 'Invalidez 40–52: Quero Mais' + nota };
      return { banco: 'C6', motivo: 'Invalidez até 39: C6, sempre 108x' + nota };
    }
    // Mudança da Stefany, 07/11/2026 12:53, "por enquanto": não sendo invalidez,
    // ACIMA de R$ 6.000 vai para o C6. Antes o corte era R$ 20.000.
    if (liberado >= 6000) return { banco: 'C6', motivo: 'Acima de R$ 6 mil e não é invalidez: C6' + nota };
    // Mudança da Stefany, 07/11/2026 14:41: abaixo de R$ 6 mil pode ir para a QUALIBANK,
    // desde que não caia na regra de invalidez (tratada acima) nem na de pensão abaixo
    // de 45 anos. Pensionista com menos de 45 anos continua na FACTA até ela passar a regra.
    if (PENSAO.includes(esp) && idade < 45)
      return { banco: 'FACTA', motivo: 'Abaixo de R$ 6 mil, mas é pensão com menos de 45 anos: FACTA (regra de pensão <45 ainda não escrita — confirmar com a Stefany)' + nota };
    if (janelaC6())
      return { banco: 'C6', motivo: 'Abaixo de R$ 6 mil, mas é fim de semana (sexta depois das 17h até domingo): C6' + nota };
    return { banco: 'QUALIBANK', motivo: 'Abaixo de R$ 6 mil em dia de semana: Qualibank, tabela normal (631)' + nota };
  }


  // Faixas de valor e para onde cada uma vai. Pedido da Stefany em 07/11: o banco
  // depende do valor que o cliente quiser, então o painel já mostra o quadro inteiro
  // em vez de obrigar a recalcular quando ele responde.
  // As faixas quebram nos cortes de verdade: R$ 6.000 e R$ 20.000 são onde muda a
  // TABELA do banco ("Tkt até 6k", "Tkt 6k a 20k", "Tkt > 20k") — por isso o 6.000
  // é uma faixa própria, e não some dentro do 5.000–10.000. (Stefany, 07/11.)
  const FAIXAS = [[1000, 5000], [5000, 6000], [6000, 10000], [10000, 15000], [15000, 20000], [20000, null]];
  const tkt = v => v < 6000 ? 'Tkt até 6k' : v <= 20000 ? 'Tkt 6k a 20k' : 'Tkt > 20k';
  function faixasBanco(f, margem) {
    const teto = margem > 0 ? (margem - 0.01) * 28400 / 648.39 : 0;   // quanto a margem aguenta
    return FAIXAS.map(([a, b]) => {
      const nome = b === null ? `R$ ${brl(a)} ou mais` : `R$ ${brl(a)} a ${brl(b)}`;
      if (a >= teto) return `${nome} → não cabe na margem`;
      const topo = b === null ? teto : Math.min(b, teto);
      const d = decidirBanco(Object.assign({}, f, { parcela: brl(topo * 648.39 / 28400) }));
      const corte = (b !== null && b > teto) ? ` (só até R$ ${brl(teto)})` : '';
      // o topo exato da faixa cai no degrau seguinte (6.000 não é "6k a 20k"): tirar um centavo
      return `${nome} → ${d.banco} · ${tkt(b === null ? topo : topo - 0.01)}${corte}`;
    });
  }

  // Ficha em texto (chave: valor) <-> objeto
  const CAMPOS = ['recusa', 'banco_destino', 'nome', 'cpf', 'beneficio', 'especie', 'idade', 'ddb', 'parcela', 'valor', 'prazo', 'telefone', 'email',
    'nascimento', 'mae', 'sexo', 'renda', 'uf', 'cep', 'endereco', 'numero', 'bairro', 'cidade', 'banco', 'agencia', 'conta', 'tipo_conta',
    // campos de ANALISE: nao vao para a digitacao, servem para decidir se atendemos
    'margem', 'rmc', 'rcc', 'rg', 'situacao', 'pensao', 'representante', 'rep_dados', 'conta_origem', 'conta_sugerida', 'flash'];
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
    // Acima de 76 anos (Stefany, 07/11 15:59): fluxo "Início do atendimento", que resolve
    // tudo sozinho, mais a tag "Acima De 80 Anos" (o nome da tag está errado, mas é essa).
    // Não fecha a conversa: quem encerra é o próprio fluxo.
    idade_77:         { fluxo: 'Início do atendimento', tags: ['Acima De 80 Anos'], fechar: false },
    so_tag:           { atalho: null,   tags: [], fechar: false },
    // Varredura das conversas vencidas (Stefany, 07/11 16:44): quem não teve interação
    // nenhuma leva só a tag e a conversa é encerrada, sem mandar mensagem.
    classifica_fecha: { atalho: null,   tags: ['01 C - Inss Nao Informou CPF - SEM 87 e 88'], fechar: true },
    // encerra sem mensagem e sem mexer nas tags (quem já tem a tag certa, como o 01 A de
    // quem recebeu proposta, e o follow-up já saiu por fora do Botmaker).
    fecha:            { atalho: null,   tags: [], fechar: true },
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
    // `atalho` pode ser um atalho de verdade ('/n30') ou o NOME de um fluxo sem atalho
    // ('Início do atendimento', usado nos clientes acima de 76 anos — Stefany, 07/11 15:59).
    // No caso do nome, digita '/' + nome e escolhe a opção pelo nome, sem acento e sem caixa.
    const semAcento = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    // EXECUTAR FLOW: alguns textos não são resposta rápida com atalho, são FLUXO
    // (Stefany, 07/11 16:18: "você clica lá naquela parte de executar flow"). Caminho:
    // ícone .flow-selector-menu no topo do chat → campo "Buscar fluxos" → clicar no nome.
    async function executarFluxo(nome) {
      const botao = await ate(() => document.querySelector('.flow-selector-menu'), 8000);
      if (!botao) throw new Error('não achei o botão de executar flow');
      clicar(botao); await esp(1500);
      const campo = await ate(() => [...document.querySelectorAll('input')]
        .filter(vis).find(e => /Buscar fluxos/i.test(e.placeholder || '')), 8000);
      if (!campo) throw new Error('a janela EXECUTAR FLOW não abriu');
      campo.focus(); setNativo(campo, ''); await esp(500);
      setNativo(campo, semAcento(nome).split(' ')[0]);   // "inicio" basta para filtrar
      const op = await ate(() => [...document.querySelectorAll('.flow-selector__item-name')]
        .filter(vis).find(e => semAcento(txt(e)) === semAcento(nome)), 8000);
      if (!op) throw new Error('o fluxo "' + nome + '" não apareceu na busca');
      clicar(op.closest('.flow-selector__item-data') || op);
      await esp(3000);
      return 'fluxo ' + nome;
    }

    async function respostaRapida(atalho, editar) {
      const ta = await ate(() => document.querySelector('textarea'));
      if (!ta) throw new Error('caixa de mensagem não encontrada');
      const porNome = !/^\//.test(atalho);
      ta.focus(); setNativo(ta, porNome ? '/' + atalho : atalho);
      await esp(2500);
      const linha = porNome
        ? await ate(() => [...document.querySelectorAll('.slash-menu-options,tr,li,div')]
            .filter(vis).find(x => x.children.length < 8 && semAcento(txt(x)) === semAcento(atalho)), 10000)
        : await ate(() => [...document.querySelectorAll('tr,li,div')]
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
      const valorEnviado = document.querySelector('textarea').value;
      const trecho = valorEnviado
        .replace(/[*_]/g, '').split('\n').find(l => l.trim().length > 20) || '';
      clicar(await ate(() => document.querySelector('button.send-button-component')));
      await esp(4000);
      const chegou = document.querySelector('.entries').innerText.slice(-4000)
        .replace(/[*_]/g, '').includes(trecho.trim().slice(0, 30));
      if (!chegou) throw new Error('mandei mas a mensagem não apareceu no chat (chat bloqueado?)');
      // Stefany, 07/11 16:18: quem registra o link sou eu. Toda mensagem que sai com
      // link (o /bn54n e o /parabens levam link) agenda sozinha o follow-up de 10 e 60 min.
      if (/https?:\/\//.test(valorEnviado || '')) agendarSeTiverLink();
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
        if (d.fluxo) { passos.push(await executarFluxo(d.fluxo)); }
        else if (d.atalho) { passos.push('msg:' + await respostaRapida(d.atalho, d.editar)); }
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

    // ---------------------------------------------------------------------
    // FOLLOW-UP AUTOMÁTICO DO LINK (Stefany, 07/11/2026 16:03)
    // Todo link mandado ao cliente (pelo /bn54n ou pelo /parabens) gera dois
    // compromissos: 10 minutos depois, "Conseguiu acessar? Ficou com alguma
    // dúvida?"; 60 minutos depois, /132 — este só se o cliente NÃO tiver
    // respondido nada nesse tempo. Era o que o robô antigo fazia e tinha se
    // perdido no caminho.
    // A fila fica no GM storage, então sobrevive a F5 e a troca de aba.
    // chamada por quem acabou de mandar uma mensagem com link: descobre o chat aberto
    // e agenda os dois follow-ups. É o "registrar o link" que a Stefany pediu que fosse meu.
    function agendarSeTiverLink() {
      const hash = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1];
      if (!hash) return;
      const fone = (document.body.innerText.match(/(?:Home|Lar)\s*\n\s*(\d{10,13})/) || [])[1] || '';
      window.dinsLinkEnviado(hash, fone);
    }

    const FUPS = () => GM_getValue('followups', []);
    const gravaFups = l => GM_setValue('followups', l);

    // Registrar: window.dinsLinkEnviado('HASH', '55619...')  — ou, de fora,
    // localStorage.setItem('dins_link_enviado', JSON.stringify({hash, fone}))
    window.dinsLinkEnviado = function (hash, fone) {
      const agora = Date.now();
      const l = FUPS().filter(f => f.hash !== hash);
      l.push({ hash, fone: fone || '', etapa: '10', quando: agora + 10 * 60000, linkT: agora });
      l.push({ hash, fone: fone || '', etapa: '60', quando: agora + 60 * 60000, linkT: agora });
      gravaFups(l);
      log && log('Follow-up do link agendado: 10 min e 60 min.', 'ok');
      return 'agendado';
    };

    // o cliente falou depois do link? Lê o fim da conversa de trás para frente.
    // Marca nossa: toda mensagem que sai leva "done_all" (o visto duplo) logo depois.
    // Nota interna é um bloco: entra em "~ Criado por" e sai em "[Nota interna]".
    function clienteRespondeu() {
      const e = document.querySelector('.entries');
      if (!e) return false;
      const linhas = e.innerText.split('\n').map(x => x.trim()).filter(Boolean);
      let dentroDaNota = false;
      for (let i = linhas.length - 1; i >= 0; i--) {
        const l = linhas[i];
        if (/^~ Criado por/.test(l)) { dentroDaNota = true; continue; }
        if (/^\[Nota interna\]/.test(l)) { dentroDaNota = false; continue; }
        if (dentroDaNota) continue;
        if (/^done_all$/.test(l)) return false;                 // a última foi nossa
        if (/^\[Dinseguro\]/.test(l)) return false;
        if (/Enviado pelo credsegurobank/.test(l)) return false; // o robô do bot falou
        if (/^(check|info_outline|security|list_alt|schedule|bolt|open_in_new|play_arrow|person|Home|Lar)$/.test(l)) continue;
        if (/^Enviado por Dinseguro$/.test(l)) continue;         // rótulo do canal, não é autoria
        if (/^S(e|É)X|^SÁB|^DOM|^SEG|^TER|^QUA|^QUI/i.test(l) && /\d{1,2}:\d{2}/.test(l)) continue;
        if (/^Sess[ãa]o /.test(l)) continue;
        if (/^\d{1,2}:\d{2}(:\d{2})?( (AM|PM))?$/.test(l)) continue;
        if (l.length > 1) return true;                          // texto que não é nosso
      }
      return false;
    }

    let fupRodando = false;
    async function olharFollowups() {
      if (fupRodando || rodando) return;
      const l = FUPS();
      const i = l.findIndex(f => Date.now() >= f.quando);
      if (i < 0) return;
      const f = l[i];
      fupRodando = true;
      try {
        await abrir(f.hash);
        if (f.fone) {
          const p = (document.body.innerText.match(/(?:Home|Lar)\s*\n\s*(\d{10,13})/) || [])[1];
          if (p && p !== f.fone) throw new Error('chat aberto não é o do follow-up (' + p + ')');
        }
        if (f.etapa === '60' && clienteRespondeu()) {
          log && log('Follow-up de 60 min cancelado: o cliente respondeu.', 'ok');
        } else {
          // Stefany criou o atalho em 07/11 16:43: /bot2 = "Conseguiu acessar? Ficou com
          // alguma duvida?". Dá para trocar sem mexer no código: GM_setValue('atalho_conseguiu', '/x').
          const atalho = f.etapa === '10' ? GM_getValue('atalho_conseguiu', '/bot2') : '/132';
          if (!atalho) {
            log && log('Follow-up de 10 min parado: falta o atalho da mensagem "Conseguiu acessar?". ' +
              'Rode GM_setValue("atalho_conseguiu", "/oatalho").', 'erro');
          } else {
            await respostaRapida(atalho, false);
            log && log('Follow-up de ' + f.etapa + ' min enviado (' + atalho + ').', 'ok');
          }
        }
      } catch (e) {
        log && log('Follow-up falhou: ' + e.message, 'erro');
      } finally {
        gravaFups(FUPS().filter(x => !(x.hash === f.hash && x.etapa === f.etapa)));
        fupRodando = false;
      }
    }
    setInterval(olharFollowups, 60000);

    // =====================================================================
    // VARREDURA AUTOMÁTICA DAS CONVERSAS COM A JANELA VENCIDA
    // Stefany, 07/11 17:46: "isso aí tem que ser automático".
    // Roda sozinha de 30 em 30 minutos. Regras em claude/VARREDURA-JANELA-VENCIDA.md:
    //   entra quem está entre 12 e 48 horas sem resposta E com a janela vencida;
    //   sem interação (sem CPF, sem proposta, sem link) → tag 01 C e encerra;
    //   com interesse claro → NÃO encerra sozinha: entra na lista de follow-up,
    //   porque a mensagem tem que sair pelo WhatsApp normal, que o robô não acessa.
    // Trava: no máximo 5 conversas por rodada, e nunca mexe em chat onde um humano
    // falou nas últimas 2 horas.
    // Stefany, 07/11 17:54: "pode pegar geral" — sem limite por rodada. O teto alto
    // continua só como trava de segurança contra laço infinito.
    // A janela da varredura é configurável, para poder testar sem mexer no código:
    //   localStorage.setItem('dins_varre_janela', '6,72')   -> passa a valer 6h a 72h
    //   localStorage.setItem('dins_varre_janela', 'padrao') -> volta para 12h a 48h
    const janelaVarredura = () => {
      // ⚠️ 3.58 (07/11 19:52) — Stefany: "essa varredura vai pegar TODOS que estão com a
      // conversa encerrada 24 horas após a última mensagem. Todos, então."
      // O critério passou a ser UM SÓ: a janela de 24h vencida. A faixa de horas deixou
      // de ser peneira e virou só um teto de segurança, altíssimo por padrão.
      const g = GM_getValue('varre_janela', [0, 24000]);
      return { min: g[0] * 3600000, max: g[1] * 3600000, txt: g[0] + 'h a ' + g[1] + 'h' };
    };
    const VARRE_MAX_RODADA = 500;
    const NAO_MEXER = ['Romulo', 'Jair', '⚫️'];

    // ⚠️⚠️ 3.56 (07/11 19:28) — SEGUNDO motivo de a varredura não resolver nada.
    // Ela media a idade da ÚLTIMA MENSAGEM DA CONVERSA — e a última mensagem quase
    // sempre é NOSSA. Então toda conversa que o atendimento tocou hoje parecia recente
    // e caía fora da janela, mesmo com o cliente calado há dois dias.
    // Medido na tela em 07/11 (última atividade  ×  última mensagem DO CLIENTE):
    //    Maria Abadia ....  3h  ×  42,8h
    //    Cleodiceia .....   3h  ×  51,2h
    //    Luiz Carlos ....  23h  ×  43,4h
    //    Santaterezinha .  24h  ×  29,9h
    // O que interessa é há quanto tempo o CLIENTE está calado — é isso que fecha a
    // janela de 24h. Agora é isso que a função devolve.
    //
    // Como se distingue: a nossa mensagem termina com o "visto" (done_all/done/check);
    // a do cliente, não. Sem conseguir separar, cai no comportamento antigo.
    function idadeDaConversa() {
      const e = document.querySelector('.entries');
      if (!e) return null;
      const L = e.innerText.split('\n').map(x => x.trim()).filter(Boolean);
      let data = null, doCliente = null, dequalquerUm = null;
      for (let i = 0; i < L.length; i++) {
        const ms = L[i].match(/^Sess[ãa]o\s+(\d{2})\/(\d{2})\/(\d{4})/);
        if (ms) { data = new Date(+ms[3], +ms[2] - 1, +ms[1]); continue; }
        const mh = L[i].match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
        if (!mh || !data) continue;
        if (+mh[1] > 23 || +mh[2] > 59) continue;          // é duração, não hora
        let h = +mh[1];
        if (/PM/i.test(mh[3] || '') && h < 12) h += 12;
        if (/AM/i.test(mh[3] || '') && h === 12) h = 0;
        const dt = new Date(data); dt.setHours(h, +mh[2], 0, 0);
        dequalquerUm = dt;
        if (!/^(done_all|done|check|schedule)$/.test(L[i + 1] || '')) doCliente = dt;
      }
      const ref = doCliente || dequalquerUm;
      return ref ? Date.now() - ref.getTime() : null;
    }

    // ⚠️⚠️ 3.55 (07/11 19:15) — ESTE ERA O MOTIVO DE A VARREDURA NUNCA CLASSIFICAR NINGUÉM.
    // O aviso "A janela de 24 horas está finalizada" NÃO é texto da página: é o
    // **placeholder do campo de mensagem**. Placeholder não entra em innerText, então o
    // teste `/janela de 24 horas/.test(document.body.innerText)` dava SEMPRE false e todas
    // as conversas caíam em "janela_aberta" e eram puladas — inclusive as de 30h, 40h.
    // Stefany, 19:13: "ele passou por vários aí que estão com janela e não está resolvendo".
    // Conferido na Santaterezinha (última mensagem dela 06/11 13:34, ~30h): body não tinha
    // nem a palavra "janela"; o placeholder tinha o aviso inteiro.
    // ⚠️⚠️ 3.59 (07/11 20:35) — O TERCEIRO motivo de a varredura não resolver nada, e o
    // que sobrou depois da 3.55. O Botmaker usa DUAS redações para o mesmo aviso, e a
    // 3.58 só reconhecia a primeira **no placeholder**:
    //    a) "A janela de 24 horas está finalizada. Clique aqui para reabri-la usando um
    //        Template do WhatsApp."
    //    b) "A conversa foi encerrada 24 horas após a última mensagem do usuário."
    //       (às vezes seguida de "A conversa foi iniciada por meio de um anúncio Meta e
    //        você está dentro de 72 horas desde o início da conversa.")
    // A (b) só era testada em document.body.innerText — onde placeholder NUNCA aparece,
    // que é justamente o erro que a 3.55 tinha corrigido para a (a). Resultado: toda
    // conversa com a redação (b) caía em "janela_aberta" e era pulada.
    // Conferido à mão em 07/11 20:10-20:20, nas 8 conversas vencidas da caixa:
    //    Amélia ............................... redação (a)  -> era a ÚNICA reconhecida
    //    Maria Abadia, Cleodiceia, Luiz Carlos,
    //    Mayc, Silvia, Fernando, Vanda ........ redação (b)  -> 7 de 8 passavam batido
    // Placar da rodada automática das 20:14 com o defeito: janela_aberta 4, followup 0.
    // ⚠️ Quem mexer aqui: o teste é SEMPRE no placeholder. Body é só reserva.
    const RE_JANELA_VENCIDA =
      /janela de 24 horas est[áa] finalizada|reabri-la usando um Template|conversa foi encerrada 24 horas ap[óo]s/i;
    function janelaFechada() {
      const ta = document.querySelector('textarea');
      const ph = (ta && (ta.placeholder || ta.getAttribute('placeholder'))) || '';
      if (RE_JANELA_VENCIDA.test(ph)) return true;
      // reserva: em alguns chats o aviso aparece como texto mesmo
      return RE_JANELA_VENCIDA.test(document.body.innerText);
    }
    // ⚠️ 3.59 — A janela de 72h do anúncio Meta NÃO muda nada. Algumas conversas avisam
    // que vieram de anúncio e que novos modelos não teriam custo adicional. Stefany,
    // 07/11 20:18: "mesmo quem está dentro das 72 horas do anúncio da meta, eles também
    // vão ser qualificados, encerrados e fazer o contato no outro WhatsApp se necessário,
    // se for de acordo com os nossos critérios." Mesmo tratamento das outras.
    function humanoRecente() {
      const e = document.querySelector('.entries');
      if (!e) return false;
      // nome de atendente humano aparece como "[Fulano 👤]"
      const t = e.innerText.slice(-3000);
      return /\[[^\]]*👤\]/.test(t);
    }

    // ⚠️ 3.58 — a regra "sem CPF e sem link = sem interação" é cega para conversa que
    // teve ATENDIMENTO DE VERDADE. Caso real pego em 07/11: a Santaterezinha estava sem
    // CPF e sem link, mas tinha falado da doença na família, pedido urgência, e a equipe
    // respondeu duas vezes "já passei com prioridade, te retorno". Pela regra antiga ela
    // seria tagueada e ENCERRADA. Encerrar essa conversa é o pior desfecho possível.
    // Agora: qualquer mensagem escrita por nós (as que vêm com "[Nome]" na frente, que o
    // fluxo automático do bot não usa) conta como interação e manda para o follow-up.
    function perfilDaConversa() {
      const e = document.querySelector('.entries');
      const t = e ? e.innerText : '';
      return {
        cpf:  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t),
        link: /https?:\/\/(web\.c6consig|dcy\.app|\S*facta|\S*assin|signer\.ajin)/i.test(t),
        prop: /proposta (aprovada|criada|gerada)|Novo Cr[ée]dito Dispon/i.test(t),
        // qualquer "[Nome]" conta: mensagem nossa E nota interna. Nota interna quer dizer
        // que alguém já trabalhou essa conversa, então ela não é "sem interação".
        // Na dúvida o robô erra para o lado seguro: follow-up, nunca encerrar.
        atendente: /\[[^\]\n]{2,40}\]/.test(t)
      };
    }

    // ⚠️⚠️ 3.59 (07/11 20:33) — TRAVA DE SEGURANÇA PEDIDA PELA STEFANY.
    // Caso real: a varredura das 19:31 encerrou a Santaterezinha e ainda pôs nela a tag
    // "01 C - Inss Nao Informou CPF" — numa cliente que já tinha "01 D - Inss Fechou
    // Negocio" e "01 k SEM Margem Nao Rodar Whats". Stefany, 20:32: "Caso 01C não cabe
    // nela. Se ela já contratou, já fechou o negócio, ela não pode ter a 01C. Mas ela
    // pode ter contratado 01D e pode estar com 01K. Os clientes que já contrataram e
    // agora estão sem margem, a gente não usa 01I, a gente usa 01K só para esses."
    // Regra: QUEM TEM 01 D NUNCA RECEBE 01 C, e a varredura não encerra essa conversa.
    // (A outra metade da regra — sem margem com 01 D leva 01 k, e não 01 I — já está na
    // tabela de recusa; aqui a trava é só para a varredura não desfazer o 01 D.)
    function temTagFechouNegocio() {
      const p = document.querySelector('.user-info-panel');
      if (!p) return false;
      return [...p.querySelectorAll('[class*=MuiChip-root]')]
        .some(c => /^01 D\b|Fechou Negocio/i.test((c.textContent || '').trim()));
    }

    let varrendo = false;
    async function varrerJanelaVencida() {
      if (varrendo || rodando || fupRodando) return;
      if (!GM_getValue('varredura_ligada', true)) return;
      // Stefany, 07/11 19:27: "esse robô roda de 8 da manhã às 8 da noite. Depois
      // disso, não." Vale para a rodada automática E para o "rodar agora".
      const hora = new Date().getHours();
      if (hora < 8 || hora >= 20) {
        log && log('Varredura: fora do horário (8h às 20h). Não vou rodar agora.', 'erro');
        return;
      }
      varrendo = true;
      let feitas = 0;
      const J = janelaVarredura();
      const LIMITE_DESCIDA = J.max + 86400000;   // até onde vale a pena descer na lista
      log && log('Varredura: começando (janela ' + J.txt + ').');
      // placar da rodada, para dar para conferir sem abrir chat nenhum:
      //   JSON.parse(localStorage.dins_varredura_placar)
      const placar = { janela: J.txt, inicio: new Date().toLocaleTimeString('pt-BR').slice(0,5),
                       lista: 0, abertos: 0, idade_fora: 0, janela_aberta: 0, humano: 0,
                       classificados: 0, followup: 0, nao_abriu: 0, fim: '' };
      const salvaPlacar = () => { try { localStorage.setItem('dins_varredura_placar', JSON.stringify(placar)); } catch (e) {} };
      salvaPlacar();
      try {
        // ⚠️ 07/11 18:58: a versão anterior voltava ao topo e rolava a lista inteira para
        // achar CADA cliente — dois chats por minuto. Agora ela caminha a lista em ordem,
        // aproveitando a posição onde já está: a volta inteira cai para poucos minutos.
        let sc = document.querySelector('.customer-item') && document.querySelector('.customer-item').parentElement;
        for (let k = 0; k < 6 && sc && sc.scrollHeight <= sc.clientHeight + 5; k++) sc = sc.parentElement;
        const jaVistos = new Set();
        let pos = 0;
        for (let pagina = 0; pagina < 60; pagina++) {
          if (sc) { sc.scrollTop = pos; await esp(450); }
          const itens = [...document.querySelectorAll('.customer-item')];
          // 3.54: a lista vem da mais NOVA para a mais VELHA. Quando o rótulo de tempo
          // da página inteira já passou da janela, tudo que está embaixo também passou:
          // não há motivo para continuar descendo nem para o Botmaker ficar buscando
          // conversa antiga no servidor. (Stefany, 19:06: "ele desceu demais, está lá
          // no dia 20". Uma folga de 1 dia, porque o rótulo é grosso: "Sex", "20/10".)
          const idadesPag = itens.map(idadeDoItem).filter(x => x !== null);
          if (idadesPag.length && Math.min.apply(null, idadesPag) > LIMITE_DESCIDA) {
            placar.parou_na_data = true; salvaPlacar();
            log && log('Varredura: cheguei ao fim da janela (' + J.txt + '). Parei de descer.', 'ok');
            break;
          }
          const nomes = itens.map(x => (x.innerText.split('\n').filter(Boolean)[1] || ''))
            .filter(n => n && !jaVistos.has(n));
          placar.lista = jaVistos.size + nomes.length; salvaPlacar();
          for (const nome of nomes) {
            jaVistos.add(nome);
            if (feitas >= VARRE_MAX_RODADA) break;
            if (NAO_MEXER.some(n => nome.startsWith(n))) continue;
            if (GM_getValue('varredura_vistos', {})[nome]) continue;
            if (sc) { sc.scrollTop = pos; await esp(300); }
            const achaPeloNome = () => [...document.querySelectorAll('.customer-item')]
              .find(x => (x.innerText.split('\n').filter(Boolean)[1] || '') === nome);
            let it = achaPeloNome();
            // ⚠️ 3.59 — abrir uma conversa REORDENA a lista (a que foi aberta sobe). Então
            // o item que estava nesta posição pode já não estar mais aqui, e a 3.58
            // desistia dele (placar.nao_abriu). Agora, se não achar na posição atual,
            // procura descendo a lista inteira antes de desistir. Medido em 07/11 20:15:
            // sem isso, pedir o "Mayc" abria o "Luiz Carlos" de novo.
            if (!it && sc) {
              for (let y = 0; y <= sc.scrollHeight && !it; y += 300) {
                sc.scrollTop = y; await esp(220); it = achaPeloNome();
              }
              if (!it) { sc.scrollTop = pos; await esp(250); }
            }
            if (!it) { placar.nao_abriu++; salvaPlacar(); continue; }
            // 3.54: o rótulo já diz que está fora da janela — não gasta 5s abrindo
            const idadeRot = idadeDoItem(it);
            if (idadeRot !== null && idadeRot > LIMITE_DESCIDA) { placar.idade_fora++; salvaPlacar(); continue; }
            const alvo = [...it.querySelectorAll('*')].find(x => x.children.length === 0 && txt(x) === nome) || it;
            clicar(alvo); await esp(5000);
            if (!document.querySelector('.entries')) { placar.nao_abriu++; salvaPlacar(); continue; }
            placar.abertos++;
            const idade = idadeDaConversa();
            // a ordem importa: a janela fechada já é a prova de que o cliente está
            // calado há mais de 24h. Conferir ela ANTES do mínimo, que é só uma folga.
            if (!janelaFechada()) { placar.janela_aberta++; salvaPlacar(); continue; }
            if (idade === null || idade > J.max) { placar.idade_fora++; salvaPlacar(); continue; }
            if (humanoRecente()) { placar.humano++; salvaPlacar(); continue; }
            const hash = (window.top.location.hash.match(/chats\/([A-Z0-9]+)/i) || [])[1] || '';
            const fone = (document.body.innerText.match(/(?:Home|Lar)\s*\n\s*(\d{10,13})/) || [])[1] || '';
            const pf = perfilDaConversa();
            const horas = Math.round(idade / 3600000);
            // 3.59: quem já fechou negócio (01 D) nunca é encerrado pela varredura nem
            // recebe o 01 C. Se está calado, vira follow-up como qualquer outro.
            const fechouNegocio = temTagFechouNegocio();
            if (pf.cpf || pf.link || pf.prop || pf.atendente || fechouNegocio) {
              const fila = GM_getValue('varredura_followup', []);
              if (!fila.find(x => x.hash === hash)) {
                fila.push({ hash, fone, nome, horas, quando: Date.now() });
                GM_setValue('varredura_followup', fila);
                log && log('Varredura: ' + nome + ' (' + horas + 'h) entrou na fila de follow-up do WhatsApp.', 'ok');
                placar.followup++; salvaPlacar();
              }
            } else {
              localStorage.setItem('dins_ordem', JSON.stringify({
                hash, acao: 'classifica_fecha', quem: 'varredura',
                nota: 'Varredura automática ' + new Date().toLocaleString('pt-BR').slice(0, 16) +
                      ' - janela vencida ha ' + horas + 'h, sem CPF e sem interacao.',
                t: Date.now()
              }));
              log && log('Varredura: ' + nome + ' (' + horas + 'h) sem interação — classificando e encerrando.', 'ok');
              placar.classificados++; salvaPlacar();
              await esp(45000);
            }
            const vistos = GM_getValue('varredura_vistos', {});
            vistos[nome] = Date.now();
            GM_setValue('varredura_vistos', vistos);
            feitas++;
          }
          if (!sc) break;
          const antes = sc.scrollTop; sc.scrollTop = pos + 400; await esp(400);
          if (sc.scrollTop === antes) break;
          pos = sc.scrollTop;
        }
      } catch (e) { placar.erro = e.message; log && log('Varredura parou: ' + e.message, 'erro'); }
      finally {
        placar.fim = new Date().toLocaleTimeString('pt-BR').slice(0,5);
        salvaPlacar();
        log && log('Varredura terminou: ' + placar.abertos + ' conversas abertas, ' +
          placar.classificados + ' classificadas, ' + placar.followup + ' para follow-up.', 'ok');
        varrendo = false;
      }
    }

    // helpers da varredura: lista de nomes e abrir pelo nome
    // ⚠️ 3.54 (07/11 19:06) — Stefany, vendo a varredura rodar: "ele desceu demais, está
    // lá no dia 20". A 3.53 carregava a lista INTEIRA (240 conversas) antes de começar.
    // Não precisa: a lista vem da mais nova para a mais velha, então assim que o rótulo
    // de tempo passa da janela, TUDO que está embaixo também passou. Agora ela para ali.
    //
    // Rótulos que o Botmaker usa, nessa ordem: "14:32" (hoje) · "3h" · "Sex" (últimos 7
    // dias) · "20/10" (mais velho). Devolve a idade em ms, ou null se não souber ler.
    const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    // Devolve { idade (ms), forca }. A `forca` existe porque o item da lista também
    // mostra DURAÇÕES no mesmo formato de hora ("36:47" = 36 min e 47 s de atendimento),
    // e lendo de trás para a frente a duração aparecia antes do rótulo de verdade e
    // fazia a conversa de 20/10 parecer de hoje. Rótulo mais forte vence.
    function idadePeloRotulo(t) {
      t = String(t || '').trim().toLowerCase().replace(/á/g, 'a');
      let m;
      if (m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)) {              // data: mais forte
        const hoje = new Date();
        const ano = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : hoje.getFullYear();
        const dt = new Date(ano, +m[2] - 1, +m[1]);
        if (!m[3] && dt > hoje) dt.setFullYear(ano - 1);
        return { idade: hoje - dt, forca: 4 };
      }
      if (m = t.match(/^(dom|seg|ter|qua|qui|sex|sab)$/)) {                      // dia da semana
        const alvo = DIAS_SEMANA.indexOf(m[1]);
        let dif = new Date().getDay() - alvo;
        if (dif <= 0) dif += 7;
        return { idade: dif * 86400000, forca: 3 };
      }
      if (/^ontem$/.test(t)) return { idade: 86400000, forca: 3 };
      if (m = t.match(/^(\d+)\s*min/)) return { idade: +m[1] * 60000, forca: 2 };
      if (m = t.match(/^(\d+)\s*m$/)) return { idade: +m[1] * 60000, forca: 2 };
      if (m = t.match(/^(\d+)\s*h$/)) return { idade: +m[1] * 3600000, forca: 2 };
      if (m = t.match(/^(\d+)\s*d$/)) return { idade: +m[1] * 86400000, forca: 2 };
      if (m = t.match(/^(\d{1,2}):(\d{2})$/)) {                                  // hora de hoje
        if (+m[1] > 23 || +m[2] > 59) return null;                              // é duração
        return { idade: 0, forca: 1 };
      }
      return null;
    }
    // idade de UM item da lista, pelo rótulo de tempo que ele mostra
    function idadeDoItem(el) {
      if (!el) return null;
      const L = el.innerText.split('\n').map(x => x.trim()).filter(Boolean);
      let melhor = null;
      for (let j = L.length - 1; j >= 0; j--) {
        const r = idadePeloRotulo(L[j]);
        if (r && (!melhor || r.forca > melhor.forca)) melhor = r;
      }
      return melhor ? melhor.idade : null;
    }
    function listaDeNomes() {
      return [...new Set([...document.querySelectorAll('.customer-item')]
        .map(x => (x.innerText.split('\n').filter(Boolean)[1] || '')).filter(Boolean))];
    }
    // rola a lista de chats até o fim para pegar TODOS os nomes, não só os visíveis
    // ⚠️ 3.53 (07/11 19:00) — a varredura entregava ZERO e parecia quebrada. Não estava:
    // ela só enxergava PARTE da lista. Dois motivos, os dois corrigidos aqui.
    //
    //  1. A lista do Botmaker é VIRTUALIZADA: só ~7 conversas existem no HTML por vez,
    //     numa barra de rolagem de ~6.300px. Tem que rolar e colher a cada passo.
    //  2. ⚠️ O principal: as conversas antigas são BUSCADAS NO SERVIDOR quando a rolagem
    //     chega ao fundo. A versão anterior parava assim que o scrollTop não mudava mais
    //     ("cheguei ao fim") — mas nesse instante o fim ainda era o fim do que estava
    //     carregado, e o resto vinha depois. Medido em 07/11 18:47: a varredura montou
    //     uma lista de 30 nomes; rolando com paciência, a mesma lista tinha 59.
    //     Por isso ela nunca via as conversas velhas, que são justamente o alvo dela.
    //
    // Agora: chegou ao fundo → ESPERA carregar e tenta de novo. Só desiste depois de
    // 6 passadas seguidas sem nenhum nome novo.
    async function listaCompleta() {
      let sc = document.querySelector('.customer-item') && document.querySelector('.customer-item').parentElement;
      for (let k = 0; k < 6 && sc && sc.scrollHeight <= sc.clientHeight + 5; k++) sc = sc.parentElement;
      if (!sc) return listaDeNomes();
      const todos = new Set();
      const colher = () => listaDeNomes().forEach(x => todos.add(x));
      sc.scrollTop = 0; await esp(900);
      let semNovidade = 0;
      for (let n = 0; n < 400 && semNovidade < 6; n++) {
        const antesQtd = todos.size;
        colher();
        const antesTopo = sc.scrollTop;
        sc.scrollTop = Math.min(sc.scrollTop + 400, sc.scrollHeight);
        await esp(650);
        colher();
        const noFundo = sc.scrollTop <= antesTopo + 5;
        if (noFundo) await esp(1200);          // deixa o Botmaker buscar as mais antigas
        colher();
        semNovidade = (todos.size === antesQtd && noFundo) ? semNovidade + 1 : 0;
      }
      sc.scrollTop = 0; await esp(700);
      return [...todos];
    }
    // ⚠️ 07/11 18:25: a versão anterior só olhava os chats JÁ renderizados na tela.
    // Depois de rolar a lista inteira para montar os nomes, a lista volta ao topo e a
    // maioria dos itens some do DOM — então a varredura "passava" por quase todo mundo
    // sem abrir nada, e parecia que não fazia nada. Agora ela ROLA ATÉ ACHAR.
    async function abrirPeloNome(nome) {
      let sc = document.querySelector('.customer-item') && document.querySelector('.customer-item').parentElement;
      for (let k = 0; k < 6 && sc && sc.scrollHeight <= sc.clientHeight + 5; k++) sc = sc.parentElement;
      let it = null;
      if (sc) { sc.scrollTop = 0; await esp(500); }
      for (let n = 0; n < 40 && !it; n++) {
        it = [...document.querySelectorAll('.customer-item')]
          .find(x => (x.innerText.split('\n').filter(Boolean)[1] || '') === nome);
        if (!it && sc) {
          const antes = sc.scrollTop; sc.scrollTop += 400; await esp(380);
          if (sc.scrollTop === antes) break;
        } else if (!it) break;
      }
      if (!it) return false;
      const alvo = [...it.querySelectorAll('*')]
        .find(x => x.children.length === 0 && txt(x) === nome) || it;
      clicar(alvo);
      await esp(6000);
      return !!document.querySelector('.entries');
    }

    // a cada 30 minutos, e a primeira 3 minutos depois de a aba abrir
    setTimeout(varrerJanelaVencida, 3 * 60000);
    setInterval(varrerJanelaVencida, 30 * 60000);

    // "rodar agora", sem esperar os 30 minutos (Stefany, 07/11 18:08):
    //   localStorage.setItem('dins_varrer_agora', '1')
    // Com '1' ele respeita quem já foi visto; com 'tudo' ele esquece os vistos e
    // reavalia a lista inteira.
    setInterval(() => {
      const j = localStorage.getItem('dins_varre_janela');
      if (j) {
        localStorage.removeItem('dins_varre_janela');
        if (/^padrao$/i.test(j)) GM_setValue('varre_janela', [12, 48]);
        else { const p = j.split(',').map(x => parseInt(x.trim())); if (p.length === 2 && p.every(n => n > 0)) GM_setValue('varre_janela', p); }
        log && log('Varredura: janela agora é ' + janelaVarredura().txt + '.', 'ok');
      }
      const v = localStorage.getItem('dins_varrer_agora');
      if (!v) return;
      localStorage.removeItem('dins_varrer_agora');
      if (v === 'tudo') GM_setValue('varredura_vistos', {});
      log && log('Varredura: rodando agora a pedido.', 'ok');
      varrerJanelaVencida();
    }, 3000);
    // para desligar: GM_setValue('varredura_ligada', false)
    // fila de quem precisa de follow-up pelo WhatsApp: GM_getValue('varredura_followup', [])

    // gatilho de fora da aba (o atendimento manda o link e avisa o robô)
    setInterval(() => {
      let o; try { o = JSON.parse(localStorage.getItem('dins_link_enviado') || 'null'); } catch (e) { return; }
      if (!o || !o.hash) return;
      localStorage.removeItem('dins_link_enviado');
      window.dinsLinkEnviado(o.hash, o.fone);
    }, 3000);
  })();

    setInterval(vigiar, 30000);
    setTimeout(vigiar, 4000);
    return;
  }

  // ============================================== DAYCOVAL e QUERO MAIS (Portal do Correspondente)
  // É o MESMO sistema nos dois: Simulação de Ofertas → Cadastrar → Dados Cadastrais → Dados Complementares
  // → Resumo → Gerar → Formalizar → link. Muda o endereço, o vendedor, a tabela e a conta aleatória.
  // Usa a ficha salva no Multicorban ("Salvar ficha"). Não recarregue a página: o portal perde o login no F5.
  if (/^portaldecredito\.(daycoval|queromaisconsignado)\.com\.br$/.test(location.host)) {
    if (window.top !== window) return;
    const QM = /queromais/.test(location.host);
    // 3.48 — tudo que difere entre os dois portais fica aqui.
    const PORTAL = QM ? {
      nome: 'QUERO MAIS',
      agente: /343999/, vendedor: /^378385/, comercial: /^500001/,
      // tabela por caso (regra da Stefany): invalidez 32/92 → 800999 · acima de R$ 15 mil → 800998 · demais → 800991
      tabela: (esp, liberado) => (esp === '32' || esp === '92') ? '800999' : (liberado > 15000 ? '800998' : '800991'),
      // conta aleatória combinada: Caixa 104, ag 3880, conta 111113-1, POUPANÇA
      aleatoria: () => ({ banco: '104', agencia: '3880', conta: '111113', dv: '1', seq: 0, poupanca: true }),
    } : {
      nome: 'DAYCOVAL',
      agente: /JADY/i, vendedor: /\d/, comercial: /\d/,
      tabela: null,                       // no Daycoval a tabela ainda é conferida à mão
      aleatoria: null,                    // usa a sequência 001/0001/N-8 de sempre
    };
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
      // 3.48 — neste portal o painel abre DENTRO do próprio <mat-select>, não no .cdk-overlay-container.
      const id = sel.getAttribute('aria-controls');
      const pane = await esperar(() => (sel.querySelector('mat-option') && sel) || (id && document.getElementById(id))
        || [...document.querySelectorAll('.cdk-overlay-pane')].filter(x => x.querySelector('mat-option')).pop(), 10000);
      if (!pane) throw new Error('Lista não abriu: ' + re);
      // 3.48 — ⚠️ lista grande (Agente, Vendedor, Comercial, Empregador) NÃO mostra tudo: só com a caixa
      // "Pesquisar …", que fica no mat-form-field, FORA do <mat-select>. Sem isso o robô conclui que
      // o item não existe (07/11: disse que o agente 343999 não estava cadastrado, e estava).
      const ff = sel.closest('mat-form-field');
      const s = busca && (
        (ff && [...ff.querySelectorAll('input')].filter(vis).find(i => /Pesquisar/i.test(i.placeholder || '')))
        || (pane.closest('.cdk-overlay-pane') && pane.closest('.cdk-overlay-pane').querySelector('input')));
      if (s) { await digitar(s, busca); await sleep(1500); }
      const o = await esperar(() => [...pane.querySelectorAll('mat-option')].find(x => re.test(tx(x))), 8000);
      if (!o) { const ops = [...pane.querySelectorAll('mat-option')].map(tx).slice(0, 8).join(' / ');
        await fecharLista();
        throw new Error('Opção não encontrada (' + re + ')' + (busca ? ' nem pesquisando "' + busca + '"' : '') + '. Tem: ' + ops); }
      o.click(); await sleep(600); return tx(o);
    }
    // 3.48 — CADASTRAR PROPOSTA e GERAR PROPOSTAS são BARRAS DE RODAPÉ, não <button>: querySelector('button') não acha.
    const botaoTxt = (re, raiz = document) => {
      const b = [...raiz.querySelectorAll('button, a')].filter(vis).find(x => re.test(tx(x)));
      if (b) return b;
      // a barra tem a classe .resumo-oferta neste portal; fora dela, o elemento mais "justo" ao texto
      const dentro = x => !x.closest('nav, header, .navbar, .nav-link');
      const barra = [...raiz.querySelectorAll('.resumo-oferta')].filter(x => vis(x) && re.test(tx(x)));
      if (barra.length) return barra[barra.length - 1];
      const cand = [...raiz.querySelectorAll('div, span, [role=button]')]
        .filter(x => vis(x) && dentro(x) && x.children.length <= 2 && re.test(tx(x)));
      return cand.sort((x, y) => tx(x).length - tx(y).length)[0];
    };
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

      // 3.48 — ⚠️ A SIMULAÇÃO VEM NA TABELA ERRADA por padrão. Foi o erro do Luiz Carlos (06/11) e o da
      // Kerliane (07/11): espécie 32 simulada na 800991, quando o certo é a 800999. Conferir SEMPRE.
      if (PORTAL.tabela) {
        const certa = PORTAL.tabela(esp, num(res[1]));
        if (!new RegExp('\\b' + certa + '\\b').test(f._tabela_daycoval)) {
          log('Tabela veio ' + f._tabela_daycoval + ' — o certo para este caso é a ' + certa + '. Trocando…');
          await clicar(/^Editar Tabela$/i, p);
          const modal = await esperar(() => [...document.querySelectorAll('div.modal-dialog, .cdk-overlay-pane')].filter(vis).find(m => /Taxa/i.test(tx(m))), 15000);
          if (!modal) throw new Error('A janela "Editar Tabela" não abriu para trocar para a ' + certa);
          const td = await esperar(() => [...modal.querySelectorAll('td')].filter(vis).find(x => tx(x) === certa), 10000);
          if (!td) throw new Error('A tabela ' + certa + ' não aparece na lista do portal. Avise a Stefany.');
          const seta = [...td.closest('tr').querySelectorAll('i, button, mat-icon')].filter(vis).pop();
          if (!seta) throw new Error('Não achei a seta da linha da tabela ' + certa);
          seta.click(); await sleep(2500);
          await fecharAlertas();
          const novo = await esperar(() => { const m = tx(p).match(/Valor ClienteR\$ ?([\d.,]+).{0,200}?Tabela ?(\d{4,}[^]{3,40}?) ?(?:Seguro|Editar)/); return m && new RegExp('\\b' + certa + '\\b').test(m[2]) && m; }, 30000);
          if (!novo) throw new Error('Troquei a tabela mas o painel não confirmou a ' + certa);
          f._liberado_daycoval = novo[1]; f._tabela_daycoval = novo[2].replace(/border_color.*/, '').trim();
          log('Tabela trocada: ' + f._tabela_daycoval + ' · novo liberado R$ ' + novo[1], 'ok');
        } else log('Tabela conferida: ' + certa + ' ✓');
      }

      // 3.48 — trava final: liberado ÷ parcela tem que dar ~43 a 45 em 108x a 1,85%
      const razao = num(f._liberado_daycoval) / (num(f.parcela) || 1);
      if ((f.prazo || '108') === '108' && (razao < 40 || razao > 48))
        throw new Error('Valor não confere: liberado ÷ parcela = ' + razao.toFixed(2) + ' (o certo é ~43 a 45). Não vou cadastrar.');

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
      // 3.48 — ⚠️ CEP geral de cidade (termina em -000) não traz NADA pela lupa e não dá erro:
      // fica tudo vazio e o PRÓXIMO reclama. Preencher à mão com o que veio do Multicorban.
      const endr = entrada(/^Endere[çc]o$/, sr);
      if (endr && !endr.value) {
        await digitar(endr, (f.endereco && !/^UF$/i.test(f.endereco) && f.endereco) || 'CENTRO');
        const bai = entrada(/^Bairro$/, sr); if (bai && !bai.value) await digitar(bai, f.bairro || 'CENTRO');
        const cid = entrada(/^Cidade$/, sr); if (cid && !cid.value) await digitar(cid, f.cidade || 'CENTRO');
        if (f.uf) { const ufr = lista(/^UF$/, sr); if (ufr && !valorSel(ufr)) await escolher(ufr, new RegExp('^' + f.uf + '$'), f.uf); }
        log('A lupa do CEP não trouxe o endereço (CEP geral de cidade). Preenchi com os dados do Multicorban.');
      }
      const numero = entrada(/^Nº$/, sr); if (numero && !numero.value) await digitar(numero, '0');
      await clicar(/^PRÓXIMO$/);
      await semErro('Dados cadastrais');
      await esperar(() => /Natureza de Relacionamento/.test(document.body.innerText), 20000);
      log('Dados cadastrais ok.', 'ok');
    }

    // ---- 3. Dados Complementares
    // 3.48 — no Quero Mais a aleatória combinada é fixa (Caixa 104 / 3880 / 111113-1, POUPANÇA);
    // no Daycoval continua a sequência 001 / 0001 / N-8.
    function proximaConta() {
      if (PORTAL.aleatoria) return PORTAL.aleatoria();
      const n = Math.max(GM_getValue('conta_seq', 14), 14);
      return { banco: '001', agencia: '0001', conta: String(n), dv: '8', seq: n };
    }
    async function complementares(f) {
      await sleep(1500);
      const sb = secao(/^Dados Banc[áa]rios$/);
      const real = f.banco && so(f.conta).length >= 3 && f.banco !== '000';
      // 3.48 — no Quero Mais a conta aleatória é a combinada (Caixa 104 / 3880 / 111113-1), inteira,
      // sem herdar banco nem agência do cliente. No Daycoval segue a sequência de sempre.
      const c = real
        ? { banco: f.banco.padStart(3, '0'), agencia: agOk(f.agencia), conta: so(f.conta).slice(0, -1), dv: so(f.conta).slice(-1) }
        : (PORTAL.aleatoria ? proximaConta() : { ...proximaConta(), banco: bancoOk(f.banco) || '001', agencia: agOk(f.agencia) });
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
        if (/outro CPF/i.test(alertas().join())) { await fecharAlertas(); if (real) throw new Error('A conta do cliente (' + c.banco + ' ' + c.conta + '-' + c.dv + ') está cadastrada para outro CPF no ' + PORTAL.nome + '.'); if (!PORTAL.aleatoria) GM_setValue('conta_seq', c.seq + 1); else throw new Error('A conta aleatória combinada já está cadastrada para outro CPF no Quero Mais. Avise a Stefany.'); throw new Error('Conta já usada em outro CPF (' + c.conta + '-' + c.dv + ').'); }
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
      // 3.48 — Caixa é POUPANÇA INDIVIDUAL; os demais, CORRENTE INDIVIDUAL.
      await escolher(sels[2], (c.poupanca || c.banco === '104') ? /CONTA POUPAN[ÇC]A INDIVIDUAL/ : /CONTA CORRENTE INDIVIDUAL/);
      // vendedor
      // 3.48 — ⚠️ a ordem importa: Comercial → Vendedor → Agente (uma lista alimenta a outra).
      // E o Agente só aparece PESQUISANDO (a lista mostra 51 nomes e a 343999 não está entre eles).
      const sv = secao(/^Dados do Vendedor$/);
      const cm = lista(/^Comercial$/, sv); if (cm) await escolher(cm, PORTAL.comercial);
      await sleep(1200);
      const v = lista(/^Vendedor$/, sv); if (v) await escolher(v, PORTAL.vendedor);
      await sleep(1200);
      await escolher(lista(/^Agente$/, sv), PORTAL.agente, QM ? '343999' : '');
      const ag = valorSel(lista(/^Agente$/, sv));
      if (QM && /WALESKA/i.test(ag)) throw new Error('O agente ficou na WALESKA. Tem que ser 343999 STEFANY MONARA SOUZA.');
      log('Vendedor: ' + valorSel(cm) + ' · ' + valorSel(v) + ' · ' + ag);
      await clicar(/^PRÓXIMO$/);
      await sleep(1500);
      const al = alertas().join(' | ');
      if (/j[áa] cadastrado para outro CPF/i.test(al)) {
        await fecharAlertas();
        if (real) throw new Error('A conta do cliente está cadastrada para outro CPF no ' + PORTAL.nome + '.');
        if (!PORTAL.aleatoria) GM_setValue('conta_seq', c.seq + 1);
        throw new Error('Conta já usada em outro CPF. Avancei a sequência.');
      }
      await semErro('Dados complementares');
      await esperar(() => /GERAR PROPOSTAS/.test(document.body.innerText), 20000);
      if (!real && !PORTAL.aleatoria) GM_setValue('conta_seq', c.seq + 1);
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
      if (!/^https?:/.test(copiado)) { const m = tx(document.body).match(/https?:\/\/(dcy\.app|\S+?)\/\w{4,}/); if (m) copiado = m[0]; }
      // 3.48 — ⚠️ NÃO ler a área de transferência por JS: navigator.clipboard.readText() congela a aba
      // (07/11: o comando morreu com timeout de 45 s, "the renderer may be frozen").
      if (!/^https?:\/\//.test(copiado || '')) throw new Error('Não consegui ler o link copiado');
      const r = { cpf: f.cpf, nome: f.nome, proposta: nro, link: copiado, liberado: f._liberado_daycoval || '', parcela: f.parcela, prazo: f.prazo || '108', tabela: f._tabela_daycoval || '', banco: PORTAL.nome, quando: new Date().toISOString() };
      GM_setValue(QM ? 'queromais_resultado' : 'daycoval_resultado', r);
      try { localStorage.setItem(QM ? 'dins_queromais_res' : 'dins_daycoval_res', JSON.stringify(r)); } catch (e) {}
      log(`PROPOSTA ${nro} · LINK ${copiado}`, 'ok');
      document.getElementById('dins-res').value = `Proposta ${PORTAL.nome} ${nro}\nLiberado R$ ${r.liberado} · ${r.prazo}x R$ ${r.parcela}\n${r.tabela}\nLink: ${copiado}`;
      return r;
    }

    // ---- painel
    const p = painel('Digitação ' + PORTAL.nome);
    p.querySelector('#dins-corpo').innerHTML =
      botao('Carregar ficha', '#475569') + botao('Fazer tudo', '#7c3aed') + botao('Digitar', '#2563eb') + botao('Gerar e pegar link', '#16a34a') +
      `<div style="margin-top:6px;color:#94a3b8;font-size:12px">${QM ? 'Conta aleatória combinada: Caixa 104 / 3880 / 111113-1 (poupança)' : 'Conta aleatória: próxima 001/0001/<span id="dins-seq"></span>-8'}</div>` +
      `<textarea id="dins-res" readonly style="width:100%;height:70px;margin-top:6px;font:12px monospace;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px"></textarea>`;
    const seq = p.querySelector('#dins-seq'); if (seq) seq.textContent = Math.max(GM_getValue('conta_seq', 11), 11);
    let rodando = false;
    p.addEventListener('click', async e => {
      const a = e.target.dataset.a; if (!a || rodando) return;
      const f = GM_getValue('ficha_atual');
      if (!f || !f.cpf) { log('Nenhuma ficha salva. No Multicorban: Gerar ficha → Salvar ficha.', 'erro'); return; }
      if (a === 'Carregar ficha') { log(`${f.nome} · CPF ${f.cpf} · benef ${f.beneficio} (esp ${f.especie}) · parcela ${f.parcela} · ${f.uf || '?'} · mãe ${f.mae || '—'}`); return; }
      if (f.recusa) { log('Ficha marcada como RECUSA (' + f.recusa.split('|')[0] + '). NÃO digitar.', 'erro'); return; }
      rodando = true;
      const status = (st, extra) => { try { localStorage.setItem(QM ? 'dins_queromais_status' : 'dins_daycoval_status', JSON.stringify(Object.assign({ st, cpf: f.cpf, nome: f.nome, portal: PORTAL.nome, t: Date.now() }, extra || {}))); } catch (e) {} };
      status('rodando');
      try {
        if (a === 'Digitar' || a === 'Fazer tudo') {
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
          if (a === 'Digitar') log('Pronto para gerar. Confira o Resumo e clique "Gerar e pegar link".', 'ok');
        }
        if (a === 'Gerar e pegar link' || a === 'Fazer tudo') { const r = await gerarELink(f); status('ok', r); }
        else status('pronto_para_gerar', { liberado: f._liberado_daycoval || '' });
      } catch (err) { log('PAROU: ' + err.message, 'erro'); status('erro', { erro: err.message }); }
      finally { rodando = false; const sq = p.querySelector('#dins-seq'); if (sq) sq.textContent = Math.max(GM_getValue('conta_seq', 11), 11); }
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

    // ================= CONSULTA FLASH AUTOMÁTICA =================
    // Decisão da Stefany, 07/11/2026: o robô confere as regras e dispara a flash
    // sozinho. Se não couber, ou se falhar, segue com a consulta normal sem travar.
    const FLASH_DIAS = 15;
    // lê "Data do extrato" da tela. Data completa = houve IN100/flash naquele dia.
    // Só o mês ("10/2026") = base antiga, não conta como consulta.
    function dataDoExtrato() {
      const L = document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean);
      const i = L.findIndex(x => /^Data do extrato\s*:?$/i.test(x));
      if (i < 0) return null;
      const m = (L[i + 1] || '').match(/^([0-3]\d)\/([01]\d)\/(20\d\d)$/);
      if (!m) return null;
      const dt = new Date(+m[3], +m[2] - 1, +m[1]);
      return isNaN(dt.getTime()) ? null : dt;
    }
    const flashFeitas = () => GM_getValue('flash_feitas', {});
    const flashRecente = ben => { const d = flashFeitas()[ben]; return d && (Date.now() - d) < FLASH_DIAS * 864e5 ? d : 0; };
    const marcarFlash = ben => { const m = flashFeitas(); m[ben] = Date.now(); GM_setValue('flash_feitas', m); };

    // '' = pode fazer. Qualquer outra coisa é o motivo de não fazer.
    function naoFazerFlash(f, margem, temEmprestimo) {
      const h = new Date().getHours();
      if (f.recusa) return 'cliente recusado (' + f.recusa.split('|')[0] + ')';
      if (margem < 20) return 'sem margem';
      // trava de reforço: nada de consulta paga para quem a tabela de bancos já descarta
      const dd = decidirBanco(f);
      if (dd.banco === 'NAO' || dd.banco === 'HUMANO') return 'fora dos critérios (' + dd.motivo + ')';
      if (margem < 200 && temEmprestimo) return 'margem abaixo de R$ 200 e já tem empréstimo';
      if (h < 8 || h >= 18) return 'fora do horário (8h–18h)';
      const fora = GM_getValue('flash_fora_ate', 0);
      if (fora && Date.now() < fora) return 'flash fora do ar (tentada há pouco; volta a tentar às ' + new Date(fora).toLocaleTimeString('pt-BR').slice(0, 5) + ')';
      // ⚠️ 07/11 17:05 (Stefany): a memória do robô só conhece as flashes que ELE disparou.
      // Consulta feita por ela, pelo Rômulo ou por outro chat era invisível, e o robô ia
      // gastar consulta de novo. A tela do Multicorban diz a verdade: quando o benefício
      // teve IN100/flash, o campo "Data do extrato" vira uma DATA COMPLETA (06/11/2026);
      // sem flash recente ele mostra só o mês (10/2026).
      const dExtrato = dataDoExtrato();
      if (dExtrato) {
        const dias = (Date.now() - dExtrato.getTime()) / 864e5;
        if (dias < FLASH_DIAS)
          return 'já teve consulta em ' + dExtrato.toLocaleDateString('pt-BR') +
                 ' (Data do extrato na tela; limite: 1 a cada ' + FLASH_DIAS + ' dias)';
      }
      const d = flashRecente(f.beneficio);
      if (d) return 'já teve flash em ' + new Date(d).toLocaleDateString('pt-BR') + ' (limite: 1 a cada ' + FLASH_DIAS + ' dias)';
      if (GM_getValue('extrato_hoje', '') === f.beneficio) return 'cliente mandou extrato de hoje';
      return '';
    }

    // preenche o formulário de consulta e envia. A página recarrega.
    async function consultar(modo, beneficio) {
      const op = document.getElementById(modo === 'flash' ? 'consultaOnlineFlash' : 'offline');
      const mat = document.getElementById('matricula');
      if (!op || !mat) throw new Error('não achei as opções da consulta na tela');
      if (!op.checked) { op.click(); await sleep(1500); }
      if (!mat.checked) { mat.click(); await sleep(1200); }   // trocar o tipo reseta para CPF
      const inp = document.getElementById('input');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      inp.focus(); set.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true }));
      for (const ch of String(beneficio)) { set.call(inp, inp.value + ch); inp.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' })); }
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(700);
      const b = [...document.querySelectorAll('button,input[type=submit]')].find(x => x.offsetParent && /Localizar/i.test(x.textContent || x.value || ''));
      if (!b) throw new Error('não achei o botão Localizar');
      b.click();
    }

    // ⚠️ A consulta do Multicorban é AJAX: NÃO recarrega a página. Esperar os dados
    // na própria execução. (Erro de 07/11: o robô disparava a flash e parava ali.)
    const temDados = () => /Descri[çc][ãa]o da Esp[ée]cie/.test(document.body.innerText);
    const aviso = () => [...document.querySelectorAll('.modal.show,.swal2-popup')].filter(x => x.offsetParent)
      .map(x => x.textContent.replace(/\s+/g, ' ').replace(/Fechar/g, '').replace(/^\s*!?\s*Aten[çc][ãa]o!?\s*/i, '').trim())[0] || '';
    async function fecharAviso() {
      for (let k = 0; k < 4 && aviso(); k++) {
        const b = [...document.querySelectorAll('button,.btn-close,[data-bs-dismiss=modal],[data-dismiss=modal]')]
          .filter(x => x.offsetParent)
          .find(x => /^(fechar|ok|×|x)$/i.test((x.textContent || '').trim()) || x.classList.contains('btn-close')
                  || /modal/.test(x.getAttribute('data-bs-dismiss') || x.getAttribute('data-dismiss') || ''));
        if (!b) break;
        b.click(); await sleep(1200);
      }
      return !aviso();
    }
    // true = dados chegaram. false = veio aviso NOVO ou estourou o tempo.
    // ⚠️ o aviso da consulta anterior pode continuar na tela: por isso o `ignorar`.
    async function esperarConsulta(ms = 25000, ignorar = '') {
      const fim = Date.now() + ms;
      while (Date.now() < fim) {
        if (temDados()) return true;
        const a = aviso();
        if (a && a !== ignorar) return false;
        await sleep(500);
      }
      return temDados();
    }

    async function gerarFicha() {
      {
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
        if (margem < 0) log('⚠️ MARGEM NEGATIVA (' + brl(margem) + '): margem estourada, não tem margem.', 'erro');
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
        // ---- conta: HIERARQUIA da Stefany (07/11/2026) ----
        // Onde procurar a conta, nesta ordem. A primeira que tiver, manda.
        //   1. CONSULTA FLASH — é a principal.
        //   2. o que o CLIENTE informou — quando a flash não deu ou ele não se enquadrou.
        //   3. MULTICORBAN (esta tela).
        //   4. NEW CORBAN — Histórico Bancário (o robô da digitação já tenta sozinho).
        //   5. FULLCONSIG — conferência na mão, não tem robô lá. Banco "V8" NÃO vale, desconsiderar.
        // Não achou a conta em nenhum dos cinco:
        //   - tem banco e AGÊNCIA real -> conta = número da agência, dígito = último dígito dela;
        //   - tem só o banco           -> agência e conta aleatórias do procedimento;
        //   - não tem nem o banco      -> /08, pedir a conta ao cliente.
        // Aleatório é só quando a informação não existe: tendo a agência certa, usa ela.
        // ⚠️ Os passos 1 e 2 são do atendimento: se a flash ou o cliente deram a conta,
        //    escreva ela no campo `conta` ANTES de salvar a ficha — ela vence esta tela.
        {
          const agRaw = so(f.agencia), agReal = agRaw.length >= 3 && !/^0+$/.test(agRaw);
          if (so(f.conta)) f.conta_origem = 'Multicorban';
          else if (!so(f.banco)) f.conta_origem = 'SEM BANCO aqui — conferir New Corban e FullConsig; se não houver em nenhum, /08';
          else if (agReal) {
            f.conta_origem = 'sem conta aqui — conferir New Corban e FullConsig (V8 não vale); se não tiverem, usar a derivada da agência';
            f.conta_sugerida = agOk(f.agencia) + '-' + agOk(f.agencia).slice(-1);
          } else {
            f.conta_origem = 'só o banco — conferir New Corban e FullConsig; se não tiverem, agência e conta aleatórias';
          }
        }
        // ---- veredito: por que NÃO atendemos ----
        // ⛔ BLOQUEIO DE EMPRÉSTIMO NÃO ENTRA AQUI. Decisão da Stefany em 07/11/2026:
        //    "Você não analisa bloqueio de empréstimo" — padrão. Nem o rótulo "Bloqueado para
        //    Empréstimo", nem a "Descrição do Bloqueio", nem "Elegível para Empréstimo".
        // formato MOTIVO|tag|o que fazer  -> o robô de desfecho lê isso
        // ⚠️ 07/11 15:55: a ordem é a do Prompt (passo 4) — ESPÉCIE, pensão alimentícia,
        // representante, margem, IDADE. Antes faltavam espécie e idade aqui, e por isso o
        // robô chegava a disparar a consulta flash (que é PAGA) em cliente que já estava
        // fora dos nossos critérios. A flash só pode rodar com `recusa` vazia.
        const espF = String(f.especie || '').padStart(2, '0');
        const idadeF = parseInt(f.idade) || 0;
        f.recusa = '';
        if (LOAS.includes(espF))             f.recusa = 'LOAS|02 I (ou 02 A se margem ≥ R$ 400)|/n30 pela regra do LOAS e FECHAR a conversa';
        else if (espF && !ESPECIES_OK.includes(espF)) f.recusa = 'ESPECIE_FORA|07|/07 — espécie ' + espF + ' não é atendida, e FECHAR a conversa';
        else if (!negativo(f.pensao))        f.recusa = 'PENSAO|07|avisar que não atendemos pensão alimentícia e FECHAR a conversa';
        else if (!negativo(f.representante)) f.recusa = 'REPRESENTANTE|' + (margem >= 20 ? '03 A' : '03 B') + '|/inss13 — não fazemos proposta com representante legal';
        else if (margem < 20)                f.recusa = 'SEM_MARGEM|01 I|/n30';
        else if (idadeF > 76)                f.recusa = 'IDADE|Acima De 80 Anos|acima de 76 anos: fluxo "Início do atendimento" (ordem idade_77), que resolve tudo';
        else if (idadeF >= 74)               f.recusa = 'IDADE_PERGUNTAR|—|74 a 76 anos: perguntar à Stefany ANTES de simular, digitar ou gastar consulta';
        const d = decidirBanco(f);
        f.banco_destino = d.banco;
        if (!f.beneficio) { log('Não achei o benefício. Clique em "Consultar" no benefício ativo antes.', 'erro'); return; }
        // ---- consulta flash: o robô decide e dispara sozinho ----
        if (GM_getValue('flash_agora', '') === f.beneficio) { GM_setValue('flash_agora', ''); f.flash = 'feita agora'; }
        else if (GM_getValue('flash_falhou', '') === f.beneficio) { GM_setValue('flash_falhou', ''); f.flash = 'tentou e falhou — dados da consulta normal'; }
        else {
          const temEmprestimo = num(depois('Parcelas atuais')) > 0 || (num(f.renda) > 0 && margem < num(f.renda) * 0.35 - 0.02);
          const motivo = naoFazerFlash(f, margem, temEmprestimo);
          if (!motivo) {
            log('Flash cabe neste cliente. Disparando…');
            // o flash_pedido serve só para o caso raro de a página recarregar
            GM_setValue('flash_pedido', { beneficio: f.beneficio, t: Date.now(), fase: 'flash' });
            try {
              const antes = aviso();
              await consultar('flash', f.beneficio);
              const ok = await esperarConsulta(25000, antes);
              GM_setValue('flash_pedido', null);
              if (ok) {
                marcarFlash(f.beneficio); GM_setValue('flash_agora', f.beneficio);
                log('Flash concluída com dados novos.', 'ok');
              } else {
                const msg = (aviso() || 'sem resposta').replace(/^[×x!]*\s*Aten[çc][ãa]o!?\s*/i, '').replace(/(No|Cancel|Fechar|OK)+$/i, '').trim();
                log('Flash não trouxe dados (' + msg + '). Seguindo com a consulta normal.', 'erro');
                GM_setValue('flash_falhou', f.beneficio);
                // flash fora do ar: não insistir a cada clique nos próximos 30 min
                if (/n[ãa]o foram encontrado|cr[ée]dito|indispon/i.test(msg)) GM_setValue('flash_fora_ate', Date.now() + 30 * 60 * 1000);
                await fecharAviso();
                const antes2 = aviso();
                await consultar('normal', f.beneficio);
                if (!await esperarConsulta(25000, antes2)) { log('A consulta normal também não voltou. Refaça na mão.', 'erro'); return; }
              }
              return await gerarFicha();   // refaz a ficha com o que está na tela agora
            } catch (er) {
              GM_setValue('flash_pedido', null);
              log('Não consegui disparar a flash: ' + er.message + '. Seguindo com a ficha atual.', 'erro');
              GM_setValue('flash_falhou', f.beneficio);
              return await gerarFicha();
            }
          }
          f.flash = 'não fez — ' + motivo;
        }
        ta.value = fichaParaTexto(f);
        log(`${f.nome} · espécie ${f.especie} · ${f.idade} anos · margem R$ ${brl(margem)} · ${f.situacao || '?'}`);
        log(`Pensão: ${f.pensao || '?'} · Representante: ${f.representante || '?'}`);
        if (f.rmc || f.rcc) log(`RMC: ${f.rmc || '—'} · RCC: ${f.rcc || '—'}`);
        if (f.rep_dados) log('Representante legal: ' + f.rep_dados);
        if (f.conta_origem) log('Conta: ' + f.conta_origem + (f.conta_sugerida ? ' → sugerida ' + f.conta_sugerida : ''));
        if (f.flash) log('Flash: ' + f.flash);
        if (f.recusa) {
          const r = f.recusa.split('|');
          log(`⛔ NÃO ATENDEMOS — ${r[0]}. Tag ${r[1]}. ${r[2]}`, 'erro');
        } else {
          log(`Destino: ${d.banco} — ${d.motivo}`, ['NAO', 'HUMANO'].includes(d.banco) ? 'erro' : 'ok');
          log('↑ isso é pelo valor MÁXIMO da margem. Se o cliente quiser menos, escreva `valor:` (ou troque a `parcela:`) e salve: o banco é recalculado.');
          if (!INVALIDEZ.includes(String(f.especie || '').padStart(2, '0'))) {
            log('Por faixa de valor:');
            faixasBanco(f, margem).forEach(l => log('   ' + l));
          } else {
            log('Invalidez: o banco vem da IDADE, não do valor — qualquer faixa vai para ' + d.banco + '.');
          }
        }
        const ddb = f.ddb.split('/').reverse().join('-'); const dias = (Date.now() - new Date(ddb)) / 864e5;
        if (dias >= 90 && margem >= 20) {
          const h = new Date().getHours();
          if (h >= 8 && h < 18) log(`DDB há ${Math.floor(dias)} dias: confirme a margem no OnlineFlash (8h–18h).`);
          else log(`DDB há ${Math.floor(dias)} dias, mas OnlineFlash só 8h–18h: seguir com a consulta normal.`);
        }
        log('Complete telefone, e-mail e endereço (se o cliente mandou) e clique Salvar ficha.');
      }
    }

    // Depois da flash a página volta com os dados novos: o robô termina sozinho.
    // Se a flash não trouxe nada, refaz a consulta normal e segue.
    (async () => {
      const pedido = GM_getValue('flash_pedido', null);
      if (!pedido || Date.now() - pedido.t > 5 * 60 * 1000) { if (pedido) GM_setValue('flash_pedido', null); return; }
      await sleep(3500);
      const temDados = /Descri[çc][ãa]o da Esp[ée]cie/.test(document.body.innerText);
      if (pedido.fase === 'flash') {
        GM_setValue('flash_pedido', temDados ? null : { beneficio: pedido.beneficio, t: Date.now(), fase: 'normal' });
        if (temDados) { marcarFlash(pedido.beneficio); GM_setValue('flash_agora', pedido.beneficio); log('Flash concluída.', 'ok'); await gerarFicha(); }
        else { log('A flash não trouxe dados. Seguindo com a consulta normal.', 'erro'); await consultar('normal', pedido.beneficio); }
      } else {
        GM_setValue('flash_pedido', null);
        if (temDados) { GM_setValue('flash_falhou', pedido.beneficio); await gerarFicha(); }
        else log('Nem a flash nem a consulta normal trouxeram dados.', 'erro');
      }
    })();

    p.addEventListener('click', async e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'Gerar ficha') await gerarFicha();
      if (a === 'Salvar ficha') {
        const f = textoParaFicha(ta.value);
        if (!f.cpf) { log('Ficha vazia.', 'erro'); return; }
        // ---- o banco depende do VALOR que vai ser feito, não da margem máxima ----
        // Quem tem margem para R$ 25 mil mas só quer R$ 15 mil vai para a FACTA, não para o C6.
        // O valor vem do chat, então o robô não sabe dele na hora de gerar a ficha: decide aqui,
        // quando o atendimento já escreveu `valor:` (o que o cliente quer) ou ajustou a `parcela:`.
        {
          const margem = num(f.margem), pedido = num(f.valor);
          if (pedido > 0) {
            const pNec = pedido * 648.39 / 28400;
            const teto = margem > 0 ? margem - 0.01 : 0;
            if (teto > 0 && pNec > teto) {
              f.parcela = brl(teto);
              log(`R$ ${brl(pedido)} não cabe na margem (teto ≈ R$ ${brl(teto * 28400 / 648.39)}). Usando a parcela máxima R$ ${f.parcela}.`, 'erro');
            } else {
              f.parcela = brl(pNec);
              log(`Valor pedido R$ ${brl(pedido)} → parcela R$ ${f.parcela} em ${f.prazo || 108}x.`);
            }
          }
          const antes = (f.banco_destino || '').toUpperCase();
          const d2 = decidirBanco(f);
          f.banco_destino = d2.banco;
          if (antes && antes !== d2.banco) log(`Banco recalculado pelo valor: ${antes} → ${d2.banco}. ${d2.motivo}`, 'ok');
          else log(`Banco: ${d2.banco} — ${d2.motivo}`);
          ta.value = fichaParaTexto(f);
        }
        GM_setValue('ficha_atual', f);
        if (f.recusa) {
          const r = f.recusa.split('|');
          // deixa a ordem pronta para o robô de desfecho do Botmaker
          try { localStorage.setItem('dins_ficha_recusa', JSON.stringify({ cpf: f.cpf, nome: f.nome, motivo: r[0], tag: r[1], oque: r[2], t: Date.now() })); } catch (er) {}
          log(`Ficha salva como RECUSA (${r[0]}). No Botmaker: tag ${r[1]} · ${r[2]}`, 'erro');
        } else if ((f.banco_destino || '').toUpperCase() === 'QUEROMAIS') {
          log('Ficha salva. Abra o portal do Quero Mais (pelo menu, sem F5) e clique "Fazer tudo".', 'ok');
        } else if (['HUMANO', 'NAO'].includes((f.banco_destino || '').toUpperCase())) {
          log('Ficha salva. Destino: ' + f.banco_destino + ' — ver o REGRAS-BANCO desse banco.', 'ok');
        } else {
          log(`Ficha salva. Abra o New Corban em ?p=${(f.banco_destino || 'facta').toLowerCase()} e clique "Digitar".`, 'ok');
        }
      }
    });
    return;
  }

  // ================================================================== NEW CORBAN
  const pagina = (location.search.match(/p=(facta|c6|qualibank)\b/) || [])[1];
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

  const p = painel('Digitação ' + (pagina === 'qualibank' ? 'QUALIBANK' : pagina.toUpperCase()));
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
    const invalidez = INVALIDEZ.includes(String(f.especie || '').padStart(2, '0'));
    // Qualibank: a tabela é escolhida ANTES de simular, num select. Regra da Stefany:
    // invalidez = tabela de invalidez (566 "Novo 108x 1,85% BEN INVALIDEZ"), demais = normal
    // (631 "Novo 108x 1,85%"). Nunca "Entrante", nunca carência, nunca 96x.
    if (pagina === 'qualibank') {
      const selTab = el('tabela');
      const opts = [...selTab.options].filter(o => o.value && /1,85/.test(o.text) && /108x/.test(o.text)
        && /novo/i.test(o.text) && !/entrante/i.test(o.text) && !/car[êe]ncia|90d/i.test(o.text));
      const alvo = opts.find(o => /inval/i.test(o.text) === invalidez);
      if (!alvo) throw new Error(invalidez
        ? 'Sem tabela de invalidez 108x 1,85% sem carência na Qualibank (esperado 566).'
        : 'Sem tabela normal 108x 1,85% sem carência na Qualibank (esperado 631).');
      if (!setSelect('tabela', alvo.value)) throw new Error('Não consegui escolher a tabela ' + alvo.value + ' na Qualibank.');
      log('Tabela escolhida: ' + alvo.text.trim().slice(0, 60), 'ok');
      await sleep(800);
    }
    el('btn_simular').click();
    const linhas = await esperar(() => {
      const r = [...document.querySelectorAll('table tbody tr')].filter(x => x.offsetParent && /1,85\s*%/.test(x.innerText)
        && !x.classList.contains('bg-light') && !x.classList.contains('iv2-offer-refused') && !/n[ãa]o dispon[íi]vel|n[ãa]o pode|extrapola/i.test(x.innerText));
      return r.length ? r : null;
    }, 30000, 700);
    if (!linhas) throw new Error('Nenhuma tabela 1,85% disponível. Confira a simulação na tela.');
    let cand = linhas.filter(x => /inval/i.test(x.innerText) === invalidez);
    if (!cand.length && pagina !== 'c6') cand = linhas;            // FACTA não separa invalidez
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
    // Qualibank: marcar "Documentos enviados pelo próprio cliente durante a formalização"
    if (pagina === 'qualibank') {
      const ck = el('check-documentos_formalizacao');
      if (ck && !ck.checked) { ck.click(); log('Marcado: documentos enviados pelo cliente na formalização.', 'ok'); }
    }
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
      // ⚠️ O auto-complete do New Corban JÁ preenche banco/agência/conta na tela.
      // Isso é o passo "New Corban" da hierarquia da conta e estava sendo ignorado:
      // o robô dizia "Cliente SEM BANCO" com os campos preenchidos (Elaine, 07/11).
      const tela = { banco: so((el('banco') || {}).value), agencia: so((el('agencia') || {}).value),
                     conta: so((el('conta') || {}).value), dv: so((el('conta_digito') || {}).value) };
      const vale = b => b && !/^0+$/.test(b);
      // Hierarquia: a ficha (flash > cliente > Multicorban) vence a tela; a tela vence o nada.
      // Lembrando que o auto-complete traz o banco ANTIGO do INSS, por isso é o segundo.
      let banco, agRaw, contaCheia, origemConta;
      if (vale(so(f.banco)) && so(f.conta)) { banco = so(f.banco); agRaw = so(f.agencia); contaCheia = so(f.conta); origemConta = 'ficha (Multicorban/flash/cliente)'; }
      else if (vale(tela.banco) && tela.conta) { banco = tela.banco; agRaw = tela.agencia; contaCheia = tela.conta + tela.dv; origemConta = 'New Corban (auto-complete)'; }
      else if (vale(so(f.banco))) { banco = so(f.banco); agRaw = so(f.agencia); contaCheia = ''; origemConta = 'ficha, sem conta'; }
      else if (vale(tela.banco)) { banco = tela.banco; agRaw = tela.agencia; contaCheia = ''; origemConta = 'New Corban, sem conta'; }
      else throw new Error('Cliente SEM BANCO: NÃO gravar. Confira o FullConsig (banco "V8" não vale). Se não houver banco em lugar nenhum, mande o /08 pedindo a conta.');
      banco = banco.padStart(3, '0');
      const agencia = agOk(agRaw);
      let conta, dv;
      if (contaCheia) { dv = contaCheia.slice(-1); conta = contaCheia.slice(0, -1); }
      else if (so(agRaw).length >= 3 && !/^0+$/.test(so(agRaw))) {
        // agência certa na mão: o número dela vira a conta, e o último dígito dela vira o DV.
        conta = agencia; dv = agencia.slice(-1); origemConta = 'derivada da agência ' + agencia;
      } else {
        const n = Math.max(GM_getValue('conta_seq', 14), 14);
        conta = String(n); dv = '8'; GM_setValue('conta_seq', n + 1);
        origemConta = 'aleatória da sequência (não havia agência)';
      }
      if (pagina === 'facta' || pagina === 'qualibank') { if (!setSelect('banco', banco)) log('Banco ' + banco + ' não existe na lista do ' + pagina.toUpperCase() + '.', 'erro'); }
      else setv('banco', banco);
      setv('agencia', agencia); setv('conta', conta); setv('conta_digito', dv);
      log(`Conta: ${banco} ag ${agencia} cc ${conta}-${dv} — ${origemConta}.`, /aleat|derivada/.test(origemConta) ? 'erro' : 'ok');
      // Caixa é poupança (regra do projeto; o robô do BMG já fazia assim).
      const tc = el('tipo_conta');
      if (tc) {
        const alvo = [...tc.options].find(o => (banco === '104' ? /poupan/i : /corrente/i).test(o.text));
        if (alvo && tc.value !== alvo.value) {
          if ($ && $(tc).selectpicker) { $(tc).selectpicker('val', alvo.value); $(tc).trigger('change'); }
          else { tc.value = alvo.value; tc.dispatchEvent(new Event('change', { bubbles: true })); }
          log('Tipo de conta: ' + alvo.text + (banco === '104' ? ' (Caixa)' : ''));
        }
      }
    }
    if (pagina === 'c6' || pagina === 'qualibank') {   // C6 e Qualibank também pedem o banco do benefício
      ['banco', 'agencia', 'conta', 'conta_digito'].forEach(k => { if (el('beneficio_' + k) && !el('beneficio_' + k).value) setv('beneficio_' + k, el(k).value); });
    }
    // FACTA/Qualibank: confere se o banco visível bate com o valor real
    if (pagina === 'facta' || pagina === 'qualibank') {
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
