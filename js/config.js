// Ridge Tank site settings. Nothing secret lives here: the database address, the login secret and the AI key
// are all Vercel environment variables (see README.md). Every table is locked down with row level security (db/*.sql).
window.RT_CONFIG = {
  school: 'Mountain Ridge High School',
  season: '2026-2027',

  // Points handed out by officers. Attendance is written on each check-in;
  // pitch points are written when an officer records a result.
  points: {
    attendance: 100,
    pitch: { 1: 300, 2: 200, 3: 100, 0: 50 }
  },

  officers: [
    { name: 'Aditya', role: 'President', note: 'Finance Shark' },
    { name: 'Kavin', role: 'Vice President' },
    { name: 'Navya', role: 'Communications' }
  ],

  // Sign-up needs a school email ending in one of these (the server enforces it too). null = any email.
  schoolEmail: ['learner.dvusd.org', 'dvusd.org'],

  // Where people sign up. Fill these in once they exist; the message templates pick them up.
  links: {
    form: '',   // the Google Form link
    site: ''    // the website address once it's online
  },

  // Message templates. {first} = their first name, {officer} = whoever is sending,
  // {date} = next meeting date, {when} = "date, time, room" as far as it's known,
  // {form} and {site} = the links above.
  templates: {
    fblaSubject: 'New program at Mountain Ridge: Ridge Tank',
    fblaEmail:
      'Hi everyone!\n\n' +
      'Some of us are starting a new program called Ridge Tank. Think Shark Tank for Mountain Ridge: you pitch ideas, ' +
      'back other people’s ideas, and earn points and badges just for showing up. Our first meeting is {date}.\n\n' +
      'Want in? Sign up here (takes about a minute):\n{form}\n\n' +
      'You can also sign up on our website:\n{site}\n\n' +
      'An officer will text you with updates. See you there!\n\nThe Ridge Tank officers',
    welcomeText:
      'Hey {first}! It’s {officer} from Ridge Tank. Thanks for signing up. ' +
      'We’ll send program updates here (meeting reminders, challenges, all of it). ' +
      'Want me to add you to the WhatsApp group too? Our first meeting is {when}.',
    reminderWeek:
      'Hey {first}, quick reminder: Ridge Tank’s first meeting is one week away ({when}). ' +
      'You’ll learn how everything works. Hope to see you there!',
    reminderDay:
      'Hey {first}, Ridge Tank meeting tomorrow ({when}). Just walk in. See you there!',
    reminderToday:
      'Today’s the day! Ridge Tank meeting: {when}. Just walk in, no sign-up needed.'
  },

  // AI sharks for the Academy (Groq). The key is never in this file.
  // On this computer: run  node tools/dev-server.mjs  and the key is read from .env.local.
  // On the live site: api/shark.js (a Vercel Function) reads GROQ_API_KEY from Vercel > Project Settings >
  // Environment Variables. Both places use the same address. If the key is missing the sharks use their scripted lines.
  ai: { endpoint: '/api/shark' },

  // Tank Academy. openNow: true = every member can start now and work through the levels in order,
  // ignoring each block's open date. false = levels open on their dates (Season 1 starts Oct 12).
  academy: { openNow: true },

  // Footer social icons. Add real accounts only, e.g.
  // { label: 'Instagram', icon: 'instagram', href: 'https://instagram.com/yourclub' }
  // (other icon names: 'mail', 'link'). Leave empty to hide the row.
  social: [],

  // Opening animation timing in milliseconds.
  // Sign-up incentive shown on the landing page for people who aren't members yet. Set to null to hide it.
  promo: {
    title: 'First meeting · Wed, Oct 21 · 2:20 PM · Media Center',
    text: 'Any MRHS student can join. Just walk in. Bring a friend and you both get candy.'
  },

  // Shown in the FAQ. Update after each meeting is scheduled.
  nextMeeting: 'Wednesday, October 21',

  intro: { form: 1700, hold: 1900, disperse: 2000 },

  // Background swirl edges: 'soft' (smooth blur), 'medium', 'sharp', or 'crisp' (no blur).
  mesh: { swirl: 'sharp' }
};
