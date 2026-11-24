// Ridge Tank site settings. Nothing secret lives here: the database address, the login secret and the AI key
// are all Vercel environment variables (see README.md). Every table is locked down with row level security (db/*.sql).
window.RT_ARRIVED = location.href; // the address the visitor arrived on, before the router tidies it up
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

  // Footer social icons. Add real accounts only (icon names: 'instagram', 'mail', 'link'). Leave empty to hide the row.
  social: [
    { label: 'Ridge Tank on Instagram', icon: 'instagram', href: 'https://www.instagram.com/ridge.tank/' },
    { label: 'Email Ridge Tank', icon: 'mail', href: 'mailto:ridgetank.club@gmail.com' }
  ],

  // Sponsor sign-up (#/sponsor). Change the meetings as dates get approved. "value" must stay short, lowercase, no spaces.
  sponsor: {
    contact: 'ridgetank.club@gmail.com',
    meetings: [
      { value: 'december', label: 'December meeting', note: 'Date coming soon' },
      { value: '2027-02-10', label: 'Wed, Feb 10, 2027', note: 'Demo Day' },
      { value: 'any', label: 'Any meeting', note: 'We’ll pick one with you' }
    ],
    // The 5 sponsor tiers (Nov 24, 2026: hoodie = $333, Event Sponsor from $750). A sponsor picks one when they sign up and pays once by card (Stripe).
    // Prices must match ONCE in api/sponsor.js. Spots for hoodie and event are counted on the server (SPOTS).
    categories: [
      { value: 'partial', label: 'Community Partner', price: '$150', text: 'Your name in front of every student at one meeting.', plans: ['partial'], icon: 'users' },
      { value: 'meeting', label: 'Meeting Partner', price: '$250', text: 'Your logo on our posters and on screen at one meeting.', plans: ['meeting'], icon: 'megaphone' },
      { value: 'exclusive', label: 'Title Partner', price: '$333', text: 'One meeting, all yours. You are the only sponsor in the room.', plans: ['exclusive'], icon: 'crown', badge: 'Best value' },
      { value: 'hoodie', label: 'Hoodie Sponsor', price: '$333', text: 'Your logo on the back of 60 club hoodies, worn all year.', plans: ['hoodie'], icon: 'award', spots: true },
      { value: 'event', label: 'Event Sponsor', short: 'Event Sponsor', price: 'From $750', text: 'Your name on our biggest night of the year.', plans: ['event'], icon: 'trophy', spots: true }
    ],
    inkindNote: 'Want to sponsor with food or gift cards instead? Email us at ridgetank.club@gmail.com.',
    levels: [
      { value: 'partial', cat: 'partial', label: 'Community Partner', price: '$150 once', per: 'about $2.50 per student', text: 'Your name in front of every student at one meeting.',
        pay: 'Pay $150 once by card.', cents: 15000,
        gets: ['Your business on the sponsor slide at one meeting', 'Thank-you post on our Instagram story', 'Listed on our website sponsor wall', 'Photos from the meeting'] },
      { value: 'meeting', cat: 'meeting', label: 'Meeting Partner', price: '$250 once', per: 'about $4.17 per student', text: 'Your logo on our posters and on screen at one meeting.',
        pay: 'Pay $250 once by card.', cents: 25000, plus: 'Everything in Community Partner, plus',
        gets: ['Your logo on meeting posters around campus', 'On-screen shoutout: “This meeting is powered by you”', 'Instagram feed post about your business', 'The snack table is named after you'] },
      { value: 'exclusive', cat: 'exclusive', label: 'Title Partner', price: '$333 once', per: 'about $5.55 per student', badge: 'Best value', text: 'One meeting, all yours.',
        pay: 'Pay $333 once by card.', cents: 33300, plus: 'Everything in Meeting Partner, plus',
        gets: ['Exclusive: the only sponsor at your meeting', 'Meeting named “presented by [your business]”', 'A 60-second intro to students, live or by video', 'Shoutout to the whole school on the morning announcements'] },
      { value: 'hoodie', cat: 'hoodie', label: 'Hoodie Sponsor', price: '$333 once', per: 'about $5.55 per hoodie, worn all year', text: 'Your logo on the back of 60 club hoodies, worn all year.',
        pay: 'Pay $333 once by card.', cents: 33300,
        gets: ['Your logo on the back of 60 club hoodies', 'Shoutout to the whole school on the morning announcements', 'Featured on our website homepage all school year', 'Photo of our members wearing your hoodie'] },
      { value: 'event', cat: 'event', label: 'Event Sponsor', price: '$750 once', big: '$750+', per: 'one spot only', text: 'Your name on our biggest night of the year.',
        pay: 'Pay $750 by card. Want a bigger package? Email us.', cents: 75000, plus: 'Everything in Hoodie Sponsor, plus',
        gets: ['“Ridge Tank Finale, presented by [your business]”', 'Your logo on the Finale stage screen and posters', 'A booth at the Finale in front of students and families', 'Name an award and present it on stage', 'Only one spot'] },
      // Older plans, kept so existing sponsors still see the right thing on their dashboard. Not offered to new sponsors.
      { value: 'basic', cat: 'partial', label: 'Normal (legacy)', price: '$10 / month', big: '33¢', unit: '/ day', per: '$10 billed monthly', text: 'Monthly shoutout.',
        pay: 'Billed $10 each month by card. Cancel any time.', cents: 1000, monthly: true, legacy: true,
        gets: ['A shoutout every month', 'Small poster in the meeting photo'] },
      { value: 'full', cat: 'meeting', label: 'Full package (legacy)', price: '$79.99 / month', big: '$2.67', unit: '/ day', per: '$79.99 billed monthly', text: 'Every meeting, all month long.',
        pay: 'Billed $79.99 each month by card. Cancel any time.', cents: 7999, monthly: true, legacy: true,
        gets: ['Your logo across the school', 'Repost chain through the whole club', 'Big poster in the meeting photo'] },
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
    title: 'Next meeting · December',
    text: 'Any MRHS student can join. Just walk in. Bring a friend and you both get candy.'
  },

  // Shown in the FAQ. Update after each meeting is scheduled.
  nextMeeting: 'December (date coming soon)',

  // Red countdown banner on Home. The calendar's next meeting wins if there is one; this is the fallback.
  // Set date to '' to hide the banner.
  countdown: { date: '', time: '2:25 PM', place: 'Media Center', text: 'December meeting' },

  // The meeting photo on the landing page, the sign-up page and the sponsor page. show: false hides it everywhere.
  // "video" plays (muted, looping) in place of the photo on the landing page only. Keep "count" true: it is the number of students who came.
  crowd: {
    show: true,
    photo: 'marketing/meeting-two.jpg', photoSmall: 'marketing/meeting-two.jpg',
    video: 'marketing/meeting-two-crowd.mp4', poster: 'marketing/meeting-two-crowd.jpg',
    alt: 'The Media Center packed with Ridge Tank members at the second meeting',
    caption: 'Nov 19, 2026. Meeting two, Phase 01: Spark.',
    count: 60, countSuffix: '+',
    title: 'innovators at meeting two.',
    text: 'Up from 40 at meeting one. A Shark Tank founder called in, teams pitched real ideas to our Sharks, and the top three walked out with $60+ in prizes.'
  },

  // The guest who came to the last meeting. Keep every number true (sources in llms-full.txt). show: false hides it.
  founder: {
    show: true,
    video: 'marketing/sabin-on-screen.mp4', poster: 'marketing/sabin-on-screen.jpg',
    alt: 'Sabin Lomac on both big screens in the Media Center while members watch',
    caption: 'Sabin Lomac on the big screens at meeting two.',
    big: '$1B+',
    bigLabel: 'in sales at Cousins Maine Lobster, the company he co-founded',
    title: 'A Shark Tank founder came to Ridge Tank.',
    text: 'Sabin Lomac and his cousin Jim Tselikis started Cousins Maine Lobster in 2012 with one food truck in Los Angeles. They pitched it on Shark Tank, Barbara Corcoran invested, and it grew into a national brand. On Nov 19, Sabin called into meeting two and talked with our members for 10 minutes.',
    facts: [
      ['$55K', 'Barbara Corcoran’s Shark Tank deal in 2012'],
      ['85+', 'trucks and restaurants across the U.S.'],
      ['10 min', 'live with our members on Nov 19']
    ],
    lesson: 'His big lesson for us: pick a partner who’s your opposite, not your reflection.'
  },

  // The year, shown on the landing page. Dates are yyyy-mm-dd; the phase that contains today is marked "Now".
  phases: [
    { name: 'Spark', from: '2026-10-12', to: '2026-12-02', when: 'Now to Dec 2', text: 'Find a real problem, pick your idea, and talk to the people who have it.' },
    { name: 'Build', from: '2026-12-02', to: '2027-02-10', when: 'Dec 2 to Feb 10', text: 'Make the smallest version that works, test it, launch it, and show it at Demo Day on Feb 10.' },
    { name: 'Sell', from: '2027-02-10', to: '2027-04-07', when: 'Feb 10 to Apr 7', text: 'Make real sales and get to your first ten customers.' },
    { name: 'Grow', from: '2027-04-07', to: '2027-05-12', when: 'Apr 7 to May 12', text: 'Grow what works, then pitch it at the Grand Finale on May 12.' }
  ],
  // Pitches from the last meeting, shown under the guest. "wall" is one video of many pitches playing at once
  // (wide for computers, tall for phones). "clips" (one video each) is used only when there is no wall. show: false hides the section.
  pitches: {
    show: true,
    title: 'Every pitch. All at once.',
    text: 'At meeting two, teams stood up with a real idea and a mic and pitched it to our student Sharks. The Sharks picked the top three.',
    wall: {
      wide: 'marketing/pitch-wall-wide.mp4', widePoster: 'marketing/pitch-wall-wide.jpg',
      tall: 'marketing/pitch-wall-tall.mp4', tallPoster: 'marketing/pitch-wall-tall.jpg',
      label: 'Twelve clips of members pitching at meeting two, playing at the same time',
      caption: 'Nov 19, 2026. Meeting two pitches, all playing at once.'
    },
    clips: [],
    photos: [
      { src: 'marketing/meeting-two-spark.jpg', alt: 'A member with a mic kicking off Phase 01: Spark', caption: 'Phase 01: Spark.' },
      { src: 'marketing/meeting-two-snacks.jpg', alt: 'Members around the snack table at meeting two', caption: 'Shark Bait. Gone in about five minutes.' }
    ]
  },

  // Three short facts under the Join button. Keep them true.
  proof: ['60+ students at our last meeting', 'A Shark Tank founder spoke at meeting two', 'Free to join'],
  // The line under the phases. Set to '' to hide it.
  leaderboardPrize: 'The leaderboard closes Dec 31. First place wins iFLY tickets.',

  // The club hoodie on the landing page. The price is worked out from "was" and "percentOff", so the math is always right:
  // $25 with 20% off = $20. Only show a crossed-out price that people will really pay later (the price after launch).
  // orders: false shows "Orders open soon" instead of the order form. The real price is charged by api/hoodie.js (HOODIE_CENTS).
  hoodie: {
    show: true,
    was: 25, percentOff: 20, priceNote: 'Launch price',
    orders: true,              // true = the "Get the hoodie" button opens the order form (paid by card through Stripe)
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    perks: ['Front row at events', 'Skip the line at the door', 'A shoutout at the meeting']
  },

  // The mystery event teaser (a cream block with burgundy question marks; when, where and what are blacked out). Fill in "reveal" (like 'Revealed Dec 2') once there is a date. show: false hides it.
  mystery: { show: true, title: 'Mystery event', text: 'Something big is coming to Ridge Tank. We’ll tell you when. We won’t tell you what.', reveal: 'Details soon' },

  // Crew teams (Bounties > Forms). "value" must be short lowercase letters only. 3 spots per team (the database enforces 3).
  teams: {
    open: true,          // false = form closed
    closes: 'Wed, Nov 11',
    closesOn: '2026-11-11', // the form closes by itself after this day (YYYY-MM-DD); move it to reopen
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
    deal: 'Do your part on time and you earn big Bites for the iFLY leaderboard. Miss it and you’re off the team. All or nothing.'
  },

  intro: { form: 1700, hold: 1900, disperse: 2000 },

  // Background swirl edges: 'soft' (smooth blur), 'medium', 'sharp', or 'crisp' (no blur).
  mesh: { swirl: 'sharp' }
};
