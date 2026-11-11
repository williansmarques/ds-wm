#!/usr/bin/env node
/** Servidor estático mínimo para ver o exemplo: `npm run exemplo` → http://127.0.0.1:8395/exemplo/ */
const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const PORTA = Number(process.env.PORT) || Number(process.argv[2]) || 8395;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

http.createServer(function (req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const arq = path.join(RAIZ, path.normalize(rel));
  if (!arq.startsWith(RAIZ) || arq.includes('node_modules')) { res.writeHead(403); return res.end(); }
  fs.readFile(arq, function (err, corpo) {
    if (err) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
    res.end(corpo);
  });
}).listen(PORTA, '127.0.0.1', function () { console.log('exemplo em http://127.0.0.1:' + PORTA + '/exemplo/'); });
