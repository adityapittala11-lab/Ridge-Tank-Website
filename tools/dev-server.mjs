// Local server for testing: serves the site at http://localhost:8934 and answers /api/shark (the AI sharks)
// with the Groq key from .env.local. Start it with:  node tools/dev-server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../supabase/functions/shark/core.mjs';

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

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/shark') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 60000) return sendJson(res, 413, { error: 'Too long.' });
    }
    try {
      const out = await handle(JSON.parse(raw || '{}'), groqKey());
      return sendJson(res, 200, out);
    } catch (e) {
      return sendJson(res, e.status || 500, { error: e.message || 'Something went wrong.' });
    }
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
  console.log(groqKey() ? 'AI sharks: on (Groq key found in .env.local)' : 'AI sharks: off. Add GROQ_API_KEY to .env.local and restart.');
});
