// Save (POST) or remove (DELETE) a phone's notification settings
import { subs, keyFor, cleanPractices, cleanSubscription, json } from '../lib/push.js';

export default async (req) => {
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }

  if (req.method === 'DELETE') {
    if (!body || typeof body.endpoint !== 'string') return json({ error: 'Missing endpoint' }, 400);
    await subs().delete(keyFor(body.endpoint));
    return json({ ok: true });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const subscription = cleanSubscription(body && body.subscription);
  if (!subscription) return json({ error: 'Invalid subscription' }, 400);
  const practices = cleanPractices(body.practices);
  if (!practices.length) return json({ error: 'Add at least one practice with a day picked' }, 400);

  await subs().setJSON(keyFor(subscription.endpoint), { subscription, practices, updated: new Date().toISOString() });
  return json({ ok: true, practices });
};

export const config = { path: '/api/subscription', method: ['POST', 'DELETE'] };
