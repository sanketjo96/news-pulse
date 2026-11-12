import { XMLParser } from 'fast-xml-parser';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const parser = new XMLParser({ ignoreAttributes: false });

const GN = 'hl=en-IN&gl=IN&ceid=IN:en';
export const FEEDS = {
  world: `https://news.google.com/rss/headlines/section/topic/WORLD?${GN}`,
  india: `https://news.google.com/rss/headlines/section/topic/NATION?${GN}`,
  // Google News has no working geo feed for Pune, so use a last-24h search instead.
  pune: `https://news.google.com/rss/search?q=Pune+when:1d&${GN}`,
  mumbai: `https://news.google.com/rss/headlines/section/geo/Mumbai?${GN}`,
  trends: (geo) => `https://trends.google.com/trending/rss?geo=${geo}`,
};

// Google Trends has no global feed; aggregate across these countries.
export const WORLD_GEOS = ['US', 'GB', 'IN', 'CA', 'AU', 'NG', 'ZA', 'SG', 'PH', 'IE', 'DE', 'FR', 'BR', 'JP'];

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (typeof x === 'object' && x !== null ? x['#text'] ?? '' : x ?? '').toString().trim();
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

async function fetchItems(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return asArray(parser.parse(await res.text())?.rss?.channel?.item);
}

const decodeEntities = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Google News puts related coverage (headlines from other outlets) in the item description.
function relatedHeadlines(description, ownTitle) {
  const own = norm(ownTitle);
  return [...String(description ?? '').matchAll(/<a [^>]*>([^<]+)<\/a>/g)]
    .map((m) => decodeEntities(m[1]).trim())
    .filter((h) => h && norm(h) !== own)
    .slice(0, 4);
}

function toNews(item, extra = {}) {
  const source = text(item.source);
  let title = text(item.title);
  if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
  return { title, source, link: text(item.link), published: text(item.pubDate), related: relatedHeadlines(item.description, title), ...extra };
}

function dedupe(list, n) {
  const seen = new Set();
  return list.filter((x) => {
    const k = norm(x.title);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, n);
}

export async function getNews(key, n = 3) {
  return dedupe((await fetchItems(FEEDS[key])).map((i) => toNews(i)), n);
}

export async function getLocalNews(n = 3) {
  const [pune, mumbai] = await Promise.allSettled([fetchItems(FEEDS.pune), fetchItems(FEEDS.mumbai)]);
  const p = pune.status === 'fulfilled' ? pune.value.map((i) => toNews(i, { city: 'Pune' })) : [];
  const m = mumbai.status === 'fulfilled' ? mumbai.value.map((i) => toNews(i, { city: 'Mumbai' })) : [];
  if (!p.length && !m.length) throw new Error('Both Pune and Mumbai feeds failed');
  // Interleave Pune and Mumbai so both cities show up.
  const mixed = [];
  for (let i = 0; i < Math.max(p.length, m.length); i++) {
    if (p[i]) mixed.push(p[i]);
    if (m[i]) mixed.push(m[i]);
  }
  return dedupe(mixed, n);
}

// "2K+" -> 2000, "1M+" -> 1000000, "200+" -> 200
export function parseTraffic(s) {
  const m = String(s ?? '').replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/);
  if (!m) return 0;
  return Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] ?? 1));
}

function toTrend(item, geo) {
  const allNews = asArray(item['ht:news_item']);
  const news = allNews[0];
  return {
    title: text(item.title),
    trafficNum: parseTraffic(text(item['ht:approx_traffic'])),
    picture: text(item['ht:picture']),
    related: allNews.map((n) => text(n['ht:news_item_title'])).filter(Boolean).slice(0, 3),
    newsTitle: news ? text(news['ht:news_item_title']) : '',
    newsLink: news ? text(news['ht:news_item_url']) : '',
    newsSource: news ? text(news['ht:news_item_source']) : '',
    geos: [geo],
  };
}

const withLabel = (t) => ({ ...t, traffic: `${formatNum(t.trafficNum)}+${t.geos.length > 1 ? ` · ${t.geos.length} countries` : ''}` });

export async function getTrends(geo, n = 3) {
  const all = dedupe((await fetchItems(FEEDS.trends(geo))).map((i) => toTrend(i, geo)), Infinity);
  return all.sort((a, b) => b.trafficNum - a.trafficNum).slice(0, n).map(withLabel);
}

