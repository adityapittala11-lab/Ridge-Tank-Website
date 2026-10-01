// Supabase Edge Function "shark": the AI sharks for the live site. Not deployed yet.
// To switch it on: create a function named "shark" with these two files, add the secret GROQ_API_KEY
// in Supabase > Edge Functions > Secrets, then set ai.endpoint in js/config.js to
// https://stnhxldorcxzgevxvvpw.supabase.co/functions/v1/shark
import { handle } from './core.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Supabase checks the token's signature before this runs. The site's public key is a valid token too,
// so also require a signed-in member's token.
function signedIn(req: Request): boolean {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'authenticated';
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!signedIn(req)) return json({ error: 'Log in first.' }, 401);
  try {
    return json(await handle(await req.json(), Deno.env.get('GROQ_API_KEY') || ''));
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return json({ error: err.message || 'Something went wrong.' }, err.status || 500);
  }
});
