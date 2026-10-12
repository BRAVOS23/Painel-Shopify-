import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist/assets', { recursive: true });
const source = await readFile('painel-negocio-3.html', 'utf8');
const match = source.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);
if (!match) throw new Error('Script do painel não encontrado.');
await writeFile('dist/assets/dashboard.js', match[1]);
await writeFile('dist/index.html', source.replace(match[0], '<script type="module" src="/assets/app.js"></script>\n</body>'));
await build({ entryPoints: ['web/app.mjs'], bundle: true, outfile: 'dist/assets/app.js', format: 'esm', minify: true });
await writeFile('dist/_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com http://127.0.0.1:9099 http://localhost:9099; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
`);
console.log('Painel e bibliotecas compilados em dist/.');
