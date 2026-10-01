// Supabase client, data loaders, and badge/points math shared by every screen.
(function () {
  const RT = (window.RT = window.RT || {});
  const cfg = window.RT_CONFIG;
  RT.views = RT.views || {};

  // Remember what the URL looked like before supabase-js consumes any auth tokens in it.
  RT.initialHash = location.hash;
  RT.recoveryFromUrl = /type=recovery/.test(location.hash);
  RT.authErrorFromUrl = (() => {
    const m = (location.hash + '&' + location.search).match(/error_description=([^&]+)/);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  })();

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  RT.sb = sb;

  // Which sign-in methods are switched on in Supabase (e.g. whether Google is set up yet).
  let settingsPromise = null;
  RT.authSettings = () => {
    if (!settingsPromise) {
      settingsPromise = fetch(cfg.supabaseUrl + '/auth/v1/settings', { headers: { apikey: cfg.supabaseKey } })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    return settingsPromise;
  };
  RT.authSettings();

  RT.state = {
    ready: false,
    session: null,
    user: null,
    me: null,
    isAdmin: false,
    tiers: [],
    badges: [],
    meetings: [],
    board: [],
    directory: new Map(),
    settings: { decay_grace_days: 30, decay_pct_per_day: 0.5, decay_max_pct: 50 },
    announcements: [],
    bounties: [],
    bountyTaken: new Map(),
    myClaims: [],
    unseenAnn: 0,
    adminCounts: { cards: 0, welcome: 0, claims: 0 },
    pendingCount: 0,
    recovery: false
  };

  // ---------- errors in plain English ----------
  function friendly(err) {
    if (!err) return 'Something went wrong.';
    const msg = String(err.message || err.error_description || err || '');
    const code = err.code || '';
    if (/Invalid login credentials/i.test(msg)) return 'That email and password don’t match.';
    if (/Email not confirmed/i.test(msg)) return 'Confirm your email first. Check your inbox for the link.';
    if (/User already registered/i.test(msg)) return 'That email already has an account. Try logging in.';
    if (/Password should be at least/i.test(msg)) return 'Use a password with at least 8 characters.';
    if (/rate limit|too many/i.test(msg)) return 'Too many tries. Wait a minute and try again.';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Can’t reach the server. Check your connection.';
    if (/JWT expired/i.test(msg)) return 'Your session expired. Log in again.';
    if (code === '23505') return 'That already exists.';
    if (code === '23503') return 'Other records still point to this. Remove those first.';
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'You don’t have permission to do that.';
    return msg.replace(/^.*?:\s*/, '') || 'Something went wrong.';
  }
  RT.friendly = friendly;

  function check({ data, error }) {
    if (error) throw error;
    return data;
  }

  // PostgREST caps responses at 1000 rows, so page through bigger tables.
  async function fetchAll(table, columns = '*', modify) {
    const size = 1000;
    let from = 0;
    const out = [];
    for (;;) {
      let q = sb.from(table).select(columns).range(from, from + size - 1);
      if (modify) q = modify(q);
      const rows = check(await q);
      out.push(...rows);
      if (rows.length < size) break;
      from += size;
    }
    return out;
  }

  const api = {
    fetchAll,
    async myMember(userId) {
      return check(await sb.from('members').select('*').eq('user_id', userId).maybeSingle());
    },
    async isAdmin() {
      const { data, error } = await sb.rpc('is_admin');
      return !error && data === true;
    },
    async register(name, grade, ref, phone, whatsapp) {
      return check(await sb.rpc('register_member', {
        p_name: name, p_grade: grade, p_ref: ref || null, p_phone: phone || null, p_whatsapp: !!whatsapp
      }));
    },
    async claim(code) {
      return check(await sb.rpc('claim_card', { p_code: code }));
    },
    // phone: undefined leaves it alone, '' clears it.
    async updateProfile(name, grade, phone, whatsapp) {
      return check(await sb.rpc('update_my_profile', {
        p_name: name, p_grade: grade,
        p_phone: phone === undefined ? null : phone,
        p_whatsapp: whatsapp === undefined ? null : !!whatsapp
      }));
    },
    async settings() {
      const rows = check(await sb.from('settings').select('key, value'));
      const out = {};
      // decay_* rules are numbers; everything else (sign-up links etc.) stays text.
      rows.forEach(r => { out[r.key] = /^decay_/.test(r.key) ? Number(r.value) : r.value; });
      return out;
    },
    async announcements() {
      return check(await sb.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(60));
    },
    async bounties() {
      return check(await sb.from('bounties').select('*').order('created_at', { ascending: false }));
    },
    async bountyCounts() {
      return check(await sb.from('bounty_counts').select('bounty_id, taken'));
    },
    async myClaims(memberId) {
      return check(await sb.from('bounty_claims').select('*').eq('member_id', memberId).order('created_at', { ascending: false }));
    },
    async claimBounty(id, note) {
      return check(await sb.rpc('claim_bounty', { p_bounty_id: id, p_note: note || null }));
    },
    async reviewClaim(id, approve, note) {
      return check(await sb.rpc('review_claim', { p_claim_id: id, p_approve: !!approve, p_note: note || null }));
    },
    async myPoints(memberId) {
      return check(await sb.from('member_points').select('total_points, earned_points, decay_points').eq('member_id', memberId).maybeSingle());
    },
    async referralCount() {
      const { data, error } = await sb.rpc('my_referral_count');
      return error ? 0 : data || 0;
    },
    async tiers() {
      return check(await sb.from('tiers').select('*').order('point_threshold'));
    },
    async badges() {
      return check(await sb.from('badges').select('*').order('sort_order', { nullsFirst: false }));
    },
    async meetings() {
      return check(await sb.from('meetings').select('*').order('meeting_date', { ascending: false }));
    },
    async board() {
      return check(await sb.from('member_tiers').select('member_id, name, total_points, current_tier'));
    },
    async directory() {
      return check(await sb.from('member_directory').select('id, name'));
    },
    async myAttendance(memberId) {
      return check(await sb.from('attendance').select('*').eq('member_id', memberId));
    },
    async myPitches(memberId) {
      return check(await sb.from('pitch_entries').select('*').eq('member_id', memberId));
    },
    async myBadges(memberId) {
      return check(await sb.from('member_badges').select('*').eq('member_id', memberId));
    },
    async votes() {
      return fetchAll('currency_votes', 'from_member_id, to_member_id, meeting_id, amount');
    }
  };
  RT.api = api;
  RT.check = check;

  // ---------- leaderboard helpers ----------
  // Standard competition ranking: 1, 2, 2, 4.
  function rankBoard(rows) {
    const sorted = [...rows].sort((a, b) => (Number(b.total_points) - Number(a.total_points)) || String(a.name).localeCompare(String(b.name)));
    let lastPts = null, lastRank = 0;
    sorted.forEach((r, i) => {
      const pts = Number(r.total_points) || 0;
      r.total_points = pts;
      r.rank = pts === lastPts ? lastRank : i + 1;
      lastPts = pts; lastRank = r.rank;
    });
    return sorted;
  }
  RT.rankBoard = rankBoard;

  function tierFor(points, tiers) {
    let cur = tiers[0] || null, next = null;
    for (const t of tiers) {
      if (points >= t.point_threshold) cur = t;
      else { next = t; break; }
    }
    return { cur, next };
  }
  RT.tierFor = tierFor;

  function tierClass(name) {
    const n = String(name || '').toLowerCase();
    if (n.includes('mega')) return 'tier-mega';
    if (n.includes('white')) return 'tier-white';
    if (n.includes('tiger')) return 'tier-tiger';
    return 'tier-reef';
  }
  RT.tierClass = tierClass;

  // ---------- badge progress ----------
  const todayISO = () => RT.localDateISO();

  function streaks(meetings, attendedIds) {
    const past = meetings
      .filter(m => m.meeting_date <= todayISO())
      .sort((a, b) => (a.meeting_date < b.meeting_date ? -1 : a.meeting_date > b.meeting_date ? 1 : 0));
    let run = 0, best = 0;
    for (const m of past) {
      if (attendedIds.has(m.id)) { run++; best = Math.max(best, run); }
      else run = 0;
    }
    return { current: run, best };
  }

  function computeStats({ memberId, meetings, attendance, pitches, votes, referrals }) {
    const attendedIds = new Set(attendance.map(a => a.meeting_id));
    const st = streaks(meetings, attendedIds);
    const placements = pitches.map(p => Number(p.placement) || 0).filter(p => p > 0);
    const bestPlacement = placements.length ? Math.min(...placements) : null;

    // Crowd Favorite: sessions where you received the most bites.
    const byMeeting = new Map();
    for (const v of votes) {
      if (!byMeeting.has(v.meeting_id)) byMeeting.set(v.meeting_id, new Map());
      const mm = byMeeting.get(v.meeting_id);
      mm.set(v.to_member_id, (mm.get(v.to_member_id) || 0) + (Number(v.amount) || 0));
    }
    let crowd = 0;
    byMeeting.forEach(mm => {
      let max = 0;
      mm.forEach(v => { if (v > max) max = v; });
      if (max > 0 && mm.get(memberId) === max) crowd++;
    });
    const votedIn = new Set(votes.filter(v => v.from_member_id === memberId).map(v => v.meeting_id)).size;

    return {
      attendance: attendance.length,
      attendancePoints: attendance.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0),
      streak: st.current,
      bestStreak: st.best,
      pitches: pitches.length,
      pitchPoints: pitches.reduce((s, p) => s + (Number(p.points_awarded) || 0), 0),
      bestPlacement,
      wins: placements.filter(p => p === 1).length,
      crowd,
      votedIn,
      referrals: referrals || 0
    };
  }
  RT.computeStats = computeStats;

  // Returns each badge with { earned, have, need, awardedAt }.
  function badgeProgress(badges, stats, awarded) {
    const awardedMap = new Map(awarded.map(a => [a.badge_id, a]));
    return badges.map(b => {
      const t = b.trigger_type;
      const need = Number(b.threshold) || 1;
      let have = 0, earned = false, label = '';
      if (t === 'attendance_count') { have = stats.attendance; label = 'meetings'; }
      else if (t === 'streak') { have = stats.bestStreak; label = 'in a row'; }
      else if (t === 'pitch_count') { have = stats.pitches; label = 'pitches'; }
      else if (t === 'placement') {
        earned = stats.bestPlacement != null && stats.bestPlacement <= need;
        have = earned ? 1 : 0;
      } else if (t === 'crowd_favorite') { have = stats.crowd; label = 'sessions'; }
      else if (t === 'votes_given') { have = stats.votedIn; label = 'sessions'; }
      else if (t === 'referral_count') { have = stats.referrals; label = 'friends'; }
      if (t !== 'placement' && t !== 'manual') earned = have >= need;
      const aw = awardedMap.get(b.id);
      if (aw) earned = true;
      return {
        badge: b,
        earned,
        manual: t === 'manual',
        have: Math.min(have, need),
        need: t === 'placement' || t === 'manual' ? 1 : need,
        unit: label,
        awardedAt: aw ? aw.earned_at : null
      };
    });
  }
  RT.badgeProgress = badgeProgress;

  const BADGE_ICONS = {
    'First Bite': 'target', 'Circling': 'refresh', 'Feeding Frenzy': 'flame', 'Apex': 'crown',
    'On the Hunt': 'flame', 'Relentless': 'flame', 'In the Tank': 'mic', 'Repeat Contender': 'mic',
    'Podium Shark': 'award', 'Tank Champion': 'trophy', 'Crowd Favorite': 'megaphone', 'Active Investor': 'coins',
    'Headhunter': 'users', 'Chief Talent Officer': 'users', 'Boardroom': 'shield', 'Keynote': 'mic',
    'Crew': 'shield', 'Founding Shark': 'fin', 'King of the Tank': 'crown'
  };
  RT.badgeIcon = name => BADGE_ICONS[name] || 'award';

  // Pull every shared list a signed-in member needs.
  async function loadShared() {
    const S = RT.state;
    const [tiers, badges, meetings, board, dir, settings, anns, bounties, counts, claims] = await Promise.all([
      api.tiers().catch(() => []),
      api.badges().catch(() => []),
      api.meetings().catch(() => []),
      api.board().catch(() => []),
      api.directory().catch(() => []),
      api.settings().catch(() => ({})),
      api.announcements().catch(() => []),
      api.bounties().catch(() => []),
      api.bountyCounts().catch(() => []),
      S.me ? api.myClaims(S.me.id).catch(() => []) : Promise.resolve([])
    ]);
    S.tiers = tiers;
    S.badges = badges;
    S.meetings = meetings;
    S.board = rankBoard(board);
    S.directory = new Map(dir.map(d => [d.id, d.name]));
    S.settings = Object.assign({ decay_grace_days: 30, decay_pct_per_day: 0.5, decay_max_pct: 50, form_link: '', site_link: '' }, settings);
    S.announcements = anns;
    S.bounties = bounties;
    S.bountyTaken = new Map(counts.map(c => [c.bounty_id, c.taken]));
    S.myClaims = claims;
    RT.countUnseenAnnouncements();
  }
  RT.loadShared = loadShared;

  // ---------- announcements: which ones has this device seen? ----------
  const SEEN_KEY = 'rt_ann_seen';
  function seenId() { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch (e) { return 0; } }
  RT.countUnseenAnnouncements = function () {
    const S = RT.state;
    const seen = seenId();
    S.unseenAnn = S.announcements.filter(a => a.id > seen).length;
    return S.unseenAnn;
  };
  RT.markAnnouncementsSeen = function () {
    const S = RT.state;
    const top = S.announcements.reduce((m, a) => Math.max(m, a.id), 0);
    try { localStorage.setItem(SEEN_KEY, String(top)); } catch (e) { /* ignore */ }
    S.unseenAnn = 0;
  };

  // ---------- bite decay: what does the clock look like for me? ----------
  // Uses the same rule as the database view: only real meetings (not events) reset it.
  RT.decayInfo = function (attendance, joinDate) {
    const S = RT.state;
    const grace = Number(S.settings.decay_grace_days) || 30;
    const pct = Number(S.settings.decay_pct_per_day);
    const byId = new Map(S.meetings.map(m => [m.id, m]));
    let last = null;
    attendance.forEach(a => {
      const m = byId.get(a.meeting_id);
      if (m && (m.kind || 'meeting') === 'meeting' && (!last || m.meeting_date > last)) last = m.meeting_date;
    });
    const anchor = last || (joinDate ? String(joinDate).slice(0, 10) : RT.localDateISO());
    const since = Math.max(0, Math.round((RT.parseLocalDate(RT.localDateISO()) - RT.parseLocalDate(anchor)) / 86400000));
    return { last, since, grace, left: grace - since, decaying: since > grace, pct: isNaN(pct) ? 0.5 : pct };
  };

  async function refreshBoard() {
    const S = RT.state;
    try { S.board = rankBoard(await api.board()); } catch (e) { /* keep the old copy */ }
    return S.board;
  }
  RT.refreshBoard = refreshBoard;

  // What officers still have to do: cards to make, people to welcome, bounty claims to check.
  async function refreshPending() {
    const S = RT.state;
    if (!S.isAdmin) return 0;
    const head = t => sb.from(t).select('id', { count: 'exact', head: true });
    const [cards, welcome, claims] = await Promise.all([
      head('members').eq('card_status', 'pending'),
      head('members').eq('contact_status', 'new').not('phone', 'is', null),
      head('bounty_claims').eq('status', 'pending')
    ]);
    S.adminCounts = { cards: cards.count || 0, welcome: welcome.count || 0, claims: claims.count || 0 };
    S.pendingCount = S.adminCounts.cards + S.adminCounts.welcome + S.adminCounts.claims;
    return S.pendingCount;
  }
  RT.refreshPending = refreshPending;
})();
