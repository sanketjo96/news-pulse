# News Pulse

Top 5 news (World / India / Pune & Mumbai) and top 10 trending searches (Worldwide / India / Maharashtra).

- `npm run dev` — API on :3001 + Vite on :5173 (proxies `/api`)
- `npm run build && npm start` — single server on :3001 serving the built app

Data: Google News RSS and Google Trends "Trending now" RSS (no API keys).
Feeds are cached for 15 min on the server; the page auto-refreshes every 15 min.
Worldwide trends = merged from 14 countries (see `WORLD_GEOS` in `server/feeds.js`),
ranked by number of countries, then by combined search volume.

## GitHub Pages
Pages is static, so `.github/workflows/deploy.yml` runs `scripts/build-data.js` to snapshot
all sections into `data.json`, builds the app and deploys it — on every push to `main`,
every 30 min (cron), or manually via *Actions → Run workflow*.

## Optional keys (GitHub → Settings → Secrets → Actions)
- `OPENAI_API_KEY` — an OpenAI model (default `gpt-5.4-mini`; override with an `OPENAI_MODEL` Actions variable) writes a 2-line "why it's trending" summary for each search trend
  (only new topics are sent; previous summaries are reused). Without it, the top related headline is shown.
- `YOUTUBE_API_KEY` — adds a "YouTube · India" most-popular column (YouTube Data API v3, free).
