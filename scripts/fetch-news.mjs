import { mkdir, writeFile } from 'node:fs/promises';

const feeds = [
  ['36氪', 'https://36kr.com/feed', '产业与政策'],
  ['钛媒体', 'https://www.tmtpost.com/feed', '产业与政策'],
  ['雷峰网·AI', 'https://www.leiphone.com/feed/categoryRss/name/ai', '人工智能'],
  ['雷峰网·业界', 'https://www.leiphone.com/feed/categoryRss/name/industrynews', '产业与政策'],
  ['爱范儿', 'https://www.ifanr.com/feed/', '互联网'],
  ['极客公园', 'https://www.geekpark.net/rss', '互联网'],
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
  return '其他科技';
}
function textOnly(html) {
  return decode(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function impactFor(item) {
  const text = (item.title + ' ' + item.summary).toLowerCase();
  const focus = {
    '人工智能': {
      positive: '若报道中的产品或模型带来付费与云需求增长，相关平台、云服务和算力供应链可能受益。',
      negative: '研发、算力和基础设施投入可能推高成本；若商业化慢于预期，利润率与估值可能承压。',
      watch: '关注报道涉及的公司及云、芯片、软件环节，核对收入、订单、资本开支和现金流。'
    },
    '半导体': {
      positive: '若需求和订单持续增长且产能利用率改善，相关芯片、设备或供应链企业可能受益。',
      negative: '扩产、价格下行、库存积压或供应限制都可能压缩毛利并增加资金压力。',
      watch: '关注订单、库存、产能利用率、产品价格和客户集中度。'
    },
    '网络安全': {
      positive: '安全事件或更严格的防护要求可能推动安全服务与工具的需求。',
      negative: '被影响的企业可能承担修复、停机、合规和声誉成本。',
      watch: '区分受影响企业与安全服务商，核对事件范围、修复进度和后续支出。'
    },
    '互联网': {
      positive: '若产品带来用户增长或广告、订阅、云业务变现，相关平台可能受益。',
      negative: '竞争、监管、内容治理和获客投入可能增加成本并影响增长质量。',
      watch: '关注用户留存、付费转化、广告或云收入、费用率及监管变化。'
    },
    '其他科技': {
      positive: '这条报道偏一般科技或基础研究，短期未必能直接转化为公司收入；若后续出现商业化、采购或量产，相关供应链才可能受益。',
      negative: '仅凭标题和摘要看不出对具体公司盈利的明确方向，不宜据此判断短期利空。',
      watch: '确认是否有明确企业参与、商业化路径、项目采购或量产时间表。'
    },
    '产业与政策': {
      positive: '若政策支持或投资落到具体项目，相关行业与供应链可能获得订单或资金支持。',
      negative: '监管变化、执行不确定性或高额投入可能增加合规成本并影响经营预期。',
      watch: '关注政策适用范围、落地时间、受益主体和企业实际订单。'
    }
  }[item.cat] || {
    positive: '若报道所述变化转化为新增需求或收入，相关公司及上下游可能受益。',
    negative: '执行成本、竞争和预期落差可能使相关公司的利润或估值承压。',
    watch: '先确认报道涉及的公司、业务环节，再核对财报、订单和现金流。'
  };
  const adverse = /layoff|job cuts|loss|decline|lawsuit|ban|probe|fine|breach|vulnerabilit|hack|shutdown|recall|裁员|亏损|下滑|诉讼|禁令|调查|罚款|漏洞|攻击|停运|召回/.test(text);
  return {
    positive: focus.positive,
    negative: adverse ? '标题提示可能存在经营、合规或安全压力；需确认影响范围与实际成本。' + focus.negative : focus.negative,
    watch: focus.watch
  };
}

async function translateTitle(title) {
  if (!/[A-Za-z]/.test(title) || /[\u3400-\u9fff]/.test(title)) return title;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: 'zh-CN', dt: 't', q: title });
      const response = await fetch('https://translate.googleapis.com/translate_a/single?' + params, {
        signal: AbortSignal.timeout(12000),
        headers: { 'user-agent': 'MorningTechBriefing/1.0', 'accept': 'application/json' }
      });
      if (!response.ok) throw new Error('translation HTTP ' + response.status);
      const data = await response.json();
      const translated = (data?.[0] || []).map(part => part?.[0] || '').join('').trim();
      if (translated) return translated;
    } catch (error) {
      if (attempt === 1) return title;
      await new Promise(resolve => setTimeout(resolve, 900));
    }
  }
  return title;
}
async function fetchFeed([label, url, cat]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'MorningTechBriefing/1.0 (RSS reader)' } });
  if (!response.ok) throw new Error(label + ': HTTP ' + response.status);
  const xml = await response.text();
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(([item]) => {
    const title = textOnly(field(item, 'title'));
    const link = field(item, 'link');
    const date = field(item, 'pubDate');
    const source = label;
    const summary = textOnly(field(item, 'description')).slice(0, 220);
    if (!title || !link || !date) return null;
    return { title, link, date, source, summary, cat: categoryFor(title, summary, cat) };
  }).filter(Boolean).slice(0, 24);
  if (!items.length) throw new Error(label + ': no RSS items parsed');
  return items;
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
const sourceCounts = new Map();
const publishedStories = stories.filter(item => {
  const count = sourceCounts.get(item.source) || 0;
  if (count >= 15) return false;
  sourceCounts.set(item.source, count + 1);
  return true;
}).slice(0, 60);
let translationCursor = 0;
let translatedCount = 0;
const translationWorkers = Array.from({ length: 3 }, async () => {
  while (translationCursor < publishedStories.length) {
    const item = publishedStories[translationCursor++];
    item.titleZh = await translateTitle(item.title);
    if (item.titleZh !== item.title) translatedCount++;
    item.impact = impactFor(item);
  }
});
await Promise.all(translationWorkers);
await mkdir('data', { recursive: true });
await writeFile('data/news.json', JSON.stringify({ generatedAt: new Date().toISOString(), items: publishedStories }, null, 2) + '\n');
console.log('Prepared ' + publishedStories.length + ' news stories; translated ' + translatedCount + ' headlines.');
