import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative, sep } from 'node:path';
const root = resolve('.local/pages-dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png' };
// Deliberately omit COOP/COEP, exactly as GitHub Pages does.
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith('/frame/')) { response.writeHead(404).end(); return; }
    const path = resolve(root, decodeURIComponent(url.pathname.slice('/frame/'.length)) || 'index.html');
    const name = relative(root, path);
    if (name === '..' || name.startsWith(`..${sep}`)) { response.writeHead(404).end(); return; }
    const data = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); response.end(data);
  } catch { response.writeHead(404).end(); }
}).listen(5178, '127.0.0.1');
