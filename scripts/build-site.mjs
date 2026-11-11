import { copyFile, mkdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('_site/', root);
const news = JSON.parse(await readFile(new URL('data/news.json', root), 'utf8'));
if (!Array.isArray(news.items) || !news.items.length) {
  throw new Error('Cannot publish a site without news items.');
}

await mkdir(new URL('data/', output), { recursive: true });
await mkdir(new URL('preview/', output), { recursive: true });
await mkdir(new URL('scripts/', output), { recursive: true });
await copyFile(new URL('index.html', root), new URL('index.html', output));
await copyFile(new URL('data/news.json', root), new URL('data/news.json', output));
await copyFile(new URL('scripts/phone-preview.html', root), new URL('preview/index.html', output));
await copyFile(new URL('scripts/reading-order.js', root), new URL('scripts/reading-order.js', output));
console.log(`Prepared _site with ${news.items.length} news items and the phone preview.`);
