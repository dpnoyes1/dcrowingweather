// Send this phone a sample of what its next notification will look like
import { F, subs, keyFor, send, loadLocations, messageFor, dayOffsetFor, json } from '../lib/push.js';

export default async (req) => {
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
  if (!body || typeof body.endpoint !== 'string') return json({ error: 'Missing endpoint' }, 400);
  const key = keyFor(body.endpoint);
  const rec = await subs().get(key, { type: 'json' });
  if (!rec) return json({ error: 'Not signed up on this phone yet' }, 404);

  const p = rec.practices[0];
  const todayKey = F.etKey(Date.now());
  const raws = await loadLocations([p.loc], todayKey);
  const msg = messageFor(p.loc, p.time, raws[p.loc], todayKey, dayOffsetFor(p.time), 'Test: ');
  const result = await send(key, rec, { ...msg, tag: 'test' });
  return json({ result, message: msg }, result === 'sent' ? 200 : 502);
};

export const config = { path: '/api/test', method: 'POST' };
