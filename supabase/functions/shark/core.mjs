// The AI sharks. Shared by tools/dev-server.mjs (this computer) and the Supabase Edge Function (live site).
// The browser never sees the Groq key: it sends the round so far, this code asks Groq, and only the reply comes back.
// Only the round's text is sent to Groq. No names, emails or member ids.

export const MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CATS = ['clear', 'customer', 'numbers', 'persuasion', 'answers'];

const RULES = [
  'Stay in character and keep it school-appropriate: no swearing, no put-downs, nothing about dating, drugs, alcohol, weapons or politics.',
  'If the student writes something inappropriate or off topic, steer back to the pitch in one sentence.',
  'Never ask for personal details like full names, addresses, phone numbers, social media or passwords.',
  'Write plain sentences. No emoji, no markdown, no em dashes.'
].join(' ');

function bad(msg, status = 400) { const e = new Error(msg); e.status = status; return e; }
const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

// Accept only the fields we expect, at sensible sizes, so the endpoint can't be used as a free chatbot.
export function clean(body) {
  if (!body || typeof body !== 'object') throw bad('Bad request.');
  const mode = body.mode === 'score' ? 'score' : body.mode === 'reply' ? 'reply' : null;
  if (!mode) throw bad('Unknown mode.');
  const transcript = Array.isArray(body.transcript) ? body.transcript.slice(-16).map(m => ({
    student: !!m.student, who: str(m.who, 40), text: str(m.text, 1200)
  })).filter(m => m.text) : [];
  if (!transcript.length) throw bad('Empty round.');
  return {
    mode,
    level: str(body.level, 40), title: str(body.title, 120), round: str(body.round, 400),
    focus: CATS.includes(body.focus) ? body.focus : 'answers', talk: !!body.talk,
    speaker: { name: str(body.speaker && body.speaker.name, 40) || 'Nurse', role: str(body.speaker && body.speaker.role, 120), desc: str(body.speaker && body.speaker.desc, 400) },
    transcript
  };
}

function replyRequest(b) {
  const sp = b.speaker;
  const system = [
    `You are ${sp.name}${sp.role ? ', ' + sp.role : ''}, a character in Ridge Tank Academy, a Shark Tank style course for high school students at Mountain Ridge High School in Arizona.`,
    sp.desc ? 'Your personality: ' + sp.desc : '',
    `This is ${b.level}: "${b.title}". What this round practices: ${b.round}`,
    b.talk
      ? 'In this round the student interviews you. Answer their latest question in character, in 1 to 3 short sentences, the way a real person would. Give useful details only when they ask good, specific questions. Do not coach them.'
      : 'Ask exactly one follow-up question, under 35 words. Build on what the student just said and push on the weakest or vaguest part of it. Do not praise first, do not give advice, do not answer for them.',
    RULES
  ].filter(Boolean).join('\n');
  const messages = [{ role: 'system', content: system }];
  b.transcript.forEach(m => messages.push(m.student ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text }));
  if (messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', content: '(The student is waiting for you.)' });
  return { model: MODEL, messages, temperature: 0.7, max_completion_tokens: 400, reasoning_effort: 'low' };
}

function scoreRequest(b) {
  const lines = b.transcript.map(m => (m.student ? 'Student: ' : (m.who || 'Shark') + ': ') + m.text).join('\n');
  const system = [
    `You judge a Ridge Tank Academy practice round for a high school student. Level: ${b.level}, "${b.title}". What it practices: ${b.round}`,
    'Score only what the student wrote. Each category is 0 to 4, where 4 is excellent for a high school student, 2 is okay and 0 is missing:',
    'clear: a stranger could repeat the idea in one sentence.',
    'customer: names a specific person or group and where to find them, or (in an interview round) asks good questions about the customer.',
    'numbers: uses real costs, prices or counts that add up.',
    'persuasion: opens with something that makes you want to keep listening and ends with a clear ask.',
    'answers: answers each question directly, without dodging.',
    `This level's focus is ${b.focus}. Be honest, not generous.`,
    `Reply with JSON only, exactly this shape: {"scores":{"clear":0,"customer":0,"numbers":0,"persuasion":0,"answers":0},"keep":"one sentence to the student about the best part","fix":["one specific next step","another specific next step"],"closer":"one or two sentences that ${b.speaker.name} says straight to the student, in first person, reacting to the round"}`,
    `Write keep and fix to the student as "you". Write closer as ${b.speaker.name} talking, never describing ${b.speaker.name} in third person.`,
    RULES
  ].join('\n');
  return {
    model: MODEL, temperature: 0.2, max_completion_tokens: 900, reasoning_effort: 'low',
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: 'The round:\n' + lines }]
  };
}

const tidy = s => {
  const t = String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function groq(key, req) {
  const r = await fetch(GROQ_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw bad((j.error && j.error.message) || 'The AI service is not answering.', r.status === 429 ? 429 : 502);
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw bad('The AI sent an empty answer.', 502);
  return text;
}

export async function handle(body, key) {
  if (!key) throw bad('AI is not set up yet.', 503);
  const b = clean(body);
  if (b.mode === 'reply') return { text: tidy(await groq(key, replyRequest(b))).slice(0, 600) };
  const raw = await groq(key, scoreRequest(b));
  let j;
  try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) { throw bad('The AI score could not be read.', 502); }
  const scores = {};
  CATS.forEach(k => { const v = Math.round(Number(j.scores && j.scores[k])); scores[k] = Number.isFinite(v) ? Math.max(0, Math.min(4, v)) : 0; });
  const fix = (Array.isArray(j.fix) ? j.fix : [j.fix]).map(tidy).filter(Boolean).slice(0, 2);
  return { scores, keep: tidy(j.keep).slice(0, 240), fix, closer: tidy(j.closer).slice(0, 300) };
}
