import { useCallback, useEffect, useState } from 'react';

const AUTO_REFRESH_MS = 15 * 60 * 1000;

const NEWS = [
  { key: 'newsWorld', title: 'World', kicker: 'Global' },
  { key: 'newsIndia', title: 'India', kicker: 'National' },
  { key: 'newsLocal', title: 'Pune & Mumbai', kicker: 'Local' },
];
const TRENDS = [
  { key: 'trendsWorld', title: 'Worldwide', kicker: 'Across 14 countries' },
  { key: 'trendsIndia', title: 'India', kicker: 'Nationwide' },
  { key: 'trendsMaharashtra', title: 'Maharashtra', kicker: 'State' },
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

function Panel({ title, kicker, section, loading, rows, children }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <span className="kicker">{kicker}</span>
        <h3>{title}</h3>
        {section?.stale && <span className="stale" title="Latest refresh failed; showing previous data">Earlier data</span>}
      </header>
      {loading && !section ? (
        <Skeleton rows={rows} />
      ) : section?.error && !section.items?.length ? (
        <p className="empty">Couldn’t load this section right now.</p>
      ) : (
        children
      )}
    </section>
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
        <Meta story={lead} />
      </article>
      <ol className="stories">
        {rest.map((n, i) => (
          <li key={n.link || i} className="story">
            <a href={n.link} target="_blank" rel="noreferrer"><h4>{n.title}</h4></a>
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
  const max = Math.max(...items.map((t) => t.trafficNum || 0), 1);
  return (
    <ol className="trends">
      {items.map((t, i) => (
        <li key={t.title + i} className="trend">
          <span className="rank">{i + 1}</span>
          <Thumb src={t.picture} label={t.title} />
          <div className="trend-body">
            <div className="trend-top">
              <a className="trend-title" href={`https://www.google.com/search?q=${encodeURIComponent(t.title)}`} target="_blank" rel="noreferrer">
                {t.title}
              </a>
              <span className="volume">{(t.traffic || '').split(' · ')[0]}</span>
            </div>
            <div className="bar" aria-hidden="true"><span style={{ width: `${Math.max(6, (t.trafficNum / max) * 100)}%` }} /></div>
            {t.newsTitle && (
              <a className="related" href={t.newsLink} target="_blank" rel="noreferrer" title={t.newsTitle}>
                {t.newsTitle}
              </a>
            )}
            {t.geos?.length > 1 && (
              <div className="geos">
                {t.geos.map((g) => <span key={g}>{g}</span>)}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
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
          <div className="brand">
            <span className="logo" aria-hidden="true" />
            <span className="wordmark">News Pulse</span>
          </div>
          <nav className="nav" aria-label="Sections">
            <a href="#news">Top stories</a>
            <a href="#trending">Trending</a>
          </nav>
          <button className="refresh" onClick={() => load(true)} disabled={loading} aria-label="Refresh">
            <RefreshIcon spinning={loading} />
            <span>{loading ? 'Updating' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      <main className="wrap">
        <div className="dateline">
          <p className="date">{today}</p>
          <p className="updated">
            <span className="live" aria-hidden="true" />
            {updated ? `Updated ${timeAgo(updated)}` : 'Fetching the latest…'}
          </p>
        </div>

        {error && <p className="banner">Couldn’t load the latest data ({error}). Try refreshing in a moment.</p>}

        <section id="news" className="block">
          <div className="block-head">
            <h2>Top stories</h2>
            <p>The five biggest headlines in each region</p>
          </div>
          <div className="grid">
            {NEWS.map((s) => (
              <Panel key={s.key} {...s} section={data?.[s.key]} loading={loading} rows={5}>
                <NewsList items={data?.[s.key]?.items} />
              </Panel>
            ))}
          </div>
        </section>

        <section id="trending" className="block">
          <div className="block-head">
            <h2>Trending searches</h2>
            <p>What people are searching for on Google right now</p>
          </div>
          <div className="grid">
            {TRENDS.map((s) => (
              <Panel key={s.key} {...s} section={data?.[s.key]} loading={loading} rows={8}>
                <TrendList items={data?.[s.key]?.items} />
              </Panel>
            ))}
          </div>
        </section>
      </main>

      <footer className="wrap footer">
        <p>Headlines from Google News · Searches from Google Trends · Refreshed every 30 minutes</p>
      </footer>
    </>
  );
}
