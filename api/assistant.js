// Assistant: a general-purpose AI chat for officers. POST /api/assistant
// Officers only: the login token is checked and the account must be in public.admins. No daily cap.
// Uses Groq with the same GROQ_API_KEY as the sharks. Conversations are not saved on the server.
import { memberId, jsonBody } from './_shared.js';
import { getPool, ensureSchema } from './_pg.js';
import { checkPassword, signUnlock, verifyUnlock, tooManyTries } from './_auth.js';

// The Assistant is locked behind a second password on top of officer login. Only a salted hash of it is kept here,
// never the password itself. To change it, set ASSISTANT_PASSWORD in Vercel (that overrides this).
const PASSWORD_HASH = 'a5bb1819d774b3c2320c7d05fa29ff08:908c2e642a404002e2ee3faa4263f37d80f02b0f8288342cc54c4de6a4375778077fae5aa21d0c724a3bfa0dcaae603fc0ebe3b89db8f6735c8617581c8108b9';
function passwordOk(pw) {
  const env = process.env.ASSISTANT_PASSWORD;
  if (env) return String(pw) === env;
  return checkPassword(pw, PASSWORD_HASH);
}

const MODEL = process.env.ASSISTANT_MODEL || 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM = `You are a helpful general-purpose AI assistant. Help with anything the user asks: solving problems, planning, research questions, explanations, and writing or editing emails, messages and other text.

How to answer:
- Be direct and useful. Give the answer or the finished draft first, then short notes if needed.
- For emails, include a subject line, match the tone asked for, and keep it short unless told otherwise.
- Use plain language. Use short lists or headings only when they make the answer easier to scan.
- If something important is missing, make a sensible assumption, say what you assumed, and still give a complete answer.
- Do not invent facts. Use a placeholder like [DATE] when you do not know something.`;

const clip = (v, n) => String(v || '').replace(/\u0000/g, '').slice(0, n);

async function isOfficer(userId) {
  if (userId === 'dev') return true;
  await ensureSchema();
  const r = await getPool().query('select 1 from public.admins where user_id = $1', [userId]);
  return r.rows.length > 0;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, obj) => res.status(status).json(obj);

  if (req.method === 'GET') return send(200, { aiConfigured: !!process.env.GROQ_API_KEY });
  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
  const key = process.env.GROQ_API_KEY;
  const early = jsonBody(req);
  // Unlock step: needs officer login AND the password, then returns a proof good for 8 hours.
  if (early.mode === 'unlock') {
    const uid = await memberId(req);
    if (!uid) return send(401, { error: 'Please log in first.' });
    try { if (!(await isOfficer(uid))) return send(403, { error: 'Only officers can use the assistant.' }); }
    catch (e) { return send(503, { error: 'Could not check your officer access. Try again in a moment.' }); }
    if (tooManyTries('assistant:' + uid, 5)) return send(429, { error: 'Too many wrong tries. Wait 10 minutes.' });
    if (!passwordOk(early.password)) return send(403, { error: 'Wrong password.' });
    return send(200, { unlock: signUnlock(uid, 'assistant') });
  }

  const id = await memberId(req);
  if (!id) return send(401, { error: 'Please log in first.' });
  try {
    if (!(await isOfficer(id))) return send(403, { error: 'Only officers can use the assistant.' });
  } catch (e) {
    return send(503, { error: 'Could not check your officer access. Try again in a moment.' });
  }

  if (id !== 'dev' && !verifyUnlock(String(req.headers['x-assistant-unlock'] || ''), id, 'assistant')) return send(403, { error: 'locked', locked: true });

  if (!key) return send(503, { error: 'The AI is not set up yet (GROQ_API_KEY is missing in Vercel).' });

  const body = jsonBody(req);
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .slice(-24)
    .map(m => ({ role: m.role, content: clip(m.content, 8000) }));
  if (!history.length || history[history.length - 1].role !== 'user') return send(400, { error: 'Type a message first.' });

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, temperature: 0.7, max_completion_tokens: 4000, reasoning_effort: 'medium',
        messages: [{ role: 'system', content: SYSTEM }, ...history]
      })
    });
    if (r.status === 429) return send(429, { error: 'The AI is busy right now. Try again in a minute.' });
    if (!r.ok) return send(502, { error: 'The AI did not answer. Try again in a minute.' });
    const data = await r.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) return send(502, { error: 'The AI sent an empty answer. Try again.' });
    return send(200, { reply: String(text).trim() });
  } catch (e) {
    return send(502, { error: 'The AI did not answer. Try again in a minute.' });
  }
}
