import { useCallback, useEffect, useState } from 'react';

const AUTO_REFRESH_MS = 15 * 60 * 1000;

const NEWS = [
  { key: 'newsWorld', title: 'World' },
  { key: 'newsIndia', title: 'India' },
  { key: 'newsLocal', title: 'Pune & Mumbai' },
];
const TRENDS = [
  { key: 'trendsWorld', title: 'Worldwide', note: 'Combined from 14 countries' },
  { key: 'trendsIndia', title: 'India' },
  { key: 'trendsMaharashtra', title: 'Maharashtra' },
];

function timeAgo(dateStr) {
  const t = new Date(dateStr).getTime();
  if (!t) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function Card({ title, note, section, loading, children }) {
  return (
    <section className="card">
      <header className="card-head">
        <h3>{title}</h3>
        {note && <span className="note">{note}</span>}
        {section?.stale && <span className="badge warn">stale</span>}
      </header>
      {loading && !section ? (
        <div className="skeleton">{Array.from({ length: 5 }, (_, i) => <div key={i} />)}</div>
      ) : section?.error && !section.items?.length ? (
        <p className="error">Couldn't load: {section.error}</p>
      ) : (
        children
      )}
    </section>
  );
}

function NewsList({ items = [] }) {
  return (
    <ol className="list">
      {items.map((n, i) => (
        <li key={n.link || i}>
          <a href={n.link} target="_blank" rel="noreferrer">{n.title}</a>
          <div className="meta">
            {n.city && <span className="badge">{n.city}</span>}
            <span>{n.source}</span>
            {n.published && <span>· {timeAgo(n.published)}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function TrendList({ items = [] }) {
  return (
    <ol className="list trends">
      {items.map((t, i) => (
        <li key={t.title + i}>
          <div className="trend-row">
            <a href={`https://www.google.com/search?q=${encodeURIComponent(t.title)}`} target="_blank" rel="noreferrer" className="trend-title">
              {t.title}
            </a>
            <span className="traffic">{t.traffic}</span>
          </div>
          {t.newsTitle && (
            <a className="meta related" href={t.newsLink} target="_blank" rel="noreferrer">
              {t.newsTitle}{t.newsSource ? ` — ${t.newsSource}` : ''}
            </a>
          )}
          {t.geos?.length > 1 && <div className="meta">{t.geos.map((g) => <span key={g} className="badge">{g}</span>)}</div>}
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

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>News Pulse</h1>
          <p className="sub">
            {updated ? `Updated ${new Date(updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
          </p>
        </div>
        <button onClick={() => load(true)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      {error && <p className="error banner">Couldn't load data: {error}</p>}

      <h2>Top 5 news</h2>
      <div className="grid">
        {NEWS.map((s) => (
          <Card key={s.key} title={s.title} section={data?.[s.key]} loading={loading}>
            <NewsList items={data?.[s.key]?.items} />
          </Card>
        ))}
      </div>

      <h2>Top 10 trending searches</h2>
      <div className="grid">
        {TRENDS.map((s) => (
          <Card key={s.key} title={s.title} note={s.note} section={data?.[s.key]} loading={loading}>
            <TrendList items={data?.[s.key]?.items} />
          </Card>
        ))}
      </div>

      <footer>Sources: Google News RSS · Google Trends “Trending now”</footer>
    </div>
  );
}
