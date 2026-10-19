// Officer Assistant tab (Admin > Assistant): a general AI chat for officers. Talks to /api/assistant.
// The conversation lives in this browser only (localStorage), never on the server.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast } = RT;
  const S = RT.state;
  const sb = RT.sb;
  RT.adminTabs = RT.adminTabs || {};

  const KEY = () => 'rt_assistant_' + (S.user ? S.user.id : 'x');
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY()) || '[]'); } catch (e) { return []; } };
  const save = m => { try { localStorage.setItem(KEY(), JSON.stringify(m.slice(-60))); } catch (e) { /* ignore */ } };

  const STARTERS = [
    'Write an email to teachers asking them to mention our next meeting in class.',
    'Write a thank-you email to our guest speaker after the meeting.',
    'Only 8 people came last time. How do we get 30 to the next meeting?',
    'Plan a 45-minute meeting agenda for our next unit.'
  ];

  // Light formatting for replies: paragraphs, bullet lines, **bold**. Everything is escaped first.
  function render(text) {
    const box = h('div', { class: 'as-text' });
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    let list = null;
    String(text).split('\n').forEach(line => {
      const t = line.trimEnd();
      const b = t.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (b) {
        if (!list) { list = document.createElement('ul'); box.appendChild(list); }
        const li = document.createElement('li'); li.innerHTML = inline(b[1]); list.appendChild(li);
        return;
      }
      list = null;
      if (!t.trim()) return;
      const hd = t.match(/^#{1,4}\s+(.*)$/);
      const p = document.createElement(hd ? 'h4' : 'p');
      p.innerHTML = inline(hd ? hd[1] : t);
      box.appendChild(p);
    });
    return box;
  }

  async function ask(messages) {
    let token = '';
    try { const { data } = await sb.auth.getSession(); token = data && data.session ? data.session.access_token : ''; } catch (e) { /* ignore */ }
    const r = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })) })
    });
    let out = {};
    try { out = await r.json(); } catch (e) { /* ignore */ }
    if (!r.ok || !out.reply) throw new Error(out.error || 'The AI did not answer. Try again.');
    return out.reply;
  }

  RT.adminTabs.assistant = function (pane) {
    let msgs = load();
    let sending = false;

    const list = h('div', { class: 'as-list', role: 'log', 'aria-live': 'polite', 'aria-label': 'Assistant conversation' });
    const input = h('textarea', { class: 'composer-input', rows: 1, placeholder: 'Ask anything, or say “write an email to…”', maxlength: 8000, 'aria-label': 'Message the assistant' });
    const sendBtn = h('button', { class: 'send-btn', type: 'submit', 'aria-label': 'Send' }, icon('arrowUp', 18));
    const composer = h('form', { class: 'composer' }, input, sendBtn);
    const clearBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'New chat');

    const card = h('section', { class: 'card as-card' },
      h('div', { class: 'card-head' },
        h('div', null, h('span', { class: 'card-label' }, 'Officer Assistant'),
          h('p', { class: 'muted small' }, 'Solve problems, plan meetings and write emails. Only officers can see this. Chats stay on this device.')),
        clearBtn),
      list, composer);
    pane.appendChild(card);

    function copyBtn(text) {
      const b = h('button', { class: 'btn btn-ghost btn-sm as-copy', type: 'button' }, 'Copy');
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); }
        catch (e) { toast('Could not copy. Select the text instead.', 'error'); }
      });
      return b;
    }

    function draw() {
      clear(list);
      if (!msgs.length) {
        const chips = h('div', { class: 'as-starters' });
        STARTERS.forEach(s => chips.appendChild(h('button', { class: 'btn btn-ghost btn-sm as-chip', type: 'button', onclick: () => { input.value = s; input.focus(); autosize(); } }, s)));
        list.appendChild(h('div', { class: 'as-empty' }, h('p', { class: 'muted' }, 'Try one of these:'), chips));
      }
      msgs.forEach(m => {
        const row = h('div', { class: 'as-msg ' + (m.role === 'user' ? 'me' : 'ai') });
        if (m.role === 'user') row.appendChild(h('p', { class: 'as-text' }, m.content));
        else { row.appendChild(render(m.content)); row.appendChild(copyBtn(m.content)); }
        list.appendChild(row);
      });
      if (sending) list.appendChild(h('div', { class: 'as-msg ai' }, h('p', { class: 'muted as-typing' }, 'Thinking…')));
      list.scrollTop = list.scrollHeight;
    }

    function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; }
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composer.requestSubmit(); } });

    composer.addEventListener('submit', async e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || sending) return;
      msgs.push({ role: 'user', content: text });
      input.value = ''; autosize();
      sending = true; sendBtn.disabled = true; save(msgs); draw();
      try {
        const reply = await ask(msgs);
        msgs.push({ role: 'assistant', content: reply });
        save(msgs);
      } catch (err) {
        toast(err.message || 'The AI did not answer.', 'error');
        msgs.pop(); input.value = text; autosize();
      } finally {
        sending = false; sendBtn.disabled = false; draw();
      }
    });

    clearBtn.addEventListener('click', () => { msgs = []; save(msgs); draw(); input.focus(); });

    draw();
    return null;
  };
})();
