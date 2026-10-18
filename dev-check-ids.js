/* Validação: todo $('id') referenciado no game.js deve existir no index.html. */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('game.js', 'utf8');
const ids = new Set();
for (const m of html.matchAll(/id="([^"]+)"/g)) ids.add(m[1]);
let bad = 0;
for (const m of js.matchAll(/\$\('([a-zA-Z0-9]+)'\)/g)) {
  if (!ids.has(m[1])) { console.log('FALTA NO HTML:', m[1]); bad++; }
}
console.log(bad === 0 ? 'OK: todos os elementos referenciados no game.js existem no HTML' : 'ERROS: ' + bad);
process.exit(bad === 0 ? 0 : 1);
