import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SECTIONS } from './feeds.js';

const PORT = process.env.PORT || 3001;
const TTL_MS = 15 * 60 * 1000; // refresh feeds at most every 15 minutes

const cache = new Map(); // key -> { data, ts }

async function load(key, force) {
  const hit = cache.get(key);
  if (hit && !force && Date.now() - hit.ts < TTL_MS) return { items: hit.data, updatedAt: hit.ts };
  try {
    const data = await SECTIONS[key]();
    const ts = Date.now();
    cache.set(key, { data, ts });
    return { items: data, updatedAt: ts };
  } catch (err) {
    console.error(`[${key}]`, err.message);
    // If a refresh fails, keep showing the last good data.
    if (hit) return { items: hit.data, updatedAt: hit.ts, stale: true };
    return { items: [], error: err.message };
  }
}

const app = express();

app.get('/api/dashboard', async (req, res) => {
  const force = req.query.refresh === '1';
  const keys = Object.keys(SECTIONS);
  const values = await Promise.all(keys.map((k) => load(k, force)));
  res.json(Object.fromEntries(keys.map((k, i) => [k, values[i]])));
});

// In production, serve the built React app.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
