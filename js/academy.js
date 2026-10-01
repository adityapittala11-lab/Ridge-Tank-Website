// Tank Academy: the year-long course. Levels open by date in blocks of five. You pass a level by scoring well
// in a shark round. Each block's Edge is collected by checking in at a meeting once its five levels are done.
// Progress lives in the course_rounds table (supabase/migration_v4_course.sql). Until that table exists,
// rounds are kept in this browser so the course still works.
(function () {
  const RT = window.RT;
  const C = window.RT_COURSE;
  if (!C) return;
  const { h, clear, icon, toast, segmented, avatar, busy, friendly, fmtDate, localDateISO, parseLocalDate } = RT;
  const S = RT.state;

  // ---------------- small helpers ----------------
  const LS = { date: 'rt_academy_date', early: 'rt_academy_early', draft: 'rt_academy_draft_', local: 'rt_academy_rounds_' };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  const DAY = 86400000;
  const daysBetween = (a, b) => Math.round((parseLocalDate(b) - parseLocalDate(a)) / DAY);
  const addDays = (iso, n) => { const d = parseLocalDate(iso); d.setDate(d.getDate() + n); return localDateISO(d); };
  const longDate = iso => fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' });
  const shortDate = iso => fmtDate(iso, { month: 'short', day: 'numeric' });
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // Officers can look at the course as it will be on another day; everyone else sees today.
  function today() {
    if (S.isAdmin) {
      const d = store.get(LS.date, null);
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    }
    return localDateISO();
  }
  // Early access: an officer can open every level on their own account before its date (saved in this browser).
  // Members never see the switch, so the course stays date-locked for everyone else.
  const earlyOn = () => !!S.isAdmin && store.get(LS.early, false) === true;
  // config.js academy.openNow opens the whole course for everyone (still one level at a time).
  const openForAll = () => !!(window.RT_CONFIG && RT_CONFIG.academy && RT_CONFIG.academy.openNow);
  const opened = (n, t) => openForAll() || earlyOn() || t >= blockOf(n).opens;

  // ---------------- course rules ----------------
  const seasonOf = n => (n <= 10 ? 1 : n <= 20 ? 2 : n <= 30 ? 3 : 4);
  const blockOf = n => C.blocks.find(b => n >= b.a && n <= b.b);
  const RANKS = [[40, 'Apex'], [30, 'Hunter'], [20, 'Juvenile'], [10, 'Pup'], [0, 'Newcomer']];
  const rankOf = done => RANKS.find(r => done >= r[0])[1];
  const WALLET = { Newcomer: 2, Pup: 3, Juvenile: 5, Hunter: 8, Apex: 10 };
  const STAR_XP = [0, 0, 25, 60];
  const TRIES_PER_DAY = 3;
  const mainAgent = n => { const a = C.levels[n].agent; return a === 'All five' ? 'Great White' : a.split(' + ')[0]; };
  const agentText = n => { const a = C.levels[n].agent; return a === 'All five' ? 'all five sharks' : a; };
  const rewardText = r => r.replace(/^Edge: ([^,]+)/, 'the $1 Edge');
  const edgeName = b => b.reward.replace(/^Edge: /, '').split(',')[0];
  const FOCUS = { Nurse: 'clear', Tiger: 'customer', Hammerhead: 'numbers', Mako: 'persuasion', 'Great White': 'answers', Cam: 'customer', Rex: 'answers', Sully: 'numbers', Dana: 'persuasion' };

  // ---------------- data ----------------
  const AC = { rounds: [], attendance: [], local: false, loaded: false, memberId: null };

  function missingTable(e) {
    const msg = String((e && e.message) || '');
    return !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || (/course_(rounds|board)/.test(msg) && /does not exist|schema cache|could not find/i.test(msg)));
  }

  async function loadRounds(id) {
    const { data, error } = await RT.sb.from('course_rounds').select('*').eq('member_id', id).order('created_at', { ascending: true });
    if (error) {
      if (!missingTable(error)) throw error;
      AC.local = true;
      return store.get(LS.local + id, []);
    }
    AC.local = false;
    return data || [];
  }

  async function load() {
    const id = S.me.id;
    const [rounds, attendance] = await Promise.all([loadRounds(id), RT.api.myAttendance(id).catch(() => [])]);
    Object.assign(AC, { rounds, attendance, loaded: true, memberId: id });
  }
  RT.academyLoad = load;

  async function saveRound(row) {
    const id = S.me.id;
    if (!AC.local) {
      const { data, error } = await RT.sb.from('course_rounds').insert(Object.assign({}, row, { member_id: id })).select().single();
      if (!error) { AC.rounds.push(data); return data; }
      if (!missingTable(error)) throw error;
      AC.local = true;
    }
    const list = store.get(LS.local + id, []);
    const saved = Object.assign({}, row, { id: 'local-' + Date.now(), member_id: id, created_at: new Date().toISOString() });
    list.push(saved);
    store.set(LS.local + id, list);
    AC.rounds.push(saved);
    return saved;
  }

  // Everything the screens need, worked out from the saved rounds and today's date.
  function prog() {
    const t = today();
    const best = {};   // level -> { stars, at } from passed rounds
    const weekly = {}; // challenge index -> true
    AC.rounds.forEach(r => {
      if (!r.passed) return;
      if (r.kind === 'weekly') { weekly[r.item] = true; return; }
      const b = best[r.item];
      if (!b) best[r.item] = { stars: r.stars, at: r.created_at };
      else { if (r.stars > b.stars) b.stars = r.stars; if (r.created_at < b.at) b.at = r.created_at; }
    });
    let done = 0;
    while (best[done + 1]) done++;
    const cur = done < 40 ? done + 1 : null;
    const curOpen = !!cur && opened(cur, t);
    const xp = Object.keys(best).reduce((s, n) => s + C.seasons[seasonOf(+n)].xp + STAR_XP[best[n].stars], 0) + Object.keys(weekly).length * 40;
    return { t, best, weekly, done, cur, curOpen, xp, season: cur ? seasonOf(cur) : 4, rank: rankOf(done) };
  }
  RT.academyProgress = () => (AC.loaded && AC.memberId === (S.me && S.me.id) ? prog() : null);

  function lstate(n, p) {
    if (p.best[n]) return 'done';
    if (!opened(n, p.t)) return 'locked';
    return n === p.cur ? 'current' : 'ahead';
  }

  function meetingDate(a) {
    const m = S.meetings.find(x => x.id === a.meeting_id);
    return m ? String(m.meeting_date).slice(0, 10) : null;
  }
  // A block's Edge: locked until its five levels are passed, then collected at the first meeting
  // you check in to on or after both the block's gate meeting and the day you finished.
  function blockClaim(b, p) {
    const lv = [];
    for (let n = b.a; n <= b.b; n++) lv.push(p.best[n]);
    if (lv.some(x => !x)) return { state: 'locked', left: lv.filter(x => !x).length };
    const finished = lv.map(x => localDateISO(new Date(x.at))).sort().pop();
    const from = finished > b.gate ? finished : b.gate;
    const hit = AC.attendance.map(meetingDate).filter(d => d && d >= from && d <= p.t).sort()[0];
    return hit ? { state: 'claimed', on: hit } : { state: 'ready', from };
  }

  function triesToday(kind, item) {
    const d = localDateISO();
    return AC.rounds.filter(r => r.kind === kind && r.item === item && localDateISO(new Date(r.created_at)) === d).length;
  }

  function curChallenge(p) {
    let c = null, idx = -1;
    C.challenges.forEach((x, i) => { if (x.iso <= p.t) { c = x; idx = i; } });
    if (!c || daysBetween(c.iso, p.t) > 6) return null;
    return { c, i: idx };
  }

  // ---------------- drawings: stars and shark portraits ----------------
  function starRow(k, sz) {
    const wrap = h('span', { class: 'ac-stars', role: 'img', 'aria-label': k + ' of 3 stars' });
    let s = '';
    for (let i = 1; i <= 3; i++) s += '<svg class="' + (i <= k ? '' : 'off') + '" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>';
    wrap.innerHTML = s;
    return wrap;
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  const AVC = { Nurse: '#86DDB0', Tiger: '#D2476E', Hammerhead: '#8FA69B', Mako: '#3FBF7F', 'Great White': '#C9D2CD', Cam: '#F09AB2', Rex: '#A51D45', Sully: '#6F8C7E', Dana: '#D2476E' };
  function sharkSvg(name) {
    const c = AVC[name], dk = shade(c, -0.5), lt = shade(c, 0.72);
    const body = 'M3 22L17 35C25 30 36 26 46 28C54 30 60 34 63 38C57 41 50 47 40 48.5C30 50 24 46 17 41L3 54L9 38Z';
    let s = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="' + shade(c, -0.72) + '"/><g transform="translate(0,-2)">';
    s += '<path d="M33 29L40 11L47 29Z" fill="' + c + '"/><path d="' + body + '" fill="' + c + '"/>';
    s += '<path d="M17 41C24 46 30 50 40 48.5C50 47 57 41 63 38C56 43 48 45 40 44.5C31 44 24 42 17 41Z" fill="' + lt + '"/>';
    s += '<path d="M30 46L22 59L39 49Z" fill="' + dk + '"/>';
    const eye = '<circle cx="53" cy="35" r="2.2" fill="#fff"/><circle cx="53.7" cy="35.2" r="1.1" fill="#111"/>';
    const gills = '<path d="M43 33q2 3 0 7M46 33q2 3 0 7" stroke="' + dk + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
    const teeth = '<path d="M63 38.5Q56 45 47 43Q54 41 63 38.5Z" fill="#7E1434"/><path d="M60 40l-1 3 2-1.5zM56 42l-1 3 2-1.5zM52 43l-1 3 2-1.5z" fill="#fff"/>';
    if (name === 'Hammerhead') s += '<rect x="55" y="21" width="9" height="28" rx="4.5" fill="' + c + '"/><circle cx="60" cy="25" r="2.2" fill="#fff"/><circle cx="60.6" cy="25.2" r="1.1" fill="#111"/>' + gills;
    else if (name === 'Tiger') s += eye + gills + '<path d="M24 31q3 5 2 11M30 29q3 5 3 12M36 28q3 5 3 11" stroke="' + dk + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    else if (name === 'Mako') s += '<circle cx="53" cy="35" r="2.8" fill="#07160F"/><circle cx="53.8" cy="34.4" r="0.9" fill="#fff"/>' + gills + '<path d="M63 38.5Q56 43 47 42" stroke="' + dk + '" stroke-width="1.6" fill="none"/>';
    else if (name === 'Nurse') s += '<path d="M50 35q3 -2 5 0" stroke="#10131A" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M58 42q-3 2 -4 6M60 41q-1 3 0 6" stroke="' + dk + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' + gills + '<circle cx="28" cy="36" r="1.3" fill="' + dk + '"/><circle cx="34" cy="40" r="1.3" fill="' + dk + '"/><circle cx="37" cy="33" r="1.2" fill="' + dk + '"/>';
    else if (name === 'Great White') s += '<circle cx="53" cy="35" r="2.2" fill="#10131A"/>' + gills + teeth;
    else if (name === 'Rex') s += '<rect x="48" y="31" width="11" height="5.5" rx="2.5" fill="#12141B"/>' + gills + teeth;
    else s += eye + gills;
    return s + '</g></svg>';
  }
  function roleSvg(name) {
    const c = AVC[name];
    let g = '';
    if (name === 'Cam') g = '<circle cx="32" cy="25" r="9" fill="#FFE4CF"/><path d="M13 55c2-12 10-17 19-17s17 5 19 17z" fill="#FFE4CF"/>';
    if (name === 'Sully') g = '<rect x="15" y="22" width="34" height="26" rx="3" fill="#E9E4DA"/><path d="M15 31h34M28 22v9h8v-9" stroke="' + shade(c, -0.4) + '" stroke-width="2.4" fill="none"/>';
    if (name === 'Dana') g = '<path d="M13 28l5-12h28l5 12z" fill="#FFF"/><path d="M18 16l-3 12M26 16l-1 12M34 16v12M42 16l1 12M46 16l3 12" stroke="' + c + '" stroke-width="3"/><rect x="16" y="28" width="32" height="20" rx="2" fill="#FBE9EE"/><rect x="27" y="34" width="10" height="14" fill="' + shade(c, -0.2) + '"/>';
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="' + shade(c, -0.45) + '"/>' + g + '</svg>';
  }
  function portrait(name, size) {
    const svg = (name === 'Cam' || name === 'Sully' || name === 'Dana') ? roleSvg(name) : sharkSvg(AVC[name] ? name : 'Great White');
    return h('span', { class: 'ac-av', style: { width: size + 'px', height: size + 'px' }, html: svg });
  }
  RT.sharkPortrait = portrait; // the "Pitch the panel" tab (js/sharks.js) draws the same sharks

  // ---------------- the Academy page ----------------
  let redraw = null; // set by the open Academy view so a finished round can refresh it

  RT.views.academy = function (root, t) {
    let sub = t.sub || '';
    const tabFor = s => (s === 'edges' || s === 'panel' ? s : 'year');
    const seg = segmented({
      items: [{ value: 'year', label: 'Your year' }, { value: 'panel', label: 'Pitch the panel' }, { value: 'edges', label: 'Edges and the Crown' }],
      value: tabFor(sub), ariaLabel: 'Academy', onChange: v => RT.go(v === 'year' ? 'academy' : 'academy/' + v)
    });
    const subLine = h('span', null, 'Loading your year');
    root.appendChild(RT.pageHead('Academy', subLine, seg));
    const body = h('div', null, RT.skeleton(5));
    root.appendChild(body);

    function draw() {
      const p = prog();
      subLine.textContent = p.cur ? `Level ${p.cur} · ${p.rank} · ${p.xp.toLocaleString()} XP` : `All 40 levels done · ${p.xp.toLocaleString()} XP`;
      clear(body);
      if (S.isAdmin) body.appendChild(officerBar(p, draw));
      const m = /^level\/(\d+)$/.exec(sub);
      if (m && C.levels[+m[1]]) drawLevel(body, +m[1], p);
      else if (sub === 'edges') drawEdges(body, p);
      else if (sub === 'panel' && RT.sharksPanel) RT.sharksPanel(body);
      else drawYear(body, p);
    }
    redraw = draw;
    load().then(draw).catch(e => { clear(body).appendChild(h('div', { class: 'card empty' }, h('p', { class: 'muted' }, friendly(e)))); });
    return {
      update(nt) {
        sub = nt.sub || '';
        seg.setValue(tabFor(sub));
        if (AC.loaded) draw();
        window.scrollTo(0, 0);
      },
      cleanup() { redraw = null; closeRound(); }
    };
  };

  function officerBar(p, draw) {
    const input = h('input', { class: 'input', type: 'date', value: p.t, min: '2026-10-01', max: '2027-05-31', 'aria-label': 'Show the course as it looks on this date' });
    input.addEventListener('change', () => { if (input.value) { store.set(LS.date, input.value); draw(); } });
    const reset = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { store.set(LS.date, null); draw(); } }, 'Back to today');
    const early = h('button', { class: 'btn btn-sm ' + (earlyOn() ? 'btn-ghost' : 'btn-primary'), type: 'button', onclick: () => { store.set(LS.early, earlyOn() ? null : true); draw(); } },
      earlyOn() ? 'Back to normal dates' : 'Open all levels for me');
    return h('div', { class: 'ac-officer' },
      openForAll() ? h('span', { class: 'muted small' }, 'The course is open to everyone (academy.openNow in config.js).') : early, openForAll() ? null : h('span', { class: 'muted small' }, earlyOn() ? 'Every level is open on your account. Members still see the normal dates.' : 'Officers only. Members still see the normal dates.'),
      h('span', null, 'Show the course as it looks on'), input, store.get(LS.date, null) ? reset : null,
      AC.local ? h('span', { class: 'ac-officer-note' }, 'Progress is saved in this browser until migration_v4_course.sql is run in Supabase.') : null);
  }

  // ---------------- your year ----------------
  function drawYear(body, p) {
    const grid = h('div', { class: 'dash-grid' }, nowCard(p), nextCard(p));
    const wk = weeklyCard(p);
    if (wk) grid.appendChild(wk);
    const year = h('section', { class: 'card ac-year' });
    for (let s = 1; s <= 4; s++) year.appendChild(seasonEl(s, p));
    body.append(grid,
      h('div', { class: 'section-row' }, h('h2', { class: 'h2' }, 'Your year'), h('span', { class: 'muted' }, 'Levels open five at a time. You collect each block’s Edge by checking in at a meeting.')),
      year);
  }

  function nowCard(p) {
    const n = p.cur || 40, L = C.levels[n], se = C.seasons[p.season];
    let label, cta, sub = null;
    if (!p.cur) {
      label = 'Course finished';
      cta = h('p', { class: 'muted' }, 'All 40 levels done. See you at the Grand Finale.');
    } else if (!p.curOpen) {
      label = 'Up next';
      cta = h('p', { class: 'muted' }, 'Opens ' + longDate(blockOf(n).opens) + '.');
    } else {
      label = `Up next in Season ${p.season}: ${se.name}`;
      sub = h('p', { class: 'muted' }, 'With ' + agentText(n) + ' · ' + se.xp + ' XP');
      cta = h('a', { class: 'btn btn-primary', href: '#/academy/level/' + n }, 'Continue level ' + n);
    }
    const first = (p.season - 1) * 10 + 1;
    const bar = h('ol', { 'aria-hidden': 'true' });
    for (let i = 0; i < 10; i++) {
      const k = first + i;
      bar.appendChild(h('li', { class: p.best[k] ? 'done' : k === p.cur && p.curOpen ? 'cur' : '' }, h('i'), String(k)));
    }
    const inSeason = Object.keys(p.best).filter(k => seasonOf(+k) === p.season).length;
    return h('section', { class: 'card span-7 ac-now' },
      h('div', { class: 'ac-now-head' },
        h('div', { class: 'ac-lvl' }, h('span', { class: 'card-label' }, 'Level'), h('span', { class: 'big-num' }, String(n))),
        h('div', { class: 'min0' }, h('p', { class: 'card-label' }, label), h('h2', null, p.cur ? L.t : 'All 40 levels done'), sub)),
      h('div', { class: 'ac-sbar' }, h('p', { class: 'card-label' }, `Season ${p.season}: ${inSeason} of 10 levels done`), bar),
      h('div', { class: 'ac-foot' },
        h('p', { class: 'muted' }, h('b', null, String(p.done)), ' of 40 levels · ', h('b', null, p.xp.toLocaleString()), ' XP · ', p.rank, ' rank · ', h('b', null, String(WALLET[p.rank])), ' bites notes for live nights'),
        cta));
  }

  function nextCard(p) {
    const el = h('section', { class: 'card span-5' }, h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Next meeting')));
    const up = S.meetings.map(m => Object.assign({}, m, { d: String(m.meeting_date).slice(0, 10) })).filter(m => m.d >= p.t).sort((a, b) => (a.d < b.d ? -1 : 1));
    const m = up[0];
    if (!m) { el.appendChild(h('p', { class: 'muted' }, 'No meeting on the calendar yet. Officers add meetings in Officer tools.')); return el; }
    const dd = daysBetween(p.t, m.d);
    const todo = [];
    C.blocks.forEach(b => {
      const c = blockClaim(b, p);
      if (c.state === 'ready' && m.d >= c.from) todo.push(h('li', null, h('i'), h('span', null, 'Check in to collect ' + rewardText(b.reward))));
    });
    const gate = C.blocks.find(b => b.gate === m.d);
    if (gate && blockClaim(gate, p).state === 'locked') {
      let have = 0;
      for (let n = gate.a; n <= gate.b; n++) if (p.best[n]) have++;
      todo.push(h('li', null, h('i'), h('span', null, `Finish levels ${gate.a} to ${gate.b} (${have} of 5 done)`)));
    }
    todo.push(h('li', null, h('i'), h('span', null, 'Tap your card at the door')));
    el.append(
      h('div', { class: 'next-when' }, dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : 'In ' + dd + ' days'),
      h('p', { class: 'muted small' }, longDate(m.d) + (m.location ? ' · ' + m.location : '')),
      h('p', { class: 'ac-next-name' }, m.name || 'Meeting'),
      h('p', { class: 'card-label ac-gap' }, 'Before you go'),
      h('ul', { class: 'ac-checks' }, todo));
    return el;
  }

  function weeklyCard(p) {
    const cc = curChallenge(p);
    if (!cc) return null;
    const { c, i } = cc, ag = c.agent === 'All five' ? 'Great White' : c.agent;
    const done = !!p.weekly[i], left = TRIES_PER_DAY - triesToday('weekly', i);
    const btn = done ? h('span', { class: 'status-pill ok' }, 'Done, +40 XP')
      : h('button', { class: 'btn btn-ghost', type: 'button', disabled: left <= 0, onclick: () => openRound(weeklySpec(i)) }, left <= 0 ? 'No tries left today' : 'Play it');
    return h('section', { class: 'card span-12 ac-week' }, portrait(ag, 44),
      h('div', { class: 'grow min0' },
        h('p', { class: 'card-label' }, `This week’s challenge, week ${i + 1} of 30` + (c.tag ? ` (${c.tag.toLowerCase().replace(/^\w+/, w => cap(w))})` : '')),
        h('h3', null, c.title),
        h('p', { class: 'muted small' }, `${c.agent} · 40 XP · closes ${fmtDate(addDays(c.iso, 6), { weekday: 'long', month: 'short', day: 'numeric' })} at 11:59 pm`)),
      btn);
  }

  function seasonEl(s, p) {
    const se = C.seasons[s], blocks = C.blocks.filter(b => b.season === s);
    let done = 0;
    for (let n = (s - 1) * 10 + 1; n <= s * 10; n++) if (p.best[n]) done++;
    const status = done === 10 ? h('p', { class: 'ac-status done' }, icon('check', 15), 'Done')
      : opened(blocks[0].a, p.t) ? h('p', { class: 'ac-status now' }, done + ' of 10 done')
      : h('p', { class: 'ac-status' }, 'Opens ' + shortDate(blocks[0].opens));
    const finale = C.meetings.find(m => m.season === s && m.kind === 'event' && /Mini|Demo|Gauntlet|Finale/.test(m.title));
    const el = h('section', { class: 'ac-season' },
      h('div', { class: 'ac-season-h' }, h('h3', null, `Season ${s}: ${se.name}`), status, h('p', { class: 'muted' }, se.dates + ' · ' + se.goal)));
    blocks.forEach(b => {
      const path = h('div', { class: 'ac-path' });
      for (let n = b.a; n <= b.b; n++) {
        const st = lstate(n, p), L = C.levels[n];
        path.appendChild(h('a', { class: 'ac-node ' + st, href: '#/academy/level/' + n, 'aria-label': `Level ${n}, ${L.t}, ${st === 'ahead' ? 'open' : st}` },
          h('span', { class: 'ac-dot' }, String(n)),
          h('span', { class: 'ac-nm' }, h('span', { class: 't' }, L.t),
            h('span', { class: 's' }, agentText(n) + ' · ' + se.xp + ' XP' + (L.mission ? ' · real-world mission' : '')),
            st === 'done' ? h('span', { class: 'st' }, starRow(p.best[n].stars, 11)) : null)));
      }
      const cl = blockClaim(b, p);
      path.appendChild(h('a', { class: 'ac-node cp ' + (cl.state === 'claimed' ? 'done' : cl.state === 'ready' ? 'current' : 'locked'), href: '#/academy/edges', 'aria-label': 'Reward: ' + b.reward },
        h('span', { class: 'ac-dot' }, icon(cl.state === 'claimed' ? 'check' : cl.state === 'ready' ? 'award' : 'lock', cl.state === 'locked' ? 15 : 18)),
        h('span', { class: 'ac-nm' }, h('span', { class: 't' }, edgeName(b)),
          h('span', { class: 's' }, cl.state === 'claimed' ? 'Collected ' + shortDate(cl.on) : cl.state === 'ready' ? 'Check in at a meeting to collect' : 'Reward for levels ' + b.a + ' to ' + b.b))));
      el.appendChild(h('div', { class: 'ac-blk' },
        h('p', { class: 'ac-blk-h' }, h('b', null, `Block ${b.id}: ${b.name}`), h('span', null, (openForAll() ? '' : b.opensText + ' · ') + b.claim.replace(/^Unlock at /, 'reward at '))),
        path));
    });
    if (finale) el.appendChild(h('p', { class: 'ac-finale' }, h('span', { class: 'fm', 'aria-hidden': 'true' }), h('span', null, 'Season finale: ', h('b', null, finale.title), ', ' + fmtDate(finale.iso, { weekday: 'short', month: 'short', day: 'numeric' }))));
    return el;
  }

  // ---------------- one level ----------------
  function sentences(text) { return text.split(/\.\s+(?=[A-Z\[])/).map(x => x.replace(/\.$/, '')); }

  function drawLevel(body, n, p) {
    const L = C.levels[n], s = seasonOf(n), se = C.seasons[s], b = blockOf(n), st = lstate(n, p), ag = mainAgent(n);
    const who = C.sharks[ag] || C.roles[ag];
    const left = TRIES_PER_DAY - triesToday('level', n);
    let state = null;
    if (st === 'done') {
      const k = p.best[n].stars;
      state = h('p', { class: 'ac-state' }, icon('check', 15), `Passed with ${k} star${k > 1 ? 's' : ''} `, starRow(k, 13));
    } else if (st === 'locked') state = h('p', { class: 'ac-state off' }, icon('lock', 14), 'Opens ' + longDate(b.opens));
    else if (st === 'ahead') state = h('p', { class: 'ac-state off' }, icon('lock', 14), `Pass level ${p.cur} first`);

    const draftKey = LS.draft + S.me.id + '_' + n;
    const draft = h('textarea', { class: 'input textarea', rows: 5, 'aria-label': 'Your build', placeholder: 'Write your piece here. It goes straight to the shark.' }, store.get(draftKey, ''));
    const wc = h('span', { class: 'muted small' });
    const updWc = () => { wc.textContent = ((draft.value.trim().match(/\S+/g) || []).length) + ' words'; store.set(draftKey, draft.value); };
    draft.addEventListener('input', updWc);
    updWc();

    const canPlay = (st === 'current' || st === 'done') && left > 0;
    const start = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: !canPlay, onclick: () => openRound(levelSpec(n, draft.value)) },
      st === 'done' ? 'Play it again for more stars' : 'Start the shark round');
    const why = st === 'locked' ? 'This level opens ' + longDate(b.opens) + '.'
      : st === 'ahead' ? `Pass level ${p.cur} first.`
      : left <= 0 ? 'No tries left today. Come back tomorrow.' : `${left} of ${TRIES_PER_DAY} tries left today.`;

    body.append(
      h('div', { class: 'ac-crumbs' },
        h('a', { class: 'ac-back', href: '#/academy' }, icon('chevronLeft', 16), 'Your year'),
        h('span', { class: 'muted' }, `Season ${s}: ${se.name} / Block ${b.id}: ${b.name}`)),
      h('header', { class: 'ac-head' },
        h('span', { class: 'big-num' }, String(n)),
        h('div', { class: 'min0' }, h('h1', null, L.t),
          h('p', { class: 'muted' }, `With ${agentText(n)} · ${se.xp} XP · pass mark ${se.pass} of 20` + (L.mission ? ' · includes a real-world mission' : '')),
          state)),
      h('div', { class: 'ac-grid' },
        h('div', { class: 'stack' },
          h('section', { class: 'card' },
            h('h2', { class: 'ac-h' }, 'Learn', h('span', { class: 'muted' }, '3-minute read')),
            h('ul', { class: 'ac-bul' }, sentences(L.learn).map(x => h('li', null, x + '.'))),
            h('p', { class: 'ac-note' }, h('b', null, 'For three stars: '), L.mastery),
            L.mission ? h('p', { class: 'ac-note' }, h('b', null, 'Real-world mission: '), L.mission, ' Show an officer at the next meeting.') : null),
          h('section', { class: 'card' },
            h('h2', { class: 'ac-h' }, 'Build'),
            h('p', { class: 'muted' }, L.build),
            h('div', { class: 'ac-draft' }, draft),
            h('div', { class: 'row between', style: { marginTop: '10px' } }, wc,
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { draft.value = C.samples[n]; draft.dispatchEvent(new Event('input')); } }, 'See an example')))),
        h('aside', { class: 'card ac-shark' },
          h('div', { class: 'ac-shark-top' }, portrait(ag, 64), h('div', null, h('h3', null, ag), h('p', { class: 'muted small' }, who ? who.role : ''))),
          h('p', { class: 'ac-quote' }, '“' + C.scripts[n].opener[1] + '”'),
          h('dl', { class: 'ac-facts' },
            h('div', null, h('dt', null, 'Tests'), h('dd', null, L.round.replace(/\.$/, ''))),
            h('div', null, h('dt', null, 'Judges'), h('dd', null, who && who.judges ? who.judges : 'Customer, Answers')),
            h('div', null, h('dt', null, 'To pass'), h('dd', null, `${se.pass} of 20, with ${cap(FOCUS[ag])} at 3 or more`))),
          start,
          h('p', { class: 'ac-small' }, why),
          h('p', { class: 'ac-small' }, AI.url && !AI.down
            ? 'The sharks are AI and react to what you write. Only your score is saved, not your answers.'
            : 'The sharks follow a script here and score with simple rules.'))));
  }

  // ---------------- edges and the crown ----------------
  function drawEdges(body, p) {
    const list = h('ol', { class: 'ac-edges' }, C.edges.map((e, i) => {
      const b = C.blocks[i], c = blockClaim(b, p);
      let when;
      if (c.state === 'claimed') when = h('p', { class: 'when' }, icon('check', 15), 'Collected ' + shortDate(c.on));
      else if (c.state === 'ready') when = h('p', { class: 'when' }, icon('award', 15), 'Ready. Check in at a meeting on or after ' + shortDate(c.from));
      else when = h('p', { class: 'when' }, icon('lock', 14), `Finish levels ${b.a} to ${b.b}`);
      return h('li', { class: c.state === 'claimed' ? 'on' : c.state === 'ready' ? 'ready' : '' },
        h('span', { class: 'el' }, 'Level ' + e.lvl.slice(1)),
        h('div', { class: 'min0' }, h('h3', null, e.name), h('p', null, e.what)),
        when);
    }));
    body.append(
      h('section', { class: 'card' }, list),
      h('div', { class: 'two-col ac-rules-grid' },
        h('section', { class: 'card' }, h('h3', null, 'The Crown and the boards'),
          h('ul', { class: 'ac-rules' }, C.crown.map(c => h('li', null, h('b', null, c[0]), ' (' + c[1] + '): ' + c[2])))),
        h('section', { class: 'card' }, h('h3', null, 'How Edges work'),
          h('ul', { class: 'ac-rules' },
            h('li', null, 'Single use. Hold up to 3. Use one per live night: Mini Tank, Demo Day, Shark Gauntlet and the Grand Finale.'),
            h('li', null, 'Unused Edges expire at the Grand Finale. Every Edge used shows on the screen.'),
            h('li', null, 'Edges change the live-night rules for you. They never change what the sharks score.'),
            h('li', null, `Your bites wallet for investing: ${WALLET[p.rank]} notes as a ${p.rank}.`)))));
  }

  // ---------------- shark round ----------------
  const CATS = [['clear', 'Clear'], ['customer', 'Customer'], ['numbers', 'Numbers'], ['persuasion', 'Persuasion'], ['answers', 'Answers']];
  const TIPS = {
    clear: ['Your idea was easy to repeat.', 'Say it in one sentence a stranger could repeat.'],
    customer: ['You named a real person.', 'Name one specific person and where you would find them.'],
    numbers: ['Your numbers held up.', 'Add one real number: a cost, a price or a count.'],
    persuasion: ['You gave me a reason to keep listening.', 'Open with a scene or a surprising fact, and end with an ask.'],
    answers: ['You answered straight.', 'Answer the question first, then explain. No dodging.']
  };
  function levelSpec(n, draft) {
    const sc = C.scripts[n], s = seasonOf(n), ag = mainAgent(n), op = sc.opener[0];
    const lines = sc.lines.map(l => [l[0] || op, l[1]]);
    return { kind: 'level', item: n, sub: 'Level ' + n + ': ' + C.levels[n].t, ag, mode: sc.mode, opener: sc.opener, lines,
      needed: sc.mode === 'grill' ? lines.length + 1 : lines.length, focus: FOCUS[ag], pass: C.seasons[s].pass, xp: C.seasons[s].xp, askTag: op, draft: draft || '' };
  }
  function weeklySpec(i) {
    const c = C.challenges[i], ag = c.agent === 'All five' ? 'Great White' : c.agent, w = C.chat.weekly[c.agent] || C.chat.weekly.Nurse;
    return { kind: 'weekly', item: i, sub: 'Weekly challenge: ' + c.title, ag, mode: 'grill', opener: [ag, c.title + '. You have sixty seconds. Go.'],
      lines: [[ag, w[0]], [ag, w[1]]], needed: 3, focus: FOCUS[ag], pass: C.seasons[c.season].pass, xp: 40, askTag: ag, draft: '' };
  }

  // ---------------- AI sharks ----------------
  // On this computer, tools/dev-server.mjs answers /api/shark using the Groq key in .env.local.
  // On the live site, /api/shark is the Vercel Function in api/shark.js (key from Vercel's environment variables).
  // If neither answers, the round falls back to the script and simple scoring, so it always works.
  const cfg = window.RT_CONFIG || {};
  const AI = { url: (cfg.ai && cfg.ai.endpoint) || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/api/shark' : ''), down: false };

  function charInfo(name) { const x = C.sharks[name] || C.roles[name] || {}; return { name, role: x.role || '', desc: x.desc || '' }; }
  function transcriptOf(r) { return r.msgs.map(m => (m.me ? { student: true, text: m.t } : { who: m.who, text: m.t })); }
  function roundInfo(sp) {
    if (sp.kind === 'level') { const L = C.levels[sp.item]; return { level: 'Level ' + sp.item, title: L.t, round: L.round }; }
    const c = C.challenges[sp.item];
    return { level: 'Weekly challenge', title: c.title, round: 'A quick 60-second pitch drill: ' + c.title + '.' };
  }
  async function askAI(payload) {
    if (!AI.url || AI.down) throw new Error('AI is off');
    const headers = { 'Content-Type': 'application/json' };
    // The live endpoint only answers signed-in members, so send the member's login token.
    const { data } = await RT.sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (/supabase\.co/.test(AI.url)) headers.apikey = cfg.supabaseKey;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(AI.url, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) {
        if ([404, 405, 501, 503].includes(r.status)) AI.down = true; // no AI here; stop trying for this visit
        throw new Error((j && j.error) || 'AI error ' + r.status);
      }
      return j;
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) AI.down = true;
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  let R = null; // the open round
  function openRound(spec) {
    closeRound();
    R = { spec, msgs: [], answers: [], turns: 0, busy: false, done: false, verdict: null, saved: null, sampleIx: 0, timer: null };
    const wrap = h('div', { class: 'ac-round-wrap', role: 'presentation' });
    wrap.addEventListener('click', e => { if (e.target === wrap) closeRound(); });
    R.wrap = wrap;
    (document.getElementById('modal-root') || document.body).appendChild(wrap);
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKey, true);
    drawRound();
    say(spec.opener[0], spec.opener[1]);
  }
  function closeRound() {
    if (!R) return;
    clearTimeout(R.timer);
    R.wrap.remove();
    R = null;
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) {
    if (!R) return;
    if (e.key === 'Escape') { e.stopPropagation(); closeRound(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  }

  function drawRound() {
    if (!R) return;
    const sp = R.spec;
    const count = R.verdict ? 'Scored' : `Answer ${Math.min(sp.needed, R.turns + 1)} of ${sp.needed}`;
    const head = h('div', { class: 'ac-rh' }, portrait(sp.ag, 40),
      h('div', { class: 'ac-who' }, h('b', null, sp.ag), h('small', null, sp.sub)),
      h('span', { class: 'ac-count' }, count),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeRound }, icon('x', 18)));
    const panel = h('div', { class: 'ac-round', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Shark round with ' + sp.ag }, head);
    if (R.verdict) panel.appendChild(verdictEl());
    else {
      const msgs = h('div', { class: 'ac-msgs' }, R.msgs.map(msgEl), R.busy ? h('div', { class: 'ac-msg' }, portrait(R.busyWho, 34), h('div', { class: 'ac-bub', 'aria-label': 'Typing' }, h('span', { class: 'ac-typing' }, h('i'), h('i'), h('i')))) : null);
      const off = R.busy || R.done;
      const box = h('textarea', { class: 'input textarea', rows: 3, 'aria-label': 'Your answer', disabled: off,
        placeholder: sp.mode === 'talk' && R.turns === 0 ? 'Ask a question…' : 'Type your answer…' });
      if (!off && R.turns === 0 && sp.draft) box.value = sp.draft;
      R.input = box;
      panel.append(msgs, h('div', { class: 'ac-comp' }, box,
        h('div', { class: 'row between' }, h('span', { class: 'muted small' }, 'A few sentences. Numbers help.'),
          h('span', { class: 'row gap-sm' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: off, onclick: fillSample }, 'Fill an example'),
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', disabled: off, onclick: send }, 'Send', icon('send', 14))))));
      requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; if (!off) box.focus({ preventScroll: true }); });
    }
    clear(R.wrap).appendChild(panel);
    if (RT.dots && RT.dots.scan) RT.dots.scan();
  }
  function msgEl(m) {
    if (m.me) return h('div', { class: 'ac-msg me' }, h('div', { class: 'ac-bub' }, m.t));
    return h('div', { class: 'ac-msg' }, portrait(m.who, 34), h('div', { class: 'min0' }, h('p', { class: 'ac-name' }, m.who), h('div', { class: 'ac-bub' }, m.t)));
  }
  function say(who, text, then) {
    const mine = R;
    if (!mine) return;
    mine.busy = true; mine.busyWho = who; drawRound();
    mine.timer = setTimeout(() => {
      if (R !== mine) return;
      mine.msgs.push({ who, t: text }); mine.busy = false; drawRound();
      if (then) then();
    }, 520 + Math.min(900, text.length * 12));
  }
  // A shark's next line: the AI writes it from the round so far; the script is the backup.
  function respond(who, fallback, then) {
    const mine = R;
    if (!mine) return;
    mine.busy = true; mine.busyWho = who; drawRound();
    const sp = mine.spec, started = Date.now();
    askAI(Object.assign({ mode: 'reply', focus: sp.focus, talk: sp.mode === 'talk', speaker: charInfo(who), transcript: transcriptOf(mine) }, roundInfo(sp)))
      .then(j => (j && j.text) || fallback, () => fallback)
      .then(text => {
        const minWait = text === fallback ? 520 + Math.min(900, text.length * 12) : 450;
        mine.timer = setTimeout(() => {
          if (R !== mine) return;
          mine.msgs.push({ who, t: text }); mine.busy = false; drawRound();
          if (then) then();
        }, Math.max(0, minWait - (Date.now() - started)));
      });
  }
  function send() {
    if (!R || R.busy || R.done || !R.input) return;
    const v = R.input.value.trim();
    if (!v) { R.input.focus(); return; }
    R.msgs.push({ me: true, t: v }); R.answers.push(v); R.turns++;
    const sp = R.spec, idx = R.turns - 1;
    if (sp.mode === 'grill' && R.turns >= sp.needed) { finish(); return; }
    if (idx < sp.lines.length) respond(sp.lines[idx][0], sp.lines[idx][1], () => { if (sp.mode === 'talk' && R && R.turns >= sp.needed) finish(); });
  }
  function fillSample() {
    if (!R || !R.input) return;
    const sp = R.spec, last = R.msgs.filter(m => !m.me).pop(), who = last ? last.who : sp.askTag;
    let v;
    if (R.turns === 0 && sp.kind === 'level' && sp.mode === 'grill') v = C.samples[sp.item];
    else { const pool = C.chat.samples[who] || C.chat.samples[sp.ag] || C.chat.samples.Nurse; v = pool[R.sampleIx % pool.length]; R.sampleIx++; }
    R.input.value = v;
    R.input.focus();
  }

  // Turns five category scores (0 to 4) into a total, pass or not, stars and XP. Same rules for AI and backup scoring.
  function tally(sp, c, extra) {
    let total = 0;
    CATS.forEach(([k]) => { c[k] = Math.max(0, Math.min(4, Math.round(Number(c[k]) || 0))); total += c[k]; });
    const fv = c[sp.focus], passed = total >= sp.pass && fv >= 3;
    let stars = 0;
    if (passed) { stars = 1; if (total >= sp.pass + 3) stars = 2; if (total >= 18 && fv === 4) stars = 3; }
    const xp = passed ? sp.xp + (sp.kind === 'level' ? STAR_XP[stars] : 0) : 0;
    return Object.assign({ c, total, passed, stars, xp }, extra || {});
  }

  // Backup scoring when the AI can't be reached: simple, explainable rules.
  function words(s) { return (s.match(/\S+/g) || []).length; }
  function score(sp, answers) {
    const all = answers.join(' '), w = words(all), n = Math.max(1, answers.length), digits = (all.match(/\d+(\.\d+)?/g) || []).length;
    const money = /[$%]|percent|dollar/i.test(all), sent = Math.max(1, (all.match(/[.!?]+/g) || []).length), avg = w / n;
    const c = {};
    c.clear = 1 + (w >= 25) + (w >= 60) + (w / sent <= 22);
    c.customer = 1 + /(student|freshm|9th|10th|11th|12th|customer|parent|teacher|friend|people|buyer|kids)/i.test(all) + (digits >= 1) + /(where|hang|lunch|chat|table|group|online|school)/i.test(all) + /last time|tell me about|walk me through|what did you do|how much/i.test(all);
    c.numbers = (digits >= 1) + (digits >= 3) + money + /(cost|price|profit|margin|break|revenue|percent)/i.test(all);
    c.persuasion = 1 + /\?|what if|imagine|picture|last (tuesday|week)/i.test(all) + /(buy|join|try|ask|invest|\$)/i.test(all) + (w >= 18 && w <= 140);
    c.answers = 1 + (avg >= 14) + !/(idk|dunno|not sure|i guess)/i.test(all) + answers.every(a => words(a) >= 6);
    return tally(sp, c, { ai: false });
  }

  function finish() {
    const mine = R, sp = mine.spec, before = prog();
    mine.done = true; mine.busy = true; mine.busyWho = sp.ag; drawRound();
    const graded = askAI(Object.assign({ mode: 'score', focus: sp.focus, talk: sp.mode === 'talk', speaker: charInfo(sp.ag), transcript: transcriptOf(mine) }, roundInfo(sp)))
      .then(j => tally(sp, Object.assign({}, j.scores), { ai: true, keep: j.keep, fix: j.fix, closer: j.closer }), () => score(sp, mine.answers));
    Promise.all([graded, new Promise(r => setTimeout(r, 700))])
      .then(([v]) => saveRound({ kind: sp.kind, item: sp.item, score: v.total, stars: v.stars, passed: v.passed, breakdown: Object.assign({ ai: v.ai }, v.c) })
        .then(() => ({ v, ok: true }), e => ({ v, ok: false, e })))
      .then(({ v, ok, e }) => {
        v.firstPass = ok && v.passed && (sp.kind === 'level' ? !before.best[sp.item] : !before.weekly[sp.item]);
        if (redraw) redraw();
        if (!ok) toast('Your round could not be saved: ' + friendly(e), 'error', 6000);
        else if (v.firstPass) toast(sp.kind === 'level' ? `Level ${sp.item} passed. +${v.xp} XP` : 'Challenge done. +40 XP', 'success');
        if (R !== mine) return;
        mine.busy = false; mine.verdict = v; mine.saved = ok;
        drawRound();
        setTimeout(() => { if (R === mine) R.wrap.querySelectorAll('.ac-bar i').forEach(b => { b.style.width = b.dataset.w; }); }, 60);
      });
  }

  function verdictEl() {
    const v = R.verdict, sp = R.spec, cl = C.chat.closers[sp.ag] || C.chat.closers['Great White'];
    const order = CATS.map(k => k[0]).sort((a, b) => v.c[b] - v.c[a]), best = order[0], worst = order.slice(-2).reverse();
    const p = prog();
    const nextN = sp.kind === 'level' ? sp.item + 1 : null;
    const nextOpen = v.passed && nextN && nextN <= 40 && lstate(nextN, p) === 'current';
    const leftNow = sp.kind === 'level' ? TRIES_PER_DAY - triesToday('level', sp.item) : TRIES_PER_DAY - triesToday('weekly', sp.item);
    const el = h('div', { class: 'ac-verdict' },
      h('div', { class: 'ac-vtop' },
        h('div', { class: 'ac-score' + (v.passed ? '' : ' no') }, h('span', { class: 'big-num' }, String(v.total)), h('span', { class: 'muted' }, 'out of 20')),
        h('div', { class: 'min0' },
          h('h2', null, v.passed ? (sp.kind === 'level' ? 'Level passed' : 'Challenge done') : 'Not yet'),
          v.passed && sp.kind === 'level' ? h('p', { class: 'ac-starrow' }, starRow(v.stars, 18), v.stars + ' of 3 stars') : null,
          h('p', { class: 'muted' }, v.passed ? (v.firstPass ? `+${v.xp} XP` : 'Saved. XP only counts the first pass, but your best stars count.') : `You need ${sp.pass} and a ${cap(sp.focus)} score of 3.`))),
      h('div', { class: 'ac-cats' }, CATS.map(([k, label]) => h('div', { class: 'ac-cat' + (k === sp.focus ? ' f' : '') + (v.c[k] <= 1 ? ' low' : '') },
        h('span', { class: 'cl' }, label + (k === sp.focus ? ' (focus)' : '')),
        h('div', { class: 'ac-bar' }, h('i', { 'data-w': (v.c[k] * 25) + '%' })),
        h('span', { class: 'v' }, v.c[k] + ' / 4')))),
      h('div', { class: 'ac-advice' },
        h('div', null, h('h4', null, 'Keep'), h('p', null, v.keep || TIPS[best][0])),
        h('div', null, h('h4', null, 'Fix next'), h('ul', null, (v.fix && v.fix.length ? v.fix : worst.map(k => TIPS[k][1])).map(t => h('li', null, t))))),
      h('div', { class: 'ac-say' }, portrait(sp.ag, 40), h('div', null, h('p', { class: 'ac-name' }, sp.ag), h('p', null, '“' + (v.closer || cl[v.passed ? 0 : 1]) + '”'))),
      v.passed && sp.kind === 'level' && sp.item === blockOf(sp.item).b
        ? h('p', { class: 'ac-cp' }, 'That was the last level in block ' + blockOf(sp.item).id + '. Check in at ', h('b', null, blockOf(sp.item).claim.replace(/^Unlock at /, '')), ' to collect ', h('b', null, rewardText(blockOf(sp.item).reward)), '.')
        : null,
      h('div', { class: 'row wrap gap-sm' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { closeRound(); RT.go('academy'); } }, 'Back to your year'),
        leftNow > 0 ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => openRound(sp.kind === 'level' ? levelSpec(sp.item, '') : weeklySpec(sp.item)) }, `Try again (${leftNow} left today)`) : null,
        nextOpen ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { closeRound(); RT.go('academy/level/' + nextN); } }, 'Next level', icon('chevronRight', 14)) : null),
      h('p', { class: 'ac-small' }, (v.ai ? 'Scored by the AI.' : 'The AI couldn’t be reached, so this round was scored with simple rules (length, numbers, names).') + ' Only your score is saved, not what you wrote.'));
    return el;
  }

  // ---------------- home page card + the Academy leaderboard ----------------
  RT.academyHomeCard = function () {
    const el = h('section', { class: 'card ac-home' }, RT.skeleton(2));
    load().then(() => {
      const p = prog(), n = p.cur || 40, L = C.levels[n];
      const line = !p.cur ? 'All 40 levels done.' : p.curOpen ? `With ${agentText(n)} · ${C.seasons[seasonOf(n)].xp} XP` : 'Opens ' + longDate(blockOf(n).opens);
      clear(el).append(
        h('div', { class: 'min0' }, h('p', { class: 'card-label' }, 'Academy · level ' + n), h('h3', null, p.cur ? L.t : 'Course finished'), h('p', { class: 'muted small' }, line)),
        h('a', { class: 'btn ' + (p.curOpen ? 'btn-primary' : 'btn-ghost'), href: p.curOpen ? '#/academy/level/' + n : '#/academy' }, p.curOpen ? 'Continue level ' + n : 'Open the Academy'));
    }).catch(() => { clear(el).appendChild(h('p', { class: 'muted' }, 'The Academy could not load. Try again in a moment.')); });
    return el;
  };

  RT.academyBoard = async function () {
    const { data, error } = await RT.sb.from('course_board').select('member_id, name, levels, xp');
    if (!error) return (data || []).slice().sort((a, b) => b.levels - a.levels || b.xp - a.xp);
    if (!missingTable(error)) throw error;
    if (!AC.loaded || AC.memberId !== S.me.id) await load();
    const p = prog();
    return [{ member_id: S.me.id, name: S.me.name, levels: Object.keys(p.best).length, xp: p.xp }];
  };
  RT.academyRank = rankOf;
})();