export async function getWorldTrends(n = 3) {
  const results = await Promise.allSettled(WORLD_GEOS.map((g) => fetchItems(FEEDS.trends(g)).then((items) => items.map((i) => toTrend(i, g)))));
  const merged = new Map();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const t of r.value) {
      const k = norm(t.title);
      if (!k) continue;
      const cur = merged.get(k);
      if (!cur) merged.set(k, { ...t });
      else {
        if (!cur.geos.includes(t.geos[0])) cur.geos.push(t.geos[0]);
        cur.trafficNum += t.trafficNum;
        if (!cur.picture && t.picture) cur.picture = t.picture;
        cur.related = [...new Set([...cur.related, ...t.related])].slice(0, 5);
        if (!cur.newsLink && t.newsLink) Object.assign(cur, { newsTitle: t.newsTitle, newsLink: t.newsLink, newsSource: t.newsSource });
      }
    }
  }
  if (!merged.size) throw new Error('All country trend feeds failed');
  // Rank by number of countries first, then by combined search volume.
  return [...merged.values()]
    .sort((a, b) => b.geos.length - a.geos.length || b.trafficNum - a.trafficNum)
    .slice(0, n)
    .map(withLabel);
}

const formatNum = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : `${v}`);

// ---------- Social media ----------
// X (Twitter) has no free trends API; trends24.in publishes them per location as public HTML.
// Unofficial: if their markup changes, the section falls back to the last good data.
async function fetchXTrends(path) {
  const res = await fetch(`https://trends24.in/${path}/`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from trends24`);
  const html = await res.text();
  // The first trend card on the page is the most recent hour.
  const card = html.match(/<ol class="?trend-card__list"?>([\s\S]*?)<\/ol>/);
  if (!card) throw new Error('trends24 markup changed');
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return [...card[1].matchAll(/<a href="?([^" >]+)"?[^>]*class="?trend-link"?[^>]*>([^<]+)<\/a>/g)].map((m) => ({
    title: decode(m[2].trim()),
    link: decode(m[1]).replace('https://twitter.com/', 'https://x.com/'),
    platform: 'X',
  }));
}

// getdaytrends.com lists the same X trends; its first list on the page is the latest hour.
async function fetchGetDayTrends(country) {
  const res = await fetch(`https://getdaytrends.com/${country}/`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from getdaytrends`);
  const html = await res.text();
  const items = [...html.matchAll(new RegExp(`href="/${country}/trend/([^"]+?)/?"[^>]*>([^<]+)<`, 'g'))].map((m) => ({
    title: decodeEntities(m[2].trim()),
    link: `https://x.com/search?q=${m[1]}`,
    platform: 'X',
  }));
  if (!items.length) throw new Error('getdaytrends markup changed');
  return items;
}

// Turn "#UpperCkt_Ai_Infra_Stock" into "UpperCkt Ai Infra Stock" for a news search.
const hashtagToWords = (t) => t.replace(/^#/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

// Find today's news coverage of an X trend so it can be explained. Only headlines that actually
// mention the trend's words are kept, to avoid summarizing unrelated stories.
async function newsForTerm(term) {
  const words = term.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const mentions = (title) => {
    const t = title.toLowerCase();
    const hits = words.filter((w) => t.includes(w)).length;
    return words.length ? hits / words.length >= 0.75 : false;
  };
  for (const q of [`"${term}" when:1d`, `${term} when:1d`]) {
    try {
      const items = (await fetchItems(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${GN}`)).map((i) => toNews(i));
      const relevant = items.filter((n) => mentions(n.title));
      if (relevant.length) return relevant.slice(0, 4);
    } catch {}
  }
  return [];
}

export async function getXTrends(country = 'india', n = 5) {
  let trends;
  try {
    trends = dedupe(await fetchGetDayTrends(country), n);
  } catch (err) {
    console.warn(`[x] ${err.message}; trying trends24`);
    trends = dedupe(await fetchXTrends(country), n);
  }
  return Promise.all(
    trends.map(async (t) => {
      const news = await newsForTerm(hashtagToWords(t.title));
      const top = news[0];
      return {
        ...t,
        related: news.map((x) => x.title),
        newsTitle: top?.title || '',
        newsLink: top?.link || '',
        newsSource: top?.source || '',
      };
    }),
  );
}

// Instagram has no public trends data at all, so as a stand-in we show today's news
// coverage of what is going viral there (clearly labelled in the UI).
export async function getViralNews(platform, n = 5) {
  const q = encodeURIComponent(`${platform} viral when:1d`);
  const items = await fetchItems(`https://news.google.com/rss/search?q=${q}&${GN}`);
  return dedupe(items.map((i) => toNews(i, { platform: platform, viaNews: true })), n);
}

export const SECTIONS = {
  newsWorld: () => getNews('world'),
  newsIndia: () => getNews('india'),
  newsLocal: () => getLocalNews(),
  trendsWorld: () => getWorldTrends(),
  trendsIndia: () => getTrends('IN'),
  trendsMaharashtra: () => getTrends('IN-MH'),
  socialX: () => getXTrends('india'),
  socialInstagram: () => getViralNews('Instagram'),
};
