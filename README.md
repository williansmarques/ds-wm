# ds-wm

Design System em JavaScript puro para painéis de análise: casca de página (menu de módulos, menu lateral, cabeçalho, filtros,
modal, modo apresentação), componentes (`DS.ui.*`), gráficos sobre Chart.js (`DS.chart.*`), formatação pt-BR (`DS.fmt.*`) e
drill-down (`DS.drill.*`). Roda em qualquer HTML estático ou dentro do Google Apps Script (HtmlService).

Sem build, sem framework: um CSS e um JS.

```
dist/
  ds.css                 tokens + componentes
  ds.js                  runtime (window.DS)
  apps-script/           os mesmos arquivos embrulhados em <style>/<script> para include() no Apps Script
    DS_Tokens.html  DS_Estilos.html  DS_Runtime.html
  VERSAO
exemplo/index.html       página completa com dados fictícios
```

## Usar num HTML

1. Copie a casca de [`exemplo/index.html`](exemplo/index.html): os ids `ds-*` são onde o runtime desenha cada parte. Troque só o
   conteúdo de `.ds-brand`.
2. Carregue as dependências (Manrope e Chart.js com os plugins) e o DS, fixando a versão pela tag:

```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.1.0/dist/chartjs-plugin-annotation.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@2.3.0/dist/chartjs-chart-treemap.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/williansmarques/ds-wm@v1.153.0/dist/ds.css">

<script>window.DS_CONFIG = { /* ver abaixo */ };</script>
<script src="https://cdn.jsdelivr.net/gh/williansmarques/ds-wm@v1.153.0/dist/ds.js"></script>
```

3. Declare o menu, registre as páginas e inicie:

```js
DS.MODULOS = [
  { id: 'vendas', rotulo: 'Vendas', secoes: [
    { id: 'analise', rotulo: 'Análise', paginas: [
      { id: 'vendas.diario', rotulo: 'Vendas por dia' } ] } ] }
];

DS.pagina({
  id: 'vendas.diario', modulo: 'vendas', secao: 'analise', rotulo: 'Vendas por dia',
  descricao: 'Que pergunta esta página responde.',
  filtros: ['periodo'],
  carregar: function (estado) { return DS.servidor('obterVendas', estado); },   // única função que busca dados
  render: function (dados, estado) { return DS.ui.kpis([...]) + DS.ui.card({ titulo: '…', corpo: DS.ui.canvas('c1') }); },
  depois: function (dados) { DS.chart.montar('c1', { data: { labels: [...], datasets: [...] } }); }
});

DS.iniciar();
```

Página listada no menu e sem `DS.pagina` aparece como "ainda não desenhada". Ids de módulo, seção e página não devem mudar:
links e o estado salvo na URL dependem deles.

Para ver o exemplo localmente: `npm run exemplo` e abra `http://127.0.0.1:8395/exemplo/`.

## `DS_CONFIG` (antes de carregar `ds.js`, tudo opcional)

| Campo | Para quê | Padrão |
|---|---|---|
| `titulo` | aba do navegador: `<página> · <titulo>` | só o nome da página |
| `servidor(fn, params)` | como `DS.servidor` busca dados; devolve valor ou Promise | `google.script.run[fn](params)` (Apps Script) |
| `acesso` | quem vê o quê: `{ identificado, configurado, admin, paginas: [ids] }` (objeto ou Promise) | `{ identificado: true, configurado: true, admin: true }` (todos veem tudo) |

## Usar no Google Apps Script

Copie os três arquivos de `dist/apps-script/` para o projeto e inclua na sua página, depois das CDNs:

```html
<?!= include('DS_Tokens') ?>
<?!= include('DS_Estilos') ?>
<!-- casca de exemplo/index.html -->
<?!= include('DS_Runtime') ?>
<!-- DS.MODULOS, DS.pagina(...) e DS.iniciar() -->
```

`include` é a função usual do HtmlService: `function include(n) { return HtmlService.createHtmlOutputFromFile(n).getContent(); }`.
Sem `DS_CONFIG.servidor`, `DS.servidor('obterVendas', estado)` chama a função `obterVendas(estado)` do seu `.gs`.

## Recursos que dependem do seu servidor

Alguns componentes chamam funções de servidor com nome fixo. Eles ficam fora do caminho padrão: só são chamados se a página usar
o componente. Se usar, implemente a função em `servidor`:

- Análise automática de gráfico (`DS.ui.ia`): `obterHistoricoIA`, `salvarObjetivoIA` e a função de geração passada no componente.
- Comentários por gráfico: `obterComentarios`, `obterResumoComentarios`, `criarComentario`, `responderComentario`, `atribuirComentario`, `listarUsuarios`.
- Usuários: `obterUsuario`, `cadastrarUsuario`.
- Apresentação Google: `gerarApresentacao` (botão `data-ds-acao="apresentacao-google"`, fora da casca de exemplo).

## Identidade visual (tokens)

Cor, tipografia, espaço, raio e sombra são variáveis CSS `--ds-*` (lista em [`fonte/tokens.css`](fonte/tokens.css)). Os nomes
são a API; para dar a identidade do seu projeto, sobrescreva os valores num `:root` carregado **depois** de `ds.css`:

```css
:root { --ds-blue-500: #0A7; --ds-font: 'Inter', sans-serif; }
```

Regras do tema padrão: séries de gráfico sempre em `--ds-series-1…8`, nessa ordem; variação boa em azul e ruim em rosa;
verde só para estado de seleção de UI.

**Status** (`--ds-status-{disponivel,ocupado,ausente,ferias,offline,erro}`, cada um com `-tint` e `-fg`): presença de uma
pessoa e erro de UI (falha, conexão perdida). Base = ponto ou borda; `-tint` = fundo do selo; `-fg` = texto sobre o `-tint`.
Nunca para dado de gráfico ou KPI. Ainda não há componente de selo de status: use os tokens no seu próprio CSS.

## Versões

A versão segue a do Design System de origem (semver) e cada versão publicada ganha uma tag `vX.Y.Z`. Use sempre a tag na URL
da CDN: `@main` muda sem aviso.

## Como este repositório é gerado

O `dist/` é gerado a partir do Design System de origem (projeto privado), não é editado à mão:

```bash
npm install
npm run sincronizar -- <pasta do projeto de origem>
npm test
```

A sincronização tira os trechos específicos do projeto de origem (marcados lá como `/* @painel */ … /* @/painel */`), ativa as
versões genéricas (`/* @wm: … */`), remove comentários e roda as verificações: nenhum nome, e-mail, URL ou id do projeto de
origem; nenhuma variável solta; nenhum membro de `DS` lido e nunca definido; todo token usado tem definição; o runtime carrega
numa VM. Mudança de componente vai para o projeto de origem e chega aqui na próxima sincronização; `fonte/` (tokens e
adaptador) é editado aqui.

## Licença

[MIT](LICENSE)
