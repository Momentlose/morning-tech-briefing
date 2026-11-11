import { mkdir, readFile, writeFile } from 'node:fs/promises';

const targetPerSource = 20;
const minimumPerSource = 15;
const observedAt = new Date().toISOString();
const huxiuFeed = ['虎嗅网', 'https://www.huxiu.com/rss/0.xml', '产业与政策', 'https://feedx.net/rss/huxiu.xml', 'https://news.google.com/rss/search?q=site%3Ahuxiu.com+when%3A30d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'];

const feeds = [
  ['36氪', 'https://www.36kr.com/feed', '产业与政策', 'https://news.google.com/rss/search?q=site%3A36kr.com+%28AI+OR+%E7%A7%91%E6%8A%80+OR+%E5%8D%8A%E5%AF%BC%E4%BD%93+OR+%E4%BA%92%E8%81%94%E7%BD%91%29&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'],
  ['钛媒体', 'https://www.tmtpost.com/feed', '产业与政策', 'https://news.google.com/rss/search?q=site%3Atmtpost.com+%28AI+OR+%E7%A7%91%E6%8A%80%29&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'],
  ['雷峰网·AI', 'https://www.leiphone.com/feed/categoryRss/name/ai', '人工智能', 'https://news.google.com/rss/search?q=site%3Aleiphone.com+%28AI+OR+%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%29&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'],
  ['雷峰网·业界', 'https://www.leiphone.com/feed/categoryRss/name/industrynews', '产业与政策', 'https://news.google.com/rss/search?q=site%3Aleiphone.com+%E4%B8%9A%E7%95%8C&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'],
  ['爱范儿', 'https://www.ifanr.com/feed/', '互联网', 'https://news.google.com/rss/search?q=site%3Aifanr.com+%28AI+OR+%E7%A7%91%E6%8A%80%29&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'],
  ['极客公园', 'https://www.geekpark.net/rss', '互联网', 'https://news.google.com/rss/search?q=site%3Ageekpark.net+%28AI+OR+%E7%A7%91%E6%8A%80%29&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'],
  ['IT之家', 'https://www.ithome.com/rss/', '其他科技', 'https://news.google.com/rss/search?q=site%3Aithome.com+%E7%A7%91%E6%8A%80&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'],
  ['量子位', 'https://www.qbitai.com/feed', '人工智能', 'https://news.google.com/rss/search?q=site%3Aqbitai.com+%28AI+OR+%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%29&hl=zh-CN&gl=CN&ceid=CN:zh-Hans']
];

