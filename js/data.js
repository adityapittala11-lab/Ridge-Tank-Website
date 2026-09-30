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
    async register(name, grade, ref) {
      return check(await sb.rpc('register_member', { p_name: name, p_grade: grade, p_ref: ref || null }));
    },
    async setPhone(phone) {
      return check(await sb.rpc('set_my_phone', { p_phone: phone }));
    },
    async claim(code) {
      return check(await sb.rpc('claim_card', { p_code: code }));
    },
    async updateProfile(name, grade) {
      return check(await sb.rpc('update_my_profile', { p_name: name, p_grade: grade }));
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
    // Net worth leaderboard (supabase/migration_v4.sql). Falls back to the old view until that's been run.
    async board() {
      const r = await sb.from('member_standings').select('member_id, name, total_points, current_tier, earned, gain, locked, available');
      if (!r.error) { RT.market = Object.assign(RT.market || {}, { live: true }); return r.data; }
      RT.market = Object.assign(RT.market || {}, { live: false });
      return check(await sb.from('member_tiers').select('member_id, name, total_points, current_tier'));
    },
    async openMeeting() {
      const r = await sb.from('meetings').select('*').eq('investing_open', true).order('meeting_date', { ascending: false }).limit(1);
      return r.error ? null : (r.data && r.data[0]) || null;
    },
    async myStakes(memberId) {
      const r = await sb.from('vote_values').select('*').eq('from_member_id', memberId);
      return r.error ? [] : r.data;
    },
    async invest(toId, amount) {
      return check(await sb.rpc('invest', { p_to: toId, p_amount: amount }));
    },
    async bounties() {
      const r = await sb.from('bounties').select('*').eq('active', true).order('created_at', { ascending: false });
      return r.error ? [] : r.data;
    },
    async myClaims(memberId) {
      const r = await sb.from('bounty_claims').select('*').eq('member_id', memberId);
      return r.error ? [] : r.data;
    },
    async claimBounty(id) {
      return check(await sb.rpc('claim_bounty', { p_bounty: id }));
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

    // Crowd Favorite: sessions where you received the most Shark Notes.
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
    'Podium Shark': 'award', 'Tank Champion': 'trophy', 'Crowd Favorite': 'sparkle', 'Active Investor': 'coins',
    'Headhunter': 'users', 'Chief Talent Officer': 'users', 'Boardroom': 'shield', 'Keynote': 'mic',
    'Crew': 'shield', 'Founding Shark': 'fin', 'King of the Tank': 'crown'
  };
  RT.badgeIcon = name => BADGE_ICONS[name] || 'award';

  // Pull every shared list a signed-in member needs.
  async function loadShared() {
    const S = RT.state;
    const [tiers, badges, meetings, board, dir] = await Promise.all([
      api.tiers().catch(() => []),
      api.badges().catch(() => []),
      api.meetings().catch(() => []),
      api.board().catch(() => []),
      api.directory().catch(() => [])
    ]);
    S.tiers = tiers;
    S.badges = badges;
    S.meetings = meetings;
    S.board = rankBoard(board);
    S.directory = new Map(dir.map(d => [d.id, d.name]));
  }
  RT.loadShared = loadShared;

  async function refreshBoard() {
    const S = RT.state;
    try { S.board = rankBoard(await api.board()); } catch (e) { /* keep the old copy */ }
    return S.board;
  }
  RT.refreshBoard = refreshBoard;

  async function refreshPending() {
    const S = RT.state;
    if (!S.isAdmin) return 0;
    const { count, error } = await sb.from('members').select('id', { count: 'exact', head: true }).eq('card_status', 'pending');
    if (!error) S.pendingCount = count || 0;
    return S.pendingCount;
  }
  RT.refreshPending = refreshPending;
})();
