// Dinseguro - código principal do robô (carregado pelo dinseguro.user.js). Versão: 3.35


(function () {
  'use strict';
  // 5.64 (Stefany 12/11 19:18: "um robô por aba") — 1) temporizadores por Worker no Botmaker: aba que não está na frente não fica
  // freada pelo Chrome (1 vez por minuto); 2) junção de GM_setValue entre abas: cada aba grava só o que ELA mudou desde a leitura.
  const { setTimeout, setInterval, clearTimeout, clearInterval } = (() => {
    const N = { setTimeout: window.setTimeout.bind(window), setInterval: window.setInterval.bind(window), clearTimeout: window.clearTimeout.bind(window), clearInterval: window.clearInterval.bind(window) };
    if (location.host !== 'go.botmaker.com' || !/moduleForward\/chats/.test(location.pathname)) return N;
    try {
      const w = new Worker(URL.createObjectURL(new Blob(['const m=new Map();onmessage=e=>{const d=e.data;if(d.c){clearTimeout(m.get(d.id));clearInterval(m.get(d.id));m.delete(d.id);return;}if(d.r)m.set(d.id,setInterval(()=>postMessage(d.id),d.ms));else m.set(d.id,setTimeout(()=>{m.delete(d.id);postMessage(d.id);},d.ms));};'], { type: 'text/javascript' })));
      const cb = new Map(); let n = 1, morto = false;
      w.onmessage = e => { const f = cb.get(e.data); if (!f) return; if (!f.r) cb.delete(e.data); try { f.fn(...f.a); } catch (er) { console.error(er); } };
      w.onerror = () => { if (morto) return; morto = true; cb.forEach((f, id) => { f.nat = f.r ? N.setInterval(f.fn, f.ms, ...f.a) : N.setTimeout(f.fn, f.ms, ...f.a); }); };
      const marca = (fn, ms, a, r) => { if (typeof fn !== 'function') return r ? N.setInterval(fn, ms) : N.setTimeout(fn, ms); ms = Math.max(0, +ms || 0);
        if (morto) return r ? N.setInterval(fn, ms, ...a) : N.setTimeout(fn, ms, ...a); const id = 'w' + (n++); cb.set(id, { fn, ms, a, r }); w.postMessage({ id, ms, r }); return id; };
      const tira = id => { if (typeof id === 'string' && id[0] === 'w') { const f = cb.get(id); cb.delete(id); if (f && f.nat) { N.clearTimeout(f.nat); N.clearInterval(f.nat); } w.postMessage({ id, c: 1 }); } else { N.clearTimeout(id); N.clearInterval(id); } };
      return { setTimeout: (fn, ms, ...a) => marca(fn, ms, a, 0), setInterval: (fn, ms, ...a) => marca(fn, ms, a, 1), clearTimeout: tira, clearInterval: tira };
    } catch (e) { return N; }
  })();
  try {
    const _gGet = GM_getValue, _gSet = GM_setValue, SNAP = new Map();
    const JUNTA = /^(regua|espera|espera_hist|auto_ordens|pos_pago|nao_interferir|retorno_feito|golpe_feito|tag_audit|depois_resp|valor_nota|hist_expandido)$/;
    const multi = () => { try { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^dins_aba_/.test(k)) { const v = JSON.parse(localStorage.getItem(k) || '{}'); if (Date.now() - (+v.t || 0) < 60000 && v.papel !== 'vigia') n++; } } return n > 1; } catch (e) { return false; } };
    const obj = v => v && typeof v === 'object' && !Array.isArray(v);
    const J = v => JSON.stringify(v);
    GM_getValue = (k, d) => { const v = _gGet(k, d); if (JUNTA.test(k) && obj(v)) {   /* 5.77 (Ester/Vms sumiram da régua às 21h: aba que esteve congelada gravou a régua velha por cima) — junta SEMPRE, não só com várias abas vivas */ try { SNAP.set(k, J(v)); } catch (e) {} } else SNAP.delete(k); return v; };
    GM_setValue = (k, v) => {
      try { if (JUNTA.test(k) && obj(v) && SNAP.has(k)) { const sb = SNAP.get(k), cur = _gGet(k, null);
        if (obj(cur) && J(cur) !== sb) {   // outra aba gravou depois da nossa leitura → junta só o que mudamos
          const base = JSON.parse(sb), out = cur;
          for (const id of new Set([...Object.keys(base), ...Object.keys(v)])) { const a = base[id], b = v[id]; if (J(a) === J(b)) continue;
            if (b === undefined) { delete out[id]; continue; }
            if (obj(a) && obj(b) && obj(out[id])) { for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) { if (J(a[f]) !== J(b[f])) { if (b[f] === undefined) delete out[id][f]; else out[id][f] = b[f]; } } }
            else out[id] = b; }
          v = out; } } } catch (e) {}
      _gSet(k, v); if (SNAP.has(k)) { try { SNAP.set(k, J(v)); } catch (e) {} } };
  } catch (e) {}

  const VERSAO = '6.10';
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

  // A janela de fim de semana (Stefany, 07/11/2026 14:55) foi REVOGADA por ela em
  // 08/11/2026 10:18: abaixo de R$ 6 mil vai para a Qualibank todos os dias.
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
  // 4.76: mensagem-modelo de campanha mandada com nome de pessoa (não é atendimento humano)
  const TEMPLATE_PESSOA = /Dei uma olhada no seu caso|n[ãa]o deixe dinheiro na mesa|Posso te enviar agora o resumo/i;
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
    if (parcela < 25) return { banco: 'NAO', motivo: 'Margem abaixo de R$ 25: /n30.' };   // 5.16
    if (idade > 76) return { banco: 'NAO', motivo: 'Acima de 76 anos: não fazemos.' };
    if (idade >= 74) return { banco: 'HUMANO', motivo: '74 a 76 anos: perguntar à Stefany antes de simular ou digitar.' };
    if (esp === '87' || esp === '88') return { banco: 'HUMANO', motivo: 'LOAS (87/88): regra própria, não fazemos proposta.' };
    const nota = ` · liberado estimado R$ ${brl(liberado)}`;
    if (inval) {
      if (idade >= 60) return { banco: 'FACTA', motivo: 'Invalidez 60–73: FACTA mesmo acima de R$ 20 mil' + nota };
      if (idade >= 58) return { banco: 'QUALIBANK', motivo: 'Invalidez 58–59: Qualibank, tabela de invalidez (566), 108x' + nota };
      if (idade >= 53) return { banco: 'C6', motivo: 'Invalidez 53–57: C6, sempre 108x' + nota };
      if (idade >= 40) return { banco: 'DAYCOVAL', motivo: 'Invalidez 40–52: Daycoval (Stefany 12/11 10:55: o que ia para o Quero Mais volta para o Daycoval — mesmo sistema)' + nota };
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
    // Mudança da Stefany, 08/11/2026 10:18: abaixo de R$ 6 mil vai para a QUALIBANK
    // SEMPRE, inclusive no fim de semana. Isso REVOGA a janela de fim de semana de
    // 07/11 14:55, que mandava esses clientes para o C6 de sexta 17h a domingo.
    return { banco: 'QUALIBANK', motivo: 'Abaixo de R$ 6 mil, não é invalidez nem pensão <45: Qualibank, tabela normal (631)' + nota };
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
  // 3.87 — TRAVA DE BANCO (Stefany 10/11 14:19, caso Marcio: "deixe isso anotado no robô, porque você não pode errar isso").
  // O banco sai SÓ da ficha (decidirBanco: espécie + idade). INVALIDEZ por idade:
  //   até 39 → C6 · 40–52 → DAYCOVAL (5.08; Quero Mais saiu — NUNCA FACTA) · 53–57 → C6 · 58–59 → QUALIBANK (566) · 60–73 → FACTA.
  // Não invalidez: C6 → FACTA → Qualibank 631; Não Perturbe → Qualibank.
  // Banco que falhou NÃO decide o próximo: conta recusada no Quero Mais → numeração em sequência (3.86), não outro banco.
  // Só passa se a ficha tiver a linha  banco_ordem_stefany: <BANCO>  (ordem dela, escrita à mão na ficha).
  const RESERVA = { QUEROMAIS: ['DAYCOVAL'], DAYCOVAL: [] };   // 5.08: Daycoval é o banco principal da faixa 40–52 da invalidez
  function bancoErrado(f, tela) {
    const dest = String(f.banco_destino || '').toUpperCase(), aqui = String(tela || '').toUpperCase();
    if (!dest || !aqui || dest === aqui) return '';
    if ((RESERVA[dest] || []).includes(aqui)) return '';
    if (String(f.banco_ordem_stefany || '').toUpperCase() === aqui) return '';
    // 4.44 (Stefany 11:11: "Ordem Stefany saiu, não existe mais"): quem NÃO é invalidez segue a hierarquia sozinho —
    // C6 → FACTA → QUALIBANK — quando o banco anterior reprova/não serve (caso Jairo: C6 "Reprovado Política Interna 66").
    const CADEIA = ['C6', 'FACTA', 'QUALIBANK'];
    const inval = (typeof INVALIDEZ !== 'undefined') && INVALIDEZ.includes(String(f.especie || '').padStart(2, '0'));
    if (!inval && CADEIA.includes(dest) && CADEIA.indexOf(aqui) > CADEIA.indexOf(dest)) return '';
    return `⛔ BANCO ERRADO: a ficha é para ${dest} (espécie ${f.especie || '?'}, ${f.idade || '?'} anos) e esta tela é ${aqui}. ` +
      `Invalidez: ≤39 C6 · 40–52 DAYCOVAL · 53–57 C6 · 58–59 QUALIBANK · 60–73 FACTA. Não invalidez: C6 → FACTA → Qualibank.`;
  }
  // 4.04 — TRAVA DO TELEFONE (Stefany 10/11 16:28, caso Vilson: "Você digitou Wilson no quali com o telefone errado. E isso não pode acontecer").
  // O telefone da proposta é SEMPRE o WhatsApp do atendimento (o número do chat do Botmaker), nunca o do cadastro do Multicorban.
  // O robô do Botmaker guarda CPF → WhatsApp de cada chat aberto (GM 'zap_por_cpf'); a ficha puxa dali e marca telefone_origem.
  // Sem essa marca, NADA é digitado. Exceção à mão: escrever na ficha  telefone_origem: WhatsApp (conferido pelo vigia)
  // 4.95 (Stefany 12/11 09:02: "A preferência é do atendimento… a varredura fica em segundo plano. Espera acabar o atendimento, depois reativa a varredura")
  // Atendimento pendente = cliente da fila que o robô ainda não leu / andou depois da leitura, ordem automática em andamento, ou alerta lido há menos de 30 min.
  const atendimentoPendente = soTela => { try {   // 6.01: soTela = só o que precisa da TELA do Botmaker (consulta/digitação nos bancos não segura a varredura)
    if (localStorage.getItem('dins_ordem')) return true;
    const FL = JSON.parse(localStorage.getItem('dins_fila') || '[]'); const RR = GM_getValue('regua', {}) || {}; const NM = GM_getValue('nao_mexer', {}) || {}; const AO = GM_getValue('auto_ordens', {}) || {};
    if (Object.values(AO).some(o => o && (soTela ? ['link'] : ['nova', 'consultando', 'ficha_ok', 'digitando', 'pronto', 'gravando', 'gravada', 'link']).includes(o.estado) && Date.now() - (o.t || 0) < 40 * 60000)) return true;
    return FL.some(f => { const id = f.id; if (!id || id === 'F20QOEL8YYLQN2S6SR47' || NM[id]) return false; const q = RR[id]; if (!q) return true; if (q.comQuem) return false;
      return !!q.reler || (+q.listaT || 0) > (+q.lidoT || 0) || (q.estado === 'alerta' && Date.now() - (+q.lidoT || 0) < 30 * 60000); });
  } catch (e) { return false; } };
  const zapDoCpf = cpf => { const c = String(cpf || '').replace(/\D/g, ''); const ZM = GM_getValue('zap_por_cpf', {}) || {}; const z = ZM[c] || ZM[c.padStart(11, '0')] || ZM[c.replace(/^0+/, '')];   /* 4.92: CPF com zero na frente (Multicorban mostra sem o zero — caso Ronaldo) */ if (!z || !z.fone) return ''; let t = String(z.fone).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); if (t.length === 10 && /[6-9]/.test(t[2])) t = t.slice(0, 2) + '9' + t.slice(2); return t; };   // 4.05: WhatsApp vem sem o 9 → celular com 9
  function telefoneErrado(f) {
    let t = String(f.telefone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); if (t.length === 10 && /[6-9]/.test(t[2])) t = t.slice(0, 2) + '9' + t.slice(2);
    if (!/^WhatsApp/i.test(String(f.telefone_origem || ''))) return '⛔ TELEFONE NÃO CONFERIDO: o telefone da proposta tem que ser o WhatsApp do cliente (o do chat do Botmaker), não o do cadastro. Abra o chat dele no Botmaker, gere a ficha de novo, ou escreva o WhatsApp na ficha com a linha  telefone_origem: WhatsApp (conferido pelo vigia).';
    if (t.length < 10) return '⛔ Falta o telefone (WhatsApp do cliente) na ficha.';
    const z = zapDoCpf(f.cpf); if (z && z !== t) { f.telefone = z; f.telefone_origem = 'WhatsApp do chat do Botmaker (corrigido pelo robô 6.10: a ficha tinha ' + t + ')'; try { if (typeof log === 'function') log('Telefone da ficha trocado pelo WhatsApp do chat deste CPF.', 'aviso'); } catch (e) {} return ''; }   // 6.10 (Stefany 13:53 "conserte o robô"): o WhatsApp do chat vence — corrige em vez de parar
    return '';
  }
  // 4.09 — PRAZO CURTO NÃO SE DIGITA (Stefany 10/11 17:41: "36 vezes... até simular, ok, no último caso. Digitar em 36 vezes, a gente não te autoriza").
  // Gravar com prazo abaixo de 96x só com a linha  prazo_ordem_stefany: <N>  na ficha.
  function prazoProibido(f, prazoTela) {
    const pz = parseInt(String(prazoTela || f.prazo || '108').replace(/\D/g, ''), 10) || 108;
    if (pz >= 96) return '';
    if (parseInt(String(f.prazo_ordem_stefany || '').replace(/\D/g, ''), 10) === pz) return '';
    return `⛔ PRAZO ${pz}x: prazo curto só se SIMULA (último caso) — NÃO se grava sem ordem da Stefany (linha prazo_ordem_stefany: ${pz}). Use 96x ou 108x.`;
  }
  const CAMPOS = ['recusa', 'banco_destino', 'nome', 'cpf', 'beneficio', 'especie', 'idade', 'ddb', 'parcela', 'valor', 'prazo', 'telefone', 'telefone_origem', 'email',
    'nascimento', 'mae', 'sexo', 'renda', 'uf', 'cep', 'endereco', 'numero', 'bairro', 'cidade', 'banco', 'agencia', 'conta', 'tipo_conta',
    // campos de ANALISE: nao vao para a digitacao, servem para decidir se atendemos
    'margem', 'rmc', 'rcc', 'rg', 'situacao', 'pensao', 'representante', 'rep_dados', 'conta_origem', 'conta_sugerida', 'flash', 'banco_ordem_stefany', 'prazo_ordem_stefany'];
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

  // ================================================================== 4.18 ESTEIRA DO BANCO → QUADRO
  // Stefany 10/11 19:22 ("pode fazer"): o robô lê sozinho a lista de Propostas do New Corban (a coluna "Status Banco" e o
  // status real do balão: "12 - AGUARDANDO ASSINATURA DIGITAL", "215 - AGUARDA AVERBACAO - ASSINATURA DIGITAL OK", "AVERBE JA",
  // "AGUARDA ANUENCIA"…) e guarda por LINK e por CPF em GM 'esteira'. O quadro do Botmaker mostra e escolhe o próximo passo.
  // Deixe uma aba do New Corban aberta em ?p=propostas: ela atualiza a lista a cada 5 min (botão ↻ da própria página).
  if (window.top === window && /newcorban\.com\.br/.test(location.host)) {
    const lerEsteira = () => {
      if (!/[?&]p=propostas/.test(location.search)) return 0;
      const linhas = [...document.querySelectorAll('table tbody tr')].filter(r => r.children.length >= 6);
      if (!linhas.length) return 0;
      const E = GM_getValue('esteira', {}) || {}; const agora = Date.now(); let n = 0;
      for (const r of linhas) {
        const c = [...r.children];
        const cpf = ((c[1].innerText.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/) || [])[0] || '').replace(/\D/g, '');
        const nome = (c[1].innerText.split('\n').map(x => x.trim()).filter(x => x && !/^[A-Z]{2}$/.test(x))[0] || '').trim();
        const link = ([...r.querySelectorAll('[data-bs-content]')].map(e => e.getAttribute('data-bs-content')).find(v => /^https?:\/\//.test(v || '')) || ([...r.querySelectorAll('[onclick]')].map(e => ((e.getAttribute('onclick') || '').match(/copyString\('(https?:\/\/[^']+)'\)/) || [])[1]).find(Boolean)) || '').trim();   // 5.93: link também do botão copiar (copyString)
        const badge = c[5] && c[5].querySelector('.badge');
        const statusBanco = badge ? badge.innerText.trim() : (c[5] ? c[5].innerText.trim() : '');
        const real = badge ? (badge.getAttribute('data-bs-content') || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
        const status = c[4] ? c[4].innerText.trim() : '';
        const banco = ((c[2].innerText.match(/Banco ([A-Za-z0-9 ]+)|(FACTA|C6|QUALIBANK|Quali[a-z]*|Quero Mais|Daycoval|Presen[cç]a|BMG)/i) || [])[0] || '').replace(/\s+INSS$/, '').trim();
        const reg = { cpf, nome, link, banco, status, statusBanco, real, t: agora };
        if (link) E['L:' + link] = reg; if (cpf) E['C:' + cpf + ':' + (link || status)] = reg; n++;
      }
      for (const k in E) if (agora - (E[k].t || 0) > 3 * 24 * 3600000) delete E[k];   // limpa o que tem mais de 3 dias
      GM_setValue('esteira', E); GM_setValue('esteira_t', agora); return n;
    };
    // mostra 100 por página (o padrão de 15 deixava a maioria de fora) e lê de novo quando a tabela carregar
    const cemPorPagina = () => { const sel = [...document.querySelectorAll('select')].find(x => /_length$/.test(x.name || '') || [...x.options].some(o => o.value === '100') && [...x.options].some(o => o.value === '15'));
      if (sel && sel.value !== '100' && [...sel.options].some(o => o.value === '100')) { sel.value = '100'; sel.dispatchEvent(new Event('change', { bubbles: true })); try { const jq = (typeof unsafeWindow !== 'undefined' && unsafeWindow.jQuery) || window.jQuery; jq && jq(sel).trigger('change'); } catch (e) {} return true; } return false; };
    // 4.20a: mudar o "Mostrar N" por script esvazia a tabela do New Corban (ela é carregada pelo servidor) → não mexe; só lê.
    // 4.20b: 100 por página pelo jQuery da própria página (o servidor recarrega), só quando a tabela já tem linhas
    const cem = () => { try { const jq = (typeof unsafeWindow !== 'undefined' && unsafeWindow.jQuery) || window.jQuery; const sel = document.querySelector('select[name$="_length"]');
      if (jq && sel && sel.value !== '100' && document.querySelectorAll('table tbody tr td').length > 3) { jq(sel).val('100').trigger('change'); return true; } } catch (e) {} return false; };
    [8000, 20000, 40000].forEach(ms => setTimeout(() => { if (/[?&]p=propostas/.test(location.search)) { cem(); setTimeout(lerEsteira, 8000); } }, ms));
    setInterval(() => {
      if (!/[?&]p=propostas/.test(location.search)) return;
      if (document.querySelector('.modal.show')) return;                       // ninguém mexendo num modal
      const b = document.getElementById('esteira_refresh'); if (b) b.click();
      setTimeout(lerEsteira, 8000);
    }, 5 * 60 * 1000);
    // 5.93 (Stefany 13/11 10:05: "só ir lá buscar no New Corban, a proposta já está pronta, o link está lá"): com proposta gravada esperando link,
    // a aba ?p=propostas atualiza a lista de 1 em 1 min (não 5) para o digitador achar o link pela lista.
    setInterval(() => { try { if (!/[?&]p=propostas/.test(location.search) || document.querySelector('.modal.show')) return;
      const AO = GM_getValue('auto_ordens', {}) || {}; if (!Object.values(AO).some(o => o && o.estado === 'gravada' && Date.now() - (+o.t || 0) < 3 * 3600000)) return;
      const b = document.getElementById('esteira_refresh'); if (b) b.click(); setTimeout(lerEsteira, 8000); } catch (e) {} }, 60000);
    window.dinsEsteiraLer = lerEsteira; try { if (typeof unsafeWindow !== 'undefined') { unsafeWindow.dinsEsteiraLer = lerEsteira; unsafeWindow.dinsEsteiraVer = () => GM_getValue('esteira', {}); } } catch (e) {}
  }

  // ================================================================== 4.20 CONTORNO AUTOMÁTICO — EXECUTORES
  // Stefany 10/11 19:41 ("pode começar a construção"). Ordem em GM 'auto_ordens' (criada pelo quadro do Botmaker).
  // Multicorban: nova → consultando → ficha_ok (consulta o CPF, gera a ficha com o valor escolhido e salva).
  // New Corban (aba que NÃO está em ?p=propostas): ficha_ok → digitando → pronto (Carregar ficha + Digitar; para antes do Gravar).
  // Qualquer coisa fora do padrão → estado 'erro' com o motivo, e o vigia faz à mão.
  if (window.top === window && /multicorban\.com|newcorban\.com\.br/.test(location.host)) {
    const AO = () => GM_getValue('auto_ordens', {}) || {};
    const poeAO = (h, mud) => { const O = AO(); if (!O[h]) return; Object.assign(O[h], mud); (O[h].hist = O[h].hist || []).push(new Date().toTimeString().slice(0, 5) + ' ' + (mud.estado || '') + (mud.erro ? ': ' + mud.erro : '')); GM_setValue('auto_ordens', O); };
    const zz = ms => new Promise(r => setTimeout(r, ms));
    const botaoRobo = t => [...document.querySelectorAll('button[data-a]')].find(b => b.dataset.a === t);
    const logRobo = () => [...document.querySelectorAll('div')].filter(d => /^\d\d:\d\d /.test(d.innerText || '') && d.children.length === 0).map(d => d.innerText);
    let ocupadoAuto = false;
    // 5.37 (caso Ramon 16:04: ordem 'nova' parada 15 min): campo com foco e texto parado há mais de 60 s não é gente digitando → solta o foco e segue
    let ultDigitT = 0; ['keydown', 'input', 'mousedown'].forEach(ev => document.addEventListener(ev, e => { if (e.isTrusted) ultDigitT = Date.now(); }, true));
    const ninguemMexendo = () => { if (document.querySelector('.modal.show')) return false;
      const a = document.activeElement; if (!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.value)) return true;
      if (Date.now() - ultDigitT > 60000) { try { a.blur(); } catch (e) {} return true; } return false; };
    // ---------- Multicorban
    // 5.04 (12/11 10:06: Alexandre e Franco presos em "consultando" depois de recarregar a aba): consulta interrompida volta para a fila
    if (/multicorban\.com/.test(location.host)) setTimeout(() => { try { const O = AO(); let m = false; for (const h in O) { const x = O[h]; if (x && x.estado === 'consultando' && Date.now() - (x.tMc || x.t || 0) > 2 * 60000) { x.estado = 'nova'; (x.hist = x.hist || []).push(new Date().toTimeString().slice(0, 5) + ' consulta interrompida (aba recarregada) → de novo'); m = true; } } if (m) GM_setValue('auto_ordens', O); } catch (e) {} }, 4000);
    if (/multicorban\.com/.test(location.host)) setInterval(async () => {
      if (sessionStorage.getItem('dins_mc_manual') === '1') return;   // 5.75 (Stefany 21:02: "uma para você e uma para ele"): aba do Multicorban do VIGIA — o robô não pega ordem aqui
      if (ocupadoAuto || !/search\/form\/inss/.test(location.pathname + location.href) || !ninguemMexendo()) return;
      const o = Object.values(AO()).find(x => x.estado === 'nova'); if (!o) return;
      ocupadoAuto = true; poeAO(o.hash, { estado: 'consultando', tMc: Date.now() });
      try {
        const off0 = document.getElementById('offline'); if (off0 && !off0.checked) { off0.click(); await zz(800); }   // 4.72: sempre consulta normal (nunca flash sem querer)
        const r = document.getElementById('cpf'); if (r && !r.checked) { r.click(); await zz(800); }
        const sel = document.getElementById('inputGroupSelect02'); if (sel) { const op = [...sel.options].find(x => /Vers[aã]o 1/i.test(x.text)); if (op) { sel.value = op.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } }
        const inp = document.getElementById('input'); if (!inp) throw new Error('campo de busca não apareceu (sessão caiu?)');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, o.cpf); inp.dispatchEvent(new Event('input', { bubbles: true }));
        await zz(500); const loc = document.getElementById('localizar'); if (!loc) throw new Error('botão Localizar não apareceu'); loc.click();
        await zz(9000);
        const naoAchou = [...document.querySelectorAll('.swal2-title,h2')].some(e => /Aten[çc][ãa]o/.test(e.innerText)) && /não localizamos/i.test(document.body.innerText);
        if (naoAchou) {
          const f = [...document.querySelectorAll('button')].find(b => /^Fechar$/.test(b.innerText.trim())); f && f.click(); await zz(1000);
          // 4.72: tenta também como MATRÍCULA (procedimento do "não localizado"); não achou de novo → desfecho automático
          let achouMat = false;
          if (o.tipo === 'cpf') {
            const m = document.getElementById('matricula'); const off = document.getElementById('offline');
            if (off && !off.checked) { off.click(); await zz(800); }
            if (m && !m.checked) { m.click(); await zz(900); }
            const inp2 = document.getElementById('input');
            if (inp2) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp2, o.cpf); inp2.dispatchEvent(new Event('input', { bubbles: true })); await zz(500); document.getElementById('localizar').click(); await zz(9000); }
            const nao2 = [...document.querySelectorAll('.swal2-title,h2')].some(e => /Aten[çc][ãa]o/.test(e.innerText)) && /não localizamos/i.test(document.body.innerText);
            if (nao2) { const f2 = [...document.querySelectorAll('button')].find(b => /^Fechar$/.test(b.innerText.trim())); f2 && f2.click(); }
            else achouMat = /Descri[çc][ãa]o da Esp[ée]cie/.test(document.body.innerText) || [...document.querySelectorAll('tr')].some(tr => /\bATIVO\b/.test(tr.innerText));
            await zz(600); const off2 = document.getElementById('offline'); if (off2 && !off2.checked) off2.click(); await zz(500); const c2 = document.getElementById('cpf'); if (c2 && !c2.checked) c2.click();
            if (!achouMat) { poeAO(o.hash, { estado: 'desfecho', acao: 'nao_localizado', resumo: 'CPF não localizado (CPF e matrícula)' }); return; }
            throw new Error('achou como MATRÍCULA (o número mandado é benefício) — vigia confere');
          }
          throw new Error('CPF não localizado no Multicorban');
        }
        // 4.20d: um benefício só → o Multicorban já abre o detalhe; vários → lista com "Consultar" em cada linha
        const temDetalhe = () => /Descri[çc][ãa]o da Esp[ée]cie/.test(document.body.innerText);
        if (temDetalhe()) {
          if (!/Situa[çc][ãa]o\s*\n?\s*ATIVO\b/.test(document.body.innerText)) throw new Error('benefício não está ATIVO');
        } else {
          // 5.02 (Stefany 12/11 09:56, caso Paola): REGRA DOS VÁRIOS BENEFÍCIOS (erro 72 + B1–B8 de 07/11):
          //  • ler TODAS as linhas; só ATIVO conta (cessado não);
          //  • MESMO número de benefício em mais de uma linha → vale uma só: a mais recente (DDB) e ativa;
          //  • consignável = espécie atendida (ESPECIES_OK); LOAS 87/88 tem regra própria (só se não houver outro);
          //  • NÚMEROS DIFERENTES consignáveis → o cliente tem mais de um benefício: consultar CADA UM (ficha) e
          //    – só um com margem → segue com esse; – os dois com margem → os DOIS são levados (vigia simula e manda os dois: B1/B7);
          //    – nenhum com margem → desfecho normal (sem margem), só depois de olhar todos.
          const linhasB = () => [...document.querySelectorAll('tr')].filter(tr => [...tr.querySelectorAll('button,a')].some(e => /^Consultar$/i.test(e.innerText.trim())));
          const infoB = tr => { const c = [...tr.querySelectorAll('td')].map(td => td.innerText.trim()); return { mat: c.find(t => /^\d{8,11}$/.test(t)) || '', esp: String(+(c.find(t => /^\d{1,2}$/.test(t)) || 0)).padStart(2, '0'), ddb: c.find(t => /^\d{2}\/\d{2}\/\d{4}$/.test(t)) || '', ativo: /\bATIVO\b/.test(tr.innerText), valor: c.find(t => /R\$/.test(t)) || '' }; };
          const ordData = d => d.split('/').reverse().join('');
          const ativosB = linhasB().map(infoB).filter(x => x.ativo);
          if (!ativosB.length) throw new Error('nenhum benefício ATIVO');
          const porMat = {}; for (const x of ativosB) { const k = x.mat || ('?' + Math.random()); if (!porMat[k] || ordData(x.ddb) > ordData(porMat[k].ddb)) porMat[k] = x; }
          const unicos = Object.values(porMat);
          const consig = unicos.filter(x => ESPECIES_OK.includes(x.esp) && !['87', '88'].includes(x.esp));
          const loasB = unicos.filter(x => ['87', '88'].includes(x.esp));
          const cands = consig.length ? consig : (loasB.length ? loasB : unicos);   // nenhum consignável → abre o primeiro (a ficha dá o desfecho da espécie)
          const abrirMat = async mat => { let tr = linhasB().find(t => infoB(t).mat === mat && /\bATIVO\b/.test(t.innerText));
            if (!tr) { // voltar para a lista: refaz a busca pelo CPF (nunca history.back)
              const off1 = document.getElementById('offline'); if (off1 && !off1.checked) { off1.click(); await zz(800); } const r1 = document.getElementById('cpf'); if (r1 && !r1.checked) { r1.click(); await zz(800); }
              const in1 = document.getElementById('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(in1, o.cpf); in1.dispatchEvent(new Event('input', { bubbles: true })); await zz(500); document.getElementById('localizar').click();
              for (let i = 0; i < 15 && !(tr = linhasB().find(t => infoB(t).mat === mat && /\bATIVO\b/.test(t.innerText))); i++) await zz(1000); }
            if (!tr) throw new Error('não achei de novo a linha do benefício ' + mat.slice(-4));
            [...tr.querySelectorAll('button,a')].find(e => /^Consultar$/i.test(e.innerText.trim())).click();
            for (let i = 0; i < 20 && !/Descri[çc][ãa]o da Esp[ée]cie/.test(document.body.innerText); i++) await zz(1000); };
          if (cands.length > 1) {
            const res = [];
            for (const c of cands) {
              await abrirMat(c.mat);
              [...document.querySelectorAll('textarea')].forEach(t => { if (/^cpf:/m.test(t.value)) t.value = ''; });
              const g0 = botaoRobo('Gerar ficha'); if (!g0) throw new Error('painel do robô (Gerar ficha) não está na tela'); g0.click();
              let t0 = null; for (let i = 0; i < 75; i++) { await zz(1000); t0 = [...document.querySelectorAll('textarea')].find(t => new RegExp('^cpf: *0*' + o.cpf.replace(/^0+/, ''), 'm').test(t.value) && new RegExp('^beneficio: *0*' + c.mat.replace(/^0+/, ''), 'm').test(t.value)); if (t0) break; }
              if (!t0) throw new Error('a ficha do benefício ' + c.mat.slice(-4) + ' não foi gerada');
              const f0 = textoParaFicha(t0.value); const m0 = parseFloat(String(f0.margem || '').replace(/[^\d,\-]/g, '').replace(',', '.')) || 0;
              res.push({ mat: c.mat, esp: c.esp, margem: m0, recusa: (f0.recusa || '').split('|')[0] });
            }
            const comM = res.filter(x => x.margem >= 25 && !x.recusa);
            const desc = res.map(x => 'esp ' + x.esp + ' …' + x.mat.slice(-4) + ' margem R$ ' + x.margem.toFixed(2).replace('.', ',') + (x.recusa ? ' (' + x.recusa + ')' : '')).join(' · ');
            if (comM.length >= 2) { poeAO(o.hash, { estado: 'com_margem', resumo: 'DOIS benefícios consignáveis com margem: ' + desc + ' → VIGIA: simular e mandar os DOIS (B1/B7), banco pela espécie e idade de cada um' }); return; }
            const alvoB = comM[0] || res[0];
            await abrirMat(alvoB.mat);
            poeAO(o.hash, { estado: 'consultando', resumo: 'vários benefícios: ' + desc + ' → seguiu com …' + alvoB.mat.slice(-4) });
          } else {
            await abrirMat(cands[0].mat);
          }
          [...document.querySelectorAll('textarea')].forEach(t => { if (/^cpf:/m.test(t.value)) t.value = ''; });   // não aproveitar ficha de outro benefício
        }
        for (let i = 0; i < 20 && !/Descri[çc][ãa]o da Esp[ée]cie/.test(document.body.innerText); i++) await zz(1000);
        if (!/Descri[çc][ãa]o da Esp[ée]cie/.test(document.body.innerText)) throw new Error('a consulta do benefício não abriu');
        if (o.tipo === 'cpf' && o.aceite && (+o.valorBot || 0) >= 10000) { try { localStorage.setItem('dins_aceite', o.cpf + '|' + new Date().toISOString().slice(0, 10)); } catch (e) {} }   // 4.75: aceite no bot → flash pelos critérios
        const g = botaoRobo('Gerar ficha'); if (!g) throw new Error('painel do robô (Gerar ficha) não está na tela'); g.click();
        let ta = null; for (let i = 0; i < 75; i++) { await zz(1000); ta = [...document.querySelectorAll('textarea')].find(t => new RegExp('^cpf: *0*' + o.cpf.replace(/^0+/, ''), 'm').test(t.value)); if (ta) break; }
        if (!ta) throw new Error('a ficha não foi gerada');
        await zz(1500);
        const ficha = textoParaFicha(ta.value);
        if (o.tipo === 'cpf') {   // 4.24: só a consulta do CPF (não digita)
          const num = t => { const n = parseFloat(String(t || '').replace(/[^\d,\-]/g, '').replace(',', '.')); return isNaN(n) ? null : n; };
          const mg = num(ficha.margem), mot = (ficha.recusa || '').split('|')[0];
          const resumo = 'esp ' + (ficha.especie || '?') + ', ' + (ficha.idade || '?') + 'a, margem R$ ' + (ficha.margem || '?');
          let acao = '';
          if (mot === 'SEM_MARGEM' && mg != null && mg < 25) acao = 'sem_margem';
          else if (mot === 'LOAS' && mg != null && mg < 400) acao = 'loas_sem';   // 5.00 (claude/MENSAGEM-LOAS-COM-MARGEM.md): LOAS abaixo de R$ 400 → /n30 + 02 I + fechar (caso 💫✨ R$ 30,90)
          else if (mot === 'LOAS' && mg != null && mg >= 400) acao = 'loas_com';
          else if (mot === 'ESPECIE_FORA') acao = 'especie_fora';   // 5.15 (Stefany 12/11 11:23, caso Euraci esp 31): espécie não consignável → /07 + tag 07 + fechar, sem perguntar ao vigia   // 5.00: LOAS com margem ≥ R$ 400 → mensagem padrão + 02 A + fechar
          if (acao) poeAO(o.hash, { estado: 'desfecho', acao, nomeReal: ficha.nome, resumo });
          else if (!mot) {
            // 4.73 (Stefany 11/11 17:21, caso João Carlos: "quero que o robô faça sozinho… com as regras certas"):
            // com margem → digita no VALOR MÁXIMO (valor em branco = parcela da margem, 108x) e para em "Pronto" (o vigia grava e manda
            // simulação 1/2 + link). ⛔ SEM FLASH: o cliente ainda não confirmou (PADRAO-REGRAS-10-11 2b nº 8) — a ficha é da consulta normal.
            // 4.75: regra de valor. Escolheu abaixo de 10 mil no bot → contorno (vigia). 10 mil ou mais → digita ESSE valor.
            // 5.69 (caso Maria Sandra F9M06: contorno respondido "parcela até R$ 100"): valor decidido pelo VIGIA (o.valorVigia) → digita esse valor de ponta a ponta
            const vv = +o.valorVigia || 0; const vb = vv > 0 ? Math.max(vv, 10000) : (+o.valorBot || 0);
            // 6.01 (Stefany 13/11 11:17, caso Marilza: margem da consulta R$ 152,82 x extrato R$ 567,34): parcela decidida pelo vigia (regra de 3) vence a da consulta
            if (+o.parcelaVigia > 0) { ta.value = /^parcela:.*$/m.test(ta.value) ? ta.value.replace(/^parcela:.*$/m, 'parcela: ' + brl(+o.parcelaVigia)) : ta.value + '\nparcela: ' + brl(+o.parcelaVigia); ta.dispatchEvent(new Event('input', { bubbles: true })); }
            if (vv > 0) { ta.value = /^valor:.*$/m.test(ta.value) ? ta.value.replace(/^valor:.*$/m, 'valor: ' + brl(vv)) : ta.value + '\nvalor: ' + brl(vv); ta.dispatchEvent(new Event('input', { bubbles: true })); }
            else if (vb > 0 && vb < 10000) { poeAO(o.hash, { estado: 'com_margem', nomeReal: ficha.nome, resumo: resumo + ' · escolheu R$ ' + brl(vb) + ' no bot (abaixo de 10 mil) → VIGIA: contorno /simula + opções' }); return; }
            else if (vb >= 10000) { ta.value = /^valor:.*$/m.test(ta.value) ? ta.value.replace(/^valor:.*$/m, 'valor: ' + brl(vb)) : ta.value + '\nvalor: ' + brl(vb); ta.dispatchEvent(new Event('input', { bubbles: true })); }
            // 5.00 (caso Ronaldo 12/11: CPF não estava no mapa CPF→WhatsApp): a ordem nasceu do chat do Botmaker e traz o WhatsApp dele (o.fone) → usa esse
            if (!o.fone) { try { const rq = (GM_getValue('regua', {}) || {})[o.hash] || {}; o.fone = rq.fone || zapDoCpf(o.cpf) || ''; } catch (e) {} }   // 5.31 (caso 9BL8Z: ordem sem telefone) → régua / mapa CPF→WhatsApp
            if (!/^telefone_origem:\s*WhatsApp/im.test(ta.value) && o.fone) { let t = String(o.fone).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); if (t.length === 10 && /[6-9]/.test(t[2])) t = t.slice(0, 2) + '9' + t.slice(2);
              if (/^\d{11}$/.test(t)) { const put = (k, v) => { ta.value = new RegExp('^' + k + ':.*$', 'm').test(ta.value) ? ta.value.replace(new RegExp('^' + k + ':.*$', 'm'), k + ': ' + v) : ta.value + '\n' + k + ': ' + v; };
                put('telefone', t); put('telefone_origem', 'WhatsApp do chat (Botmaker — ordem automática)'); ta.dispatchEvent(new Event('input', { bubbles: true })); } }
            // 5.99 (Stefany 13/11 11:11, caso Michele: mandou a conta certa) — conta informada pelo cliente/vigia: extra.contaFix = { banco, agencia, conta, tipo_conta }
            if (o.contaFix && typeof o.contaFix === 'object') { const put2 = (k, v) => { if (!v) return; ta.value = new RegExp('^' + k + ':.*$', 'm').test(ta.value) ? ta.value.replace(new RegExp('^' + k + ':.*$', 'm'), k + ': ' + v) : ta.value + '\n' + k + ': ' + v; };
              put2('banco', o.contaFix.banco); put2('agencia', o.contaFix.agencia); put2('conta', o.contaFix.conta); put2('tipo_conta', o.contaFix.tipo_conta); put2('conta_origem', 'informada pelo cliente no chat (vigia)'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
            const sv0 = botaoRobo('Salvar ficha'); if (sv0) sv0.click(); await zz(2500);
            const f3 = GM_getValue('ficha_atual', null);
            const okF = f3 && String(f3.cpf).replace(/\D/g, '').replace(/^0+/, '') === o.cpf.replace(/^0+/, '');
            const bd = ((f3 && f3.banco_destino) || '').toUpperCase();
            let porque = '';
            if (!okF) porque = 'a ficha salva não é a do cliente';
            else if ((f3.recusa || '').trim()) porque = 'recusa: ' + f3.recusa;
            else if (!(mg >= 25)) porque = 'margem abaixo de R$ 25';   // 5.16 (Stefany 12/11 11:25): margem baixa a partir de R$ 25 → simulação com a margem que ele tem
            else if (!/WhatsApp/i.test(f3.telefone_origem || '')) porque = 'sem o WhatsApp do chat na ficha';
            else if (!{ C6: 1, FACTA: 1, QUALIBANK: 1, DAYCOVAL: 1 }[bd]) porque = 'banco ' + (bd || '?') + ' é à mão';   // 5.11: DAYCOVAL automático (portal do Daycoval)
            else if (num(f3.valor) > 0 && !(vb >= 10000)) porque = 'ficha já tem valor escolhido — vigia confere';
            if (porque) poeAO(o.hash, { estado: 'com_margem', nomeReal: ficha.nome, resumo: resumo + ' · não digitei: ' + porque });
            else poeAO(o.hash, { estado: 'ficha_ok', banco: bd, nomeReal: f3.nome, ficha: f3,   /* 5.18: a ficha vai na ordem (outra consulta no meio troca a ficha_atual) */ resumo: resumo + (vb >= 10000 ? ' · valor do bot R$ ' + brl(vb) + (o.aceite ? ' (aceitou)' : '') : ' · máximo'), maximo: vb >= 10000 ? 0 : 1, flash: f3.flash || '' });
          }
          else poeAO(o.hash, { estado: 'erro', erro: 'consultado: ' + mot + ' (' + resumo + ') — decisão do vigia', nomeReal: ficha.nome });
          return;
        }
        if ((ficha.recusa || '').trim()) throw new Error('recusa na ficha: ' + ficha.recusa);
        const valorTxt = brl(o.valor);
        ta.value = /^valor:.*$/m.test(ta.value) ? ta.value.replace(/^valor:.*$/m, 'valor: ' + valorTxt) : ta.value + '\nvalor: ' + valorTxt;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        const sv = botaoRobo('Salvar ficha'); if (!sv) throw new Error('botão Salvar ficha não está na tela'); sv.click();
        await zz(2500);
        const f2 = GM_getValue('ficha_atual', null);
        if (!f2 || String(f2.cpf).replace(/\D/g, '').replace(/^0+/, '') !== o.cpf.replace(/^0+/, '')) throw new Error('a ficha salva não é a do cliente');
        if ((f2.recusa || '').trim()) throw new Error('recusa: ' + f2.recusa);
        if (!/WhatsApp/i.test(f2.telefone_origem || '')) throw new Error('sem o WhatsApp do chat na ficha (abra o chat do cliente no Botmaker)');
        poeAO(o.hash, { estado: 'ficha_ok', banco: (f2.banco_destino || '').toUpperCase(), nomeReal: f2.nome });
      } catch (e) { poeAO(o.hash, { estado: 'erro', erro: String(e.message || e) }); }
      finally { ocupadoAuto = false; }
    }, 15000);
    // ---------- New Corban (só a aba de digitação; a de ?p=propostas fica só na esteira)
    if (/newcorban\.com\.br/.test(location.host)) setInterval(async () => {
      if (ocupadoAuto || /[?&]p=propostas/.test(location.search) || !ninguemMexendo()) return;
      const o = Object.values(AO()).find(x => x.estado === 'ficha_ok' && x.banco !== 'DAYCOVAL'); if (!o) return;
      const pag = { C6: 'c6', FACTA: 'facta', QUALIBANK: 'qualibank' }[o.banco];
      if (!pag) { if (o.banco === 'DAYCOVAL') return; poeAO(o.hash, { estado: 'erro', erro: 'banco ' + o.banco + ' não é digitado pelo New Corban' }); return; }   // 5.11: DAYCOVAL é do portal do Daycoval
      if (!new RegExp('[?&]p=' + pag + '\\b').test(location.search)) { if (!sessionStorage.getItem('dins_auto_nav')) { sessionStorage.setItem('dins_auto_nav', '1'); location.href = location.origin + '/?p=' + pag; } return; }
      sessionStorage.removeItem('dins_auto_nav');
      const car = botaoRobo('Carregar ficha'), dig = botaoRobo('Digitar'); if (!car || !dig) return;   // painel ainda carregando
      let f = GM_getValue('ficha_atual', null);
      const cpfOk = x => x && String(x.cpf).replace(/\D/g, '').replace(/^0+/, '') === o.cpf.replace(/^0+/, '');
      if (!cpfOk(f) && cpfOk(o.ficha)) { f = o.ficha; GM_setValue('ficha_atual', f); }   // 5.18: usa a ficha guardada na ordem
      if (!cpfOk(f)) { poeAO(o.hash, { estado: 'erro', erro: 'a ficha atual não é a do cliente (outra ficha foi salva no meio)' }); return; }
      ocupadoAuto = true; poeAO(o.hash, { estado: 'digitando' });
      if (o.tipo === 'cpf' && !o.aceite && !f.aleatoria_ok) { f.aleatoria_ok = 1; GM_setValue('ficha_atual', f); }   // 5.17: simulação + link, ainda não aceitou → sem banco = Caixa aleatória
      try {
        const antes = logRobo().length;
        car.click(); await zz(2500); dig.click();
        let fim = null;
        for (let i = 0; i < 160 && !fim; i++) { await zz(1500); const novos = logRobo().slice(antes); fim = novos.find(l => /Pronto \(liberado R\$|⛔|ERRO|erro|não (achei|encontrei)|indispon|NÃO gravar|PAROU/i.test(l)); }   // 5.17: 'NÃO gravar' também encerra
        if (!fim) throw new Error('a digitação não terminou em 4 min');   // 5.13 (caso Josias TYK97: 90 s era pouco)
        const m = /Pronto \(liberado R\$ ([\d.,]+)\)/.exec(fim);
        if (!m) throw new Error(fim.replace(/^\d\d:\d\d /, '').slice(0, 160));
        poeAO(o.hash, { estado: 'pronto', liberado: m[1], aba: location.search });
        // 4.75 (Stefany 11/11 17:58 "pode fazer 4.75"): CPF → grava sozinho, espera o link e devolve ao Botmaker (simulação + /parabens
        // ou linha + /bn54n). As travas do Gravar continuam (liberado ≥ pedido, telefone do chat, prazo, banco 000). Sem conferência de duplicidade
        // (Stefany: a proposta parada cancela sozinha). Qualquer erro → 'erro' com o motivo, e o vigia segue à mão.
        if (o.tipo === 'cpf') {
          const tab = logRobo().slice(antes).map(l => /Tabela: .*?(\d{2,3})x\s+[\d,]+%\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/.exec(l)).filter(Boolean).pop();
          poeAO(o.hash, { estado: 'gravando' });
          const antesG = logRobo().length;
          const gv = botaoRobo('Gravar'); if (!gv) throw new Error('botão Gravar não está na tela');
          gv.click();
          let fimG = null; for (let i = 0; i < 70 && !fimG; i++) { await zz(1500); fimG = logRobo().slice(antesG).find(l => l.trim().length > 6); }
          if (!fimG) throw new Error('o Gravar não respondeu em 60 s');
          const nro = (/Proposta gravada N[º°o]?\s*([A-Z]{0,4}\d+)/.exec(fimG) || [])[1];
          if (!nro) throw new Error('não gravou: ' + fimG.replace(/^\d\d:\d\d /, '').slice(0, 160));
          poeAO(o.hash, { estado: 'gravada', proposta: nro });
          const MD = () => [...document.querySelectorAll('.modal.show, .swal2-popup')].find(x => /Proposta gerada/i.test(x.innerText));
          const LK = () => { const mm = MD(); if (!mm) return ''; return [...mm.querySelectorAll('input')].map(x => x.value).find(v => /^https?:\/\//.test(v)) || (mm.innerText.match(/https?:\/\/\S+/) || [])[0] || ''; };
          let link = LK(); const tGrav = Date.now();
          // 5.93: segunda forma de achar o link — a lista de Propostas (aba ?p=propostas grava em GM 'esteira' por CPF)
          const linkDaLista = () => { try { const E = GM_getValue('esteira', {}) || {}; const c = String(o.cpf || '').replace(/\D/g, '');
            const r = Object.values(E).filter(x => x && x.link && x.cpf === c && (+x.t || 0) > tGrav && /cadastrad|pendente|assinatura/i.test((x.status || '') + ' ' + (x.statusBanco || ''))).sort((a, b) => b.t - a.t)[0]; return r ? r.link : ''; } catch (e) { return ''; } };
          for (let i = 0; !link && i < 40; i++) {   // C6 demora de 1 a 8 min: tenta de 30 em 30 s, até ~20 min (5.93: e confere a lista de Propostas)
            if ((link = linkDaLista())) break;
            const mm = MD(); if (!mm) throw new Error('o quadro "Proposta gerada" fechou antes do link (Nº ' + nro + ')');
            const b = [...mm.querySelectorAll('button,a')].find(x => /consultar link|tentar de novo/i.test(x.innerText)); if (b) b.click();
            for (let k = 0; k < 10 && !(link = LK()); k++) await zz(2000);
            if (!link) await zz(10000);
          }
          if (!link) throw new Error('gravada Nº ' + nro + ', mas o link não saiu em 20 min (nem no quadro nem na lista de Propostas) → vigia: nuvem verde em ?p=propostas');
          // 5.25 (caso Fabiano 12/11 12:00: saiu "Josias" no chat do Fabiano — a ficha_atual já era de outro cliente): usa a ficha DESTA ordem
          const f4 = (o.ficha && String(o.ficha.cpf).replace(/\D/g, '').replace(/^0+/, '') === o.cpf.replace(/^0+/, '')) ? o.ficha : (f || {});
          const bc = String(f4.banco || '').replace(/\D/g, '').padStart(3, '0');
          const aleat = bc === '104' && /3880/.test(String(f4.agencia || ''));
          poeAO(o.hash, { estado: 'link', link, proposta: nro, liberado: (tab && tab[3]) || m[1], parcela: (tab && tab[2]) || f4.parcela || '', prazo: (tab && tab[1]) || f4.prazo || '108', bancoConta: aleat ? '' : (NOME_BANCO[bc] || ''), nomeReal: f4.nome || o.nomeReal });
          try { const fc = [...(MD() || document).querySelectorAll('button')].find(x => /^Fechar$/i.test(x.innerText.trim())); if (fc) fc.click(); } catch (e) {}
          setTimeout(() => { location.href = location.origin + '/?p=' + pag; }, 3000);   // tela limpa para o próximo cliente
        }
      } catch (e) { poeAO(o.hash, { estado: 'erro', erro: String(e.message || e) }); }
      finally { ocupadoAuto = false; }
    }, 15000);
  }

  // ================================================================== BOTMAKER: VIGIA
  // Roda dentro da lista de chats. Não gasta nada: só anota cliente NOVO derivado para atendimento
  // em localStorage 'dins_fila' (o Claude lê essa fila) e avisa com som + notificação.
  if (location.host === 'go.botmaker.com') {
    if (!/moduleForward\/chats/.test(location.pathname)) return;
    // 5.64 — UM ROBÔ POR ABA. Papel guardado na própria aba (sessionStorage: sobrevive ao F5, cada aba tem o seu):
    //   'atendimento' (fila, CPF, ordens, mensagens a quem espera, tags) · 'followup' (toques, esperas, lembretes, esteira, pós-pagamento)
    //   'varredura' (janelas vencidas, conferência das 24 h, releitura do azul) · 'vigia' (aba do Claude: o robô não mexe) · 'tudo' (padrão).
    // Papel sem aba viva é feito pela aba 'tudo' (a de menor id) e, sem ela, pela de 'atendimento'. Uma aba só = tudo como antes.
    // 6.01 (Stefany 13/11 12:09): LEITURA PELO SERVIDOR do Botmaker, sem abrir a conversa na tela (não puxa as outras abas).
    // Guarda o pedido que a própria tela faz (POST /opsvc/sg9/msg4c wsType 'messages', com o token dela) e repete trocando só o customerId.
    // Sem pedido recente (> 40 min) ou com erro → null, e o robô segue pelo caminho antigo (abrir na tela).
    const APIW = (() => { try { return ((typeof unsafeWindow !== 'undefined') ? unsafeWindow : window).top; } catch (e) { return null; } })();
    try { if (APIW && !APIW.__dinsApiHook) { APIW.__dinsApiHook = 1; const f0 = APIW.fetch; APIW.__dinsFetch0 = f0;
      APIW.fetch = function (u, o) { try { const url = String((u && u.url) || u); if (/\/msg4c$/.test(url) && o && typeof o.body === 'string' && /"wsType":"messages"/.test(o.body)) APIW.__dinsMsgReq = { u: url, o: { method: o.method || 'POST', headers: o.headers, body: o.body, credentials: o.credentials }, t: Date.now() }; } catch (e) {} return f0.apply(this, arguments); }; } } catch (e) {}
    async function apiLer(id, n) { try { const L = APIW && APIW.__dinsMsgReq; if (!L || Date.now() - L.t > 40 * 60000) return null;
      const b = JSON.parse(L.o.body); b.showLoading = false; b.message.customerId = id; b.message.start = 0; b.message.end = n || 20;
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
      try { const r = await APIW.__dinsFetch0.call(APIW, L.u, Object.assign({}, L.o, { body: JSON.stringify(b), signal: ctl.signal })); if (!r.ok) return null; const j = await r.json(); return (j && j.customer) ? j : null; } finally { clearTimeout(tm); }
    } catch (e) { return null; } }
    window.dinsApiLer = apiLer; try { if (typeof unsafeWindow !== 'undefined') unsafeWindow.dinsApiLer = apiLer; } catch (e) {}
    const API_PLACAR = { lidas: 0, puladas: 0, falhas: 0 }; window.dinsApiPlacar = () => API_PLACAR;
    const API_ADIA = {}; const apiAdiado = id => (API_ADIA[id] || 0) > Date.now();   // 6.06: conversa com o BOT falando agora → não abre a tela por 2 min
    const T0 = Date.now();
    const ABA = (() => { let k = sessionStorage.getItem('dins_aba_id');
      // 5.86: janela aberta por window.open herda a sessionStorage da que abriu — se o meu id já tem batida viva, sou cópia: id novo e papel automático
      try { let nm = ''; try { nm = window.top.name || ''; } catch (e) {} if (/^dins_robo_/.test(nm) && sessionStorage.getItem('dins_copia_ok') !== nm) { sessionStorage.setItem('dins_copia_ok', nm); k = ''; sessionStorage.removeItem('dins_papel'); sessionStorage.setItem('dins_papel_auto', '1'); } } catch (e) {}
      if (!k) { k = Math.random().toString(36).slice(2, 8); sessionStorage.setItem('dins_aba_id', k); } return k; })();
    const PAPEIS = ['tudo', 'atendimento', 'followup', 'varredura', 'vigia'];
    const meuPapel = () => { const p = sessionStorage.getItem('dins_papel') || 'tudo'; return PAPEIS.includes(p) ? p : 'tudo'; };
    const abasVivas = () => { const o = {}; for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i); if (!/^dins_aba_/.test(k)) continue;
      try { const v = JSON.parse(window.localStorage.getItem(k) || '{}'); if (Date.now() - (+v.t || 0) < 60000) o[k.slice(9)] = v; else if (Date.now() - (+v.t || 0) > 3600000) window.localStorage.removeItem(k); } catch (e) {} } return o; };
    const faz = r => { const p = meuPapel(); if (p === 'vigia') return false; const V = abasVivas(); V[ABA] = { papel: p, t: Date.now() };
      const de = q => Object.keys(V).filter(k => V[k].papel === q).sort()[0];
      const dono = de(r) || de('tudo') || de('atendimento'); return dono ? dono === ABA : true; };
    // 5.84 (Stefany 13/11 08:57: "não vi a iniciação com as 4 janelas"): o papel ficava só na aba e sumia quando o Chrome fechava.
    // Agora as janelas do Botmaker se dividem SOZINHAS: papel não escolhido à mão = automático. Com 1 aba de robô → 'tudo';
    // com 2 ou mais → por ordem de id: atendimento, followup, varredura (os papéis que nenhuma aba fixa tem). A aba do vigia é sempre fixa.
    const papelAuto = () => { const p = sessionStorage.getItem('dins_papel'); return !p || sessionStorage.getItem('dins_papel_auto') === '1'; };
    const autoPapel = () => { if (!papelAuto()) return; const V = abasVivas(); V[ABA] = { papel: meuPapel(), auto: 1, t: Date.now() };
      const fixos = Object.values(V).filter(v => !v.auto).map(v => v.papel); const falta = ['atendimento', 'followup', 'varredura'].filter(r => !fixos.includes(r));
      const autos = Object.keys(V).filter(k => V[k].auto).sort(); let novo = 'tudo';
      if (autos.length > 1 || fixos.some(f => f !== 'vigia')) { const i = autos.indexOf(ABA); novo = falta[i] || 'tudo'; }
      if (novo !== meuPapel()) { sessionStorage.setItem('dins_papel', novo); sessionStorage.setItem('dins_papel_auto', '1'); } };
    let batH = null, batMud = 0;
    const batida = () => { try { const h = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1] || ''; if (h !== batH) { batMud = batH === null ? 0 : Date.now(); batH = h; }   /* 5.73: a conversa que o Botmaker reabre sozinho ao carregar não segura ninguém */ try { autoPapel(); } catch (e) {} window.localStorage.setItem('dins_aba_' + ABA, JSON.stringify({ papel: meuPapel(), auto: papelAuto() ? 1 : 0, hash: meuPapel() === 'vigia' ? '' : h, mud: batMud, t: Date.now(), v: VERSAO }));   /* 5.98: o Botmaker leva a aba do vigia junto para a conversa que o robô abre — o vigia segura conversa só pela reserva (dinsReservar), não pela tela */
      try {   // 5.75: aviso de janela de robô parada (sem sinal há 2 min+, vista na última hora) — aparece no quadro de todas as abas
        const mortos = []; for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i); if (!/^dins_aba_/.test(k)) continue; const v = JSON.parse(window.localStorage.getItem(k) || '{}'); const ida = Date.now() - (+v.t || 0); if (v.papel && v.papel !== 'vigia' && ida > 2 * 60000 && ida < 3600000 && !Object.values(abasVivas()).some(w => w.papel === v.papel)) mortos.push(v.papel.toUpperCase() + ' (' + Math.round(ida / 60000) + ' min)'); }
        window.localStorage.setItem('dins_abas_paradas', JSON.stringify(mortos));
        if (meuPapel() === 'varredura') { const top = window.top.document; let b = top.getElementById('dins-varre-agora'); if (!b) { b = top.createElement('div'); b.id = 'dins-varre-agora'; b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:4px;z-index:2147483001;background:#4c1d95;color:#fff;border-radius:8px;padding:3px 10px;font:600 12px system-ui,sans-serif;pointer-events:none'; top.body.appendChild(b); }
          const R0 = GM_getValue('regua', {}) || {}; const atual = R0[batH] || {}; const falta = Object.values(R0).filter(x => x && x.reler && !['humano', 'fechada', 'cancelada', 'concluída'].includes(x.estado)).length;
          b.textContent = '🧹 VARREDURA · agora: ' + (batH ? String(atual.nomeReal || atual.nome || batH.slice(0, 6)).split(' ')[0] : 'esperando') + ' · releitura: faltam ' + falta; }
      } catch (e) {}
      try { const P = meuPapel(); const pre = P === 'tudo' ? '' : '[' + ({ atendimento: 'ATENDIMENTO', followup: 'FOLLOW-UP', varredura: 'VARREDURA', vigia: 'VIGIA' })[P] + '] '; const t0 = window.top.document.title || ''; const limpo = t0.replace(/\[?[A-Z][A-Z-]{1,11}\] ?/g, '').replace(/(\(💬\)\s*)+/g, '(💬) '); /* 5.92: título sem (💬) repetido */   /* 5.68: o Botmaker põe 🔔(n) na frente e corta o título — tira qualquer pedaço do rótulo */ if (t0 !== pre + limpo) window.top.document.title = pre + limpo; } catch (e) {}   // 5.67: nome do papel na aba
    } catch (e) {} };
    batida(); setInterval(batida, 5000); try { window.top.addEventListener('hashchange', batida); window.addEventListener('beforeunload', () => window.localStorage.removeItem('dins_aba_' + ABA)); } catch (e) {}
    // conversa aberta em OUTRA aba (qualquer papel, inclusive o vigia) → quem vai escrever espera (até 90 s)
    const chatComOutraAba = h => { const V = abasVivas(); return Object.keys(V).some(k => k !== ABA && V[k].hash === h && Date.now() - V[k].t < 20000 && (Date.now() - (+V[k].mud || 0) < (['vigia', 'tudo'].includes(V[k].papel) ? 10 : 2) * 60000)); };   // robô parado na conversa há 2 min+ não segura ninguém; o vigia segura enquanto estiver nela
    // 5.75 (caso Vms 21:02: robô e vigia escreveram no mesmo minuto): o vigia RESERVA a conversa antes de escrever — vale na hora, para todas as abas
    const reservaVigia = h => { try { const r = JSON.parse(window.localStorage.getItem('dins_vigia_reserva') || '{}'); return r[h] && Date.now() - r[h] < 10 * 60000; } catch (e) { return false; } };
    window.dinsReservar = (h, on = true) => { const r = (() => { try { return JSON.parse(window.localStorage.getItem('dins_vigia_reserva') || '{}'); } catch (e) { return {}; } })(); if (on) r[h] = Date.now(); else delete r[h]; for (const k in r) if (Date.now() - r[k] > 10 * 60000) delete r[k]; window.localStorage.setItem('dins_vigia_reserva', JSON.stringify(r)); return Object.keys(r); };
    window.dinsQuemEsta = h => { const V = abasVivas(); return Object.keys(V).filter(k => V[k].hash === h && k !== ABA).map(k => V[k].papel); };
    const esperaChatLivre = async h => { if (meuPapel() !== 'vigia') { for (let i = 0; i < 60 && reservaVigia(h); i++) await new Promise(r => setTimeout(r, 10000)); if (reservaVigia(h)) return false; } for (let i = 0; i < 30; i++) { if (!chatComOutraAba(h)) return true; await new Promise(r => setTimeout(r, 3000)); } return false; };
    window.dinsPapel = p => { if (p === undefined) return { papel: meuPapel(), aba: ABA, abas: abasVivas() }; if (!PAPEIS.includes(p)) return 'papéis: ' + PAPEIS.join(', '); sessionStorage.setItem('dins_papel', p); sessionStorage.removeItem('dins_papel_auto'); batida(); return 'papel desta aba: ' + p + ' (fixo)'; };
    window.dinsPapelAuto = () => { sessionStorage.removeItem('dins_papel'); sessionStorage.setItem('dins_papel_auto', '1'); batida(); return 'papel automático: ' + meuPapel(); };
    window.dinsFaz = faz;
    // 5.86 (Stefany 13/11 09:02: "eu preciso que você faça tudo sozinho"): faltando janela de robô, o robô abre a janela que falta.
    // Precisa de pop-up liberado para go.botmaker.com (senão aparece o botão 🪟 — um clique abre uma janela). Robôs = abas vivas que não são o vigia.
    const robosVivos = () => Object.values(abasVivas()).filter(v => v.papel !== 'vigia').length;
    const abrirJanela = () => { const n = robosVivos(); if (n >= 3) return 'já tem ' + n + ' janelas de robô';
      const L = [0, 512, 1024][Math.min(n, 2)]; const w = window.top.open('https://go.botmaker.com/#/chats', 'dins_robo_' + Date.now(), 'popup=yes,width=' + screen.availWidth + ',height=' + screen.availHeight + ',left=0,top=0');
      window.localStorage.setItem('dins_janela_try', String(Date.now())); if (!w) { window.localStorage.setItem('dins_popup_bloq', String(Date.now())); return 'pop-up bloqueado'; } window.localStorage.removeItem('dins_popup_bloq'); return 'abri a janela ' + (n + 1) + '/3'; };
    window.dinsAbrirJanelas = abrirJanela;
    // 5.97: janela EXTRA aberta pelo robô (papel 'tudo' automático, com os 3 papéis já com dono em outras janelas há 1 min) fecha sozinha
    { let sobra = 0; setInterval(() => { try { if (!/^dins_robo_/.test(window.top.name || '') || !papelAuto() || meuPapel() !== 'tudo') { sobra = 0; return; }
      const V = abasVivas(); const donos = ['atendimento', 'followup', 'varredura'].every(r => Object.keys(V).some(k => k !== ABA && V[k].papel === r));
      if (!donos) { sobra = 0; return; } if (!sobra) sobra = Date.now(); if (Date.now() - sobra > 60000) window.top.close(); } catch (e) {} }, 15000); }
    // 5.87 (Stefany 09:18: "abriram menores"): janela aberta pelo robô pequena demais vira layout de celular — aumenta sozinha
    try { if (/^dins_robo_/.test(window.top.name || '') && window.top.outerWidth < screen.availWidth - 20) { window.top.moveTo(0, 0); window.top.resizeTo(screen.availWidth, screen.availHeight); } } catch (e) {}
    setInterval(() => { try {
      const V = abasVivas(); V[ABA] = { papel: meuPapel(), t: Date.now() }; const n = Object.values(V).filter(v => v.papel !== 'vigia').length;
      const top = window.top.document; let bt = top.getElementById('dins-abrir-jan');
      if (n >= 3 || Date.now() - T0 < 90000) { if (bt) bt.remove(); return; }
      const lider = Object.keys(V).sort()[0] === ABA;   // só uma aba tenta (a de menor id)
      // 5.97 (Stefany 10:33 "toda hora abrindo mais abas"): NÃO abre sozinho (a janela some da contagem enquanto recarrega e o robô abria outra) — só pelo botão 🪟
      if (lider && !bt) { bt = top.createElement('button'); bt.id = 'dins-abrir-jan'; bt.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:10px 14px;border-radius:10px;border:0;background:#2563eb;color:#fff;font:600 13px sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
        bt.onclick = () => { bt.textContent = '🪟 ' + abrirJanela(); }; top.body.appendChild(bt); }
      if (bt) bt.textContent = '🪟 Abrir janela de robô (' + n + '/3)';
    } catch (e) {} }, 15000);
    // travas que valem só para a PRÓPRIA aba (antes eram de todas: um robô esperava o outro sair da tela)
    const POR_ABA = /^(dins_nav|dins_mapeando|dins_varrendo|dins_vigia_ocupado|dins_vigia_trava)$/;
    const localStorage = { getItem: k => (POR_ABA.test(k) ? sessionStorage : window.localStorage).getItem(k), setItem: (k, v) => (POR_ABA.test(k) ? sessionStorage : window.localStorage).setItem(k, v),
      removeItem: k => (POR_ABA.test(k) ? sessionStorage : window.localStorage).removeItem(k), key: i => window.localStorage.key(i), get length() { return window.localStorage.length; },
      get dins_ordem() { return window.localStorage.dins_ordem; }, get dins_ordem_status() { return window.localStorage.dins_ordem_status; }, get dins_regua() { return window.localStorage.dins_regua; },
      get dins_varredura_placar() { return window.localStorage.dins_varredura_placar; }, get dins_varrer_agora() { return window.localStorage.dins_varrer_agora; } };
    const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
    const gravar = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    const bip = () => { try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 250); } catch (e) {} };

    // v2.0: a fila é recalculada a cada 30s a partir da lista. Cliente fica na fila enquanto estiver
    // "esperando" (última mensagem é dele, ou o bot mandou "aguarde um atendente") e ninguém marcou
    // como feito. Feito = dins_feito[id] guarda a mensagem que estava na tela quando foi resolvido;
    // se o cliente mandar algo novo, a mensagem muda e ele volta para a fila sozinho.
    let ultimoAberto = '';
    function abertoAgora() { try { const m = window.top.location.hash.match(/#\/chats\/([A-Z0-9]{16,24})/); return m ? m[1] : ''; } catch (e) { return ''; } }
    // true = a última mensagem da conversa aberta é nossa/do bot; false = do cliente (ou bot pediu atendente); null = não deu para ler
    function ultimaEhNossa() {
      const p = document.body.innerText; const e = p.lastIndexOf('sentiment_satisfied_alt');
      if (e < 0) return null;
      // v3.72: a NOTA INTERNA aparece no meio da conversa ("[Nota interna] … ~ Criado por …") e não é mensagem de
      // ninguém → tirar antes de ler, senão ela parece resposta do cliente e a conversa nunca sai da lista.
      const L = p.slice(Math.max(0, e - 4000), e).replace(/\[Nota interna\][\s\S]*?~ Criado por[^\n]*/g, '')
        .split('\n').map(s => s.trim()).filter(Boolean);
      let ix = -1; for (let i = L.length - 1; i >= 0; i--) if (/^\d{1,2}:\d{2}\s*(AM|PM)?$/.test(L[i])) { ix = i; break; }
      if (ix < 0) return null;
      // v3.71 (Stefany 10/11, caso Celimar): cliente que só agradece/confirma ("Ok", "Obrigada", 👍) depois da
      // nossa última mensagem não está esperando nada → conta como resolvido (sai da lista, conversa continua).
      const iu = L.map((s, k) => /^(done_all|check|done)$/.test(s) ? k : -1).filter(k => k >= 0).pop();
      if (iu !== undefined && iu < ix) {
        const cli = L.slice(iu + 1).filter(s => !/^(\d{1,2}:\d{2}\s*(AM|PM)?|\d{1,3}|Sessão \d\d\/\d\d\/\d{4}.*|(SEG|TER|QUA|QUI|SEX|S[ÁA]B|DOM) \d{1,2} [A-ZÇ]+ \d{1,2}:\d{2})$/.test(s)).join(' ').trim();  // 3.75: ignora a linha de sessão nova
        if (cli && cli.length <= 40 && /^(ok+|okay|obrigad[oa]s?|muito obrigad[oa]|blz|beleza|t[áa] bom|t[áa]|certo|entendi|valeu|am[ée]m|deus aben[çc]oe|👍|🙏|❤️|😊|ok obrigad[oa])[\s.!,👍🙏😊❤️]*$/i.test(cli)) return true;
      }
      if (!/^(done_all|check|done)$/m.test(L.slice(ix + 1).join('\n'))) return false;
      // v3.69 (caso Luís Sartre): resposta do cliente no mesmo minuto vem SEM horário, logo depois do done_all
      // ("…08:38 AM / done_all / Ok irei enviar agora / 0"). Texto depois do done_all = mensagem do cliente.
      const depois = L.slice(ix + 1); const iv = depois.findIndex(s => /^(done_all|check|done)$/.test(s));
      if (depois.slice(iv + 1).some(s => !/^(\d{1,3}|done_all|check|done|schedule)$/.test(s))) return false;
      const antes = L.slice(Math.max(0, ix - 15), ix).join(' ');
      if (/Para agilizar o seu atendimento|pedimos por gentileza que nos envie|atendente humano/i.test(antes)) return false;
      // v3.78 (Stefany 10/11, caso Evandro): depois do CPF + extrato o BOT responde "Estamos analisando aguarde um
      // momento por favor." (ou avisa "Você possui mais N minutos para envio do arquivo"). Isso NÃO é resposta nossa:
      // o cliente está esperando atendimento → continua na lista.
      const ultBot = L.slice(Math.max(0, ix - 4), ix).join(' ');
      if (/Estamos analisando|Estou analisando suas informa|Assim que concluir irei avisar|aguarde um momento|atendente humano|Você possui mais \d+ minutos para envio/i.test(ultBot)) return false;  // 3.81: caso Marlene
      if (/\[[^\]]{2,40}\][^\n]{0,200}(verific|analis|um momento|j[áa] volto)/i.test(antes)) return false;
      return true;
    }
    // v3.70 (Stefany 10/11, caso Santaterezinha): conversa ENCERRADA não tem o selo "Em atendimento com …"
    // no painel do contato (entre "Última sessão" e "Informações de contato") → sai da lista.
    function conversaEncerrada() {
      const p = document.body.innerText; const i = p.indexOf('Última sessão'); if (i < 0) return false;
      const j = p.indexOf('Informações de contato', i); if (j < 0) return false;
      return !/Em atendimento|support_agent/.test(p.slice(i, j));
    }
    function vigiar() {
      // 4.66 (Stefany 11/11 14:40, caso Carmen: mandou CPF 14:32 e não entrou na fila): abrir um chat pelo endereço
      // (#/chats/ID) deixa o filtro "Usuário 'ID'" na lista, que passa a mostrar só aquele chat — a fila só lê a lista.
      // Tira o filtro (se o vigia não está mexendo agora) e lê na próxima volta.
      try {
        const ocup = Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 120000 || (+localStorage.getItem('dins_vigia_trava') || 0) > Date.now();
        const chipF = [...document.querySelectorAll('.MuiChip-root')].find(c => /^Usu[áa]rio(s com o texto)?\s*['"‘’:]/i.test((c.innerText || '').trim()));
        if (chipF && !ocup) { const xx = chipF.querySelector('.MuiChip-deleteIcon, svg'); if (xx) { xx.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; } }
      } catch (e) {}
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
        // 4.58 (Stefany 13:19, caso Jairo): o BOT manda as mensagens de passagem com o rótulo do atendente
        // ("[Rômulo Lima👤] Estou analisando suas informações…"). Isso NÃO é resposta de gente: o cliente está esperando.
        if (nossa && /Estou analisando suas informa|Assim que concluir irei avisar|Estamos analisando|atendido\(a\) por um atendente humano|Aguarde um momento, logo/i.test(msg)) nossa = false;
        return { id, nome: linhas[0] || '', chip, naoLidas, msg, nossa };
      }).filter(x => x.id);
      if (!itens.length) return;

      const feito = ler('dins_feito', {});
      const ignorar = ler('dins_ignorar', []);
      const RESOLV = ler('dins_resolvidos', {});   // 4.83: resolvido pelo robô depois da última mensagem do cliente → não volta para a fila
      const antiga = ler('dins_fila', []);
      const naTela = new Set(itens.map(x => x.id));
      const fila = [];
      for (const x of itens) {
        if (ignorar.includes(x.id)) continue;
        // v3.79 (Stefany 10/11, caso Ronaldo): mensagem SEM TEXTO na lista (anúncio, arquivo, áudio) dava sig vazia;
        // marcada como feita uma vez, nunca mais voltava. Agora a sig leva o nº de não lidas.
        const sig = x.msg ? x.msg.slice(0, 60) : (x.naoLidas > 0 ? '[sem texto] ' + x.naoLidas : '');
        if (feito[x.id] === sig && sig !== '') continue;
        if (feito[x.id] === '' && !x.msg && x.naoLidas === 0) continue;
        if (RESOLV[x.id] && !(x.naoLidas > 0 && (ler('dins_pend', {})[x.id] || {}).t > RESOLV[x.id])) continue;   // 4.83
        { const q0 = (GM_getValue('regua', {}) || {})[x.id]; if (q0 && ['encerrado', 'concluída', 'fechada', 'cancelada', 'esgotada'].includes(q0.estado) && !(x.naoLidas > 0 && (ler('dins_pend', {})[x.id] || {}).t > (+q0.lidoT || 0))) continue; }   // 4.99: atendimento encerrado não volta para a fila (só se o cliente escrever de novo)
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
        const esperando = humano ? ((!x.nossa && x.naoLidas > 0) || verificando || handoff)   /* 4.58: passagem do bot também com humano */
                                 : (!x.nossa && (handoff || parado || (nosso && (x.naoLidas > 0 || /Bot desligado/i.test(x.chip)))));
        // 4.14 — o QUADRO (que lê a conversa inteira) manda para a fila quem ele marcou esperando: bot passou para atendente
        // humano e mandou outra coisa depois (caso Carmen 18:35), ou cliente escreveu e a prévia não mostrava.
        let peloQuadro = false;
        if (!esperando && !humano) { try { const q = (GM_getValue('regua', {}) || {})[x.id]; peloQuadro = !!q && q.estado === 'alerta' && ((!x.nossa && /bot passou para atendente|cliente escreveu|cliente esperando|mandou CPF|parou sem CPF/.test(q.motivo || '')) || /parou sem CPF/.test(q.motivo || ''));   /* 4.77: parado no bot entra mesmo com a última mensagem sendo do bot */ } catch (e) {} }
        if (!esperando && !peloQuadro) continue;
        // 4.24 (Stefany 11/11 08:17, caso Nila "Obgd"): só agradeceu/confirmou ("ok", "obrigado", "blz", 👍) → não entra na fila,
        // a não ser que o quadro (que leu a conversa inteira) tenha marcado vermelho (ex.: "ok" depois de "já te passo o valor").
        try { const q2 = (GM_getValue('regua', {}) || {})[x.id];
          if (/^(ok+|okay|obrigad[oa]s?|obg|obgd[ao]?|brigad[oa]|muito obrigad[oa]|blz|beleza|t[áa] bom|certo|entendi|valeu|am[ée]m|deus aben[çc]oe|👍|🙏|❤️|😊)([\s.!,👍🙏😊❤️]+(ok+|obrigad[oa]|obg|obgd[ao]?|brigad[oa]|muito))*[\s.!,👍🙏😊❤️]*$/i.test(String(x.msg || '').trim()) && !(q2 && q2.estado === 'alerta')) continue; } catch (e) {}
        const velho = antiga.find(f => f.id === x.id);
        fila.push({ id: x.id, nome: x.nome, msg: x.msg.slice(0, 80), sig, humano: humano ? x.chip : '', quando: velho ? velho.quando : new Date().toISOString() });
      }
      // 4.66: quem o QUADRO marcou vermelho (mandou CPF / escreveu e ficou sem resposta / handoff) entra na fila mesmo
      // que não esteja na lista da tela (filtro, lista rolada, badge de não lida sumiu porque o robô abriu a conversa).
      try {
        const R = GM_getValue('regua', {}) || {};
        for (const [id, q] of Object.entries(R)) {
          if (!q || q.estado !== 'alerta' || !/bot passou para atendente|cliente escreveu|cliente esperando|mandou CPF|parou sem CPF/.test(q.motivo || '')) continue;
          if (q.hash && q.hash !== id && /^[A-Z0-9]{16,}$/i.test(q.hash)) continue;   // 4.84: entrada com chave errada (ex.: "103") — a certa entra pela própria chave
          if (id === 'F20QOEL8YYLQN2S6SR47' || ignorar.includes(id) || fila.some(f => f.id === id)) continue;   // 5.07: estar na tela não tira da fila (caso Marcelo 72ND: última msg era do bot, a lista não punha e o quadro pulava)
          if (Date.now() - (q.ultT || q.lidoT || 0) > 24 * 3600 * 1000) continue;
          const sigQ = 'quadro|' + String(q.motivo || '').slice(0, 50);
          if (feito[id] === sigQ) continue;
          if (RESOLV[id] && (+q.ultCliT || 0) <= RESOLV[id]) continue;   // 4.83
          if (['encerrado', 'concluída', 'fechada', 'cancelada', 'esgotada'].includes(q.estado)) continue;   // 4.99
          const velhoQ = antiga.find(f => f.id === id);
          // 5.07: ordem automática parada (com margem e não digitou / erro) → a fila diz o motivo para o vigia
          let msgQ = '[quadro] ' + String(q.motivo || '').slice(0, 70);
          try { const AOq = (GM_getValue('auto_ordens', {}) || {})[id]; if (AOq && ['com_margem', 'erro'].includes(AOq.estado)) msgQ = '🔴 ROBÔ PAROU: ' + String(AOq.erro || AOq.resumo || '').slice(-90); else if (AOq && ['nova', 'consultando', 'ficha_ok', 'digitando', 'pronto', 'gravando', 'gravada', 'link'].includes(AOq.estado)) continue; } catch (e) {}   // robô ainda trabalhando → não chama o vigia
          fila.push({ id, nome: q.nome || '', msg: msgQ, sig: sigQ, humano: '', quando: velhoQ ? velhoQ.quando : new Date().toISOString() });
        }
      } catch (e) {}
      // quem saiu da tela (rolou para baixo) continua na fila até ser marcado como feito
      // v3.67: ...mas só por 24h (depois disso a janela do WhatsApp fechou e não dá para responder). Só sai da LISTA;
      // a conversa NÃO é encerrada. O Claude também tira da lista (dins_feito) quem já foi respondido.
      // v3.77 (Stefany 10/11, caso Seabra): a lista é virtualizada (ReactVirtualized). Quando TODAS as linhas cabem
      // renderizadas (altura do container = nº de linhas × altura da linha), quem não está na tela NÃO está na lista
      // → a conversa foi encerrada/transferida: sai da fila (não é carregado de volta).
      let listaCompleta = false;
      try {
        const inner = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
        const n = document.querySelectorAll('.customer-item').length;
        const h = (document.querySelector('.customer-item') || {}).parentElement;
        const alt = h ? h.getBoundingClientRect().height : 0;
        if (inner && n && alt) listaCompleta = inner.scrollHeight <= n * alt + 5;
      } catch (e) {}
      if (!listaCompleta) for (const f of antiga) if (!naTela.has(f.id) && !fila.some(g => g.id === f.id) && feito[f.id] !== f.sig && !ignorar.includes(f.id) && !(RESOLV[f.id] && new Date(f.quando).getTime() <= RESOLV[f.id])
        && Date.now() - new Date(f.quando).getTime() < 24 * 3600 * 1000) fila.push(f);
      // v3.68 (Stefany 10/11): conversa ABERTA cuja última mensagem é NOSSA (atendente ou bot, fora o aviso de
      // "aguarde um atendente") sai da LISTA. ⛔ Não encerra a conversa. Só vale depois de a mesma conversa ficar
      // aberta por duas voltas seguidas (evita marcar a conversa errada enquanto a tela troca).
      const aberto = abertoAgora();
      // v3.78 (caso Evandro): conversa ainda com o BOT também não tem o selo "Em atendimento com…" e parecia
      // encerrada. Só vale "encerrada" se a última mensagem NÃO for do cliente esperando (ultimaEhNossa() !== false).
      const uNossa = aberto && aberto === ultimoAberto ? ultimaEhNossa() : null;
      if (aberto && aberto === ultimoAberto && (uNossa === true || (uNossa !== false && conversaEncerrada()))) {
        const it = fila.find(f => f.id === aberto) || itens.find(f => f.id === aberto);
        const sig = it ? (it.sig || (it.msg || '').slice(0, 60)) : '';
        const ix = fila.findIndex(f => f.id === aberto);
        if (ix >= 0) { feito[aberto] = sig; gravar('dins_feito', feito); fila.splice(ix, 1); }
      }
      ultimoAberto = aberto;
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
    // 5.00: LOAS com margem ≥ R$ 400 — texto da Stefany 07/11 22:00 (claude/MENSAGEM-LOAS-COM-MARGEM.md); {NOME} = primeiro nome
    loas_com:         { atalho: null, tags: ['02 A - Loas Sem Rep Com Margem'], fechar: true,
                        texto: 'Oi, {NOME}! 😊 Aqui é da Dinseguro.\n\nInfelizmente não conseguimos aprovar uma proposta para o seu benefício neste momento. 😔\n\nMas fique tranquilo(a): o seu cadastro continua aqui com a gente. Assim que tivermos uma proposta disponível para o seu benefício, nós entramos em contato com você por aqui mesmo.\n\n🔒 E lembrando sempre: a Dinseguro não cobra nada adiantado e nunca pede a senha do seu banco nem do Meu INSS.\n\n📲 Para não perder o nosso aviso, salve o nosso contato no celular e siga a gente:\n\n• Instagram: https://www.instagram.com/dinseguro_?igsh=MW90bnoybGIwczA3MA==\n\n• Facebook: https://www.facebook.com/Dinseguro?mibextid=ZbWKw\n\n• Comunidade Dinseguro no WhatsApp: https://chat.whatsapp.com/BmSXjGqkBRF4yRm3u0q37V\n\nObrigada pela confiança 🤝\nUm grande abraço da equipe Dinseguro! 💙' },
    // 5.34: (tirada) segunda definição de loas_com com /n30 — sobrescrevia a mensagem LOAS com margem da 5.00
    // 5.26: o atalho /07 NÃO EXISTE no Botmaker (conferido 12/11 11:44) → texto próprio (até a Stefany passar o modelo oficial)
    especie_fora:     { atalho: null,  tags: ['07 - Nao Identificado'], fechar: true,
                        texto: 'Oi! 😊 Aqui é da Dinseguro.\n\nConsultei o seu benefício e, infelizmente, ele é de um tipo que o INSS não libera para empréstimo consignado. Por isso, neste momento não conseguimos fazer uma proposta para você. 😔\n\nAgradecemos muito o seu contato e ficamos à disposição!' },
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
    // 4.72 (Stefany 11/11 17:02, caso Jamerson): CPF não localizado no Multicorban (como CPF e como matrícula) →
    // TAG 07 PRIMEIRO, depois o flow "Inicio do atendimento" (o flow fecha; depois dele não se mexe mais — erro 60).
    nao_localizado:   { fluxo: 'Inicio do atendimento', tags: ['07 - Nao Identificado'], fechar: false, tagsAntes: true },
    // 4.97 (Stefany 12/11 09:15 "pode ensinar ele"; casos Vania 11/11 21:35 e Gladimir 12/11 07:14): entrou pelo anúncio e o bot não respondeu → flow "Inicio do atendimento"
    anuncio_sem_bot:  { fluxo: 'Inicio do atendimento', tags: [], fechar: false },
    so_tag:           { atalho: null,   tags: [], fechar: false },
    // 4.79: mensagem da fase da esteira (documento / desbloqueio / anuência) — o.linha + o.atalhos, sem tag, sem fechar
    fase_msg:         { atalho: null,   tags: [], fechar: false },
    // 4.78: cliente parado no bot sem CPF → mensagem pedindo o CPF (o.texto) + 01 C (a espera de CPF 1h/08h nasce sozinha)
    pedir_cpf:        { atalho: null,   tags: ['01 C - Inss Nao Informou CPF - SEM 87 e 88'], fechar: false },
    // 4.75: simulação (linha) + /parabens ou /bn54n com o link (o.atalho + o.trocas) + tag 01 A, sem fechar
    sim_link:         { atalho: null,   tags: ['01 A - Inss Com Margem - SEM 87 E 88'], fechar: false },
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
      // 4.70 (caso Nilva: "01 I (já tinha)" sem ter): achar o cabeçalho "Tags N" do painel, não a 1ª palavra "Tags" da tela
      let i = T.search(/\nTags\s*\n\s*\d+\s*\n/); if (i < 0) i = T.indexOf('Tags'); if (i < 0) return '';
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
    // 5.03 (12/11 10:00, caso Marcelo → Franco): o endereço trocava mas o painel continuava mostrando o chat anterior, e a
    // mensagem saiu para outro cliente. Agora o robô só escreve depois de CONFIRMAR que o painel é do cliente da ordem:
    // telefone do painel = telefone do quadro; sem telefone conhecido, a conversa tem que ter mudado e o nome bater.
    // 5.28 (caso Teresa: contato sem "Informações de contato"): também lê a variável "Telefone do WhatsApp" e o nome do cabeçalho (acima de "Última sessão")
    const foneDoPainel = () => { const t = document.body.innerText || ''; return (t.match(/(?:Home|Lar)\s*\n\s*(\d{10,13})/) || t.match(/Telefone do WhatsApp\s*\n\s*\+?(\d{10,13})/) || [])[1] || ''; };
    const nomeDoPainel = () => { const t = document.body.innerText || ''; return ((t.match(/\bNome\s*\n\s*([^\n]+)/) || t.match(/\n\s*([^\n]{2,60}?)\s*\n+\s*(?:edit\s*\n+\s*)?[ÚU]ltima sess[ãa]o/) || [])[1] || '').trim(); };
    const soDig = v => String(v || '').replace(/\D/g, '');
    async function confereChat(hash) {
      const q = Object.assign({}, (GM_getValue('regua', {}) || {})[hash] || {});
      // 5.22 (caso Teresa 12/11: régua sem telefone nem nome → 'painel: ?'): completa com o nome da fila ou da lista de conversas
      if (!soDig(q.fone) && !q.nome) { try { const it = JSON.parse(localStorage.getItem('dins_fila') || '[]').find(f => f.id === hash); if (it && it.nome) q.nome = it.nome;
        if (!q.nome) { const li = document.getElementById(hash); const nm = li && (li.querySelector('.customer-name, [class*=name]') || {}).innerText; if (nm) q.nome = nm.trim(); } } catch (e) {} }
      // 5.36 (caso Teresa 15:50: régua sem nome e fora da fila → ordem do vigia nunca saía): usa o nome/fone que veio na própria ordem
      if (!soDig(q.fone) && !q.nome) { try { const od = JSON.parse(localStorage.getItem('dins_ordem') || 'null'); if (od && od.hash === hash) { if (od.fone) q.fone = od.fone; if (od.nome) q.nome = od.nome; } } catch (e) {} }
      const fEsp = soDig(q.fone);
      // 5.27 (caso Teresa 12/11: "Informações de contato" recolhido → painel sem Nome/Home): abre a seção antes de conferir
      if (!foneDoPainel() && !nomeDoPainel()) { try { const sec = [...document.querySelectorAll('div,span,h3,h4,button')].filter(e => e.offsetParent && e.children.length <= 3).find(e => /^\s*Informa[çc][õo]es de contato\s*$/i.test(e.innerText || '')); if (sec) { sec.click(); await esp(1500); } } catch (e) {} }
      const ok = await ate(() => { const f = soDig(foneDoPainel()); if (fEsp) return f && (f === fEsp || f.slice(-10) === fEsp.slice(-10));
        const n = nomeDoPainel(); return n && q.nome && n.trim().toLowerCase() === String(q.nome).trim().toLowerCase(); }, 15000);
      if (!ok) throw new Error('não confirmei que o chat aberto é o do cliente (painel: ' + (nomeDoPainel() || '?') + ') — NÃO mandei nada');
    }
    async function abrir(hash) {
      const alvo = '#/chats/' + hash.replace(/^#\/chats\//, '');
      if (!(await esperaChatLivre(hash.replace(/^#\/chats\//, '')))) throw new Error('a conversa está aberta em outra aba (vigia ou outro robô) — não mandei nada');   // 5.64
      const antes = foneDoPainel() + '|' + nomeDoPainel();
      if (window.top.location.hash !== alvo) { window.top.location.hash = alvo; await esp(4000); }
      const ok = await ate(() => window.top.location.hash === alvo && document.querySelector('.entries'), 15000);
      if (!ok) throw new Error('não consegui abrir o chat ' + hash);
      try { await confereChat(hash.replace(/^#\/chats\//, '')); }
      catch (e) { // painel preso no chat anterior → recarrega o chat uma vez e confere de novo
        // 5.75 (casos Maria 20:30 'painel: Carmen' e Vms 'painel: V.m.d.'): painel desatualizado → reabre a conversa até 3 vezes antes de desistir
        let ok2 = false, ult = e;
        for (let t = 0; t < 3 && !ok2; t++) { window.top.location.hash = '#/chats'; await esp(2500 + t * 1500); window.top.location.hash = alvo; await esp(6000 + t * 2000);
          try { await confereChat(hash.replace(/^#\/chats\//, '')); ok2 = true; } catch (e2) { ult = e2; } }
        if (!ok2) throw ult; }
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
      // 4.98 (12/11 09:23: "a janela EXECUTAR FLOW não abriu"): o Botmaker só abre com a sequência completa de ponteiro no ÍCONE
      const abreFlow = () => { const ic = botao.querySelector('.flow-selector-icon') || botao; const W = ic.ownerDocument.defaultView; const r = ic.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, view: W, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => ic.dispatchEvent(new (t.startsWith('pointer') ? W.PointerEvent : W.MouseEvent)(t, o))); };
      const achaCampo = () => [...document.querySelectorAll('input')].filter(vis).find(e => /Buscar fluxos/i.test(e.placeholder || ''));
      abreFlow(); await esp(1500);
      if (!achaCampo()) { clicar(botao); await esp(1500); }
      if (!achaCampo()) { abreFlow(); await esp(2000); }
      const campo = await ate(achaCampo, 8000);
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

    // 4.26 (Stefany 11/11 08:30, foto do "Enviar Template do WhatsApp" abrindo sozinho no 🙂): com a janela de 24 h vencida
    // o campo de mensagem vira o botão "Clique aqui para reabri-la usando um Template" — clicar/focar nele abre a janela de
    // template. O robô NUNCA tenta escrever em conversa vencida: para antes, fecha a janela de template se ela abriu, e a
    // conversa fica para a VARREDURA (follow-up pelo outro número + fechar).
    const fecharTemplate = () => { const b = [...document.querySelectorAll('button')].filter(vis).find(x => /^Descartar$/i.test(txt(x)) && /Enviar Template do WhatsApp/i.test(((x.closest('[role=dialog]') || {}).innerText) || '')); if (b) { clicar(b); return true; } return false; };
    const janelaVencidaAgora = () => { const ta = document.querySelector('textarea'); const ph = (ta && (ta.placeholder || ta.getAttribute('placeholder'))) || ''; return /janela de 24 horas est[áa] finalizada|reabri-la usando um Template|conversa foi encerrada 24 horas ap[óo]s/i.test(ph); };
    // (não fecha a janela de template sozinho fora do envio: a Stefany pode estar usando de propósito)
    async function respostaRapida(atalho, editar, semRegua, prefixo, trocas, midia) {
      const hashRR0 = window.top.location.hash;   // 4.60
      const ta = await ate(() => document.querySelector('textarea'));
      if (!ta) throw new Error('caixa de mensagem não encontrada');
      if (janelaVencidaAgora()) { fecharTemplate(); throw new Error('JANELA_VENCIDA'); }
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
      // 4.79: resposta rápida de VÍDEO/arquivo (/dsg25, /anuencia2…) não enche a caixa de texto → espera a prévia e confere pelo nº de mensagens
      if (midia) {
        await esp(3500);
        if (window.top.location.hash !== hashRR0) throw new Error('a tela trocou de chat antes de enviar — não mandei');
        const n0 = document.querySelectorAll('.entries [class*="entries-li"].right').length;
        clicar(await ate(() => document.querySelector('button.send-button-component')));
        const foi = await ate(() => document.querySelectorAll('.entries [class*="entries-li"].right').length > n0, 15000);
        if (!foi) throw new Error('a mídia ' + atalho + ' não apareceu no chat');
        return atalho + ' (mídia)';
      }
      const cheio = await ate(() => document.querySelector('textarea').value.length > 40, 10000);
      if (!cheio) throw new Error('a resposta rápida não entrou na caixa');
      // 4.57: atalho que começa com vírgula (/102 ", sua opinião…") recebe o primeiro nome na frente
      if (prefixo && /^\s*,/.test(document.querySelector('textarea').value)) { const t3 = document.querySelector('textarea'); t3.focus(); setNativo(t3, prefixo + t3.value.trimStart()); await esp(600); }
      if (editar) {
        const ta2 = document.querySelector('textarea');
        let v = ta2.value; EDICAO_LOAS.forEach(([de, para]) => { v = v.replace(de, para); });
        ta2.focus(); setNativo(ta2, v); await esp(600);
      }
      if (trocas && trocas.length) {   // 4.75: {NOME}, {VALOR}, {BANCO}, "Cola link"/"colar link" (sem nenhum marcador sobrando)
        const ta3 = document.querySelector('textarea'); let v = ta3.value;
        for (const [de, para] of trocas) v = v.replace(new RegExp(String(de).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), para);
        if (/\{NOME\}|\{VALOR\}|\{BANCO\}|col(a|ar) (o )?link/i.test(v)) { setNativo(ta3, ''); throw new Error('sobrou marcador na resposta rápida ' + atalho + ' — não mandei'); }
        ta3.focus(); setNativo(ta3, v); await esp(700);
      }
      if (window.top.location.hash !== hashRR0 || (vigiaTrava() && !rodando)) { setNativo(document.querySelector('textarea'), ''); throw new Error('a tela trocou de chat antes de enviar — não mandei'); }   // 4.60
      const valorEnviado = document.querySelector('textarea').value;
      const trecho = valorEnviado
        .replace(/[*_]/g, '').split('\n').find(l => l.trim().length > 20) || '';
      clicar(await ate(() => document.querySelector('button.send-button-component')));
      await esp(4000);
      const chegou = document.querySelector('.entries').innerText.slice(-4000)
        .replace(/[*_]/g, '').includes(trecho.trim().slice(0, 30));
      if (!chegou) throw new Error('mandei mas a mensagem não apareceu no chat (chat bloqueado?)');
      // 5.94 (Stefany 13/11 10:16): balão com "!" vermelho = NÃO foi enviado ao cliente. ✓ = saiu; ✓✓ cinza = chegou; ✓✓ azul = viu.
      // Espera o tique aparecer (até 25 s); sem tique → erro para o vigia reenviar (o "não duplicar" impede o robô de mandar de novo sozinho).
      { const k0 = valorEnviado.replace(/[*_\s]/g, '').slice(0, 30); let tq = '';
        for (let i = 0; i < 25 && !tq; i++) { const b = [...document.querySelectorAll('.entries [class*="entries-li"].right')].reverse().find(e => (e.innerText || '').replace(/[*_\s]/g, '').includes(k0));
          tq = b ? ([...b.querySelectorAll('.material-icons, .material-symbols-outlined')].map(x => (x.innerText || '').trim()).find(x => /^(done_all|check|done)$/.test(x)) || '') : ''; if (!tq) await esp(1000); }
        if (!tq) throw new Error('a mensagem ficou com ! vermelho (sem tique) — NÃO chegou ao cliente: reenviar à mão'); }
      // Stefany, 07/11 16:18: quem registra o link sou eu. Toda mensagem que sai com
      // link (o /bn54n e o /parabens levam link) agenda sozinha o follow-up de 10 e 60 min.
      // v3.80 (Stefany 10/11, caso Evandro): o /n30 leva o link do GRUPO de WhatsApp e das redes sociais — isso
      // NÃO é link de proposta e não pode gerar "Conseguiu acessar?" nem /132. Só agenda quando há link que não é
      // de grupo/rede social e a resposta rápida não é de desfecho (recusa).
      const ehDesfecho = Object.values(DESFECHOS).some(d => d.atalho && d.atalho.toLowerCase() === String(atalho).toLowerCase());
      const linksProposta = ((valorEnviado || '').match(/https?:\/\/[^\s)]+/g) || [])
        .filter(u => !/chat\.whatsapp\.com|wa\.me|whatsapp\.com|instagram\.com|facebook\.com|fb\.me|youtube|youtu\.be|tiktok|linktr\.ee/i.test(u));
      if (!semRegua && !ehDesfecho && linksProposta.length) agendarSeTiverLink();
      return trecho.trim().slice(0, 40);
    }

    // 2b. texto escrito, sem atalho (pensão alimentícia)
    async function mensagemLivre(texto) {
      const ta = await ate(() => document.querySelector('textarea'));
      if (!ta) throw new Error('caixa de mensagem não encontrada');
      if (janelaVencidaAgora()) { fecharTemplate(); throw new Error('JANELA_VENCIDA'); }
      // 4.60 (13:22: "Josias, tudo bem?" saiu no chat da Lu): confere que a tela NÃO mudou de chat entre digitar e enviar,
      // e que o vigia não pegou a tela nesse meio-tempo.
      const hash0 = window.top.location.hash, nome0 = nomeDoContato();
      // 4.70 (caso Nilva 15:43: o mesmo follow-up saiu 2x — dois Chromes com o robô): se o mesmo texto já está entre as
      // últimas mensagens NOSSAS da conversa, não manda de novo.
      const jaTem = () => { const k = texto.replace(/[*_\s]/g, '').slice(0, 45); return [...document.querySelectorAll('.entries [class*="entries-li"].right')].slice(-6).some(e => (e.innerText || '').replace(/[*_\s]/g, '').includes(k)); };
      if (jaTem()) throw new Error('DUPLICADO: essa mensagem já está no chat — não mandei de novo');
      ta.focus(); setNativo(ta, texto); await esp(800 + Math.floor(Math.random() * 4000));
      if (jaTem()) { setNativo(ta, ''); throw new Error('DUPLICADO: outra aba mandou a mesma mensagem agora — não mandei'); }
      if (window.top.location.hash !== hash0 || nomeDoContato() !== nome0 || (vigiaTrava() && !rodando)) { setNativo(ta, ''); throw new Error('a tela trocou de chat antes de enviar — não mandei'); }
      clicar(await ate(() => document.querySelector('button.send-button-component')));
      await esp(4000);
      const chegou = document.querySelector('.entries').innerText.slice(-4000)
        .replace(/[*_]/g, '').includes(texto.replace(/[*_]/g, '').slice(0, 30));
      if (!chegou) throw new Error('mandei mas a mensagem não apareceu no chat (chat bloqueado?)');
      // 5.94 (Stefany 13/11 10:16): balão com "!" vermelho = NÃO foi enviado ao cliente. ✓ = saiu; ✓✓ cinza = chegou; ✓✓ azul = viu.
      // Espera o tique aparecer (até 25 s); sem tique → erro para o vigia reenviar (o "não duplicar" impede o robô de mandar de novo sozinho).
      { const k0 = texto.replace(/[*_\s]/g, '').slice(0, 30); let tq = '';
        for (let i = 0; i < 25 && !tq; i++) { const b = [...document.querySelectorAll('.entries [class*="entries-li"].right')].reverse().find(e => (e.innerText || '').replace(/[*_\s]/g, '').includes(k0));
          tq = b ? ([...b.querySelectorAll('.material-icons, .material-symbols-outlined')].map(x => (x.innerText || '').trim()).find(x => /^(done_all|check|done)$/.test(x)) || '') : ''; if (!tq) await esp(1000); }
        if (!tq) throw new Error('a mensagem ficou com ! vermelho (sem tique) — NÃO chegou ao cliente: reenviar à mão'); }
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
    // 5.50 (Stefany 12/11 17:30): REGRA DAS TAGS — 01 C + informou CPF/tem proposta → tira 01 C, põe 01 A · 01 A + assinou → tira 01 A, põe 01 D ·
    // 01 D + contratou e sobrou margem → mantém 01 D + 01 J · 01 D + margem acabou → mantém 01 D + 01 k. Retorno dado (01 I/k, 02, 03, 07) também tira a 01 C.
    async function tirarTag(re) {
      const chips = [...document.querySelectorAll('.MuiChip-root')].filter(c => vis(c) && re.test(((c.querySelector('.MuiChip-label') || {}).textContent || '').trim()) && c.querySelector('.MuiChip-deleteIcon'));
      const tirou = [];
      for (const c of chips) { const nm = ((c.querySelector('.MuiChip-label') || {}).textContent || '').trim(); clicar(c.querySelector('.MuiChip-deleteIcon')); await esp(1500);
        const ok = await ate(() => [...document.querySelectorAll('button')].filter(vis).find(b => /^(Sim|Confirmar|Remover|Excluir|OK)$/i.test(txt(b))), 2500); if (ok) { clicar(ok); await esp(1500); }
        tirou.push(nm); }
      await fecharMenus(); return tirou;
    }
    async function addTag(nome) {
      const r = await addTag0(nome);
      try { const t = String(nome); let tirou = [];
        if (/^01 A/i.test(t) || /^01 (I|k)/i.test(t) || /^0[237]/.test(t)) tirou = tirou.concat(await tirarTag(/^01 C\b/i));
        if (/^01 D/i.test(t)) tirou = tirou.concat(await tirarTag(/^01 [AC]\b/i));
        if (tirou.length) return r + ' (tirei: ' + tirou.join(', ') + ')'; } catch (e) {}
      return r;
    }
    async function addTag0(nome) {
      const prefixo = /\*$/.test(nome); nome = nome.replace(/\*$/, '');
      if (new RegExp(nome.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(areaTags())) return nome + ' (já tinha)';
      const mais = maisDe(/^Tags$/);
      if (!mais) throw new Error('botão + das Tags não encontrado');
      clicar(mais);
      const campo = await ate(() => document.getElementById('addtag'), 10000);
      if (!campo) throw new Error('caixa de tag não abriu');
      campo.focus(); setNativo(campo, nome.slice(0, 11));
      const op = await ate(() => [...document.querySelectorAll('li,[role=option]')]
        .filter(vis).find(o => prefixo ? txt(o).startsWith(nome) : txt(o) === nome), 10000);
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
      // 4.33 (Silvania 11/11): a caixa "Selecionar tipo de conversa" nem sempre é combobox/input — procura pelo texto em
      // qualquer elemento e clica nele; depois escolhe a opção "Fechar Conversa" da lista que abre.
      const lista = await ate(() => [...document.querySelectorAll('[role=combobox],.MuiSelect-select,input')]
        .filter(vis).find(x => /Selecionar tipo de conversa/i.test(txt(x) || x.placeholder || ''))
        || [...document.querySelectorAll('div,span,p,label')].filter(vis).find(x => x.children.length === 0 && /^Selecionar tipo de conversa$/i.test(txt(x))), 10000);
      if (lista) {
        clicar(lista.closest('[role=combobox],[role=button],.MuiSelect-select,.MuiInputBase-root') || lista); await esp(1500);
        const op = await ate(() => [...document.querySelectorAll('li,[role=option],[role=menuitem]')]
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
    const vigiaTrava = () => Date.now() < (+localStorage.getItem('dins_vigia_trava') || 0);
    async function olharOrdem() {
      if (rodando) return;
      { let o0 = null; try { o0 = JSON.parse(localStorage.getItem('dins_ordem') || 'null'); } catch (e) {} if (o0 && o0.quem && o0.quem !== 'vigia' && vigiaTrava()) return; }   // 4.54
      let o; try { o = JSON.parse(localStorage.getItem('dins_ordem') || 'null'); } catch (e) { return; }
      if (!o || !o.hash || !o.acao) return;
      const id = o.hash + '|' + o.acao + '|' + (o.t || '');
      if (id === ultima) return;
      const d = DESFECHOS[o.acao];
      if (!d) { localStorage.setItem('dins_ordem_status', JSON.stringify({ st: 'erro', erro: 'ação desconhecida: ' + o.acao })); ultima = id; return; }
      rodando = true; ultima = id;
      const passos = [];
      const grava = (st, extra) => { localStorage.setItem('dins_ordem_status',
        JSON.stringify(Object.assign({ st, hash: o.hash, acao: o.acao, passos, t: Date.now() }, extra || {})));
        // 4.83 (Stefany 11/11 21:58, caso Fernando: "depois que ele responde, ele fica pendente… já fechou, já resolveu, e não coloca como resolvido"):
        // ordem terminada com sucesso → sai da fila "Esperando atendimento" e o quadro deixa de pedir "responder agora".
        if (st === 'ok' && o.hash && !/pular|nada/i.test(String(o.acao))) { try {
          const RS = JSON.parse(localStorage.getItem('dins_resolvidos') || '{}'); RS[o.hash] = Date.now(); localStorage.setItem('dins_resolvidos', JSON.stringify(RS));
          const fl = JSON.parse(localStorage.getItem('dins_fila') || '[]'); const it = fl.find(f => f.id === o.hash);
          if (it) { const fe = JSON.parse(localStorage.getItem('dins_feito') || '{}'); fe[o.hash] = it.sig; localStorage.setItem('dins_feito', JSON.stringify(fe)); localStorage.setItem('dins_fila', JSON.stringify(fl.filter(f => f.id !== o.hash))); }
          const rg = GM_getValue('regua', {}) || {}; const q = rg[o.hash];
          if (q && !['alerta', 'erro'].includes(q.estado) && o.acao === 'fase_msg' && passos.some(p => /^msg:/.test(p))) { q.ultLado = 'nos'; q.ultT = Date.now(); if (/resolvido pelo robô/.test(q.motivo || '')) q.motivo = 'última mensagem é nossa — aguardando o cliente'; GM_setValue('regua', rg); }   // 5.52
          if (q && ['alerta', 'erro'].includes(q.estado)) { const fechou = passos.some(p => /fechad/i.test(p)); q.estado = fechou ? 'encerrado' : 'acompanhando'; q.motivo = fechou ? 'resolvido pelo robô (' + o.acao + ', conversa fechada)' : (o.acao === 'fase_msg' ? 'última mensagem é nossa — aguardando o cliente' : 'resolvido pelo robô (' + o.acao + ')'); if (o.acao === 'fase_msg') { q.ultLado = 'nos'; q.ultT = Date.now(); } /* 5.52: depois da nossa mensagem entra na sequência de follow-up */ q.lidoT = Date.now(); delete q.cpfSemRespT; delete q.cpfSem; (q.hist = q.hist || []).push(new Date().toTimeString().slice(0, 5) + ' ' + q.motivo); GM_setValue('regua', rg); }
          setTimeout(() => { try { desenharQuadro(JSON.parse(localStorage.getItem('dins_fila') || '[]')); } catch (e) {} try { desenharRegua(); } catch (e) {} }, 500);
        } catch (e) {} } };
      grava('rodando');
      try {
        // 4.22 (Stefany 11/11 07:34, caso Vilmar): se a tela trocar de chat no meio, o desfecho VOLTA para o chat e continua
        // de onde parou (não para mais deixando a conversa aberta). A mensagem nunca sai duas vezes (o.msgFeita).
        const garante = async () => { if (window.top.location.hash !== '#/chats/' + o.hash) { passos.push('voltou ao chat'); await abrir(o.hash); } await confereChat(o.hash); };   // 5.03: confere o cliente antes de CADA envio
        const salvaProgresso = mud => { Object.assign(o, mud); try { localStorage.setItem('dins_ordem', JSON.stringify(o)); } catch (e) {} };
        await abrir(o.hash);                               passos.push('abriu');
        // 4.33 (Silvania 11/11: /n30 saiu duas vezes, 09:37 e 09:43): o mesmo desfecho no mesmo chat não manda a mensagem
        // de novo em 12 h — vale para ordem repetida, cópia velha da ordem ou desfecho automático em cima do manual.
        const chaveDesf = o.hash + '|' + o.acao + (o.acao === 'sim_link' ? '|' + (((o.trocas || []).find(t => /link/i.test(t[0])) || [])[1] || o.t || '') : '');   // 6.01 (Michele/Marilza 13/11): proposta REFEITA tem outro link → não é repetição
        const feitos = GM_getValue('desf_msg_feita', {}) || {};
        if (!o.msgFeita && !o.forcar && feitos[chaveDesf] && Date.now() - feitos[chaveDesf] < 12 * 3600000) { passos.push('msg já tinha saído (não repeti)'); salvaProgresso({ msgFeita: 1, linhaFeita: 1 }); }
        // 5.12 (caso Marcelo 72ND): última trava do pedido de CPF — o chat já tem um CPF escrito pelo cliente → não pede, não põe 01 C.
        if (o.acao === 'pedir_cpf' && !o.msgFeita) { try { const tx0 = [...document.querySelectorAll('.entries [class*="entries-li"].left')].map(e => e.innerText || '').join('\n').slice(-30000);   // 5.35: só mensagens do CLIENTE (o bot tem 0800/números que pareciam CPF — caso Douglas)
          if (/(^|\D)\d{3}\.?\d{3}\.?\d{3}[-.\s]?\s?\d\s?\d(\D|$)/.test(tx0)) { passos.push('cliente já mandou o CPF — NÃO pedi de novo'); salvaProgresso({ msgFeita: 1, linhaFeita: 1, tagsFeitas: 1, notaFeita: 1 }); } } catch (e) {} }
        // 5.38: toque de retomada só sai se a ÚLTIMA mensagem da conversa for nossa (cliente não falou depois)
        if (o.soSeNossaUltima && !o.msgFeita) { try { const ul = [...document.querySelectorAll('.entries [class*="entries-li"]')].filter(e => (e.innerText || '').trim().length > 2).slice(-1)[0];
          let recente = false; { const mh = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec((ul && ul.innerText) || ''); if (mh) { let h = +mh[1] % 12; if (/PM/i.test(mh[3])) h += 12; const d = new Date(); d.setHours(h, +mh[2], 0, 0); const dif = Date.now() - d.getTime(); recente = dif >= 0 && dif < 2 * 3600000; } }
          if (ul && (ul.classList.contains('left') || recente)) { passos.push(recente ? 'falamos há menos de 2 h — NÃO mandei o toque' : 'cliente falou por último — NÃO mandei o toque'); salvaProgresso({ msgFeita: 1, linhaFeita: 1, tagsFeitas: 1, notaFeita: 1 }); } } catch (e) {} }
        if (o.pularSe && !o.msgFeita) { try { if (new RegExp(o.pularSe, 'i').test((document.querySelector('.entries') || {}).innerText.slice(-20000))) { passos.push('já tinha saído (não repeti)'); salvaProgresso({ msgFeita: 1, linhaFeita: 1 }); } } catch (e) {} }   // 4.79
        if (o.linha && !o.linhaFeita) { await garante(); passos.push('linha:' + await mensagemLivre(o.linha)); salvaProgresso({ linhaFeita: 1 }); await garante(); }   // 4.24: linha cordial antes da resposta rápida
        if (d.tagsAntes && !o.tagsFeitas) { const tg0 = (o.tags && o.tags.length ? o.tags : d.tags); for (const t of tg0) { await garante(); passos.push('tag:' + await addTag(t)); } salvaProgresso({ tagsFeitas: 1 }); await garante(); }   // 4.72
        if (!o.msgFeita) {
          if (o.atalhos && o.atalhos.length) { for (let i = (o.atIdx || 0); i < o.atalhos.length; i++) { await garante(); const [at, md] = String(o.atalhos[i]).split('|'); passos.push('msg:' + await respostaRapida(at, false, false, null, o.trocas, md === 'midia')); salvaProgresso({ atIdx: i + 1 }); await esp(1500); } }   // 4.79: várias respostas rápidas em ordem
          else if (d.fluxo) { passos.push(await executarFluxo(d.fluxo)); }
          else if (o.atalho || d.atalho) { passos.push('msg:' + await respostaRapida(o.atalho || d.atalho, d.editar, false, null, o.trocas)); }
          else if (o.texto || d.texto) { passos.push('msg:' + await mensagemLivre(o.texto || d.texto)); }
          salvaProgresso({ msgFeita: 1 });
          try { const f2 = GM_getValue('desf_msg_feita', {}) || {}; f2[chaveDesf] = Date.now(); for (const k in f2) if (Date.now() - f2[k] > 48 * 3600000) delete f2[k]; GM_setValue('desf_msg_feita', f2); } catch (e) {}
        }
        const tags = (o.tags && o.tags.length ? o.tags : d.tags).slice();
        if (o.q15 && /^(sem_margem|sem_margem_k)$/.test(o.acao)) tags.push(TAG_Q15);
        if (!o.tagsFeitas) { for (const t of tags) { await garante(); passos.push('tag:' + await addTag(t)); } salvaProgresso({ tagsFeitas: 1 }); }
        if (o.nota && !o.notaFeita && !(o.pularSe && passos.some(x => /já tinha saído/.test(x)))) { await garante(); passos.push(await addNota(o.nota)); salvaProgresso({ notaFeita: 1 }); }
        if (d.fechar) { await garante(); passos.push(await fecharConversa()); limparFiltro(); }
        grava('ok');
        // v3.80: conversa recusada/fechada não recebe follow-up de link que tenha ficado agendado
        try { if (window.dinsEsperaTirar && !['sim_link', 'fase_msg', 'pedir_cpf', 'anuncio_sem_bot', 'so_tag'].includes(o.acao)) window.dinsEsperaTirar(o.hash); } catch (e) {}   // 5.81 (Stefany 21:36, azuis sem follow-up: o pedido de CPF/mensagem do robô apagava a própria espera e bloqueava 36 h) · 4.70 (caso Nilva 15:43): desfecho cancela também o follow-up de CPF/simulação
        // 5.21 (Stefany 12/11 11:57, casos Alexandre e Marcelo: responderam depois do link e ninguém viu): link/mensagem de fase/pedido de CPF NÃO encerram a régua —
        // a régua do link continua e a resposta do cliente volta para "Responder agora". Só desfecho final (sem margem, 07, LOAS, fecha…) cancela.
        try { if (!['sim_link', 'fase_msg', 'pedir_cpf', 'anuncio_sem_bot', 'so_tag'].includes(o.acao)) window.dinsReguaCancelar(o.hash, 'desfecho ' + o.acao); if (d.fechar) { const r = GM_getValue('regua', {}); if (r[o.hash]) { r[o.hash].estado = 'fechada'; r[o.hash].motivo = 'conversa fechada (' + o.acao + ')'; GM_setValue('regua', r); localStorage.setItem('dins_regua', JSON.stringify(Object.values(r))); } } } catch (e) {}
        localStorage.removeItem('dins_ordem');  // 3.76: ordem cumprida não roda de novo quando a aba recarrega
        log && log('Desfecho ' + o.acao + ' concluído: ' + passos.join(' · '), 'ok');
      } catch (e) {
        // 4.22: até 3 tentativas, continuando do passo que faltou (a mensagem não repete)
        if (/outra aba/.test(e.message || '') && Date.now() - (+o.t0 || (o.t0 = +o.t || Date.now())) < 20 * 60000) { o.t = Date.now(); try { localStorage.setItem('dins_ordem', JSON.stringify(o)); } catch (e2) {} grava('esperando', { erro: e.message }); ultima = ''; return; }   // 5.73 (caso Vms EHRY6: sem margem 19:32 nunca saiu): conversa aberta em outra aba não gasta tentativa — espera até 20 min
        o.tent = (o.tent || 0) + 1;
        if (o.tent < 3) { o.t = Date.now(); try { localStorage.setItem('dins_ordem', JSON.stringify(o)); } catch (e2) {} grava('repetindo', { erro: e.message, tent: o.tent }); ultima = ''; log && log('Desfecho parou (' + e.message + ') — tento de novo do ponto que faltou.', 'erro'); }
        else { grava('erro', { erro: e.message }); localStorage.removeItem('dins_ordem'); log && log('Desfecho PAROU: ' + e.message, 'erro'); }
      } finally { rodando = false; }
    }
    setInterval(() => { if (faz('atendimento')) olharOrdem(); }, 3000);
    // 4.24 — desfecho automático do CPF sem margem (ordem do Multicorban em GM auto_ordens, estado 'desfecho').
    // Só com a tela livre: sem dins_ordem na fila, vigia parado há 2 min, nenhum desfecho rodando.
    const LINHA_SEM_MARGEM = n => 'Obrigado por mandar' + (n ? ', ' + n : '') + ' 🙏 Já consultei aqui com calma. No momento o seu benefício está sem margem disponível para um novo empréstimo, então infelizmente não conseguimos fazer uma proposta agora. Fique tranquilo(a): não foi feito nada no seu nome. Te explico abaixo 👇';
    const primeiroNome = n => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''; };
    // 5.89 (Stefany 13/11 09:24 e 09:33): nome do WhatsApp só vale quando parece nome de gente (ex.: "Silvia Rubia") —
    // 2+ palavras só com letras, a primeira com 3+ letras. Apelido/usuário ("Kel", "Adri...", "Monica 5516…", emoji) → sem nome.
    const nomeZapOk = n => { const t = String(n || '').trim(); if (!t || /[^\p{L}\s'.-]/u.test(t) || /\.\.|\d/.test(t)) return ''; const w = t.split(/\s+/).filter(Boolean); return w.length >= 2 && w[0].replace(/[^\p{L}]/gu, '').length >= 3 && w.every(x => x.replace(/[^\p{L}]/gu, '').length >= 2) ? t : ''; };
    const nomeCli = x => primeiroNome((x && x.nomeReal) || nomeZapOk(x && x.nome));
    setInterval(() => {
      if (!faz('atendimento')) return;   // 5.64 papel da aba
      try {
        if (rodando || localStorage.getItem('dins_ordem') || ((Date.now() - (+localStorage.getItem('dins_varrendo') || 0) < 2 * 60000) && !(Date.now() - (+localStorage.getItem('dins_varre_livre') || 0) < 12000) && !localStorage.getItem('dins_varre_pausa'))) return;   // 4.90: no intervalo da varredura (dins_varre_livre) as respostas do robô saem
        if (Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 2 * 60000) return;
        const O = GM_getValue('auto_ordens', {}) || {};
        const st = (() => { try { return JSON.parse(localStorage.getItem('dins_ordem_status') || 'null'); } catch (e) { return null; } })();
        let mud = false;
        for (const k in O) { const o = O[k]; if (o.estado === 'desfecho_enviado' && st && st.hash === o.hash && ['ok', 'erro'].includes(st.st) && st.t > (o.tEnv || 0)) { o.estado = st.st === 'ok' ? 'desfecho_ok' : 'erro'; if (st.st !== 'ok') o.erro = 'desfecho automático parou: ' + (st.erro || ''); mud = true; } }
        for (const k in O) { const x = O[k]; if (x.estado === 'link_enviado' && st && st.hash === x.hash && st.acao === 'sim_link' && ['ok', 'erro'].includes(st.st) && st.t > (x.tEnv || 0)) { x.estado = st.st === 'ok' ? 'feito' : 'erro'; if (st.st !== 'ok') x.erro = 'envio do link parou: ' + (st.erro || '') + ' (proposta ' + (x.proposta || '') + ' gravada)'; mud = true; } }
        // 4.79 (Stefany 11/11 18:56 "pode fazer"): ESTEIRA → MENSAGEM sozinha, e "desbloqueei" → lista do AVERBE JA.
        try {
          const RGe = GM_getValue('regua', {}) || {}; const hh2 = new Date().getHours(); const FE = window.dinsFaseEsteira;
          const NM = GM_getValue('nao_mexer', {}) || {};
          for (const k in RGe) { const x = RGe[k]; if (!x || !x.link || typeof FE !== 'function' || NM[k] || x.comQuem || protegido(k)) continue;   // conversa que a Stefany/Rômulo está tocando: não mexe
            const fe = FE(k); if (!fe) continue; const nm = nomeCli(x);
            // (3) cliente disse que desbloqueou → AVERBE JA de 60 em 60 s no Autorizador (só C6), e uma linha de retorno (responde a qualquer hora)
            if (fe.fase === 'falta desbloquear' && /C6/i.test(fe.banco || '') && fe.nome && x.ultLado === 'cli' && (x.ultCliT || 0) > (x.averbarT || 0)
                && /desbloque|liberei|j[áa] (fiz|liberei|desbloq)|consegui|t[áa] feito|fiz o desbloqueio/i.test(x.ultCliTxt || '')) {
              const A = GM_getValue('averbar', {}) || {}; const kk = fe.nome.trim().toUpperCase();
              A[kk] = Object.assign(A[kk] || {}, { ativo: true, cada: 60000, desde: Date.now(), ultT: 0, tent: 0, avisado: false, hash: k }); GM_setValue('averbar', A);
              const r2 = GM_getValue('regua', {}) || {}; if (r2[k]) { r2[k].averbarT = Date.now(); (r2[k].hist = r2[k].hist || []).push(hhmm(Date.now()) + ' disse que desbloqueou → AVERBE JA automático'); GM_setValue('regua', r2); }
              localStorage.setItem('dins_ordem', JSON.stringify({ hash: k, acao: 'so_tag', quem: 'robo', t: Date.now(), texto: 'Perfeito' + (nm ? ', ' + nm : '') + '! 😊 Já estou acompanhando aqui com o banco e te aviso assim que avançar 🤝' }));
              return;
            }
            // (2) fase nova da esteira → mensagem certa, uma vez por fase, das 8h às 21h
            if (hh2 < 8 || hh2 >= 21) continue;
            if (x.faseFeita === fe.fase || (x.faseMsgT && x.faseMsg === fe.fase)) continue;
            let linha = '', atalhos = [], pularSe = '';
            if (fe.fase === 'falta documento') { linha = (nm ? nm + ', p' : 'P') + 'ara o banco finalizar a análise da sua proposta, falta só uma foto do seu documento 😊 Te explico logo abaixo como mandar:'; atalhos = ['/CLT1']; pularSe = 'falta só uma foto do seu documento|frente e verso'; }
            else if (fe.fase === 'falta desbloquear') {
              // 4.82 (Stefany 11/11 17:20): desbloqueio SÓ com DDB ≥ 91 dias. DDB < 91 → não fala nada. Sem DDB → fila para o vigia conferir.
              const Dd = GM_getValue('ddb_cli', {}) || {}; const nnE = s2 => String(s2 || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
              const ddbS = Dd['N:' + nnE(fe.nome)] || Dd['N:' + nnE(x.nomeReal)] || (x.cpf ? Dd['C:' + String(x.cpf).replace(/\D/g, '')] : '');
              const diasD = ddbS ? (Date.now() - new Date(ddbS.split('/').reverse().join('-'))) / 864e5 : NaN;
              if (!ddbS || isNaN(diasD) || diasD < 91) {
                const r4 = GM_getValue('regua', {}) || {}; if (r4[k]) { r4[k].faseFeita = fe.fase; (r4[k].hist = r4[k].hist || []).push(hhmm(Date.now()) + (ddbS && !isNaN(diasD) ? ' desbloqueio NÃO pedido: DDB ' + ddbS + ' (' + Math.floor(diasD) + ' dias < 91)' : ' desbloqueio: DDB desconhecido → vigia confere')); if (!ddbS || isNaN(diasD)) { r4[k].estado = 'alerta'; r4[k].motivo = 'esteira falta desbloquear — conferir DDB (≥ 91 dias pede /dsg25a + /dsg25; < 91 não fala nada)'; } GM_setValue('regua', r4); }
                continue;
              }
              linha = (nm ? nm + ', e' : 'E') + 'stá tudo certinho com a sua proposta 😊\n\nAgora falta só um passo rápido do seu lado, que é liberar o benefício para o banco. Vou te mandar logo abaixo como fazer, é bem simples.'; atalhos = ['/dsg25a', '/dsg25|midia']; pularSe = 'passo a passo para realizar o desbloqueio'; }
            else if (fe.fase === 'falta anuência') { linha = (nm ? nm + ', o' : 'O') + ' desbloqueio deu certo 👏 Agora falta só confirmar a autorização no Meu INSS. Te mando abaixo como fazer:'; atalhos = ['/anuencia', '/anuencia2|midia']; pularSe = 'confirmar a autoriza[çc][ãa]o no Meu INSS'; }
            else continue;
            const r3 = GM_getValue('regua', {}) || {}; if (r3[k]) { r3[k].faseMsg = fe.fase; r3[k].faseMsgT = Date.now(); (r3[k].hist = r3[k].hist || []).push(hhmm(Date.now()) + ' esteira "' + fe.fase + '" → mensagem automática'); GM_setValue('regua', r3); }
            const dd3 = String(new Date().getDate()).padStart(2, '0') + '/' + String(new Date().getMonth() + 1).padStart(2, '0');
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: k, acao: 'fase_msg', quem: 'robo', t: Date.now(), linha, atalhos, pularSe, nota: dd3 + ' ' + hhmm(Date.now()) + ' [robô 4.79] esteira ' + (fe.banco || '') + ': ' + (fe.real || fe.fase) + ' → ' + atalhos.map(a => a.split('|')[0]).join(' + ') + ' (automático).' }));
            return;
          }
        } catch (e) {}
        // 4.78 (Stefany 11/11 18:54 "o cliente parado aí no bot sem CPF, pode colocar ele para fazer"): parou no bot sem CPF →
        // até 45 min depois de parar pede o CPF a qualquer hora (ele estava interagindo); mais que isso, só das 8h às 21h. Uma vez por conversa.
        try {
          const RGv = GM_getValue('regua', {}) || {}; const PC = GM_getValue('pedir_cpf_feito', {}) || {}; const hh = new Date().getHours();
        // 4.97: anúncio sem resposta do bot → flow "Inicio do atendimento" (2 min depois de entrar; uma vez por conversa; qualquer hora — foi o cliente que chamou)
        try { const RGa = GM_getValue('regua', {}) || {}; const AF = GM_getValue('anuncio_flow_feito', {}) || {}; const NMa = GM_getValue('nao_mexer', {}) || {};
          let STa = null; try { STa = JSON.parse(localStorage.getItem('dins_ordem_status') || 'null'); } catch (e) {}
          for (const k of Object.keys(RGa)) { const x = RGa[k]; if (!x || x.estado !== 'alerta' || !/veio do anúncio e o bot não respondeu/.test(x.motivo || '') || NMa[k] || k === 'F20QOEL8YYLQN2S6SR47' || protegido(k)) continue;
            if (AF[k]) { const falhou = STa && STa.hash === k && STa.acao === 'anuncio_sem_bot' && STa.st === 'erro'; const nT = +(AF[k + '#n'] || 1); if (!(falhou && nT < 3 && Date.now() - AF[k] > 60000)) continue; AF[k + '#n'] = nT + 1; }   // 4.98: deu erro → tenta de novo (até 3x)
            if (Date.now() - (+x.criadoT || 0) < 2 * 60000) continue;
            AF[k] = Date.now(); GM_setValue('anuncio_flow_feito', AF);
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: k, acao: 'anuncio_sem_bot', quem: 'robo', t: Date.now() }));
            return; } } catch (e) {}
          for (const k in RGv) { const x = RGv[k];
            if (!x || x.estado !== 'alerta' || !/parou sem CPF/.test(x.motivo || '') || PC[k] || !x.semCpfT || (GM_getValue('nao_mexer', {}) || {})[k] || protegido(k)) continue;
            // 5.12 (Stefany 12/11 11:11, caso Marcelo 72ND: mandou o CPF 10:30, o robô pediu o CPF de novo 10:37): CPF já recebido → nunca pedir.
            // Sinais: ordem automática para este chat (qualquer estado, 23 h), CPF no mapa CPF→chat, ou CPF/consulta registrados na régua.
            { const AOx = (GM_getValue('auto_ordens', {}) || {})[k]; if (AOx && Date.now() - (+AOx.t || 0) < 23 * 3600000) continue;
              const ZC = GM_getValue('zap_por_cpf', {}) || {}; if (Object.values(ZC).some(v => v === k || (v && (v.hash === k || v.h === k)))) continue;
              if (x.cpf || x.temCpf || x.cpfT || x.cpfSemRespT || x.cpfVar) continue; }
            // 5.80 (caso Helder VQJR7 21:15: clicou "Encerrar agora" no bot e recebeu pedido de CPF): cliente que encerrou sozinho não recebe pedido
            if (/encerrar( agora| o atendimento| atendimento)?\b|n[ãa]o (tenho|quero) interesse|n[ãa]o preciso|s[óo] (estava|tava) olhando|Se no futuro precisar de cr[ée]dito/i.test((x.ultCliTxt || '') + ' ' + (x.motivo || '') + ' ' + ((x.hist || []).slice(-3).join(' '))) || /Se no futuro precisar de cr[ée]dito/i.test(x.ultBotTxt || x.ultTxt || '')) continue;
            { const AOy = (GM_getValue('auto_ordens', {}) || {})[k]; if (AOy && AOy.cpf) continue; }   // 5.80: CPF já conhecido (ordem antiga)
            const idade = Date.now() - x.semCpfT; if (idade > 23 * 3600000) continue;
            if (!(idade <= 45 * 60000 || (hh >= 8 && hh < 21))) continue;
            const nm = nomeCli(x); const val = x.escolha && x.escolha.valor ? brl(x.escolha.valor) : '';
            const saud = hh < 12 ? 'Bom dia' : hh < 18 ? 'Boa tarde' : 'Boa noite';
            const texto = saud + (nm ? ', ' + nm : '') + '! Tudo bem? 😊 Aqui é da Dinseguro.\n\n' + (val ? 'Vi que você fez uma simulação de *R$ ' + val + '* com a gente. ' : x.escolha ? 'Vi que você fez uma simulação com a gente. ' : 'Vi que você começou o seu atendimento com a gente. ') + 'Para eu já ' + (x.escolha ? 'preparar a sua proposta' : 'consultar a melhor condição para você') + ', pode me informar o número do seu CPF ou do seu benefício?';
            const dd = String(new Date().getDate()).padStart(2, '0') + '/' + String(new Date().getMonth() + 1).padStart(2, '0');
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: (x.hash && /^[A-Z0-9]{16,}$/i.test(x.hash)) ? x.hash : k, acao: 'pedir_cpf', quem: 'robo', t: Date.now(), texto, nota: dd + ' ' + hhmm(Date.now()) + ' [robô 4.78] parou no bot sem CPF às ' + hhmm(x.semCpfT) + (val ? ' (simulou R$ ' + val + ')' : '') + ' → pedi o CPF + 01 C.' }));
            PC[k] = Date.now(); for (const q in PC) if (Date.now() - PC[q] > 7 * 864e5) delete PC[q]; GM_setValue('pedir_cpf_feito', PC); return;
          }
        } catch (e) {}
        // 5.50 AUDITORIA DAS TAGS (Stefany 12/11 17:30, caso Douglas: tinha proposta e estava com 01 C) — conversa lida nos últimos 30 min:
        //  01 C e já tem proposta/consulta com margem → 01 A (tira a 01 C) · 01 A e já assinou (esteira) → 01 D (tira a 01 A). Uma vez a cada 2 h.
        try {
          const RGt = GM_getValue('regua', {}) || {}; const AOt = GM_getValue('auto_ordens', {}) || {}; const TA = GM_getValue('tag_audit', {}) || {}; const ag = Date.now();
          for (const k in RGt) { const x = RGt[k]; if (!x || !Array.isArray(x.tags01) || protegido(k) || x.comQuem || ag - (+x.lidoT || 0) > 30 * 60000) continue;
            if (TA[k] && ag - TA[k] < 2 * 3600000) continue;
            const tem = re => x.tags01.some(t => re.test(t)); let nova = '';
            const ao = AOt[k]; const comProposta = (x.link && !x.semLink) || (ao && ['com_margem', 'link', 'link_enviado', 'feito', 'gravada', 'pronto'].includes(ao.estado));
            let fe = null; try { fe = faseEsteira(x); } catch (e) {}
            if (tem(/^01 A/i) && fe && !['não assinou', 'andamento', 'recusada'].includes(fe.fase) && !tem(/^01 D/i)) nova = '01 D - Inss Fechou*';
            else if (tem(/^01 C/i) && comProposta && !tem(/^01 (A|D)/i)) nova = '01 A - Inss Com Margem - SEM 87 E 88';
            else if (tem(/^01 C/i) && tem(/^01 (A|D|I|k)|^0[237]/i)) nova = (x.tags01.find(t => /^01 (A|D|I|k)|^0[237]/i.test(t)) || '');   // sobrou a 01 C junto com outra → reaplica a outra (tira a 01 C)
            if (!nova) continue;
            TA[k] = ag; GM_setValue('tag_audit', TA);
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: k, acao: 'so_tag', quem: 'robo', t: ag, tags: [nova], msgFeita: 1, linhaFeita: 1, nota: String(new Date().getDate()).padStart(2, '0') + '/' + String(new Date().getMonth() + 1).padStart(2, '0') + ' ' + hhmm(ag) + ' [robô 5.50] tags: ' + x.tags01.join(', ') + ' → ' + nova.replace(/\*$/, '') + ' (regra das tags da Stefany).' }));
            return;
          }
        } catch (e) {}
        // 5.37 FASE 1 — CLIENTE ESPERANDO ATENDENTE (Stefany 12/11 15:46–16:34, casos Genivaldo 10:19, Ester 12:35, Teresa, Menezes):
        // bot passou para "atendente humano", ou o cliente clicou "Outras opções / Verificar opções / Falar com atendente" e parou,
        // ou voltou a escrever depois do retorno → em 5 min o robô manda mensagem PESSOAL pedindo o CPF (+ 01 C). Uma vez a cada 12 h.
        // Fica para o VIGIA (não manda): já tem CPF, humano falando, NÃO MEXER, áudio/imagem/pergunta livre.
        // Modo teste (localStorage dins_f1_teste != '0'): só registra em dins_f1_log o que faria.
        try {
          const RGh = GM_getValue('regua', {}) || {}; const RET = GM_getValue('retorno_feito', {}) || {}; const hh5 = new Date().getHours();
          const teste = localStorage.getItem('dins_f1_teste') !== '0'; const agora5 = Date.now();
          const MENU = /^\s*(bolt\s*)?(Outras op[çc][õo]es|Verificar op[çc][õo]es|Falar com (um )?atendente|Verifique a melhor op[çc][ãa]o)|quero (falar|conversar) com (uma?|algu[ée]m|pessoa)|n[ãa]o (com|quero) (o )?rob[ôo]|atendente (humano|de verdade)|recebi (sua|a) liga[çc][ãa]o/i;   // 5.43 (caso Nelson 16:47)
          // 5.39 (Stefany 12/11 16:45, caso Marcone "A onde e o escritório"): medo de golpe / pergunta do escritório → /golpe_medo
          // (tem o link do Google com o endereço) — o vídeo de avaliação (fluxo ⚡) continua com o vigia. Uma vez a cada 12 h.
          const GOLPE = /golpe|escrit[óo]rio|endere[çc]o (de voc|da empresa|da dinseguro)|onde (fica|voc[êe]s ficam|[ée] a empresa)|[ée] seguro|[ée] confi[áa]vel|fraude|enganad|desconfi/i;
          const GF = GM_getValue('golpe_feito', {}) || {};
          for (const k in RGh) { const x = RGh[k]; if (!x || x.estado !== 'alerta' || protegido(k) || x.comQuem || x.vencida || x.ultLado !== 'cli' || !GOLPE.test(x.ultCliTxt || '')) continue;
            if (GF[k] && agora5 - GF[k] < 12 * 3600000) continue; if (agora5 - (+x.ultCliT || 0) < 60000 || agora5 - (+x.ultCliT || 0) > 23 * 3600000) continue;
            if (teste) { let LG = []; try { LG = JSON.parse(localStorage.getItem('dins_f1_log') || '[]'); } catch (e) {} if (!LG.some(l => l.h === k && /golpe/.test(l.motivo))) { LG.push({ t: agora5, h: k, nome: x.nome || '', motivo: 'golpe/escritório: "' + String(x.ultCliTxt || '').slice(0, 40) + '"', link: !!x.link, texto: '/golpe_medo' }); localStorage.setItem('dins_f1_log', JSON.stringify(LG.slice(-40))); } continue; }
            GF[k] = agora5; GM_setValue('golpe_feito', GF);
            const dd6 = String(new Date().getDate()).padStart(2, '0') + '/' + String(new Date().getMonth() + 1).padStart(2, '0');
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: k, acao: 'fase_msg', quem: 'robo', t: agora5, atalhos: ['/golpe_medo'], nota: dd6 + ' ' + hhmm(agora5) + ' [robô 5.39] cliente perguntou "' + String(x.ultCliTxt || '').slice(0, 50) + '" → /golpe_medo (link do Google com o endereço). VIGIA: mandar o fluxo ⚡ Vídeo de avaliação.' }));
            return;
          }
          // 5.79 (Stefany 21:22): cliente perguntou de QUITAÇÃO ANTECIPADA / desconto de juros / pagar menos juros → linha pessoal + PDF "INSS6A - Manual quitação antecipada INSS".
          // Uma vez a cada 20 h por cliente; só 8h–21h.
          const QUIT = /quit(a|ar|o|e|ação|acao)|antecipa(d|r|ç)|adiantad|desconto (de|dos|nos) juros|pagar menos juros|abatimento|amortiza/i;
          const QF = GM_getValue('quitacao_feita', {}) || {}; const hq = new Date().getHours();
          for (const k in RGh) { const x = RGh[k]; if (!x || x.estado !== 'alerta' || protegido(k) || x.comQuem || x.vencida || x.ultLado !== 'cli' || !QUIT.test(x.ultCliTxt || '')) continue;
            if (QF[k] && agora5 - QF[k] < 20 * 3600000) continue; if (agora5 - (+x.ultCliT || 0) < 60000 || agora5 - (+x.ultCliT || 0) > 6 * 3600000) continue; if (!(hq >= 8 && hq < 21)) continue;
            if (teste) continue;
            QF[k] = agora5; GM_setValue('quitacao_feita', QF);
            const nmq = nomeCli(x); const ddq = String(new Date().getDate()).padStart(2, '0') + '/' + String(new Date().getMonth() + 1).padStart(2, '0');
            const linhaQ = 'Tem sim' + (nmq ? ', ' + nmq : '') + '! 😊 Você pode quitar o empréstimo adiantado quando quiser, inteiro ou só algumas parcelas, e os juros das parcelas que você antecipar são descontados — é um direito garantido por lei. Quanto antes quitar, menos juros paga. Te mando abaixo o nosso manual de quitação antecipada, com o passo a passo 👇';
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: k, acao: 'fase_msg', quem: 'robo', t: agora5, linha: linhaQ, atalhos: ['INSS6A - Manual quitação antecipada INSS|midia'], nota: ddq + ' ' + hhmm(agora5) + ' [robô 5.79] cliente perguntou "' + String(x.ultCliTxt || '').slice(0, 50) + '" → linha de quitação antecipada + PDF INSS6A.' }));
            return;
          }
          // 5.60 (Stefany 18:08, caso Douglas): cliente disse "depois / amanhã / mais tarde" → resposta que leva à ação (condição de hoje, sem apertar demais)
          // + pede um HORÁRIO certo; o lembrete sai na hora que ele disser (régua 5.56). Uma vez a cada 20 h.
          const DR = GM_getValue('depois_resp', {}) || {};
          for (const k in RGh) { const x = RGh[k]; if (!x || x.estado !== 'alerta' || protegido(k) || x.comQuem || x.vencida || x.ultLado !== 'cli' || !DEPOIS.test(x.ultCliTxt || '')) continue;
            if (DR[k] && agora5 - DR[k] < 20 * 3600000) continue; if (agora5 - (+x.ultCliT || 0) < 60000 || agora5 - (+x.ultCliT || 0) > 6 * 3600000) continue; if (!(hh5 >= 8 && hh5 < 21)) continue;
            const nm = nomeCli(x); const temHora = /\b\d{1,2}\s*(h|hs|horas)\b|[àa]s\s*\d{1,2}/i.test(x.ultCliTxt || '');
            const comProp = x.link && !x.semLink;
            const texto = 'Combinado' + (nm ? ', ' + nm : '') + '! 😊 Sem problema nenhum.' + (comProp ? '\n\nSó um aviso importante para você não perder: a condição da sua proposta está garantida para hoje. Amanhã o banco pode mudar a taxa e o valor pode ficar menor — aí eu refaço a simulação e, se nada tiver mudado, seguimos com o mesmo valor. Se conseguir, o ideal é finalizar ainda hoje pelo link 🙏' : '') + '\n\n' + (temHora ? 'Fica combinado então, eu te chamo nesse horário. 🤝' : 'Me diz um horário certinho que fica bom para você, que eu te chamo exatamente nesse horário. 🤝');
            DR[k] = agora5; GM_setValue('depois_resp', DR);
            if (teste) continue;
            const dd7 = String(new Date().getDate()).padStart(2, '0') + '/' + String(new Date().getMonth() + 1).padStart(2, '0');
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: k, acao: 'fase_msg', quem: 'robo', t: agora5, texto, nota: dd7 + ' ' + hhmm(agora5) + ' [robô 5.60] cliente disse "' + String(x.ultCliTxt || '').slice(0, 50) + '" → resposta (condição de hoje + horário certo) e lembrete na hora combinada.' }));
            return;
          }
          for (const k in RGh) { const x = RGh[k]; if (!x || x.estado !== 'alerta' || protegido(k) || x.comQuem || k === 'F20QOEL8YYLQN2S6SR47') continue;
            const handoff = /bot passou para atendente humano/.test(x.motivo || '') && x.handoffT;
            const menu = x.ultLado === 'cli' && MENU.test(x.ultCliTxt || '');
            const voltou = /voltou a escrever depois do retorno/.test(x.motivo || '') && MENU.test(x.ultCliTxt || '');
            if (!handoff && !menu && !voltou) continue;
            if (x.temCpf || x.cpfSem || x.cpfSemRespT || x.vencida || x.cpfVar) continue;   // 5.82: cpfVar = CPF do painel
            { const AOx = (GM_getValue('auto_ordens', {}) || {})[k]; if (AOx && (AOx.cpf || agora5 - (+AOx.t || 0) < 23 * 3600000)) continue; }   // 5.76: já temos o CPF dele (ordem antiga) → nunca pedir de novo
            // 5.78 (Stefany 21:13: "analisar o histórico completo… até achar pelo menos o CPF"): antes de pedir CPF, a conversa INTEIRA tem que ter sido lida
            // (sessões anteriores abertas) nas últimas 6 h. Se não foi, marca para a VARREDURA reler o histórico todo e só depois decide.
            { const HXp = GM_getValue('hist_expandido', {}) || {}; if (!(HXp[k] && agora5 - HXp[k] < 6 * 3600000)) { const rr = GM_getValue('regua', {}) || {}; if (rr[k] && !rr[k].reler) { rr[k].reler = 1; rr[k].relerHist = 1; (rr[k].hist = rr[k].hist || []).push(hhmm(agora5) + ' 5.78: antes de pedir CPF → ler o histórico completo'); GM_setValue('regua', rr); } continue; } }
            if (x.link && !x.semLink) continue;   // 5.76 (Stefany 21:08, caso Ester: já tinha proposta digitada e o robô pediu o CPF de novo) → quem tem proposta vai para o VIGIA (vermelho), não recebe pedido de CPF
            const t0 = handoff ? x.handoffT : (x.ultCliT || 0); if (!t0 || agora5 - t0 < 5 * 60000 || agora5 - t0 > 23 * 3600000) continue;
            if (RET[k] && agora5 - RET[k] < 12 * 3600000) continue;
            if (!(hh5 >= 8 && hh5 < 21)) continue;
            const nm = nomeCli(x); const saud = hh5 < 12 ? 'Bom dia' : hh5 < 18 ? 'Boa tarde' : 'Boa noite';
            let texto;
            if (x.link) texto = saud + (nm ? ', ' + nm : '') + '! 😊 Aqui é da Dinseguro, que bom que você voltou a falar com a gente! Me desculpe a demora para te responder.\n\nPara eu atualizar a sua proposta com o valor de hoje, me manda o número do seu CPF (só os números) que eu já te passo a simulação nova. 🔒 A Dinseguro nunca pede senha e não cobra nada adiantado.';
            else if (menu || voltou) texto = saud + (nm ? ', ' + nm : '') + '! Tudo bem? 😊 Aqui é da Dinseguro, me desculpe a demora.\n\nMe conta: você recebe aposentadoria ou pensão do INSS? Se receber, me manda o seu CPF (só os números) que eu consulto agora a melhor condição para você. 🔒 A Dinseguro nunca pede senha e não cobra nada adiantado.';
            else texto = saud + (nm ? ', ' + nm : '') + '! Tudo bem? 😊 Aqui é da Dinseguro, me desculpe a demora para te responder.\n\nPara eu consultar a melhor condição de empréstimo para você, me manda o número do seu CPF (só os números)? 🔒 A Dinseguro nunca pede senha e não cobra nada adiantado.';
            const motivoR = handoff ? 'bot passou para atendente humano às ' + hhmm(x.handoffT) : 'cliente parou em "' + String(x.ultCliTxt || '').replace(/^\s*bolt\s*/i, '').slice(0, 30) + '" às ' + hhmm(x.ultCliT);
            if (teste) { let LG = []; try { LG = JSON.parse(localStorage.getItem('dins_f1_log') || '[]'); } catch (e) {}
              if (!LG.some(l => l.h === k && agora5 - l.t < 30 * 60000)) { LG.push({ t: agora5, h: k, nome: x.nome || '', motivo: motivoR, link: !!x.link, texto: texto.slice(0, 90) }); localStorage.setItem('dins_f1_log', JSON.stringify(LG.slice(-40))); }
              continue; }
            RET[k] = agora5; GM_setValue('retorno_feito', RET);
            const dd5 = String(new Date().getDate()).padStart(2, '0') + '/' + String(new Date().getMonth() + 1).padStart(2, '0');
            const r5 = GM_getValue('regua', {}) || {}; if (r5[k]) { (r5[k].hist = r5[k].hist || []).push(hhmm(agora5) + ' 5.37: ' + motivoR + ' → mensagem pessoal + pedido de CPF'); GM_setValue('regua', r5); }
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: k, acao: 'pedir_cpf', quem: 'robo', t: agora5, texto, nota: dd5 + ' ' + hhmm(agora5) + ' [robô 5.37] ' + motivoR + ' e ninguém respondeu → mensagem pessoal pedindo o CPF + 01 C' + (x.link ? ' (já tinha proposta: atualizar)' : '') + '.' }));
            return;
          }
        } catch (e) { try { localStorage.setItem('dins_conv_erro', new Date().toTimeString().slice(0, 8) + ' f1 ' + String((e && e.stack) || e).slice(0, 300)); } catch (_) {} }
        // 5.96 (Stefany 13/11 10:25: "tá faltando aquele atendimento cordial… o cliente sempre tem muito medo… atendimento que acolhe"):
        // assim que chega o CPF, antes do resultado, uma mensagem pessoal curta: recebi, estou consultando, segurança, já volto.
        { const oA = Object.values(O).find(x => x.tipo === 'cpf' && !x.acolheu && ['nova', 'consultando', 'ficha_ok', 'digitando'].includes(x.estado) && Date.now() - (+x.t || 0) < 15 * 60000 && !x.valorVigia);
          if (oA) { oA.acolheu = Date.now(); GM_setValue('auto_ordens', O);
            const nmA = nomeCli(oA); const hA = new Date().getHours(); const sA = hA < 12 ? 'Bom dia' : hA < 18 ? 'Boa tarde' : 'Boa noite';
            const dA = new Date(), ddA = String(dA.getDate()).padStart(2, '0') + '/' + String(dA.getMonth() + 1).padStart(2, '0');
            const linhaA = sA + (nmA ? ', ' + nmA : '') + '! 😊 Aqui é da Dinseguro.\n\nRecebi o seu CPF e já estou consultando aqui para você. Em poucos minutos eu te mando a melhor condição disponível.\n\n🔒 Sua segurança vem primeiro: a Dinseguro não cobra nada antes, nunca pede a senha do seu banco nem do Meu INSS, e nada é feito sem a sua confirmação.\n\nJá volto com a resposta 🤝';
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: oA.hash, acao: 'fase_msg', quem: 'robo', t: Date.now(), linha: linhaA, atalhos: [], nome: oA.nome || '', fone: oA.fone || '', nota: ddA + ' ' + hhmm(Date.now()) + ' [robô 5.96] CPF recebido → mensagem de acolhimento (consultando).' }));
            return; } }
        const oL = Object.values(O).find(x => x.tipo === 'cpf' && x.estado === 'link');
        if (oL) {   // 4.75: simulação + link pelo robô
          const nm = nomeCli(oL); const d = new Date(), dd = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
          const aceiteBn = oL.aceite && oL.bancoConta;
          const linha = aceiteBn
            ? 'Pronto, ' + nm + '! 😊 A sua proposta de *R$ ' + oL.liberado + '* em ' + oL.prazo + 'x de *R$ ' + oL.parcela + '* já está pronta. Segue abaixo 👇'
            : '*' + nm + ', Novo Crédito Disponível* 🎉\n\n💰 Valor na conta: *R$ ' + oL.liberado + '*\n📆 ' + oL.prazo + 'x de *R$ ' + oL.parcela + '*\n\n🔒 A Dinseguro não cobra nada adiantado, nunca pede a senha do seu banco nem do Meu INSS, e nada é concluído sem a sua confirmação.\n\n1️⃣ Sim, quero contratar\n2️⃣ Não desejo\n\nÉ só responder com o número 🤝';
          const trocas = aceiteBn ? [['{NOME}', nm], ['{VALOR}', 'R$ ' + oL.liberado], ['{BANCO}', oL.bancoConta], ['colar link', oL.link], ['cola link', oL.link]] : [['{NOME}', nm + ','], ['Cola link', oL.link]];
          const nota = dd + ' ' + hhmm(Date.now()) + ' [robô 4.75] ' + (oL.nomeReal || oL.nome || '') + ' · ' + (oL.resumo || '') + ' · ' + (oL.banco || 'C6') + ' Nº ' + (oL.proposta || '') + ' R$ ' + oL.liberado + ' ' + oL.prazo + 'x R$ ' + oL.parcela + ' · ' + (aceiteBn ? 'linha + /bn54n' : 'simulação 1/2 + /parabens') + ' (automático).';
          localStorage.setItem('dins_ordem', JSON.stringify({ hash: oL.hash, acao: 'sim_link', quem: 'robo', t: Date.now(), linha, atalho: aceiteBn ? '/bn54n' : '/parabens', trocas, nota }));
          oL.estado = 'link_enviado'; oL.tEnv = Date.now(); GM_setValue('auto_ordens', O); return;
        }
        const o = Object.values(O).find(x => x.tipo === 'cpf' && x.estado === 'desfecho');
        if (o) {
          const d = new Date(), dd = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
          if (o.acao === 'nao_localizado') {   // 4.72: tag 07 + flow "Inicio do atendimento", sem linha cordial e sem nota (o flow fecha a conversa)
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: o.hash, acao: 'nao_localizado', t: Date.now() }));
          } else if (o.acao === 'especie_fora') {   // 5.15: /07 + 07 - Nao Identificado + fechar (DESFECHOS.especie_fora)
            const nota = dd + ' ' + hhmm(Date.now()) + ' [robô] ' + (o.nomeReal || o.nome || '') + ' · ' + (o.resumo || '') + ' · CPF mandado ' + hhmm(o.cpfT || o.t) + ' → espécie não consignável: /07 + 07 + fechar (automático 5.15).';
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: o.hash, acao: 'especie_fora', t: Date.now(), nota }));
          } else if (o.acao === 'loas_com') {   // 5.00: LOAS com margem ≥ R$ 400 → mensagem padrão (sem linha extra) + 02 A + fechar
            const pn = primeiroNome(o.nomeReal) || '';
            const nota = dd + ' ' + hhmm(Date.now()) + ' [robô] ' + (o.nomeReal || o.nome || '') + ' · ' + (o.resumo || '') + ' · CPF mandado ' + hhmm(o.cpfT || o.t) + ' → LOAS com margem ≥ R$ 400: mensagem padrão + 02 A + fechar (automático 5.00).';
            localStorage.setItem('dins_ordem', JSON.stringify({ hash: o.hash, acao: 'loas_com', t: Date.now(), nota, texto: DESFECHOS.loas_com.texto.replace('{NOME}', pn).replace('Oi, ! ', 'Oi! ') }));
          } else {
          const nota = dd + ' ' + hhmm(Date.now()) + ' [robô] ' + (o.nomeReal || o.nome || '') + ' · ' + (o.resumo || '') + ' · CPF mandado ' + hhmm(o.cpfT || o.t) + ' → linha cordial + /n30 + ' + (o.acao === 'loas_sem' ? '02 I' : '01 I') + ' + fechar (automático 4.24).';
          localStorage.setItem('dins_ordem', JSON.stringify({ hash: o.hash, acao: o.acao, t: Date.now(), nota, linha: LINHA_SEM_MARGEM(primeiroNome(o.nomeReal)), nome: o.nome || '', fone: o.fone || (((GM_getValue('regua', {}) || {})[o.hash]) || {}).fone || '' }));   // 5.74: nome/fone na ordem (caso Vms: painel 'V.m.d.' ≠ lista 'Vms' → o sem margem nunca saiu)
          }
          o.estado = 'desfecho_enviado'; o.tEnv = Date.now(); mud = true;
        }
        if (mud) GM_setValue('auto_ordens', O);
      } catch (e) { try { localStorage.setItem('dins_conv_erro', new Date().toTimeString().slice(0, 8) + ' ' + String((e && e.stack) || e).slice(0, 400)); } catch (_) {} }   // 5.34: erro deste laço fica registrado
    }, 10000);

    // ---------------------------------------------------------------------
    // 3.90 — RÉGUA PÓS-LINK (Stefany, 10/11/2026 14:59: "aprovado o novo robô").
    // Substitui o follow-up antigo (que só agendava quando o PRÓPRIO robô mandava o link e
    // apagava o compromisso quando dava erro). Agora:
    //  1) DETECTA SOZINHO todo link de proposta que sai nosso no chat aberto (à mão, pelo vigia ou pelo robô).
    //  2) Régua fixa: 10 min "/bot2 Conseguiu acessar?" · 60 min "/132" · 08:00 do dia seguinte último toque.
    //  3) Travas antes de cada toque: cliente respondeu → pausa; chat com atendente → bloqueado (vermelho);
    //     tag de recusa ou 01 D → cancela; fora de 8h–21h → 10/60 pulam (fica o da manhã); caixa com texto
    //     ou vigia trabalhando → espera; erro → tenta 3x e fica VERMELHO (nunca some calado).
    //  4) Cada toque sai UMA vez (registro com hora). Quadro "📋 Régua pós-link" no canto direito.
    //  5) Espelho em localStorage.dins_regua para o vigia conferir na rodada.
    const RG = () => GM_getValue('regua', {});
    const ABA_ID = Math.random().toString(36).slice(2, 10);   // 4.19: identifica esta aba na trava dos toques
    // 4.17b — GRAVAÇÃO SEM PERDA (Stefany 19:24 "pode fazer"): duas partes do robô liam o quadro, esperavam e gravavam por cima,
    // e uma apagava o que a outra tinha feito (André voltou como "01 A sem link" depois de reavaliado às 18:57).
    // Agora: (1) quem grava MESCLA com o que está salvo — cliente que só existe no salvo é mantido;
    // (2) cliente apagado de propósito (reavaliar) fica marcado e um retrato velho não o traz de volta.
    const delRG = hash => { const d = GM_getValue('regua_del', {}) || {}; d[hash] = Date.now(); GM_setValue('regua_del', d); const r = GM_getValue('regua', {}) || {}; delete r[hash]; GM_setValue('regua', r); };
    const gravaRG = r => {
      const atual = GM_getValue('regua', {}) || {}; const del = GM_getValue('regua_del', {}) || {};
      const out = {};
      for (const k of new Set([...Object.keys(atual), ...Object.keys(r)])) {
        const x = k in r ? r[k] : atual[k];
        if (del[k] && (+(x && x.criadoT) || 0) < del[k]) continue;   // apagado depois de criado → não volta
        out[k] = x;
      }
      GM_setValue('regua', out); try { localStorage.setItem('dins_regua', JSON.stringify(Object.values(out))); } catch (e) {}
    };
    // 4.18 — fase da esteira do banco (lida pela aba do New Corban em ?p=propostas)
    const faseEsteira = x => {
      if (!x || !x.link) return null;
      const E = GM_getValue('esteira', {}) || {}; const e = E['L:' + x.link]; if (!e) return null;
      const t = (e.real + ' ' + e.statusBanco + ' ' + e.status).toUpperCase();
      let fase = 'andamento', acao = '';
      if (/PAG[OA]\b|INTEGRAD|FINALIZAD|CONCRETIZ/.test(t)) { fase = 'pago'; }
      else if (/CANCEL|REPROV|RECUS|NEGAD/.test(t)) { fase = 'recusada'; acao = 'banco recusou/cancelou → ver com a Stefany'; }
      else if (/ENVIO DOC|AGUARD\w* DOC|PEND\w* (DE )?DOC/.test(t)) { fase = 'falta documento'; acao = 'pedir o documento (linha pessoal + /CLT1)'; }   // 4.79
      else if (/ANUENCIA|ANUÊNCIA/.test(t)) { fase = 'falta anuência'; acao = 'mandar linha pessoal + /anuencia + /anuencia2'; }
      else if (/ASSINATURA DIGITAL OK|AVERBE JA|AGUARDA AVERBA/.test(t)) { fase = 'falta desbloquear'; acao = 'mandar linha pessoal + /dsg25a + /dsg25'; }
      else if (/AGUARD\w* ASSINATURA|AGUARDA FORM|PENDENTE ASSINATURA|FORMALIZA/.test(t)) { fase = 'não assinou'; }
      return { fase, acao, real: e.real || e.statusBanco, banco: e.banco, t: e.t, nome: e.nome || '' };
    };
    window.dinsFaseEsteira = h => faseEsteira(RG()[h]);
    // 4.86: ao carregar, o último desfecho/ordem OK (feito antes da 4.83) e as ordens automáticas terminadas também contam como resolvidas
    setTimeout(() => { try {
      const RS = JSON.parse(localStorage.getItem('dins_resolvidos') || '{}'); let m = 0;
      const st = JSON.parse(localStorage.getItem('dins_ordem_status') || 'null'); if (st && st.st === 'ok' && st.hash && !(RS[st.hash] >= st.t)) { RS[st.hash] = st.t; m++; }
      const O = GM_getValue('auto_ordens', {}) || {}; for (const h in O) { const o = O[h]; if (o && ['desfecho_ok', 'feito'].includes(o.estado) && !RS[h] && Date.now() - (o.t || 0) < 24 * 3600000) { RS[h] = (o.t || 0) + 3 * 60000; m++; } }
      if (m) { localStorage.setItem('dins_resolvidos', JSON.stringify(RS)); const rg = GM_getValue('regua', {}) || {}; let mu = false;
        for (const h in RS) { const q = rg[h]; if (q && ['alerta', 'erro'].includes(q.estado) && (+q.ultCliT || 0) <= RS[h]) { q.estado = 'encerrado'; q.motivo = 'resolvido pelo robô'; delete q.cpfSemRespT; delete q.cpfSem; (q.hist = q.hist || []).push(hhmm(Date.now()) + ' resolvido pelo robô (4.86)'); mu = true; } }
        if (mu) GM_setValue('regua', rg);
        const fl = JSON.parse(localStorage.getItem('dins_fila') || '[]'); localStorage.setItem('dins_fila', JSON.stringify(fl.filter(f => !(RS[f.id] && new Date(f.quando).getTime() <= RS[f.id])))); }
    } catch (e) {} }, 6000);
    // 4.84: entradas do quadro guardadas com chave que não é o hash (caso Rubi em "103") → passam para a chave certa
    setTimeout(() => { try { const r = GM_getValue('regua', {}) || {}; let m = 0; for (const k of Object.keys(r)) { const x = r[k]; if (x && x.hash && x.hash !== k && /^[A-Z0-9]{16,}$/i.test(x.hash) && !/^[A-Z0-9]{16,}$/i.test(k)) { if (!r[x.hash]) r[x.hash] = x; else r[x.hash].reler = 1; delete r[k]; m++; } } if (m) { GM_setValue('regua', r); try { localStorage.setItem('dins_regua', JSON.stringify(Object.values(r))); } catch (e) {} } } catch (e) {} }, 5000);
    window.dinsAutoVer = () => GM_getValue('auto_ordens', {});
    // 4.24 — AVERBE JA automático no Autorizador do C6, SÓ para quem a Stefany/vigia colocar na lista (Stefany 11/11 08:17:
    // "pode ser que o cliente está no AVERBE JA mas ainda não desbloqueou… não é todos").
    // dinsAverbar('NOME COMPLETO COMO NO C6', true|false)  ·  dinsAverbarVer()
    // 4.25 (Stefany 11/11 08:23): o padrão é entrar na lista SÓ quando o cliente disser que fez o desbloqueio, e aí de 60 em 60 s até averbar.
    window.dinsAverbar = (nome, on = true, cadaMs = 60000) => { const A = GM_getValue('averbar', {}) || {}; const k = String(nome || '').trim().toUpperCase(); if (!k) return false;
      if (on) A[k] = Object.assign(A[k] || {}, { ativo: true, cada: cadaMs, desde: Date.now(), ultT: 0, tent: 0, avisado: false }); else if (A[k]) A[k].ativo = false;
      GM_setValue('averbar', A); return A[k]; };
    window.dinsAverbarVer = () => GM_getValue('averbar', {});
    window.dinsAverbarAvisado = nome => { const A = GM_getValue('averbar', {}) || {}; const k = String(nome || '').trim().toUpperCase(); if (A[k]) { A[k].avisado = true; GM_setValue('averbar', A); } return !!A[k]; };
    window.dinsAutoFeito = (h, nota) => { const O = GM_getValue('auto_ordens', {}) || {}; if (!O[h]) return false; O[h].estado = 'feito'; O[h].nota = nota || ''; GM_setValue('auto_ordens', O); return true; };
    window.dinsAutoTeste = (cpf, valor, nome) => { const O = GM_getValue('auto_ordens', {}) || {}; const h = 'TESTE_' + String(cpf).replace(/\D/g, ''); O[h] = { hash: h, nome: (nome || 'TESTE') + ' (teste)', cpf: String(cpf).replace(/\D/g, ''), valor: +valor, aceite: false, estado: 'nova', t: Date.now(), teste: true, hist: [hhmm(Date.now()) + ' ordem de TESTE'] }; GM_setValue('auto_ordens', O); return h; };
    // 4.74 (Stefany 11/11 17:39, caso Maristelcio: "quero que o robô faça ele"): o vigia entrega ao robô um cliente que mandou CPF
    // (ex.: já respondemos "estou analisando" e a ordem automática não nasceu). Mesma ordem tipo 'cpf' do 4.24/4.73: consulta normal
    // (sem flash) → com margem digita no máximo e para em "Pronto". Uso: dinsAutoCpf('HASH', 'CPF', 'Nome').
    window.dinsAutoCpf = (h, cpf, nome, valorBot, aceite, extra) => { const c = String(cpf || '').replace(/\D/g, ''); if (!h || c.length < 10) return false; const O = GM_getValue('auto_ordens', {}) || {}; const agora = Date.now();
      O[h] = { hash: h, nome: nome || '', cpf: c, tipo: 'cpf', cpfT: agora, valorBot: +valorBot || (((GM_getValue('valor_nota', {}) || {})[h] || {}).v) || 0, aceite: !!aceite, estado: 'nova', t: agora, hist: [hhmm(agora) + ' ordem criada pelo vigia (dinsAutoCpf)'] }; if (extra && typeof extra === 'object') Object.assign(O[h], extra); GM_setValue('auto_ordens', O); return true; };   // 5.70: extra = { valorVigia, fone, … }
    window.dinsNaoMexer = (h, on = true) => { const N = GM_getValue('nao_mexer', {}) || {}; if (on) N[h] = Date.now(); else delete N[h]; GM_setValue('nao_mexer', N); return Object.keys(N); };   // 4.79: o robô não manda nada automático nesse chat
    window.dinsPedirCpfPular = h => { const PC = GM_getValue('pedir_cpf_feito', {}) || {}; PC[h] = Date.now(); GM_setValue('pedir_cpf_feito', PC); return true; };   // 4.78: não pedir CPF automático para esse chat
    window.dinsAutoApagar = h => { const O = GM_getValue('auto_ordens', {}) || {}; delete O[h]; GM_setValue('auto_ordens', O); return true; };
    // vigia mandou o desbloqueio/anuência → marca a fase como feita (sai do vermelho até a esteira mudar): dinsFaseFeita('HASH')
    window.dinsFaseFeita = h => { const r = RG(), x = r[h]; const fe = faseEsteira(x); if (!x || !fe) return false; x.faseFeita = fe.fase; x.hist.push(hhmm(Date.now()) + ' feito: ' + fe.fase); gravaRG(r); desenharRegua(); return true; }; window.dinsEsteiraVer = () => GM_getValue('esteira', {});
    // compatibilidade: quem ainda chama FUPS/gravaFups
    const FUPS = () => [];
    const gravaFups = () => {};
    const H = 3600000, M = 60000;
    const hhmm = t => t ? new Date(t).toLocaleTimeString('pt-BR').slice(0, 5) : '';
    const dentroDoHorario = t => { const h = new Date(t).getHours(); return h >= 8 && h < 21; };
    const manhaSeguinte = t => { const d = new Date(t); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.getTime(); };
    const TOQUES = [
      { tipo: '10', rotulo: '10 min — Conseguiu acessar?', dt: t => t + 10 * M },
      { tipo: '60', rotulo: '60 min — /132', dt: t => t + 60 * M },
      { tipo: 'manha', rotulo: 'último toque 08:00', dt: t => manhaSeguinte(t) },
    ];
    // 4.31 (Stefany 11/11 09:02, foto: "Bom dia, Alexsandrapereira292!" — "Ele chamou o cliente pelo nome de usuário. Isso aí
    // tá muito errado, não pode repetir."). Nome SÓ se for nome de verdade: primeiro o nome real das notas ([IA]/[robô] Nome…,
    // que vem da consulta) e, sem nota, o nome do contato apenas se parecer nome de pessoa (sem número, @, emoji, "Até R$"…,
    // palavra com inicial maiúscula de 3 a 12 letras). Na dúvida, cumprimenta SEM nome.
    const NAO_NOME = /^(dinseguro|seu|sua|oi|ola|olá|bom|boa|ate|até|consulte|novo|cliente|empresa|cred|credito|crédito|whats|usuario|usuário|sr|sra|dona|seguro)$/i;
    function nomeSeguro(nomeContato, semNotas) {
      if (!semNotas) try {
        const ent = (document.querySelector('.entries') || {}).innerText || '';
        const notas = [...ent.matchAll(/\[(?:IA|robô)\]\s+([A-ZÁ-Ú][a-zá-úç]{2,14})(?:\s+[A-ZÁ-Úa-zá-ú])/g)].map(m => m[1]).filter(n => !NAO_NOME.test(n));
        if (notas.length) return notas[notas.length - 1];
      } catch (e) {}
      const n = String(nomeContato || '').trim();
      if (!n || /[\d@_#$%&*+=|<>\/\\]|R\$|https?:/i.test(n) || /[^\p{L}\s'.-]/u.test(n)) return '';
      const p = n.split(/\s+/)[0];
      if (!/^[A-ZÁ-Ú][a-zá-úç]{2,11}$/.test(p) || NAO_NOME.test(p)) return '';
      if (/^(.{2})\1$/i.test(p) || /(.)\1\1/i.test(p)) return '';   // apelido tipo Zaza, Lulu
      return p;
    }
    const MSG_MANHA = nome => `Bom dia${nome ? ', ' + nome : ''}! ☀️ Tudo bem? Aqui é da Dinseguro.\n\n` +
      'Passando só para lembrar que a sua proposta continua disponível no link que te mandei ontem. ' +
      'Quando tiver um tempinho, é só abrir e fazer a selfie de segurança.\n\n' +
      'Se tiver qualquer dificuldade, me chama aqui que eu te ajudo 🤝';

    function nomeDoContato() {
      const T = document.body.innerText; const i = T.indexOf('Informações de contato');
      const m = i >= 0 ? T.slice(i, i + 300).match(/Nome\s*\n\s*([^\n]{2,40})/) : null;
      return m ? m[1].trim() : '';
    }
    function foneDoContato() { return (document.body.innerText.match(/(?:Home|Lar)\s*\n\s*(\d{10,13})/) || [])[1] || ''; }

    // quem acabou de mandar uma mensagem com link (o próprio robô) registra na hora; o detector cobre o resto
    function agendarSeTiverLink() {
      const hash = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1];
      if (!hash) return;
      window.dinsLinkEnviado(hash, foneDoContato(), Date.now(), '', nomeDoContato());
    }
    window.dinsLinkEnviado = function (hash, fone, linkT, link, nome) {
      const r = RG(); const t = linkT || Date.now();
      const ant = r[hash];
      r[hash] = { hash, criadoT: Date.now(), fone: fone || (ant && ant.fone) || '', nome: nome || (ant && ant.nome) || '', link: link || '', linkT: t,
        estado: 'ativa', motivo: '', toques: TOQUES.map(x => ({ tipo: x.tipo, quando: x.tipo === '60' ? t + 70 * M : x.dt(t), feito: 0, st: '' })),
        tent: 0, hist: [hhmm(Date.now()) + ' régua criada (link ' + hhmm(t) + ')'] };
      gravaRG(r); desenharRegua();
      log && log('Régua pós-link criada: 10 min, 60 min e 08:00 de amanhã.', 'ok');
      return 'agendado';
    };
    // ajustes manuais (vigia/Stefany): nome real, pausar, retomar, cancelar
    window.dinsReguaNome = (hash, nome) => { const r = RG(); if (r[hash]) { r[hash].nome = nome; gravaRG(r); desenharRegua(); } return !!r[hash]; };
    // 5.21: desfaz o cancelamento errado (régua cancelada por 'desfecho sim_link/fase_msg/pedir_cpf' nas últimas 48 h) → volta a acompanhar e relê
    try { const r0 = RG(); let m0 = false; for (const k in r0) { const x = r0[k]; if (x && x.estado === 'cancelada' && /^desfecho (sim_link|fase_msg|pedir_cpf|anuncio_sem_bot|so_tag)$/.test(x.motivo || '') && Date.now() - (+x.linkT || +x.criadoT || 0) < 48 * 3600000) {
      x.estado = x.link ? 'ativa' : 'acompanhando'; x.motivo = 'reaberta (5.21): o link não encerra a régua'; x.reler = 1; (x.hist = x.hist || []).push(hhmm(Date.now()) + ' reaberta 5.21'); m0 = true; } } if (m0) gravaRG(r0); } catch (e) {}
    // 5.23: na régua reaberta pelo 5.21, link de mais de 3 h → "Conseguiu acessar?" e /132 não fazem mais sentido (fica o da manhã/retorno); NÃO MEXER → humano
    try { const r1 = RG(); const NM1 = GM_getValue('nao_mexer', {}) || {}; let m1 = false; for (const k in r1) { const x = r1[k]; if (!x || !/reaberta \(5\.21\)/.test(x.motivo || '')) continue;
      if (NM1[k]) { x.estado = 'humano'; x.motivo = 'NÃO MEXER (Stefany) — robô não manda nada'; m1 = true; continue; }
      if ((+x.ultCliT || 0) > (+x.linkT || 0)) { x.estado = 'pausada'; x.motivo = 'cliente respondeu depois do link — atendimento humano (5.23)'; m1 = true; continue; }   // já conversou depois do link: sem toque automático
      if (Date.now() - (+x.linkT || 0) > 3 * 3600000) (x.toques || []).forEach(q => { if ((q.tipo === '10' || q.tipo === '60') && !q.feito) { q.feito = Date.now(); q.st = 'pulado (régua reaberta 5.21 — link antigo)'; m1 = true; } });
      x.motivo = 'reaberta (5.21/5.23): o link não encerra a régua'; m1 = true; } if (m1) gravaRG(r1); } catch (e) {}
    window.dinsReguaCancelar = (hash, motivo) => { const r = RG(); if (r[hash] && r[hash].estado !== 'cancelada') { r[hash].estado = 'cancelada'; r[hash].motivo = motivo || 'manual'; r[hash].hist.push(hhmm(Date.now()) + ' cancelada: ' + (motivo || 'manual')); gravaRG(r); desenharRegua(); } return !!r[hash]; };
    // 4.59 (Stefany 13:22, caso Jairo): retomar a régua depois de reenviar o link disparava na hora o toque de 10 min que estava
    // vencido desde a manhã ("Conseguiu acessar?" 1 min depois do link). Agora retomar RECOMEÇA a contagem a partir de agora.
    window.dinsReguaRetomar = hash => { const r = RG(), x = r[hash]; if (!x) return false; const t = Date.now();
      x.estado = 'ativa'; x.motivo = ''; x.tent = 0; x.linkT = t;
      x.toques = TOQUES.map(q => ({ tipo: q.tipo, quando: q.tipo === '60' ? t + 70 * M : q.dt(t), feito: 0, st: '' }));
      x.hist.push(hhmm(t) + ' retomada: contagem recomeça agora'); gravaRG(r); desenharRegua(); return true; };
    window.dinsRegua = () => Object.values(RG());
    // 3.94 — RESUMO por cliente (Stefany 10/11 15:12: "bem resumidinho… para eu saber qual foi a sua interpretação")
    // dinsReguaResumo('HASH', 'texto curto') — aparece no quadro embaixo do nome.
    window.dinsReguaResumo = (hash, texto) => { const r = RG(), x = r[hash]; if (!x) return false; x.resumo = String(texto || '').slice(0, 220); x.hist.push(hhmm(Date.now()) + ' resumo: ' + x.resumo); gravaRG(r); desenharRegua(); return true; };
    // cliente com atendente humano: fica no quadro, o robô não manda nada. dinsReguaHumano('HASH', 'Stefany', 'resumo')
    window.dinsReguaHumano = (hash, quem, texto) => { const r = RG(); let x = r[hash]; if (!x) { window.dinsLinkEnviado(hash, '', Date.now(), '', ''); return window.dinsReguaHumano(hash, quem, texto); } x.estado = 'humano'; x.motivo = 'com ' + quem + ' — robô não manda nada'; if (texto) x.resumo = String(texto).slice(0, 220); x.hist.push(hhmm(Date.now()) + ' humano: ' + quem); gravaRG(r); desenharRegua(); return true; };
    // 3.95 — TODA conversa da janela de 24h entra no quadro (Stefany 10/11 15:14: "não vai entrar só em quem tem link…
    // ele tem que estar lá e tem que estar mensurado… a gente fez as tentativas que cabia para ele").
    // Sem link: entra como 'acompanhando' com a situação lida da conversa (tags, quem falou por último, atendente).
    // 5.50: guarda também as tags de situação (01 A/C/D/I/J/k, 02, 03, 07) para a auditoria de tags
    function classificar() { const c = classificar0(); try { c.tags01 = [...document.querySelectorAll('.MuiChip-label')].map(e => (e.textContent || '').trim()).filter(t => /^0\d/.test(t)); } catch (e) {} return c; }
    function classificar0() {
      const T = document.body.innerText;
      const tags = [...document.querySelectorAll('.MuiChip-label')].map(c => c.textContent.trim());
      const tem = re => tags.some(t => re.test(t));
      const hum = /Chat em atendimento com ([^\n]+)/.exec(T);
      const hAtual = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1] || '';
      if (hum && protegido(hAtual)) return { estado: 'humano', motivo: 'com ' + hum[1].trim() + ' — caso que a Stefany pediu para não interferir' };
      if (tem(/^01 D/i)) return { estado: 'acompanhando', motivo: 'fechou negócio (01 D) — acompanhar o banco' };
      // 5.37 (Stefany 12/11, caso Menezes: 07 às 15:26, clicou "Verificar opções" 15:27 e ninguém viu): tag de retorno dado NÃO encerra
      // se o cliente escreveu DEPOIS e o bot não respondeu → vermelho para o vigia.
      { let L0 = null; try { L0 = lados(); } catch (e) {}
        const voltou = L0 && L0.ult && L0.ult.lado === 'cli' && !/^\s*(ok+|obrigad|obg|brigad|am[ée]m|deus aben|👍|🙏|❤️)/i.test(L0.ult.txt || '') && !(+L0.ult.t && Date.now() - L0.ult.t > 24 * 3600000);   // 5.83 (caso Lu Tasca: "Olá" de 16/12/2025 virou vermelho): só vale mensagem das últimas 24 h
        const tagFim = tem(/^01 (I|k)/i) ? '01 I' : tem(/^02 /i) ? '02' : tem(/^03 /i) ? '03' : tem(/^07 /i) ? '07' : '';
        if (tagFim && voltou) return { estado: 'alerta', motivo: 'cliente voltou a escrever depois do retorno (' + tagFim + '): "' + String(L0.ult.txt || '').slice(0, 40) + '"', voltouAposRetorno: 1,
          ultCliT: (L0.ultCli && L0.ultCli.t) || 0, ultCliTxt: ((L0.ultCli && L0.ultCli.txt) || '').slice(0, 120), ultT: L0.ult.t || 0, ultLado: 'cli', temCpf: L0.temCpf, comQuem: L0.comQuem, cpfSemRespT: L0.cpfSemRespT || 0, cpfSem: L0.cpfSem || '' }; }
      if (tem(/^01 (I|k)/i)) return { estado: 'encerrado', motivo: 'sem margem — retorno dado' };
      if (tem(/^02 /i)) return { estado: 'encerrado', motivo: 'LOAS — retorno dado' };
      if (tem(/^03 /i)) return { estado: 'encerrado', motivo: 'representante legal — retorno dado' };
      if (tem(/^07 /i)) return { estado: 'encerrado', motivo: 'não identificado / espécie fora — retorno dado' };
      // 4.97: última sessão só com o "Anúncio ou link de referência" (cliente veio do anúncio) e NENHUMA mensagem depois → bot não respondeu
      try { const E = (document.querySelector('.entries') || {}).innerText || ''; const k = E.lastIndexOf('Sessão '); const ult = k >= 0 ? E.slice(k) : E;
        if (/An[úu]ncio ou link de refer[êe]ncia/i.test(ult) && !/Enviado (pelo|por)/i.test(ult) && !/\b\d{2}:\d{2}\s*(AM|PM)\b/.test(ult.replace(/Sess[ãa]o[^\n]*\n[^\n]*\n?/, '')))
          return { estado: 'alerta', motivo: 'veio do anúncio e o bot não respondeu → flow Inicio do atendimento (robô)', anuncioSemBot: 1 };
      } catch (e) {}
      let L = null; try { L = lados(); } catch (e) {}
      const ex = L ? { vencida: (() => { try { return janelaVencidaAgora(); } catch (e) { return false; } })(), ultCliT: (L.ultCli && L.ultCli.t) || 0, ultCliTxt: ((L.ultCli && L.ultCli.txt) || '').slice(0, 120), ultT: L.ult.t || 0, ultLado: L.ult.lado, botParado: L.ult.lado === 'nos' && L.ult.bot, contornoT: L.contornoT, temCpf: L.temCpf, comQuem: L.comQuem, handoffT: L.handoffT || 0, contornoInfo: L.contornoInfo || null, cpfSemRespT: L.cpfSemRespT || 0, cpfSem: L.cpfSem || '', escolha: L.escolha || null, semCpfT: L.semCpfT || 0 } : {};
      const OK_SO = /^(ok+|okay|obrigad[oa]s?|obg|obgd[ao]?|brigad[oa]|muito obrigad[oa]|blz|beleza|t[áa] bom|certo|entendi|valeu|am[ée]m|deus aben[çc]oe|👍|🙏|❤️|😊)([\s.!,👍🙏😊❤️]+(ok+|obrigad[oa]|obg|obgd[ao]?|brigad[oa]))*[\s.!,👍🙏😊❤️]*$/i;
      // 4.15 (Stefany 18:49, caso Freitas): "Ok obg" depois de "já estou consultando… em instantes te passo" = ele ESPERA o valor → vermelho
      const PROMESSA = /consultando|em instantes|j[áa] te (passo|retorno|mando)|aguarde|verificando|vou verificar|analisando|um momento|j[áa] volto/i;
      if (L && L.ult.lado === 'cli' && OK_SO.test(L.ult.txt) && !(L.nossaAntes && PROMESSA.test(L.nossaAntes))) {
        const ant = L.ult; // só agradeceu/confirmou depois da nossa mensagem (regra 19) → não é espera
        return Object.assign({ estado: 'acompanhando', motivo: 'cliente só disse "' + ant.txt.slice(0, 20) + '" — não precisa responder' }, ex);
      }
      if (L && L.cpfSemRespT)
        return Object.assign({ estado: 'alerta', motivo: 'mandou CPF às ' + hhmm(L.cpfSemRespT) + ' e ninguém respondeu → consultar e atender (não esperar extrato)' }, ex);
      if (L && L.semCpfT && (L.escolha || (L.ult && L.ult.lado === 'nos')) && Date.now() - L.semCpfT >= 10 * 60000 && Date.now() - L.semCpfT < 23 * 3600000 && !ex.vencida && !tem(/^01 C/i) && !tem(/^01 A/i))
        return Object.assign({ estado: 'alerta', motivo: (L.escolha && L.escolha.valor ? 'simulou R$ ' + brl(L.escolha.valor) + ' no bot e parou sem CPF' : 'entrou no bot e parou sem CPF') + ' às ' + hhmm(L.semCpfT) + ' (ninguém atendeu) → pedir o CPF (7.2) + 01 C' }, ex);
      if (L && L.handoffT && L.ult.lado === 'nos')
        return Object.assign({ estado: 'alerta', motivo: 'bot passou para atendente humano às ' + hhmm(L.handoffT) + ' e ninguém respondeu' }, ex);
      if (clienteRespondeu()) {
        const u = L && L.ult.lado === 'cli' ? L.ult : null;
        return Object.assign({ estado: 'alerta', motivo: u ? 'cliente escreveu "' + u.txt.slice(0, 50) + '"' + (u.t ? ' às ' + hhmm(u.t) : '') : 'cliente esperando resposta' }, ex);
      }
      // 4.16c (casos Milton/André): 01 A antigo, cliente recusou ou não respondeu e a nossa mensagem é a última (sem promessa) → azul, não vermelho
      if (tem(/^01 A/i) && L && L.ult.lado === 'nos' && !PROMESSA.test(L.ult.raw)) return Object.assign({ estado: 'acompanhando', motivo: '01 A sem link — nossa mensagem é a última, aguardando o cliente' }, ex);
      if (tem(/^01 A/i)) return Object.assign({ estado: 'alerta', motivo: 'com margem (01 A) e sem link de proposta enviado' }, ex);
      if (tem(/^01 C/i)) return Object.assign({ estado: 'acompanhando', motivo: 'pedimos o CPF — cliente não mandou' }, ex);
      const fim = (document.querySelector('.entries') || {}).innerText || '';
      // 5.53 (Stefany 17:51, caso Alma Ferida): o bot encerrou a sessão por falta de interação e ninguém falou depois → sai do "aguardando" (⚪);
      // se tiver follow-up agendado, continua no 🟢 até a janela fechar; depois das 24 h é da varredura.
      if (L && L.ult && L.ult.lado === 'nos' && /encerrado por falta de intera[çc][ãa]o/i.test(L.ult.raw || L.ult.txt || '')) return Object.assign({ estado: 'encerrado', motivo: 'sessão encerrada pelo bot por falta de interação' }, ex);
      if (ex.botParado || (!L && /Enviado pelo credsegurobank[\s\S]{0,1500}$/.test(fim.slice(-1600)))) return Object.assign({ estado: 'acompanhando', motivo: 'no bot (autoatendimento)' }, ex);
      return Object.assign({ estado: 'acompanhando', motivo: 'última mensagem é nossa — aguardando o cliente' }, ex);
    }
    // 4.02 — TELA PRONTA (erro 10/11 15:42: o link do Gerson foi gravado no chat seguinte, que o robô abriu logo depois,
    // porque a tela ainda mostrava a conversa anterior). Só lê a conversa quando o endereço está parado há 6 s
    // e o texto da tela NÃO é o mesmo que foi lido em outro chat.
    let telaH = '', telaDesde = 0; const sigPorHash = {};
    const sigDaTela = () => { const e = document.querySelector('.entries'); return e ? e.innerText.slice(-400) : ''; };
    setInterval(() => { const h = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1] || ''; if (h !== telaH) { telaH = h; telaDesde = Date.now(); } }, 500);
    function telaPronta(hash) {
      if (!hash || hash !== telaH || Date.now() - telaDesde < 6000) return false;
      const sg = sigDaTela(); if (!sg) return false;
      for (const k in sigPorHash) if (k !== hash && sigPorHash[k] === sg) return false;
      sigPorHash[hash] = sg; return true;
    }
    function registrarSemLink(hash) {
      if (!telaPronta(hash)) return false;
      const r = RG(); if (r[hash] && r[hash].estado !== 'fechada') return false;
      const c = classificar();
      r[hash] = { hash, criadoT: Date.now(), fone: foneDoContato(), nome: nomeDoContato(), link: '', linkT: Date.now(), semLink: true,
        estado: c.estado, motivo: c.motivo, toques: [], tent: 0, lidoT: Date.now(), hist: [hhmm(Date.now()) + ' mapeado: ' + c.motivo] };
      ['vencida','ultCliT','ultT','ultLado','botParado','contornoT','temCpf','comQuem','handoffT','contornoInfo','cpfSemRespT','cpfSem','escolha','semCpfT','ultCliTxt','tags01'].forEach(k => { if (k in c) r[hash][k] = c[k]; });
      gravaRG(r); return true;
    }
    function reclassificar(hash) {        // conversa aberta de novo: atualiza a situação de quem não tem régua de link
      if (!telaPronta(hash)) return;
      const r = RG(), x = r[hash]; if (!x || !(x.semLink || x.estado === 'alerta')) return;   // 5.14 (caso Odila 80WW: alerta de 07:55 ficou preso depois da nossa resposta 09:11) — alerta também é relido
      const c = classificar(); let mud = false; x.lidoT = Date.now(); ['vencida','ultCliT','ultT','ultLado','botParado','contornoT','temCpf','comQuem','handoffT','contornoInfo','cpfSemRespT','cpfSem','escolha','semCpfT','ultCliTxt','tags01'].forEach(k => { if (k in c && JSON.stringify(x[k]) !== JSON.stringify(c[k])) { x[k] = c[k]; mud = true; } });
      const est = (!x.semLink && c.estado !== 'alerta' && x.link) ? 'ativa' : c.estado;   // conversa com link: alerta resolvido volta para a régua do link
      if (est !== x.estado || c.motivo !== x.motivo) { x.estado = est; x.motivo = c.motivo; x.hist.push(hhmm(Date.now()) + ' ' + c.motivo); mud = true; }
      gravaRG(r); if (mud) desenharRegua();
    }
    // 4.10 — o mapeamento NÃO pode brigar com o vigia (10/11 17:52: trocava de chat enquanto o vigia atendia).
    // O vigia marca  dins_vigia_ocupado  e o mapeamento usa a própria marca  dins_mapeando  (não apaga a do vigia).
    // 4.23 — mesmo critério do bloco vermelho do quadro (sem a esteira), para a conferência dos vermelhos
    const pareceVermelho = (x, ag) => {
      if (['fechada', 'cancelada', 'encerrado', 'humano', 'concluída'].includes(x.estado)) return false;
      if (['erro', 'bloqueada', 'alerta'].includes(x.estado)) return true;
      if (x.semLink && x.contornoT && x.ultLado !== 'cli' && ag - x.contornoT > 15 * M) return true;
      if (x.semLink && x.botParado && !x.temCpf && x.estado === 'acompanhando' && !/n[ãa]o sou|aut[ôo]nomo|\bclt\b|carteira assinada|servidor|for[çc]as armadas|bolsa fam/i.test(x.ultCliTxt || '') && x.ultT && ag - x.ultT > 30 * M) return true;
      return false;
    };
    const vigiaTrabalhando = () => Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 2 * M;
    // 4.54 (Stefany 12:55 "1 sim"): trava do vigia. Enquanto o vigia está atendendo um chat, NENHUM loop automático troca de conversa
    // (toques, pós, fases, espera, vencidas, mapa, varredura, desfecho vindo da varredura/robô). O vigia liga com dinsVigiaTrava(min)
    // e solta com dinsVigiaTrava(0) logo depois de mandar. Padrão 3 min, máximo 5 min (Stefany 13:01: "não quero atrasar os demais serviços" — se esquecer, solta sozinha).
    window.dinsVigiaTrava = (min = 3) => { const m = Math.max(0, Math.min(5, +min || 0)); localStorage.setItem('dins_vigia_trava', m ? Date.now() + m * M : 0); return m ? 'travado até ' + hhmm(Date.now() + m * M) : 'solto'; };
    // 4.44 (Stefany 11:09–11:10, caso Valdecir: "não é porque a última mensagem foi minha/do Rômulo que fica parado…
    // tem a questão dos contextos… só alguns casos específicos que eu pedi você não interfere"). Conversa com atendente
    // humano NÃO é mais "robô não faz nada": segue a análise normal. Só fica com o humano quem está nesta lista.
    const NAO_INTERFERIR_PADRAO = ['F20QOEL8YYLQN2S6SR47', 'F0SEMWLO8C8FYE037LM0'];   // chat de teste "Romulo" · Waldirene (Rômulo/Stefany)
    // 5.37 (Stefany 12/11, caso Carmen 16:05: o robô abriu consulta de CPF 3x para quem está no NÃO MEXER) → a lista vale também pelo NOME
    const NAO_MEXER_NOMES = [/^jo[aã]o carlos\b/i, /^carmen\b/i, /^lu andrade\b/i, /^waldirene\b/i, /^nila\b/i, /^⚫/, /^romulo\b/i, /^jair\b/i];   // 5.48: ⚫️/Romulo/Jair (lista NAO_MEXER da varredura)
    const nomeProtegido = n => { const t = String(n || '').normalize('NFC').trim(); return !!t && NAO_MEXER_NOMES.some(re => re.test(t)); };
    const protegido = h => { try { if (NAO_INTERFERIR_PADRAO.includes(h) || (GM_getValue('nao_interferir', []) || []).includes(h) || (GM_getValue('nao_mexer', {}) || {})[h]) return true;
      const x = (GM_getValue('regua', {}) || {})[h] || {}; if (nomeProtegido(x.nome) || nomeProtegido(x.nomeReal)) return true;
      const it = (JSON.parse(localStorage.getItem('dins_fila') || '[]') || []).find(f => f && (f.id === h || f.hash === h)); return !!(it && nomeProtegido(it.nome)); } catch (e) { return false; } };
    window.dinsProtegido = h => protegido(h);
    window.dinsNaoInterferir = (h, on = true) => { const L = GM_getValue('nao_interferir', []) || []; const i = L.indexOf(h); if (on && i < 0) L.push(h); if (!on && i >= 0) L.splice(i, 1); GM_setValue('nao_interferir', L); return L; };
    setTimeout(() => { try { const r = RG(); let n = 0; Object.values(r).forEach(x => { if (x.estado === 'humano' && !protegido(x.hash)) { x.estado = x.link ? 'ativa' : 'acompanhando'; x.reler = 1; x.hist.push(hhmm(Date.now()) + ' 4.44: saiu de "robô não manda nada" — análise normal'); n++; } }); if (n) { gravaRG(r); try { desenharRegua(); } catch (e) {} } } catch (e) {} }, 8000);
    // 4.40 (Stefany 10:37: "Dalva e demais clientes seguem aguardando o robô"): os laços que trocam de conversa (toques,
    // pós-pagamento, fechador da varredura, mapeamento) brigavam pela mesma tela — um abria o chat e o outro trocava no meio,
    // e o toque dava "não abriu o chat" de novo e de novo. Agora só um troca de conversa por vez (trava comum, 3 min no máximo).
    try { localStorage.removeItem('dins_nav'); } catch (e) {}   // 5.63: trava de navegação da página anterior (recarga) não vale mais — segurava a releitura 3 min
    const navPega = quem => { try { const n = JSON.parse(localStorage.getItem('dins_nav') || 'null'); if (n && n.quem !== quem && Date.now() - n.t < 3 * M && !(n.quem === 'mapa' && quem !== 'mapa')) return false;   /* 4.41: mapear é o menos importante — toque, pós e fechador passam na frente */ localStorage.setItem('dins_nav', JSON.stringify({ quem, t: Date.now() })); return true; } catch (e) { return true; } };
    const navSolta = quem => { try { const n = JSON.parse(localStorage.getItem('dins_nav') || 'null'); if (n && n.quem === quem) localStorage.removeItem('dins_nav'); } catch (e) {} };
    async function mapearUm(id) { if (!navPega('mapa')) return false; try { return await mapearUm0(id); } finally { navSolta('mapa'); } }
    window.__dinsMapear0 = id => mapearUm0(id);   // 4.90: a varredura chama para quem chegou na fila no meio dela
    async function mapearUm0(id) {
      if (vigiaTrava()) return false;   // 4.54
      if (vigiaTrabalhando()) return false;
      // 6.06 (Stefany 13/11 12:42 "quero ver esse atendimento mais rápido"): o BOT está conversando com o cliente agora (última mensagem do bot há menos de 6 min)
      // → não abre a tela; o bot está cuidando. Volta a olhar em 2 min (ou antes, se o cliente escrever e a lista mudar de novo).
      try { const x0 = RG()[id]; if (!(x0 && x0.relerHist)) { const j = await apiLer(id, 4); if (j) { API_PLACAR.lidas++; const nm = j.newMessages || []; const u = nm[nm.length - 1]; const ut = u ? Date.parse(u.CREATION_TIME || '') : 0;
        const uc = [...nm].reverse().find(m => m.FROM !== 'me'); const ucTxt = uc ? String(typeof uc.MESSAGE === 'string' ? uc.MESSAGE : JSON.stringify(uc.MESSAGE || '')) : '';
        const soBotao = !uc || /^\s*\{"button"/.test(ucTxt);   // cliente só clicou em botão do bot (nada escrito, nenhum CPF)
        const passouHumano = u && /atendente humano|Estou analisando suas informa|Estamos analisando|Assim que concluir|logo voc[êe] ser[áa] atendid/i.test(String(u.MESSAGE || ''));
        if (u && u.FROM === 'me' && u.FROM_NAME === 'Bot' && ut && Date.now() - ut < 6 * 60000 && soBotao && !passouHumano) { API_ADIA[id] = Date.now() + 2 * 60000; API_PLACAR.bot = (API_PLACAR.bot || 0) + 1; return false; } } else API_PLACAR.falhas++; } } catch (e) {}
      // 6.01: conversa lida há menos de 10 min e SEM mensagem nova no servidor → não abre a tela (não puxa as outras abas)
      try { const x0 = RG()[id]; if (x0 && !x0.reler && !x0.relerHist && +x0.lidoT > 0 && Date.now() - x0.lidoT < 10 * 60000) { const j = await apiLer(id, 1);
        const lm = j && Date.parse(j.customer.LAST_MESSAGE_CREATION_TIME || ''); if (j) API_PLACAR.lidas++; else API_PLACAR.falhas++;
        if (lm && lm < +x0.lidoT) { const r = RG(); if (r[id]) { r[id].lidoT = Date.now(); gravaRG(r); } API_PLACAR.puladas++; return true; } } } catch (e) {}
      // 6.04 (Stefany 13/11 12:38 "vamos pra cima"): RELEITURA DE VERMELHO (a cada 20 min) sem abrir a tela — se no servidor não há mensagem
      // nova desde a última leitura e as etiquetas são as mesmas, nada mudou: continua vermelho, só anota a hora da leitura.
      try { const x0 = RG()[id]; if (x0 && !x0.reler && !x0.relerHist && +x0.lidoT > 0 && x0.apiTags && /^(alerta|erro)$/.test(x0.estado || '')) { const j = await apiLer(id, 1);
        if (j) { API_PLACAR.lidas++; const lm = Date.parse(j.customer.LAST_MESSAGE_CREATION_TIME || ''); const tg = (j.customer.tags || []).slice().sort().join('|');
          if (lm && lm < +x0.lidoT && tg === x0.apiTags) { const r = RG(); if (r[id]) { r[id].lidoT = Date.now(); gravaRG(r); } API_PLACAR.puladas++; API_PLACAR.vermelhos = (API_PLACAR.vermelhos || 0) + 1; return true; } } else API_PLACAR.falhas++; } } catch (e) {}
      localStorage.setItem('dins_mapeando', Date.now());
      window.top.location.hash = '#/chats/' + id; await new Promise(s => setTimeout(s, 7000));
      for (let i = 0; i < 6 && !telaPronta(id); i++) await new Promise(s => setTimeout(s, 1500));
      if (!telaPronta(id)) return false;
      if (window.top.location.hash !== '#/chats/' + id || !document.querySelector('.entries')) return false;
      // 5.06 (Stefany 12/11 10:33 "pode fazer"): na 1ª leitura, e quando ainda não achou CPF nem escolha de valor, abre o
      // histórico inteiro ("Ver sessões anteriores" + "Mostrar mensagens a partir das…") antes de decidir. Uma vez a cada 6 h por conversa.
      try { const x0 = RG()[id]; const HX = GM_getValue('hist_expandido', {}) || {};
        if (((!x0 || (!x0.cpfSem && !x0.escolha && !x0.temCpf)) && !(Date.now() - (HX[id] || 0) < 6 * H)) || (x0 && x0.relerHist)) {   // 5.78: relerHist = pedido de leitura completa
          for (let k = 0; k < 8; k++) {
            const b = [...document.querySelectorAll('button')].filter(e => e.offsetParent).find(e => /Ver sess[õo]es anteriores|Mostrar mensagens a partir/i.test(e.innerText || ''))
                   || [...document.querySelectorAll('a,span,div')].filter(e => e.offsetParent && e.children.length <= 1).find(e => /^\s*Mostrar mensagens a partir/i.test(e.innerText || ''));
            if (!b) break; b.click(); await new Promise(r => setTimeout(r, 1800));
            if (window.top.location.hash !== '#/chats/' + id) return false;
          }
          HX[id] = Date.now(); for (const k in HX) if (Date.now() - HX[k] > 24 * H) delete HX[k]; GM_setValue('hist_expandido', HX); try { const rq = RG(); if (rq[id] && rq[id].relerHist) { delete rq[id].relerHist; gravaRG(rq); } } catch (e) {}
        } } catch (e) {}
      try { detectarLink(); } catch (e) {}
      // 5.82 (Stefany 21:13–21:16, caso Ester: o CPF estava no campo CPF das VARIÁVEIS do contato e numa NOTA de 28/10, e o robô pediu de novo)
      try { const T9 = document.body.innerText; let cv = '';
        const iv = T9.search(/Vari[áa]veis/); if (iv >= 0) { const mm = T9.slice(iv, iv + 4000).match(/\nCPF\s*\n+\s*(\d{3}\.?\d{3}\.?\d{3}-?\s?\d\s?\d)/); if (mm) cv = mm[1].replace(/\D/g, ''); }
        if (!cv) { const ino = T9.search(/\nNotas\s*\n/); if (ino >= 0) { const mm2 = T9.slice(ino, ino + 8000).match(/\bCPF\s*\n*\s*(\d{3}\.\d{3}\.\d{3}-\d{2})/); if (mm2) cv = mm2[1].replace(/\D/g, ''); } }
        if (cv && cv.length === 11 && !/^(\d)\1+$/.test(cv)) { const r9 = RG(); if (r9[id] && r9[id].cpfVar !== cv) { r9[id].cpfVar = cv; (r9[id].hist = r9[id].hist || []).push(hhmm(Date.now()) + ' 5.82: CPF achado no painel (variáveis/notas) — não pedir de novo'); gravaRG(r9); } } } catch (e) {}
      // 5.32: (tirado) guardar o telefone do painel na régua — painel atrasado poderia gravar o telefone de OUTRO cliente (erro 105)
      // 5.30 (caso Josias 12/11, erro 56): escolha de valor registrada em NOTA de dias antes ("ESCOLHA DE VALOR DO CLIENTE: … escolheu R$ 20.000,00", "pediu R$ 20.000")
      try { const tN = document.body.innerText || ''; const m = [...tN.matchAll(/ESCOLHA DE VALOR DO CLIENTE:[^\n]*?escolheu (?:R\$ ?)?([\d.]+,\d{2})/g)].pop() || [...tN.matchAll(/\bpediu R\$ ?([\d.]+(?:,\d{2})?)/g)].pop();
        if (m) { const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); if (v >= 500) { const VN = GM_getValue('valor_nota', {}) || {}; VN[id] = { v, t: Date.now() }; GM_setValue('valor_nota', VN); } } } catch (e) {}
      const x = RG()[id];
      // 4.89: estava 'fechada' mas a conversa voltou para a lista → reabre com a situação de agora
      if (x && x.estado === 'fechada') { try { const c = classificar(); const r0 = RG();
        // 5.72 (Stefany 19:53, caso Silvio RJ5XO: fechado 12:47, voltou para a fila 19:35 só porque a conversa foi aberta de novo): só reabre se o CLIENTE escreveu depois do fechamento
        const fT = +x.fechadaT || (() => { const hs = (x.hist || []).filter(h => /conversa fechada/.test(h)).pop(); const m = hs && /^(\d\d):(\d\d)/.exec(hs); if (!m) return 0; const d = new Date(+x.ultT || Date.now()); d.setHours(+m[1], +m[2], 0, 0); return d.getTime(); })();
        if (fT && !((+c.ultCliT || 0) > fT)) { if (r0[id]) { r0[id].lidoT = Date.now(); delete r0[id].reler; gravaRG(r0); } return true; }
        if (r0[id]) { r0[id].estado = c.estado; r0[id].motivo = c.motivo; ['vencida','ultCliT','ultT','ultLado','botParado','contornoT','temCpf','comQuem','handoffT','contornoInfo','cpfSemRespT','cpfSem','escolha','semCpfT','ultCliTxt','tags01'].forEach(k => { if (k in c) r0[id][k] = c[k]; }); r0[id].lidoT = Date.now(); (r0[id].hist = r0[id].hist || []).push(hhmm(Date.now()) + ' voltou para a lista: ' + c.motivo); gravaRG(r0); } } catch (e) {} return true; }
      if (x) {
        const m = /Chat em atendimento com ([^\n]+)/.exec(document.body.innerText); if (m && x.estado !== 'humano' && protegido(id)) window.dinsReguaHumano(id, m[1].trim());
        if (x.semLink || x.estado === 'alerta') { try { reclassificar(id); } catch (e) {} }   // 5.14
        // 5.62 (casos Elisete/Alexandre/Maristelcio): conversa COM link relida → atualiza quem falou por último e quando (sem isso o follow-up 'link' nunca nascia)
        else if (x.link && ['pausada', 'esgotada', 'acompanhando', 'ativa'].includes(x.estado)) { try { const c = classificar(); const r1 = RG(), y = r1[id]; if (y) {
          ['vencida','ultCliT','ultT','ultLado','ultCliTxt','comQuem','tags01'].forEach(k => { if (k in c && c[k] !== undefined) y[k] = c[k]; });
          if (['alerta', 'encerrado'].includes(c.estado) && c.estado !== y.estado) { y.estado = c.estado; y.motivo = c.motivo; (y.hist = y.hist || []).push(hhmm(Date.now()) + ' 5.62 relido: ' + c.motivo); }
          gravaRG(r1); } } catch (e) {} }
        const r2 = RG(); if (r2[id]) { delete r2[id].reler; r2[id].lidoT = Date.now(); gravaRG(r2); }
        try { apiLer(id, 1).then(j => { if (!j) return; const r3 = RG(); if (r3[id]) { r3[id].apiTags = (j.customer.tags || []).slice().sort().join('|'); gravaRG(r3); } }); } catch (e) {}   // 6.04: etiquetas no servidor no momento da leitura
      }
      else registrarSemLink(id);
      return true;
    }
    const idsDaLista = () => [...document.querySelectorAll('.customer-item')].map(ci => ({ id: (ci.parentElement || {}).id,
      arq: /ARCHIVED|Arquivad/i.test(ci.innerText) })).filter(x => x.id && !x.arq).map(x => x.id);
    window.dinsReguaMapear = async () => {
      let n = 0;
      for (const id of idsDaLista()) { if (RG()[id] && RG()[id].estado !== 'fechada') continue; if (vigiaTrabalhando()) break; if (await mapearUm(id)) n++; }   // 4.10: para se o vigia começar a trabalhar
      localStorage.setItem('dins_mapeando', 0); desenharRegua();
      log && log('Mapeamento: ' + n + ' conversas entraram no quadro.', 'ok');
      return n;
    };
    // daqui em diante sozinho: conversa nova na lista entra no quadro (uma por minuto, só com a tela livre)
    let mapeando = false;
    setInterval(async () => {
      if (mapeando || rodando || fupRodando || ((Date.now() - (+localStorage.getItem('dins_varrendo') || 0) < 2 * 60000) && !localStorage.getItem('dins_varre_pausa'))) return;   // 4.27: não briga com a varredura
      if (Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 2 * M) return;
      const ta = document.querySelector('textarea'); if (ta && ta.value.trim()) return;
      // 4.83 (caso Fernando: CPF 21:44, ordem só 21:54): quem está na fila "Esperando atendimento" e andou depois da última leitura é relido PRIMEIRO
      let FLq = []; try { FLq = JSON.parse(localStorage.getItem('dins_fila') || '[]').map(f => f.id); } catch (e) {}
      const fA = faz('atendimento'), fV = faz('varredura'); if (!fA && !fV) return;   // 5.64 papel da aba
      let novo = !fA ? null : idsDaLista().filter(id => !apiAdiado(id)).find(id => !RG()[id] || (RG()[id].estado === 'fechada' && RG()[id].reler))   /* 4.99 (Stefany 12/11 09:28: "atendimentos já encerrados não precisa ele olhar"): fechada só volta a ser lida se a conversa andou */   /* 4.89: 'fechada' que voltou para a lista era relida sem parar (caso Fernanda) e ninguém mais tinha vez */
        || FLq.filter(id => !apiAdiado(id)).find(id => !RG()[id] && id !== 'F20QOEL8YYLQN2S6SR47')   /* 4.93: cliente da fila que ainda não foi lido (não aparece na lista visível — ela só desenha ~6 conversas) */
        || FLq.filter(id => !apiAdiado(id)).find(id => RG()[id] && !protegido(id) && (RG()[id].reler || (+RG()[id].listaT || 0) > (+RG()[id].lidoT || 0)))
        || idsDaLista().filter(id => !apiAdiado(id)).find(id => RG()[id] && RG()[id].reler);   // 4.14: conversa que andou é relida
      // 4.23 (Stefany 11/11 08:06, casos Marcos/Hilda): vermelho com leitura velha. A conversa foi atendida e FECHADA, saiu da lista,
      // e o quadro nunca mais a releu — ficou pedindo "responder agora" 12 h depois. Agora, sem nada novo, o robô RELÊ (abre a conversa)
      // o vermelho cuja última leitura passou de 20 min, um por minuto, o mais velho primeiro. Lida de novo: tag de desfecho (01 I, 02, 03, 07)
      // vira "encerrado" e sai do vermelho; cliente que falou continua vermelho.
      // 4.85/4.87 (caso Rubi — antes da releitura dos vermelhos, que não deixava chegar a vez): "no bot (autoatendimento)" não é relido sozinho (não é vermelho) → quem parou no bot há 10 min+ é relido a cada 10 min (até 23 h),
      // para o robô ver que parou sem CPF e mandar o pedido de CPF.
      if (!novo && fA) { const ag = Date.now(); const c = Object.values(RG()).filter(x => x && x.hash && /no bot \(autoatendimento\)/.test(x.motivo || '') && x.estado === 'acompanhando' && !protegido(x.hash)
          && ag - (+x.ultCliT || 0) >= 10 * M && ag - (+x.ultCliT || 0) < 23 * H && ag - (+x.lidoT || 0) > 10 * M).sort((a, b) => (+a.lidoT || 0) - (+b.lidoT || 0))[0]; if (c) novo = c.hash; }
      if (!novo && fA) { const ag = Date.now(); const c = Object.values(RG()).filter(x => x && x.hash && pareceVermelho(x, ag) && ag - (+x.lidoT || 0) > 20 * M).sort((a, b) => (+a.lidoT || 0) - (+b.lidoT || 0))[0]; if (c) novo = c.hash; }
      // 5.62 (Stefany 18:00–18:02, casos Elisete/Alexandre/Ester): o 'reler' só valia para quem estava na lista visível (~6 conversas),
      // então 74 marcadas ficaram sem leitura. Agora, sem nada mais urgente, relê uma marcada fora da lista (a mais antiga primeiro).
      if (!novo && fV) { const c = Object.values(RG()).filter(x => x && x.hash && x.reler && x.hash !== 'F20QOEL8YYLQN2S6SR47' && !chatComOutraAba(x.hash) && !protegido(x.hash) && !x.comQuem && !['humano', 'fechada', 'cancelada', 'concluída'].includes(x.estado)).sort((a, b) => (+a.lidoT || 0) - (+b.lidoT || 0))[0]; if (c) novo = c.hash; }
      if (!novo) return;
      mapeando = true; try { await mapearUm(novo); localStorage.setItem('dins_mapeando', 0); desenharRegua(); } finally { mapeando = false; }
    }, 10000);   // 4.83: de 60 s para 30 s · 4.96: 10 s (fila da manhã com 10+ clientes levava meia hora para ser lida)
    // 3.95 — Stefany 10/11 15:14: "Fechou a conversa, ele sai." Conversa ARQUIVADA na lista → sai do quadro (e a régua para).
    setInterval(() => {
      if (!faz('atendimento')) return;   // 5.64 papel da aba
      const arq = [...document.querySelectorAll('.customer-item')].filter(ci => /ARCHIVED|Arquivad/i.test(ci.innerText)).map(ci => (ci.parentElement || {}).id).filter(Boolean);
      if (!arq.length) return; const r = RG(); let mudou = false;
      arq.forEach(id => { const x = r[id]; if (x && x.estado !== 'fechada') { x.estado = 'fechada'; x.fechadaT = Date.now(); x.motivo = 'conversa fechada'; x.hist.push(hhmm(Date.now()) + ' conversa fechada — saiu do acompanhamento'); mudou = true; } });
      if (mudou) { gravaRG(r); desenharRegua(); }
    }, 30000);
    // 4.07 — CLIENTE ESPERANDO PELA LISTA (Stefany 10/11 17:05, caso Alexsandra: respondeu o remarketing às 15:50, o bot só disse
    // "Estou analisando" e ninguém respondeu, porque o quadro marcava "pausada" e ela não entrou na fila).
    // A cada 30 s, olha a prévia de cada conversa na lista: última mensagem SEM o ✓ nosso (done_all/check) e com cara de espera
    // (texto do cliente numa conversa pausada/acompanhada, ou o bot dizendo que está analisando) → fica VERMELHO no quadro.
    const ESPERA_BOT = /Estou analisando suas informa|Estamos analisando aguarde|aguarde um (atendente|momento)|atendente humano|Assim que concluir irei avisar/i;
    setInterval(() => {
      if (!faz('atendimento')) return;   // 5.64 papel da aba
      try {
        const r = RG(); let mudou = false;
        document.querySelectorAll('.customer-item').forEach(ci => {
          const id = (ci.parentElement || {}).id; const x = r[id]; if (!x) return;
          const t = ci.innerText || ''; if (/ARCHIVED|Arquivad/i.test(t)) return;
          const nossa = /\b(done_all|check)\b/.test(t);
          const sig = t.replace(/Dura[çc][ãa]o:?\s*[\d:]+|\b\d{1,2}:\d{2}(:\d{2})?\b|\b\d+\s*(s|min|h|d)\b|\bAgora\b|\bontem\b/gi, '').replace(/\s+/g, ' ').slice(0, 120); if (x.prevSig && x.prevSig !== sig)   /* 4.88: sem o relógio da lista (mudava todo minuto e marcava TODO MUNDO para reler — o caso Rubi nunca chegava a vez) */ { x.listaT = Date.now(); if (x.estado !== 'humano') x.reler = 1; mudou = true; }   /* 5.54: com link também relê */ if (x.prevSig !== sig) { x.prevSig = sig; mudou = true; }   // 4.13: conversa andou
          // 5.54 (Stefany 17:57, caso Douglas: respondemos, ele respondeu "te retorno amanhã" e ficou no azul): mensagem nova do CLIENTE em conversa
          // 'acompanhando' ou 'encerrado' também é vermelho (vai e vem = pendente para nós responder)
          const pareceEspera = !nossa && (ESPERA_BOT.test(t) || ['pausada', 'esgotada', 'acompanhando', 'encerrado', 'ativa'].includes(x.estado));
          if (pareceEspera && !['alerta', 'erro', 'humano', 'fechada', 'cancelada'].includes(x.estado)) {
            x.estadoAntes = x.estado; x.estado = 'alerta'; x.motivo = 'cliente esperando resposta (lista: última mensagem não é nossa)'; x.reler = 1;   // 4.83: relê para achar CPF
            x.hist.push(hhmm(Date.now()) + ' alerta pela lista: ' + t.replace(/\s+/g, ' ').slice(0, 60)); mudou = true;
          } else if (nossa && x.estado === 'alerta' && /\(lista/.test(x.motivo || '')) {
            x.estado = x.estadoAntes || 'acompanhando'; x.motivo = 'respondido'; x.hist.push(hhmm(Date.now()) + ' respondido — saiu do alerta'); mudou = true;
          }
        });
        if (mudou) { gravaRG(r); desenharRegua(); }
      } catch (e) {}
    }, 30000);
    // conversa aberta (por qualquer um): atualiza a situação dela no quadro
    setInterval(() => { const h = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1]; if (h && document.querySelector('.entries')) { try { reclassificar(h); } catch (e) {} } }, 20000);
    // reavaliar do zero: apaga e mapeia de novo (lendo o que já foi feito na conversa)
    window.dinsReguaReavaliar = async hash => { delRG(hash); localStorage.setItem('dins_vigia_ocupado', 0); const ok = await mapearUm(hash); localStorage.setItem('dins_vigia_ocupado', 0); desenharRegua(); return ok && RG()[hash]; };
    // colocar em dia: um toque pulado/atrasado sai agora (Stefany 10/11 15:06) — dinsReguaAgora('HASH', '10'|'60'|'manha')
    window.dinsReguaAgora = (hash, tipo) => { const r = RG(), x = r[hash]; if (!x) return false; const q = x.toques.find(k => k.tipo === tipo); if (!q) return false; q.feito = 0; q.st = ''; q.tent = 0; q.prox = 0; q.quando = Date.now(); if (x.estado === 'esgotada') { x.estado = 'ativa'; x.motivo = ''; } x.hist.push(hhmm(Date.now()) + ' ' + tipo + ' colocado em dia'); gravaRG(r); desenharRegua(); return true; };
    // pular um toque que não deve sair (ex.: já foi feito à mão) — dinsReguaPular('HASH', '10'|'60'|'manha', 'motivo')
    window.dinsReguaPular = (hash, tipo, motivo) => { const r = RG(), x = r[hash]; if (!x) return false; const q = x.toques.find(k => k.tipo === tipo); if (!q || q.feito) return false; q.feito = Date.now(); q.st = 'pulado (' + (motivo || 'manual') + ')'; x.hist.push(hhmm(Date.now()) + ' ' + tipo + ' pulado: ' + (motivo || 'manual')); gravaRG(r); desenharRegua(); return true; };

    // 4.13 — "precisa de alguém junto" à mão (decisão da Stefany etc.): dinsReguaJunto('HASH', 'motivo') / dinsReguaSoltar('HASH')
    window.dinsReguaJunto = (hash, motivo) => { const r = RG(), x = r[hash]; if (!x) return false; x.junto = motivo || 'decisão da Stefany'; x.hist.push(hhmm(Date.now()) + ' junto: ' + x.junto); gravaRG(r); desenharRegua(); return true; };
    window.dinsReguaSoltar = hash => { const r = RG(), x = r[hash]; if (!x) return false; delete x.junto; gravaRG(r); desenharRegua(); return true; };

    // 1) DETECTOR: o chat aberto tem link de proposta mandado por nós que a régua ainda não conhece?
    // qualquer link NOSSO que não seja de grupo/rede social/material (o /n30 e o /parabens do PDF levam links que não são proposta)
    const LINK_PROPOSTA = /https?:\/\/[^\s)]+/ig;
    const NAO_PROPOSTA = /chat\.whatsapp\.com|wa\.me|whatsapp\.com|instagram\.com|facebook\.com|fb\.me|fb\.watch|g\.page|maps\.app|gov\.br|nuvidio|youtube|youtu\.be|tiktok|linktr\.ee|botmaker|google\.com|goo\.gl|maps\.|dinseguro\.com/i;
    function detectarLink() {
      if (rodando || fupRodando) return;
      const hash = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1];
      const e = document.querySelector('.entries'); if (!hash || !e) return;
      if (!telaPronta(hash)) return;
      const T = e.innerText.replace(/\[Nota interna\][\s\S]*?~ Criado por[^\n]*/g, '');
      let m, ultimo = null; LINK_PROPOSTA.lastIndex = 0;
      while ((m = LINK_PROPOSTA.exec(T))) { if (!NAO_PROPOSTA.test(m[0])) ultimo = { link: m[0], ix: m.index }; }
      if (!ultimo) return;
      // tem que ser mensagem NOSSA: o bloco começa com [Dinseguro]/[Nome] antes do link
      const antes = T.slice(Math.max(0, ultimo.ix - 1500), ultimo.ix);
      const iNosso = antes.lastIndexOf('['), iHora = antes.search(/\d{1,2}:\d{2} (AM|PM)\s*\n[^\n]*$/);
      if (iNosso < 0 || !/^\[[^\]\n]{2,40}\]/.test(antes.slice(iNosso))) return;
      // hora da mensagem: primeira hora depois do link. Dia: a ocorrência mais recente dessa hora que não está no futuro
      // (a data da "Sessão" engana: sessão aberta ontem continua hoje — caso Estefania 10/11).
      const hm = T.slice(ultimo.ix).match(/(\d{1,2}):(\d{2}) (AM|PM)/);
      if (!hm) return;
      const h = +hm[1] % 12 + (hm[3] === 'PM' ? 12 : 0);
      const d0 = new Date(); d0.setHours(h, +hm[2], 0, 0);
      let t = d0.getTime(); if (t > Date.now() + 2 * M) t -= 24 * H;
      if (t > Date.now() + 5 * M) return;                       // data estranha → não mexe
      // 4.36 (Stefany 10:09, caso Dalva): o registro "01 A sem link" (feito ao mapear) tem linkT = hora do mapeamento e
      // bloqueava o link de verdade mandado 2 min depois ("já conhecido") → a cliente ficou sem nenhum follow-up.
      // Registro SEM link não conta como link conhecido.
      const r = RG(), ant = (r[hash] && !r[hash].semLink && r[hash].link) ? r[hash] : null;
      // 4.02 — um link é de UM cliente só: se já está no quadro em outro chat, não grava de novo aqui
      if (Object.keys(r).some(k => k !== hash && r[k] && r[k].link === ultimo.link)) return;
      if (ant && (ant.link === ultimo.link || Math.abs(ant.linkT - t) < 3 * M)) return;   // já conhecido
      if (ant && ant.linkT > t) return;                          // é um link mais antigo
      if (Date.now() - t > 26 * H) return;                       // link velho (mais de um dia) não abre régua
      window.dinsLinkEnviado(hash, foneDoContato(), t, ultimo.link, nomeDoContato());
      // toques que já passaram do horário quando a régua é criada atrasada: só o mais recente vale
      const r2 = RG(), x = r2[hash];
      // 3.97 — o que JÁ FOI FEITO à mão (ou por outro atendente) depois do link conta como feito: não repete.
      const depois = T.slice(ultimo.ix);
      const jaFeito = { '10': /Conseguiu acessar|conseguiu abrir o link/i, '60': /automaticamente cancelada|ser[áa] cancelada/i, manha: /Passando s[óo] para lembrar|continua dispon[íi]vel no link/i };
      x.toques.forEach(q => { if (!q.feito && jaFeito[q.tipo].test(depois)) { q.feito = Date.now(); q.st = 'já feito antes do robô'; } });
      if (x.toques.every(q => q.feito)) { x.estado = 'esgotada'; x.motivo = 'os três toques já foram feitos'; }
      // 3.97 — link mandado por OUTRO atendente (Rômulo, Stefany…) → é dele: fica no quadro, robô não manda nada
      const autor = (antes.slice(iNosso).match(/^\[([^\]\n]{2,40})\]/) || [])[1] || '';
      if (autor && !/^Dinseguro$/i.test(autor.trim()) && protegido(hash)) { x.estado = 'humano'; x.motivo = 'link enviado por ' + autor.replace(/👤/g, '').trim() + ' — robô não manda nada'; }
      // 3.97 — cliente já falou DEPOIS do link → a conversa virou atendimento: régua pausada (vigia/atendente cuidam)
      else if (falouDepois(depois)) { x.estado = 'pausada'; x.motivo = 'cliente respondeu depois do link — atendimento humano'; }
      // 3.96 (Stefany 10/11 15:15): nada de "pulado". Toque que já venceu SAI AGORA, marcado como atrasado.
      // O /132 conta 60 min a partir do "Conseguiu acessar?" (não do link): enquanto o de 10 não sai, o de 60 espera.
      const q10 = x.toques.find(q => q.tipo === '10'), q60 = x.toques.find(q => q.tipo === '60');
      // 4.36: link achado TARDE (mais de 3 h depois, caso Dalva) → "Conseguiu acessar?" e /132 não fazem mais sentido;
      // fica só o toque da manhã ("continua disponível no link").
      if (Date.now() - t > 3 * H) [q10, q60].forEach(q => { if (q && !q.feito) { q.feito = Date.now(); q.st = 'pulado (link achado tarde — vale o da manhã)'; } });
      if (q10 && !q10.feito && q60 && !q60.feito) q60.quando = Math.max(q60.quando, q10.quando + 60 * M);
      gravaRG(r2); desenharRegua();
    }
    setInterval(detectarLink, 15000);
    // 4.04 — CPF → WhatsApp: em cada chat aberto (tela parada), guarda os CPFs válidos da conversa com o telefone do chat.
    // A ficha do Multicorban usa isso para o telefone da proposta (caso Vilson 10/11 16:28).
    const cpfOk = c => { if (c.length !== 11 || /^(\d)\1+$/.test(c) || c === '10123456789') return false; let q = 0; for (let i = 0; i < 9; i++) q += +c[i] * (10 - i); let d = (q * 10) % 11 % 10; if (d !== +c[9]) return false; q = 0; for (let i = 0; i < 10; i++) q += +c[i] * (11 - i); d = (q * 10) % 11 % 10; return d === +c[10]; };
    setInterval(() => {
      try {
        const h = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1]; if (!h || !telaPronta(h)) return;
        const fone = foneDoContato(); if (!fone) return;
        const txt = document.body.innerText;
        const achados = [...new Set([...(txt.match(/(?<![\d.])\d{3}\.?\d{3}\.?\d{3}-?\s?\d\s?\d(?![\d-])/g) || [])].map(z => z.replace(/\D/g, '')).filter(cpfOk))];
        if (!achados.length) return;
        const m = GM_getValue('zap_por_cpf', {}) || {}; let mudou = false;
        achados.forEach(c => { if (!m[c] || m[c].fone !== fone || Date.now() - m[c].t > 3600e3) { m[c] = { fone, hash: h, t: Date.now() }; mudou = true; } });
        if (mudou) { const ks = Object.keys(m).sort((a, b) => m[b].t - m[a].t); ks.slice(400).forEach(k => delete m[k]); GM_setValue('zap_por_cpf', m); }
      } catch (e) {}
    }, 15000);
    // 3.99 — HELPERS DO VIGIA moram no robô (não precisa mais colar o arquivo a cada recarga — economia de tokens).
    // Ficam na janela de cima: __tail, __chat, __cpfs, __ok, __envia, __enviaForca, __tags, __notaPos, __tagPos, __notaFill,
    // __fila, __regua, __escolhaValor, __ocupado. A trava dos 90 dias continua dentro do envio.
    try { (() => {
      const TW = window.top, DOCF = () => document, semNota = t => t.replace(/\[Nota interna\][\s\S]*?~ Criado por[^\n]*\n?/g, '');
      const dorme = ms => new Promise(z => setTimeout(z, ms));
      TW.__tail = (n = 600) => { const p = semNota(DOCF().body.innerText); const e = p.lastIndexOf('sentiment_satisfied_alt'); return [TW.location.hash, (DOCF().querySelector('textarea') || {}).placeholder?.slice(0, 40), p.slice(Math.max(0, e - n), e).replace(/https?:\/\/\S+/g, '[url]')]; };
      TW.__chat = () => { const p = DOCF().body.innerText; const ci = p.indexOf('Chat\nRespostas rápidas'); const e = p.lastIndexOf('sentiment_satisfied_alt'); return p.slice(ci, e); };
      TW.__poe = msg => { const ta = DOCF().querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, msg); ta.dispatchEvent(new Event('input', { bubbles: true })); return [TW.location.hash, ta.value.length]; };
      TW.__ok = c => { c = String(c).replace(/\D/g, ''); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false; let q = 0; for (let i = 0; i < 9; i++) q += +c[i] * (10 - i); let d = (q * 10) % 11 % 10; if (d !== +c[9]) return false; q = 0; for (let i = 0; i < 10; i++) q += +c[i] * (11 - i); d = (q * 10) % 11 % 10; return d === +c[10]; };
      TW.__cpfs = t => [...new Set([...(String(t).match(/\d[\d.\-\s]{8,16}\d/g) || []), ...(String(t).match(/\b\d{11}\b/g) || [])].map(z => z.replace(/\D/g, '')).map(z => z.length === 10 ? '0' + z : z).filter(z => TW.__ok(z) && z !== '10123456789'))];
      // 4.69 (Stefany 11/11 15:39, Fabiano/Carmen): __tags lia também o chip da janela "Adicionar tag" ainda aberta e dava "entrou"
      // sem a tag ter entrado. Agora ignora qualquer chip dentro de diálogo/modal e o chip das conversas da lista.
      TW.__tags = () => [...DOCF().querySelectorAll('.MuiChip-label')].filter(c => !c.closest('[role=dialog], .MuiDialog-root, .MuiModal-root, .customer-item')).map(c => c.textContent).filter(t => /^0\d|^Q15/.test(t));
      TW.__ocupado = () => { localStorage.setItem('dins_vigia_ocupado', Date.now()); return 'ok'; };
      async function abreTW(id) { if (TW.location.hash !== '#/chats/' + id) { TW.location.hash = '#/chats/' + id; await dorme(4500); } return TW.location.hash === '#/chats/' + id; }
      async function mandaTW(id, msg, forca) {
        // 4.08 — o Botmaker já assina "[Dinseguro]" sozinho: tirar a assinatura do começo do texto (Stefany 10/11 17:22, saía duplicado)
        msg = String(msg).replace(/^\s*(\[Dinseguro\]\s*)+/i, '');
        localStorage.setItem('dins_vigia_ocupado', Date.now());
        if (!await abreTW(id)) return 'HASH NÃO ABRIU';
        const t = TW.__tail(300);
        if (/janela|em atendimento com/i.test(t[1] || '') || /Chat em atendimento com/.test(DOCF().body.innerText)) return 'NÃO ENVIADO: chat com atendente / janela';
        if (!forca && !/(done_all|check)\s*\n0\s*\n?$/.test(t[2])) return 'ULTIMA MSG DO CLIENTE: ' + t[2].slice(-160).replace(/\n/g, ' ');
        // 4.06 — "90 dias" de CARÊNCIA (1ª parcela mais tarde) não é o bloqueio dos 90 dias: não trava (caso Celmo 10/11 16:58).
        const msgTrava = String(msg).replace(/car[eê]ncia[^\n]{0,40}?90 dias|90 dias[^\n]{0,20}?car[eê]ncia/gi, ' ');
        if (/90 dias|bloquead[oa] para empr[eé]stimo|benef[ií]cio foi concedido|concedido em|prazo (dos 90 dias )?vence|desbloque/i.test(msgTrava)) {
          const hoje = new Date().toISOString().slice(0, 10);
          const aprovado = TW.__tags().some(x => /^01 D/.test(x)) || localStorage.getItem('dins_aprovado') === id + '|' + hoje;
          if (!aprovado) return 'BLOQUEADO: data de pagamento / 90 dias só para cliente APROVADO (tag 01 D ou dins_aprovado).';
        }
        TW.__poe(msg); await dorme(500);
        if (TW.location.hash !== '#/chats/' + id) { TW.__poe(''); return 'HASH MUDOU — não enviado'; }
        DOCF().querySelector('button.send-button-component').click(); await dorme(2000);
        return 'ok ' + (DOCF().querySelector('textarea').value === '');
      }
      TW.__envia = (id, msg) => mandaTW(id, msg, false);
      TW.__enviaForca = (id, msg) => mandaTW(id, msg, true);
      TW.__escolhaValor = () => [...semNota(TW.__chat()).matchAll(/[^\n]*(R\$ ?\d[\d.,]*(?: 2)?|Outro valor|Simular outro valor|Sim desejo contratar|\d+ x R\$ ?[\d.,]+)[^\n]*/gi)].map(m => m[0].slice(0, 80));
      const posTW = rotulo => { const F = TW.document.querySelector('iframe'), fr = F.getBoundingClientRect(); const leaf = [...DOCF().querySelectorAll('*')].find(e => e.children.length == 0 && e.textContent.trim() === rotulo); let a = leaf, p = null; for (let i = 0; i < 5 && a && !p; i++) { a = a.parentElement; p = [...a.querySelectorAll('*')].find(e => e.textContent.trim() === 'add_circle'); } const r = p.getBoundingClientRect(); return [Math.round(r.x + fr.x + r.width / 2), Math.round(r.y + fr.y + r.height / 2)]; };
      TW.__notaPos = () => posTW('Notas'); TW.__tagPos = () => posTW('Tags');
      TW.__notaFill = async txt => { const ta = [...DOCF().querySelectorAll('textarea')].find(t => /Escreva aqui/.test(t.placeholder)); if (!ta) return 'sem caixa'; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, txt); ta.dispatchEvent(new Event('input', { bubbles: true })); await dorme(400); const b = [...DOCF().querySelectorAll('button')].find(b => b.textContent.trim() === 'Criar'); if (!b || b.disabled) return 'Criar desabilitado'; b.click(); await dorme(1500); return 'ok'; };
      TW.__fila = () => JSON.parse(localStorage.getItem('dins_fila') || '[]').map(x => [x.nome, x.id, (x.msg || '').slice(0, 60), (x.quando || '').slice(11, 16), x.humano || '']);
      TW.__regua = () => Object.values(RG()).filter(x => !['cancelada', 'fechada'].includes(x.estado)).map(x => [x.nome || x.hash.slice(0, 6), x.hash, x.estado, (x.motivo || '').slice(0, 60), (x.toques || []).map(t => t.tipo + ':' + (t.feito ? (t.st || 'feito') : hhmm(t.quando))).join(' | ')]);
      TW.__R = window;   // acesso às funções do robô: __R.dinsReguaResumo(...), __R.dinsReguaHumano(...)
    })(); } catch (e) {}
    // houve mensagem do CLIENTE no trecho? (blocos nossos começam com [Nome]/"Enviado pelo…" e terminam no done_all/check)
    function falouDepois(trecho) {
      const L = trecho.replace(/\[Nota interna\][\s\S]*?~ Criado por[^\n]*/g, '').split('\n').map(z => z.trim()).filter(Boolean);
      let nosso = true;   // o trecho começa dentro da mensagem do link
      for (const l of L) {
        if (/^(done_all|check|done)$/.test(l)) { nosso = false; continue; }
        if (/^\[[^\]]{2,40}\]/.test(l) || /^Enviado (pelo|por) /.test(l)) { nosso = true; continue; }
        if (nosso) continue;
        if (/^(\d{1,2}:\d{2}( (AM|PM))?|info_outline|security|list_alt|schedule|bolt|open_in_new|play_arrow|person|sentiment_satisfied.*|keyboard_arrow_down|download|folder_zip|x1|info|\d{1,3})$/.test(l)) continue;
        if (/^Sess[ãa]o \d|^(SEG|TER|QUA|QUI|SEX|S[ÁA]B|DOM) \d/.test(l)) continue;
        return true;
      }
      return false;
    }

    // 3.96 — desfaz os "pulado (régua criada depois)": se o de 60 já saiu, o de 10 fica como "não enviado (já recebeu o /132)";
    // se não, volta a valer e sai agora. E o de 60 passa a contar do envio do de 10.
    try { const r = RG(); let mud = false;
      Object.values(r).forEach(x => { const q10 = x.toques.find(q => q.tipo === '10'), q60 = x.toques.find(q => q.tipo === '60'), qm = x.toques.find(q => q.tipo === 'manha');
        [q10, q60, qm].forEach(q => { if (q && /pulado \(régua criada depois\)/.test(q.st || '')) {
          if (q === q10 && q60 && /enviado/.test(q60.st || '')) { q.st = 'não enviado (já recebeu o /132)'; }
          else { q.feito = 0; q.st = ''; q.quando = Date.now(); if (x.estado === 'esgotada') { x.estado = 'ativa'; x.motivo = ''; } }
          mud = true; } });
        if (q10 && q60 && !q60.feito) { const m = /enviado (\d\d):(\d\d)/.exec(q10.st || ''); if (m) { const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); q60.quando = d.getTime() + 60 * M; mud = true; }
          else if (!q10.feito) { q60.quando = Math.max(q60.quando, q10.quando + 60 * M); mud = true; } } });
      if (mud) gravaRG(r); } catch (e) {}
    // migra o que estava no follow-up antigo
    try { const velhos = GM_getValue('followups', []); if (velhos.length) { const r = RG(); velhos.forEach(f => { if (!r[f.hash]) { r[f.hash] = { hash: f.hash, fone: f.fone || '', nome: '', link: '', linkT: f.linkT || Date.now(), estado: 'ativa', motivo: '', toques: TOQUES.map(x => ({ tipo: x.tipo, quando: x.dt(f.linkT || Date.now()), feito: 0, st: '' })), tent: 0, hist: ['migrada do follow-up antigo'] }; } }); gravaRG(r); GM_setValue('followups', []); } } catch (e) {}

    // o cliente falou depois do link? Lê o fim da conversa de trás para frente.
    // Marca nossa: toda mensagem que sai leva "done_all" (o visto duplo) logo depois.
    // Nota interna é um bloco: entra em "~ Criado por" e sai em "[Nota interna]".
    // 4.13 — QUEM FALOU POR ÚLTIMO, pelo DOM (Stefany 10/11 18:13, caso Donizete/Ramão): o texto da tela confundia os botões
    // do bot (que aparecem depois do ✓) com resposta do cliente. No DOM: .entries-li.left = cliente, .right = nós/bot;
    // o 1º balão do grupo (first-from) com "Enviado pelo credsegurobank" = bot. Hora de cada balão pela data da sessão.
    const CONTORNO_RE = /20260804-P5gmFiMS|Simula[çc][ãa]o 10 a 18 mil/i;
    function lados() {
      const els = [...document.querySelectorAll('[class*="entries-li"]')]; if (!els.length) return null;
      let dia = null, grpBot = false; const ms = [];
      for (const el of els) {
        const c = String(el.className || ''); const txt = (el.innerText || '').trim();
        if (/entries-li-session-date/.test(c)) { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(txt); if (m) dia = [+m[3], +m[2] - 1, +m[1]]; continue; }
        if (!el.classList.contains('left') && !el.classList.contains('right')) continue;
        if (/^\[Nota interna\]|~ Criado por/.test(txt)) continue;
        const lado = el.classList.contains('left') ? 'cli' : 'nos';
        if (lado === 'nos' && el.classList.contains('first-from')) grpBot = /Enviado pelo credsegurobank/.test(txt);
        if (lado === 'nos' && /Enviado por Dinseguro|^\s*\[Dinseguro\]/m.test(txt)) grpBot = false;   // 4.21a: mensagem nossa no meio do grupo do bot (caso Hilda) não é do bot
        let t = null; const h = /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(done_all|check|done)?\s*$/i.exec(txt);
        if (h && dia) { let hh = +h[1] % 12; if (/PM/i.test(h[3] || '')) hh += 12; if (!h[3]) hh = +h[1]; t = new Date(dia[0], dia[1], dia[2], hh, +h[2]).getTime(); }
        // 4.77 (Stefany 18:44, foto da lista: "quando tá no robô ainda, mesmo que tá no meu nome, fica com um robozinho escrito credsegurobank"):
        // o que vale é o GRUPO "Enviado pelo credsegurobank", não o nome [Fulano👤] no texto — o bot assina modelos com nome de pessoa.
        // Mensagem humana de verdade abre grupo novo "Enviado por <Nome>" (grpBot = false).
        ms.push({ lado, bot: lado === 'nos' && (TEMPLATE_PESSOA.test(txt) || (grpBot && !/^\s*(Enviado por (?!o)|\[Dinseguro\])/m.test(txt))), txt: txt.replace(/\b(bolt|done_all|check|info_outline|security)\b/g, ' ').replace(/\d{1,2}:\d{2}\s*(AM|PM)?/g, ' ').replace(/\s+/g, ' ').trim(), t, raw: txt });
      }
      for (let i = ms.length - 2; i >= 0; i--) if (!ms[i].t) ms[i].t = ms[i + 1].t;   // balão sem hora: hora do próximo do grupo
      if (!ms.length) return null;
      const ult = ms[ms.length - 1], ultCli = [...ms].reverse().find(m => m.lado === 'cli');
      const iCli = ultCli ? ms.lastIndexOf(ultCli) : -1;
      const depois = ms.slice(iCli + 1);
      const iCont = depois.map(m => m.lado === 'nos' && !m.bot && CONTORNO_RE.test(m.raw)).lastIndexOf(true);
      const linkDepois = iCont >= 0 && depois.slice(iCont + 1).some(m => m.lado === 'nos' && /https?:\/\/(?!chat\.whatsapp|wa\.me|fb\.me|g\.co)/i.test(m.raw));
      const contorno = iCont >= 0 && !linkDepois ? depois[iCont] : null;
      // 4.20 — o que o cliente escolheu ANTES do contorno (para o robô digitar sozinho depois de 15 min)
      let contornoInfo = null;
      if (contorno) {
        const iAbs = ms.indexOf(contorno); const antesC = ms.slice(0, iAbs);
        const VAL = m => { const t = (m.txt || '').replace(/\s+/g, ' ');
          let r = /R\$\s*([\d.]+,\d{2})/.exec(t) || /^([\d.]+,\d{2})\b/.exec(t) || /^(\d{1,3}(?:\.\d{3})+)\b/.exec(t);
          if (r) return parseFloat(r[1].replace(/\./g, '').replace(',', '.'));
          r = /^(\d+(?:[.,]\d+)?)\s*mil\b/i.exec(t); if (r) return parseFloat(r[1].replace(',', '.')) * 1000;
          return 0; };
        const iVal = antesC.map(m => m.lado === 'cli' && VAL(m) >= 500).lastIndexOf(true);
        const valor = iVal >= 0 ? VAL(antesC[iVal]) : 0;
        const aceite = iVal >= 0 && antesC.slice(iVal).some(m => m.lado === 'cli' && /Sim desejo contratar|quero contratar/i.test(m.txt));
        const cpfM = [...ms].reverse().find(m => m.lado === 'cli' && /\b\d{3}\.?\d{3}\.?\d{3}-?\s?\d\s?\d\b/.test(m.raw));
        const cpf = cpfM ? (cpfM.raw.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\s?\d\s?\d\b/)[0] || '').replace(/\D/g, '') : '';
        contornoInfo = { valor, aceite, cpf };
      }
      const temCpf = ms.some(m => m.lado === 'cli' && /\b\d{3}\.?\d{3}\.?\d{3}-?\s?\d\s?\d\b/.test(m.raw));   // CPF mandado PELO CLIENTE
      // 4.14 — HANDOFF (Stefany 10/11 18:41, caso Carmen): o bot disse "logo você será atendido(a) por um atendente humano"
      // e DEPOIS mandou outra mensagem dele (vídeo). A prévia da lista mostrava só o vídeo → ninguém pôs na fila.
      const HANDOFF_RE = /atendido\(a\) por um atendente humano|atendente humano|Estou analisando suas informa|Estamos analisando|Assim que concluir irei avisar/i;
      const iHand = depois.map(m => m.lado === 'nos' && m.bot && HANDOFF_RE.test(m.raw)).lastIndexOf(true);
      const humanoDepois = iHand >= 0 && depois.slice(iHand + 1).some(m => m.lado === 'nos' && !m.bot);
      const handoffT = iHand >= 0 && !humanoDepois ? (depois[iHand].t || Date.now()) : 0;
      const pessoa = [...ms].reverse().find(m => m.lado === 'nos' && !m.bot && /\[([^\]\n]{2,40})👤\]/.test(m.raw) && !TEMPLATE_PESSOA.test(m.raw));   // 4.77: só humano de verdade   // 4.76: modelo de campanha não é atendimento
      const comQuem = pessoa && (!ultCli || ms.indexOf(pessoa) > iCli) ? /\[([^\]\n]{2,40})👤\]/.exec(pessoa.raw)[1].trim() : '';   // Rômulo/Stefany falou depois do cliente
      // 4.17 (Stefany 19:19, casos Rita/Silvio/Nelson/José Tobias): CPF mandado pelo cliente sem resposta HUMANA depois = vermelho na hora,
      // mesmo que o bot tenha falado depois (pedido de extrato etc.). "Não precisa esperar o extrato, pode cair para dentro."
      const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\s?\d\s?\d\b/;
      const iCpf = ms.map(m => m.lado === 'cli' && CPF_RE.test(m.raw)).lastIndexOf(true);
      const cpfSemRespT = iCpf >= 0 && !ms.slice(iCpf + 1).some(m => m.lado === 'nos' && !m.bot) ? (ms[iCpf].t || Date.now()) : 0;
      const cpfSem = cpfSemRespT ? (ms[iCpf].raw.match(CPF_RE)[0] || '').replace(/\D/g, '') : '';   // 4.24: o robô consulta sozinho
      const nossaAntes = ((iCli > 0 ? [...ms.slice(0, iCli)].reverse().find(m => m.lado === 'nos') : null) || {}).raw || '';
      // 4.75 (Stefany 11/11 17:53): a ÚLTIMA simulação do bot ("simulação personalizada … Receba: R$ X / Pague em: N x R$ Y") é a escolha
      // de valor do cliente; "Sim desejo contratar" depois dela = aceite. Sem isso = não mexeu em valor (vai o máximo).
      let escolha = null;
      { const iSim = ms.map(m => m.lado === 'nos' && /Receba:?\s*R\$\s*[\d.]+,\d{2}/i.test(m.raw || m.txt || '')).lastIndexOf(true);
        if (iSim >= 0) { const t = (ms[iSim].raw || ms[iSim].txt || '').replace(/\s+/g, ' ');
          const v = /Receba:?\s*R\$\s*([\d.]+,\d{2})/i.exec(t); const pz = /Pague em:?\s*(\d{2,3})\s*x/i.exec(t);
          const valor = v ? parseFloat(v[1].replace(/\./g, '').replace(',', '.')) : 0;
          const aceite = ms.slice(iSim + 1).some(m => m.lado === 'cli' && /sim,?\s*desejo contratar|quero contratar/i.test(m.txt || m.raw || ''));
          // 5.95 (Stefany 13/11 10:21, caso Michelle: simulou R$ 20 mil e depois clicou "Fazer nova simulação"): o que vale é a RESPOSTA depois da
          // simulação. "Nova simulação" / "Não desejo contratar" / "Outro valor" sem nova simulação depois = RECUSOU esse valor → vai o máximo.
          const recusou = !aceite && ms.slice(iSim + 1).some(m => m.lado === 'cli' && /nova simula[çc][ãa]o|fazer (uma )?nova|simular (outro|novamente|de novo)|outro valor|n[ãa]o desejo contratar|n[ãa]o quero (contratar|esse)/i.test(m.txt || m.raw || ''));
          if (valor > 0 && !recusou) escolha = { valor, prazo: pz ? +pz[1] : 0, aceite };
          if (valor > 0 && recusou) escolha = null; } }
      // 4.76 (Stefany 11/11 18:37, caso Nathalie: simulou R$ 3.000 no bot às 12:31, parou sem CPF, 6 h sem ninguém): lê o CONTEXTO, não só a
      // última mensagem. Cliente passou pelo bot (tem simulação/escolha), nunca mandou CPF, e depois da última mensagem dele só houve bot,
      // modelo de campanha ou mídia (nenhum humano escreveu) → semCpfT = hora da última mensagem do cliente.
      let semCpfT = 0;
      // 4.84 (Stefany 11/11 21:59, caso Rubi: clicou "Aposentado / Pensão" às 21:09 e parou no meio do bot, sem simulação → o robô dizia
      // "no bot (autoatendimento)" e ninguém via). Agora vale também SEM simulação: entrou no bot, parou, nunca mandou CPF, ninguém atendeu.
      // Fica de fora quem disse ao bot que não é do INSS (não sou aposentado, CLT, servidor…).
      const naoInss = ms.some(m => m.lado === 'cli' && /n[ãa]o sou|\bclt\b|carteira assinada|servidor|forças armadas|bolsa fam/i.test(m.txt || m.raw || ''));
      if (!temCpf && ultCli && (escolha || !naoInss)) {
        const humano = ms.slice(iCli + 1).some(m => m.lado === 'nos' && !m.bot && !/^\s*(play_arrow|Enviado por [^\n]*$)/.test(m.raw || '') && (m.txt || '').length > 3);
        if (!humano) semCpfT = ultCli.t || 0;
      }
      return { ult, ultCli, contornoT: contorno ? (contorno.t || Date.now()) : 0, contornoInfo, temCpf, comQuem, handoffT, nossaAntes, cpfSemRespT, cpfSem, escolha, semCpfT };
    }
    function clienteRespondeu() {
      try { const L = lados(); if (L && L.ult) return L.ult.lado === 'cli'; } catch (e) {}
      const e = document.querySelector('.entries');
      if (!e) return false;
      const linhas = e.innerText.split('\n').map(x => x.trim()).filter(Boolean);
      let dentroDaNota = false;
      for (let i = linhas.length - 1; i >= 0; i--) {
        const l = linhas[i];
        if (/^~ Criado por/.test(l)) { dentroDaNota = true; continue; }
        if (/^\[Nota interna\]/.test(l)) { dentroDaNota = false; continue; }
        if (dentroDaNota) continue;
        if (/^(done_all|check|done)$/.test(l)) return false;    // a última foi nossa/do bot (4.01: ✓ simples também)
        if (/^\[Dinseguro\]/.test(l)) return false;
        if (/Enviado pelo credsegurobank/.test(l)) return false; // o robô do bot falou
        if (/^(check|info_outline|security|list_alt|schedule|bolt|open_in_new|play_arrow|person|Home|Lar)$/.test(l)) continue;
        if (/^Enviado por Dinseguro$/.test(l)) continue;         // rótulo do canal, não é autoria
        if (/^S(e|É)X|^SÁB|^DOM|^SEG|^TER|^QUA|^QUI/i.test(l) && /\d{1,2}:\d{2}/.test(l)) continue;
        if (/^Sess[ãa]o /.test(l)) continue;
        if (/^\d{1,2}:\d{2}(:\d{2})?( (AM|PM))?$/.test(l)) continue;
        // 4.11 — resposta de 1 caractere ("1", "2", "3") é resposta do cliente (caso Tejo 10/11 17:44). Só a ÚLTIMA linha
        // só-número é o contador de não lidas do Botmaker.
        if (i === linhas.length - 1 && /^\d+$/.test(l)) continue;
        if (l.length >= 1) return true;                         // texto que não é nosso
      }
      return false;
    }

    // 2) EXECUTOR: um toque por minuto, no máximo
    let fupRodando = false;
    async function olharFollowups() {
      if (vigiaTrava()) return;   // 4.54
      if (fupRodando || rodando || ((Date.now() - (+localStorage.getItem('dins_varrendo') || 0) < 2 * 60000) && !localStorage.getItem('dins_varre_pausa'))) return;
      if (localStorage.getItem('dins_ordem')) return;                                  // desfecho na fila
      const ocup = +localStorage.getItem('dins_vigia_ocupado') || 0;
      // 4.42: o vigia marcava 'ocupado' a cada ação e segurava os toques por 2 min seguidos (caso Dalva/Lu 11/11) — agora 45 s
      if (Date.now() - ocup < 45000) return;                                           // vigia mexendo agora
      const ta = document.querySelector('textarea'); if (ta && ta.value.trim()) return; // mensagem sendo escrita
      const r = RG(); const agora = Date.now();
      let alvo = null, toque = null;
      for (const x of Object.values(r)) {
        // 4.30 (Stefany 11/11 08:53: "teve uma galera que recebeu link ontem que não teve o follow-up da manhã"): o toque das 08:00
        // também vale para quem ficou 'pausada' (cliente respondeu ontem e nós respondemos depois) e 'humano' (Rômulo/Stefany falou
        // por último) — o robô abre a conversa e só manda se a ÚLTIMA mensagem for nossa (cliente sem resposta desde então).
        const manhaTambem = ['pausada', 'humano'].includes(x.estado) && x.link;
        if (x.estado !== 'ativa' && !manhaTambem) continue;
        const q = x.toques.find(q => !q.feito && q.quando <= agora && (!q.prox || q.prox <= agora) && (x.estado === 'ativa' || q.tipo === 'manha'));
        if (q) { alvo = x; toque = q; break; }
      }
      if (!alvo) return;
      const reg = (st, fim) => { const r2 = RG(), x = r2[alvo.hash]; if (!x) return; const q = x.toques.find(k => k.tipo === toque.tipo);
        if (fim) { q.feito = Date.now(); } q.st = st; x.hist.push(hhmm(Date.now()) + ' ' + toque.tipo + ': ' + st); gravaRG(r2); desenharRegua(); };
      const estado = (est, motivo) => { const r2 = RG(), x = r2[alvo.hash]; x.estado = est; x.motivo = motivo; x.hist.push(hhmm(Date.now()) + ' ' + est + ': ' + motivo); gravaRG(r2); desenharRegua(); };
      // fora do horário: 10/60 não saem (fica o da manhã); o da manhã nunca cai fora porque é às 08:00
      if ((toque.tipo === '10' || toque.tipo === '60') && !dentroDoHorario(agora)) { reg('pulado (fora de 8h–21h)', true); return; }
      if (toque.tipo === 'manha' && !dentroDoHorario(agora)) return;
      // 4.18: cliente que já assinou (ou foi pago/recusado) não recebe "Conseguiu acessar?" / /132
      { const fe = faseEsteira(alvo); if (fe && !['não assinou', 'andamento'].includes(fe.fase)) { reg('pulado (esteira: ' + fe.fase + ')', true); return; } }
      // 4.14c (caso Marcia Verônica 10/11 18:43): régua criada tarde para link de ontem → o toque das 08:00 não sai à noite com "bom dia"
      if (toque.tipo === 'manha' && agora - toque.quando > 3 * H) { reg('pulado (passou da manhã — régua criada tarde)', true); estado('esgotada', 'toque da manhã passou — vai para a FILA-FOLLOWUP-WHATSAPP'); return; }
      // 4.19 — TRAVA ENTRE ABAS (Stefany 19:30 "Duplicou": o "Conseguiu acessar?" do José Tobias saiu 2x às 19:27, porque duas
      // abas/janelas do Botmaker com o robô pegaram o mesmo toque). Quem vai mandar reserva o toque no armazenamento comum,
      // espera e confere se a reserva é dele; a outra aba desiste.
      {
        const chave = alvo.hash + '|' + toque.tipo; const L = GM_getValue('fup_lock', {}) || {};
        // 4.43: a reserva de uma aba que RECARREGOU (outro ABA_ID) segurava o toque por 10 min — e, como o laço pega sempre o
        // primeiro toque vencido, parava a fila inteira (Lu Andrade 11/11 10:42–10:55). Agora a reserva vale 90 s.
        if (L[chave] && Date.now() - L[chave].t < 90000 && L[chave].aba !== ABA_ID) return;
        L[chave] = { aba: ABA_ID, t: Date.now() }; GM_setValue('fup_lock', L);
        await new Promise(s => setTimeout(s, 1500 + Math.random() * 1500));
        const L2 = GM_getValue('fup_lock', {}) || {}; if (!L2[chave] || L2[chave].aba !== ABA_ID) return;
        const x2 = (RG() || {})[alvo.hash]; const q2 = x2 && x2.toques.find(k => k.tipo === toque.tipo); if (!q2 || q2.feito) return;   // a outra aba já mandou
      }
      if (!navPega('fup')) return;
      fupRodando = true;
      try {
        const alvoHash = '#/chats/' + alvo.hash;
        if (!(await esperaChatLivre(alvo.hash))) throw new Error('a conversa está aberta em outra aba — tento de novo depois');   // 5.64
        if (window.top.location.hash !== alvoHash) { window.top.location.hash = alvoHash; await new Promise(s => setTimeout(s, 4500)); }
        const ok = await (async () => { for (let i = 0; i < 40; i++) { if (window.top.location.hash === alvoHash && document.querySelector('.entries')) return true; await new Promise(s => setTimeout(s, 300)); } return false; })();
        if (!ok) throw new Error('não abriu o chat');
        if (alvo.fone) { const p = foneDoContato(); if (p && p !== alvo.fone) throw new Error('chat aberto não é o do cliente (' + p + ')'); }
        // 4.03 — prova de que é o chat certo: tela PARADA neste chat (telaPronta) + telefone do painel igual ao do cliente.
        // (4.02 exigia o link visível, mas conversa longa recolhe as mensagens antigas e o link some da tela — caso Estefania 16:07.)
        for (let i = 0; i < 10 && !telaPronta(alvo.hash); i++) await new Promise(s => setTimeout(s, 1500));
        if (!telaPronta(alvo.hash)) throw new Error('tela ainda não mostra este chat — tento de novo');
        const foneTela = foneDoContato();
        if (alvo.fone ? (!foneTela || foneTela !== alvo.fone) : (alvo.link && !document.querySelector('.entries').innerText.includes(alvo.link.slice(0, 35)))) throw new Error('não consegui confirmar que este é o chat do cliente — não mando');
        if (/Chat em atendimento com ([^\n]+)/.test(document.body.innerText) && protegido(alvo.hash)) {
          const quem = document.body.innerText.match(/Chat em atendimento com ([^\n]+)/)[1].trim();
          if (toque.tipo === 'manha') { reg('não saiu: chat atribuído a ' + quem + ' — follow-up da manhã fica com ' + quem, true); }   // 4.30: aparece no quadro
          estado('humano', 'com ' + quem + ' — robô não manda nada'); return;
        }
        const tagsChat = [...document.querySelectorAll('.MuiChip-label')].map(c => c.textContent.trim());
        if (tagsChat.some(t => /^01 D/i.test(t))) { estado('concluída', 'cliente fechou (01 D)'); return; }
        if (tagsChat.some(t => /^(01 I|01 k|02 I|03 A|03 B|05 |06 |07 )/i.test(t))) { estado('cancelada', 'tag de recusa'); return; }
        if (clienteRespondeu()) {
          if (toque.tipo === 'manha' && alvo.estado !== 'ativa') { reg('não saiu: o cliente falou por último — é atendimento (vigia)', true); const r5 = RG(); if (r5[alvo.hash]) { r5[alvo.hash].estado = 'alerta'; r5[alvo.hash].motivo = 'cliente escreveu e ficou sem resposta (visto no toque da manhã)'; gravaRG(r5); desenharRegua(); } return; }
          estado('pausada', 'cliente respondeu — atendimento humano'); return;
        }
        // 5.59 (Stefany 18:08, caso Douglas: combinou "amanhã à tarde", respondemos 18:00 e o /132 saiu 18:01 e de novo 18:04):
        //  (a) cliente falou em qualquer momento DEPOIS do link → a conversa virou atendimento: régua pausada (a sequência 'link' cuida);
        //  (b) lembrete combinado com o cliente → substitui os toques; (c) o toque já está na conversa → não repete; (d) falamos há < 50 min → espera.
        { const E = (document.querySelector('.entries') || {}).innerText || ''; const iL = alvo.link ? E.lastIndexOf(alvo.link.slice(0, 30)) : -1;
          const lis = [...document.querySelectorAll('.entries [class*="entries-li"]')].filter(e => (e.innerText || '').trim().length > 6);
          const iLi = alvo.link ? lis.map(e => (e.innerText || '').includes(alvo.link.slice(0, 30))).lastIndexOf(true) : -1;
          if (iLi >= 0 && lis.slice(iLi + 1).some(e => e.classList.contains('left'))) { reg('não saiu: o cliente já conversou depois do link (5.59)', true); estado('pausada', 'cliente respondeu depois do link — atendimento (5.59)'); return; }
          const esp0 = (GM_getValue('espera', {}) || {})[alvo.hash]; if (esp0 && esp0.tipo === 'lembrete' && (esp0.toques || []).some(q => !q.feito)) { reg('trocado pelo lembrete combinado com o cliente (5.59)', true); return; }
          const depoisL = iL >= 0 ? E.slice(iL) : E.slice(-4000);
          if (toque.tipo === '60' && /automaticamente cancelada|ser[áa] cancelada/i.test(depoisL)) { reg('já estava na conversa — não repeti (5.59)', true); return; }
          if (toque.tipo === '10' && /Conseguiu acessar|conseguiu abrir o link/i.test(depoisL)) { reg('já estava na conversa — não repeti (5.59)', true); return; }
          const ul = lis.slice(-1)[0]; const mh = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec((ul && ul.innerText) || '');
          if (mh && ul && !ul.classList.contains('left')) { let hh = +mh[1] % 12; if (/PM/i.test(mh[3])) hh += 12; const d = new Date(); d.setHours(hh, +mh[2], 0, 0); const dif = Date.now() - d.getTime();
            if (dif >= 0 && dif < 50 * M && toque.tipo !== 'manha') { const r6 = RG(); const q6 = r6[alvo.hash] && r6[alvo.hash].toques.find(k => k.tipo === toque.tipo); if (q6) { q6.prox = d.getTime() + 60 * M; gravaRG(r6); } return; } } }
        let enviado;
        if (toque.tipo === 'manha') enviado = await mensagemLivre(MSG_MANHA(nomeSeguro(alvo.nome)));
        else enviado = await respostaRapida(toque.tipo === '10' ? GM_getValue('atalho_conseguiu', '/bot2') : '/132', false, true);
        const atrasado = Date.now() - toque.quando > 5 * M;
        reg('enviado ' + hhmm(Date.now()) + (atrasado ? ' (atrasado)' : ''), true);
        { const r3 = RG(), x3 = r3[alvo.hash]; const q = x3 && x3.toques.find(k => k.tipo === toque.tipo); if (q) q.enviadoT = Date.now();
          if (toque.tipo === '10') { const q6 = x3.toques.find(k => k.tipo === '60'); if (q6 && !q6.feito) q6.quando = Date.now() + 60 * M; }
          gravaRG(r3); desenharRegua(); }
        if (toque.tipo === 'manha') estado('esgotada', 'três toques feitos — vai para a FILA-FOLLOWUP-WHATSAPP');
        log && log('Régua: ' + toque.tipo + ' enviado para ' + (alvo.nome || alvo.hash) + '.', 'ok');
      } catch (e) {
        const r2 = RG(), x = r2[alvo.hash]; const q = x.toques.find(k => k.tipo === toque.tipo);
        if (/JANELA_VENCIDA/.test(e.message)) {   // 4.26: não insiste — vai para a varredura
          x.toques.forEach(k => { if (!k.feito) { k.feito = Date.now(); k.st = 'pulado (janela de 24 h vencida → varredura)'; } });
          x.estado = 'esgotada'; x.motivo = 'janela de 24 h vencida — follow-up pelo outro número na varredura';
          x.hist.push(hhmm(Date.now()) + ' janela de 24 h vencida: toques parados, fica para a varredura');
          gravaRG(r2); desenharRegua(); log && log('Régua: ' + (alvo.nome || alvo.hash) + ' com a janela de 24 h vencida — não mandei, fica para a varredura.', 'erro');
          return;
        }
        q.tent = (q.tent || 0) + 1; q.prox = Date.now() + 2 * M; q.st = 'erro: ' + e.message;
        x.hist.push(hhmm(Date.now()) + ' ' + toque.tipo + ' ERRO (' + q.tent + 'ª): ' + e.message);
        if (q.tent >= 3) { x.estado = 'erro'; x.motivo = toque.tipo + ': ' + e.message; }
        gravaRG(r2); desenharRegua();
        log && log('Régua: erro no toque ' + toque.tipo + ': ' + e.message, 'erro');
      } finally { fupRodando = false; navSolta('fup'); }
    }
    setInterval(() => { if (faz('followup')) olharFollowups(); }, 60000);
    // 4.45 — confere a janela de 24 h de quem está no quadro (abre a conversa e lê a caixa de mensagem). Vencida → sai do
    // quadro (fica com a varredura). Roda sozinho 3 min depois de abrir e a cada 60 min, só com a tela livre. À mão: dinsReguaVencidas()
    let vencRodando = false;
    window.dinsReguaVencidas = async () => {
      if (vigiaTrava()) return 'trava do vigia';   // 4.54
      if (vencRodando) return 'já rodando'; vencRodando = true; let n = 0, v = 0;
      try {
        const agora = Date.now();
        const alvos = Object.values(RG()).filter(x => !['fechada', 'cancelada', 'esgotada', 'encerrado', 'concluída'].includes(x.estado) && !x.vencida && (agora - x.linkT < 48 * H || ['humano', 'alerta', 'erro'].includes(x.estado)) && !protegido(x.hash)).map(x => x.hash);
        for (const h of alvos) {
          { const ini = Date.now(); while (atendimentoPendente() && Date.now() - ini < 45 * 60000) await new Promise(r => setTimeout(r, 5000)); }   // 4.95: atendimento primeiro
          // 4.94 (12/11 09:00: conferência das vencidas da manhã segurava a tela e 10 clientes da fila ficavam sem leitura) — quem está esperando passa na frente
          try { const FL = JSON.parse(localStorage.getItem('dins_fila') || '[]').map(f => f.id); const RR = RG();
            const urg = FL.filter(id => id !== 'F20QOEL8YYLQN2S6SR47' && !protegido(id) && (!RR[id] || RR[id].reler || (+RR[id].listaT || 0) > (+RR[id].lidoT || 0))).slice(0, 2);
            for (const id of urg) { if (vigiaTrava() || localStorage.getItem('dins_ordem')) break; if (navPega('mapa')) { try { await mapearUm0(id); } catch (e) {} finally { navSolta('mapa'); } } }
          } catch (e) {}
          let livre = false;
          for (let k = 0; k < 60; k++) { if (!(fupRodando || posRodando || rodando || localStorage.getItem('dins_ordem') || vigiaTrava() || Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 45000) && navPega('vence')) { livre = true; break; } await new Promise(r => setTimeout(r, 3000)); }
          if (!livre) continue;   // 4.46: nunca passa por cima do vigia
          try {
            window.top.location.hash = '#/chats/' + h; await new Promise(r => setTimeout(r, 6000));
            for (let i = 0; i < 8 && !telaPronta(h); i++) await new Promise(r => setTimeout(r, 1500));
            if (!telaPronta(h)) continue;
            n++;
            if (janelaVencidaAgora()) { v++; const r = RG(), x = r[h]; if (x) { x.vencida = Date.now(); x.toques && x.toques.forEach(q => { if (!q.feito) { q.feito = Date.now(); q.st = 'pulado (janela de 24 h vencida → varredura)'; } }); if (!['humano'].includes(x.estado)) { x.estado = 'esgotada'; x.motivo = 'janela de 24 h vencida — fica para a varredura'; } x.hist.push(hhmm(Date.now()) + ' janela de 24 h vencida (conferido) — saiu do quadro'); gravaRG(r); } }
          try { const xr = RG()[h]; if (xr && xr.reler && !xr.vencida) await mapearUm0(h); } catch (e) {}   // 5.63: já está na conversa — aproveita e faz a releitura marcada
          } finally { navSolta('vence'); }
        }
        try { desenharRegua(); } catch (e) {}
        log && log('Quadro: conferi ' + n + ' conversas — ' + v + ' com a janela de 24 h vencida saíram do quadro.', 'ok');
        return { conferidas: n, vencidas: v };
      } finally { vencRodando = false; }
    };
    setTimeout(() => { if (faz('varredura')) window.dinsReguaVencidas(); }, 3 * 60000);
    setInterval(() => { if (!vencRodando && faz('varredura')) window.dinsReguaVencidas(); }, 60 * 60000);

    // ================================================================ 4.35 — PÓS-PAGAMENTO e CHAMADA DE VÍDEO (Stefany 11/11 09:53–10:00)
    // "Isso aí é padrão para todo mundo… programar para a gente fazer em escala, no robô, em procedimento."
    //  PAGO: depois da /22N ("foi aprovado e o valor será enviado…") → cliente respondeu que recebeu → /W40 na hora;
    //        não respondeu → /W40 30 min depois da /22N. 30 min depois da /W40 (respondendo ou não) → /102 e /103.
    //  VÍDEO: link de chamada de vídeo (nuvidio etc.) mandado → 10 min depois, se o cliente não falou nada,
    //        pergunta se conseguiu finalizar ou se precisa de ajuda.
    // Registro automático: quando a conversa aberta mostra a /22N ou o link de vídeo (mandado por qualquer um).
    // À mão: dinsPago('HASH', 'Nome') · dinsVideo('HASH', 'Nome') · ver: dinsPosVer() · tirar: dinsPosTirar('HASH').
    const POS = () => GM_getValue('pos_pago', {}) || {};
    const gravaPOS = o => GM_setValue('pos_pago', o);
    const SIG_22N = /valor ser[áa] enviado para a sua conta em at[ée] 48|pagamento (j[áa] )?foi liberado|valor (j[áa] )?(est[áa] )?dispon[íi]vel na sua conta/i   /* 5.92 (Stefany 10:02, Marcelo Qualibank): aviso de pago à mão também abre o pós-pagamento */, SIG_W40 = /profundamente gratos/i;
    const SIG_VIDEO = /nuvidio\.me\/|chamada de v[íi]deo pelo link|https?:\/\/\S*(videochamada|video-?call)\S*/i;
    window.dinsPago = (hash, nome, t) => { const o = POS(); const x = o[hash] || { hash, hist: [] }; if (x.t22) return 'já registrado';
      Object.assign(x, { nome: nome || x.nome || '', t22: t || Date.now(), w40: 0, p102: 0, estado: 'pago' }); x.hist.push(hhmm(Date.now()) + ' /22N registrada'); o[hash] = x; gravaPOS(o); return 'ok'; };
    window.dinsVideo = (hash, nome, t) => { const o = POS(); const x = o[hash] || { hash, hist: [] }; if (x.tVideo) return 'já registrado';
      Object.assign(x, { nome: nome || x.nome || '', tVideo: t || Date.now(), videoPerg: 0 }); x.hist.push(hhmm(Date.now()) + ' link de vídeo registrado'); o[hash] = x; gravaPOS(o); return 'ok'; };
    // 4.48 (Gerson 11/11): a /W40 que já estava no chat era marcada com a hora em que o robô VIU (11:07), não com a hora
    // em que saiu (10:43) → /102 /103 atrasaram. Lê a hora do próprio balão (hoje; se ficar no futuro, ontem).
    const horaDoBalao = txt => { const m = String(txt).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/gi); if (!m) return 0; const u = m[m.length - 1].match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); let h = +u[1]; const mi = +u[2]; if (u[3]) { if (/PM/i.test(u[3]) && h < 12) h += 12; if (/AM/i.test(u[3]) && h === 12) h = 0; } const d = new Date(); d.setHours(h, mi, 0, 0); let t = d.getTime(); if (t > Date.now() + 60000) t -= 86400000; return t; };
    const horaW40 = nossas => { const t = [...nossas].reverse().find(x => SIG_W40.test(x)); return (t && horaDoBalao(t)) || Date.now(); };
    window.dinsPosVer = () => Object.values(POS()).map(x => ({ nome: x.nome, hash: x.hash, estado: x.estado || '', extra: x.extra ? (x.extraOfereceu ? 'oferecido ' : 'sem valor ') + hhmm(x.extra) : (x.verExtra ? 'VER VALOR EXTRA desde ' + hhmm(x.verExtra) : ''), t22: hhmm(x.t22), w40: x.w40 ? hhmm(x.w40) : '', p102: x.p102 ? hhmm(x.p102) : '', video: x.tVideo ? hhmm(x.tVideo) + (x.videoPerg ? ' → perguntado ' + hhmm(x.videoPerg) : '') : '', erro: x.erro || '' }));
    window.dinsPosExtra = (hash, ofereceu) => { const o = POS(), x = o[hash]; if (!x) return false; x.extra = Date.now(); x.extraOfereceu = !!ofereceu; x.hist.push(hhmm(Date.now()) + (ofereceu ? ' valor extra oferecido — /W40 quando responder (ou 30 min)' : ' sem valor extra — /W40 agora')); gravaPOS(o);
      // 4.37 (Stefany 10:19): "todo cliente que fez proposta com a gente, recebeu e ainda sobrou margem → tag 01 J"
      if (!localStorage.getItem('dins_ordem')) try { localStorage.setItem('dins_ordem', JSON.stringify({ hash, acao: 'so_tag', tags: [ofereceu ? '01 J Tem Margem Rodar Disparo' : '01 k SEM Margem Nao Rodar Whats'], t: Date.now() })); } catch (e) {}   // 5.50: sem margem que sobrou → 01 D + 01 k
      return true; };
    window.dinsPosPendentes = () => Object.values(POS()).filter(x => x.verExtra && !x.extra && !x.w40).map(x => ({ hash: x.hash, nome: x.nome, desde: hhmm(x.verExtra) }));
    window.dinsReguaSemLinkComLink = () => Object.values(RG()).filter(x => x.semLink && /^01 A sem link/.test(x.motivo || '')).map(x => ({ hash: x.hash, nome: x.nome }));
    window.dinsReguaDetectar = () => { try { detectarLink(); return (RG()[(window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1]] || {}).semLink ? 'ainda sem link' : 'ok'; } catch (e) { return 'erro ' + e.message; } };
    window.dinsPosTirar = hash => { const o = POS(); delete o[hash]; gravaPOS(o); return true; };
    // detector: a conversa aberta tem a /22N ou o link de vídeo da nossa parte → registra (sem abrir nada)
    setInterval(() => {
      try {
        const hash = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1]; if (!hash || NAO_MEXER_POS.includes(hash)) return;
        const D = document.querySelector('.entries'); if (!D) return;
        // 4.37 (10:21): logo depois de trocar de chat a tela ainda mostra a conversa ANTERIOR — o Jairo foi registrado como
        // "pago" com a /22N do Gerson. Só registra com a tela PARADA neste chat e na 2ª leitura seguida do mesmo chat.
        if (!telaPronta(hash)) { detPos.h = ''; return; }
        if (detPos.h !== hash) { detPos.h = hash; return; }
        const nossas = [...D.querySelectorAll('[class*="entries-li"].right')].map(e => e.innerText);
        const o = POS(), x = o[hash];
        const i22 = nossas.findIndex(t => SIG_22N.test(t));
        if (i22 >= 0 && !(x && x.t22)) { const w = nossas.slice(i22).some(t => SIG_W40.test(t)); window.dinsPago(hash, nomeSeguro(nomeDoContato())); if (w) { const o2 = POS(); o2[hash].w40 = horaW40(nossas.slice(i22)); o2[hash].hist.push(hhmm(Date.now()) + ' /W40 já estava no chat (saiu ' + hhmm(o2[hash].w40) + ')'); gravaPOS(o2); } }
        if (nossas.some(t => SIG_VIDEO.test(t)) && !(x && x.tVideo)) window.dinsVideo(hash, nomeSeguro(nomeDoContato()));
      } catch (e) {}
    }, 20000);
    const NAO_MEXER_POS = ['F20QOEL8YYLQN2S6SR47'];
    const detPos = { h: '' };
    let posRodando = false;
    async function olharPos() {
      if (vigiaTrava()) return;   // 4.54
      if (posRodando || fupRodando || rodando || localStorage.getItem('dins_ordem')) return;
      if (Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 45000) return;
      // 4.55 (Waldirene 12:54: /W40 não saiu em 5 min): a varredura de janela vencida marcava "varrendo" o tempo todo e o pós-pagamento
      // nunca tinha vez. Cliente pago vem antes da varredura — a trava de navegação (navPega) já evita as duas ao mesmo tempo.
      const ta = document.querySelector('textarea'); if (ta && ta.value.trim()) return;
      if (!dentroDoHorario(Date.now())) return;
      const agora = Date.now(); let fila = [], filaT = {}; try { JSON.parse(localStorage.getItem('dins_fila') || '[]').forEach(f => { fila.push(f.id); filaT[f.id] = Date.parse(f.quando || '') || agora; }); } catch (e) {}
      // 4.38 (Stefany 10:24): "meia hora é só a condição para quando ele NÃO responde". Respondeu depois do passo → próximo passo já.
      const respDepois = (h, t) => fila.includes(h) && filaT[h] > t + 30000;
      let alvo = null, passo = '';
      for (const x of Object.values(POS())) {
        if (x.parado) continue;
        // 4.35b (Stefany 10:01): cliente CONFIRMOU que recebeu → ANTES da /W40 o vigia vê se ele tem mais valor para liberar
        // (Multicorban) e oferece ("esse valor te ajuda? podemos liberar na mesma conta?"). O robô espera a marca do vigia:
        // dinsPosExtra('HASH', true) = ofereceu → /W40 quando ele responder à oferta (ou 30 min) · dinsPosExtra('HASH', false) = não tem valor → /W40 já.
        // Sem a marca em 10 min, a /W40 sai assim mesmo (o cliente não fica sem ela).
        if (x.t22 && !x.w40 && fila.includes(x.hash) && agora - x.t22 > 60000 && !x.verExtra) { const o = POS(); o[x.hash].verExtra = agora; o[x.hash].hist.push(hhmm(agora) + ' cliente respondeu — vigia: ver valor extra antes da /W40'); gravaPOS(o); continue; }
        // sem valor extra → /W40 já; ofereceu valor extra → /W40 assim que ele responder à oferta (quer ou não quer), ou 30 min sem resposta
        const w40Quando = x.extra ? (x.extraOfereceu ? (respDepois(x.hash, x.extra) ? agora : x.extra + 30 * M) : 0) : (x.verExtra ? x.verExtra + 10 * M : x.t22 + 30 * M);
        if (x.t22 && !x.w40 && agora >= w40Quando) { alvo = x; passo = 'w40'; break; }
        // /102 e /103: assim que ele responder à /W40, ou 30 min sem resposta
        if (x.w40 && !x.p102 && (agora - x.w40 >= 30 * M || respDepois(x.hash, x.w40))) { alvo = x; passo = 'p102'; break; }
        if (x.tVideo && !x.videoPerg && !x.t22 && agora - x.tVideo >= 10 * M) { alvo = x; passo = 'video'; break; }
      }
      if (!alvo) return;
      const marca = mud => { const o = POS(), y = o[alvo.hash]; if (!y) return; Object.assign(y, mud); y.hist.push(hhmm(Date.now()) + ' ' + passo + ': ' + (mud.st || 'ok')); gravaPOS(o); };
      if (!navPega('pos')) return;
      posRodando = true;
      try {
        const alvoHash = '#/chats/' + alvo.hash;
        if (!(await esperaChatLivre(alvo.hash))) throw new Error('a conversa está aberta em outra aba — tento de novo depois');   // 5.64
        if (window.top.location.hash !== alvoHash) { window.top.location.hash = alvoHash; await new Promise(s => setTimeout(s, 4500)); }
        for (let i = 0; i < 10 && !telaPronta(alvo.hash); i++) await new Promise(s => setTimeout(s, 1500));
        if (!telaPronta(alvo.hash)) throw new Error('não abriu o chat');
        if (/Chat em atendimento com (?!Dinseguro)([^\n]+)/.test(document.body.innerText)) { marca({ parado: 1, st: 'chat com outro atendente — parei' }); return; }
        const nossas = [...document.querySelectorAll('.entries [class*="entries-li"].right')].map(e => e.innerText);
        // 4.37: só manda pós-pagamento se a /22N estiver MESMO neste chat (trava contra registro errado)
        if ((passo === 'w40' || passo === 'p102') && !nossas.some(t => SIG_22N.test(t))) { marca({ parado: 1, st: 'a /22N não está neste chat — registro errado, parei' }); return; }
        if (passo === 'w40') {
          if (nossas.some(t => SIG_W40.test(t))) { marca({ w40: horaW40(nossas), st: 'já estava no chat' }); return; }
          await respostaRapida('/W40', false, true); marca({ w40: Date.now(), st: 'enviada' });
        } else if (passo === 'p102') {
          // 4.57 (Gerson 11/11): /102 e /103 já mandadas à mão → não repetir
          if (nossas.some(t => /estrela guia/i.test(t)) && nossas.some(t => /inspirado a contribuir/i.test(t))) { marca({ p102: Date.now(), estado: 'concluída', st: '/102 e /103 já estavam no chat' }); return; }
          const pn = (nomeSeguro(alvo.nome) || '').split(' ')[0];
          await respostaRapida('/102', false, true, pn || ''); await new Promise(s => setTimeout(s, 2500));
          if (window.top.location.hash !== alvoHash) throw new Error('trocou de chat entre a /102 e a /103');
          await respostaRapida('/103', false, true); marca({ p102: Date.now(), estado: 'concluída', st: '/102 e /103 enviadas' });
        } else if (passo === 'video') {
          if (clienteRespondeu()) { marca({ videoPerg: Date.now(), st: 'cliente já falou — fica com o vigia' }); return; }
          const n = nomeSeguro(alvo.nome);
          await mensagemLivre((n ? n + ', c' : 'C') + 'onseguiu finalizar a chamada de vídeo pelo link? 😊 Se aparecer qualquer dificuldade (câmera, microfone ou para entrar), me fala aqui que eu te ajudo na hora.');
          marca({ videoPerg: Date.now(), st: 'perguntado' });
        }
        log && log('Pós-pagamento/vídeo: ' + passo + ' — ' + (alvo.nome || alvo.hash), 'ok');
      } catch (e) {
        if (/JANELA_VENCIDA/.test(e.message)) marca({ parado: 1, st: 'janela de 24 h vencida — parei' });
        else { const o = POS(), y = o[alvo.hash]; if (y) { y.tent = (y.tent || 0) + 1; y.erro = e.message; if (y.tent >= 3) y.parado = 1; y.hist.push(hhmm(Date.now()) + ' ' + passo + ' erro: ' + e.message); gravaPOS(o); } }
      } finally { posRodando = false; navSolta('pos'); }
    }
    setInterval(() => { if (faz('followup')) olharPos(); }, 45000);

    // 4.21 — DESBLOQUEIO / ANUÊNCIA SAEM SOZINHOS (Stefany 19:22 "o follow-up certo sairia sozinho" / 19:49 "finaliza tudo").
    // Esteira diz "falta desbloquear" (215 ASSINATURA DIGITAL OK / AVERBE JA) → linha pessoal + /dsg25a + /dsg25.
    // Esteira diz "falta anuência" → linha pessoal + /anuencia + /anuencia2. Uma vez por fase (faseFeita). Mesmas travas dos toques:
    // horário 8h–21h, vigia livre, chat certo (tela parada + telefone), sem humano, cliente não falou por último, trava entre abas.
    const LINHA_FASE = {
      'falta desbloquear': n => `${n ? n + ', b' : 'B'}oa notícia! 🎉 O banco aprovou a sua proposta. Agora falta só um passo: desbloquear o seu benefício para empréstimo no Meu INSS. Te mando o passo a passo aqui embaixo 👇`,
      'falta anuência': n => `${n ? n + ', o' : 'O'} desbloqueio deu certo! 🙌 Agora falta só confirmar a contratação no Meu INSS (a anuência). Te mando o passo a passo aqui embaixo 👇`
    };
    const ATALHOS_FASE = { 'falta desbloquear': ['/dsg25a', '/dsg25'], 'falta anuência': ['/anuencia', '/anuencia2'] };
    // 4.51 — libera "Chat em atendimento com Fulano": ⋮ → "Liberar chat bloqueado por …". Procura em todos os documentos (o menu abre em overlay).
    async function liberarChat() {
      const docs = () => [window.top.document, document, ...[...window.top.document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument; } catch (e) { return null; } }).filter(Boolean)];
      const travado = () => docs().some(d => { const t = d.querySelector('textarea'); return t && /atendimento com (?!Dinseguro)/i.test(t.placeholder || ''); });
      for (let tent = 0; tent < 3 && travado(); tent++) {
        let dots = null; for (const d of docs()) { dots = [...d.querySelectorAll('mat-icon, i, span, button')].find(e => (e.innerText || '').trim() === 'more_vert' && e.getBoundingClientRect().top < 200 && e.getBoundingClientRect().left > 600); if (dots) break; }
        if (!dots) return false;
        (dots.closest('button') || dots).click();
        let it = null; for (let i = 0; i < 10 && !it; i++) { await new Promise(s => setTimeout(s, 300)); for (const d of docs()) { it = [...d.querySelectorAll('button, [role=menuitem], .mat-menu-item, li, div, span')].find(e => /^\s*\S*\s*Liberar chat bloqueado/.test(e.innerText || '') && (e.innerText || '').length < 80); if (it) break; } }
        if (!it) { try { window.top.document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch (e) {} return false; }
        (it.closest('button, [role=menuitem], .mat-menu-item') || it).click();
        for (let i = 0; i < 10 && travado(); i++) await new Promise(s => setTimeout(s, 500));
      }
      return !travado();
    }
    window.dinsLiberarChat = liberarChat;
    // 4.53 (Stefany 12:40, caso Waldirene): depois da anuência mandada, o cliente manda print (contrato "ativo" no Meu INSS) ou diz
    // que fez → a anuência está FEITA → mandar /pos_anuencia (prazo do INSS atualizar o banco). Uma vez só. Só no chat aberto, vigia livre.
    const FIZ_ANU = /(?<![\wÀ-ÿ])(fiz|feito|feita|confirmei|confirmado|consegui|pronto|conclu[ií]|autorizei|ativo|deu certo)(?![\wÀ-ÿ])|✅|👍/i;
    let posAnuRodando = false;
    setInterval(async () => {
      if (!faz('followup')) return;   // 5.64 papel da aba
      if (posAnuRodando || rodando || fupRodando || localStorage.getItem('dins_ordem') || vigiaTrava()) return;
      if (Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 45000) return;
      try {
        const h = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1]; if (!h || h === 'F20QOEL8YYLQN2S6SR47' || !telaPronta(h)) return;
        const r = RG(), x = r[h]; if (!x || x.faseFeita !== 'falta anuência' || x.posAnu) return;
        if (!dentroDoHorario(Date.now()) || janelaVencidaAgora()) return;
        const ta = document.querySelector('textarea'); if (!ta || ta.value.trim() || /atendimento com (?!Dinseguro)/i.test(ta.placeholder || '')) return;
        const ents = [...document.querySelectorAll('.entries [class*="entries-li"]')];
        const iAnu = ents.map(e => e.innerText).findLastIndex(t => /MEU INSS e fa[çc]a a confirma[çc][ãa]o|anu[eê]ncia/i.test(t));
        if (iAnu < 0) return;
        const depois = ents.slice(iAnu + 1);
        if (depois.some(e => e.classList.contains('right') && /prazo para o INSS atualizar/i.test(e.innerText))) { x.posAnu = Date.now(); x.hist.push(hhmm(Date.now()) + ' pós-anuência já estava no chat'); gravaRG(r); return; }
        const cli = depois.filter(e => e.classList.contains('left'));
        const fez = cli.some(e => e.querySelector('img') || /\.(jpe?g|png)\b|__image__/i.test(e.innerText) || FIZ_ANU.test(e.innerText));
        if (!fez) return;
        posAnuRodando = true;
        await respostaRapida('/pos_anuencia', false, true);
        const r2 = RG(); if (r2[h]) { r2[h].posAnu = Date.now(); r2[h].hist.push(hhmm(Date.now()) + ' /pos_anuencia (cliente mandou print/disse que fez a anuência)'); gravaRG(r2); desenharRegua(); }
      } catch (e) {} finally { posAnuRodando = false; }
    }, 30000);
    window.dinsPosAnuFeita = h => { const r = RG(); if (!r[h]) return false; r[h].posAnu = Date.now(); gravaRG(r); return true; };
    let faseRodando = false;
    async function olharFases() {
      if (vigiaTrava()) return;   // 4.54
      if (faseRodando || fupRodando || rodando || localStorage.getItem('dins_ordem')) return;   // 4.55: fase da esteira também vem antes da varredura
      if (Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 45000) return;
      const ta = document.querySelector('textarea'); if (ta && ta.value.trim()) return;
      const agora = Date.now(); if (!dentroDoHorario(agora)) return;
      const r = RG(); let alvo = null, fe = null;
      for (const x of Object.values(r)) {
        // 4.51 (Stefany 12:32, caso Waldirene): a fase da esteira (desbloqueio/anuência) é mensagem padrão — sai mesmo em chat
        // protegido ou "com humano". Só o chat de teste fica de fora.
        if (!x.link || ['cancelada', 'fechada', 'concluída'].includes(x.estado) || x.hash === 'F20QOEL8YYLQN2S6SR47') continue;
        const f = faseEsteira(x); if (!f || !ATALHOS_FASE[f.fase] || x.faseFeita === f.fase) continue;
        if ((x.faseTent || 0) >= 3) continue;
        alvo = x; fe = f; break;
      }
      if (!alvo) return;
      const chave = alvo.hash + '|fase|' + fe.fase; const L = GM_getValue('fup_lock', {}) || {};
      if (L[chave] && Date.now() - L[chave].t < 90000 && L[chave].aba !== ABA_ID) return;
      L[chave] = { aba: ABA_ID, t: Date.now() }; GM_setValue('fup_lock', L);
      await new Promise(s => setTimeout(s, 1500 + Math.random() * 1500));
      const L2 = GM_getValue('fup_lock', {}) || {}; if (!L2[chave] || L2[chave].aba !== ABA_ID) return;
      if (!navPega('fase')) return;
      faseRodando = true;
      const marca = (mud, hist) => { const r2 = RG(), x = r2[alvo.hash]; if (!x) return; Object.assign(x, mud); x.hist.push(hhmm(Date.now()) + ' ' + hist); gravaRG(r2); desenharRegua(); };
      try {
        const alvoHash = '#/chats/' + alvo.hash;
        if (!(await esperaChatLivre(alvo.hash))) throw new Error('a conversa está aberta em outra aba — tento de novo depois');   // 5.64
        if (window.top.location.hash !== alvoHash) { window.top.location.hash = alvoHash; await new Promise(s => setTimeout(s, 4500)); }
        for (let i = 0; i < 10 && !telaPronta(alvo.hash); i++) await new Promise(s => setTimeout(s, 1500));
        if (!telaPronta(alvo.hash)) throw new Error('tela não parou no chat');
        const foneTela = foneDoContato(); if (alvo.fone && foneTela !== alvo.fone) throw new Error('telefone do chat não confere');
        // 4.51: chat travado com Rômulo/Stefany → libera (Stefany 12:30: "você já tem a liberdade de liberar o chat") e segue.
        if (/Chat em atendimento com (?!Dinseguro)([^\n]+)/.test(window.top.document.body.innerText + '\n' + document.body.innerText)) {
          const ok = await liberarChat();
          if (!ok) { marca({ faseTent: (alvo.faseTent || 0) + 1 }, 'fase ' + fe.fase + ': chat travado com humano e não consegui liberar — vigia'); return; }
          marca({}, 'fase ' + fe.fase + ': chat liberado para mandar');
        }
        if (clienteRespondeu()) { marca({ faseTent: 3 }, 'fase ' + fe.fase + ': cliente falou por último — fica para o vigia'); return; }
        const ent = (document.querySelector('.entries') || {}).innerText || '';
        if (fe.fase === 'falta desbloquear' && /passo a passo para realizar o desbloqueio|desbloqueio do seu benef/i.test(ent)) { marca({ faseFeita: fe.fase }, 'desbloqueio já tinha sido mandado'); return; }
        if (fe.fase === 'falta anuência' && /anu[eê]ncia/i.test(ent.slice(-3000))) { marca({ faseFeita: fe.fase }, 'anuência já tinha sido mandada'); return; }
        const nome = nomeSeguro(alvo.nome);
        await mensagemLivre(LINHA_FASE[fe.fase](nome));
        await new Promise(s => setTimeout(s, 2500));
        for (const at of ATALHOS_FASE[fe.fase]) { await respostaRapida(at, false, true); await new Promise(s => setTimeout(s, 3000)); }
        marca({ faseFeita: fe.fase }, fe.fase + ': linha pessoal + ' + ATALHOS_FASE[fe.fase].join(' + ') + ' enviados');
        log && log('Esteira: ' + fe.fase + ' mandado para ' + (alvo.nome || alvo.hash) + '.', 'ok');
      } catch (e) { marca({ faseTent: (alvo.faseTent || 0) + 1 }, 'fase ' + fe.fase + ' ERRO: ' + e.message); }
      finally { faseRodando = false; navSolta('fase'); }
    }
    setInterval(() => { if (faz('followup')) olharFases(); }, 90000);

    // ================================================================ 4.47 — FOLLOW-UPS SEM LINK E LEMBRETES (Stefany 11/11 11:36, autorizado)
    //  1) Pedimos o CPF e o cliente sumiu → toque 1 h depois e outro às 08:00.
    //  2) Mandamos simulação e o cliente não respondeu 1/2 → 1 h depois e 08:00.
    //  3) Cliente disse "só amanhã / mais tarde / depois eu vejo" → lembrete na hora que ele falou, ou 09:00 do dia seguinte,
    //     NO LUGAR da sequência normal (vale também para quem tem link).
    //  5) Pedimos documento/selfie e o cliente não mandou → lembrete 1 h depois.
    //  Só com a janela de 24 h aberta, 8h–21h, a última mensagem tem que continuar sendo NOSSA (cliente não respondeu), e
    //  nunca em chat da lista de não interferir. Ver: dinsEsperaVer() · tirar: dinsEsperaTirar('HASH').
    const ESP = () => GM_getValue('espera', {}) || {};
    const gravaESP = o => GM_setValue('espera', o);
    const proxHora = (h, m = 0, diaSeg = false) => { const d = new Date(); if (diaSeg) d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); if (!diaSeg && d.getTime() < Date.now()) d.setDate(d.getDate() + 1); return d.getTime(); };
    const SIG_CPF = /(informe|mande|envie|me manda|digite)[^\n]{0,60}\bCPF\b|n[úu]mero do seu CPF/i;
    const SIG_SIM = /1️⃣\s*Sim|Escolha uma op[çc][ãa]o/i;
    const SIG_DOC = /(foto|imagem)[^\n]{0,40}(documento|RG|CNH)|documento de identifica|envie (o|seu) (RG|documento)|\/CLT1/i;
    const DEPOIS = /(?<![\wÀ-ÿ])(s[óo] amanh[ãa]|amanh[ãa]|mais tarde|depois eu (vejo|fa[çc]o|mando|olho)|vou ver depois|agora n[ãa]o (posso|d[áa])|t[ôo] no trabalho|estou trabalhando|[àa] noite|de noite|mais tardinha)(?![\wÀ-ÿ])/i;
    function horaDita(txt) {
      const t = String(txt || '').toLowerCase();
      const m = t.match(/(?:[àa]s?|depois das?|l[áa] pelas?)\s*(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|hs|horas)?/) || t.match(/\b(\d{1,2})\s*(?:h|hs|horas)\b/);
      const amanha = /amanh[ãa]/.test(t);
      if (m) { const h = +m[1], mi = +(m[2] || 0); if (h >= 7 && h <= 20) return proxHora(h, mi, amanha); }
      if (/[àa] noite|de noite/.test(t) && !amanha) return proxHora(19, 0);
      if (/(pela|[àa]|de) tarde|tardinha/.test(t)) return proxHora(14, 0, amanha);   // 5.54: "amanhã pela tarde" → 14:00
      if (/(pela|de) manh[ãa]/.test(t) && amanha) return proxHora(9, 0, true);
      if (/mais tarde|mais tardinha|depois/.test(t) && !amanha) { const t2 = Date.now() + 3 * H; return dentroDoHorario(t2) ? t2 : proxHora(9, 0, true); }
      return proxHora(9, 0, true);
    }
    window.dinsEsperaVer = () => Object.values(ESP()).map(x => ({ nome: x.nome, hash: x.hash, tipo: x.tipo, toques: (x.toques || []).map(q => q.q + ' ' + hhmm(q.quando) + (q.feito ? ' ✓ ' + (q.st || '') : '')).join(' · '), erro: x.erro || '' }));
    // 4.61 (Stefany 13:42, caso Valdecir: pedido de CPF 11:14, 12:16 e 13:39 — a própria cobrança registrava uma espera nova).
    // Regra: pedido → 1 toque em 1 h → 1 toque no outro dia às 08:00 → acabou. Cada chat tem UMA sequência por tipo a cada 36 h,
    // e mensagem nossa de cobrança/follow-up nunca abre espera nova.
    const ESP_H = () => GM_getValue('espera_hist', {}) || {};
    const marcaHistESP = (h, tipo) => { const o = ESP_H(); o[h] = Object.assign(o[h] || {}, { [tipo || 'cpf']: Date.now() }); GM_setValue('espera_hist', o); };
    const SIG_NOSSO_FUP = /Ficou faltando s[óo] o n[úu]mero do seu CPF|a sua consulta ficou pendente s[óo] do CPF|Passando para (lembrar|falar d)|Conseguiu ver a simula[çc][ãa]o|A sua simula[çc][ãa]o continua dispon[íi]vel|Conforme combinamos, estou passando|Conseguiu tirar a foto do documento|Estou retomando o seu atendimento/i;
    window.dinsEsperaTirar = h => { const o = ESP(); if (o[h]) marcaHistESP(h, o[h].tipo); delete o[h]; gravaESP(o); return true; };
    // registra a espera lendo a conversa ABERTA (tela parada): quem falou por último e o quê
    function registrarEspera(hash) {
      if (!hash || protegido(hash) || !telaPronta(hash)) return;
      if (janelaVencidaAgora()) { const o = ESP(); if (o[hash]) { delete o[hash]; gravaESP(o); } return; }
      let L = null; try { L = lados(); } catch (e) {} if (!L || !L.ult) return;
      const o = ESP(); const ant = o[hash]; const agora = Date.now(); const nome = nomeSeguro(nomeDoContato());
      if (L.ult.lado === 'cli') {
        // 3) cliente adiou → lembrete (substitui a sequência normal)
        if (DEPOIS.test(L.ult.txt || '') && !(ant && ant.tipo === 'lembrete' && ant.base === (L.ult.txt || '').slice(0, 60))) {
          o[hash] = { hash, nome, tipo: 'lembrete', base: (L.ult.txt || '').slice(0, 60), t0: agora, toques: [{ q: 'lembrete', quando: horaDita(L.ult.txt), feito: 0 }] }; gravaESP(o);
          try { const r = RG(); if (r[hash] && r[hash].toques) { r[hash].toques.forEach(q => { if (!q.feito) { q.feito = agora; q.st = 'trocado pelo lembrete que o cliente pediu'; } }); r[hash].hist.push(hhmm(agora) + ' cliente pediu para depois → lembrete ' + hhmm(o[hash].toques[0].quando)); gravaRG(r); } } catch (e) {}
        } else if (ant && ant.tipo !== 'lembrete') { delete o[hash]; gravaESP(o); }   // respondeu → acabou a espera
        return;
      }
      if (ant) return;                                   // já tem espera registrada
      if (L.ult.bot) return;                             // bot no fluxo: ele cuida
      const raw = L.ult.raw || L.ult.txt || '';
      if (SIG_NOSSO_FUP.test(raw)) return;               // 4.61: cobrança/follow-up nosso não abre espera nova
      const r = RG(); const temLink = r[hash] && r[hash].link && !r[hash].semLink;
      let tipo = '';
      if (SIG_DOC.test(raw)) tipo = 'doc';
      else if (!temLink && SIG_SIM.test(raw)) tipo = 'simulacao';
      else if (!temLink && SIG_CPF.test(raw)) tipo = 'cpf';
      if (!tipo) return;
      { const hh = (ESP_H()[hash] || {})[tipo]; if (hh && agora - hh < 36 * H) return; }   // 4.61: já teve a sequência deste tipo
      const t0 = L.ult.t && L.ult.t <= agora ? L.ult.t : agora;
      const toques = novaSequencia(tipo, t0, (L.ultCli && L.ultCli.t) || 0);
      o[hash] = { hash, nome, tipo, t0, toques }; gravaESP(o);
      // 4.49 (Stefany 11:52, cliente 62 8153-5140): pedimos o CPF à mão e o chat ficou SEM tag. Padrão: mensagem pessoal + 01 C (sem /n23 — Stefany 12:01).
      // Pedido de CPF registrado e nenhuma tag de situação (01/02/03/07) → robô só põe a 01 C.
      if (tipo === 'cpf') try {
        const TD = window.top.document.body.innerText; const ia = TD.search(/\nTags\s*\n?\s*\d/); const ib = ia >= 0 ? TD.indexOf('Variáveis', ia) : -1;
        const bloco = ia >= 0 ? TD.slice(ia, ib > ia ? ib : ia + 1500) : null;
        const temSit = bloco !== null && /\n\s*0[1-7]\s?[A-Za-z]?(\s|-)/.test(bloco);
        if (bloco !== null && !temSit && !localStorage.getItem('dins_ordem')) {
          // 4.50 (Stefany 12:01): a mensagem pessoal pedindo o CPF já basta — NÃO manda /n23 por cima. Só põe a 01 C.
          localStorage.setItem('dins_ordem', JSON.stringify({ hash, acao: 'so_tag', tags: ['01 C - Inss Nao Informou CPF - SEM 87 e 88'], msgFeita: 1, linhaFeita: 1, t: Date.now(), quem: 'espera' }));
          o[hash].tag01C = Date.now(); gravaESP(o);
        }
      } catch (e) {}
    }
    setInterval(() => { try { const h = (window.top.location.hash.match(/#\/chats\/([A-Z0-9]+)/i) || [])[1]; registrarEspera(h); } catch (e) {} }, 20000);
    // 5.38 FASE 2 (Stefany 12/11 15:53: "só 1 follow-up"; em todo o dia só 2 esperas foram registradas porque o registro dependia
    // da conversa ABERTA na tela). Agora a espera do pedido de CPF nasce também pela RÉGUA (motivo "pedimos o CPF", última mensagem nossa).
    // Cadência do CPF (plano aprovado 16:34): 1 h · 3 h · 08:00 do dia seguinte · 08:00 do terceiro dia (este só com a janela aberta).
    setInterval(() => { try {
      if (!faz('followup')) return;   // 5.64 papel da aba
      const o = ESP(); const RGx = RG(); const agora = Date.now(); let m = false;
      for (const k in RGx) { const x = RGx[k]; if (!x || !x.hash || protegido(k) || x.comQuem || x.vencida) continue;
        if (o[k] && !(o[k].tipo === 'lembrete' || /\b\d{1,2}\s*(h|hs|horas)\b|[àa]s\s*\d{1,2}/i.test(x.ultCliTxt || '') || DEPOIS.test(x.ultCliTxt || ''))) continue;   // 5.60: espera existente só é trocada por lembrete com hora
        const ehCpf = /pedimos o CPF/i.test(x.motivo || ''), ehDuv = /aguardando o cliente/i.test(x.motivo || '');   // 5.47: dúvida respondida também
        const HORA_DITA = /\b\d{1,2}\s*(h|hs|horas)\b|[àa]s\s*\d{1,2}(:\d{2})?\b/i;   // 5.60: "às 15h" depois do nosso pedido de horário
        if (o[k] && !(DEPOIS.test(x.ultCliTxt || '') || /\b\d{1,2}\s*(h|hs|horas)\b|[àa]s\s*\d{1,2}/i.test(x.ultCliTxt || ''))) continue;
        const lembrar = (DEPOIS.test(x.ultCliTxt || '') || (HORA_DITA.test(x.ultCliTxt || '') && (GM_getValue('depois_resp', {}) || {})[k])) && ['acompanhando', 'alerta', 'pausada', 'esgotada', 'ativa'].includes(x.estado);   // 5.56 / 5.59: também 'ativa'
        const linkParado = x.link && !x.semLink && ['pausada', 'esgotada'].includes(x.estado) && x.ultLado === 'nos';   // 5.57
        if (!lembrar && !linkParado && (x.estado !== 'acompanhando' || !(ehCpf || ehDuv) || x.ultLado !== 'nos' || (ehCpf && (x.temCpf || x.cpfSem)))) continue;
        if (lembrar) {   // 5.56 (caso Douglas "te retorno amanhã pela tarde"): lembrete na hora que ele disse, criado pela régua
          if (o[k] && o[k].tipo === 'lembrete' && o[k].base === String(x.ultCliTxt || '').slice(0, 60)) continue;
          const qd = horaDita(x.ultCliTxt); if (qd && qd > agora && (!(+x.ultCliT) || qd < x.ultCliT + 23.5 * H)) {
            o[k] = { hash: k, nome: nomeSeguro(x.nomeReal || x.nome), tipo: 'lembrete', base: String(x.ultCliTxt || '').slice(0, 60), t0: agora, toques: [{ q: 'lembrete', quando: qd, feito: 0 }], origem: 'régua 5.56' }; m = true;
            try { (x.hist = x.hist || []).push(hhmm(agora) + ' 5.56: cliente disse "' + String(x.ultCliTxt).slice(0, 40) + '" → lembrete ' + new Date(qd).toLocaleString('pt-BR').slice(0, 17)); } catch (e) {} }
          continue; }
        // 5.57 (Stefany 18:00, caso Alexandre): com link, cliente conversou e parou (pausada/esgotada, última nossa) → sequência completa 'link'
        const ehLink = x.link && !x.semLink;
        if (ehLink && !(['pausada', 'esgotada'].includes(x.estado) && x.ultLado === 'nos')) continue;
        if (/n[ãa]o (tenho|quero) interesse|n[ãa]o quero|n[ãa]o preciso|pare de|parar de mandar|sair da lista|desist|n[ãa]o me (mande|chame)|bloque/i.test(x.ultCliTxt || '')) continue;   // recusa: não insiste
        if (/n[ãa]o sou|aut[ôo]nomo|\bclt\b|carteira assinada|servidor|for[çc]as armadas|bolsa fam/i.test(x.ultCliTxt || '')) { if (x.estado !== 'encerrado') { x.estado = 'encerrado'; x.motivo = 'não é do INSS (disse ao bot: ' + String(x.ultCliTxt).slice(0, 25) + ')'; (x.hist = x.hist || []).push(hhmm(agora) + ' 5.81: ' + x.motivo); m = true; } continue; }   // 5.52 / 5.81: sai do azul
        if (/^\s*(bolt\s*)?encerrar( agora)?\s*$/i.test(x.ultCliTxt || '')) { if (x.estado !== 'encerrado') { x.estado = 'encerrado'; x.motivo = 'cliente encerrou no bot'; (x.hist = x.hist || []).push(hhmm(agora) + ' 5.81: cliente clicou Encerrar no bot — sem follow-up'); m = true; } continue; }
        const t0 = +x.ultT || 0; if (!t0 || agora - t0 > 23 * H) continue;
        const tipoR = ehLink ? 'link' : ehCpf ? 'cpf' : 'duvida';
        { const hh = (ESP_H()[k] || {})[tipoR]; if (hh && agora - hh < 36 * H) continue; }
        if (tipoR === 'duvida' && localStorage.getItem('dins_f3_teste') !== '0') { logF2({ h: k, nome: x.nome || '', o: 'espera DÚVIDA pela régua (última nossa ' + hhmm(t0) + ')' }); continue; }
        if (localStorage.getItem('dins_f2_teste') !== '0') { logF2({ h: k, nome: x.nome || '', o: 'espera CPF pela régua (pedido ' + hhmm(t0) + ')' }); continue; }
        o[k] = { hash: k, nome: nomeSeguro(x.nomeReal || x.nome), tipo: tipoR, t0, temCpf: !!x.temCpf, toques: novaSequencia(tipoR, t0, +x.ultCliT || 0), origem: 'régua 5.47' }; m = true;
        try { (x.hist = x.hist || []).push(hhmm(agora) + ' 5.47: espera de ' + (tipoR === 'cpf' ? 'CPF' : 'dúvida') + ' registrada pela régua (nossa última ' + hhmm(t0) + ')'); } catch (e) {}
      }
      if (m) { gravaESP(o); gravaRG(RGx); }
    } catch (e) {} }, 120000);
    setTimeout(() => { try { const o = ESP(); const RGx = RG(); let m = false;
      for (const k in o) { const x = o[k]; if (!x || !['cpf', 'simulacao'].includes(x.tipo)) continue;
        (x.toques || []).forEach(q => { if (!q.feito && ['3h', '08h2'].includes(q.q)) { q.feito = Date.now(); q.st = 'tirado (5.47: Stefany 17:22)'; m = true; } });
        if (!(x.toques || []).some(q => q.q === 'janela')) { const qj = horaJanela(+((RGx[k] || {}).ultCliT) || 0); if (qj && qj > Date.now()) { x.toques.push({ q: 'janela', quando: qj, feito: 0 }); m = true; } } }
      if (m) gravaESP(o); } catch (e) {} }, 15000);
    setTimeout(() => { try { if (!faz('varredura')) return; const r = RG(); let m = 0;   // 5.55 (caso Ester): 'resolvido pelo robô' depois da mensagem do vigia = releitura para entrar na sequência de follow-up
      for (const k in r) { const x = r[k]; if (x && x.estado === 'acompanhando' && /resolvido pelo robô/.test(x.motivo || '') && !x.reler) { x.reler = 1; m++; } }
      if (m) gravaRG(r); } catch (e) {} }, 9000);
    setTimeout(() => { try { if (GM_getValue('mig552', '')) return; const o = ESP(), hst = ESP_H(); let m = 0;   // 5.52: desfaz o bloqueio de 36 h gravado hoje pela trava 4.70 (sessão fechada pelo bot)
      for (const k in hst) { if (o[k]) continue; ['cpf', 'duvida'].forEach(t => { if (hst[k][t] && Date.now() - hst[k][t] < 12 * H) { delete hst[k][t]; m++; } }); }
      GM_setValue('espera_hist', hst); GM_setValue('mig552', String(Date.now())); } catch (e) {} }, 12000);
    setTimeout(() => { try { if (GM_getValue('mig581', '')) return; const o = ESP(), hst = ESP_H(), r = RG(); let n = 0;
      for (const k in r) { const x = r[k]; if (!x || o[k] || !hst[k] || x.estado !== 'acompanhando' || x.ultLado !== 'nos') continue; ['cpf', 'duvida'].forEach(t => { if (hst[k][t] && Date.now() - hst[k][t] < 36 * H) { delete hst[k][t]; n++; } }); }
      GM_setValue('espera_hist', hst); GM_setValue('mig581', String(Date.now() + '|' + n)); } catch (e) {} }, 14000);
    function logF2(e) { try { const LG = JSON.parse(localStorage.getItem('dins_f2_log') || '[]'); if (LG.some(l => l.h === e.h && l.o === e.o)) return; e.t = Date.now(); LG.push(e); localStorage.setItem('dins_f2_log', JSON.stringify(LG.slice(-40))); } catch (_) {} }
    // 5.38 FASE 2 — RETOMADA COM LINK (caso Alexandre: link 10:28, respondeu "bom dia" 10:55, respondemos 11:57 e ninguém mais falou por 3 h):
    // régua 'pausada' (cliente já conversou depois do link), última mensagem NOSSA há 2–20 h → um toque de retomada (uma vez a cada 20 h).
    setInterval(() => { try { if (!faz('varredura')) return;   // 5.49: azul sem hora do cliente (nunca lido) → reler
      const RGx = RG(); let m = false, n = 0;
      for (const k in RGx) { const x = RGx[k]; if (!x || n >= 5 || !['acompanhando', 'pausada', 'esgotada'].includes(x.estado) || x.reler || protegido(k)) continue;
        if ((!(+x.ultCliT || 0) || Date.now() - (+x.lidoT || 0) > 2 * 3600000) && Date.now() - (+x.lidoT || 0) > 30 * 60000 && Date.now() - (+x.criadoT || +x.linkT || 0) < 48 * 3600000) { x.reler = 1; m = true; n++; } }   // 5.53: também quem foi lido há mais de 2 h
      if (m) gravaRG(RGx); } catch (e) {} }, 5 * 60000);
    setInterval(() => { try {
      if (!faz('followup')) return;   // 5.64 papel da aba
      if (localStorage.getItem('dins_ordem') || vigiaTrava()) return; const agora = Date.now(); if (!dentroDoHorario(agora)) return;
      const RGx = RG(); let mR = false;
      for (const k in RGx) { const x = RGx[k]; if (!x || x.estado !== 'pausada' || !x.link || protegido(k) || x.comQuem || x.vencida) continue;
        if (agora - (+x.lidoT || 0) > 2 * H && agora - (+x.linkT || 0) < 24 * H && !x.reler) { x.reler = 1; mR = true; }   // relê para saber quem falou por último
        const t = +x.ultT || 0; if (x.ultLado !== 'nos' || !t || agora - t < 2 * H || agora - t > 20 * H || (+x.lidoT || 0) < t) continue;
        if (x.retomarT && agora - x.retomarT < 20 * H) continue;
        if ((ESP()[k] || {}).tipo === 'link') continue;   // 5.57: a sequência 'link' cuida
        try { const fe = faseEsteira(x); if (fe && !['não assinou', 'andamento'].includes(fe.fase)) continue; } catch (e) {}
        const nm = nomeCli(x);
        const texto = 'Oi' + (nm ? ', ' + nm : '') + '! 😊 Passando para saber se você conseguiu ver a sua proposta. Ela continua disponível no link que te mandei acima. Se tiver qualquer dúvida sobre o valor, as parcelas ou como assinar, é só me chamar aqui que eu te ajudo. 🤝';
        if (localStorage.getItem('dins_f2_teste') !== '0') { logF2({ h: k, nome: x.nome || '', o: 'retomada com link (última nossa ' + hhmm(t) + ')' }); continue; }
        x.retomarT = agora; (x.hist = x.hist || []).push(hhmm(agora) + ' 5.38: retomada com link (última mensagem nossa ' + hhmm(t) + ')'); gravaRG(RGx);
        const dd = String(new Date().getDate()).padStart(2, '0') + '/' + String(new Date().getMonth() + 1).padStart(2, '0');
        localStorage.setItem('dins_ordem', JSON.stringify({ hash: k, acao: 'fase_msg', quem: 'robo', t: agora, texto, soSeNossaUltima: 1, nota: dd + ' ' + hhmm(agora) + ' [robô 5.38] cliente parou depois de conversar sobre a proposta (última mensagem nossa ' + hhmm(t) + ') → toque de retomada.' }));
        return;
      }
      if (mR) gravaRG(RGx);
    } catch (e) {} }, 60000);
    // 5.47 (Stefany 12/11 17:22): sequência de quem está "aguardando o cliente" = 1 h depois · 08:00 do dia seguinte ·
    // aviso de final de janela 1 h antes de completar 24 h da última mensagem do CLIENTE (7.8, nunca depois das 21h) · depois a varredura.
    // Vale para pedido de CPF, simulação e dúvida respondida (o 3 h e o 08h D+2 do CPF saíram).
    function horaJanela(ultCliT) { if (!ultCliT) return 0; let q = ultCliT + 23 * H; const d = new Date(q);
      if (d.getHours() >= 21) { d.setHours(20, 45, 0, 0); q = d.getTime(); } else if (d.getHours() < 8) { d.setDate(d.getDate() - 1); d.setHours(20, 45, 0, 0); q = d.getTime(); }
      return q; }
    function novaSequencia(tipo, t0, ultCliT) {   // 5.38 / 5.47
      const manha = dias => { const d = new Date(t0); d.setDate(d.getDate() + dias); d.setHours(8, 0, 0, 0); return d.getTime(); };
      if (tipo === 'doc') return [{ q: '1h', quando: t0 + 60 * M, feito: 0 }];
      const seq = [{ q: '1h', quando: t0 + 60 * M, feito: 0 }, { q: '08h', quando: manha(1), feito: 0 }];
      const qj = horaJanela(ultCliT); if (qj && qj > t0 + 90 * M) seq.push({ q: 'janela', quando: qj, feito: 0 });
      return seq.sort((a, b) => a.quando - b.quando);
    }
    const TXT_JANELA = n => `${n ? n + ', e' : 'E'}stou passando só para avisar de uma coisa daqui do sistema 😊\n\nO nosso atendimento por aqui se encerra automaticamente daqui a pouco, e depois disso eu não consigo mais te responder nesta conversa.\n\nSe ainda quiser tirar qualquer dúvida ou continuar, é só me mandar uma mensagem — qualquer palavra já mantém a conversa aberta.\n\nSe preferir deixar para depois, sem problema nenhum: eu te procuro pelo WhatsApp mais para a frente 💛`;
    const TXT_ESP = {
      cpf: { '1h': n => `${n ? n + ', t' : 'T'}udo bem? 😊 Ficou faltando só o número do seu CPF para eu consultar o valor que você consegue liberar. Pode me mandar aqui mesmo, só os números.`,
             '3h': n => `Oi${n ? ', ' + n : ''}! 😊 Ainda estou por aqui para te ajudar. Se você me mandar o seu CPF (só os números), em poucos minutos eu te passo quanto você consegue liberar, sem compromisso. 🔒 A Dinseguro nunca pede senha e não cobra nada adiantado.`,
             '08h2': n => `Bom dia${n ? ', ' + n : ''}! ☀️ Passando uma última vez para saber se ainda posso te ajudar com o empréstimo. Se quiser, é só me mandar o número do seu CPF que eu consulto na hora 🤝`,
             '08h': n => `Bom dia${n ? ', ' + n : ''}! ☀️ Passando para lembrar que a sua consulta ficou pendente só do CPF. Se ainda tiver interesse, me manda o número aqui que eu já te passo o valor certinho 🤝` },
      link: { '1h': n => `Oi${n ? ', ' + n : ''}! 😊 Passando para saber se você conseguiu ver a sua proposta. Ela está no link que te mandei acima. Só reforçando: essa condição está garantida para hoje — amanhã o banco pode mudar a taxa e o valor pode ficar diferente. Se tiver qualquer dúvida sobre o valor, as parcelas ou como assinar, me chama aqui que eu te ajudo a finalizar agora. 🤝`,
              '08h': n => `Bom dia${n ? ', ' + n : ''}! ☀️ A sua proposta ainda está no link que te mandei. Hoje eu confiro com o banco: se a taxa não mudou, seguimos com o mesmo valor. Para garantir, o ideal é finalizar ainda hoje — é só abrir o link e fazer a selfie de segurança. Se precisar de ajuda em qualquer etapa, me chama aqui 🤝` },
      duvida: { '1h': (n, l, a) => a && a.temCpf ? `${n ? n + ', f' : 'F'}icou mais alguma dúvida? 😊 Estou por aqui para te ajudar a continuar. É só me responder.` : `${n ? n + ', f' : 'F'}icou mais alguma dúvida? 😊 Se quiser, me manda o seu CPF (só os números) que eu já consulto o valor que você consegue liberar, sem compromisso. 🔒 A Dinseguro nunca pede senha e não cobra nada adiantado.`,
                '08h': (n, l, a) => a && a.temCpf ? `Bom dia${n ? ', ' + n : ''}! ☀️ Passando para saber se ainda posso te ajudar. Qualquer dúvida, é só me chamar aqui 🤝` : `Bom dia${n ? ', ' + n : ''}! ☀️ Passando para saber se ainda posso te ajudar. Se quiser, é só me mandar o número do seu CPF que eu consulto na hora 🤝` },
      simulacao: { '1h': n => `${n ? n + ', c' : 'C'}onseguiu ver a simulação que te mandei? 😊 Se quiser, eu já deixo tudo pronto para você.\n\n1️⃣ Sim, quero contratar\n2️⃣ Não desejo`,
                   '08h': n => `Bom dia${n ? ', ' + n : ''}! ☀️ A sua simulação continua disponível. Quer que eu deixe tudo pronto para você?\n\n1️⃣ Sim, quero contratar\n2️⃣ Não desejo` },
      doc: { '1h': n => `${n ? n + ', c' : 'C'}onseguiu tirar a foto do documento? 😊 Assim que você mandar aqui, eu já sigo com a sua proposta. Se tiver qualquer dificuldade, me fala que eu te ajudo.` },
      lembrete: { 'lembrete': (n, link) => `${n ? 'Oi, ' + n + '! ' : 'Oi! '}Conforme combinamos, estou passando aqui 😊 ` + (link ? 'A sua proposta está no link que te mandei. Como as condições do banco podem mudar de um dia para o outro, eu confiro aqui agora: se a taxa não tiver mudado, seguimos com o mesmo valor. O ideal é finalizar hoje, é só abrir o link e fazer a selfie de segurança.' : 'Podemos continuar de onde paramos?') + ' Se precisar de ajuda em qualquer etapa, me chama aqui 🤝' },
    };
    let espRodando = false;
    async function olharEspera() {
      if (vigiaTrava()) return;   // 4.54
      if (espRodando || fupRodando || posRodando || faseRodando || rodando || localStorage.getItem('dins_ordem')) return;
      if (Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 45000) return;
      if ((Date.now() - (+localStorage.getItem('dins_varrendo') || 0) < 2 * 60000) && !localStorage.getItem('dins_varre_pausa')) return;
      const ta = document.querySelector('textarea'); if (ta && ta.value.trim()) return;
      const agora = Date.now(); if (!dentroDoHorario(agora)) return;
      let alvo = null, toque = null;
      // 5.38 (caso Rubi: toques 1h e 08h saíram 08:53 e 08:54): vários vencidos → só o MAIS RECENTE sai (os anteriores ficam 'pulado');
      // e nunca dois toques com menos de 1 h entre eles.
      { const o0 = ESP(); let m0 = false;
        for (const x of Object.values(o0)) { const venc = (x.toques || []).filter(k => !k.feito && k.quando <= agora); if (venc.length > 1) { venc.slice(0, -1).forEach(k => { k.feito = agora; k.st = 'pulado (atrasado — vale o toque seguinte)'; }); m0 = true; }
          const ultEnv = Math.max(0, ...(x.toques || []).filter(k => /^enviado/.test(k.st || '')).map(k => +k.feito || 0));
          const prox = (x.toques || []).find(k => !k.feito && k.quando <= agora); if (prox && ultEnv && agora - ultEnv < 60 * M && !(prox.prox > agora)) { prox.prox = ultEnv + 60 * M; m0 = true; } }
        if (m0) gravaESP(o0); }
      for (const x of Object.values(ESP())) { if (x.parado || protegido(x.hash)) continue; const q = (x.toques || []).find(k => !k.feito && k.quando <= agora && (!k.prox || k.prox <= agora)); if (q) { alvo = x; toque = q; break; } }
      if (!alvo) return;
      // toque das 08:00 que já passou há mais de 3 h não sai (ficaria fora de hora)
      const marcaQ = (mud, st) => { const o = ESP(), y = o[alvo.hash]; if (!y) return; const q = y.toques.find(k => k.q === toque.q); Object.assign(q, mud); q.st = st; gravaESP(o); };
      if (/^08h/.test(toque.q) && agora - toque.quando > 3 * H) { marcaQ({ feito: agora }, 'pulado (passou da manhã)'); return; }
      if (!navPega('espera')) return;
      espRodando = true;
      try {
        const alvoHash = '#/chats/' + alvo.hash;
        if (!(await esperaChatLivre(alvo.hash))) throw new Error('a conversa está aberta em outra aba — tento de novo depois');   // 5.64
        if (window.top.location.hash !== alvoHash) { window.top.location.hash = alvoHash; await new Promise(s => setTimeout(s, 4500)); }
        for (let i = 0; i < 10 && !telaPronta(alvo.hash); i++) await new Promise(s => setTimeout(s, 1500));
        if (!telaPronta(alvo.hash)) throw new Error('tela não parou no chat');
        if (janelaVencidaAgora()) { marcaQ({ feito: Date.now() }, 'janela de 24 h vencida — fica para a varredura'); const o = ESP(); if (o[alvo.hash]) { o[alvo.hash].parado = 1; gravaESP(o); } return; }
        const tagsChat = [...document.querySelectorAll('.MuiChip-label')].map(c => c.textContent.trim());
        if (tagsChat.some(t => /^(01 D|01 I|01 k|02 I|03 A|03 B|05 |06 |07 )/i.test(t))) { const o = ESP(); delete o[alvo.hash]; gravaESP(o); return; }
        let L = null; try { L = lados(); } catch (e) {}
        if (L && L.ult && L.ult.lado === 'cli' && alvo.tipo !== 'lembrete') { const o = ESP(); delete o[alvo.hash]; gravaESP(o); return; }   // respondeu: não insiste
        // 6.05 (Stefany 13/11 12:40, caso Zélia ZXTN3: voltou HOJE 12:21 por anúncio e às 12:37 recebeu o aviso de "fim de janela" calculado pela janela
        // de 09/11). Vale a ÚLTIMA janela: o aviso só sai se a última mensagem do cliente (de qualquer sessão) foi há ~23 h; senão remarca para a janela atual.
        if (toque.q === 'janela') { const uc = (L && L.ultCli && +L.ultCli.t) || 0; const qj = horaJanela(uc);
          if (!uc || !qj || agora < qj - 10 * M || agora - qj > 60 * M) { if (qj > agora + 10 * M) marcaQ({ quando: qj }, 'remarcado para a janela de agora (' + hhmm(qj) + ') — o cliente voltou depois'); else marcaQ({ feito: agora }, 'pulado (não é a janela atual)'); return; } }
        // 5.57: a nossa última mensagem saiu há menos de 50 min (vigia/robô falou agora) → este toque espera mais 1 h
        { const ul = [...document.querySelectorAll('.entries [class*="entries-li"]')].filter(e => (e.innerText || '').trim().length > 6).slice(-1)[0];
          const mh = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec((ul && ul.innerText) || ''); if (mh && ul && !ul.classList.contains('left')) { let hh = +mh[1] % 12; if (/PM/i.test(mh[3])) hh += 12; const d = new Date(); d.setHours(hh, +mh[2], 0, 0); const dif = Date.now() - d.getTime();
            if (dif >= 0 && dif < 50 * M && toque.q !== 'lembrete' && toque.q !== 'janela') { const o = ESP(), y = o[alvo.hash]; if (y) { const q = y.toques.find(k => k.q === toque.q && !k.feito); if (q) q.prox = d.getTime() + 60 * M; gravaESP(o); } return; } } }
        // 4.70 (caso Nilva): conversa já encerrada (desfecho) ou cliente que já mandou CPF não recebe cobrança de CPF
        // 5.52: sessão fechada pelo BOT por falta de interação NÃO é desfecho — a janela de 24 h continua e o follow-up sai (casos J4REV/QOZFC/6RKWW)
        if ((() => { const p = document.body.innerText; const i = p.indexOf('Última sessão'); if (i < 0) return false; const j = p.indexOf('Informações de contato', i); if (!(j > 0 && !/Em atendimento|support_agent/.test(p.slice(i, j)))) return false;
              const fimE = ((document.querySelector('.entries') || {}).innerText || '').slice(-2500); return !/encerrado por falta de intera[çc][ãa]o/i.test(fimE); })() || (alvo.tipo === 'cpf' && L && (L.temCpf || L.cpfSemRespT))) { const o = ESP(); delete o[alvo.hash]; gravaESP(o); marcaHistESP(alvo.hash, alvo.tipo); return; }
        if (alvo.tipo === 'lembrete' && L && L.ult && L.ult.lado === 'cli' && !DEPOIS.test(L.ult.txt || '')) { const o = ESP(); delete o[alvo.hash]; gravaESP(o); return; }   // falou outra coisa depois: é atendimento
        const r = RG(); const temLink = r[alvo.hash] && r[alvo.hash].link && !r[alvo.hash].semLink;
        const n = nomeSeguro(alvo.nome);
        // 4.60: o nome do chat aberto tem que ser o do registro (Josias ≠ Lu Andrade)
        { const nt = (nomeDoContato() || '').trim().toLowerCase(), na = (alvo.nome || '').trim().toLowerCase();
          if (na && nt && nt.split(' ')[0] !== na.split(' ')[0]) throw new Error('nome do chat (' + nt + ') não é o do registro (' + na + ')'); }
        const f = (TXT_ESP[alvo.tipo] || {})[toque.q] || (toque.q === 'janela' ? TXT_JANELA : null); if (!f) throw new Error('sem texto para ' + alvo.tipo + '/' + toque.q);
        await mensagemLivre(f(n, temLink, alvo));
        marcaQ({ feito: Date.now() }, 'enviado ' + hhmm(Date.now()));
        marcaHistESP(alvo.hash, alvo.tipo);   // 4.61
        try { const r2 = RG(); if (r2[alvo.hash]) { r2[alvo.hash].hist.push(hhmm(Date.now()) + ' follow-up ' + alvo.tipo + ' ' + toque.q + ' enviado'); gravaRG(r2); } } catch (e) {}
        log && log('Follow-up ' + alvo.tipo + ' ' + toque.q + ' → ' + (alvo.nome || alvo.hash), 'ok');
      } catch (e) {
        if (/JANELA_VENCIDA/.test(e.message)) marcaQ({ feito: Date.now() }, 'janela de 24 h vencida');
        else if (/DUPLICADO/.test(e.message)) { marcaQ({ feito: Date.now() }, 'já estava no chat (outra aba) — não repeti'); marcaHistESP(alvo.hash, alvo.tipo); }
        else { const o = ESP(), y = o[alvo.hash]; if (y) { const q = y.toques.find(k => k.q === toque.q); q.tent = (q.tent || 0) + 1; q.prox = Date.now() + 3 * M; q.st = 'erro: ' + e.message; if (q.tent >= 3) { q.feito = Date.now(); y.erro = e.message; } gravaESP(o); } }
      } finally { espRodando = false; navSolta('espera'); }
    }
    setInterval(() => { if (faz('followup')) olharEspera(); }, 50000);

    // 4) QUADRO no canto direito da tela de cima
    function desenharRegua() {
      let top; try { top = window.top.document; } catch (e) { return; }
      const r = RG(); const agora = Date.now();
      const ordem = { erro: 0, bloqueada: 0, alerta: 1, humano: 2, ativa: 3, acompanhando: 4, pausada: 5, esgotada: 6, 'concluída': 7, encerrado: 8, cancelada: 9 };
      // 4.45 (Stefany 11:12, caso Genivaldo): o quadro é da JANELA DE 24 h ABERTA — quem já venceu (lido na tela, ou a última
      // mensagem do cliente tem mais de 24 h) sai daqui e fica com a varredura. Antes inflava o número do quadro.
      const ESPq = GM_getValue('espera', {}) || {};   // 5.51
      const venceu = x => { const uc = Math.max(+x.ultCliT || 0, +x.cpfSemRespT || 0, +x.semCpfT || 0); if (!uc && ['acompanhando', 'pausada', 'esgotada'].includes(x.estado) && (+x.ultT || 0) && agora - x.ultT > 24 * H) return true;
        if (!uc && !(+x.ultT || 0) && ['acompanhando', 'pausada', 'esgotada'].includes(x.estado) && agora - Math.max(+x.criadoT || 0, +x.linkT || 0) > 24 * H) return true;   // 5.53: nunca lida e com mais de 24 h   // 5.51: sem hora do cliente e nossa última há mais de 24 h → janela fechada
        return x.vencida || (uc && agora - uc > 24 * H) || /janela de 24 h vencida/i.test(x.motivo || ''); };   // 5.05 (caso Marco Aurélio: CPF 23:23 de ontem, mas ultCliT ficou com uma mensagem mais antiga → achava janela vencida e não consultava)
      const lista = Object.values(r).filter(x => x.estado !== 'fechada' && x.estado !== 'cancelada' && !venceu(x) && (agora - x.linkT < 48 * H || x.estado === 'humano' || x.estado === 'alerta'))
        .sort((a, b) => (ordem[a.estado] ?? 5) - (ordem[b.estado] ?? 5) || a.linkT - b.linkT);
      let q = top.getElementById('dins-regua');
      if (!q) {
        q = top.createElement('div'); q.id = 'dins-regua'; q.setAttribute('translate', 'no'); q.classList.add('notranslate');   // 4.13b: o tradutor do Chrome trocava "Aguardando" por "Guardando"
        // 4.00 — no canto ESQUERDO, acima do "Esperando atendimento": não cobre Tags/Notas do painel direito
        q.style.cssText = 'position:fixed;left:16px;bottom:120px;z-index:99998;background:#0f172a;color:#e2e8f0;border-radius:10px;' +
          'padding:8px 10px;font:12px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:400px;max-height:42vh;overflow:auto';
        top.body.appendChild(q);
        q.addEventListener('click', ev => {
          const id = ev.target.dataset.abrir; if (id) window.top.location.hash = '#/chats/' + id;
          if (ev.target.closest && ev.target.closest('[data-tabela]')) { const tb = top.getElementById('dins-tabela'); localStorage.setItem('dins_tabela_aberta', tb && tb.style.display !== 'none' ? '0' : '1'); desenharRegua(); return; }
          if (ev.target.closest && ev.target.closest('[data-min]')) { q.dataset.min = q.dataset.min === '1' ? '' : '1'; desenharRegua(); }
        });
      }
      const atras = x => x.estado === 'ativa' && x.toques.some(k => !k.feito && k.quando < agora - 5 * M && dentroDoHorario(agora));
      // 4.13 — QUADRO EM 5 BLOCOS (Stefany 10/11 18:16 "pode fazer"): quem responder agora, follow-up do robô, quem precisa de
      // alguém junto, quem está aguardando o cliente e quem já encerrou. Cada linha: nome · situação · há quanto tempo · resumo.
      const min = t => t ? Math.max(0, Math.round((agora - t) / M)) : null;
      const haMin = t => { const n = min(t); return n == null ? '' : n < 60 ? 'há ' + n + ' min' : 'há ' + Math.floor(n / 60) + 'h' + String(n % 60).padStart(2, '0'); };
      const vermelhoCalc = x => {
        if (x.semLink && x.contornoT && x.ultLado !== 'cli' && agora - x.contornoT > 15 * M && !['humano', 'encerrado'].includes(x.estado))
          return 'contorno ' + hhmm(x.contornoT) + ' sem resposta ' + haMin(x.contornoT) + ' → digitar no valor escolhido (16a)';
        if (x.semLink && x.botParado && !x.temCpf && x.estado === 'acompanhando' && !/n[ãa]o sou|aut[ôo]nomo|\bclt\b|carteira assinada|servidor|for[çc]as armadas|bolsa fam/i.test(x.ultCliTxt || '') && x.ultT && agora - x.ultT > 30 * M)
          return 'parado no bot ' + haMin(x.ultT) + ', sem CPF → mandar mensagem pedindo o CPF';
        return '';
      };
      const bloco = x => {
        const fe = faseEsteira(x);
        if (fe && ['falta desbloquear', 'falta anuência'].includes(fe.fase) && x.estado !== 'humano' && !(x.faseFeita && x.faseFeita === fe.fase)) return 'R';   // 4.18c: com humano (Marlene/Rômulo) fica no amarelo
        if (fe && fe.fase === 'pago') return 'E';
        if (fe && fe.fase === 'recusada') return 'J';
        if (['erro', 'bloqueada', 'alerta'].includes(x.estado) || atras(x) || vermelhoCalc(x)) return 'R';
        if ((x.estado === 'humano' && protegido(x.hash)) || x.junto || (x.estado === 'acompanhando' && /01 D|acompanhar o banco/.test(x.motivo || ''))) return 'J';
        if (x.estado === 'humano') return 'R';   // 4.44: humano fora da lista → o vigia analisa o contexto (vermelho)
        if (protegido(x.hash)) return 'J';   // 5.52: NÃO MEXER fica no amarelo
        if (x.estado === 'ativa') return 'F';
        // 5.51 (Stefany 17:43: "isso que tem follow-up é follow-up do robô, tem que ficar escrito ali"): tem follow-up agendado → 🟢
        { const e = ESPq[x.hash]; if (e && (e.toques || []).some(q => !q.feito)) return 'F';
          if (x.estado === 'pausada' && x.link && !(x.retomarT && Date.now() - x.retomarT < 20 * 3600000)) return 'F';
          if (x.estado === 'esgotada' && x.link && !x.vencida) return 'F'; }   // 5.81: follow-ups feitos → a varredura pega quando a janela vencer (automático)
        if (['encerrado', 'concluída'].includes(x.estado)) return 'E';
        return 'A';
      };
      const BL = [['R', '🔴 Responder agora', '#f87171'], ['F', '🟢 Follow-up do robô', '#86efac'], ['J', '🟡 Precisa de alguém junto', '#fbbf24'],
        ['A', '🔵 Aguardando o cliente', '#93c5fd'], ['E', '⚪ Encerrados hoje', '#94a3b8']];
      // 4.20 — CONTORNO AUTOMÁTICO: passou de 15 min → ordem para o Multicorban (ficha) e o New Corban (digitação).
      // O robô para em "Pronto (liberado R$ X)": quem grava e manda o link é o vigia.
      if (faz('atendimento')) try {
        const O = GM_getValue('auto_ordens', {}) || {}; let mudouO = false;
        for (const x of lista) {
          const ci = x.contornoInfo; if (!ci || !x.semLink || !x.contornoT || x.ultLado === 'cli' || O[x.hash] || protegido(x.hash)) continue;
          if (agora - x.contornoT <= 15 * M || agora - x.contornoT > 3 * H || ['humano', 'encerrado'].includes(x.estado)) continue;   // só contorno das últimas 3 h (os antigos o vigia vê no vermelho)
          if (!ci.cpf || !(ci.valor >= 500)) { O[x.hash] = { hash: x.hash, nome: x.nome, estado: 'erro', erro: !ci.cpf ? 'sem CPF na conversa' : 'não achei o valor que o cliente escolheu', t: agora }; mudouO = true; continue; }
          O[x.hash] = { hash: x.hash, nome: x.nome, fone: x.fone, cpf: ci.cpf, valor: ci.valor, aceite: !!ci.aceite, estado: 'nova', t: agora, hist: [hhmm(agora) + ' ordem criada (contorno ' + hhmm(x.contornoT) + ')'] };
          mudouO = true;
        }
        // 4.24 (Stefany 11/11 08:17 "a 1 é fantástico, vamos aplicar"): CPF mandado sem resposta → o robô consulta sozinho no Multicorban.
        // Sem margem (margem < R$ 20, INSS ou LOAS) → linha cordial + /n30 + tag + nota + fechar, sem o vigia. O resto fica para o vigia.
        for (const x of Object.values(r).filter(z => z && z.hash && z.estado !== 'fechada')) {
          // 5.37 (casos João Paulo 14:58 / Ramon 16:04): CPF do cliente sem resposta vira consulta em QUALQUER estado da régua
          // (alerta, pausada, acompanhando, ativa, cancelada), não só 'alerta' sem link. Fora: humano agora, NÃO MEXER.
          // 5.82: cliente esperando (alerta, última dele), SEM proposta e com CPF no painel → consulta sozinho, sem pedir o CPF
          if (!x.cpfSem && x.cpfVar && x.estado === 'alerta' && x.ultLado === 'cli' && !(x.link && !x.semLink) && +x.ultCliT && agora - x.ultCliT < 6 * H && !protegido(x.hash) && !x.comQuem && !O[x.hash]) {
            O[x.hash] = { hash: x.hash, nome: x.nome, fone: x.fone, cpf: x.cpfVar, tipo: 'cpf', cpfT: +x.ultCliT, valorBot: (x.escolha && x.escolha.valor) || 0, aceite: !!(x.escolha && x.escolha.aceite), estado: 'nova', t: agora, hist: [hhmm(agora) + ' ordem criada (CPF do painel — 5.82)'] }; mudouO = true; continue; }
          if (!x.cpfSem || !x.cpfSemRespT || agora - x.cpfSemRespT > 23 * H || x.estado === 'humano' || protegido(x.hash) || x.comQuem) continue;
          const v = O[x.hash]; if (v && (v.cpf === x.cpfSem || !['feito', 'erro', 'com_margem', 'desfecho_ok'].includes(v.estado))) continue;
          O[x.hash] = { hash: x.hash, nome: x.nome, fone: x.fone, cpf: x.cpfSem, tipo: 'cpf', cpfT: x.cpfSemRespT, valorBot: (x.escolha && x.escolha.valor) || (((GM_getValue('valor_nota', {}) || {})[x.hash] || {}).v) || 0, aceite: !!(x.escolha && x.escolha.aceite), estado: 'nova', t: agora, hist: [hhmm(agora) + ' ordem criada (CPF mandado ' + hhmm(x.cpfSemRespT) + ')'] };
          mudouO = true;
        }
        if (mudouO) GM_setValue('auto_ordens', O);
      } catch (e) {}
      const grupos = {}; lista.forEach(x => (grupos[bloco(x)] = grupos[bloco(x)] || []).push(x));
      const nAlerta = (grupos.R || []).length;
      // 5.40 FASE 4: cliente esperando há mais de 10 min (vermelho sem resposta) aparece no topo, com a maior espera; resumo a cada hora em dins_resumo_hora
      const esperando = (grupos.R || []).map(x => ({ x, min: Math.round((agora - (x.ultLado === 'cli' ? (+x.ultCliT || 0) : (+x.handoffT || +x.cpfSemRespT || +x.ultT || 0))) / 60000) })).filter(e => e.min >= 10 && e.min < 24 * 60 && !protegido(e.x.hash) && !e.x.comQuem).sort((a, b) => b.min - a.min);
      try { const hk = new Date().toISOString().slice(0, 13); const RH = JSON.parse(localStorage.getItem('dins_resumo_hora') || '[]'); if (!RH.length || RH[RH.length - 1].h !== hk) { RH.push({ h: hk, hora: hhmm(agora), esperando: esperando.length, maior: esperando[0] ? esperando[0].min : 0, quem: esperando.slice(0, 5).map(e => (e.x.nome || e.x.hash.slice(0, 5)) + ' ' + e.min + 'min'), alerta: nAlerta }); localStorage.setItem('dins_resumo_hora', JSON.stringify(RH.slice(-48))); } } catch (e) {}
      const cab = `<div data-min="1" style="cursor:pointer;font-weight:700">📋 ${({tudo:'',atendimento:'[ATENDIMENTO] ',followup:'[FOLLOW-UP] ',varredura:'[VARREDURA] ',vigia:'[VIGIA] '})[meuPapel()]}Acompanhamento dos clientes — janela 24h (${lista.length})${(() => { try { const m = JSON.parse(localStorage.getItem('dins_abas_paradas') || '[]'); return m.length ? ' <span style="color:#fca5a5">⚠ janela parada: ' + m.join(', ') + '</span>' : ''; } catch (e) { return ''; } })()}${nAlerta ? ' <span style="color:#f87171">⚠ ' + nAlerta + '</span>' : ''}</div>` +
        (esperando.length ? `<div style="margin:3px 0;padding:3px 6px;border-radius:6px;background:#7f1d1d;color:#fff;font-weight:700">⏱ ${esperando.length} sem resposta há mais de 10 min — maior: ${esperando[0].min} min (${String(esperando[0].x.nome || esperando[0].x.hash.slice(0, 5)).replace(/</g, '')})</div>` : '') +
        `<div style="color:#94a3b8;font-size:11px">${BL.map(([k, n]) => n.split(' ')[0] + ' ' + (grupos[k] || []).length).join('  ')}` +
        ` <button data-tabela="1" style="margin-left:6px;padding:2px 8px;border:0;border-radius:6px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">📊 Tabela</button></div>`;
      const minimizado = q.dataset.min === '1';
      const esc = t => String(t || '').replace(/</g, '&lt;');
      const situacao = (x, k) => {
        const ao = (GM_getValue('auto_ordens', {}) || {})[x.hash];
        if (ao && x.semLink && ao.tipo === 'cpf') {
          if (ao.estado === 'com_margem') return '🤖 CPF consultado: COM margem (' + (ao.resumo || '') + ') → VIGIA: simular e mandar o link';
          if (ao.estado === 'erro') return '🤖 CPF: ' + ao.erro + ' → fazer à mão';
          if (/desfecho/.test(ao.estado)) return '🤖 sem margem → robô mandando linha cordial + /n30 e fechando';
          if (ao.estado === 'pronto' || ao.estado === 'gravando') return '🤖 CPF com margem: ' + ao.banco + ' R$ ' + ao.liberado + ' → robô gravando';
          if (ao.estado === 'gravada') return '🤖 ' + ao.banco + ' Nº ' + ao.proposta + ' gravada → robô esperando o link';
          if (ao.estado === 'link' || ao.estado === 'link_enviado') return '🤖 link pronto (' + ao.banco + ' Nº ' + ao.proposta + ') → robô mandando simulação + link';
          if (ao.estado === 'feito') return '🤖 simulação + link enviados pelo robô (' + ao.banco + ' Nº ' + (ao.proposta || '') + ') — aguardar o cliente';
          return '🤖 CPF: robô ' + ({ nova: 'vai consultar', consultando: 'consultando no Multicorban', ficha_ok: 'ficha pronta, vai digitar no máximo (' + (ao.banco || '') + ')', digitando: 'digitando no ' + (ao.banco || '') }[ao.estado] || ao.estado);
        }
        if (ao && x.semLink) {
          if (ao.estado === 'pronto') return '🤖 contorno digitado: ' + ao.banco + ' R$ ' + ao.liberado + ' → VIGIA: Gravar + ' + (ao.aceite ? 'linha curta + /bn54n' : 'simulação 1/2 + /parabens');
          if (ao.estado === 'erro') return '🤖 contorno: ' + ao.erro + ' → fazer à mão';
          return '🤖 contorno: robô ' + ({ nova: 'vai consultar', consultando: 'consultando no Multicorban', ficha_ok: 'ficha pronta (' + (ao.banco || '') + ')', digitando: 'digitando no ' + (ao.banco || '') }[ao.estado] || ao.estado);
        }
        const fe = faseEsteira(x);
        if (fe && fe.fase !== 'andamento' && fe.fase !== 'não assinou') return '🏦 ' + fe.fase.toUpperCase() + (fe.acao ? ' → ' + fe.acao : '') + ' (' + fe.real + ')';
        const v = vermelhoCalc(x); if (v && !['erro', 'bloqueada', 'alerta'].includes(x.estado)) return v;
        if (x.junto) return (['alerta', 'erro'].includes(x.estado) ? (x.motivo || x.estado) + ' · ⚠ ' : '') + x.junto;
        if (x.comQuem && x.ultLado !== 'cli' && x.semLink) return 'com ' + x.comQuem + ' — mensagem dele(a) é a última';
        // 5.49 (Stefany 17:28: "16 pessoas naquela fila errado, tem que ser reavaliado"): no azul mostra o PRÓXIMO follow-up
        // (ou que não há nenhum) e a janela; quem nunca foi lido (sem hora da última mensagem do cliente) é marcado para reler.
        if (['acompanhando', 'pausada', 'esgotada'].includes(x.estado)) { try {
          const e = (GM_getValue('espera', {}) || {})[x.hash]; const pq = e && (e.toques || []).filter(q => !q.feito).sort((a, b) => a.quando - b.quando)[0];
          const jan = (+x.ultCliT || 0) ? Math.round((x.ultCliT + 24 * 3600000 - Date.now()) / 3600000) : null;
          const jtx = jan === null ? ' · janela: ? (relendo)' : jan <= 0 ? ' · janela FECHADA → varredura' : ' · janela fecha em ' + jan + ' h';
          const base = (x.motivo || x.estado).replace(/ — .*/, '');
          if (pq) return base + ' · próximo follow-up ' + pq.q + ' às ' + hhmm(pq.quando) + jtx;
          if (x.estado === 'esgotada' || (x.link && x.toques && x.toques.every(q => q.feito))) { const vz = (+x.ultCliT || 0) + 24 * 3600000; return base + ' · follow-ups do link feitos · próximo: VARREDURA depois que a janela vencer (' + hhmm(vz) + ')' + jtx; }
          if (x.estado === 'pausada') return base + ' · retomada automática 2 h depois da nossa última mensagem' + jtx;
          return base + ' · ⚠ sem follow-up agendado' + jtx; } catch (e) {} }
        if (!x.semLink && x.estado === 'ativa') { const prox = x.toques.find(k2 => !k2.feito); return prox ? 'próximo toque: ' + (prox.tipo === 'manha' ? (new Date(prox.quando).toDateString() === new Date().toDateString() ? 'hoje 08:00' : 'amanhã 08:00') : prox.tipo + ' min às ' + hhmm(prox.quando)) : '—'; }
        if (atras(x)) return 'toque atrasado';
        return (x.semLink ? '' : x.estado + ' · ') + (x.motivo || x.estado);
      };
      const linha = (x, cor, k) => {
        const ult = [...(x.toques || [])].reverse().find(q2 => q2.feito);
        const quando = x.ultT ? ' · ' + haMin(x.ultT) : '';
        if (k === 'E') return `<span data-abrir="${x.hash}" style="cursor:pointer;text-decoration:underline;color:${cor}">${esc(x.nome || x.hash.slice(0, 6))}</span>`;
        return `<div style="margin-top:4px;border-top:1px solid #334155;padding-top:3px">
          <span data-abrir="${x.hash}" style="cursor:pointer;text-decoration:underline;color:${cor};font-weight:600">${esc(x.nome || x.hash.slice(0, 6))}</span>
          <span style="color:#94a3b8"> · ${x.semLink ? 'sem link' : 'link ' + hhmm(x.linkT)}${quando}</span><br>
          <span style="color:${cor}">${esc(situacao(x, k))}</span>${ult ? '<span style="color:#94a3b8"> · último: ' + ult.tipo + ' ' + esc(ult.st) + '</span>' : ''}${x.resumo ? '<br><span style="color:#cbd5e1;font-style:italic">' + esc(x.resumo) + '</span>' : ''}</div>`;
      };
      q.innerHTML = minimizado ? cab : cab + BL.map(([k, nome, cor]) => {
        const g = (grupos[k] || []).sort((a2, b2) => k === 'R' ? (a2.ultT || a2.linkT) - (b2.ultT || b2.linkT) : (b2.ultT || b2.linkT) - (a2.ultT || a2.linkT));
        if (!g.length) return '';
        const corpo = k === 'E' ? '<div style="margin-top:3px;line-height:1.6">' + g.map(x => linha(x, cor, k)).join(' · ') + '</div>' : g.map(x => linha(x, cor, k)).join('');
        return `<div style="margin-top:8px;font-weight:700;color:${cor}">${nome} (${g.length})</div>` + corpo;
      }).join('');
      if (!lista.length) q.innerHTML = cab + '<div style="color:#94a3b8;margin-top:4px">nenhum cliente na régua</div>';
      // 4.16 — TABELA (Stefany 10/11 18:51: "mais organizadinho, tabelado, cronômetro… tempo para próximo contato, data do último
      // contato, tentativa de contato… mesmo que fique mais largo… fácil de identificar"). Botão 📊 Tabela abre por cima da tela.
      try { desenharTabela(top, grupos, BL, agora, { atras, vermelhoCalc, situacao, esc, haMin }); } catch (e) { try { window.top.__tabErr = String(e && e.stack || e); } catch (e2) {} }
    }
    function desenharTabela(top, grupos, BL, agora, F) {
      let tb = top.getElementById('dins-tabela');
      const aberta = localStorage.getItem('dins_tabela_aberta') === '1';
      if (!tb) {
        tb = top.createElement('div'); tb.id = 'dins-tabela'; tb.setAttribute('translate', 'no'); tb.classList.add('notranslate');
        tb.style.cssText = 'position:fixed;left:12px;right:12px;top:56px;bottom:12px;z-index:99999;background:#0b1220;color:#e2e8f0;border-radius:12px;' +
          'padding:10px 14px;font:13px system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.6);overflow:auto;display:none';
        top.body.appendChild(tb);
        tb.addEventListener('click', ev => {
          const id = ev.target.dataset && ev.target.dataset.abrir; if (id) { window.top.location.hash = '#/chats/' + id; localStorage.setItem('dins_tabela_aberta', '0'); tb.style.display = 'none'; return; }
          if (ev.target.closest && ev.target.closest('[data-fechar]')) { localStorage.setItem('dins_tabela_aberta', '0'); tb.style.display = 'none'; }
        });
        tb.addEventListener('mouseenter', () => { tb.dataset.mouse = '1'; }); tb.addEventListener('mouseleave', () => { tb.dataset.mouse = ''; });
      }
      // o vigia vai clicar na tela → a tabela fecha sozinha (se ninguém está com o mouse em cima dela)
      const vigiaAgindo = Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 2 * M;   // 4.16d: 20 s era pouco — a tabela voltou por cima dos cliques de tag (Empresa 19:17)
      if (!aberta || (vigiaAgindo && tb.dataset.mouse !== '1')) { tb.style.display = 'none'; if (vigiaAgindo) localStorage.setItem('dins_tabela_aberta', '0'); return; }   // fechou para o vigia: só reabre pelo botão
      tb.style.display = 'block';
      const { esc, haMin, situacao, atras } = F;
      const hm = t => t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
      const emQuanto = t => { if (!t) return ''; const d = Math.round((t - agora) / M); return d >= 0 ? (d < 60 ? 'em ' + d + ' min' : 'em ' + Math.floor(d / 60) + 'h' + String(d % 60).padStart(2, '0')) : '<b style="color:#f87171">atrasado ' + (-d) + ' min</b>'; };
      const quem = x => x.ultLado === 'cli' ? '👤 cliente' : x.botParado ? '🤖 bot' : x.ultLado === 'nos' ? (x.comQuem ? '🧑 ' + esc(x.comQuem) : '💬 nós') : '—';
      const th = 'style="position:sticky;top:0;background:#1e293b;text-align:left;padding:6px 8px;font-weight:700;border-bottom:2px solid #334155"';
      const td = 'style="padding:6px 8px;border-bottom:1px solid #1e293b;vertical-align:top"';
      const linha = (x, k, cor) => {
        const tq = x.toques || []; const feitos = tq.filter(q => q.feito && !/pulado/.test(q.st || '')); const prox = tq.find(q => !q.feito);
        const ultToque = [...tq].reverse().find(q => q.feito && !/pulado/.test(q.st || ''));
        const ultContT = Math.max(x.ultT || 0, ultToque ? ultToque.feito : 0) || x.linkT;
        const esperaT = k === 'R' ? (x.handoffT && x.ultLado !== 'cli' ? x.handoffT : x.contornoT && x.ultLado !== 'cli' ? x.contornoT : x.ultT) : 0;
        const proxTxt = k === 'R' ? '<b style="color:#f87171">AGORA</b>' : prox && x.estado === 'ativa' ? (prox.tipo === 'manha' ? '08:00 (manhã)' : prox.tipo + ' min') + ' · ' + hm(prox.quando) + '<br>' + emQuanto(prox.quando) : '—';
        return `<tr>
          <td ${td}><span data-abrir="${x.hash}" style="cursor:pointer;text-decoration:underline;color:${cor};font-weight:700">${esc(x.nome || x.hash.slice(0, 6))}</span><br><span style="color:#64748b;font-size:11px">${x.semLink ? 'sem link' : 'link ' + hm(x.linkT)}</span></td>
          <td ${td}><span style="color:${cor}">${esc(situacao(x, k))}</span>${x.resumo ? '<br><i style="color:#cbd5e1">' + esc(x.resumo) + '</i>' : ''}</td>
          <td ${td}>${quem(x)}<br><span style="color:#94a3b8">${hm(ultContT)}</span></td>
          <td ${td}>${esperaT ? '<b style="color:#f87171;font-size:15px">⏱ ' + haMin(esperaT).replace('há ', '') + '</b>' : '—'}</td>
          <td ${td}>${proxTxt}</td>
          <td ${td}>${tq.length ? feitos.length + ' de ' + tq.length + '<br><span style="color:#94a3b8;font-size:11px">' + tq.map(q => q.tipo + (q.feito ? (/pulado/.test(q.st || '') ? ' ⤼' : ' ✓') : ' ·')).join(' ') + '</span>' : '—'}</td>
          <td ${td}>${(() => { const fe = faseEsteira(x); return fe ? '<b>' + esc(fe.fase) + '</b><br><span style="color:#94a3b8;font-size:11px">' + esc(fe.banco) + ' · ' + esc(fe.real) + '<br>lido ' + hm(fe.t) + '</span>' : (x.link ? '<span style="color:#64748b">sem leitura</span>' : '—'); })()}</td>
        </tr>`;
      };
      tb.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:16px;font-weight:800">📋 Acompanhamento dos clientes — tabela <span style="color:#94a3b8;font-weight:400;font-size:12px">atualiza a cada 15 s · ${hm(agora)}</span></div>
          <button data-fechar="1" style="padding:4px 12px;border:0;border-radius:8px;background:#475569;color:#fff;font-weight:700;cursor:pointer">✕ Fechar</button></div>
        <table style="width:100%;border-collapse:collapse"><thead><tr>
          <th ${th}>Cliente</th><th ${th}>Situação / o que fazer</th><th ${th}>Último contato</th><th ${th}>Esperando há</th><th ${th}>Próximo contato</th><th ${th}>Tentativas</th><th ${th}>Banco (esteira)</th>
        </tr></thead><tbody>` +
        BL.map(([k, nome, cor]) => { const g = grupos[k] || []; if (!g.length) return '';
          const ord = [...g].sort((a2, b2) => k === 'R' ? (a2.ultT || a2.linkT) - (b2.ultT || b2.linkT) : (b2.ultT || b2.linkT) - (a2.ultT || a2.linkT));
          return `<tr><td colspan="7" style="padding:10px 8px 4px;font-weight:800;font-size:14px;color:${cor}">${nome} (${g.length})</td></tr>` + ord.map(x => linha(x, k, cor)).join(''); }).join('') +
        '</tbody></table>';
    }
    setInterval(desenharRegua, 15000); setTimeout(desenharRegua, 3000);

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
    // Horário da varredura (Stefany, 07/11 20:51): de 2 em 2 horas, das 8h às 16h.
    const HORAS_VARREDURA = [8, 10, 12, 14, 16];
    const HORA_FIM = 16;
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
        cpf:  /\b\d{3}\.?\d{3}\.?\d{3}-?\s?\d\s?\d\b/.test(t),
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
    // =====================================================================
    // 4.27 — VARREDURA NOVA (Stefany 11/11 08:29: "pode colocar o robô para fazer o trabalho completo da varredura").
    // Substitui a antiga, que procurava cada cliente pelo NOME na lista (emoji / fonte matemática não casava,
    // e "travava sem abrir as conversas"). Agora:
    //  1) colhe os HASHES da lista (rolagem lenta, 3 voltas) e abre cada conversa pelo endereço (#/chats/HASH);
    //  2) só mexe em conversa com o aviso de janela vencida no campo de mensagem (as duas redações);
    //  3) classifica pela regra do guias/07 + FILA-FOLLOWUP (09/11 e 10/11):
    //     - já tem tag de desfecho (01 I, 01 k, 02, 03, 07, Acima De 80) → só fecha (sem mensagem, sem mexer em tag);
    //     - sem interação nenhuma (sem CPF, sem link, sem mensagem/nota nossa) → 01 C + fecha (sem mensagem);
    //     - link/proposta, CPF com 01 A, ou atendimento nosso → follow-up pelo OUTRO número (WhatsApp Web, 3 textos)
    //       e, depois que a mensagem SAIU, fecha a conversa (ação `fecha`, sem mexer nas tags);
    //  4) NA DÚVIDA NÃO FECHA → lista "revisar" para o vigia/Stefany: chat com atendente ("Chat em atendimento com"),
    //     01 D não liberada, cliente que escreveu algo (pergunta/reclamação) sem resposta, CPF sem tag, bloqueados
    //     (Santaterezinha), sem telefone, proposta recusada/assinada na esteira.
    //  5) PRIMEIRA RODADA DO DIA: monta a lista e espera o botão "✅ Pode executar" no painel (regra dela); as outras rodam direto.
    // Liberar 01 D: dinsVarreLiberar('HASH', 'chamar'|'so_fechar').  Rodar agora: localStorage.dins_varrer_agora='1'.
    const DESF_TAG = /^(01 I|01 k|02 |03 |07 |Acima De 80)/i;
    const NAO_MEXER_HASH = ['F20QOEL8YYLQN2S6SR47'];   // chat de teste "Romulo"
    window.dinsVarreLiberar = (hash, modo) => { const L = GM_getValue('varre_liberados', {}) || {}; if (modo) L[hash] = modo; else delete L[hash]; GM_setValue('varre_liberados', L); return L[hash] || null; };
    window.dinsVarreVer = () => GM_getValue('varre_plano', null);
    // 4.29 — fila do WhatsApp à vista e controle (o envio mora no carregador 3.7, aba do WhatsApp Web)
    window.dinsWaVer = () => (GM_getValue('wa_fila', []) || []).map(x => ({ nome: x.nome, caso: x.caso, estado: x.estado, quem: x.quem || 'antiga', fone: x.fone ? '…' + String(x.fone).slice(-4) : '', hash: x.hash, criado: x.criado ? new Date(x.criado).toLocaleString('pt-BR').slice(0, 16) : '', quando: x.quando ? new Date(x.quando).toLocaleString('pt-BR').slice(0, 16) : '', motivo: x.motivo || '', fechado: x.fechado || '' }));
    window.dinsWaArquivarAntigas = () => { const f = GM_getValue('wa_fila', []) || []; let n = 0; f.forEach(x => { if (x.estado === 'pendente' && x.quem !== 'varredura 4.27') { x.estado = 'arquivado'; x.motivo = 'fila antiga (antes da 4.27) — não enviar'; n++; } }); GM_setValue('wa_fila', f); return n; };
    window.dinsWaLimparNomes = () => { const f = GM_getValue('wa_fila', []) || []; let n = 0; f.forEach(x => { if (x.estado === 'pendente') { const ns = nomeSeguro(x.nome, true); if (ns !== x.nome) { x.nomeOriginal = x.nome; x.nome = ns; n++; } } }); GM_setValue('wa_fila', f); return n; };   // 4.31
    window.dinsWaPausar = (on = true) => { GM_setValue('wa_prox', on ? Date.now() + 365 * 86400000 : 0); return on ? 'pausado' : 'liberado'; };
    window.dinsWaVoltar = hash => { const f = GM_getValue('wa_fila', []) || []; let n = 0; f.forEach(x => { if (x.hash === hash && /erro|pulado/.test(x.estado)) { x.estado = 'pendente'; x.motivoAntes = x.motivo; delete x.motivo; n++; } }); GM_setValue('wa_fila', f); return n; };   // 4.34
    window.dinsWaTirar = hash => { const f = GM_getValue('wa_fila', []) || []; f.forEach(x => { if (x.hash === hash && x.estado === 'pendente') { x.estado = 'arquivado'; x.motivo = 'tirado à mão'; } }); GM_setValue('wa_fila', f); return true; };
    window.dinsVarreLigada = on => { if (on !== undefined) GM_setValue('varredura_ligada', !!on); return GM_getValue('varredura_ligada', true); };   // 6.09: desliga a varredura neste perfil do Chrome (ela passa para o perfil 'varredura')
    try { if (typeof unsafeWindow !== 'undefined') unsafeWindow.dinsVarreLigada = window.dinsVarreLigada; } catch (e) {}
    window.dinsVarreOK = () => { const p = GM_getValue('varre_plano', null); if (!p) return false; p.aprovado = Date.now(); GM_setValue('varre_plano', p); GM_setValue('varre_ok_dia', new Date().toDateString()); return true; };
    const marcaVarrendo = () => localStorage.setItem('dins_varrendo', Date.now());
    try { localStorage.removeItem('dins_varre_pausa'); } catch (e) {}   // 4.95: pausa velha de antes do recarregar não vale
    async function colherHashes() {
      // 4.63 (Stefany 13:57: "43 vencidas" e a varredura das 12:03 leu lista 0): abrir um chat pelo endereço (#/chats/ID) ou a busca
      // do vigia deixam um FILTRO na lista ("Usuário 'ID'", "Usuários com o texto …") e a varredura só via aquele chat.
      // Tira o filtro antes de ler a lista.
      for (let k = 0; k < 4; k++) {
        const chip = [...document.querySelectorAll('.MuiChip-root')].find(c => /^Usu[áa]rio(s com o texto)?\s*['"‘’:]/i.test((c.innerText || '').trim()));
        if (!chip) break;
        const x = chip.querySelector('.MuiChip-deleteIcon, svg'); if (!x) break;
        x.dispatchEvent(new MouseEvent('click', { bubbles: true })); await esp(1500);
      }
      // 5.91 (Stefany 13/11 09:40 "não foi iniciado": rodadas 08:56 e 09:21 leram lista 0): janela pequena/conversa aberta = a lista não aparece.
      for (let k = 0; k < 10 && !document.querySelector('.customer-item'); k++) { try { if (/#\/chats\/./.test(window.top.location.hash)) window.top.location.hash = '#/chats'; if (window.top.outerWidth < screen.availWidth - 20) { window.top.moveTo(0, 0); window.top.resizeTo(screen.availWidth, screen.availHeight); } } catch (e) {} await esp(3000); }
      let sc = document.querySelector('.customer-item') && document.querySelector('.customer-item').parentElement;
      for (let k = 0; k < 6 && sc && sc.scrollHeight <= sc.clientHeight + 5; k++) sc = sc.parentElement;
      const vistos = new Map();
      const pega = () => document.querySelectorAll('.customer-item').forEach(ci => { const id = (ci.parentElement || {}).id; if (!id || vistos.has(id)) return;
        vistos.set(id, { id, nome: (ci.innerText.split('\n').filter(Boolean)[1] || '').trim(), arq: /ARCHIVED|Arquivad/i.test(ci.innerText) }); });
      pega();
      for (let volta = 0; volta < 3 && sc; volta++) {
        for (let y = 0; y <= sc.scrollHeight; y += 100) { sc.scrollTop = y; await esp(260); pega(); marcaVarrendo(); }
      }
      if (sc) { sc.scrollTop = 0; await esp(300); }
      return [...vistos.values()].filter(x => !x.arq);
    }
    async function abrirHash(id) {
      if (!(await esperaChatLivre(id))) return false;   // 5.64: conversa aberta em outra aba
      for (let t = 0; t < 3; t++) {
        while (vigiaTrava() || vigiaTrabalhando() || localStorage.getItem('dins_ordem') || fupRodando || posRodando || faseRodando || espRodando) {   /* 4.55: cliente em andamento passa na frente da varredura */ marcaVarrendo(); await esp(5000); }   // o vigia (cliente) tem prioridade
        // 4.90 (12/11 08:49: 13 clientes novos na fila sem leitura enquanto a varredura das 8h rodava): quem está esperando passa na frente — lê antes de seguir a varredura
        if (t === 0) { const ini = Date.now(); while (atendimentoPendente(true) && Date.now() - ini < 45 * 60000) { marcaVarrendo(); localStorage.setItem('dins_varre_livre', Date.now()); localStorage.setItem('dins_varre_pausa', 'atendimento'); await esp(5000); } localStorage.removeItem('dins_varre_pausa'); }   // 4.95: atendimento primeiro, varredura depois
        if (t === 0) { try { localStorage.setItem('dins_varre_livre', Date.now()); await esp(11000); while (localStorage.getItem('dins_ordem')) { marcaVarrendo(); await esp(3000); } localStorage.removeItem('dins_varre_livre'); } catch (e) {} }   // 4.90: janela de 11 s para o robô responder quem está esperando
        if (t === 0) { try { const FL = JSON.parse(localStorage.getItem('dins_fila') || '[]').map(f => f.id); const RR = RG();
          const urg = FL.filter(h => h !== id && h !== 'F20QOEL8YYLQN2S6SR47' && (!RR[h] || RR[h].reler || (+RR[h].listaT || 0) > (+RR[h].lidoT || 0) || (Date.now() - (+RR[h].lidoT || 0) > 15 * 60000 && RR[h].estado === 'alerta'))).slice(0, 2);
          for (const h of urg) { marcaVarrendo(); try { if (window.__dinsMapear0) await window.__dinsMapear0(h); } catch (e) {} marcaVarrendo(); await esp(1500); }
        } catch (e) {} }
        window.top.location.hash = '#/chats/' + id; await esp(6000);
        for (let i = 0; i < 8 && !telaPronta(id); i++) await esp(1500);
        if (window.top.location.hash === '#/chats/' + id && document.querySelector('.entries') && telaPronta(id)) return true;
      }
      return false;
    }
    function lerConversaVarredura(id) {
      const T = document.body.innerText || '';
      const tags = [...document.querySelectorAll('.MuiChip-label')].map(c => (c.textContent || '').trim()).filter(t => /^0\d|^Acima|^Q15/i.test(t));
      const hum = /Chat em atendimento com ([^\n]+)/.exec(T);
      const fone = (T.match(/(?:Home|Lar)\s*\n\s*(\d{10,13})/) || [])[1] || ((RG()[id] || {}).fone) || '';
      let L = null; try { L = lados(); } catch (e) {}
      const ent = (document.querySelector('.entries') || {}).innerText || '';
      const ms = L ? null : null;
      const nossaHumana = /\[[^\]\n]{2,40}\]/.test(ent.replace(/Enviado pelo credsegurobank/g, ''));   // mensagem nossa com [Nome] ou nota interna
      const link = /https?:\/\/(web\.c6consig|dcy\.app|\S*facta|\S*assin|signer\.ajin|\S*qualibank|\S*queromais|\S*daycoval)/i.test(ent);
      const prop = /proposta (aprovada|criada|gerada)|Novo Cr[ée]dito Dispon/i.test(ent);
      const pediuCpf = /CPF/i.test(ent) && /(me (envie|mande|passa)|informe|número do seu CPF|seu CPF)/i.test(ent);
      return { tags, humano: hum ? hum[1].trim() : '', fone, L, nossaHumana, link, prop, pediuCpf, temCpf: !!(L && L.temCpf) };
    }
    // decide UMA conversa (já aberta) → { acao: 'fecha'|'c01'|'wa'|'revisar'|'pular', caso, motivo }
    function decidirVarredura(id, nomeLista) {
      if (NAO_MEXER_HASH.includes(id) || /CONGELADO/i.test(nomeLista)) return { acao: 'pular', motivo: 'chat que não se mexe' };
      if (/^(Jair|⚫️|Romulo)/.test(String(nomeLista || nomeDoContato() || '').trim())) return { acao: 'revisar', motivo: 'nome da lista de exceções antigas (Jair, ⚫️, Romulo) — decidir à mão' };
      if (!janelaVencidaAgora()) return { acao: 'pular', motivo: 'janela aberta' };
      const c = lerConversaVarredura(id);
      if (c.humano) return { acao: 'revisar', motivo: 'chat em atendimento com ' + c.humano };
      const tem = re => c.tags.some(t => re.test(t));
      const d01 = tem(/^01 D/i);
      const lib = (GM_getValue('varre_liberados', {}) || {})[id];
      if (d01 && !lib) return { acao: 'revisar', motivo: 'tem 01 D (já contratou) — só com liberação nominal' };
      if (d01 && lib === 'so_fechar') return { acao: 'fecha', motivo: '01 D liberada para fechar sem contato' };
      if (c.tags.some(t => DESF_TAG.test(t))) return { acao: 'fecha', motivo: 'já tinha desfecho (' + c.tags.filter(t => DESF_TAG.test(t)).join(', ') + ')' };
      if ((GM_getValue('wa_bloqueados', []) || []).includes(id)) return { acao: 'revisar', motivo: 'na lista de bloqueados do WhatsApp (texto à mão)' };
      const L = c.L, u = L && L.ult;
      const OK_V = /^(ok+|okay|obrigad[oa]s?|obg|obgd[ao]?|brigad[oa]|muito obrigad[oa]|blz|beleza|t[áa] bom|certo|entendi|valeu|am[ée]m|bom dia|boa tarde|boa noite|deus aben[çc]oe|👍|🙏|❤️|😊)[\s.!,👍🙏😊❤️]*$/i;
      if (u && u.lado === 'cli' && !/^\s*bolt\b/.test(u.raw || '') && !OK_V.test((u.txt || '').trim()) && !/\b\d{3}\.?\d{3}\.?\d{3}-?\s?\d\s?\d\b/.test(u.raw || ''))
        return { acao: 'revisar', motivo: 'cliente escreveu "' + (u.txt || '').slice(0, 60) + '" e ficou sem resposta' };
      if (L && L.cpfSemRespT) return { acao: 'revisar', motivo: 'mandou CPF e ninguém respondeu (conferir margem antes de chamar)' };
      // 4.48 (André 11/11): cliente tinha dito "Não / Vou deixar / Muito pouco valor" e mesmo assim saiu follow-up pelo WhatsApp.
      // Recusa nas últimas mensagens do cliente → não manda follow-up; vai para revisar.
      const RECUSOU = /(?<![\wÀ-ÿ])(n[ãa]o (quero|desejo|tenho interesse|preciso|vou querer|vou fazer)|vou deixar|deixa (pra|para) l[áa]|sem interesse|desisto|desist[ií]|n[ãa]o me interessa|muito pouco|para de (me )?mandar|pare de (me )?mandar|me tira|n[ãa]o (me )?(mande|mandem|liguem))(?![\wÀ-ÿ])/i;
      const cliTxts = [...document.querySelectorAll('.entries [class*="entries-li"].left')].slice(-6).map(e => (e.innerText || '').replace(/\d{1,2}:\d{2}\s*(AM|PM)?/gi, '').trim());
      if (cliTxts.some(t => RECUSOU.test(t))) return { acao: 'revisar', motivo: 'cliente recusou ("' + cliTxts.find(t => RECUSOU.test(t)).slice(0, 50) + '") — não mandar follow-up' };
      const fe = faseEsteira(RG()[id] || {});
      if (fe && ['pago', 'recusada', 'falta desbloquear', 'falta anuência'].includes(fe.fase)) return { acao: 'revisar', motivo: 'esteira: ' + fe.fase + ' (' + (fe.real || '') + ')' };
      if (c.link || c.prop) return c.fone ? { acao: 'wa', caso: 'link', motivo: 'link enviado sem resposta' } : { acao: 'revisar', motivo: 'link enviado, mas sem telefone no painel' };
      if (c.temCpf && !tem(/^01 A/i)) return { acao: 'revisar', motivo: 'tem CPF sem tag (conferir margem)' };
      if (c.temCpf || c.nossaHumana) { const caso = c.temCpf ? 'atendimento' : (c.pediuCpf ? 'cpf' : 'atendimento');
        return c.fone ? { acao: 'wa', caso, motivo: c.temCpf ? 'atendimento parado (com margem)' : 'atendimento nosso sem retorno' } : { acao: 'revisar', motivo: 'precisa de follow-up, mas sem telefone' }; }
      return { acao: 'c01', motivo: 'sem interação (só o fluxo do bot)' };
    }
    async function executarOrdemVarredura(hash, acao, nota) {
      while (localStorage.getItem('dins_ordem')) await esp(3000);
      const t0 = Date.now();
      localStorage.setItem('dins_ordem', JSON.stringify({ hash, acao, quem: 'varredura', nota, t: t0 }));
      for (let i = 0; i < 60; i++) { await esp(3000); marcaVarrendo();
        let st = null; try { st = JSON.parse(localStorage.getItem('dins_ordem_status') || 'null'); } catch (e) {}
        if (st && st.hash === hash && st.t >= t0 && ['ok', 'erro'].includes(st.st)) return st.st === 'ok' ? 'ok' : ('erro: ' + (st.erro || ''));   // lição de 09/11: status FINAL e do hash certo
      }
      return 'erro: o desfecho não terminou em 3 min';
    }
    window.dinsVarreTestar = async id => { localStorage.setItem('dins_vigia_ocupado', 0); if (!await abrirHash(id)) return { erro: 'não abriu' }; const d = decidirVarredura(id, ''); const c = lerConversaVarredura(id); return Object.assign({ nome: nomeDoContato(), tags: c.tags, fone: c.fone ? '…' + c.fone.slice(-4) : '' }, d); };   // só lê e decide, não executa
    const varreNota = (txt) => 'Varredura ' + new Date().toLocaleString('pt-BR').slice(0, 16) + ' [robô] — ' + txt;
    // 5.45 (Stefany 12/11 17:08–17:13 "achar um meio termo… um não atrapalhar o outro" — aprovado):
    //  • FATIAS: a cada 5 conversas abertas, pausa de 2 min (robô do atendimento e vigia trabalham); com cliente esperando a pausa estica;
    //  • CURSOR: a rodada guarda o que já fez (GM varre_cursor); recarregou/travou → retoma sozinha do mesmo ponto até as 17h;
    //  • versão nova do robô só entra entre rodadas: localStorage dins_recarregar_depois='1' → recarrega quando a rodada acabar.
    const VARRE_FATIA = 5, VARRE_PAUSA = 2 * 60000, VARRE_LIMITE_H = 17;
    async function varrerJanelaVencida(forcarExecucao, retomar) {
      if (varrendo || rodando || fupRodando) return;
      if (!GM_getValue('varredura_ligada', true)) return;
      varrendo = true; marcaVarrendo();
      const cur0 = retomar ? GM_getValue('varre_cursor', null) : null;
      const placar = (cur0 && cur0.placar) ? Object.assign({}, cur0.placar, { fim: '', retomada: hhmm(Date.now()) }) : { versao: VERSAO, inicio: hhmm(Date.now()), lista: 0, abertos: 0, janela_aberta: 0, nao_abriu: 0, fechadas: 0, c01: 0, wa: 0, revisar: 0, erros: 0, fim: '' };
      const cursor = cur0 || { dia: new Date().toDateString(), hora: new Date().getHours(), feitos: [], forcar: !!forcarExecucao, aberto: true };
      const salva = () => { try { localStorage.setItem('dins_varredura_placar', JSON.stringify(placar)); cursor.placar = placar; cursor.t = Date.now(); GM_setValue('varre_cursor', cursor); } catch (e) {} };
      let acabou = false;
      try {
        const hoje = new Date().toDateString();
        const primeira = cur0 ? !!cur0.primeira : (GM_getValue('varre_ok_dia', '') !== hoje && !forcarExecucao); cursor.primeira = primeira;
        const itens = await colherHashes(); placar.lista = itens.length; salva();
        const plano = { dia: hoje, t: Date.now(), primeira, itens: [], lista: itens.length };
        // 4.64 (Stefany 14:13: "Varredura ainda usa a numeração antiga"): o painel lia o plano da rodada anterior
        // (43 vencidas das 09:02) até achar a 1ª conversa vencida desta rodada. Grava o plano novo já no começo.
        if (!primeira) { const ant = GM_getValue('varre_plano', null); if (ant && ant.dia === hoje && ant.aprovado) plano.aprovado = ant.aprovado; GM_setValue('varre_plano', plano); desenharVarredura(); }
        if (cur0 && Array.isArray(cur0.itensPlano)) plano.itens = cur0.itensPlano;
        let naFatia = 0;
        for (const it of itens) {
          marcaVarrendo();
          if (NAO_MEXER_HASH.includes(it.id)) continue;
          if (cursor.feitos.includes(it.id)) continue;   // 5.45: já feito antes da recarga
          if (new Date().getHours() >= VARRE_LIMITE_H) { log && log('Varredura: passou das ' + VARRE_LIMITE_H + 'h — o resto fica para a próxima rodada.', 'aviso'); break; }
          if (naFatia >= VARRE_FATIA) {   // 5.45: pausa da fatia — atendimento trabalha
            naFatia = 0; const ini = Date.now(); localStorage.setItem('dins_varre_pausa', 'fatia');
            while (Date.now() - ini < VARRE_PAUSA || (atendimentoPendente(true) && Date.now() - ini < 20 * 60000) || localStorage.getItem('dins_ordem')) { marcaVarrendo(); localStorage.setItem('dins_varre_livre', Date.now()); await esp(5000); }
            localStorage.removeItem('dins_varre_pausa');
          }
          cursor.feitos.push(it.id); naFatia++; salva();
          // 6.01: janela de 24 h ainda aberta (última mensagem do cliente há menos de 23 h 30, pelo servidor) → pula sem abrir a tela
          { const j = await apiLer(it.id, 1); const lu = j && +j.customer.lastUserMessageTimeStamp; if (j) API_PLACAR.lidas++; else API_PLACAR.falhas++;
            if (lu > 0 && Date.now() - lu < 23.5 * 3600000) { placar.janela_aberta++; API_PLACAR.puladas++; naFatia--; salva(); continue; } }   // não conta na fatia (não usou a tela)
          if (!await abrirHash(it.id)) { placar.nao_abriu++; salva(); plano.itens.push({ id: it.id, nome: it.nome, acao: 'revisar', motivo: 'não abriu' }); continue; }
          placar.abertos++;
          const d = decidirVarredura(it.id, it.nome);
          if (d.acao === 'pular') { if (d.motivo === 'janela aberta') placar.janela_aberta++; salva(); continue; }
          const c = lerConversaVarredura(it.id);
          plano.itens.push(Object.assign({ id: it.id, nome: nomeDoContato() || it.nome, fone: c.fone }, d));
          GM_setValue('varre_plano', plano); cursor.itensPlano = plano.itens;
          if (primeira) continue;   // 1ª rodada do dia: só monta a lista
          if (d.acao === 'revisar') { placar.revisar++; salva(); continue; }
          if (d.acao === 'fecha') { const r = await executarOrdemVarredura(it.id, 'fecha', varreNota('janela vencida; ' + d.motivo + '. Conversa encerrada.')); r === 'ok' ? placar.fechadas++ : placar.erros++; salva(); continue; }
          if (d.acao === 'c01') { const r = await executarOrdemVarredura(it.id, 'classifica_fecha', varreNota('janela vencida, sem CPF e sem interação → 01 C. Conversa encerrada.')); r === 'ok' ? placar.c01++ : placar.erros++; salva(); continue; }
          if (d.acao === 'wa') {
            const f = GM_getValue('wa_fila', []) || []; const ja = f.find(x => x.hash === it.id && ['pendente', 'enviado'].includes(x.estado) && Date.now() - (x.criado || 0) < 7 * 86400000);
            if (!ja) { f.push({ hash: it.id, fone: c.fone, nome: nomeSeguro(nomeDoContato() || it.nome), caso: d.caso, estado: 'pendente', criado: Date.now(), quem: 'varredura 4.27' }); /* 4.31: só nome de verdade (vazio = sem nome) */ GM_setValue('wa_fila', f); }
            placar.wa++; salva();
          }
        }
        if (primeira) { plano.aguardando = true; GM_setValue('varre_plano', plano); log && log('Varredura: 1ª rodada do dia montada (' + plano.itens.length + ' conversas vencidas) — esperando o OK da Stefany no painel.', 'ok'); }
        acabou = true;
      } catch (e) { placar.erro = String(e.message || e); log && log('Varredura parou: ' + placar.erro, 'erro'); }
      finally { placar.fim = hhmm(Date.now()); if (acabou) cursor.aberto = false; salva(); varrendo = false; localStorage.removeItem('dins_varrendo'); localStorage.removeItem('dins_varre_pausa'); try { limparFiltro(); } catch (e) {} desenharVarredura();
        if (localStorage.getItem('dins_recarregar_depois')) { localStorage.removeItem('dins_recarregar_depois'); setTimeout(() => { try { if (!localStorage.getItem('dins_ordem')) window.top.location.reload(); } catch (e) {} }, 5000); } }
    }
    // 5.45: rodada interrompida (recarga, travou) → retoma do cursor, no mesmo dia, antes das 17h, quando a aba está livre há 3 min
    setInterval(() => { try {
      if (!faz('varredura')) return;   // 5.64 papel da aba
      const c = GM_getValue('varre_cursor', null); const d = new Date();
      if (!c || !c.aberto || c.dia !== d.toDateString() || d.getHours() >= VARRE_LIMITE_H || d.getHours() < 8) return;
      if (varrendo || rodando || fupRodando || localStorage.getItem('dins_ordem') || vigiaTrava()) return;
      if (Date.now() - (+localStorage.getItem('dins_varrendo') || 0) < 3 * 60000 || Date.now() - (+c.t || 0) < 3 * 60000) return;
      log && log('Varredura: retomando a rodada das ' + c.hora + 'h de onde parou (' + c.feitos.length + ' já feitas).', 'ok');
      varrerJanelaVencida(c.forcar, true);
    } catch (e) {} }, 60000);
    // 5.46 (Stefany 12/11 17:16, caso Danie: o chat "sumiu" da lista e só voltou depois de atualizar a página): a lista do Botmaker
    // às vezes para de atualizar. Rotina: a cada 10 min, com a aba LIVRE (nada rodando, vigia parado, caixa vazia, sem varredura), recarrega.
    const CARREGOU_T = Date.now();
    setInterval(() => { try {
      if (Date.now() - CARREGOU_T < 30 * 60000) return;   // 5.97 (Stefany 10:33 "telas brancas toda hora"): 30 min, não 10
      if (meuPapel() === 'vigia') return;   // 5.97: a aba do vigia não recarrega sozinha
      if (varrendo || rodando || fupRodando || posRodando || faseRodando || espRodando || localStorage.getItem('dins_ordem') || vigiaTrava()) return;
      if (Date.now() - (+localStorage.getItem('dins_vigia_ocupado') || 0) < 2 * 60000) return;
      if (Date.now() - (+localStorage.getItem('dins_varrendo') || 0) < 3 * 60000) return;
      const ta = document.querySelector('textarea'); if (ta && ta.value.trim()) return;
      const AOr = GM_getValue('auto_ordens', {}) || {}; if (Object.values(AOr).some(o => o && ['link', 'link_enviado', 'desfecho', 'desfecho_enviado'].includes(o.estado) && Date.now() - (+o.tEnv || +o.t || 0) < 5 * 60000)) return;
      localStorage.setItem('dins_ultimo_refresh', new Date().toTimeString().slice(0, 5));
      window.top.location.reload();
    } catch (e) {} }, 60000);
    // 5.58: reler à mão — __R.dinsReler('HASH') ou __R.dinsReler('azul') (todos do azul/pausada/esgotada das últimas 48 h)
    window.dinsReler = h => { const r = RG(); let n = 0; for (const k in r) { const x = r[k]; if (!x) continue;
        if (h === 'azul' ? (['acompanhando', 'pausada', 'esgotada', 'encerrado'].includes(x.estado) && Date.now() - Math.max(+x.criadoT || 0, +x.linkT || 0, +x.ultT || 0) < 48 * 3600000) : k === h) { x.reler = 1; n++; } }
      gravaRG(r); return n; };
    window.dinsRecarregarDepois = () => { if (!varrendo && !localStorage.getItem('dins_varrendo')) { window.top.location.reload(); return 'agora'; } localStorage.setItem('dins_recarregar_depois', '1'); return 'depois da rodada'; };
    // depois que a mensagem SAIU pelo WhatsApp Web → fecha a conversa vencida no Botmaker (regra de 09/11 12:17)
    setInterval(async () => {
      if (!faz('varredura')) return;   // 5.64 papel da aba
      if (varrendo || rodando || fupRodando || localStorage.getItem('dins_ordem') || vigiaTrabalhando()) return;
      const f = GM_getValue('wa_fila', []) || []; const x = f.find(y => y.estado === 'enviado' && y.quem === 'varredura 4.27' && (!y.fechado || (typeof y.fechado === 'string' && /^erro/.test(y.fechado) && (y.fechTent || 0) < 3 && Date.now() - (y.fechT || 0) > 20 * 60000)));   // 4.68: erro ao fechar tenta de novo (até 3x, de 20 em 20 min)
      if (!x) return;
      if (!navPega('fecha')) return;
      varrendo = true; marcaVarrendo();
      try {
        if (!await abrirHash(x.hash)) return;
        if (!janelaVencidaAgora()) { x.fechado = 'não (cliente voltou e a janela reabriu — é do vigia)'; }
        else { const r = await executarOrdemVarredura(x.hash, 'fecha', varreNota('janela vencida, follow-up enviado pelo WhatsApp (' + x.caso + '). Conversa encerrada.')); x.fechado = r === 'ok' ? Date.now() : r; }
        const f2 = GM_getValue('wa_fila', []) || []; const i = f2.findIndex(y => y.hash === x.hash && y.criado === x.criado); if (i >= 0) { f2[i].fechado = x.fechado; if (typeof x.fechado === 'string' && /^erro/.test(x.fechado)) { f2[i].fechTent = (f2[i].fechTent || 0) + 1; f2[i].fechT = Date.now(); } GM_setValue('wa_fila', f2); }
      } finally { varrendo = false; navSolta('fecha'); localStorage.removeItem('dins_varrendo'); localStorage.removeItem('dins_varre_pausa'); desenharVarredura(); }
    }, 60000);
    // painel da varredura (lista da 1ª rodada com o botão de OK + resumo)
    function desenharVarredura() {
      try {
        const top = window.top.document; let q = top.getElementById('dins-varre');
        const p = GM_getValue('varre_plano', null); const pl = (() => { try { return JSON.parse(localStorage.getItem('dins_varredura_placar') || 'null'); } catch (e) { return null; } })();
        if (!p || p.dia !== new Date().toDateString()) { if (q) q.remove(); return; }
        if (!q) { q = top.createElement('div'); q.id = 'dins-varre'; q.setAttribute('translate', 'no');
          q.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483000;background:#0f172a;color:#e2e8f0;border:2px solid #a78bfa;border-radius:10px;padding:8px 10px;font:12px system-ui,sans-serif;max-width:420px;max-height:45vh;overflow:auto;box-shadow:0 6px 20px rgba(0,0,0,.4)';
          top.body.appendChild(q);
          q.addEventListener('click', ev => { if (ev.target.dataset.varreok) { window.dinsVarreOK(); localStorage.setItem('dins_varrer_executar', '1'); desenharVarredura(); }
            if (ev.target.dataset.varremin) { q.dataset.min = q.dataset.min === '1' ? '' : '1'; desenharVarredura(); }
            const id = ev.target.dataset.abrir; if (id) window.top.location.hash = '#/chats/' + id; }); }
        const esc = t => String(t || '').replace(/</g, '&lt;');
        const ROT = { fecha: '🔒 fechar', c01: '🏷 01 C + fechar', wa: '📲 WhatsApp + fechar', revisar: '👀 revisar (não mexe)' };
        const cab = `<div data-varremin="1" style="cursor:pointer;font-weight:700">🧹 Varredura ${pl ? pl.inicio + '–' + (pl.fim || '…') : ''}` +
          (pl ? ` · lista ${pl.lista} · abertas ${pl.abertos + pl.nao_abriu}/${pl.lista}` : '') + ` · ${p.itens.length} vencidas` +
          (pl ? ` · fechadas ${pl.fechadas + pl.c01} · WhatsApp ${pl.wa} · revisar ${pl.revisar}${pl.erros ? ' · erros ' + pl.erros : ''}` : '') + `</div>`;
        const botao = p.aguardando && !p.aprovado ? `<div style="margin:6px 0"><b>1ª rodada do dia:</b> confira e aprove. <button data-varreok="1" style="padding:3px 10px;border:0;border-radius:6px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">✅ Pode executar</button></div>` : '';
        const linhas = q.dataset.min === '1' ? '' : p.itens.map(i => `<div style="border-top:1px solid #334155;padding:2px 0"><span data-abrir="${i.id}" style="cursor:pointer;text-decoration:underline">${esc(i.nome)}</span> · ${ROT[i.acao] || i.acao}${i.caso ? ' (' + i.caso + ')' : ''}<br><span style="color:#94a3b8">${esc(i.motivo)}</span></div>`).join('');
        // 4.32 (Stefany 09:12: "a gente vai controlar isso onde, quando vai receber um relatório de quem foi enviado e quem não foi"):
        // fila do WhatsApp à vista no painel — cada cliente com a situação: esperando · enviado HH:MM · conversa fechada · erro (motivo).
        const hoje = new Date().toDateString(); const hm = t => t ? new Date(t).toLocaleTimeString('pt-BR').slice(0, 5) : '';
        const wf = (GM_getValue('wa_fila', []) || []).filter(x => x.quem === 'varredura 4.27' && new Date(x.criado || 0).toDateString() === hoje);
        const pausado = (+GM_getValue('wa_prox', 0) || 0) - Date.now() > 86400000; const prox = +GM_getValue('wa_prox', 0) || 0;
        const st = x => x.estado === 'enviado' ? ('✅ enviado ' + hm(x.quando) + (x.fechado ? (typeof x.fechado === 'number' ? ' · 🔒 fechada' : ' · ' + esc(String(x.fechado)).slice(0, 40)) : ' · fechando…')) : x.estado === 'erro' ? ('❌ ' + esc(x.motivo || 'erro')) : x.estado === 'arquivado' ? ('⏸ tirado: ' + esc(x.motivo || '')) : '⏳ esperando';
        const nEnv = wf.filter(x => x.estado === 'enviado').length, nPend = wf.filter(x => x.estado === 'pendente').length, nErr = wf.filter(x => x.estado === 'erro').length;
        const waCab = `<div style="margin-top:6px;border-top:2px solid #a78bfa;padding-top:4px;font-weight:700">📲 WhatsApp (outro número) hoje: ${nEnv} enviados · ${nPend} esperando · ${nErr} erro${pausado ? ' · <span style="color:#fbbf24">⏸ PAUSADO</span>' : (nPend && prox > Date.now() ? ' · próximo às ' + hm(prox) : '')}</div>`;
        const waLin = q.dataset.min === '1' ? '' : wf.map(x => `<div style="border-top:1px solid #334155;padding:2px 0"><span data-abrir="${x.hash}" style="cursor:pointer;text-decoration:underline">${esc(x.nomeOriginal || x.nome || '(sem nome)')}</span> · ${x.caso} · ${st(x)}</div>`).join('');
        q.innerHTML = cab + botao + linhas + (wf.length ? waCab + waLin : '');
      } catch (e) {}
    }
    setInterval(desenharVarredura, 20000); setTimeout(desenharVarredura, 5000);
    setInterval(() => { if (!faz('varredura')) return; if (localStorage.getItem('dins_varrer_executar')) { localStorage.removeItem('dins_varrer_executar'); const p = GM_getValue('varre_plano', null); if (p) { p.aguardando = false; GM_setValue('varre_plano', p); } varrerJanelaVencida(true); } }, 3000);

    async function varrerJanelaVencidaAntiga() {   // ⛔ substituída pela 4.27 (fica só de referência)
      if (varrendo || rodando || fupRodando) return;
      if (!GM_getValue('varredura_ligada', true)) return;
      // Stefany, 07/11 19:27: "esse robô roda de 8 da manhã às 8 da noite. Depois
      // disso, não." Vale para a rodada automática E para o "rodar agora".
      // ⚠️ 3.61 (07/11 20:45) — EXCEÇÃO DE HORÁRIO, SÓ A PEDIDO DELA E SÓ UMA VEZ.
      // O horário de 8h às 20h é decisão da Stefany e continua valendo por padrão. Mas
      // ela já pediu exceção duas vezes em 07/11 ("Abre uma exceção rode agora", 20:09;
      // "rode hoje, eu quero isso consertar", 20:27), e até aqui a única saída era mexer
      // no relógio da página, que é gambiarra. Agora existe um caminho explícito:
      //    localStorage.setItem('dins_varrer_fora_do_horario', '1')
      // Vale para UMA rodada: a chave é apagada assim que é usada, e a rodada fica
      // marcada no placar (`fora_do_horario: true`). Sem a chave, nada muda.
      // ⛔ Nunca ligar isso sozinho. Só quando ela mandar.
      const hora = new Date().getHours();
      // ⚠️ 3.62 (07/11 20:56) — Stefany: "Ele vai rodar, já decidi, de 2 em 2 horas, de
      // segunda-feira às 8 da manhã até às 4 da tarde." Substitui o 8h-20h da V3.
      const foraDoHorario = hora < 8 || hora > HORA_FIM;
      let excecaoHorario = false;
      if (foraDoHorario) {
        excecaoHorario = localStorage.getItem('dins_varrer_fora_do_horario') === '1';
        localStorage.removeItem('dins_varrer_fora_do_horario');
        if (!excecaoHorario) {
          log && log('Varredura: fora do horário (8h às ' + HORA_FIM + 'h). Não vou rodar agora.', 'erro');
          return;
        }
        log && log('Varredura: fora do horário, mas rodando por exceção autorizada.', 'ok');
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
                       classificados: 0, followup: 0, nao_abriu: 0, fim: '',
                       fora_do_horario: excecaoHorario || undefined };
      const salvaPlacar = () => { try { localStorage.setItem('dins_varredura_placar', JSON.stringify(placar)); } catch (e) {} };
      salvaPlacar();
      try {
        // ⚠️ 07/11 18:58: a versão anterior voltava ao topo e rolava a lista inteira para
        // achar CADA cliente — dois chats por minuto. Agora ela caminha a lista em ordem,
        // aproveitando a posição onde já está: a volta inteira cai para poucos minutos.
        let sc = document.querySelector('.customer-item') && document.querySelector('.customer-item').parentElement;
        for (let k = 0; k < 6 && sc && sc.scrollHeight <= sc.clientHeight + 5; k++) sc = sc.parentElement;
        const jaVistos = new Set();
        // ⚠️⚠️ 3.60 (07/11 20:42) — A LISTA É VIRTUALIZADA E PERDE ITENS SE A ROLAGEM FOR
        // RÁPIDA. Caminhando de 400px em 400px com 450ms, a rodada via só uma parte da
        // caixa. Medido em 07/11 20:41, na mesma lista, sem nada mudar entre as duas:
        //    passo 120px / 130ms, 1 volta  -> 15 conversas
        //    passo 100px / 260ms, 3 voltas -> 18 conversas  (o número certo)
        // Faltaram Fernando Espínola e Vanda Marques, ambos vencidos e com mensagem nossa.
        // Agora a lista inteira é colhida ANTES de abrir qualquer conversa — que é também
        // o único jeito seguro, porque abrir uma conversa REORDENA a lista.
        const nomesTodos = [];
        for (let volta = 0; volta < 3; volta++) {
          for (let y = 0; sc && y <= sc.scrollHeight; y += 100) {
            sc.scrollTop = y; await esp(260);
            for (const el of document.querySelectorAll('.customer-item')) {
              const n = (el.innerText.split('\n').filter(Boolean)[1] || '');
              if (n && !nomesTodos.includes(n)) nomesTodos.push(n);
            }
          }
          if (!sc) break;
        }
        if (sc) { sc.scrollTop = 0; await esp(300); }
        placar.lista = nomesTodos.length; salvaPlacar();
        log && log('Varredura: ' + nomesTodos.length + ' conversas na lista.', 'ok');
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
          // 3.60: os nomes saem da lista colhida no começo, não do que está no DOM agora.
          // Assim nenhuma conversa é perdida quando a lista reordena ao abrir uma delas.
          const nomes = nomesTodos.filter(n => !jaVistos.has(n));
          if (!nomes.length) break;
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
              // 3.62: além de anotar, põe na fila que o módulo do WhatsApp manda sozinho.
              // O caso decide o texto: quem já tem link/proposta recebe um; quem teve
              // atendimento recebe outro; quem só não respondeu ao pedido de CPF, o terceiro.
              const caso = (pf.link || pf.prop) ? 'link' : (pf.atendente ? 'atendimento' : 'cpf');
              const bloqueados = GM_getValue('wa_bloqueados', []);
              const waFila = GM_getValue('wa_fila', []);
              if (!fone) {
                log && log('Varredura: ' + nome + ' ficou sem telefone — follow-up só na lista.', 'erro');
              } else if (bloqueados.includes(hash)) {
                log && log('Varredura: ' + nome + ' está na lista de bloqueados do WhatsApp — não vou mandar.', 'ok');
              } else if (!waFila.find(x => x.hash === hash)) {
                waFila.push({ hash, fone, nome, caso, estado: 'pendente', criado: Date.now() });
                GM_setValue('wa_fila', waFila);
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
        // 3.66 (09/11 11:45) — Stefany escolheu, por ora, que o envio do WhatsApp fica
        // com o atendimento e não com o robô ("2", 09/11 11:42). Para esse combinado
        // funcionar, a fila precisa estar À VISTA: ela vivia só no GM storage, que a
        // página não enxerga, então nem ela nem o chat conseguiam ver quem estava
        // esperando sem abrir conversa por conversa.
        // ⛔ Sem CPF, sem conta e sem link — a regra de não escrever isso vale aqui também.
        try {
          const fWA = GM_getValue('wa_fila', []);
          const pend = fWA.filter(x => x.estado === 'pendente')
                          .map(x => ({ nome: x.nome, caso: x.caso, fone: x.fone, hash: x.hash }));
          localStorage.setItem('dins_followup_lista', JSON.stringify({
            quando: new Date().toLocaleString('pt-BR').slice(0, 16),
            esperando: pend.length,
            lista: pend
          }));
        } catch (e) {}
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

    // ⚠️ 3.62 (07/11 20:56) — HORÁRIO NOVO, DECIDIDO PELA STEFANY.
    // Palavras dela, 20:51: "Ele vai rodar, já decidi, de 2 em 2 horas, de segunda-feira
    // às 8 da manhã até às 4 da tarde." Isso SUBSTITUI o antigo (de 30 em 30 minutos,
    // das 8h às 20h) e substitui a decisão V3.
    // Roda às 8h, 10h, 12h, 14h e 16h — uma vez em cada uma dessas horas, em dias úteis.
    // O verificador roda de 5 em 5 min só para pegar a hora certa mesmo que a aba tenha
    // sido aberta no meio dela (abrir a aba às 8h05 ainda faz a rodada das 8h acontecer).
    setInterval(() => {
      if (!faz('varredura')) return;   // 5.64 papel da aba
      const d = new Date();
      if (!HORAS_VARREDURA.includes(d.getHours())) return;
      if (d.getDay() === 0 || d.getDay() === 6) return;          // sábado e domingo, não
      const marca = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate() + '-' + d.getHours();
      if (GM_getValue('varredura_ultima_hora', '') === marca) return;
      // 4.71: se o robô está ocupado (fechando conversa, toque, desfecho), espera a próxima volta — antes a hora era marcada
      // como feita e a rodada daquela hora se perdia.
      if (varrendo || rodando || fupRodando || localStorage.getItem('dins_ordem')) return;
      GM_setValue('varredura_ultima_hora', marca);
      log && log('Varredura: rodada das ' + d.getHours() + 'h.', 'ok');
      varrerJanelaVencida();
    }, 60000);   // 4.71: confere de minuto em minuto (antes 5 min)

    // "rodar agora", sem esperar os 30 minutos (Stefany, 07/11 18:08):
    //   localStorage.setItem('dins_varrer_agora', '1')
    // Com '1' ele respeita quem já foi visto; com 'tudo' ele esquece os vistos e
    // reavalia a lista inteira.
    setInterval(() => {
      if (!faz('varredura')) return;   // 5.64 papel da aba
      const j = localStorage.getItem('dins_varre_janela');
      if (j) {
        localStorage.removeItem('dins_varre_janela');
        if (/^padrao$/i.test(j)) GM_setValue('varre_janela', [12, 48]);
        else { const p = j.split(',').map(x => parseInt(x.trim())); if (p.length === 2 && p.every(n => n > 0)) GM_setValue('varre_janela', p); }
        log && log('Varredura: janela agora é ' + janelaVarredura().txt + '.', 'ok');
      }
      // 3.63 — jeito de mexer na fila do WhatsApp de fora (o GM storage não é
      // acessível pela página). Os dois recebem uma lista de hashes do Botmaker:
      //   localStorage.setItem('dins_wa_bloquear', '["HASH1","HASH2"]')
      //      -> nunca recebem mensagem automática
      //   localStorage.setItem('dins_wa_ja_enviado', '["HASH3"]')
      //      -> já receberam (à mão, por exemplo), não recebem de novo
      const bq = localStorage.getItem('dins_wa_bloquear');
      if (bq) {
        localStorage.removeItem('dins_wa_bloquear');
        try {
          const lista = JSON.parse(bq);
          const atual = GM_getValue('wa_bloqueados', []);
          lista.forEach(h => { if (h && !atual.includes(h)) atual.push(h); });
          GM_setValue('wa_bloqueados', atual);
          log && log('WhatsApp: ' + atual.length + ' conversa(s) bloqueada(s) para envio automático.', 'ok');
        } catch (e) { log && log('WhatsApp: lista de bloqueio inválida.', 'erro'); }
      }
      const je = localStorage.getItem('dins_wa_ja_enviado');
      if (je) {
        localStorage.removeItem('dins_wa_ja_enviado');
        try {
          const lista = JSON.parse(je);
          const f = GM_getValue('wa_fila', []);
          lista.forEach(h => {
            const i = f.findIndex(x => x.hash === h);
            if (i >= 0) { f[i].estado = 'enviado'; f[i].quando = Date.now(); }
            else f.push({ hash: h, fone: '', nome: '(marcado a mão)', caso: '', estado: 'enviado', quando: Date.now() });
          });
          GM_setValue('wa_fila', f);
          log && log('WhatsApp: ' + lista.length + ' conversa(s) marcada(s) como já enviadas.', 'ok');
        } catch (e) { log && log('WhatsApp: lista de já enviados inválida.', 'erro'); }
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
      if (!faz('atendimento')) return;   // 5.64 papel da aba
      let o; try { o = JSON.parse(localStorage.getItem('dins_link_enviado') || 'null'); } catch (e) { return; }
      if (!o || !o.hash) return;
      localStorage.removeItem('dins_link_enviado');
      window.dinsLinkEnviado(o.hash, o.fone);
    }, 3000);
  })();

    setInterval(() => { if (faz('atendimento')) vigiar(); }, 30000);
    setTimeout(() => { if (faz('atendimento')) vigiar(); }, 4000);
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
      // 5.10 (caso Marcelo 12/11: esp 32 veio na 800991 - INSS 1 DIG AOL). Daycoval confere pelo NOME (REGRAS-BANCO-DAYCOVAL §6):
      // invalidez → INSS 1 DIG AOL ESP 32/92 · demais ≥ R$ 15 mil → INSS DIG AOL 15K · demais → INSS 1 DIG AOL
      tabela: (esp, liberado) => ((typeof INVALIDEZ !== 'undefined' && INVALIDEZ.includes(esp)) || esp === '32' || esp === '92') ? 'INSS 1 DIG AOL ESP 32/92' : (liberado >= 15000 ? 'INSS DIG AOL 15K' : 'INSS 1 DIG AOL'),
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
      if (cel) { const t = so(f.telefone).replace(/^55(?=\d{10,11}$)/, ''); if (t.length < 10) throw new Error('Falta telefone (celular) na ficha'); if (so(cel.value) !== t) await digitar(cel, t); }   // 4.04: troca o celular que o portal trouxe do cadastro
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
        const casaTab = (t, alvo) => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (/^\d+$/.test(alvo)) return new RegExp('\\b' + alvo + '\\b').test(t);
          const i = t.toUpperCase().indexOf(alvo.toUpperCase()); if (i < 0) return false; const resto = t.slice(i + alvo.length); return !/^\s*(ESP|15K)/i.test(resto); };
        if (!casaTab(f._tabela_daycoval, certa)) {
          log('Tabela veio ' + f._tabela_daycoval + ' — o certo para este caso é a ' + certa + '. Trocando…');
          await clicar(/^(border_color\s*)?Editar Tabela$/i, p);  // 3.73: o botão traz o nome do ícone (border_color) no texto
          const modal = await esperar(() => [...document.querySelectorAll('div.modal-dialog, .cdk-overlay-pane')].filter(vis).find(m => /Taxa/i.test(tx(m))), 15000);
          if (!modal) throw new Error('A janela "Editar Tabela" não abriu para trocar para a ' + certa);
          const td = await esperar(() => [...modal.querySelectorAll('td')].filter(vis).find(x => /^\d+$/.test(certa) ? tx(x) === certa : casaTab(tx(x), certa)), 10000);
          if (!td) throw new Error('A tabela ' + certa + ' não aparece na lista do portal. Avise a Stefany.');
          const seta = [...td.closest('tr').querySelectorAll('i, button, mat-icon')].filter(vis).pop();
          if (!seta) throw new Error('Não achei a seta da linha da tabela ' + certa);
          seta.click(); await sleep(2500);
          await fecharAlertas();
          const novo = await esperar(() => { const m = tx(p).match(/Valor ClienteR\$ ?([\d.,]+).{0,200}?Tabela ?(\d{4,}[^]{3,40}?) ?(?:Seguro|Editar)/); return m && casaTab(m[2].replace(/border_color.*/, ''), certa) && m; }, 30000);
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
      const nome = f.nome || ''; const sx0 = (f.sexo || '').trim().toUpperCase(); const sexo = /^F/.test(sx0) ? 'FEMININO' : /^M/.test(sx0) ? 'MASCULINO' : (/A$/i.test(nome.split(' ')[0]) ? 'FEMININO' : 'MASCULINO');  // 3.74: ficha traz M/F
      await escolher(lista(/^Sexo$/), new RegExp('^' + sexo + '$'));
      await escolher(lista(/^Estado Civil$/), /^SOLTEIRO$/);
      const mae = entrada(/^Nome M[ãa]e$/);
      // 5.39 (caso Douglas 15:50): sem nome da mãe → "NÃO INFORMADO" (regra do Prompt-Atendimento: mãe que não temos → NÃO INFORMADO)
      if (mae && !mae.value) { if (!f.mae) log('Ficha sem nome da mãe → NÃO INFORMADO.', 'aviso'); await digitar(mae, f.mae || 'NAO INFORMADO'); }
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
        if (!f.cep) { const CEPUF = { SP: '01001000', RJ: '20010000', MG: '30110000', PR: '80010000', RS: '90010000', SC: '88010000', BA: '40010000', PE: '50010000', CE: '60010000', GO: '74003010', DF: '70040010', ES: '29010000', PA: '66010000', AM: '69005000', MA: '65010000', PB: '58010000', RN: '59010000', AL: '57020000', SE: '49010000', PI: '64000000', MT: '78005000', MS: '79002000', RO: '76801000', TO: '77001002', AC: '69900000', AP: '68900000', RR: '69301000' };
          const uf0 = String(f.uf || '').toUpperCase().trim(); f.cep = CEPUF[uf0] || CEPUF.SP; f.numero = f.numero || '0'; try { log('Sem CEP na ficha → endereço automático da capital (' + (uf0 || 'SP') + '), padrão do endereço aleatório.', 'aviso'); } catch (e) {} }   /* 6.10 */
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
      // 3.86 — conta DERIVADA da agência (cartão magnético: a ficha diz "sem conta aqui… derivada") não é conta real do cliente.
      const derivada = /derivada|sem conta aqui/i.test(f.conta_origem || '');
      const real = f.banco && so(f.conta).length >= 3 && f.banco !== '000' && !derivada;
      const temConta = f.banco && so(f.conta).length >= 3 && f.banco !== '000';
      // 3.48 — no Quero Mais a conta aleatória (sem banco nenhum) é a combinada (Caixa 104 / 3880 / 111113-1).
      // 3.86 — Stefany 10/11 14:16: conta recusada por "outro CPF" (derivada ou aleatória) → NUMERAÇÃO ALEATÓRIA EM SEQUÊNCIA
      //        (banco e agência do cliente, conta N da sequência, DV 8 — o mesmo contador conta_seq do Daycoval), avançando até passar.
      const seqConta = () => { const n = Math.max(GM_getValue('conta_seq', 14), 14); return { banco: bancoOk(f.banco) || '001', agencia: agOk(f.agencia) || '0001', conta: String(n), dv: '8', seq: n, daSeq: true }; };
      let c = temConta
        ? { banco: f.banco.padStart(3, '0'), agencia: agOk(f.agencia), conta: so(f.conta).slice(0, -1), dv: so(f.conta).slice(-1) }
        : (PORTAL.aleatoria ? proximaConta() : { ...proximaConta(), banco: bancoOk(f.banco) || '001', agencia: agOk(f.agencia), daSeq: true });
      const chaveRec = 'conta_recusada_' + so(f.cpf);
      if (!real && GM_getValue(chaveRec, '') === c.banco + '|' + c.conta + '-' + c.dv) { log('Essa conta já foi recusada (outro CPF) para este cliente → sequência.'); c = seqConta(); }
      const jaTem = () => [...document.querySelectorAll('*')].some(e => e.children.length === 0 && new RegExp(c.conta + '/' + c.dv).test(tx(e)));
      let incluiu = jaTem();
      for (let tent = 0; tent < 8 && !incluiu; tent++) {
        await escolher(lista(/^Banco$/, sb), new RegExp('^' + c.banco + ' -'), c.banco);
        await digitar(entrada(/^Ag[êe]ncia$/, sb), c.agencia);
        const contas = [...sb.querySelectorAll('mat-form-field')].filter(vis);
        await digitar(entrada(/^Conta$/, sb), c.conta);
        const dvs = contas.filter(x => /^DV/.test(tx(x.querySelector('label')))); const dvConta = dvs[dvs.length - 1];
        await digitar(dvConta.querySelector('input'), c.dv);
        await clicar(/^INCLUIR$/, sb);
        await sleep(1200);
        if (/outro CPF/i.test(alertas().join())) {
          await fecharAlertas();
          if (real) throw new Error('A conta do cliente (' + c.banco + ' ' + c.conta + '-' + c.dv + ') está cadastrada para outro CPF no ' + PORTAL.nome + '.');
          if (c.daSeq) GM_setValue('conta_seq', c.seq + 1);
          log(`Conta ${c.banco} ag ${c.agencia} cc ${c.conta}-${c.dv} já está em outro CPF → próxima da sequência.`);
          c = seqConta();
          continue;
        }
        // 5.39 (caso Douglas 15:55: 001/0001/33-8 "Número da conta inválido"): conta aleatória recusada como inválida → Caixa 104/3880/111113-1
        if (!real && /conta inv[áa]lid|n[úu]mero da conta/i.test(alertas().join(' ')) && c.banco !== '104') {
          await fecharAlertas(); if (c.daSeq) GM_setValue('conta_seq', c.seq + 1);
          log(`Conta ${c.banco} ${c.conta}-${c.dv} inválida → Caixa 104 ag 3880 cc 111113-1.`, 'aviso');
          c = { banco: '104', agencia: '3880', conta: '111113', dv: '1' }; continue;
        }
        await semErro('Incluir conta');
        if (c.daSeq) GM_setValue('conta_seq', c.seq + 1);   // número da sequência usado = nunca repetir
        log(`Conta incluída: ${c.banco} ag ${c.agencia} cc ${c.conta}-${c.dv}${real ? '' : (c.daSeq ? ' (aleatória da sequência)' : (derivada ? ' (derivada da agência)' : ' (aleatória combinada)'))}`);
        incluiu = true;
        break;
      }
      if (!incluiu) throw new Error('Não consegui incluir a conta depois de 8 tentativas da sequência.');
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
        GM_setValue('conta_recusada_' + so(f.cpf), c.banco + '|' + c.conta + '-' + c.dv);
        throw new Error('Conta já usada em outro CPF (só apareceu no PRÓXIMO). Anotei e na próxima vai a numeração da sequência: rode "Fazer tudo" de novo.');
      }
      await semErro('Dados complementares');
      await esperar(() => /GERAR PROPOSTAS/.test(document.body.innerText), 20000);
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
          { const t = bancoErrado(f, QM ? 'queromais' : 'daycoval'); if (t) throw new Error(t); }
          { const t = telefoneErrado(f); if (t) throw new Error(t); }
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
    // 5.11 (Stefany 12/11 10:55: o que ia para o Quero Mais volta para o Daycoval; "o robô tem que fazer"):
    // ordem automática com banco DAYCOVAL (ficha_ok, ficha guardada na própria ordem) → Fazer tudo aqui → estado 'link'
    // → o Botmaker manda simulação 1/2 + /parabens sozinho. Erro → 'erro' com o motivo (aparece no quadro como ROBÔ PAROU).
    if (!QM) {
      const AOd = () => GM_getValue('auto_ordens', {}) || {};
      const poeAOd = (h, mud) => { const O = AOd(); if (!O[h]) return; Object.assign(O[h], mud); (O[h].hist = O[h].hist || []).push(new Date().toTimeString().slice(0, 5) + ' ' + (mud.estado || '') + (mud.erro ? ': ' + mud.erro : '')); GM_setValue('auto_ordens', O); };
      let autoD = false;
      setInterval(async () => {
        // 5.39 (caso Douglas: ficha_ok DAYCOVAL parada 10 min): só um diálogo VISÍVEL segura o executor (as janelas "Editar Tabela" ficam escondidas na página)
        if (autoD || rodando || /\/login/.test(location.pathname) || [...document.querySelectorAll('.cdk-overlay-pane .mat-mdc-dialog-container, .modal.show')].some(e => vis(e))) return;
        // recuperação: proposta gerada aqui pelo painel (à mão) para um cliente cuja ordem parou em "banco DAYCOVAL é à mão" → devolve o link ao Botmaker
        try { const r = GM_getValue('daycoval_resultado', null); const cp = x => String(x || '').replace(/\D/g, '').replace(/^0+/, '');
          if (r && r.link && Date.now() - Date.parse(r.quando) < 60 * 60000) { const O = AOd(); const q = Object.values(O).find(x => x && x.tipo === 'cpf' && ['com_margem', 'erro'].includes(x.estado) && cp(x.cpf) === cp(r.cpf) && /DAYCOVAL/.test(x.resumo || x.erro || '') && x.propD !== r.proposta);
            if (q) { poeAOd(q.hash, { estado: 'link', link: r.link, proposta: r.proposta, liberado: r.liberado, parcela: r.parcela, prazo: r.prazo || '108', banco: 'DAYCOVAL', bancoConta: '', propD: r.proposta }); return; } } } catch (e) {}
        const o = Object.values(AOd()).find(x => x && x.tipo === 'cpf' && x.estado === 'ficha_ok' && x.banco === 'DAYCOVAL' && x.ficha && x.ficha.cpf);
        if (!o) return;
        autoD = true;
        try {
          if (/dados-cliente|dados-complementares|resumo|formalizacao|pagina-inicial|proposta-pesquisa/.test(location.pathname)) {   // tela de um cliente anterior / página inicial → menu (nunca F5) — 5.42
            const m = [...document.querySelectorAll('a,button,li,span')].find(e => vis(e) && /^Simula[çc][ãa]o de Ofertas$/i.test(tx(e)));
            if (m) m.click(); await sleep(4000); return;
          }
          GM_setValue('ficha_atual', o.ficha);
          poeAOd(o.hash, { estado: 'digitando' });
          const t0 = Date.now();
          const b = [...p.querySelectorAll('button')].find(x => x.dataset.a === 'Fazer tudo'); if (!b) throw new Error('botão Fazer tudo não está na tela');
          b.click();
          let st = null;
          for (let i = 0; i < 240 && !st; i++) { await sleep(2500); try { const s0 = JSON.parse(localStorage.getItem('dins_daycoval_status') || 'null'); if (s0 && s0.t >= t0 && (s0.st === 'ok' || s0.st === 'erro')) st = s0; } catch (e) {} }
          if (!st) throw new Error('a digitação no Daycoval não terminou em 10 min');
          if (st.st === 'erro') throw new Error(st.erro || 'erro no portal');
          const f = o.ficha, so0 = x => String(x || '').replace(/\D/g, ''), bc = so0(f.banco).padStart(3, '0');
          const real = f.banco && so0(f.conta).length >= 3 && f.banco !== '000' && !/derivada|sem conta aqui/i.test(f.conta_origem || '');
          poeAOd(o.hash, { estado: 'link', link: st.link, proposta: st.proposta, liberado: st.liberado, parcela: st.parcela, prazo: st.prazo || '108', banco: 'DAYCOVAL', bancoConta: real ? (NOME_BANCO[bc] || '') : '', ficha: undefined, propD: st.proposta });
        } catch (e) { poeAOd(o.hash, { estado: 'erro', erro: 'Daycoval: ' + String(e.message || e) }); }
        finally { autoD = false; }
      }, 15000);
    }
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
      if (!f.mae && !campo(/^Nome da mãe$/).value) { f.mae = 'NAO INFORMADO'; try { log('Sem nome da mãe na ficha → NAO INFORMADO (padrão da Stefany 13/11 13:08).', 'aviso'); } catch (e) {} }   // 6.08: antes parava com erro
      await preencher(/^Nome da mãe$/, f.mae);
      await combo(/^Tipo de documento$/, 'CPF', /^CPF$/);
      const doc = campo(/^Número do documento$/); if (so(doc.value) !== f.cpf) await digitar(doc, f.cpf);
      const de = campo(/^Data da emissão$/); if (de && !de.value) { de.focus(); setter.call(de, dataISO(PADRAO.dt_emissao)); de.dispatchEvent(new Event('input', { bubbles: true })); de.dispatchEvent(new Event('change', { bubbles: true })); de.dispatchEvent(new Event('blur', { bubbles: true })); }
      await combo(/^Órgão emissor$/, 'SECRETARIA', /SECRETARIA DA SEGURAN/);
      await combo(/^UF$/, f.uf, new RegExp('^' + f.uf + '$'));
      const sx1 = (f.sexo || '').trim().toUpperCase(); const sexo = /^F/.test(sx1) ? 'FEMININO' : /^M/.test(sx1) ? 'MASCULINO' : (/A$/i.test((f.nome || '').split(' ')[0]) ? 'FEMININO' : 'MASCULINO');  // 3.74
      await combo(/^Sexo$/, sexo.slice(0, 4), new RegExp('^' + sexo + '$', 'i'));
      await combo(/^Estado de nascimento$/, f.uf, new RegExp('^' + f.uf + '$'));
      const cn = campo(/^Cidade de nascimento$/);
      if (cn && !cn.value) { if (cn.getAttribute('role') === 'combobox') await combo(/^Cidade de nascimento$/, f.cidade || '', new RegExp('^' + (f.cidade || 'x') + '$', 'i')); else await digitar(cn, f.cidade || ''); }
      await combo(/^Estado civil$/, 'SOLT', /^SOLTEIRO$/);
      const cel = campo(/^Celular$/); const t = so(f.telefone).replace(/^55(?=\d{10,11}$)/, '');
      if (cel && so(cel.value) !== t) { if (t.length < 10) throw new Error('Falta celular na ficha'); await digitar(cel, t); await sleep(1500); }   // 4.04
      // v3.16: BMG não aceita o mesmo e-mail em CPFs diferentes → naoinformado1@, 2@, 3@… (sequência)
      const em = campo(/^Email$/); if (em && !em.value) { let mail = f.email; if (!mail || /^naoinformado@/i.test(mail)) { const n = GM_getValue('email_seq', 1); mail = 'naoinformado' + n + '@gmail.com'; GM_setValue('email_seq', n + 1); log('E-mail usado: ' + mail); } await digitar(em, mail); }
      await combo(/^Grau de instrução$/, 'NAO', /N[ÃA]O DECLARADO/);
      // v3.12: a UF do documento às vezes não fica gravada (mostra RR mas o BMG acusa "UF") → seleciona de novo no fim
      await sleep(500); await combo(/^UF$/, f.uf, new RegExp('^' + f.uf + '$'));
      // endereço
      const cep = campo(/^CEP$/); if (cep && !so(cep.value)) { if (!f.cep) { const CEPUF = { SP: '01001000', RJ: '20010000', MG: '30110000', PR: '80010000', RS: '90010000', SC: '88010000', BA: '40010000', PE: '50010000', CE: '60010000', GO: '74003010', DF: '70040010', ES: '29010000', PA: '66010000', AM: '69005000', MA: '65010000', PB: '58010000', RN: '59010000', AL: '57020000', SE: '49010000', PI: '64000000', MT: '78005000', MS: '79002000', RO: '76801000', TO: '77001002', AC: '69900000', AP: '68900000', RR: '69301000' };
          const uf0 = String(f.uf || '').toUpperCase().trim(); f.cep = CEPUF[uf0] || CEPUF.SP; f.numero = f.numero || '0'; try { log('Sem CEP na ficha → endereço automático da capital (' + (uf0 || 'SP') + '), padrão do endereço aleatório.', 'aviso'); } catch (e) {} }   /* 6.10: PADRAO-ENDERECO-ALEATORIO (cliente não mandou endereço → aleatório) */ await digitar(cep, f.cep); await esperar(() => (campo(/^Endereço$/) || {}).value, 10000); }
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
      if (margem < 25) return 'sem margem';
      // trava de reforço: nada de consulta paga para quem a tabela de bancos já descarta
      const dd = decidirBanco(f);
      if (dd.banco === 'NAO' || dd.banco === 'HUMANO') return 'fora dos critérios (' + dd.motivo + ')';
      // v3.84 (Stefany 10/11 13:01): piso da flash = R$ 100 de margem (nossa parcela mínima). Abaixo disso não gasta consulta.
      if (margem < 100) return 'margem abaixo de R$ 100 (nossa parcela mínima)';
      if (margem < 200 && temEmprestimo) return 'margem abaixo de R$ 200 e já tem empréstimo';
      if (h < 8 || h >= 18) return 'fora do horário (8h–18h)';
      // v3.82 (Stefany 10/11 12:55, caso Idervã): NÃO existe "flash fora do ar". A falha de um cliente (ex.: "não foram
      // encontrados", crédito) não pode bloquear a flash dos próximos. Todo cliente elegível faz a flash, sempre.
      GM_setValue('flash_fora_ate', 0);
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
      // v3.85 (Stefany 10/11 13:01): flash SÓ para quem CONFIRMOU a simulação (texto "1/sim", opção numerada do bot ou
      // valor + "Sim desejo contratar"). Quem ainda não confirmou — digitação só para mandar o link no /parabens — não
      // gasta flash. O vigia marca o aceite na aba do Multicorban: localStorage.dins_aceite = '<CPF ou benefício>|AAAA-MM-DD'.
      try {
        const [chA, diaA] = String(localStorage.getItem('dins_aceite') || '').split('|');
        const hojeA = new Date().toISOString().slice(0, 10);
        const cpfA = String(f.cpf || '').replace(/\D/g, '');
        if (!(chA && diaA === hojeA && (chA === String(f.beneficio) || chA === cpfA)))
          return 'cliente ainda não confirmou a simulação (flash só depois do aceite — marque dins_aceite)';
      } catch (e) {}
      // v3.83 (Stefany 10/11 13:01): quando o cliente manda o extrato de empréstimo DO DIA, o vigia olha o extrato e
      // não se gasta flash. O vigia marca na aba do Multicorban: localStorage.dins_extrato_hoje = '<CPF ou benefício>|AAAA-MM-DD'.
      try {
        const [chave, dia] = String(localStorage.getItem('dins_extrato_hoje') || '').split('|');
        const hoje = new Date().toISOString().slice(0, 10);
        const cpfF = String(f.cpf || '').replace(/\D/g, '');
        if (chave && dia === hoje && (chave === String(f.beneficio) || chave === cpfF)) return 'cliente mandou o extrato de hoje (o vigia confere pelo extrato)';
      } catch (e) {}
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
        // 4.04 — telefone = WhatsApp do chat (Botmaker). O do cadastro do Multicorban NÃO vale (caso Vilson).
        { const zap = zapDoCpf(f.cpf);
          if (zap) { f.telefone = zap; f.telefone_origem = 'WhatsApp do chat (Botmaker)'; }
          else { f.telefone = ''; f.telefone_origem = 'FALTA — abra o chat do cliente no Botmaker e gere a ficha de novo (o telefone do cadastro não vale)'; } }
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
        else if (margem < 25)                f.recusa = 'SEM_MARGEM|01 I|/n30';   // 5.16 (Stefany 12/11 11:25): mínimo R$ 25
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
                // v3.82: sem trava de 30 min — a próxima ficha tenta a flash de novo normalmente.
                await fecharAviso();
                const antes2 = aviso();
                await consultar('normal', f.beneficio);
                if (!await esperarConsulta(25000, antes2)) { log('A consulta normal também não voltou. Refaça na mão.', 'erro'); return; }
              }
              const rF = await gerarFicha();   // refaz a ficha com o que está na tela agora
              // 4.67 (11/11 14:40, erro 90): depois da flash a tela ficava em "OnlineFlash" e a próxima consulta à mão saía PAGA.
              try { await sleep(800); const o = document.getElementById('offline'); if (o && !o.checked) o.click(); await sleep(600); const c = document.getElementById('cpf'); if (c && !c.checked) c.click(); log('Tela voltou para Inss + CPF (a próxima consulta não sai como flash).', 'ok'); } catch (e) {}
              return rF;
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
        if (/^WhatsApp/i.test(f.telefone_origem || '')) log('Telefone: WhatsApp do chat do Botmaker (' + f.telefone + ').', 'ok');
        else log('⛔ Telefone: não achei o WhatsApp deste CPF no Botmaker. Abra o chat do cliente (com o CPF na conversa) e gere a ficha de novo. Sem isso a digitação não anda.', 'erro');
        log('Complete e-mail e endereço (se o cliente mandou) e clique Salvar ficha.');
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
            // 4.12 — valor pedido é o MÍNIMO (Stefany 10/11 18:10: "pediu 5 mil é 5 mil para cima, não manda 4.995 nunca mais"): folga de 0,3% + arredonda para cima.
            const pNec = Math.ceil(pedido * 648.39 / 28400 * 1.003 * 100) / 100;
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
        // 4.82: guarda o DDB por nome e CPF (regra do desbloqueio: só pede com DDB ≥ 91 dias)
        try { if (f.ddb && /\d{2}\/\d{2}\/\d{4}/.test(f.ddb)) { const D = GM_getValue('ddb_cli', {}) || {}; const nn = String(f.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); if (nn) D['N:' + nn] = f.ddb; if (f.cpf) D['C:' + String(f.cpf).replace(/\D/g, '')] = f.ddb; GM_setValue('ddb_cli', D); } } catch (er) {}
        if (f.recusa) {
          const r = f.recusa.split('|');
          // deixa a ordem pronta para o robô de desfecho do Botmaker
          try { localStorage.setItem('dins_ficha_recusa', JSON.stringify({ cpf: f.cpf, nome: f.nome, motivo: r[0], tag: r[1], oque: r[2], t: Date.now() })); } catch (er) {}
          log(`Ficha salva como RECUSA (${r[0]}). No Botmaker: tag ${r[1]} · ${r[2]}`, 'erro');
        } else if (['QUEROMAIS', 'DAYCOVAL'].includes((f.banco_destino || '').toUpperCase())) {
          log('Ficha salva. Abra o portal do ' + ((f.banco_destino || '').toUpperCase() === 'DAYCOVAL' ? 'Daycoval' : 'Quero Mais') + ' (pelo menu, sem F5) e clique "Fazer tudo".', 'ok');
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
    // 4.80 (Stefany 11/11 19:09, caso Mauro: "eu tenho tabela sem carência, liberando até mais… o robô tá clicando automático sem analisar"):
    // a FACTA escreve a carência como "90 DIAS" — não era pego e o robô escolheu a #1 (71722 … 90 DIAS SB, R$ 54.797,87) em vez da
    // 71684 sem carência (R$ 57.985,14). Carência só com pedido (f.carencia / prazo_ordem_stefany). ILETRADO só para cliente iletrado.
    const querCar = /car[êe]ncia|90\s*dias/i.test(String(f.carencia || '') + ' ' + String(f.prazo_ordem_stefany || '') + ' ' + String(f.banco_ordem_stefany || ''));
    if (!querCar) { const semCar = cand.filter(x => !/\(\+?\s*\d+\s*d\s*Car\)|car[êe]ncia|\b\d{2,3}\s*DIAS\b/i.test(x.innerText)); if (semCar.length) cand = semCar; }
    if (!/iletrad/i.test(String(f.obs || '') + String(f.iletrado || ''))) { const semIlet = cand.filter(x => !/ILETRAD/i.test(x.innerText)); if (semIlet.length) cand = semIlet; }
    if (!cand.length) throw new Error(invalidez ? 'Sem tabela INVAL 1,85%.' : 'Sem tabela DWeb-ML (sem INVAL) 1,85%.');
    // 3.89 — C6: a faixa de TICKET do nome tem que bater com o liberado da linha ("Tkt ate 6k" · "Tkt 6k a 20k" · "Tkt > 20k").
    // Caso Estefania 10/11: R$ 12.684,50 gravado na "Tkt ate 6k" → esteira PEN / AJUSTAR TABELA, link nunca saiu.
    const libDe = x => num(((x.innerText.match(/R\$\s*[\d.,]+/g) || []).pop() || '').replace('R$', ''));
    const faixaOk = x => { const t = x.innerText, v = libDe(x);
      if (/Tkt\s*at[ée]\s*6k/i.test(t)) return v <= 6000;
      if (/Tkt\s*6k\s*a\s*20k/i.test(t)) return v > 6000 && v <= 20000;
      if (/Tkt\s*>\s*20k/i.test(t)) return v > 20000;
      return true; };
    const naFaixa = cand.filter(faixaOk);
    if (pagina === 'c6' && cand.some(x => /Tkt/i.test(x.innerText))) {
      if (!naFaixa.length) throw new Error('Nenhuma tabela C6 com a faixa de ticket certa para o valor. Confira a simulação na tela.');
      cand = naFaixa;
    }
    // 4.80: entre as que sobraram, a que LIBERA MAIS para a mesma parcela (antes era sempre a primeira da lista)
    const escolhida = cand.slice().sort((a, b) => libDe(b) - libDe(a))[0];
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
    // 5.71 (caso Maria Sandra C6 980035912, 12/11 19:49: gravou MASCULINO — a ficha veio sem sexo e o campo ficou no padrão)
    try { const e = el('sexo'); if (e) { const sx = (f.sexo || '').trim().toUpperCase(); const fem = /^F/.test(sx) ? true : /^M/.test(sx) ? false : /A$/i.test((f.nome || '').trim().split(/\s+/)[0] || '');
      const opt = [...e.options].find(o => fem ? /fem/i.test(o.text) : /masc/i.test(o.text));
      if (opt && e.value !== opt.value) { if ($ && $(e).selectpicker) { $(e).selectpicker('val', opt.value); $(e).trigger('change'); } else { e.value = opt.value; e.dispatchEvent(new Event('change', { bubbles: true })); } }
      if (opt) log('Sexo: ' + opt.text + (sx ? '' : ' (pelo primeiro nome — a ficha veio sem sexo)')); } } catch (e) {}
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
    // 4.39 (caso Jairo 11/11 10:25): no C6 a cidade pode ser um campo de texto (sem .options) → "Cannot read properties of undefined (reading 'length')"
    if (cid && !cid.value && !cid.options) { if (f.cidade) { setv(cidId, f.cidade.toUpperCase()); log('Cidade: ' + f.cidade, 'ok'); } }
    else if (cid && !cid.value) {
      const est = el('estado');
      if ($ && est) { $(est).selectpicker && $(est).selectpicker('val', est.value); $(est).trigger('change'); }
      await esperar(() => cid.options.length > 5, 15000, 500);
      const alvo = (f.cidade || '').trim().toUpperCase();
      const opt = [...cid.options].find(o => o.text.trim().toUpperCase() === alvo);
      if (opt) { if ($ && $(cid).selectpicker) $(cid).selectpicker('val', opt.value); else cid.value = opt.value; $ && $(cid).trigger('change'); log('Cidade: ' + opt.text, 'ok'); }
      else log('Cidade não preenchida' + (alvo ? ' (' + alvo + ' não achada)' : '') + '. Escolha na tela.', 'erro');
    }
    const origem = el('proposta-origem_venda'); if (origem && $) { $(origem).selectpicker && $(origem).selectpicker('val', ''); }
    // 4.65 (Stefany 11/11 14:39): na Qualibank NUNCA deixar marcado "Documentos enviados pelo próprio cliente durante a
    // formalização" — quem anexa o documento somos nós. (Antes o robô marcava.) Desmarca se vier marcado.
    if (pagina === 'qualibank') {
      const ck = el('check-documentos_formalizacao');
      if (ck && ck.checked) { ck.click(); await sleep(300); if (ck.checked) { ck.checked = false; ck.dispatchEvent(new Event('change', { bubbles: true })); } }
      if (ck) log(ck.checked ? '⚠️ "Documentos enviados pelo cliente" continua MARCADO — desmarque na tela antes de gravar.' : 'Desmarcado: documentos enviados pelo cliente (nós anexamos).', ck.checked ? 'erro' : 'ok');
    }
    log('Dados pessoais preenchidos.', 'ok');
  }

  // ---- 4. Banco: Histórico Bancário (salvo no sistema) > ficha (Multicorban) > 0001/001-1
  async function dadosBancarios(f) {
    // 6.00 (Stefany 13/11 11:15, Michele digitada 2x com a conta errada): conta INFORMADA PELO CLIENTE vence o Histórico Bancário
    const contaDoCliente = /cliente/i.test(f.conta_origem || '') && so(f.banco) && so(f.conta);
    if (!contaDoCliente) el('btn-historico-bancario').click(); else log('Conta informada pelo cliente — NÃO uso o Histórico Bancário.', 'ok');
    const pick = contaDoCliente ? 'vazio' : await esperar(() => {
      const m = el('integrationsv2-bank-history-modal');
      if (!m || !m.classList.contains('show')) return null;
      const b = m.querySelector('.iv2-bh-pick');
      if (b) return b;
      return /nenhum|n[ãa]o h[áa]|sem hist|n[ãa]o encontrad/i.test(m.innerText) ? 'vazio' : null;   // 5.19: "Cliente não encontrado." = vazio
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
      // 5.17 (REGRA-CONTA-BANCARIA §2, caso Josias 12/11): nem o banco em lugar nenhum + cliente AINDA NÃO ACEITOU (ordem automática de simulação + link)
      // → Caixa 104 / 3880 / 111113-1 poupança direto, sem pedir conta. Quem já aceitou continua: /08 + 30 min.
      else if (f.aleatoria_ok) { banco = '104'; agRaw = '3880'; contaCheia = '1111131'; origemConta = 'aleatória Caixa (sem banco em lugar nenhum; ainda não aceitou)'; log && log('Sem banco em lugar nenhum e ainda não aceitou → Caixa 104 / 3880 / 111113-1 (aleatória).'); }
      else throw new Error('Cliente SEM BANCO: NÃO gravar. Confira o FullConsig (banco "V8" não vale). Se não houver banco em lugar nenhum, mande o /08 pedindo a conta.');
      banco = banco.padStart(3, '0');
      let agencia = agOk(agRaw);
      // 4.62 (Stefany 13:54, caso Mauro): no QUALIBANK a conta aleatória da Caixa vai com agência 0001 — a 3880 é recusada
      // ("Banco da conta bancária não permitido").
      if (pagina === 'qualibank' && banco === '104' && agencia === '3880') { agencia = '0001'; log && log('Qualibank + Caixa aleatória: agência 0001 (a 3880 o Qualibank não aceita).'); }
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
  // 4.09 — trava também o clique DIRETO no botão Gravar (inclusive o do vigia): prazo curto sem ordem não grava.
  try {
    document.addEventListener('click', ev => {
      const b = ev.target && ev.target.closest && ev.target.closest('#btn_gravar_proposta'); if (!b) return;
      let f = {}; try { const ta = [...document.querySelectorAll('textarea')].find(t => /banco_destino/.test(t.value)); if (ta) f = textoParaFicha(ta.value); } catch (e) {}
      const t = prazoProibido(f, (el('prazo') || {}).value);
      if (t) { ev.preventDefault(); ev.stopImmediatePropagation(); try { log(t, 'erro'); } catch (e) {} window.__dinsPrazoBloqueado = Date.now(); }
    }, true);
  } catch (e) {}
  async function gravarELink(f) {
    { const t = prazoProibido(f, (el('prazo') || {}).value); if (t) throw new Error(t); }
    // 4.12 — liberado abaixo do valor que o cliente pediu NÃO grava
    { const ped = num(f.valor), lib = num(f._liberado); if (ped > 0 && lib > 0 && lib < ped) throw new Error(`⛔ Liberado R$ ${brl(lib)} abaixo do pedido R$ ${brl(ped)}: aumente a parcela (o cliente pediu ${brl(ped)} → tem que ser ${brl(ped)} ou mais).`); }
    // 6.01 (Stefany 13/11 11:50): no C6, cliente com 2 propostas em andamento → a 3ª é REPROVADA sozinha. Não grava: o vigia pede à Stefany quais cancelar.
    if (pagina === 'c6' && !window.__dinsC6TerceiraOk) { try { const cpfL = String(f.cpf || '').replace(/\D/g, '').replace(/^0+/, ''); const E = GM_getValue('esteira', {}) || {}; const vistos = new Set();
      const ativas = Object.keys(E).filter(k => k.startsWith('C:')).map(k => E[k]).filter(r => r && String(r.cpf || '').replace(/^0+/, '') === cpfL && /C6/i.test(r.banco || '') && Date.now() - (+r.t || 0) < 3 * 24 * 3600000 && !/cancel|reprov|pag[oa]\b|integrad|finaliz|recusad/i.test((r.status || '') + ' ' + (r.statusBanco || '') + ' ' + (r.real || ''))).filter(r => { const k = r.link || r.status + r.nome; if (vistos.has(k)) return false; vistos.add(k); return true; });
      if (ativas.length >= 2) throw new Error('⛔ C6: o cliente já tem ' + ativas.length + ' propostas em andamento — o C6 REPROVA a 3ª. Pedir à Stefany quais cancelar (claude/PADRAO-CANCELAMENTO-C6.md). Depois: window.__dinsC6TerceiraOk = true e Gravar.');
    } catch (e) { if (/C6: o cliente já tem/.test(e.message)) throw e; } }
    const bv = so((el('banco') || {}).value);
    if (!bv || /^0+$/.test(bv)) throw new Error('Sem banco preenchido (000/vazio): proposta NÃO gravada. Peça a conta ao cliente (/08).');
    el('btn_gravar_proposta').click();
    const modal = await esperar(() => {
      const m = [...document.querySelectorAll('.modal.show, .swal2-popup')].find(x => /Proposta gerada|criada com sucesso|erro|inv[áa]lid/i.test(x.innerText));
      return m || null;
    }, 75000, 500);   // 4.81: o Qualibank demora mais de 30 s para mostrar "Proposta gerada!" (caso Mauro 19:12)
    if (!modal) throw new Error('Não apareceu confirmação. Veja se faltou algum campo (a tela rola até ele).');
    if (!/Proposta gerada|criada com sucesso/i.test(modal.innerText)) throw new Error('Banco recusou: ' + modal.innerText.slice(0, 200));
    const nro = (modal.innerText.match(/N[º°o]\s*([A-Z]{0,4}\d+)/) || [])[1] || '';   // 4.81: Qualibank "QUA0003227745"
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
        { const g = GM_getValue('ficha_atual'); if (g && g.aleatoria_ok && so(g.cpf) === so(f.cpf)) f.aleatoria_ok = 1; }   // 5.20: a marca da aleatória não passa pelo texto da ficha
        if (!so(f.cpf) || !so(f.beneficio) || !num(f.parcela)) return log('Ficha precisa de cpf, beneficio e parcela.', 'erro');
        if (f.recusa) return log('Ficha marcada como RECUSA (' + f.recusa.split('|')[0] + '). NÃO digitar.', 'erro');
        if (['NAO', 'HUMANO'].includes((f.banco_destino || '').toUpperCase())) return log('Ficha marcada como ' + f.banco_destino + '. Não digitar.', 'erro');
        { const t = bancoErrado(f, pagina); if (t) return log(t, 'erro'); }
        { const t = telefoneErrado(f); if (t) return log(t, 'erro'); }
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
        { const t = bancoErrado(f, pagina); if (t) return log(t, 'erro'); }
        { const t = telefoneErrado(f); if (t) return log(t, 'erro'); }
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

  // ===========================================================================
  // 3.62 (07/11/2026, 21:00) — FOLLOW-UP PELO WHATSAPP, AUTOMÁTICO
  // ---------------------------------------------------------------------------
  // Decisão da Stefany, 07/11 20:51: perguntada quem manda a mensagem de
  // follow-up para o cliente, respondeu "O robô manda sozinho". E às 20:56:
  // "Deixa tudo certinho no robô, tudo programadinho."
  //
  // Como funciona: a varredura roda no Botmaker e, quando acha uma conversa com
  // a janela vencida que TEVE interação, além de anotar na fila de follow-up ela
  // põe o cliente na fila `wa_fila`. Este módulo roda no WhatsApp Web, pega a
  // fila e manda, um por vez.
  //
  // ⚠️ O texto saiu dos três casos que a Stefany aprovou em 07/11 20:54 ("o texto
  // do seu ficou com 3 situações, ficou mais completo"), no mesmo tom do que a
  // equipe já usava à mão no WhatsApp.
  //
  // ⚠️⚠️ TRAVAS DE SEGURANÇA — mexer aqui com muito cuidado:
  //   1. Só manda para quem a varredura pôs na fila. Nunca varre o WhatsApp.
  //   2. Confere o número do CABEÇALHO da conversa antes de digitar (erro 16).
  //   3. Uma mensagem por cliente: depois de enviado, o item fica 'enviado'.
  //   4. Teto de WA_MAX_RODADA por rodada.
  //   5. Respeita o mesmo horário da varredura (dia útil, 8h às 16h).
  //   6. `wa_bloqueados` nunca recebem nada (hash do Botmaker).
  // ===========================================================================
  // ================================================================== 4.24 C6 AUTORIZADOR — AVERBE JA AUTOMÁTICO (lista manual)
  // Só clica para os nomes em GM 'averbar' (ativo). A cada `cada` ms por nome (padrão 60 s): Pesquisar por Nome Cliente → se a ATIVIDADE é
  // "AVERBE JA", clica nela → pesquisa de novo e grava o resultado. Saiu de AVERBE JA (anuência, averbada, outra) → para e marca
  // para o vigia avisar/mandar a anuência. ⛔ Nunca clica em Cancelar/Reprova nem em nada além do link "AVERBE JA" da linha do cliente.
  if (location.host === 'c6.c6consig.com.br' && window.top === window) {
    const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    try { W.confirm = () => true; W.alert = () => {}; } catch (e) {}
    const A = () => GM_getValue('averbar', {}) || {};
    const poe = (k, mud) => { const a = A(); if (!a[k]) return; Object.assign(a[k], mud); GM_setValue('averbar', a); };
    const ST = () => { try { return JSON.parse(sessionStorage.getItem('dins_av') || 'null'); } catch (e) { return null; } };
    const setST = v => v ? sessionStorage.setItem('dins_av', JSON.stringify(v)) : sessionStorage.removeItem('dins_av');
    const linhaDe = nome => { const g = document.querySelector('#ctl00_Cph_AprCons_grdConsulta'); if (!g) return null;
      const rows = [...g.querySelectorAll('tr')]; const head = rows[0] ? [...rows[0].children].map(c => c.innerText.trim().toUpperCase()) : [];
      const iA = head.findIndex(h => h === 'ATIVIDADE'); const iS = head.findIndex(h => /^SITUA/.test(h));
      const r = rows.slice(1).find(tr => tr.innerText.toUpperCase().includes(nome)); if (!r) return { achou: false };
      const c = [...r.children]; return { achou: true, r, ativ: iA >= 0 && c[iA] ? c[iA].innerText.trim() : '', sit: iS >= 0 && c[iS] ? c[iS].innerText.trim() : '',
        link: [...r.querySelectorAll('a')].find(a => /^AVERBE JA$/i.test(a.innerText.trim())) }; };
    const tick = () => {
      try {
        try { W.confirm = () => true; W.alert = () => {}; } catch (e) {}
        const a = A(); const ativos = Object.keys(a).filter(k => a[k].ativo); let st = ST();
        if (st && Date.now() - st.t > 3 * 60000) { setST(null); st = null; }
        if (!ativos.length && !st) return;
        const naTela = /AprovacaoConsulta/i.test(location.pathname);
        const devido = ativos.find(k => Date.now() - (a[k].ultT || 0) >= (a[k].cada || 60000));
        if (!naTela) { if (!st && !devido) return; const l = [...document.querySelectorAll('a')].find(x => /Aprova[çc][ãa]o \/ Consulta/i.test(x.innerText));
          if (l) location.href = l.href; else if (/login|Login/i.test(document.body.innerText.slice(0, 500)) || document.querySelector('input[type=password]')) { ativos.forEach(k => poe(k, { erro: 'Autorizador pedindo login' })); }
          return; }
        const sel = document.querySelector('#ctl00_Cph_AprCons_cbxPesquisaPor_CAMPO'), txt = document.querySelector('#ctl00_Cph_AprCons_txtPesquisa_CAMPO'), bt = document.querySelector('#btnPesquisar_txt');
        if (!sel || !txt || !bt) return;
        const pesquisar = nome => { if (sel.value !== 'Nome Cliente') { sel.value = 'Nome Cliente'; sel.dispatchEvent(new Event('change', { bubbles: true })); return; } txt.value = nome; setTimeout(() => bt.click(), 300); };
        if (!st) { if (!devido) return; setST({ nome: devido, fase: 'busca', t: Date.now() }); pesquisar(devido); return; }
        const L = linhaDe(st.nome);
        if (st.fase === 'busca') {
          if (!L || txt.value.trim().toUpperCase() !== st.nome) { pesquisar(st.nome); return; }
          if (!L.achou) { poe(st.nome, { ultT: Date.now(), res: 'não achei a proposta pelo nome', resT: Date.now() }); setST(null); return; }
          if (L.link) { setST({ nome: st.nome, fase: 'clicou', t: Date.now(), antes: L.ativ }); const lk = L.link; setTimeout(() => lk.click(), 300); return; }
          poe(st.nome, { ultT: Date.now(), res: L.ativ || L.sit, resT: Date.now(), ativo: false, avisado: false }); setST(null); return;
        }
        if (st.fase === 'clicou') { setST({ nome: st.nome, fase: 'conf', t: Date.now() }); pesquisar(st.nome); return; }
        if (st.fase === 'conf') {
          if (!L || !L.achou) { pesquisar(st.nome); return; }
          const aindaAverbe = /^AVERBE JA$/i.test((L.ativ || '').trim());
          const x = A()[st.nome] || {}; poe(st.nome, { ultT: Date.now(), tent: (x.tent || 0) + 1, res: L.ativ || L.sit, resT: Date.now(), ativo: aindaAverbe ? true : false, avisado: aindaAverbe ? x.avisado : false });
          setST(null); return;
        }
      } catch (e) {}
    };
    setInterval(tick, 8000); setTimeout(tick, 5000);
  }

  if (location.host === 'web.whatsapp.com') {
    const WA_MAX_RODADA = 10;
    const esp = ms => new Promise(r => setTimeout(r, ms));
    const soDigitos = s => String(s || '').replace(/\D/g, '');
    // ⚠️ A comparação é pelos ÚLTIMOS 8 DÍGITOS. Decisão da Stefany, 07/11 21:08:
    // "pode considerar só os 8 dígitos mesmos. Porque tem clientes que vêm com 9, sem 9,
    // então é os 8 dígitos finais sempre. A gente já testou aqui e isso já está validado."
    // Resolve o nono dígito do celular e o 55 do país de uma vez: o que sobra dos dois
    // lados são os mesmos 8 dígitos.
    //    +55 83 9407-5314   ->  94075314
    //    5583994075314      ->  94075314   (mesmo cliente, com o 9)
    //    +55 34 8439-2777   ->  84392777   (outro cliente: não casa)
    // ⚠️ Isto NÃO distingue DDD: dois clientes de estados diferentes com os mesmos 8
    // dígitos finais casariam. Ela conhece a base e disse que já testaram — se um dia
    // uma mensagem sair para a pessoa errada, é o primeiro lugar para olhar.
    function chaveFone(v) {
      const n = soDigitos(v);
      if (n.length < 8) return '';
      return n.slice(-8);
    }

    const primeiroNome = n => { const p = String(n || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/)[0] || ''; return p.length >= 3 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''; };   // 4.27: faltava neste bloco
    function textoDoCaso(caso, nome) {
      const pn = primeiroNome(nome);
      const ola = pn ? ('Oi, ' + pn + '! Tudo bem?') : 'Oi! Tudo bem?';   // 4.27: sem "Aqui é da Dinseguro" (a plataforma já põe [Dinseguro])
      const seguranca = 'Pode ficar tranquilo(a): não cobramos nada antecipado e nada é feito sem a sua confirmação.';
      const fecho = 'Qualquer dúvida, me chama que eu te ajudo.';
      if (caso === 'link') {
        return [ola,
          'Passando para falar da sua proposta, que continua disponível e é rápido de concluir.',
          seguranca,
          'Quer que eu reenvie o link para você finalizar?',
          fecho].join('\n\n');
      }
      if (caso === 'atendimento') {
        return [ola,
          'Estou retomando o seu atendimento, que ficou parado porque o WhatsApp encerra a conversa depois de 24 horas.',
          seguranca,
          'Posso seguir de onde a gente parou?',
          fecho].join('\n\n');
      }
      return [ola,
        'Passando para falar da sua simulação, que ficou pendente só do seu CPF para eu conferir o valor liberado certinho.',
        seguranca,
        'Se ainda tiver interesse, é só me mandar o número do seu CPF ou do seu benefício que eu confiro para você na hora.',
        fecho].join('\n\n');
    }

    const filaWA = () => { try { return GM_getValue('wa_fila', []); } catch (e) { return []; } };
    const salvaFila = f => { try { GM_setValue('wa_fila', f); } catch (e) {} };

    function dentroDoHorario() {
      const d = new Date();
      if (d.getDay() === 0 || d.getDay() === 6) return false;
      return d.getHours() >= 8 && d.getHours() <= 16;
    }

    async function mandar(item) {
      // 2. confere o número do cabeçalho ANTES de escrever (erro 16)
      const h = document.querySelector('#main header');
      const cab = chaveFone(h && h.innerText);
      const alvo = chaveFone(item.fone);
      const confere = !!(cab && alvo && cab === alvo);
      if (!confere) return { ok: false, motivo: 'numero nao confere (cabecalho ' + cab + ' x alvo ' + alvo + ')' };

      const cx = document.querySelector('#main footer [contenteditable="true"]');
      if (!cx) return { ok: false, motivo: 'caixa de mensagem nao encontrada' };
      cx.focus();
      await esp(300);
      document.execCommand('insertText', false, textoDoCaso(item.caso, item.nome));
      await esp(1200);
      if (!cx.innerText.trim()) return { ok: false, motivo: 'o texto nao entrou na caixa' };

      const icone = document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"]');
      const bt = icone && icone.closest('button');
      if (!bt) return { ok: false, motivo: 'botao de enviar nao encontrado' };
      bt.click();
      await esp(2500);
      if (cx.innerText.trim()) return { ok: false, motivo: 'a caixa continuou cheia depois de clicar em enviar' };
      return { ok: true };
    }

    async function rodarWA() {
      if (!dentroDoHorario()) return;
      const fila = filaWA();
      const pend = fila.filter(x => x.estado === 'pendente');
      if (!pend.length) return;

      const agora = new Date();
      const marca = agora.getFullYear() + '-' + (agora.getMonth()+1) + '-' + agora.getDate() + '-' + agora.getHours();
      const feitas = GM_getValue('wa_feitas_' + marca, 0);
      if (feitas >= WA_MAX_RODADA) return;

      // quem está na tela agora? se for o primeiro pendente, manda; senão, navega.
      const alvo = pend[0];
      const url = new URL(location.href);
      const foneNaUrl = soDigitos(url.searchParams.get('phone'));
      if (foneNaUrl !== soDigitos(alvo.fone)) {
        location.href = 'https://web.whatsapp.com/send?phone=' + soDigitos(alvo.fone);
        return;
      }
      if (!document.querySelector('#main footer [contenteditable="true"]')) return;  // ainda carregando

      const r = await mandar(alvo);
      const f2 = filaWA();
      const i = f2.findIndex(x => x.hash === alvo.hash);
      if (i >= 0) {
        f2[i].estado = r.ok ? 'enviado' : 'erro';
        f2[i].quando = Date.now();
        if (!r.ok) f2[i].motivo = r.motivo;
        salvaFila(f2);
      }
      GM_setValue('wa_feitas_' + marca, feitas + 1);
      try {
        localStorage.setItem('dins_wa_ultimo', JSON.stringify({
          nome: alvo.nome, caso: alvo.caso, ok: r.ok, motivo: r.motivo || '',
          hora: agora.toLocaleTimeString('pt-BR').slice(0, 5) }));
      } catch (e) {}
      console.log('[Dinseguro WA] ' + alvo.nome + ': ' + (r.ok ? 'enviado' : 'ERRO - ' + r.motivo));
    }

    setInterval(rodarWA, 60000);
    setTimeout(rodarWA, 20000);
    // para desligar o envio automático:  GM_setValue('wa_fila', [])
    // para ver como foi o último:        JSON.parse(localStorage.dins_wa_ultimo)
  }