function decode(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/g, ' ')
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
async function fetchArticlePreview(item) {
  const isUsefulPreview = text =>
    text.length >= 35 &&
    !/^Comprehensive up-to-date news coverage, aggregated from sources all over the world by Google News\.?$/i.test(text) &&
    !/copyright ©|版权所有|ICP备|粤ICP|沪ICP/i.test(text);
  const fallbackPreview = isUsefulPreview(item.summary) ? item.summary : '';
  try {
    const response = await fetch(item.link, {
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MorningTechBriefing/1.0)', 'accept': 'text/html,application/xhtml+xml' }
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return fallbackPreview;
    const html = await response.text();
    const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html;
    const paragraphs = [...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(match => textOnly(match[1]))
      .filter(isUsefulPreview);
    if (paragraphs.length) return paragraphs.slice(0, 3).join(' ').slice(0, 420);
    const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => match[0]);
    for (const tag of metaTags) {
      if (!/(og:description|twitter:description|name=["']description["'])/i.test(tag)) continue;
      const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
      if (content) {
        const preview = textOnly(content);
        if (isUsefulPreview(preview)) return preview.slice(0, 420);
      }
    }
    return fallbackPreview;
  } catch {
    return fallbackPreview;
  }
}

function textOnly(html) {
  return decode(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const authorDesks = {
  '虎嗅网': '虎嗅编辑部',
  'B站热榜': '哔哩哔哩',
  '36氪': '36氪编辑部',
  '钛媒体': '钛媒体编辑部',
  '雷峰网·AI': '雷峰网 AI 编辑部',
  '雷峰网·业界': '雷峰网业界编辑部',
  '爱范儿': '爱范儿编辑部',
  '极客公园': '极客公园编辑部',
  'IT之家': 'IT之家编辑部',
  '量子位': '量子位编辑部',
  '少数派热门文章': '少数派编辑部',
  '知乎热榜': '知乎热榜',
  '虎扑步行街热帖': '虎扑步行街'
};

function cleanAuthor(value = '') {
  const text = textOnly(typeof value === 'string' ? value : '').replace(/^by\s+/i, '').trim();
  if (!text) return '';
  const bracketed = text.match(/^(.*?)\s*<[^>]+>\s*$/);
  if (bracketed?.[1]?.trim()) return bracketed[1].trim();
  const mailed = text.match(/^[^\s()]+@[^\s()]+\s*\((.*)\)\s*$/);
  if (mailed?.[1]?.trim()) return mailed[1].trim();
  return /^(用户|匿名用户|管理员|system|admin)$/i.test(text) ? '' : text;
}

function resolveAuthor(value, source) {
  const author = cleanAuthor(value).slice(0, 30);
  return author || authorDesks[source] || source || '综合编辑';
}

function normalizeLink(value = '') {
  const link = decode(String(value || '')).trim();
  return /^http:\/\//i.test(link) ? link.replace(/^http:\/\//i, 'https://') : link;
}

function toIsoDate(value, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(fallback).toISOString();
}

async function fetchSspaiHot() {
  const label = '少数派热门文章';
  const rss = [label, 'https://sspai.com/feed', '社区热榜', 'https://news.google.com/rss/search?q=site%3Asspai.com%2Fpost+when%3A30d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'];
  const endpoint = 'https://sspai.com/api/v1/article/index/page/get?limit=50&offset=0&created_at=0';
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MorningTechBriefing/1.0)', 'accept': 'application/json' }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const payload = await response.json();
    const rows = Array.isArray(payload.data?.data) ? payload.data.data : Array.isArray(payload.data) ? payload.data : [];
    const items = rows.map(item => ({
      title: textOnly(item.title || ''),
      link: item.url || item.link || (item.id ? 'https://sspai.com/post/' + item.id : ''),
      date: toIsoDate(item.released_time || item.released_at || item.created_at || item.createdAt),
      source: label,
      author: resolveAuthor(item.author?.nickname || item.author_name || item.nickname || (typeof item.author === 'string' ? item.author : ''), label),
      summary: textOnly(item.summary || item.description || '').slice(0, 220),
      cat: '社区热榜',
      popularity: Number(item.like_count || 0) * 1000 + Number(item.comment_count || 0)
    })).filter(item => item.title && item.link.startsWith('https://sspai.com/'));
    items.sort((a, b) => b.popularity - a.popularity);
    if (!items.length) throw new Error('no usable articles returned');
    const articles = uniqueStories(items.map(({ popularity, ...item }) => item));
    if (articles.length >= targetPerSource) return articles;
    try {
      return uniqueStories([...articles, ...await fetchFeed(rss)]);
    } catch (error) {
      if (!articles.length) throw error;
      console.warn(label + ': ' + error.message);
      return articles;
    }
  } catch (error) {
    console.warn(label + ': hot feed unavailable; falling back to the official RSS feed. ' + (error?.message || String(error)));
    return fetchFeed(rss);
  }
}

async function fetchZhihuHot() {
  const label = '知乎热榜';
  const endpoints = [
    'https://api.zhihu.com/topstory/hot-list?limit=50',
    'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50'
  ];
  const failures = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(15000),
        headers: {
          'user-agent': 'com.zhihu.android/Futureve/10.0.0 (iPhone; iOS 18.0; Scale/3.00)',
          'accept': 'application/json',
          'referer': 'https://www.zhihu.com/hot'
        }
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const payload = await response.json();
      const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.data?.data) ? payload.data.data : [];
      const items = rows.map((item, index) => {
        const target = item.target || item;
        const id = target.id || String(target.url || '').match(/questions?\/(\d+)/)?.[1];
        let link = target.url || item.url || (id ? 'https://www.zhihu.com/question/' + id : '');
        if (link.startsWith('https://api.zhihu.com/questions/')) link = link.replace('https://api.zhihu.com/questions/', 'https://www.zhihu.com/question/');
        return {
          title: textOnly(target.title || item.title || ''),
          link,
          date: toIsoDate(target.created || item.created || item.updated_time),
          observedAt,
          rank: index + 1,
          source: label,
          author: resolveAuthor(target.author?.name || item.author?.name, label),
          summary: textOnly(target.excerpt || item.excerpt || item.detail_text || '').slice(0, 220),
          cat: '社区热榜'
        };
      }).filter(item => item.title && item.link.startsWith('https://www.zhihu.com/'));
      if (!items.length) throw new Error('no usable hot topics returned');
      return items;
    } catch (error) {
      failures.push(error?.message || String(error));
    }
  }
  throw new Error(label + ': ' + failures.join('; '));
}

async function fetchHupuHot() {
  const label = '虎扑步行街热帖';
  const response = await fetch('https://bbs.hupu.com/bxj', {
    signal: AbortSignal.timeout(15000),
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml',
      'referer': 'https://bbs.hupu.com/'
    }
  });
  if (!response.ok) throw new Error(label + ': HTTP ' + response.status);
  const html = await response.text();
  const seen = new Set();
  const now = new Date().toISOString();
  const items = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(match => {
    const href = match[1].match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    const title = textOnly(match[2]);
    if (!href || !title || title.length < 8) return null;
    let url;
    try { url = new URL(href, 'https://bbs.hupu.com'); } catch { return null; }
    if (url.hostname !== 'bbs.hupu.com' || !/^\/\d{6,}(?:\.html)?\/?$/.test(url.pathname)) return null;
    const link = url.href;
    if (seen.has(link)) return null;
    seen.add(link);
    const context = html.slice(Math.max(0, match.index - 500), Math.min(html.length, match.index + match[0].length + 700));
    const rawDate = context.match(/\bdatetime=["']([^"']+)["']/i)?.[1] || context.match(/\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/)?.[0];
    const summaryMatch = context.match(/<(?:p|div)\b[^>]*class=["'][^"']*(?:post-desc|post-summary|post-content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i);
    return {
      title,
      link,
      date: toIsoDate(rawDate, Date.now()),
      observedAt,
      rank: seen.size,
      source: label,
      author: resolveAuthor('', label),
      summary: textOnly(summaryMatch?.[1] || '').slice(0, 220),
      cat: '社区热榜'
    };
  }).filter(Boolean);
  if (!items.length) throw new Error(label + ': no hot threads parsed');
  return items;
}

async function fetchBilibiliHot() {
  const source = 'B站热榜';
  const endpoints = [
    'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all',
    'https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1'
  ];
  const failures = [];
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/', accept: 'application/json' }
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.code !== 0 || !Array.isArray(data.data?.list)) throw new Error('API code ' + data.code);
      const items = data.data.list.map((video, index) => ({
        title: textOnly(video.title || ''),
        link: /^BV[\da-zA-Z]{10}$/.test(video.bvid) ? 'https://www.bilibili.com/video/' + video.bvid + '/' : '',
        date: toIsoDate(video.pubdate),
        observedAt,
        rank: index + 1,
        source,
        author: resolveAuthor(video.owner?.name, source),
        summary: textOnly(video.desc || '').slice(0, 220),
        cat: '社区热榜'
      })).filter(item => item.title && item.link);
      if (items.length) return items;
      throw new Error('no ranked videos');
    } catch (error) {
      failures.push(error.message);
    }
  }
  throw new Error(source + ': ' + failures.join('; '));
}

