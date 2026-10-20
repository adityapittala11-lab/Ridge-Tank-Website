// Tank Academy cheat checks, run on the server when a round is scored. Used by api/shark.js.
// Nothing here stores what a student wrote: only the reasons and a few numbers go into the saved round.
//
// Three kinds of evidence:
//   1. How the answers got into the box (the page counts typed letters and blocks pasting).
//   2. Whether the answers copy the built-in examples.
//   3. Whether the writing reads like a chatbot (the AI grader's estimate plus a few tell-tale signs).
//   4. Whether a person or a program did the typing ("auto-typer" tools that type AI text into the box key by key).
//      People type unevenly: they pause to think, speed up inside words, hold each key a slightly different time
//      and fix typos. Programs tend to type at a steady beat, hold every key the same time, never pause and never fix
//      anything, and scripts inside the browser send fake key events the browser marks as not real.
// "hold" means the round doesn't count. "flag" means it counts but officers should take a look.
import { SAMPLES } from './_course-facts.js';

// Tunable without a code change (Vercel environment variables).
const AI_HOLD = Number(process.env.ACADEMY_AI_HOLD || 85);   // AI-written estimate (0-100) that cancels a round on its own
const AI_FLAG = Number(process.env.ACADEMY_AI_FLAG || 60);   // estimate that gets a round flagged for officers
const MAX_CPS = Number(process.env.ACADEMY_MAX_CPS || 15);   // typed letters per second; 15 is about 180 words a minute

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9$% ]+/g, ' ').replace(/\s+/g, ' ').trim();
function shingles(s) {
  const w = norm(s).split(' ').filter(Boolean), out = new Set();
  for (let i = 0; i + 2 < w.length; i++) out.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
  return out;
}
const SAMPLE_SETS = SAMPLES.map(shingles);

// Share of the answer's 3-word phrases that also appear in one example (0 to 1).
export function exampleOverlap(text) {
  const a = shingles(text);
  if (a.size < 6) return 0;
  let best = 0;
  SAMPLE_SETS.forEach(b => {
    let hit = 0;
    a.forEach(x => { if (b.has(x)) hit++; });
    best = Math.max(best, hit / a.size);
  });
  return best;
}

