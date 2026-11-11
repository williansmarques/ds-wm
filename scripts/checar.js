#!/usr/bin/env node
/**
 * Verificações do dist/ (rodam no fim da sincronização e em `npm test`):
 *  1. vazamento: nenhuma marca, e-mail, URL fora das CDNs permitidas ou id de projeto;
 *  2. variáveis soltas: o runtime não referencia nada que ficou só no projeto de origem (no-undef);
 *  3. tokens: toda var(--ds-*) usada tem definição em fonte/tokens.css;
 *  4. carga: o runtime sobe numa VM com DOM mínimo e expõe a API básica.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Linter } = require('eslint');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const ler = (rel) => fs.readFileSync(path.join(DIST, rel), 'utf8');

// Padrões genéricos que nunca podem aparecer no pacote público (código e textos; os comentários já foram removidos).
const PROIBIDOS = [
  [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, 'e-mail'],
  [/\b(script\.google\.com|googleapis\.com\/(?!css))/i, 'URL de serviço do projeto de origem'],
  [/https?:\/\/(?!(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.w3\.org)\b)[^\s'"`)]+/i, 'URL fora das CDNs permitidas'],
  [/\b(AKfyc[\w-]{10,}|1[\w-]{40,})\b/, 'id de deployment/script'],
];
// Nomes do projeto de origem (marcas, fornecedores, infraestrutura): ficam NO projeto de origem, num JSON
// { "termos": ["nome1", ...] } em <origem>/ds-wm-proibidos.json, para não publicar aqui a lista que se quer esconder.
// `npm run sincronizar` lê de lá; `npm test` lê do caminho em DS_WM_PROIBIDOS (sem ele, só os padrões genéricos, com aviso).
function termosDaOrigem(origem) {
  const arq = process.env.DS_WM_PROIBIDOS || (origem && path.join(origem, 'ds-wm-proibidos.json'));
  if (!arq || !fs.existsSync(arq)) return null;
  const termos = JSON.parse(fs.readFileSync(arq, 'utf8')).termos || [];
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, ' ?');
  return termos.length ? [new RegExp('\\b(' + termos.map(esc).join('|') + ')\\b', 'i'), 'nome do projeto de origem'] : null;
}
// Termos do domínio de origem: hoje só avisam (meta: zero).
const DOMINIO = /\b(lojas?|mrr|churn|gmv|consultor(es)?|carteira)\b/gi;

function vazamentos(extra) {
  const erros = [], avisos = {}, regras = extra ? PROIBIDOS.concat([extra]) : PROIBIDOS;
  for (const rel of ['ds.js', 'ds.css']) {
    const linhas = ler(rel).split('\n');
    linhas.forEach(function (l, i) {
      if (i === 0) return;   // cabeçalho gerado
      for (const [re, motivo] of regras) {
        const m = re.exec(l);
        if (m) erros.push(rel + ':' + (i + 1) + ' — ' + motivo + ': "' + m[0] + '" em: ' + l.trim().slice(0, 140));
      }
      (l.match(DOMINIO) || []).forEach(function (t) { t = t.toLowerCase(); avisos[t] = (avisos[t] || 0) + 1; });
    });
  }
  return { erros, avisos };
}

function soltas() {
  const linter = new Linter();
  const globais = {};
  ['window', 'document', 'navigator', 'location', 'history', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia', 'Intl', 'Promise', 'Map', 'Set', 'WeakMap',
    'Symbol', 'URL', 'URLSearchParams', 'Blob', 'FileReader', 'File', 'FormData', 'fetch', 'Image', 'Node', 'Element', 'HTMLElement',
    'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
    'sessionStorage', 'localStorage', 'performance', 'atob', 'btoa', 'encodeURIComponent', 'decodeURIComponent', 'escape',
    'unescape', 'alert', 'confirm', 'prompt', 'open', 'print', 'innerWidth', 'innerHeight', 'scrollX', 'scrollY', 'devicePixelRatio',
    'Chart', 'ChartDataLabels', 'google', 'navigator', 'queueMicrotask', 'structuredClone', 'AbortController', 'TextEncoder',
    'TextDecoder', 'crypto', 'Audio', 'MediaRecorder', 'DOMParser', 'XMLSerializer', 'Range', 'getSelection', 'isFinite', 'Reflect',
    'Proxy', 'NodeFilter', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'DataTransfer', 'ClipboardItem',
    'scrollTo', 'Notification', 'speechSynthesis', 'SpeechSynthesisUtterance'].forEach(function (g) { globais[g] = 'readonly'; });
  const msgs = linter.verify(ler('ds.js'), {
    parserOptions: { ecmaVersion: 2020, sourceType: 'script' }, env: { es2020: true }, globals: globais,
    rules: { 'no-undef': 'error' },
  });
  return msgs.map(function (m) { return 'ds.js:' + m.line + ' — ' + m.message; });
}

// Membros de DS / ui / chart lidos mas nunca definidos (no-undef não vê `DS.x.y`): sinal de trecho removido pela metade.
function membrosOrfaos() {
  const acorn = require('acorn'), walk = require('acorn-walk');
  const src = ler('ds.js');
  const ast = acorn.parse(src, { ecmaVersion: 2020, locations: true });
  const raizes = { DS: 'DS', ui: 'DS.ui', chart: 'DS.chart' };
  const caminho = (n) => {   // DS.a.b → 'DS.a.b' (só membros não computados)
    if (n.type === 'Identifier') return raizes[n.name] || null;
    if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') {
      const b = caminho(n.object); return b ? b + '.' + n.property.name : null;
    }
    return null;
  };
  const definidos = new Set(['DS', 'DS.ui', 'DS.chart']), lidos = new Map();
  const defLiteral = (base, obj) => obj.properties.forEach(function (p) {
    if (p.key && (p.key.type === 'Identifier' || p.key.type === 'Literal')) {
      const nome = base + '.' + (p.key.name || p.key.value); definidos.add(nome);
      if (p.value && p.value.type === 'ObjectExpression') defLiteral(nome, p.value);
    }
  });
  walk.full(ast, function (n) {
    if (n.type === 'AssignmentExpression') {
      const c = caminho(n.left); if (c) { definidos.add(c); if (n.right.type === 'ObjectExpression') defLiteral(c, n.right); }
    } else if (n.type === 'VariableDeclarator' && n.id.name === 'DS' && n.init && n.init.type === 'ObjectExpression') defLiteral('DS', n.init);
    else if (n.type === 'MemberExpression') {
      const c = caminho(n); if (c && !lidos.has(c)) lidos.set(c, n.loc.start.line);
    }
  });
  // Só raiz de 2º nível (DS.x / DS.ui.x / DS.chart.x): níveis abaixo podem vir de objetos construídos dinamicamente.
  const orfaos = [];
  for (const [c, linha] of lidos) {
    const partes = c.split('.');
    const nivel = (partes[1] === 'ui' || partes[1] === 'chart') ? 3 : 2;
    if (partes.length < nivel) continue;
    const alvo = partes.slice(0, nivel).join('.');
    if (!definidos.has(alvo) && !orfaos.some((o) => o.startsWith(alvo + ' '))) orfaos.push(alvo + ' (lido em ds.js:' + linha + ')');
  }
  return orfaos.sort().map((o) => 'membro lido e nunca definido: ' + o);
}

function tokens() {
  const definidos = new Set((fs.readFileSync(path.join(RAIZ, 'fonte', 'tokens.css'), 'utf8').match(/--ds-[\w-]+(?=\s*:)/g) || []));
  const usados = new Set();
  for (const rel of ['ds.css', 'ds.js']) {
    let corpo = ler(rel);
    if (rel === 'ds.css') corpo = corpo.replace(/^[\s\S]*?(?=\n\.|\n@media|\n\*)/, '');   // ignora o bloco de tokens no topo
    // var(--ds-x, fallback) tem valor padrão: não exige definição
    (corpo.match(/var\(\s*--ds-[\w-]+(?!\s*,)(?![\w-])/g) || []).forEach(function (v) { usados.add(v.replace(/var\(\s*/, '')); });
    (corpo.match(/['"]--ds-[\w-]+['"](?!\s*,)/g) || []).forEach(function (v) { usados.add(v.slice(1, -1)); });
  }
  // definidos no CSS de componentes ou inline pelo runtime (style="--ds-x: ..." ou setProperty('--ds-x', ...)) também contam
  (ler('ds.css').match(/--ds-[\w-]+(?=\s*:)/g) || []).forEach(function (v) { definidos.add(v); });
  (ler('ds.js').match(/--ds-[\w-]+(?=\s*:)/g) || []).forEach(function (v) { definidos.add(v); });
  (ler('ds.js').match(/setProperty\(\s*['"]--ds-[\w-]+/g) || []).forEach(function (v) { definidos.add(v.replace(/setProperty\(\s*['"]/, '')); });
  // prefixo montado no runtime ('var(--ds-series-' + i + ')'): basta existir algum token com o prefixo
  const temPrefixo = (v) => v.endsWith('-') && [...definidos].some((d) => d.startsWith(v));
  return [...usados].filter(function (v) { return !definidos.has(v) && !temPrefixo(v); }).sort().map(function (v) { return 'token sem definição em fonte/tokens.css: ' + v; });
}

function carga() {
  const el = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'style' ? {} : k === 'classList' ? { add() {}, remove() {}, toggle() {}, contains() { return false; } } : el()),
    apply: () => el(), set: () => true,
  });
  const g = {
    addEventListener() {}, innerWidth: 1200, location: { search: '', origin: 'http://localhost', pathname: '/' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    console, setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array, Number, String, RegExp, Set, Map, Error,
    encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN, Intl, requestAnimationFrame: (f) => f(), URLSearchParams,
    document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => el(), documentElement: {}, body: el(), head: el() },
    navigator: {}, getComputedStyle: () => ({ getPropertyValue: () => '#000' }),
  };
  g.window = g;
  try {
    vm.runInNewContext(ler('ds.js'), g, { filename: 'ds.js' });
  } catch (e) { return ['ds.js não carrega numa VM: ' + e.message]; }
  const DS = g.DS, erros = [];
  if (!DS) return ['ds.js não define window.DS'];
  ['fmt', 'ui', 'chart', 'pagina', 'iniciar', 'set', 'servidor', 'drill', 'toast'].forEach(function (k) { if (!DS[k]) erros.push('DS.' + k + ' ausente'); });
  if (DS.fmt && DS.fmt.int(1234) !== '1.234') erros.push('DS.fmt.int(1234) devolveu ' + DS.fmt.int(1234));
  if (DS.ui && typeof DS.ui.kpi === 'function' && !/ds-kpi/.test(DS.ui.kpi({ rotulo: 'X', valor: '1' }))) erros.push('DS.ui.kpi não devolve .ds-kpi');
  return erros;
}

function checar(origem) {
  let ok = true;
  const extra = termosDaOrigem(origem);
  const secao = (titulo, lista) => {
    if (lista.length) { ok = false; console.error('\n✗ ' + titulo + ' (' + lista.length + ')\n  ' + lista.slice(0, 80).join('\n  ') + (lista.length > 80 ? '\n  … +' + (lista.length - 80) : '')); }
    else console.log('✓ ' + titulo);
  };
  const v = vazamentos(extra);
  secao('vazamento' + (extra ? '' : ' (só padrões genéricos: lista de nomes da origem não encontrada)'), v.erros);
  secao('variáveis soltas (no-undef)', soltas());
  secao('membros órfãos de DS/ui/chart', membrosOrfaos());
  secao('tokens', tokens());
  secao('carga em VM', carga());
  const av = Object.entries(v.avisos).sort((a, b) => b[1] - a[1]).map(([t, n]) => t + '×' + n);
  if (av.length) console.log('  aviso — termos de domínio ainda no pacote: ' + av.join(', '));
  return ok;
}

if (require.main === module) process.exit(checar() ? 0 : 1);
module.exports = { checar };
