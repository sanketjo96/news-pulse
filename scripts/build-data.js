// Writes public/data.json with all dashboard sections (used for the static GitHub Pages build).
// If a section fails, falls back to that section from the previously deployed snapshot (PREV_URL).
import { mkdirSync, writeFileSync } from 'node:fs';
import { SECTIONS } from '../server/feeds.js';

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

mkdirSync('public', { recursive: true });
writeFileSync('public/data.json', JSON.stringify(out));
