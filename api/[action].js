// Vercel serverless entry point — one dynamic route for every action:
//   POST /api/<action>   with JSON body { ...args, auth: { memberId, token } }
// The store is Postgres (DATABASE_URL). If DATABASE_URL is not set the
// request fails with a clear 500 — the app must be configured first.
import { createPgStore } from './_store-pg.js';
import { handleAction } from './handlers.js';
import { ApiError } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  const action = req.query.action;
  let args = {};
  try {
    args = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    res.status(400).json({ error: 'Invalid JSON.' });
    return;
  }
  try {
    const store = createPgStore();
    const result = await handleAction(store, action, args);
    res.status(200).json(result);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    res.status(status).json({ error: e.message || 'Something went wrong.' });
  }
}
