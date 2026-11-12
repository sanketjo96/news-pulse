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

function toNews(item, extra = {}) {
  const source = text(item.source);
  let title = text(item.title);
  if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
  return { title, source, link: text(item.link), published: text(item.pubDate), ...extra };
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

export async function getNews(key, n = 5) {
  return dedupe((await fetchItems(FEEDS[key])).map((i) => toNews(i)), n);
}

export async function getLocalNews(n = 5) {
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

export async function getTrends(geo, n = 5) {
  const all = dedupe((await fetchItems(FEEDS.trends(geo))).map((i) => toTrend(i, geo)), Infinity);
  return all.sort((a, b) => b.trafficNum - a.trafficNum).slice(0, n).map(withLabel);
}

export async function getWorldTrends(n = 5) {
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
// Bluesky exposes trending topics publicly (no key). X/Instagram have no free trends API.
export async function getBlueskyTrends(n = 5) {
  const res = await fetch('https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrends?limit=10', {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from Bluesky`);
  const { trends = [] } = await res.json();
  return trends.slice(0, n).map((t) => ({
    title: t.displayName || t.topic,
    summary: t.description || '',
    posts: t.postCount || 0,
    category: t.category || '',
    status: t.status || '',
    link: t.link ? `https://bsky.app${t.link}` : '',
    platform: 'Bluesky',
  }));
}

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

export async function getXTrends(path, n = 5) {
  return dedupe(await fetchXTrends(path), n);
}

// YouTube's official "most popular" chart for a region. Needs a free YOUTUBE_API_KEY
// (Google Cloud console → enable "YouTube Data API v3" → create API key).
export async function getYouTubeTrending(region = 'IN', n = 5) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY not set');
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}&maxResults=${n}&key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from YouTube`);
  const { items = [] } = await res.json();
  return items.map((v) => ({
    title: v.snippet?.title || '',
    channel: v.snippet?.channelTitle || '',
    views: Number(v.statistics?.viewCount || 0),
    picture: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
    published: v.snippet?.publishedAt || '',
    link: `https://www.youtube.com/watch?v=${v.id}`,
    platform: 'YouTube',
  }));
}

export const SECTIONS = {
  newsWorld: () => getNews('world'),
  newsIndia: () => getNews('india'),
  newsLocal: () => getLocalNews(),
  trendsWorld: () => getWorldTrends(),
  trendsIndia: () => getTrends('IN'),
  trendsMaharashtra: () => getTrends('IN-MH'),
  socialBluesky: () => getBlueskyTrends(),
  socialXIndia: () => getXTrends('india'),
  // Only included when a YouTube key is configured.
  ...(process.env.YOUTUBE_API_KEY ? { socialYouTubeIndia: () => getYouTubeTrending('IN') } : {}),
};
