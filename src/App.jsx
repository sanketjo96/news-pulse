import { useCallback, useEffect, useState } from 'react';

const AUTO_REFRESH_MS = 15 * 60 * 1000;

// The page is organized by region: each region shows its top stories next to what people there are searching for.
const REGIONS = [
  {
    id: 'world',
    name: 'World',
    blurb: 'Global headlines and what the world is searching for',
    news: 'newsWorld',
    trends: 'trendsWorld',
    trendsNote: 'Combined from 14 countries',
  },
  {
    id: 'india',
    name: 'India',
    blurb: 'National headlines and India’s top searches',
    news: 'newsIndia',
    trends: 'trendsIndia',
  },
  {
    id: 'maharashtra',
    name: 'Maharashtra',
    blurb: 'Pune & Mumbai headlines and searches across the state',
    news: 'newsLocal',
    newsTitle: 'Pune & Mumbai',
    trends: 'trendsMaharashtra',
  },
];

function timeAgo(dateStr) {
  const t = new Date(dateStr).getTime();
  if (!t) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)}d ago`;
}

function RefreshIcon({ spinning }) {
  return (
    <svg className={spinning ? 'spin' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function Skeleton({ rows = 5 }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className={i === 0 ? 'lead' : ''} />)}
    </div>
  );
}

function Column({ label, note, section, loading, rows, children }) {
  return (
    <div className="column">
      <div className="column-head">
        <h3>{label}</h3>
        {note && <span className="note">{note}</span>}
        {section?.stale && <span className="stale" title="Latest refresh failed; showing previous data">Earlier data</span>}
      </div>
      {loading && !section ? (
        <Skeleton rows={rows} />
      ) : section?.error && !section.items?.length ? (
        <p className="empty">Couldn’t load this right now.</p>
      ) : (
        children
      )}
    </div>
  );
}

function Meta({ story }) {
  return (
    <div className="meta">
      {story.city && <span className={`city city-${story.city.toLowerCase()}`}>{story.city}</span>}
      <span className="source">{story.source}</span>
      {story.published && <><span className="dot" aria-hidden="true">·</span><time dateTime={new Date(story.published).toISOString()}>{timeAgo(story.published)}</time></>}
    </div>
  );
}

function NewsList({ items = [] }) {
  const [lead, ...rest] = items;
  if (!lead) return <p className="empty">No stories right now.</p>;
  return (
    <div className="news">
      <article className="story lead">
        <a href={lead.link} target="_blank" rel="noreferrer"><h4>{lead.title}</h4></a>
        {lead.summary && <p className="summary">{lead.summary}</p>}
        <Meta story={lead} />
      </article>
      <ol className="stories">
        {rest.map((n, i) => (
          <li key={n.link || i} className="story">
            <a href={n.link} target="_blank" rel="noreferrer"><h4>{n.title}</h4></a>
            {n.summary && <p className="summary">{n.summary}</p>}
            <Meta story={n} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Thumb({ src, label }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="thumb placeholder" aria-hidden="true">{label.charAt(0).toUpperCase()}</div>;
  return <img className="thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function TrendList({ items = [] }) {
  if (!items.length) return <p className="empty">No trends right now.</p>;
  return (
    <ol className="trends">
      {items.map((t, i) => {
        const context = t.summary || t.newsTitle;
        return (
          <li key={t.title + i} className="trend">
            <div className="trend-head">
              <span className="rank">{i + 1}</span>
              <Thumb src={t.picture} label={t.title} />
              <div className="trend-name">
                <a className="trend-title" href={`https://www.google.com/search?q=${encodeURIComponent(t.title)}`} target="_blank" rel="noreferrer">
                  {t.title}
                </a>
                <span className="volume">
                  {(t.traffic || '').split(' · ')[0]} searches
                  {t.geos?.length > 1 && <> · {t.geos.join(', ')}</>}
                </span>
              </div>
            </div>
            {context && <p className={`context ${t.summary ? '' : 'headline'}`}>{context}</p>}
            {t.newsLink && (
              <a className="read-more" href={t.newsLink} target="_blank" rel="noreferrer">
                Read on {t.newsSource || 'source'} <span aria-hidden="true">→</span>
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const compact = (n) => (n >= 1e7 ? `${+(n / 1e7).toFixed(1)} Cr` : n >= 1e5 ? `${+(n / 1e5).toFixed(1)} L` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : `${n}`);

function XList({ items = [] }) {
  if (!items.length) return <p className="empty">No trends right now.</p>;
  return (
    <ol className="social x">
      {items.map((t, i) => (
        <li key={t.title + i}>
          <span className="rank">{i + 1}</span>
          <a href={t.link} target="_blank" rel="noreferrer" className="x-tag">{t.title}</a>
        </li>
      ))}
    </ol>
  );
}

function BlueskyList({ items = [] }) {
  if (!items.length) return <p className="empty">No trends right now.</p>;
  return (
    <ol className="social bsky">
      {items.map((t, i) => (
        <li key={t.title + i}>
          <span className="rank">{i + 1}</span>
          <div>
            <a href={t.link} target="_blank" rel="noreferrer" className="social-title">{t.title}</a>
            {t.summary && <p className="context">{t.summary}</p>}
            <div className="meta">
              <span className="source">{compact(t.posts)} posts</span>
              {t.category && <><span className="dot" aria-hidden="true">·</span><span className="cap">{t.category}</span></>}
              {t.status === 'hot' && <span className="hot">Hot</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function YouTubeList({ items = [] }) {
  if (!items.length) return <p className="empty">No videos right now.</p>;
  return (
    <ol className="social yt">
      {items.map((v, i) => (
        <li key={v.link}>
          <a href={v.link} target="_blank" rel="noreferrer" className="yt-row">
            <img src={v.picture} alt="" loading="lazy" referrerPolicy="no-referrer" />
            <div>
              <span className="social-title">{v.title}</span>
              <div className="meta">
                <span className="source">{v.channel}</span>
                <span className="dot" aria-hidden="true">·</span>
                <span>{compact(v.views)} views</span>
              </div>
            </div>
          </a>
        </li>
      ))}
    </ol>
  );
}

function ViralNewsList({ items = [] }) {
  if (!items.length) return <p className="empty">Nothing right now.</p>;
  return (
    <ol className="stories viral">
      {items.map((n, i) => (
        <li key={n.link || i} className="story">
          <a href={n.link} target="_blank" rel="noreferrer"><h4>{n.title}</h4></a>
          {n.summary && <p className="summary">{n.summary}</p>}
          <Meta story={n} />
        </li>
      ))}
    </ol>
  );
}

const SOCIAL_TABS = [
  { id: 'x', key: 'socialX', label: 'X', note: () => 'Top trends on X in India right now' },
  {
    id: 'instagram',
    key: 'socialInstagram',
    label: 'Instagram',
    note: () => 'Instagram doesn’t share trend data, so these are today’s news stories about what’s going viral on Instagram',
  },
  {
    id: 'youtube',
    key: 'socialYouTube',
    label: 'YouTube',
    note: (items) => (items?.[0]?.views != null ? 'Most popular videos in India right now' : 'Today’s news about viral YouTube videos'),
  },
  { id: 'bluesky', key: 'socialBluesky', label: 'Bluesky', note: () => 'Trending topics worldwide' },
];

function SocialBody({ tab, items }) {
  if (tab.id === 'x') return <XList items={items} />;
  if (tab.id === 'bluesky') return <BlueskyList items={items} />;
  if (tab.id === 'youtube' && items?.[0]?.views != null) return <YouTubeList items={items} />;
  return <ViralNewsList items={items} />;
}

const TAB_STORE = 'news-pulse:social-tab';

function Social({ index, data, loading }) {
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem(TAB_STORE) || 'x';
    } catch {
      return 'x';
    }
  });
  const choose = (id) => {
    setActive(id);
    try {
      localStorage.setItem(TAB_STORE, id);
    } catch {}
  };
  const tab = SOCIAL_TABS.find((t) => t.id === active) || SOCIAL_TABS[0];
  const section = data?.[tab.key];

  return (
    <section id="social" className="region">
      <header className="region-head">
        <span className="region-num">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h2>Social media</h2>
          <p>What people are posting, sharing and watching</p>
        </div>
      </header>
      <div className="column social-panel">
        <div className="tabs" role="tablist" aria-label="Social platforms">
          {SOCIAL_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={t.id === tab.id}
              aria-controls="social-tabpanel"
              className={`tab tab-${t.id}`}
              onClick={() => choose(t.id)}
            >
              <span className="tab-dot" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
        <div id="social-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab.id}`}>
          <p className="tab-note">{tab.note(section?.items)}</p>
          {loading && !section ? (
            <Skeleton rows={5} />
          ) : !section?.items?.length ? (
            <p className="empty">Couldn’t load {tab.label} right now. It will retry on the next refresh.</p>
          ) : (
            <SocialBody tab={tab} items={section.items} />
          )}
        </div>
      </div>
    </section>
  );
}

function Region({ region, index, data, loading }) {
  return (
    <section id={region.id} className="region">
      <header className="region-head">
        <span className="region-num">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h2>{region.name}</h2>
          <p>{region.blurb}</p>
        </div>
      </header>
      <div className="region-body">
        <Column label={region.newsTitle ? `Top stories · ${region.newsTitle}` : 'Top stories'} section={data?.[region.news]} loading={loading} rows={5}>
          <NewsList items={data?.[region.news]?.items} />
        </Column>
        <Column label="Trending searches" note={region.trendsNote} section={data?.[region.trends]} loading={loading} rows={5}>
          <TrendList items={data?.[region.trends]?.items} />
        </Column>
      </div>
    </section>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    try {
      // Dev: live Express API. Production (GitHub Pages): snapshot rebuilt by GitHub Actions.
      const url = import.meta.env.DEV
        ? `/api/dashboard${force ? '?refresh=1' : ''}`
        : `${import.meta.env.BASE_URL}data.json?t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const updated = data && Math.max(...Object.values(data).map((s) => s.updatedAt || 0));
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <header className="masthead">
        <div className="wrap masthead-inner">
          <a className="brand" href="#top" aria-label="News Pulse home">
            <span className="logo" aria-hidden="true" />
            <span className="wordmark">News Pulse</span>
          </a>
          <nav className="nav" aria-label="Regions">
            {REGIONS.map((r) => <a key={r.id} href={`#${r.id}`}>{r.name}</a>)}
            <a href="#social">Social</a>
          </nav>
          <button className="refresh" onClick={() => load(true)} disabled={loading} aria-label="Refresh">
            <RefreshIcon spinning={loading} />
            <span>{loading ? 'Updating' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      <main className="wrap" id="top">
        <div className="intro">
          <p className="date">{today}</p>
          <h1>Today’s briefing</h1>
          <p className="updated">
            <span className="live" aria-hidden="true" />
            {updated ? `Updated ${timeAgo(updated)}` : 'Fetching the latest…'}
            <span className="dot" aria-hidden="true">·</span>
            Top stories, searches and social trends
          </p>
        </div>

        {error && <p className="banner">Couldn’t load the latest data ({error}). Try refreshing in a moment.</p>}

        {REGIONS.map((r, i) => <Region key={r.id} region={r} index={i} data={data} loading={loading} />)}
        <Social index={REGIONS.length} data={data} loading={loading} />
      </main>

      <footer className="wrap footer">
        <p>Headlines: Google News · Searches: Google Trends · Social: X (via getdaytrends.com), Google News, YouTube, Bluesky · Plain-English summaries written by AI from related headlines · Refreshed every 30 minutes</p>
      </footer>
    </>
  );
}
