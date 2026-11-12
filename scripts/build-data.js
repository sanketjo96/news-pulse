// Writes public/data.json with all dashboard sections (used for the static GitHub Pages build).
// If a section fails, falls back to that section from the previously deployed snapshot (PREV_URL).
// Trend summaries from the previous snapshot are reused so only new topics are sent to Claude.
import { mkdirSync, writeFileSync } from 'node:fs';
import { SECTIONS } from '../server/feeds.js';
import { addSummaries, seedSummaries } from '../server/summarize.js';

let prev = {};
if (process.env.PREV_URL) {
  try {
    const r = await fetch(process.env.PREV_URL, { signal: AbortSignal.timeout(15000) });
    if (r.ok) prev = await r.json();
  } catch {}
}

const out = {};
for (const [key, fn] of Object.entries(SECTIONS)) {
  try {
    const items = await fn();
    if (!items.length) throw new Error('empty');
    out[key] = { items, updatedAt: Date.now() };
    console.log(`✓ ${key}: ${items.length}`);
  } catch (err) {
    console.warn(`✗ ${key}: ${err.message}`);
    out[key] = prev[key]?.items?.length ? { ...prev[key], stale: true } : { items: [], error: err.message };
  }
}

const trendKeys = Object.keys(out).filter((k) => k.startsWith('trends'));
seedSummaries(trendKeys.flatMap((k) => prev[k]?.items ?? []));
const result = await addSummaries(trendKeys.flatMap((k) => out[k].items));
console.log('summaries:', JSON.stringify(result));

mkdirSync('public', { recursive: true });
writeFileSync('public/data.json', JSON.stringify(out));
