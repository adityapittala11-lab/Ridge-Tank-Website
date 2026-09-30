// Ridge Tank site settings. The publishable key is safe to ship in the browser;
// every table is locked down with row level security (see supabase/migration_v2.sql).
window.RT_CONFIG = {
  supabaseUrl: 'https://stnhxldorcxzgevxvvpw.supabase.co',
  supabaseKey: 'sb_publishable_UnjvpcC8MmbCDUU8DG_R6Q_JUVDlYzZ',

  school: 'Mountain Ridge High School',
  season: '2026-2027',

  // Points handed out by officers. Attendance is written on each check-in;
  // pitch points are written when an officer records a result.
  points: {
    attendance: 10,
    pitch: { 1: 30, 2: 20, 3: 10, 0: 5 }
  },

  officers: [
    { name: 'Aditya', role: 'President', note: 'Finance Shark' },
    { name: 'Kavin', role: 'Vice President' },
    { name: 'Navya', role: 'Communications' },
    { name: 'Micah', role: 'Secretary' }
  ],

  // Footer social icons. Add real accounts only, e.g.
  // { label: 'Instagram', icon: 'instagram', href: 'https://instagram.com/yourclub' }
  // (other icon names: 'mail', 'link'). Leave empty to hide the row.
  social: [],

  // Opening animation timing in milliseconds.
  intro: { form: 1700, hold: 1900, disperse: 2000 },

  // Background swirl edges: 'soft' (smooth blur), 'medium', 'sharp', or 'crisp' (no blur).
  mesh: { swirl: 'sharp' }
};
