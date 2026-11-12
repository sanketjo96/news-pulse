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