async function fetchHuxiu() {
  const source = '虎嗅网';
  const articles = [];
  const fetchPage = async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.text();
  };
  try {
    const home = await fetchPage('https://www.huxiu.com/');
    const links = [...new Set([...home.matchAll(/href="(?:https:\/\/www\.huxiu\.com)?(\/article\/\d+\.html)"/g)]
      .map(([, path]) => 'https://www.huxiu.com' + path))].slice(0, 30);
    for (let index = 0; index < links.length && articles.length < targetPerSource; index += 6) {
      const batch = await Promise.allSettled(links.slice(index, index + 6).map(async link => {
        const html = await fetchPage(link);
        const meta = name => textOnly(html.match(new RegExp('<meta\\s+property="' + name + '"\\s+content="([^"]*)"', 'i'))?.[1] || '');
        const title = meta('og:title');
        const summary = meta('og:description').slice(0, 220);
        return { title, link, date: meta('article:published_time'), source, author: authorDesks[source], summary, cat: categoryFor(title, summary, '产业与政策') };
      }));
      articles.push(...uniqueStories(batch.filter(result => result.status === 'fulfilled').map(result => result.value)));
    }
  } catch (error) {
    console.warn(source + ': homepage unavailable: ' + error.message);
  }
  if (articles.length >= targetPerSource) return articles;
  try {
    return uniqueStories([...articles, ...await fetchFeed(huxiuFeed)]);
  } catch (error) {
    if (!articles.length) throw error;
    console.warn(error.message);
    return articles;
  }
}

