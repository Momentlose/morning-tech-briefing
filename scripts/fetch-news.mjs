import { mkdir, writeFile } from 'node:fs/promises';

const feeds = [
  ['BBC 科技', 'https://feeds.bbci.co.uk/news/technology/rss.xml', '互联网'],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', '产业与政策'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml', '互联网'],
  ['OpenAI 官方动态', 'https://openai.com/news/rss.xml', '人工智能'],
  ['NVIDIA 生成式 AI', 'https://nvidianews.nvidia.com/cats/generative_al.xml', '半导体'],
  ['机器之心', 'https://www.jiqizhixin.com/rss', '人工智能'],
  ['量子位', 'https://www.qbitai.com/feed', '人工智能']
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
function categoryFor(title, summary, fallback) {
  const text = (title + ' ' + summary).toLowerCase();
  if (/biosecurity|government|regulation|regulatory|policy|law|court|funding|investment|company|companies|markets?|政府|政策|监管|融资|投资|企业|市场|生物安全/.test(text)) return '产业与政策';
  if (/\bcyber[- ]?security\b|\bvulnerabilit(y|ies)\b|\bransomware\b|\bphishing\b|\bhack(ing|er|ers)?\b|\bmalware\b|\bdata breach\b|\bexploit\b|漏洞|网络安全|勒索|网络攻击|黑客|数据泄露/.test(text)) return '网络安全';
  if (/\bsemiconductor(s)?\b|\bchips?\b|\bgpu(s)?\b|\bprocessors?\b|\bmemory\b|\bsilicon\b|\bnvidia\b|\bintel\b|\bamd\b|\btsmc\b|半导体|芯片|显卡|存储/.test(text)) return '半导体';
  if (/artificial intelligence|\bai\b|\bopenai\b|\banthropic\b|\bchatgpt\b|\bgpt\b|\bllm\b|\bdeepmind\b|人工智能|大模型|智能体/.test(text)) return '人工智能';
  return fallback;
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
    return { title, link, date, source, summary, cat: categoryFor(title, summary, cat) };
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
