// Pitch the panel: the Academy's five sharks look at a whole idea at once, each from its own side
// (story, customer, money, product, risk), and give feedback and a plan. Lives in the Academy at #/academy/panel.
// Uses the AI function at /api/sharks (see api/sharks.js). If that isn't reachable, built-in "practice" sharks
// answer from simple rules so the page still works.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, busy, friendly } = RT;
  const S = RT.state;
  const sb = RT.sb;

  // Same five sharks as the Academy course (js/course-data.js), each looking at one side of the idea.
  const SHARKS = [
    { id: 'nurse', name: 'Nurse', blurb: 'How you tell it in 30 seconds.' },
    { id: 'tiger', name: 'Tiger', blurb: 'Who buys it and why they care.' },
    { id: 'hammerhead', name: 'Hammerhead', blurb: 'Price, costs, how it makes money.' },
    { id: 'mako', name: 'Mako', blurb: 'What is new, and what to build first.' },
    { id: 'greatwhite', name: 'Great White', blurb: 'What could go wrong.' }
  ];
  const roleOf = s => ((window.RT_COURSE && RT_COURSE.sharks[s.name]) || {}).role || '';
  const pic = (s, size) => (RT.sharkPortrait ? RT.sharkPortrait(s.name, size) : h('span', { class: 'shark-av' }, icon('fin', 18)));

  const KEY = () => 'rt_panel_' + (S.me ? S.me.id : 'x');
  function loadLast() { try { return JSON.parse(localStorage.getItem(KEY()) || 'null'); } catch (e) { return null; } }
  function saveLast(v) { try { localStorage.setItem(KEY(), JSON.stringify(v)); } catch (e) { /* ignore */ } }

  // ---------- practice sharks (no AI needed) ----------
  const has = (s, n) => String(s || '').trim().length >= n;
  function practice(f) {
    const nm = f.name || 'your idea';
    const moneyNums = /\d/.test(f.money || '');
    const out = {};
    out.hammerhead = has(f.money, 8)
      ? { rating: moneyNums ? 4 : 3, verdict: moneyNums ? 'You have a way to make money and some numbers. Now check they add up.' : 'You have a money idea. It needs real numbers.',
          tips: ['Write down your exact price.', 'List your three biggest costs to make one.', 'Work out how many sales you need to break even.'], question: 'How much does it cost you to make one, and what do you charge?' }
      : { rating: 2, verdict: 'The sharks do not know how ' + nm + ' makes money yet.',
          tips: ['Pick one price and write it down.', 'List what it costs to make or run.', 'Decide who pays: the customer, a sponsor, or someone else.'], question: 'Who pays you, and how much?' };
    out.tiger = has(f.customer, 12)
      ? { rating: 3, verdict: 'You named who it is for. Make it more specific.',
          tips: ['Pick one real person who would buy this and describe them.', 'Ask five people in that group this week.', 'Find out what they use today and why it is not good enough.'], question: 'Why would they switch from what they use now?' }
      : { rating: 2, verdict: 'Who is this for? The sharks cannot picture your customer yet.',
          tips: ['Name your very first customer.', 'Ask five people if they would really use or pay for it.', 'Write what they do about this problem today.'], question: 'Who is your first customer?' };
    out.mako = has(f.idea, 80)
      ? { rating: 3, verdict: 'Good start. Now shrink it to the smallest version that works.',
          tips: ['Build or fake the smallest version in one week.', 'Cut every feature you do not need on day one.', 'Test it with three people and write down what they say.'], question: 'What is the one thing it must do well?' }
      : { rating: 2, verdict: 'Say more about what it actually is and does.',
          tips: ['Describe what a customer sees and does, step by step.', 'Draw it on paper in five boxes.', 'Pick the one feature that matters most.'], question: 'What does the customer do, step by step?' };
    out.greatwhite = has(f.worry, 8)
      ? { rating: 3, verdict: 'Good, you named a worry. Test it before you spend money.',
          tips: ['Turn your worry into a yes/no test you can run this week.', 'Find the cheapest way to test it.', 'Check the school rules if you plan to sell anything.'], question: 'What would make you stop and change plans?' }
      : { rating: 2, verdict: 'You have not named what could go wrong. Every idea has a risky guess.',
          tips: ['Write down the one thing that has to be true for this to work.', 'Test that first, before anything else.', 'Check the school rules if you plan to sell anything.'], question: 'What is the riskiest guess in your plan?' };
    out.nurse = { rating: 3, verdict: 'Lead with the problem, then your fix. Keep it short.',
      tips: ['Open with one sentence about the problem.', 'Say your idea in one sentence a friend would get.', 'End with exactly what you want: feedback, money, or testers.'], question: 'What is the one thing you want the room to remember?' };
    const cust = f.customer || 'people like me';
    const pitch30 = `Hi, I'm ${S.me ? String(S.me.name).split(' ')[0] : 'a member'}. ${nm === 'your idea' ? 'My idea' : nm} is for ${cust}. ${f.idea}${f.money ? ' It makes money by ' + f.money + '.' : ''} My first step is to test it with real customers this week. I'd love your feedback.`.slice(0, 700);
    return {
      practice: true,
      sharks: SHARKS.map(s => Object.assign({ id: s.id }, out[s.id])),
      pitch30,
      plan: ['Write your price, your costs and your first customer on one page.', 'Ask five real people what they think and write down their answers.', 'Build or fake the smallest version and test it with three of them.']
    };
  }

  async function ask(form) {
    let token = '';
    try { const { data } = await sb.auth.getSession(); token = data && data.session ? data.session.access_token : ''; } catch (e) { /* ignore */ }
    let r;
    try {
      r = await fetch('/api/sharks', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(form) });
    } catch (e) { return practice(form); }
    if (r.ok) { try { return await r.json(); } catch (e) { return practice(form); } }
    if (r.status === 400 || r.status === 401 || r.status === 429) {
      let msg = ''; try { msg = (await r.json()).error; } catch (e) { /* ignore */ }
      throw new Error(msg || 'The sharks could not take that. Try again.');
    }
    return practice(form); // not switched on (404/405/503) or a hiccup
  }

  // ---------- view ----------
  // Draws the panel into the Academy page (js/academy.js calls this for #/academy/panel).
  RT.sharksPanel = function (root) {

    const last = loadLast();
    const f = last ? last.form : {};
    const name = h('input', { class: 'input', type: 'text', placeholder: 'e.g. StudyBuddy', maxlength: 80, value: f.name || '' });
    const idea = h('textarea', { class: 'input textarea', rows: 4, placeholder: 'What is it, and what problem does it solve? A few sentences is plenty.', maxlength: 600 }, f.idea || '');
    const customer = h('input', { class: 'input', type: 'text', placeholder: 'e.g. freshmen who struggle with math', maxlength: 300, value: f.customer || '' });
    const money = h('input', { class: 'input', type: 'text', placeholder: 'e.g. $3 per pack, or free with ads (optional)', maxlength: 300, value: f.money || '' });
    const worry = h('input', { class: 'input', type: 'text', placeholder: 'What are you most unsure about? (optional)', maxlength: 300, value: f.worry || '' });
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const go = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Send it to the panel');
    const form = h('form', { class: 'card stack sharks-form', novalidate: true },
      RT.field('Product name', name), RT.field('Your idea', idea), RT.field('Who is it for?', customer),
      RT.field('How does it make money?', money), RT.field('Biggest worry', worry), err, go);

    const roster = h('ul', { class: 'shark-roster' }, SHARKS.map(s => h('li', { class: 'shark-chip' }, pic(s, 40), h('div', { class: 'min0' }, h('strong', null, s.name), h('div', { class: 'muted small' }, s.blurb)))));
    const results = h('div', { class: 'sharks-results' });
    root.append(h('div', { class: 'sharks-intro muted' }, 'Have an idea right now? Run the whole thing past all five sharks at once. Each one looks at a different side, tells you what to fix, and asks you one hard question. The levels go deeper on each part; this is the quick check.'), roster, form, results);

    function draw(res, formVals) {
      clear(results);
      const note = res.practice ? h('p', { class: 'muted small sharks-note' }, icon('alert', 14), ' Practice mode: these are quick built-in answers. The AI sharks give deeper feedback once they are switched on.') : null;
      results.append(
        h('div', { class: 'section-row' }, h('h2', { class: 'h2' }, 'What the sharks said'), note),
        h('div', { class: 'shark-grid' }, SHARKS.map((s, i) => {
          const r = (res.sharks || []).find(x => x.id === s.id) || {};
          return h('article', { class: 'card shark-card reveal', style: { '--i': i } },
            h('div', { class: 'shark-head' }, pic(s, 46),
              h('div', { class: 'grow' }, h('div', { class: 'shark-name' }, s.name), h('div', { class: 'muted small' }, roleOf(s) + ' · ' + s.blurb)),
              h('div', { class: 'teeth', title: (r.rating || 0) + ' out of 5', 'aria-label': (r.rating || 0) + ' out of 5' }, [1, 2, 3, 4, 5].map(n => h('i', { class: n <= (r.rating || 0) ? 'on' : '' })))),
            h('p', { class: 'shark-verdict' }, r.verdict || ''),
            h('ul', { class: 'shark-tips' }, (r.tips || []).map(t => h('li', null, t))),
            r.question ? h('div', { class: 'shark-q' }, h('span', { class: 'card-label' }, 'Answer this'), h('p', null, r.question)) : null);
        })),
        h('div', { class: 'two-col sharks-end' },
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Your 30-second pitch'), (() => {
            const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => RT.copyText(res.pitch30 || '', 'Pitch copied') }, icon('copy', 14), 'Copy');
            return b; })()), h('p', { class: 'shark-pitch' }, res.pitch30 || '')),
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Do this week')),
            h('ol', { class: 'shark-plan' }, (res.plan || []).map(t => h('li', null, t))))));
      saveLast({ form: formVals, res });
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      err.hidden = true;
      const vals = { name: name.value.trim(), idea: idea.value.trim(), customer: customer.value.trim(), money: money.value.trim(), worry: worry.value.trim() };
      if (vals.idea.length < 10) { err.textContent = 'Tell the sharks a little more about your idea.'; err.hidden = false; return; }
      busy(go, async () => {
        clear(results).appendChild(h('div', { class: 'card sharks-wait' }, h('p', { class: 'muted' }, 'The sharks are circling…'), RT.skeleton(4)));
        try {
          const res = await ask(vals);
          draw(res, vals);
          results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (ex) { clear(results); err.textContent = friendly(ex); err.hidden = false; }
      });
    });

    if (last && last.res) draw(last.res, last.form);
  };
})();
