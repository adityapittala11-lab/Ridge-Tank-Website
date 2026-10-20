// Scores a finished Tank Academy round and saves it, all on the server. Used by api/shark.js ({ mode: 'score' }).
// Members can't write rounds themselves any more (db/050_academy_integrity.sql), so a score can't be typed in by hand.
// What the student wrote is sent to the grader and then thrown away. Only scores, reasons and a few numbers are saved.
import { getPool, ensureSchema } from './_pg.js';
import { handle } from './_shark-core.js';
import { check } from './_integrity.js';
import { LEVELS, WEEKLY } from './_course-facts.js';

const CATS = ['clear', 'customer', 'numbers', 'persuasion', 'answers'];
const STAR_XP = [0, 0, 25, 60];
function bad(msg, status = 400) { const e = new Error(msg); e.status = status; return e; }

// Backup scoring when the AI can't be reached. Same simple rules the page used to run.
function ruleScores(answers) {
  const words = s => (s.match(/\S+/g) || []).length;
  const all = answers.join(' '), w = words(all), n = Math.max(1, answers.length), digits = (all.match(/\d+(\.\d+)?/g) || []).length;
  const money = /[$%]|percent|dollar/i.test(all), sent = Math.max(1, (all.match(/[.!?]+/g) || []).length), avg = w / n;
  return {
    clear: 1 + (w >= 25) + (w >= 60) + (w / sent <= 22),
    customer: 1 + /(student|freshm|9th|10th|11th|12th|customer|parent|teacher|friend|people|buyer|kids)/i.test(all) + (digits >= 1) + /(where|hang|lunch|chat|table|group|online|school)/i.test(all) + /last time|tell me about|walk me through|what did you do|how much/i.test(all),
    numbers: (digits >= 1) + (digits >= 3) + money + /(cost|price|profit|margin|break|revenue|percent)/i.test(all),
    persuasion: 1 + /\?|what if|imagine|picture|last (tuesday|week)/i.test(all) + /(buy|join|try|ask|invest|\$)/i.test(all) + (w >= 18 && w <= 140),
    answers: 1 + (avg >= 14) + !/(idk|dunno|not sure|i guess)/i.test(all) + answers.every(a => words(a) >= 6)
  };
}

function tally(facts, kind, c) {
  let total = 0;
  CATS.forEach(k => { c[k] = Math.max(0, Math.min(4, Math.round(Number(c[k]) || 0))); total += c[k]; });
  const fv = c[facts.focus], passed = total >= facts.pass && fv >= 3;
  let stars = 0;
  if (passed) { stars = 1; if (total >= facts.pass + 3) stars = 2; if (total >= 18 && fv === 4) stars = 3; }
  const xp = passed ? (kind === 'level' ? facts.xp + STAR_XP[stars] : 40) : 0;
  return { c, total, passed, stars, xp };
}

export async function scoreRound(userId, body, key) {
  const kind = body.kind === 'weekly' ? 'weekly' : body.kind === 'level' ? 'level' : null;
  const item = Math.floor(Number(body.item));
  const facts = kind === 'level' ? LEVELS[item] : kind === 'weekly' ? WEEKLY[item] : null;
  if (!facts) throw bad('Unknown round.');

  const transcript = Array.isArray(body.transcript) ? body.transcript : [];
  const answers = transcript.filter(m => m && m.student).map(m => String(m.text || '').trim().slice(0, 1200)).filter(Boolean);
  if (answers.length < facts.needed) throw bad('Finish the round first.');

  // Grade: the AI when it answers, simple rules when it doesn't.
  let graded = null;
  if (key) {
    try { graded = await handle(Object.assign({}, body, { mode: 'score', focus: facts.focus }), key); } catch (e) { graded = null; }
  }
  const scores = graded ? graded.scores : ruleScores(answers);
  const aiWritten = graded ? graded.aiWritten : null;
  const v = tally(facts, kind, Object.assign({}, scores));

  const integrity = check(answers, body.telemetry, aiWritten);
  const counted = integrity.hold ? { passed: false, stars: 0 } : { passed: v.passed, stars: v.stars };

  await ensureSchema();
  const pool = getPool();
  const me = await pool.query('select id from public.members where user_id = $1 limit 1', [userId]);
  if (!me.rows.length) throw bad('Finish setting up your member profile first.', 403);
  const breakdown = Object.assign({ ai: !!graded }, v.c, integrity.hold ? { would_pass: v.passed, would_stars: v.stars } : {});
  const flags = integrity.flag ? { reasons: integrity.reasons, notes: integrity.notes, held: integrity.hold } : null;
  let row;
  try {
    const r = await pool.query(
      'insert into public.course_rounds (member_id, kind, item, score, stars, passed, breakdown, flagged, flags) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',
      [me.rows[0].id, kind, item, v.total, counted.stars, counted.passed, breakdown, integrity.flag, flags]);
    row = r.rows[0];
  } catch (e) {
    if (e.code === 'P0001') throw bad(e.message, 429);
    throw e;
  }

  return {
    row,
    scores: v.c, total: v.total, passed: counted.passed, stars: counted.stars, xp: integrity.hold ? 0 : v.xp, ai: !!graded,
    keep: graded ? graded.keep : '', fix: graded ? graded.fix : [], closer: graded ? graded.closer : '',
    held: integrity.hold, reasons: integrity.reasons, flagged: integrity.flag
  };
}