// Signs that text came out of a chatbot. Each one is weak on its own, so they only count together.
const TELLS = [
  /\bas an ai\b/i, /\blanguage model\b/i, /\bin today'?s (fast[- ]paced|digital|modern)\b/i, /\bimagine a world\b/i,
  /\bgame[- ]changer\b/i, /\bseamless(ly)?\b/i, /\bleverag(e|ing)\b/i, /\bunlock (the|your) (full )?potential\b/i,
  /\bdelve\b/i, /\brevolutioniz(e|ing)\b/i, /\bempower(s|ing)?\b/i, /\bcutting[- ]edge\b/i, /\bin conclusion\b/i,
  /\bfurthermore\b/i, /\bmoreover\b/i, /\btailored\b/i, /\belevate\b/i, /\bfoster(s|ing)?\b/i
];
export function chatbotSigns(text) {
  const t = String(text || '');
  let n = 0;
  TELLS.forEach(r => { if (r.test(t)) n++; });
  if (/—/.test(t)) n++;                         // em dash
  if (/(^|\n)\s*(#{1,3} |\* |- |\d+\. )/.test(t)) n++; // markdown headings or lists
  if (/\*\*[^*]+\*\*/.test(t)) n++;                  // **bold**
  return { count: n, admitsAI: /\bas an ai\b|\blanguage model\b/i.test(t) };
}

// answers: what the student sent, in order. tel: what the page measured for each answer. ai: the grader's 0-100 estimate (or null).
// Rhythm of one answer. Returns why it looks machine-typed, or null. Mobile keyboards don't report real key
// timings, so the hold-time checks only run on computer keyboards.
function botRhythm(x, chars) {
  const keys = Number(x.keys) || 0;
  if (Number(x.untrusted) > 0) return { hard: true, why: 'fake key presses' };
  if (chars >= 60 && Number(x.orphan) > Math.max(20, chars * 0.3)) return { hard: true, why: 'text that skipped the keyboard' };
  if (keys < 60) return null;
  const ikiCv = Number(x.ikiCv), dwellCv = Number(x.dwellCv), dwellMean = Number(x.dwellMean), dwellN = Number(x.dwellN) || 0;
  if (Number.isFinite(ikiCv) && ikiCv < 0.25) return { hard: true, why: 'a perfectly steady typing beat' };
  if (!x.mobile && dwellN >= 40 && Number.isFinite(dwellMean) && dwellMean < 12) return { hard: true, why: 'keys released instantly' };
  if (!x.mobile && dwellN >= 40 && Number.isFinite(dwellCv) && dwellCv < 0.12) return { hard: true, why: 'every key held the same time' };
  if (chars >= 250 && !Number(x.backs) && !Number(x.pauses)) return { hard: false, why: 'no pauses or fixes in a long answer' };
  return null;
}

export function check(answers, tel, ai) {
  const reasons = [], notes = [];
  let hold = false, flag = false;
  const all = answers.join('\n');
  const t = tel && Array.isArray(tel.answers) ? tel : null;

  // 1. Typing evidence.
  if (!t || t.answers.length !== answers.length) {
    hold = true;
    reasons.push('Your page is out of date. Refresh it and try the round again.');
  } else {
    let chars = 0, typed = 0, fast = false;
    t.answers.forEach((x, i) => {
      const c = answers[i].length, ty = Math.max(0, Math.min(c * 2, Number(x.typed) || 0)), ms = Math.max(0, Number(x.ms) || 0);
      chars += c; typed += ty;
      if (ty >= 80 && ms > 0 && ty / (ms / 1000) > MAX_CPS) fast = true;
    });
    const ratio = chars ? typed / chars : 1;
    notes.push('typed ' + Math.round(Math.min(1, ratio) * 100) + '%');
    if (chars >= 60 && ratio < 0.6) { hold = true; reasons.push('Most of this wasn’t typed in the box. Type your answers yourself.'); }
    if (fast) { hold = true; reasons.push('Text showed up faster than anyone can type. Type your answers yourself.'); }
    // 4. Person or program?
    const bots = t.answers.map((x, i) => botRhythm(x || {}, answers[i].length)).filter(Boolean);
    if (bots.some(b => b.hard)) {
      hold = true;
      reasons.push('The typing looked like a program, not a person (' + bots.filter(b => b.hard).map(b => b.why)[0] + '). Turn off any auto-typer and type it yourself.');
    } else if (bots.length) flag = true;
    if (bots.length) notes.push('bot typing: ' + [...new Set(bots.map(b => b.why))].join(', '));
    const pastes = Number(t.pastes) || 0, leaves = Number(t.leaves) || 0;
    if (pastes) notes.push(pastes + ' paste' + (pastes > 1 ? 's' : '') + ' blocked');
    if (leaves) notes.push('left the page ' + leaves + 'x');
    if (pastes >= 2) flag = true;
    if (leaves >= 3) flag = true;
    if (leaves >= 3 && ai != null && ai >= AI_FLAG) { hold = true; reasons.push('You left the round several times and the answers read like an AI tool wrote them.'); }
  }

  // 2. Copying the examples.
  const overlap = Math.max(0, ...answers.map(exampleOverlap));
  if (overlap >= 0.5) { hold = true; reasons.push('Your answer is too close to the built-in example. Use your own idea and words.'); }
  if (overlap >= 0.3) notes.push('example overlap ' + Math.round(overlap * 100) + '%');

  // 3. Chatbot writing.
  const signs = chatbotSigns(all);
  if (ai != null) notes.push('AI-written estimate ' + ai);
  if (signs.count) notes.push(signs.count + ' chatbot sign' + (signs.count > 1 ? 's' : ''));
  if (signs.admitsAI || (ai != null && ai >= AI_HOLD) || (ai != null && ai >= 70 && signs.count >= 2)) {
    hold = true;
    reasons.push('This reads like an AI tool wrote it. The sharks want your own thinking, even if it’s rough.');
  } else if ((ai != null && ai >= AI_FLAG) || signs.count >= 2) flag = true;

  return { hold, flag: hold || flag, reasons: [...new Set(reasons)], notes };
}
