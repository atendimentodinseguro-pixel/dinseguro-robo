// Teste rápido antes do push (antifrágil, erro 16 — 23/11): roda as funções do portão do vigia com dados falsos.
const src = require('fs').readFileSync(__dirname + '/../dinseguro-core.js', 'utf8');
const pega = (ini, fim) => { const i = src.indexOf(ini); const j = src.indexOf(fim, i + 1); if (i < 0 || j < 0) throw new Error('não achei ' + ini); return src.slice(i, j); };
const G = { pend1077: { t: Date.now(), pend: [{ h: 'AAAAAA11112222333344', nome: 'TESTE', tipo: 'cliente_esperando', min: 3, info: 'oi' }] }, auto_ordens: {}, vigia_dispensa: {}, para_stefany: {} };
const window = {}; const localStorage = { length: 0, key: () => null, getItem: () => null };
const GM_getValue = (k, d) => (k in G ? G[k] : d); const GM_setValue = (k, v) => { G[k] = v; };
eval(pega('window.dinsDispensar = ', 'window.dinsNaoFechar') );
let r = window.dinsAntesDeParar(); if (!/TESTE/.test(r)) throw new Error('portão não listou o cliente: ' + r);
window.dinsDispensar('AAAAAA11112222333344', 2, 't'); G.vigia_dispensa['AAAAAA11112222333344'].t = Date.now() - 10 * 60000;
r = window.dinsAntesDeParar(); if (!/TESTE/.test(r)) throw new Error('11.11: cliente que escreveu depois da dispensa sumiu: ' + r);
G.pend1077.pend = []; r = window.dinsAntesDeParar(); if (!/^NADA/.test(r)) throw new Error('portão vazio não deu NADA: ' + r);
if (typeof window.dinsParaStefany === 'function') { window.dinsParaStefany('BBBBBB', 'x', 'Y'); if (!/PARA A STEFANY/.test(window.dinsAntesDeParar())) throw new Error('rodapé PARA A STEFANY faltando'); }
console.log('smoke ok');
