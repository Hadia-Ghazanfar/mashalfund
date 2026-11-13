// Local development server: serves public/ and POST /api/<action>.
//   npm run dev        -> http://localhost:3000
// Uses Postgres if DATABASE_URL is set, otherwise an in-memory store
// (data resets when the server restarts — for testing only).
// Never run this file on Vercel; Vercel uses api/[action].js instead.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryStore } from './api/_store-memory.js';
import { createPgStore } from './api/_store-pg.js';
import { handleAction } from './api/handlers.js';
import { ApiError } from './api/_lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

let store = null;
function getStore() {
  if (store) return store;
  if (process.env.DATABASE_URL) {
    console.log('Using Postgres store (DATABASE_URL is set).');
    store = createPgStore();
  } else {
    console.log('No DATABASE_URL — using in-memory store (data resets on restart).');
    store = createMemoryStore();
  }
  return store;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      if (req.method !== 'POST') { res.writeHead(405, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Use POST.' })); return; }
      const action = decodeURIComponent(req.url.slice(5).split('?')[0]);
      let body = '';
      for await (const chunk of req) body += chunk;
      const args = body ? JSON.parse(body) : {};
      const result = await handleAction(getStore(), action, args);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }
    let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    if (filePath === '/sw.js') filePath = '/sw.js';
    const full = path.join(__dirname, 'public', decodeURIComponent(filePath));
    if (!full.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      // SPA fallback: unknown paths serve the app.
      const index = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(index);
      return;
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(full));
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message || 'Something went wrong.' }));
  }
});

server.listen(PORT, () => console.log(`Mash'al Fund Manager (local) at http://localhost:${PORT}`));
