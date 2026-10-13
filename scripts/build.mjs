import {build} from 'esbuild';
import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('dist/assets',{recursive:true});
const source=await readFile('painel-negocio-3.html','utf8'),client=await readFile('web/app.mjs','utf8');
const match=[...source.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].at(-1);
if(!match || !match[1].includes('ESTADO GERAL'))throw new Error('Script principal do painel não encontrado.');
const extra=await Promise.all(['web/experience.mjs','web/orders.mjs','web/experience.css','web/usability.mjs','web/install.mjs','web/catalog.mjs','web/reconcile.mjs','web/shopify-catalog.mjs','web/manual-cleanup.mjs','web/record-schema.mjs','server/providers.mjs','server/api.mjs','web/sales.mjs','web/order-reports.mjs','server/status-audit.mjs','worker/sync.mjs','server/security.mjs'].map(path=>readFile(path,'utf8')));
const version=createHash('sha256').update(source+client+extra.join('')).digest('hex').slice(0,12);
await writeFile('dist/assets/experience.css',extra[2]);
await writeFile('dist/assets/dashboard.js',match[1]);
const html=(source.slice(0,match.index)+`<script type="module" src="/assets/app.js?v=${version}"></script>`+source.slice(match.index+match[0].length)).replace('</head>',`<meta name="painel-build" content="${version}">\n<link rel="stylesheet" href="/assets/experience.css?v=${version}">\n</head>`);
await writeFile('dist/index.html',html);
await build({entryPoints:['web/app.mjs'],bundle:true,outfile:'dist/assets/app.js',format:'esm',minify:true});
await cp('public','dist',{recursive:true});
const worker=await readFile('web/sw.template.js','utf8');
await writeFile('dist/sw.js',worker.replaceAll('__BUILD_VERSION__',version));
await writeFile('dist/_headers',`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com http://127.0.0.1:9099 http://localhost:9099; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
/sw.js
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=0, must-revalidate
`);
console.log('Painel atual, fontes e PWA compilados em dist/.');
