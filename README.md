# News Pulse

Organized by region (World / India / Maharashtra): top 3 news stories each, plus top 3 Google searches from India and Maharashtra,
plus a Social media section with X (India) trends and Instagram viral stories.

- `npm run dev` — API on :3001 + Vite on :5173 (proxies `/api`)
- `npm run build && npm start` — single server on :3001 serving the built app

Data: Google News RSS and Google Trends "Trending now" RSS (no API keys).
Feeds are cached for 15 min on the server; the page auto-refreshes every 15 min.

## GitHub Pages
Pages is static, so `.github/workflows/deploy.yml` runs `scripts/build-data.js` to snapshot
all sections into `data.json`, builds the app and deploys it — on every push to `main`,
every 30 min (cron), or manually via *Actions → Run workflow*.

## Optional keys (GitHub → Settings → Secrets → Actions)
- `GROQ_API_KEY` (free, preferred) or `OPENAI_API_KEY` — an LLM (Groq: `openai/gpt-oss-120b`, override with `GROQ_MODEL`; OpenAI: default `gpt-5.4-mini`; override with an `OPENAI_MODEL` Actions variable) (default `gpt-5.4-mini`; override with an `OPENAI_MODEL` Actions variable) writes a short, plain-English summary (pitched at a 15-year-old) for every news story, search trend and X trend
  (only new topics are sent; previous summaries are reused). Without it, the top related headline is shown.
