// The five sharks: a member describes a product idea, five sharks (money, customer, product, risk, story)
// give feedback and a plan. Uses the AI function at /api/sharks when it's switched on (see api/sharks.js).
// Until then, built-in "practice" sharks answer from simple rules so the page still works.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, busy, friendly } = RT;
  const S = RT.state;
  const sb = RT.sb;

  const SHARKS = [
    { id: 'finn', name: 'Finn', role: 'Money Shark', icon: 'coins', blurb: 'Pricing, costs, how it makes money.' },
    { id: 'marlo', name: 'Marlo', role: 'Customer Shark', icon: 'users', blurb: 'Who buys it and why they care.' },
    { id: 'coral', name: 'Coral', role: 'Product Shark', icon: 'sparkle', blurb: 'What to build first.' },
    { id: 'reef', name: 'Reef', role: 'Risk Shark', icon: 'shield', blurb: 'What could go wrong.' },
    { id: 'tide', name: 'Tide', role: 'Story Shark', icon: 'mic', blurb: 'How to tell it in 30 seconds.' }
  ];

  const KEY = () => 'rt_sharks_' + (S.me ? S.me.id : 'x');
  function loadLast() { try { return JSON.parse(localStorage.getItem(KEY()) || 'null'); } catch (e) { return null; } }
  function saveLast(v) { try { localStorage.setItem(KEY(), JSON.stringify(v)); } catch (e) { /* ignore */ } }

  // ---------- practice sharks (no AI needed) ----------
  const has = (s, n) => String(s || '').trim().length >= n;
  function practice(f) {
    const nm = f.name || 'your idea';
    const moneyNums = /\d/.test(f.money || '');
    const out = {};
    out.finn = has(f.money, 8)
      ? { rating: moneyNums ? 4 : 3, verdict: moneyNums ? 'You have a way to make money and some numbers. Now check they add up.' : 'You have a money idea. It needs real numbers.',
          tips: ['Write down your exact price.', 'List your three biggest costs to make one.', 'Work out how many sales you need to break even.'], question: 'How much does it cost you to make one, and what do you charge?' }
      : { rating: 2, verdict: 'The sharks do not know how ' + nm + ' makes money yet.',
          tips: ['Pick one price and write it down.', 'List what it costs to make or run.', 'Decide who pays: the customer, a sponsor, or someone else.'], question: 'Who pays you, and how much?' };
    out.marlo = has(f.customer, 12)
      ? { rating: 3, verdict: 'You named who it is for. Make it more specific.',
          tips: ['Pick one real person who would buy this and describe them.', 'Ask five people in that group this week.', 'Find out what they use today and why it is not good enough.'], question: 'Why would they switch from what they use now?' }
      : { rating: 2, verdict: 'Who is this for? The sharks cannot picture your customer yet.',
          tips: ['Name your very first customer.', 'Ask five people if they would really use or pay for it.', 'Write what they do about this problem today.'], question: 'Who is your first customer?' };
    out.coral = has(f.idea, 80)
      ? { rating: 3, verdict: 'Good start. Now shrink it to the smallest version that works.',
          tips: ['Build or fake the smallest version in one week.', 'Cut every feature you do not need on day one.', 'Test it with three people and write down what they say.'], question: 'What is the one thing it must do well?' }
      : { rating: 2, verdict: 'Say more about what it actually is and does.',
          tips: ['Describe what a customer sees and does, step by step.', 'Draw it on paper in five boxes.', 'Pick the one feature that matters most.'], question: 'What does the customer do, step by step?' };
    out.reef = has(f.worry, 8)
      ? { rating: 3, verdict: 'Good, you named a worry. Test it before you spend money.',
          tips: ['Turn your worry into a yes/no test you can run this week.', 'Find the cheapest way to test it.', 'Check the school rules if you plan to sell anything.'], question: 'What would make you stop and change plans?' }
      : { rating: 2, verdict: 'You have not named what could go wrong. Every idea has a risky guess.',
          tips: ['Write down the one thing that has to be true for this to work.', 'Test that first, before anything else.', 'Check the school rules if you plan to sell anything.'], question: 'What is the riskiest guess in your plan?' };
    out.tide = { rating: 3, verdict: 'Lead with the problem, then your fix. Keep it short.',
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
  RT.views.sharks = function (root) {
    root.appendChild(RT.pageHead('The Sharks', 'Five sharks help you build your idea before you pitch it.'));

    const last = loadLast();
    const f = last ? last.form : {};
    const name = h('input', { class: 'input', type: 'text', placeholder: 'e.g. StudyBuddy', maxlength: 80, value: f.name || '' });
    const idea = h('textarea', { class: 'input textarea', rows: 4, placeholder: 'What is it, and what problem does it solve? A few sentences is plenty.', maxlength: 600 }, f.idea || '');
    const customer = h('input', { class: 'input', type: 'text', placeholder: 'e.g. freshmen who struggle with math', maxlength: 300, value: f.customer || '' });
    const money = h('input', { class: 'input', type: 'text', placeholder: 'e.g. $3 per pack, or free with ads (optional)', maxlength: 300, value: f.money || '' });
    const worry = h('input', { class: 'input', type: 'text', placeholder: 'What are you most unsure about? (optional)', maxlength: 300, value: f.worry || '' });
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const go = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, icon('fin', 18), 'Send it to the sharks');
    const form = h('form', { class: 'card stack sharks-form', novalidate: true },
      RT.field('Product name', name), RT.field('Your idea', idea), RT.field('Who is it for?', customer),
      RT.field('How does it make money?', money), RT.field('Biggest worry', worry), err, go);

    const roster = h('div', { class: 'shark-roster' }, SHARKS.map(s => h('div', { class: 'shark-chip' }, h('span', { class: 'shark-av ' + s.id }, icon(s.icon, 18)), h('div', null, h('strong', null, s.name), h('div', { class: 'muted small' }, s.role)))));
    const results = h('div', { class: 'sharks-results' });
    root.append(h('div', { class: 'sharks-intro muted' }, 'Describe your product idea. Each shark looks at it from a different side, tells you what to fix, and asks you one hard question. Then take the plan to the next meeting.'), roster, form, results);

    function draw(res, formVals) {
      clear(results);
      const note = res.practice ? h('p', { class: 'muted small sharks-note' }, icon('alert', 14), ' Practice mode: these are quick built-in answers. The AI sharks give deeper feedback once they are switched on.') : null;
      results.append(
        h('div', { class: 'section-row' }, h('h2', { class: 'h2' }, 'What the sharks said'), note),
        h('div', { class: 'shark-grid' }, SHARKS.map((s, i) => {
          const r = (res.sharks || []).find(x => x.id === s.id) || {};
          return h('article', { class: 'card shark-card reveal', style: { '--i': i } },
            h('div', { class: 'shark-head' }, h('span', { class: 'shark-av ' + s.id }, icon(s.icon, 22)),
              h('div', { class: 'grow' }, h('div', { class: 'shark-name' }, s.name), h('div', { class: 'muted small' }, s.role)),
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
    return {};
  };
})();
