import { mkdir, writeFile } from 'node:fs/promises';

const feeds = [
  ['BBC 科技', 'https://feeds.bbci.co.uk/news/technology/rss.xml', '互联网'],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', '网络安全'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml', '互联网'],
  ['OpenAI 官方动态', 'https://openai.com/news/rss.xml', '人工智能'],
  ['NVIDIA 生成式 AI', 'https://nvidianews.nvidia.com/cats/generative_al.xml', '半导体']
];

function decode(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function field(xml, name) {
  const match = xml.match(new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'i'));
  return match ? decode(match[1]).trim() : '';
}
function textOnly(html) {
  return decode(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
async function fetchFeed([label, url, cat]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'MorningTechBriefing/1.0 (RSS reader)' } });
  if (!response.ok) throw new Error(label + ': HTTP ' + response.status);
  const xml = await response.text();
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(([item]) => {
    const title = textOnly(field(item, 'title'));
    const link = field(item, 'link');
    const date = field(item, 'pubDate');
    const source = textOnly(field(item, 'source')) || label;
    const summary = textOnly(field(item, 'description')).slice(0, 220);
    if (!title || !link || !date) return null;
    return { title, link, date, source, summary, cat };
  }).filter(Boolean);
}

const results = await Promise.allSettled(feeds.map(fetchFeed));
const stories = [];
const seen = new Set();
const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
for (const result of results) {
  if (result.status !== 'fulfilled') {
    console.warn(result.reason?.message || 'RSS feed failed');
    continue;
  }
  for (const item of result.value) {
    const timestamp = Date.parse(item.date);
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > Date.now() + 60 * 60 * 1000 || seen.has(item.link)) continue;
    if (!item.link.startsWith('https://')) continue;
    seen.add(item.link);
    stories.push(item);
  }
}
stories.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
if (!stories.length) throw new Error('No recent stories were returned by the RSS sources.');
await mkdir('data', { recursive: true });
await writeFile('data/news.json', JSON.stringify({ generatedAt: new Date().toISOString(), items: stories.slice(0, 60) }, null, 2) + '\n');
console.log('Prepared ' + Math.min(stories.length, 60) + ' news stories.');
