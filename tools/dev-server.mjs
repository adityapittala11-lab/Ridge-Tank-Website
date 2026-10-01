// Local server for testing: serves the site at http://localhost:8934 and runs the same AI functions the live site uses
// (api/shark.js and api/sharks.js) with the Groq key from .env.local. Start it with:  node tools/dev-server.mjs
// The key never leaves this computer. On the live site the same key comes from Vercel's environment variables instead.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8934);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

function groqKey() {
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^GROQ_API_KEY=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
process.env.GROQ_API_KEY = groqKey();
process.env.RT_DEV_NO_AUTH = '1'; // this computer only: skip the member login check so the sharks can be tried without signing in

const FUNCTIONS = new Set(['shark', 'sharks']);

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// Runs a Vercel-style function (req.method, req.headers, req.body; res.status().json()) for one request.
async function runFunction(name, req, res) {
  let raw = '';
  if (req.method === 'POST') {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 60000) return sendJson(res, 413, { error: 'Too long.' });
    }
  }
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return sendJson(res, 400, { error: 'Bad request.' }); }
  const shim = {
    status(code) { this.code = code; return this; },
    setHeader() {},
    json(obj) { sendJson(res, this.code || 200, obj); }
  };
  const mod = await import(pathToFileURL(path.join(ROOT, 'api', name + '.js')).href + '?t=' + Date.now());
  await mod.default({ method: req.method, headers: req.headers, body }, shim);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const fn = url.pathname.match(/^\/api\/([a-z]+)$/);

  if (fn && FUNCTIONS.has(fn[1])) {
    try { await runFunction(fn[1], req, res); } catch (e) { if (!res.headersSent) sendJson(res, 500, { error: e.message || 'Something went wrong.' }); }
    return;
  }

  // Static files. Anything starting with a dot (.env.local, .git) is never served.
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel.split('/').some(part => part.startsWith('.'))) { res.writeHead(404); return res.end('Not found'); }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Ridge Tank is running at http://localhost:${PORT}`);
  console.log(process.env.GROQ_API_KEY ? 'AI sharks: on (Groq key found in .env.local)' : 'AI sharks: off. Add GROQ_API_KEY to .env.local and restart.');
});
