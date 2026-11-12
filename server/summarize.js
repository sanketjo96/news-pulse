// Adds a short, simple summary ("explain it like I'm 15") to news stories and search trends,
// written by an LLM from the headline plus related headlines from other outlets.
// - Provider: Groq (free tier) when GROQ_API_KEY is set, otherwise OpenAI when OPENAI_API_KEY is set.
//   Groq's API is OpenAI-compatible, so the same SDK is used with a different base URL.
// - Summaries are memoized per item, so a story or trend that stays up is summarized once.
// - Without a key this is a no-op; the UI then shows no summary for news and the
//   top related headline for trends.
import OpenAI from 'openai';

const PROVIDER = process.env.GROQ_API_KEY
  ? {
      name: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    }
  : process.env.OPENAI_API_KEY
    ? { name: 'openai', apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5.4-mini' }
    : null;
const BATCH = 10; // keep each request small enough for free-tier tokens-per-minute limits
const memo = new Map(); // "kind:title" -> summary
// Bump when the prompt changes so summaries from older deploys are rewritten instead of reused.
const SUMMARY_VERSION = 2;

const keyOf = (kind, item) => `${kind}:${item.title.toLowerCase().replace(/\s+/g, ' ').trim()}`;

const SYSTEM = `You explain today's news to a curious 15-year-old.
Each item has:
- kind: "news" (a news story), "trend" (something many people are searching for on Google)
  or "x_trend" (a hashtag or topic trending on X/Twitter in India)
- title: the headline or the search term
- related: headlines about the same thing from other news outlets

For each item, write a summary of one or two short sentences (at most 180 characters total) in simple, everyday English:
- news: what happened and why it matters.
- trend: who or what this is, and why people are searching for it right now.
- x_trend: what the hashtag or topic means and why people are posting about it on X.
  If "related" is empty, only explain what the words mean (translate them if they are not English) and end with
  "No news coverage yet." Do not guess why it is trending.

Rules:
- Use only facts stated in the title and related headlines. Never invent names, numbers, causes or outcomes.
- Keep each fact exactly as precise as the headline. Do not merge separate facts into a new claim, and do not
  add titles or roles (like "President") unless a headline states them for that person right now.
- Only use a number if the headline makes clear what it counts (for example a tournament total vs. one match);
  otherwise leave the number out.
- Explain jargon and abbreviations in plain words (for example "ODI" is a one-day cricket match, "impeach" means formally charge an official).
- Friendly and clear, but not childish. No slang, no emojis, no hype, no opinions.
- Do not just repeat the headline; add the context a teenager would need to understand it.
- Always write in English, even if the input is in Hindi or Marathi (names may stay in their original script).
- If the headlines do not make it clear, say simply what is known.`;

const SCHEMA = {
  type: 'object',
  properties: {
    summaries: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' }, summary: { type: 'string' } },
        required: ['id', 'summary'],
        additionalProperties: false,
      },
    },
  },
  required: ['summaries'],
  additionalProperties: false,
};

/** Pre-load summaries (e.g. from the previously deployed data.json). groups: { news: [...], trend: [...] } */
export function seedSummaries(groups) {
  for (const [kind, items] of Object.entries(groups)) {
    for (const it of items ?? []) {
      if (it?.title && it.summary && it.summaryVersion === SUMMARY_VERSION) memo.set(keyOf(kind, it), it.summary);
    }
  }
}

/** Mutates items in place, adding `summary`. groups: { news: [...], trend: [...] } */
export async function addSummaries(groups) {
  const entries = Object.entries(groups).flatMap(([kind, items]) => (items ?? []).map((item) => ({ kind, item })));
  const apply = () => {
    for (const { kind, item } of entries) {
      const s = memo.get(keyOf(kind, item));
      if (s) Object.assign(item, { summary: s, summaryVersion: SUMMARY_VERSION });
    }
  };
  apply();

  if (!PROVIDER) return { generated: 0, skipped: 'no GROQ_API_KEY or OPENAI_API_KEY set' };

  const todo = [...new Map(entries.filter(({ item }) => !item.summary).map((e) => [keyOf(e.kind, e.item), e])).values()];
  if (!todo.length) return { generated: 0, provider: PROVIDER.name };

  const client = new OpenAI({ apiKey: PROVIDER.apiKey, baseURL: PROVIDER.baseURL });
  let generated = 0;
  for (let start = 0; start < todo.length; start += BATCH) {
    const batch = todo.slice(start, start + BATCH);
    const result = await summarizeBatch(client, batch);
    if (!result) break; // error already logged; remaining items are retried on the next run
    for (const { id, summary } of result) {
      const e = batch[id];
      if (e && summary?.trim()) {
        memo.set(keyOf(e.kind, e.item), summary.trim());
        generated++;
      }
    }
  }
  apply();
  return { generated, pending: todo.length - generated, provider: PROVIDER.name, model: PROVIDER.model };
}

async function summarizeBatch(client, batch) {
  const input = JSON.stringify(batch.map(({ kind, item }, id) => ({ id, kind, title: item.title, related: item.related ?? [] })));
  const request = (responseFormat, extraSystem = '') =>
    client.chat.completions.create({
      model: PROVIDER.model,
      messages: [
        { role: 'system', content: SYSTEM + extraSystem },
        { role: 'user', content: input },
      ],
      response_format: responseFormat,
      // gpt-oss models on Groq are reasoning models; medium effort noticeably improves factual care.
      ...(PROVIDER.name === 'groq' && PROVIDER.model.includes('gpt-oss') ? { reasoning_effort: 'medium' } : {}),
    });

  let completion;
  try {
    try {
      completion = await request({ type: 'json_schema', json_schema: { name: 'summaries', schema: SCHEMA, strict: true } });
    } catch (err) {
      // Some models don't support strict JSON schema; fall back to plain JSON mode.
      if (!(err instanceof OpenAI.BadRequestError)) throw err;
      console.warn(`[summaries] json_schema not accepted (${err.message}); retrying with json_object`);
      completion = await request(
        { type: 'json_object' },
        '\n\nRespond with JSON only, exactly in this shape: {"summaries":[{"id":0,"summary":"..."}]}',
      );
    }
  } catch (err) {
    const who = PROVIDER.name === 'groq' ? 'Groq' : 'OpenAI';
    if (err instanceof OpenAI.AuthenticationError) console.error(`[summaries] invalid ${who} API key`);
    else if (err instanceof OpenAI.RateLimitError) console.error(`[summaries] 429 from ${who} (${err.code || 'rate_limit'}): ${err.message}`);
    else if (err instanceof OpenAI.NotFoundError) console.error(`[summaries] model "${PROVIDER.model}" not available on ${who}`);
    else if (err instanceof OpenAI.APIError) console.error(`[summaries] ${who} API error ${err.status}: ${err.message}`);
    else console.error('[summaries]', err.message);
    return null;
  }

  const msg = completion.choices?.[0]?.message;
  if (msg?.refusal) {
    console.error('[summaries] request refused:', msg.refusal);
    return null;
  }
  try {
    return JSON.parse(msg?.content ?? '').summaries ?? [];
  } catch {
    console.error('[summaries] could not parse response (finish_reason:', completion.choices?.[0]?.finish_reason + ')');
    return null;
  }
}
