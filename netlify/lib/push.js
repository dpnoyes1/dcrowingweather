// Shared helpers for the notification functions: storage, sending, and
// turning a practice into a forecast message.
import webpush from 'web-push';
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import * as F from '../../site/forecast.js';

export { F };

// One record per phone: { subscription, practices: [{ loc, time, days }], updated }
export const subs = () => getStore('push-subscriptions');
export const runs = () => getStore('push-runs');
export const keyFor = (endpoint) => createHash('sha256').update(endpoint).digest('hex');

let ready = false;
function configure() {
  if (ready) return;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://dcrowingweather.netlify.app', pub, priv);
  ready = true;
}

// Send one message; forget phones that have uninstalled or turned notifications off
export async function send(key, rec, payload) {
  configure();
  try {
    await webpush.sendNotification(rec.subscription, JSON.stringify(payload), { TTL: 4 * 3600, urgency: 'normal' });
    return 'sent';
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { await subs().delete(key); return 'gone'; }
    console.error('push failed', e.statusCode, e.body || e.message);
    return 'error';
  }
}

export async function allSubscriptions() {
  const store = subs();
  const { blobs } = await store.list();
  const recs = await Promise.all(blobs.map(async (b) => ({ key: b.key, rec: await store.get(b.key, { type: 'json' }) })));
  return recs.filter(r => r.rec && r.rec.subscription);
}

// Run tasks a few at a time
export async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

// Keep only well-formed practices
export function cleanPractices(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 8).map(p => ({
    loc: String(p && p.loc), time: String(p && p.time),
    days: [...new Set((p && Array.isArray(p.days) ? p.days : []).map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort()
  })).filter(p => F.LOCATIONS[p.loc] && F.TIMES[p.time] && p.days.length);
}

export function cleanSubscription(s) {
  if (!s || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://')) return null;
  if (!s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

// Morning practices are announced the night before; others the same morning
export const dayOffsetFor = (time) => time === 'morning' ? 1 : 0;

// Forecast data for several locations at once (one fetch per location)
export async function loadLocations(locKeys, todayKey) {
  const entries = await Promise.all([...new Set(locKeys)].map(async (k) => [k, await F.loadRaw(F.LOCATIONS[k], todayKey)]));
  return Object.fromEntries(entries);
}

// The push message for one practice on today (offset 0) or tomorrow (offset 1)
export function messageFor(loc, time, raw, todayKey, offset, prefix = '') {
  const day = F.buildDays(F.LOCATIONS[loc], time, raw, todayKey)[offset];
  const { title, body } = F.notificationText(loc, time, day, offset ? 'Tomorrow' : 'Today');
  return { title: prefix + title, body, url: `/?loc=${loc}&time=${time}`, tag: `${loc}-${time}-${day.key}` };
}

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
