// Adds a short, simple summary ("explain it like I'm 15") to news stories and search trends,
// written by an OpenAI model from the headline plus related headlines from other outlets.
// - Summaries are memoized per item, so a story or trend that stays up is summarized once.
// - Without OPENAI_API_KEY this is a no-op; the UI then shows no summary for news and the
//   top related headline for trends.
import OpenAI from 'openai';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const memo = new Map(); // "kind:title" -> summary

const keyOf = (kind, item) => `${kind}:${item.title.toLowerCase().replace(/\s+/g, ' ').trim()}`;

const SYSTEM = `You explain today's news to a curious 15-year-old.
Each item has:
- kind: "news" (a news story) or "trend" (something many people are searching for on Google)
- title: the headline or the search term
- related: headlines about the same thing from other news outlets

For each item, write a summary of one or two short sentences (at most 180 characters total) in simple, everyday English:
- news: what happened and why it matters.
- trend: who or what this is, and why people are searching for it right now.

Rules:
- Use only facts stated in the title and related headlines. Never invent names, numbers, causes or outcomes.
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
    for (const it of items ?? []) if (it?.title && it.summary) memo.set(keyOf(kind, it), it.summary);
  }
}

/** Mutates items in place, adding `summary`. groups: { news: [...], trend: [...] } */
export async function addSummaries(groups) {
  const entries = Object.entries(groups).flatMap(([kind, items]) => (items ?? []).map((item) => ({ kind, item })));
  const apply = () => {
    for (const { kind, item } of entries) {
      const s = memo.get(keyOf(kind, item));
      if (s) item.summary = s;
    }
  };
  apply();

  if (!process.env.OPENAI_API_KEY) return { generated: 0, skipped: 'OPENAI_API_KEY not set' };

  const todo = [...new Map(entries.filter(({ item }) => !item.summary).map((e) => [keyOf(e.kind, e.item), e])).values()];
  if (!todo.length) return { generated: 0 };

  const client = new OpenAI();
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: JSON.stringify(todo.map(({ kind, item }, id) => ({ id, kind, title: item.title, related: item.related ?? [] }))),
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'summaries', schema: SCHEMA, strict: true } },
    });
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError) console.error('[summaries] invalid OPENAI_API_KEY');
    else if (err instanceof OpenAI.RateLimitError) console.error('[summaries] rate limited or out of credits');
    else if (err instanceof OpenAI.NotFoundError) console.error(`[summaries] model "${MODEL}" not available - set OPENAI_MODEL`);
    else if (err instanceof OpenAI.APIError) console.error(`[summaries] API error ${err.status}: ${err.message}`);
    else console.error('[summaries]', err.message);
    return { generated: 0, error: true };
  }

  const msg = completion.choices?.[0]?.message;
  if (msg?.refusal) {
    console.error('[summaries] request refused:', msg.refusal);
    return { generated: 0, error: true };
  }
  let parsed;
  try {
    parsed = JSON.parse(msg?.content ?? '');
  } catch {
    console.error('[summaries] could not parse response (finish_reason:', completion.choices?.[0]?.finish_reason + ')');
    return { generated: 0, error: true };
  }

  let generated = 0;
  for (const { id, summary } of parsed.summaries ?? []) {
    const e = todo[id];
    if (e && summary?.trim()) {
      memo.set(keyOf(e.kind, e.item), summary.trim());
      generated++;
    }
  }
  apply();
  return { generated, model: MODEL };
}