function impactFor(item) {
  if (item.cat === '社区热榜') {
    return {
      positive: '这类榜单可帮助观察公众正在关注的话题，也可能提供行业情绪与产品讨论的线索。',
      negative: '热度和讨论量不等于企业收入、盈利或估值变化；社区内容也可能偏离事实或带有情绪。',
      watch: '核对原帖、权威报道和公司公告，再判断是否与持仓行业存在可验证的关联。'
    };
  }
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
const maxAge = Date.now() - 30 * 24 * 60 * 60 * 1000;

function storyTime(item) {
  return Date.parse(item.observedAt || item.date);
}

function uniqueStories(items) {
  const links = new Set();
  const titles = new Set();
  return items.filter(item => {
    if (!item?.title || !item.link) return false;
    item.link = normalizeLink(item.link);
    const time = storyTime(item);
    if (!item.link.startsWith('https://') || !Number.isFinite(time) || time < maxAge || time > Date.now() + 60 * 60 * 1000) return false;
    const title = item.title.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
    if (links.has(item.link) || titles.has(title)) return false;
    links.add(item.link);
    titles.add(title);
    return true;
  });
}

async function fetchFeed([label, url, cat, ...fallbackUrls]) {
  const urls = [url, ...fallbackUrls].filter(Boolean);
  const failures = [];
  let collected = [];
  for (const [index, feedUrl] of urls.entries()) {
    try {
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(35000), headers: { 'user-agent': 'MorningTechBriefing/1.0 (RSS reader)' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const xml = await response.text();
      const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(([item]) => {
        let title = textOnly(field(item, 'title'));
        const link = field(item, 'link');
        const publisher = textOnly(field(item, 'source'));
        if (publisher && link.startsWith('https://news.google.com/') && title.endsWith(' - ' + publisher)) {
          title = title.slice(0, -(publisher.length + 3));
        }
        const date = field(item, 'pubDate');
        const source = label;
        const author = resolveAuthor(field(item, 'dc:creator') || field(item, 'author') || field(item, 'name') || field(item, 'source'), source);
        const summary = textOnly(field(item, 'description')).slice(0, 220);
        if (!title || !link || !date) return null;
        return { title, link, date, source, author, summary, cat: cat === '社区热榜' ? cat : categoryFor(title, summary, cat) };
      }).filter(Boolean);
      if (!items.length) throw new Error('no RSS items parsed');
      collected = uniqueStories([...collected, ...items]);
      if (index > 0) console.log(label + ': supplemental feed returned ' + items.length + ' items.');
      if (collected.length >= targetPerSource) return collected;
    } catch (error) {
      failures.push(error?.message || String(error));
      if (index < urls.length - 1) console.warn(label + ': primary RSS failed; trying fallback feed.');
    }
  }
  if (collected.length) return collected;
  throw new Error(label + ': ' + failures.join('; '));
}

async function readPreviousNews() {
  try {
    const data = JSON.parse(await readFile('data/news.json', 'utf8'));
    if (Array.isArray(data.items)) return data.items;
  } catch {}
  try {
    const response = await fetch('https://momentlose.github.io/morning-tech-briefing/data/news.json', { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.items)) return data.items;
    }
  } catch (error) {
    console.warn('Previous edition unavailable: ' + error.message);
  }
  return [];
}

const sources = [
  ...feeds.map(feed => [feed[0], () => fetchFeed(feed)]),
  ['虎嗅网', fetchHuxiu],
  ['少数派热门文章', fetchSspaiHot], ['知乎热榜', fetchZhihuHot],
  ['虎扑步行街热帖', fetchHupuHot], ['B站热榜', fetchBilibiliHot]
];
const [results, previous] = await Promise.all([
  Promise.allSettled(sources.map(([, fetchSource]) => fetchSource())),
  readPreviousNews()
]);
const previousByLink = new Map(previous.map(item => [item.link, item]));
const publishedStories = [];
for (const [index, [source]] of sources.entries()) {
  const result = results[index];
  const live = result.status === 'fulfilled' ? result.value : [];
  if (result.status === 'rejected') console.warn(result.reason?.message || source + ': feed failed');
  const items = uniqueStories([...live, ...previous.filter(item => item.source === source)])
    .sort((a, b) => {
      if (source === '虎嗅网') {
        const direct = item => item.link.startsWith('https://www.huxiu.com/article/');
        if (direct(a) !== direct(b)) return direct(a) ? -1 : 1;
      }
      return storyTime(b) - storyTime(a) || (a.rank ?? Infinity) - (b.rank ?? Infinity);
    })
    .slice(0, targetPerSource);
  if (items.length < minimumPerSource) console.warn(source + ': only ' + items.length + ' eligible items');
  else console.log(source + ': ' + items.length + ' items');
  publishedStories.push(...items);
}
if (!publishedStories.length) throw new Error('No stories were returned by the sources.');
publishedStories.sort((a, b) => storyTime(b) - storyTime(a));
let translationCursor = 0;
let translatedCount = 0;
const translationWorkers = Array.from({ length: 3 }, async () => {
  while (translationCursor < publishedStories.length) {
    const item = publishedStories[translationCursor++];
    item.titleZh = previousByLink.get(item.link)?.titleZh || await translateTitle(item.title);
    if (item.titleZh !== item.title) translatedCount++;
    item.impact = impactFor(item);
  }
});
await Promise.all(translationWorkers);

let previewCursor = 0;
let extractedPreviewCount = 0;
const previewWorkers = Array.from({ length: 6 }, async () => {
  while (previewCursor < publishedStories.length) {
    const item = publishedStories[previewCursor++];
    const rssSummary = item.summary;
    const previousSummary = previousByLink.get(item.link)?.summary;
    if (previousSummary?.length > item.summary.length) item.summary = previousSummary;
    if (!item.rank && item.summary.length < 35) item.summary = await fetchArticlePreview(item);
    if (item.summary && item.summary !== rssSummary) extractedPreviewCount++;
  }
});
await Promise.all(previewWorkers);

await mkdir('data', { recursive: true });
await writeFile('data/news.json', JSON.stringify({ generatedAt: new Date().toISOString(), items: publishedStories }, null, 2) + '\n');
console.log('Prepared ' + publishedStories.length + ' news stories; translated ' + translatedCount + ' headlines; extracted ' + extractedPreviewCount + ' article previews.');
