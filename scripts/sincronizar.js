#!/usr/bin/env node
/**
 * Gera o DS genérico (dist/) a partir do Design System do projeto de origem.
 *
 * Uso: node scripts/sincronizar.js <pasta-do-projeto-de-origem>
 *   (a pasta que contém apps-script/DS_Runtime.html e apps-script/DS_Estilos.html)
 *
 * Marcadores aceitos na origem (são comentários: não mudam nada lá):
 *   /* @painel *\/ ... /* @/painel *\/   trecho só do projeto de origem — removido aqui
 *   /* @wm: <código> *\/                 código que só existe no DS genérico — vira código aqui
 *
 * Depois de aplicar os marcadores, todos os comentários são removidos e o resultado
 * passa pelas verificações de scripts/checar.js (a sincronização falha se alguma falhar).
 */
const fs = require('fs'), path = require('path');
const { minify } = require('terser');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');

function lerSemInvolucro(arquivo, tag) {
  const html = fs.readFileSync(arquivo, 'utf8').trim();
  const ini = new RegExp('^<' + tag + '>'), fim = new RegExp('</' + tag + '>$');
  if (!ini.test(html) || !fim.test(html)) throw new Error(path.basename(arquivo) + ': esperado um único <' + tag + '> envolvendo o arquivo');
  return html.replace(ini, '').replace(fim, '');
}

// Remove /* @painel */ ... /* @/painel */ (aninhamento não é aceito) e ativa /* @wm: ... */.
function aplicarMarcadores(texto, nome) {
  const INI = '/* @painel */', FIM = '/* @/painel */';
  let saida = '', i = 0, n = 0;
  for (;;) {
    const a = texto.indexOf(INI, i);
    if (a < 0) { saida += texto.slice(i); break; }
    const b = texto.indexOf(FIM, a + INI.length);
    if (b < 0) throw new Error(nome + ': marcador @painel sem @/painel (linha ' + linhaDe(texto, a) + ')');
    const dentro = texto.slice(a + INI.length, b);
    if (dentro.includes(INI)) throw new Error(nome + ': @painel aninhado (linha ' + linhaDe(texto, a) + ')');
    saida += texto.slice(i, a);
    i = b + FIM.length;
    n++;
  }
  const solto = saida.indexOf(FIM);
  if (solto >= 0) throw new Error(nome + ': @/painel sem @painel (linha ' + linhaDe(saida, solto) + ' da saída)');
  let m = 0;
  saida = saida.replace(/\/\* @wm: ([\s\S]*?) \*\//g, function (_, codigo) { m++; return codigo; });
  return { texto: saida, removidos: n, ativados: m };
}
function linhaDe(t, pos) { return t.slice(0, pos).split('\n').length; }

function semComentariosCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

async function main() {
  const origem = process.argv[2];
  if (!origem) { console.error('Uso: node scripts/sincronizar.js <pasta-do-projeto-de-origem>'); process.exit(2); }
  const AS = path.join(origem, 'apps-script');

  const rt = aplicarMarcadores(lerSemInvolucro(path.join(AS, 'DS_Runtime.html'), 'script'), 'DS_Runtime.html');
  const es = aplicarMarcadores(lerSemInvolucro(path.join(AS, 'DS_Estilos.html'), 'style'), 'DS_Estilos.html');
  const versao = (/versao: '([\d.]+)'/.exec(rt.texto) || [])[1];
  if (!versao) throw new Error('DS_Runtime.html: não achei a versão (versao: \'x.y.z\')');

  let js;
  try {
    js = (await minify(rt.texto, { compress: false, mangle: false, format: { beautify: true, comments: false, indent_level: 2 } })).code;
  } catch (e) {
    throw new Error('DS_Runtime.html depois dos marcadores não é JavaScript válido: ' + e.message + (e.line ? ' (linha ' + e.line + ')' : ''));
  }
  const css = semComentariosCss(es.texto);
  const tokens = fs.readFileSync(path.join(RAIZ, 'fonte', 'tokens.css'), 'utf8');
  const adaptador = fs.readFileSync(path.join(RAIZ, 'fonte', 'adaptador.js'), 'utf8');

  const cab = (tipo) => '/*! ds-wm v' + versao + ' — ' + tipo + ' — gerado por scripts/sincronizar.js; não edite à mão. Licença MIT. */\n';
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'apps-script'), { recursive: true });
  const gravar = (rel, c) => fs.writeFileSync(path.join(DIST, rel), c);
  gravar('ds.css', cab('tokens + componentes') + tokens.trim() + '\n\n' + css);
  gravar('ds.js', cab('runtime') + js + '\n\n' + adaptador.trim() + '\n');
  gravar('apps-script/DS_Tokens.html', '<style>\n' + cab('tokens') + tokens.trim() + '\n</style>\n');
  gravar('apps-script/DS_Estilos.html', '<style>\n' + cab('componentes') + css + '</style>\n');
  gravar('apps-script/DS_Runtime.html', '<script>\n' + cab('runtime') + js + '\n\n' + adaptador.trim() + '\n</script>\n');
  gravar('VERSAO', versao + '\n');

  console.log('ds-wm v' + versao + ': runtime ' + rt.removidos + ' trechos @painel removidos, ' + rt.ativados + ' @wm ativados; estilos ' +
    es.removidos + ' removidos, ' + es.ativados + ' ativados.');
  const { checar } = require('./checar.js');
  const ok = checar(origem);
  process.exit(ok ? 0 : 1);
}

if (require.main === module) main().catch(function (e) { console.error('ERRO: ' + e.message); process.exit(1); });
module.exports = { aplicarMarcadores };
