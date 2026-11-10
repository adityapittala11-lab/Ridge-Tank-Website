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

  // Sign-up needs an email from one of these providers (the server enforces it too). Throwaway/temp mail sites aren't on it.
  allowedEmailDomains: ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'learner.dvusd.org', 'dvusd.org'],

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

  // Sponsor sign-up (#/sponsor). Change the meetings as dates get approved. "value" must stay short, lowercase, no spaces.
  sponsor: {
    contact: 'ridgetank.club@gmail.com',
    meetings: [
      { value: '2026-11-19', label: 'Thu, Nov 19', note: 'Phase 01: Spark kickoff' },
      { value: 'december', label: 'December meeting', note: 'Date coming soon' },
      { value: '2027-02-10', label: 'Wed, Feb 10, 2027', note: 'Demo Day' },
      { value: 'any', label: 'Any meeting', note: 'We’ll pick one with you' }
    ],
    // The 4 sponsor categories. A sponsor picks one when they sign up, then picks a plan inside it on their dashboard.
    // Spots for hoodie and event are counted on the server (api/sponsor.js, SPOTS).
    categories: [
      { value: 'normal', label: 'Normal sponsor', price: '$10 / month', text: 'A small way to stay in front of students every month.', plans: ['basic'], icon: 'coins' },
      { value: 'meeting', label: 'Meeting sponsor', price: 'From $100', text: 'Power a meeting, or go all in with the Full package.', plans: ['meeting', 'full'], icon: 'megaphone', badge: 'Most popular' },
      { value: 'hoodie', label: 'Hoodie sponsor', price: '$333 once', text: 'Your name on the back of 60 Ridge Tank hoodies, plus a shoutout on the school announcements.', plans: ['hoodie'], icon: 'award', spots: true },
      { value: 'event', label: 'Event sponsor', price: '$799 once', text: 'Title sponsor of our Finale, plus a shoutout on the school announcements.', plans: ['event'], icon: 'flame', spots: true }
    ],
    inkindNote: 'Want to sponsor with food or gift cards instead? Email us at ridgetank.club@gmail.com.',
    levels: [
      { value: 'basic', cat: 'normal', label: 'Normal', price: '$10 / month', big: '33¢', unit: '/ day', per: '$10 billed monthly', text: 'A small way to stay in front of students every month.',
        pay: 'Billed $10 each month by card. Cancel any time.', cents: 1000, monthly: true,
        gets: ['A shoutout every month', 'Small poster in the meeting photo'] },
      { value: 'meeting', cat: 'meeting', label: 'One meeting', price: '$100 once', per: 'one time · about $2 per student', text: 'Covers snacks and prizes for one meeting.',
        pay: 'Pay $100 once by card.', cents: 10000,
        gets: ['Your logo on our posters', 'On-screen shoutout at the meeting', 'Instagram feature', 'The snack table is yours', 'Big poster in the meeting photo'] },
      { value: 'full', cat: 'meeting', label: 'Full package', price: '$79.99 / month', big: '$2.67', unit: '/ day', per: '$79.99 billed monthly', badge: 'Best value', text: 'Every meeting, all month long.',
        pay: 'Billed $79.99 each month by card. Cancel any time.', cents: 7999, monthly: true,
        gets: ['Your logo across the school', 'Repost chain through the whole club', 'Big poster in the meeting photo', 'Everything in Normal'] },
      { value: 'hoodie', cat: 'hoodie', label: 'Hoodie sponsor', price: '$333 once', per: 'about $5.55 per hoodie', text: 'Your name on the back of 60 Ridge Tank hoodies.',
        pay: 'Pay $333 once by card.', cents: 33300,
        gets: ['Your name on the back of 60 hoodies', 'Worn at school, meetings and events all year', 'Shoutout to the whole school on the morning announcements'] },
      { value: 'event', cat: 'event', label: 'Event sponsor', price: '$799 once', per: 'one spot only', text: 'Title sponsor of the Ridge Tank Finale.',
        pay: 'Pay $799 once by card.', cents: 79900,
        gets: ['“Ridge Tank Finale, presented by [your business]”', 'Your logo on the Finale posters and screen', 'Shoutout to the whole school on the morning announcements', 'Only one spot'] },
      { value: 'inkind', cat: 'meeting', label: 'In-kind partner', price: 'No cash', text: 'Snacks, drinks, or gift cards for our pitch winners.',
        pay: 'We’ll plan a drop-off time for your snacks or gift cards.', gets: ['Shoutout at the meeting', 'Thank-you photos'] }
    ],
    perks: [
      { icon: 'award', title: 'Your logo on our posters', text: 'Up around campus before the meeting.' },
      { icon: 'megaphone', title: 'On-screen shoutout', text: '“This meeting is powered by [your business].”' },
      { icon: 'instagram', title: 'Instagram feature', text: 'A post about you on our account.' },
      { icon: 'flame', title: 'The snack table is yours', text: '“Shark Bait, presented by [your business].”' }
    ]
  },

  // Opening animation timing in milliseconds.
  // Sign-up incentive shown on the landing page for people who aren't members yet. Set to null to hide it.
  promo: {
    title: 'Next meeting · Thu, Nov 19',
    text: 'Any MRHS student can join. Just walk in. Bring a friend and you both get candy.'
  },

  // Shown in the FAQ. Update after each meeting is scheduled.
  nextMeeting: 'Thursday, November 19',

  // Red countdown banner on Home. The calendar's next meeting wins if there is one; this is the fallback.
  // Set date to '' to hide the banner.
  countdown: { date: '2026-11-19', time: '2:25 PM', place: 'Media Center', text: 'Phase 01: Spark kickoff with Sabin Lomac from Shark Tank' },

  // Crew teams (Bounties > Forms). "value" must be short lowercase letters only. 3 spots per team (the database enforces 3).
  teams: {
    open: true,          // false = form closed
    closes: 'Wed, Nov 11',
    seats: 3,
    list: [
      { value: 'presidential', label: 'Presidential Team', icon: 'shield',
        text: 'Runs the club with Aditya. Gets sponsors, walks into local businesses, and makes meetings happen.',
        rules: ['4 business walk-ins per person, every week, with a photo', 'Bring in sponsors (that is the #1 job)', 'Help run meeting day'] },
      { value: 'social', label: 'Social Media Team', icon: 'instagram',
        text: 'Works with the secretary to make Ridge Tank the club everyone sees. Reels, posts, hype.',
        rules: ['Post 1 reel every 3 days (small is fine)', 'Film every meeting', 'Help sell sponsors with real content'] }
    ],
    // Shown on the form. Keep it honest: these are the deal.
    deal: 'Do your part on time and you earn big XP for the iFLY leaderboard. Miss it and you’re off the team. All or nothing.'
  },

  intro: { form: 1700, hold: 1900, disperse: 2000 },

  // Background swirl edges: 'soft' (smooth blur), 'medium', 'sharp', or 'crisp' (no blur).
  mesh: { swirl: 'sharp' }
};
