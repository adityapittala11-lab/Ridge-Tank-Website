// Vercel Function "/api/shark": the Tank Academy shark chat (one shark at a time, inside a level's round).
// The Groq key is read from the Vercel environment variable GROQ_API_KEY (Project Settings > Environment Variables).
// It is never in the repo and the browser never sees it: the browser sends the round, this asks Groq, only the reply goes back.
// Only signed-in members can use it, so the endpoint can't be used as a free chatbot.
//   { mode: 'reply', ... }  one shark's next line
//   { mode: 'score', kind, item, transcript, telemetry }  grades the round, runs the cheat checks and saves it
import { handle } from './_shark-core.js';
import { scoreRound } from './_round.js';
import { memberId, dailyLimit, jsonBody } from './_shared.js';

// A round is about 6 to 10 messages, so this is roughly 8 rounds a day per member.
const allow = dailyLimit(Number(process.env.SHARK_DAILY_LIMIT || 80));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, obj) => res.status(status).json(obj);

  // Open this address in a browser to check the key is set. It never shows the key.
  if (req.method === 'GET') return send(200, { aiConfigured: !!process.env.GROQ_API_KEY });
  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });

  const id = await memberId(req);
  if (!id || id === 'dev') return send(401, { error: 'Log in first.' });
  const body = jsonBody(req);

  try {
    // Scoring works even without the AI key (it falls back to simple rules), so rounds always get saved here.
    if (body.mode === 'score') return send(200, await scoreRound(id, body, process.env.GROQ_API_KEY));
    if (!process.env.GROQ_API_KEY) return send(503, { error: 'AI is not set up yet.' });
    if (!allow(id)) return send(429, { error: 'The sharks need a break. Try again tomorrow.' });
    return send(200, await handle(body, process.env.GROQ_API_KEY));
  } catch (e) {
    return send(e.status || 500, { error: e.message || 'Something went wrong.' });
  }
}
