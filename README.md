# Ridge Tank

The Ridge Tank website for Mountain Ridge High School. A plain HTML/CSS/JS site, plus a few Vercel Functions in `api/`.

## How it's put together

| Part | What it does |
|---|---|
| `index.html`, `css/`, `js/` | The whole site (landing page, member screens, officer tools, Academy). No build step. |
| `js/backend.js` | The browser side of our own backend. It talks to `/api/db`. |
| `api/db.js` | Accounts and the database. Runs every request on Postgres with the logged-in person's id, so the access rules in `db/*.sql` decide who can see what. |
| `api/shark.js`, `api/sharks.js` | The AI sharks (Groq). |
| `db/*.sql` | The database tables, views, functions and access rules. They run **automatically** the first time the site talks to the database. |

There is no outside login or database service. Accounts and data live in one Postgres database.

## Setting it up on Vercel (once)

1. **Connect a database.** Vercel project, **Storage**, **Create Database**, choose **Neon (Postgres)**, free plan, then **Connect to this project**. Vercel adds `DATABASE_URL` for you.
2. **Add two environment variables** (project **Settings**, **Environment Variables**):
   - `ADMIN_EMAILS`: the officers' email addresses, separated by commas. Those accounts become officers when they log in.
   - `GROQ_API_KEY`: for the AI sharks (if it isn't there already).
   - Optional: `ALLOWED_EMAIL_DOMAINS`: who may sign up. Defaults to `learner.dvusd.org,dvusd.org`. Set it to empty to allow any email. Officers in `ADMIN_EMAILS` are always allowed.
   - Optional: `AUTH_SECRET`, any long random text. Login tokens are signed with it. If you leave it out, the site makes one from the database address.
3. **Redeploy.** The first visit creates all the tables.
4. **Make an account** with an email from `ADMIN_EMAILS`. Open **Admin**.

Nothing secret is in this repo. Keep it that way.

## Day to day

- **New sign-ups wait for approval.** They need a school email and a real first-and-last name, then they show up in Admin, **Approvals**. People you added yourself (or who sign up with an email you already added, or use a member code) are approved automatically.
- **Chat:** officers post, members reply. Next to a member's name (officers only) is a small menu: mute for 10 minutes to a week, or **Ban and remove**. Ban deletes the person and everything they did, and blocks their email; lift the block under Approvals, Blocked emails.
- **Forgot password?** There is no reset email. An officer opens Admin, Members, the person, **Set a new password**.
- **Changing the database:** edit or add a file in `db/`, run `node tools/build-schema.mjs <next number>` (it rewrites `api/_schema.js`), and commit. Existing databases update themselves on the next visit. Write changes so they are safe to run twice.
- **Test on your computer:** put `DATABASE_URL=...` (and `ADMIN_EMAILS=...`, `GROQ_API_KEY=...`) in `.env.local`, run `npm install`, then `node tools/dev-server.mjs` and open http://localhost:8934.
