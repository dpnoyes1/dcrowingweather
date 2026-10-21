// One-off alert to everyone (or everyone following one location).
// POST /api/alert with header "x-alert-key: <ALERT_KEY>" and JSON
// { "title": "...", "body": "...", "loc": "upper" (optional), "url": "/..." (optional) }
import { F, allSubscriptions, send, inBatches, json } from '../lib/push.js';

export default async (req) => {
  const expected = process.env.ALERT_KEY;
  if (!expected || req.headers.get('x-alert-key') !== expected) return json({ error: 'Not allowed' }, 403);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
  const title = String(body.title || '').slice(0, 80), text = String(body.body || '').slice(0, 300);
  if (!title || !text) return json({ error: 'title and body are required' }, 400);
  if (body.loc && !F.LOCATIONS[body.loc]) return json({ error: 'Unknown loc' }, 400);

  const targets = (await allSubscriptions())
    .filter(({ rec }) => !body.loc || rec.practices.some(p => p.loc === body.loc));
  const url = typeof body.url === 'string' && body.url.startsWith('/') ? body.url : (body.loc ? `/?loc=${body.loc}` : '/');
  const results = await inBatches(targets, 20, ({ key, rec }) => send(key, rec, { title, body: text, url, tag: 'alert' }));
  const count = (r) => results.filter(x => x === r).length;
  return json({ recipients: targets.length, sent: count('sent'), gone: count('gone'), errors: count('error') });
};

export const config = { path: '/api/alert', method: 'POST' };
