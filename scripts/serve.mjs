import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const port = Number(process.env.PORT || 4173);
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/preview', ['scripts/phone-preview.html', 'text/html; charset=utf-8']],
  ['/data/news.json', ['data/news.json', 'application/json; charset=utf-8']]
]);

createServer(async (req, res) => {
  const route = routes.get(new URL(req.url, 'http://localhost').pathname);
  if (!route) { res.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(new URL(route[0], root));
    res.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Missing local data. Run: node scripts/fetch-news.mjs');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}`));
