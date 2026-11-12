// Adds a short "why is this trending" summary to each trend, written by an OpenAI model
// from the related headlines Google Trends provides.
// - Summaries are memoized by topic, so a topic that keeps trending is summarized once.
// - Without OPENAI_API_KEY this is a no-op and the UI falls back to the top headline.
import OpenAI from 'openai';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const memo = new Map(); // topic key -> summary

const keyOf = (t) => t.title.toLowerCase().replace(/\s+/g, ' ').trim();

const SYSTEM = `You write context lines for a news dashboard that lists trending Google searches.
For each topic you get the search term and a few news headlines about it.
Write a summary of one or two short sentences (at most 170 characters) that tells a reader who or what the topic is and why people are searching for it right now.
Rules:
- Use only facts stated in the headlines. Do not guess or add outside details.
- Plain, neutral, factual tone. No hype, no emojis, no clickbait.
- Always write in English, even if the topic or headlines are in Hindi or Marathi (a name may stay in its original script).
- Do not begin by repeating the search term verbatim; get straight to the point.
- If the headlines do not clearly explain the trend, summarize what they do say.`;

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

/** Pre-load summaries (e.g. from the previously deployed data.json). */
export function seedSummaries(trends = []) {
  for (const t of trends) if (t?.title && t.summary) memo.set(keyOf(t), t.summary);
}

/** Mutates trend items in place, adding `summary` where available. */
export async function addSummaries(trends) {
  const apply = () => {
    for (const t of trends) {
      const s = memo.get(keyOf(t));
      if (s) t.summary = s;
    }
  };
  apply();

  if (!process.env.OPENAI_API_KEY) return { generated: 0, skipped: 'OPENAI_API_KEY not set' };

  const todo = [...new Map(trends.filter((t) => !t.summary && t.related?.length).map((t) => [keyOf(t), t])).values()];
  if (!todo.length) return { generated: 0 };

  const client = new OpenAI();
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(todo.map((t, id) => ({ id, topic: t.title, headlines: t.related }))) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'trend_summaries', schema: SCHEMA, strict: true } },
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
    if (todo[id] && summary?.trim()) {
      memo.set(keyOf(todo[id]), summary.trim());
      generated++;
    }
  }
  apply();
  return { generated };
}
