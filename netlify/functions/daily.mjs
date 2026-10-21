// Scheduled sends. Runs at 10, 11, 23 and 0 UTC, which covers 6 AM and 7 PM
// Eastern in both daylight and standard time; other runs exit immediately.
//   6 AM ET: today's forecast for afternoon and evening practices
//   7 PM ET: tomorrow's forecast for morning practices
import { F, runs, allSubscriptions, send, inBatches, loadLocations, messageFor } from '../lib/push.js';

export default async () => {
  const now = Date.now();
  const hour = Number(F.etParts(now).hour);
  const mode = hour === 6 ? 'today' : hour === 19 ? 'tomorrow' : null;
  if (!mode) return;

  const todayKey = F.etKey(now);
  const offset = mode === 'tomorrow' ? 1 : 0;
  const practiceDay = F.addDays(todayKey, offset);
  const weekday = new Date(practiceDay + 'T12:00:00Z').getUTCDay();

  // Never send the same batch twice
  const runKey = `${mode}-${practiceDay}`;
  if (await runs().get(runKey)) return;
  await runs().set(runKey, new Date(now).toISOString());

  const jobs = [];
  for (const { key, rec } of await allSubscriptions()) {
    for (const p of rec.practices) {
      const isMorning = p.time === 'morning';
      if ((mode === 'tomorrow') === isMorning && p.days.includes(weekday)) jobs.push({ key, rec, p });
    }
  }
  if (!jobs.length) return;

  const raws = await loadLocations(jobs.map(j => j.p.loc), todayKey);
  const messages = {};
  const results = await inBatches(jobs, 20, ({ key, rec, p }) => {
    const id = `${p.loc}|${p.time}`;
    messages[id] = messages[id] || messageFor(p.loc, p.time, raws[p.loc], todayKey, offset);
    return send(key, rec, messages[id]);
  });
  console.log(`${runKey}: ${jobs.length} messages, ${results.filter(r => r === 'sent').length} sent`);
};

export const config = { schedule: '0 0,10,11,23 * * *' };
