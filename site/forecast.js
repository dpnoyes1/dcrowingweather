// DC Rowing Weather: data loading, summaries and the race course model.
// Shared by the page (index.html) and the notification functions (netlify/functions).

// ---------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------
const TZ = 'America/New_York';
const FORECAST_DAYS = 5;
const REFRESH_MINUTES = 15;

// Practice windows (decimal hours, Eastern)
const TIMES = {
  morning:   { label: 'Morning',   start: 5.5, end: 7.5,  text: '5:30&ndash;7:30 AM' },
  afternoon: { label: 'Afternoon', start: 15,  end: 18,   text: '3&ndash;6 PM' },
  evening:   { label: 'Evening',   start: 17.5, end: 19.5, text: '5:30&ndash;7:30 PM' }
};

// Median monthly flow, Jan..Dec, cfs (1996–2025)
const LITTLE_FALLS_MEDIAN = [12360, 14360, 19020, 16890, 17505, 8733, 3823, 3156, 2518, 4177, 5073, 8492];
// Northeast Branch (01649500) + Northwest Branch (01651000 record) combined
const ANACOSTIA_MEDIAN = [148, 179, 187, 163, 138, 129, 102, 95, 82, 123, 94, 159];

// Each location: weather point, tide station, river gauges, 2000 m course
// (start/finish only set direction), and how the course model behaves there.
//   sense:       +1 = course rows downstream, -1 = upstream, 0 = no current
//   channelArea: river cross-section (m²); bigger = flow moves the water less
//   tidePeak:    tidal current at mid-ebb / mid-flood (m/s)
const LOCATIONS = {
  upper: {
    label: 'Upper Potomac', place: 'Georgetown waterfront',
    lat: 38.9015, lon: -77.0600,
    tide: { id: '8594900', name: 'Washington, DC' },
    flow: { sites: ['01646500'], name: 'USGS Little Falls', nwps: 'BRKM2', median: LITTLE_FALLS_MEDIAN },
    course: { start: [38.903394617433456, -77.08442775640597], finish: [38.8999463567322, -77.0613538203245],
              sense: 1, channelArea: 1800, tidePeak: 0.15 },
    markers: [
      [[38.900527, -77.0583371], 'Thompson Boat Center', 'left', [-6, 0]],
      [[38.9041311, -77.0701648], 'Potomac Boat Club', 'top', [0, -6]]
    ],
    // Thompson's on the right, a bit above middle, about 2.4 km of river to its left
    frame: { anchor: [38.900527, -77.0583371], fx: 0.8, fy: 0.38, meters: 2400 }
  },
  lower: {
    label: 'Lower Potomac', place: 'Dee Campbell Rowing Center, Alexandria',
    lat: 38.8121, lon: -77.0379,
    tide: { id: '8634214', name: 'Alexandria, VA' },
    flow: { sites: ['01646500'], name: 'USGS Little Falls', nwps: 'BRKM2', median: LITTLE_FALLS_MEDIAN },
    // Wide, deep river here: flow barely moves the water, tide does most of it
    course: { start: [38.79928976829386, -77.03877487397294], finish: [38.8118342155035, -77.0369929878263],
              sense: -1, channelArea: 9000, tidePeak: 0.25 },
    markers: [[[38.8120961, -77.0378564], 'Dee Campbell Rowing Center', 'left', [-6, 0]]],
    // Map center and how many meters show across the box
    view: { center: [38.8045, -77.0435], width: 4000 }
  },
  anacostia: {
    label: 'Anacostia', place: 'Anacostia Community Boathouse',
    lat: 38.8786, lon: -76.9756,
    tide: { id: '8593005', name: 'Washington Navy Yard' },
    flow: { sites: ['01649500', '01651003'], name: 'USGS NE + NW Branch', nwps: null, median: ANACOSTIA_MEDIAN },
    // Very little river flow; tide is effectively the whole current
    course: { start: [38.86922707532398, -76.9943412213138], finish: [38.87751302674171, -76.9742139242965],
              sense: -1, channelArea: 1500, tidePeak: 0.12 },
    markers: [[[38.8785995, -76.9756351], 'Anacostia Community Boathouse', 'top', [0, -6]]],
    view: { center: [38.8735, -76.9790], width: 3400 }
  },
  occoquan: {
    label: 'Occoquan', place: 'Sandy Run Regional Park',
    lat: 38.7103, lon: -77.3039,
    tide: null,      // reservoir: no tides
    flow: null,      // no live gauge for water over the dam; rain is used as a signal instead
    spill: true,
    course: { start: [38.695410019858926, -77.27719178455584], finish: [38.70470908066666, -77.29828234994132],
              sense: 0, channelArea: Infinity, tidePeak: 0 },
    markers: [
      [[38.7103173, -77.3039037], 'Sandy Run Regional Park', 'top', [0, -6]],
      [[38.6966835, -77.3178062], 'Oxford Boathouse', 'right', [6, 0]]
    ],
    view: { center: [38.7020, -77.2985], width: 4600 }
  }
};

// Rain over the 3 days before practice that suggests the Occoquan dam may be spilling
const SPILL_RAIN_INCHES = 1.0;

// Course model. Physics-based estimates, not yet calibrated to race results.
const MODEL = {
  boatSpeed: 2000 / 375, // m/s: an eight rowing 6:15 for 2K in flat, calm water
  aeroShare: 0.08,       // share of a crew's effort spent pushing through still air
  crossFree: 8,          // mph of crosswind before it starts costing time
  crossCost: 0.4,        // seconds per mph of crosswind above that
  gustFree: 20,          // mph peak gust before chop starts costing time
  gustCost: 0.3,         // seconds per mph of gust above that
  band: 1.25             // seconds per 500 m either side of a typical day that still counts as Typical
};
const COURSE_METERS = 2000;
// ---------------------------------------------------------------

// ---------- Time helpers (everything is pinned to Eastern) ----------

const etParts = (ms) => {
  const p = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return p;
};
const etKey = (ms) => { const p = etParts(ms); return `${p.year}-${p.month}-${p.day}`; };
const etStamp = (ms) => { const p = etParts(ms); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };
const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// Eastern wall-clock time on a date -> UTC ms (hours may be decimal)
const etToMs = (key, hours) => {
  const h = Math.floor(hours), min = Math.round((hours - h) * 60);
  const [y, m, d] = key.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  const p = etParts(guess);
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return guess + (guess - asIfUtc);
};
const dayLabel = (key, opts) => new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
// "15:31" -> "3:31 PM"
const clock = (hhmm) => {
  let [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
};
// 17.5 -> "17:30"
const hhmm = (hours) => `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.round((hours % 1) * 60)).padStart(2, '0')}`;
// 17.5 -> "5:30 PM", 15 -> "3 PM"
const hourLabel = (hours) => clock(hhmm(hours)).replace(':00', '');

// ---------- Small math helpers ----------

const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const max = (a) => a.length ? Math.max(...a) : null;
const clean = (a) => a.filter(x => typeof x === 'number' && !isNaN(x));
const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const compass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
// Vector average of wind direction, weighted by speed
const avgDirection = (dirs, speeds) => {
  let x = 0, y = 0;
  dirs.forEach((d, i) => { const w = speeds[i] || 0.1; x += Math.sin(d * Math.PI / 180) * w; y += Math.cos(d * Math.PI / 180) * w; });
  if (!x && !y) return null;
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
};
const angleDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const uvLabel = (uv) => uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : uv < 11 ? 'Very high' : 'Extreme';
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const toRad = (d) => d * Math.PI / 180;

const bearing = ([lat1, lon1], [lat2, lon2]) => {
  const [la1, lo1, la2, lo2] = [lat1, lon1, lat2, lon2].map(toRad);
  const y = Math.sin(lo2 - lo1) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// ---------- Data sources ----------

const IN_BROWSER = typeof window !== 'undefined';
async function getJSON(url) {
  // api.weather.gov asks server callers to identify themselves
  const r = await fetch(url, IN_BROWSER ? { cache: 'no-store' }
    : { headers: { 'User-Agent': '(dcrowingweather.netlify.app, DC Rowing Weather)', Accept: 'application/geo+json, application/json' },
        signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(r.status + ' from ' + new URL(url).host);
  return r.json();
}

// Hourly weather plus sunrise/sunset (Open-Meteo, which blends NOAA models for
// the US). Includes the past 3 days so recent rain can be totaled.
function loadWeather(loc) {
  const vars = 'temperature_2m,precipitation_probability,precipitation,uv_index,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code';
  return getJSON('https://api.open-meteo.com/v1/forecast'
    + `?latitude=${loc.lat}&longitude=${loc.lon}&hourly=${vars}&daily=sunrise,sunset`
    + '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch'
    + `&timezone=${encodeURIComponent(TZ)}&past_days=3&forecast_days=${FORECAST_DAYS + 1}`);
}

// High/low tide predictions (NOAA CO-OPS), local time
function loadTides(loc, todayKey) {
  if (!loc.tide) return Promise.resolve(null);
  const start = addDays(todayKey, -1).replace(/-/g, '');
  const end = addDays(todayKey, FORECAST_DAYS + 1).replace(/-/g, '');
  return getJSON('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
    + `?product=predictions&station=${loc.tide.id}&begin_date=${start}&end_date=${end}`
    + '&datum=MLLW&interval=hilo&units=english&time_zone=lst_ldt&format=json&application=dcrowingweather');
}

// Latest river flow, summed across the location's gauges
async function loadRiverNow(loc) {
  if (!loc.flow) return null;
  const one = async (site) => {
    try {
      const j = await getJSON('https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items'
        + `?f=json&monitoring_location_id=USGS-${site}&parameter_code=00060`);
      const p = j.features[0].properties;
      if (p.value == null) throw new Error('no value');
      return { cfs: Number(p.value), ms: Date.parse(p.time) };
    } catch (e) {
      const j = await getJSON('https://waterservices.usgs.gov/nwis/iv/'
        + `?format=json&sites=${site}&parameterCd=00060&siteStatus=all`);
      const v = j.value.timeSeries[0].values[0].value.slice(-1)[0];
      return { cfs: Number(v.value), ms: Date.parse(v.dateTime) };
    }
  };
  const readings = await Promise.all(loc.flow.sites.map(one));
  return { cfs: readings.reduce((s, r) => s + r.cfs, 0), ms: Math.min(...readings.map(r => r.ms)) };
}

// River flow forecast (NWS via NWPS), where one exists
async function loadRiverForecast(loc) {
  if (!loc.flow || !loc.flow.nwps) return [];
  const j = await getJSON(`https://api.water.noaa.gov/nwps/v1/gauges/${loc.flow.nwps}/stageflow`);
  const toCfs = (pt, units) => units === 'kcfs' ? pt.secondary * 1000 : pt.secondary;
  return (j.forecast && j.forecast.data || [])
    .filter(pt => typeof pt.secondary === 'number' && pt.secondary >= 0)
    .map(pt => ({ ms: Date.parse(pt.validTime), cfs: toCfs(pt, j.forecast.secondaryUnits) }))
    .sort((a, b) => a.ms - b.ms);
}

// NWS text forecast + active alerts, for the storm / front notes
async function loadNws(loc) {
  const point = await getJSON(`https://api.weather.gov/points/${loc.lat},${loc.lon}`);
  const [fc, alerts] = await Promise.all([
    getJSON(point.properties.forecast),
    getJSON(`https://api.weather.gov/alerts/active?point=${loc.lat},${loc.lon}`).catch(() => ({ features: [] }))
  ]);
  return { periods: fc.properties.periods, alerts: alerts.features || [] };
}

// ---------- Per-day summaries ----------

// Index into the hourly arrays for a local time on a date (decimal; -1 if missing)
function hourIndex(wx, key, hours) {
  const i = wx.hourly.time.indexOf(`${key}T${String(Math.floor(hours)).padStart(2, '0')}:00`);
  return i < 0 ? -1 : i + (hours % 1);
}
// Value at a (possibly fractional) index, interpolating between hours
function valueAt(arr, fi) {
  const i = Math.floor(fi), f = fi - i;
  const a = arr[i], b = arr[i + 1];
  if (typeof a !== 'number') return null;
  if (!f || typeof b !== 'number') return a;
  return a + (b - a) * f;
}

// Window averages, sampled every 30 minutes. Rain amount is the total over
// the window (each hourly value is the rain in the hour before it).
function summarizeWeather(wx, key, T) {
  const h = wx.hourly;
  const samples = [];
  for (let t = T.start; t <= T.end + 1e-9; t += 0.5) {
    const fi = hourIndex(wx, key, t);
    if (fi >= 0) samples.push(fi);
  }
  if (!samples.length) return null;
  const pick = (name) => clean(samples.map(fi => valueAt(h[name], fi)));
  const pickNearest = (name) => clean(samples.map(fi => h[name][Math.round(fi)]));

  const temps = pick('temperature_2m');
  const speeds = pick('wind_speed_10m');
  const dirs = pickNearest('wind_direction_10m');
  const codes = pickNearest('weather_code');

  // Rain inside the window: overlap of each hour [H-1, H] with [start, end]
  let rain = 0;
  for (let H = Math.floor(T.start) + 1; H <= Math.ceil(T.end); H++) {
    const i = hourIndex(wx, key, H);
    if (i < 0) continue;
    const overlap = Math.max(0, Math.min(H, T.end) - Math.max(H - 1, T.start));
    rain += (h.precipitation[i] || 0) * overlap;
  }

  // Rain in the 72 hours before practice (Occoquan dam spill signal)
  const startIdx = Math.floor(hourIndex(wx, key, T.start));
  let rain72 = null;
  if (startIdx >= 72) rain72 = h.precipitation.slice(startIdx - 72, startIdx).reduce((s, x) => s + (x || 0), 0);

  const di = wx.daily.time.indexOf(key);
  return {
    temp: avg(temps), tempFirst: temps[0], tempLast: temps[temps.length - 1],
    precipChance: max(pick('precipitation_probability')),
    precipAmount: rain,
    rain72,
    uv: avg(pick('uv_index')),
    wind: avg(speeds),
    gust: max(pick('wind_gusts_10m')),
    dir: avgDirection(dirs, speeds),
    dirFirst: dirs[0], dirLast: dirs[dirs.length - 1],
    speedFirst: speeds[0], speedLast: speeds[speeds.length - 1],
    thunder: codes.some(c => c >= 95),
    heavyRain: codes.some(c => c === 65 || c === 82),
    sunrise: di >= 0 ? wx.daily.sunrise[di].slice(11) : null,
    sunset: di >= 0 ? wx.daily.sunset[di].slice(11) : null
  };
}

// Sun times (UTC ms) when the sun's center is at altitude h0 degrees, from the
// standard sunrise equation. -0.833 = sunrise/sunset, -6 = civil twilight.
function sunTimes(key, lat, lon, h0) {
  const r = Math.PI / 180;
  const [y, m, d] = key.split('-').map(Number);
  const jd = Date.UTC(y, m - 1, d, 12) / 86400000 + 2440587.5;
  const n = Math.floor(jd - 2451545.0 + 0.0008);   // whole days since J2000 at this date's noon
  const Jstar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * r) + 0.02 * Math.sin(2 * M * r) + 0.0003 * Math.sin(3 * M * r);
  const lam = (M + C + 180 + 102.9372) % 360;
  const Jt = 2451545.0 + Jstar + 0.0053 * Math.sin(M * r) - 0.0069 * Math.sin(2 * lam * r);
  const dec = Math.asin(Math.sin(lam * r) * Math.sin(23.4397 * r));
  const cosW = (Math.sin(h0 * r) - Math.sin(lat * r) * Math.sin(dec)) / (Math.cos(lat * r) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return null;
  const w = Math.acos(cosW) / r;
  const ms = (j) => (j - 2440587.5) * 86400000;
  return { rise: ms(Jt - w / 360), set: ms(Jt + w / 360) };
}

// Daylight during the window. "Dark" is civil twilight (sun 6° below the
// horizon), when there's no longer enough natural light to see well, not
// sunrise/sunset. Sunrise/sunset is the main figure, with first/last light
// under it; afternoons only when last light comes before practice ends (winter).
function lightFor(key, loc, T, timeKey) {
  const sun = sunTimes(key, loc.lat, loc.lon, -0.833), civ = sunTimes(key, loc.lat, loc.lon, -6);
  if (!sun || !civ) return null;
  const t = (ms) => clock(etStamp(ms).slice(11));
  const winS = etToMs(key, T.start), winE = etToMs(key, T.end);
  if (timeKey === 'morning') {
    const dawn = civ.rise;
    const note = dawn >= winE ? 'Dark the whole window' : dawn > winS ? `Dark until ${t(dawn)}` : 'Light the whole window';
    return { label: 'Sunrise', time: t(sun.rise), sub: `First light ${t(dawn)}`, note };
  }
  if (timeKey === 'evening' || civ.set < winE) {
    const dusk = civ.set;
    const note = dusk <= winS ? 'Dark the whole window' : dusk < winE ? `Dark after ${t(dusk)}` : 'Light the whole window';
    return { label: 'Sunset', time: t(sun.set), sub: `Last light ${t(dusk)}`, note };
  }
  return null;
}

// Which way the water moves during practice. Rising = flood (upstream),
// falling = ebb (downstream).
function summarizeTide(tides, key, T) {
  const ev = tides.map(t => ({ stamp: t.t, type: t.type }));
  const start = `${key} ${hhmm(T.start)}`, end = `${key} ${hhmm(T.end)}`;
  const next = ev.find(e => e.stamp >= start);
  if (!next) return null;
  const turns = ev.filter(e => e.stamp >= start && e.stamp <= end);
  const rising = next.type === 'H';
  const name = (e) => (e.type === 'H' ? 'High' : 'Low');
  const sameDay = next.stamp.slice(0, 10) === key;
  const when = clock(next.stamp.slice(11)) + (sameDay ? '' : ' ' + dayLabel(next.stamp.slice(0, 10), { weekday: 'short' }));
  let flow;
  if (!turns.length) flow = rising ? 'Rising (incoming) all practice' : 'Falling (outgoing) all practice';
  else {
    flow = (rising ? 'Rising' : 'Falling') + ' until ' + clock(turns[0].stamp.slice(11)) + ', then ' + (rising ? 'falling' : 'rising');
    if (turns.length > 1) flow += ' again';
  }
  return { headline: `${name(next)} @ ${when}`, short: name(next) + ' ' + when, flow };
}

// Tide push during practice: -1 (mid-flood) to +1 (mid-ebb), strongest
// halfway between a high and a low, near zero at the turn.
function tideFactor(tides, key, T) {
  const mins = (stamp) => Date.parse(stamp.replace(' ', 'T') + 'Z') / 60000;
  const ev = tides.map(t => ({ m: mins(t.t), type: t.type }));
  const samples = [];
  for (let h = T.start * 60; h <= T.end * 60; h += 15) {
    const m = mins(`${key} ${hhmm(h / 60)}`);
    const prev = [...ev].reverse().find(e => e.m <= m), next = ev.find(e => e.m > m);
    if (!prev || !next) continue;
    const frac = (m - prev.m) / (next.m - prev.m);
    samples.push((next.type === 'L' ? 1 : -1) * Math.sin(Math.PI * frac));
  }
  return samples.length ? avg(samples) : null;
}

// River forecast interpolated to a moment (6 hours of slack past either end)
function riverAt(points, ms) {
  if (!points.length) return null;
  if (ms < points[0].ms || ms > points[points.length - 1].ms) {
    const nearest = ms < points[0].ms ? points[0] : points[points.length - 1];
    return Math.abs(nearest.ms - ms) <= 6 * 3600e3 ? nearest.cfs : null;
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (ms <= b.ms) return a.cfs + (b.cfs - a.cfs) * (ms - a.ms) / (b.ms - a.ms || 1);
  }
  return null;
}

// Storm / front / dam notes for a day's window
function flagsFor(key, w, nws, T, loc) {
  const flags = [];
  const winStart = etToMs(key, T.start), winEnd = etToMs(key, T.end);

  if (nws) {
    nws.alerts.forEach(a => {
      const p = a.properties;
      const on = Date.parse(p.onset || p.effective), off = Date.parse(p.ends || p.expires);
      if (on <= winEnd && (isNaN(off) || off >= winStart)) flags.push(`<strong>${esc(p.event)}</strong> in effect`);
    });
    // NWS text forecast periods that overlap the window
    const hits = [];
    nws.periods.forEach(p => {
      if (Date.parse(p.startTime) > winEnd || Date.parse(p.endTime) < winStart) return;
      p.detailedForecast.split(/(?<=\.)\s+/)
        .filter(s => /thunder|severe|cold front|warm front|\bfront\b|strong storm|damaging/i.test(s))
        .forEach(s => { if (!hits.includes(s)) hits.push(s); });
    });
    if (hits.length) flags.push(`<strong>NWS:</strong> ${esc(hits.join(' '))}`);
  }

  if (w) {
    if (w.thunder) flags.push(`<strong>Thunderstorms</strong> in the model forecast for ${T.text}`);
    else if (w.heavyRain) flags.push(`<strong>Heavy rain</strong> in the model forecast for ${T.text}`);
    const drop = w.tempFirst - w.tempLast;
    const shift = (w.dirFirst != null && w.dirLast != null) ? angleDiff(w.dirFirst, w.dirLast) : 0;
    if (drop >= 7) {
      flags.push(`<strong>Possible front:</strong> temperature drops about ${Math.round(drop)}&deg; during practice`);
    } else if (shift >= 90 && w.speedLast >= 8 && w.speedLast > w.speedFirst) {
      flags.push(`<strong>Possible front:</strong> wind shifts to ${compass(w.dirLast)} and picks up to ${Math.round(w.speedLast)} mph`);
    }
    if (loc.spill && w.rain72 != null && w.rain72 >= SPILL_RAIN_INCHES) {
      flags.push(`<strong>Dam may be spilling:</strong> about ${w.rain72.toFixed(1)} in of rain in the 3 days before practice`);
    }
  }
  return flags;
}

// ---------- Race course model ----------

// Boat speed through the water (m/s) with a wind component along the course
// (m/s, positive = tailwind), holding the crew's power constant.
function boatSpeed(windAlong) {
  const v0 = MODEL.boatSpeed, a = MODEL.aeroShare, w = windAlong / v0;
  const power = (x) => (1 - a) * x ** 3 + a * x * (x - w) * Math.abs(x - w);
  let lo = 0.5, hi = 1.6;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (power(mid) < 1) lo = mid; else hi = mid; }
  return v0 * (lo + hi) / 2;
}

// Seconds for the course. Downstream current (river flow plus ebb) is
// positive; `sense` turns that into help (+1, downstream course) or
// hindrance (-1, upstream course).
function courseSeconds(c, { windAlong = 0, cross = 0, gust = 0, flow = 0, tide = 0 }) {
  const downstream = (flow / 35.3147) / c.channelArea + c.tidePeak * tide;
  let t = COURSE_METERS / (boatSpeed(windAlong) + c.sense * downstream);
  t += Math.max(0, cross - MODEL.crossFree) * MODEL.crossCost;
  t += Math.max(0, gust - MODEL.gustFree) * MODEL.gustCost;
  return t;
}

// Fast / Typical / Slow versus a typical day at this location this month
function coursePrediction(loc, w, tide, flow, key) {
  if (!w || w.dir == null) return null;
  const c = { ...loc.course, heading: bearing(loc.course.start, loc.course.finish) };
  const month = Number(key.slice(5, 7));
  const median = loc.flow ? loc.flow.median[month - 1] : 0;
  const q = loc.flow ? (flow != null ? flow : median) : 0;
  const tf = loc.tide && tide != null ? tide : 0;

  const rel = toRad((w.dir + 180) % 360 - c.heading);   // wind blows TOWARD dir+180
  const alongMph = w.wind * Math.cos(rel);
  const crossMph = Math.abs(w.wind * Math.sin(rel));
  const windMs = alongMph * 0.44704;
  const all = { windAlong: windMs, cross: crossMph, gust: w.gust, flow: q, tide: tf };

  const typical = courseSeconds(c, { flow: median });
  const diff = courseSeconds(c, all) - typical;

  const parts = [
    { s: courseSeconds(c, { windAlong: windMs, cross: crossMph, gust: w.gust, flow: median }) - typical,
      text: alongMph >= 1 ? `${Math.round(alongMph)} mph tailwind`
          : alongMph <= -1 ? `${Math.round(-alongMph)} mph headwind`
          : `${Math.round(crossMph)} mph crosswind` },
    { s: courseSeconds(c, { flow: median, tide: tf }) - typical, text: tf > 0 ? 'outgoing tide' : 'incoming tide' },
    { s: courseSeconds(c, { flow: q }) - typical, text: q >= median ? 'high flow' : 'low flow' }
  ].filter(p => Math.abs(p.s) >= 1.5).sort((a, b) => Math.abs(b.s) - Math.abs(a.s));
  // Dam spill can't be measured, so it's listed without changing the rating
  const spill = loc.spill && w.rain72 != null && w.rain72 >= SPILL_RAIN_INCHES;

  const perSplit = (d) => d * 500 / COURSE_METERS;
  const splitDiff = perSplit(diff);
  const label = splitDiff <= -MODEL.band ? 'FAST' : splitDiff >= MODEL.band ? 'SLOW' : 'TYPICAL';

  const flat = COURSE_METERS / MODEL.boatSpeed;
  const flatDiff = courseSeconds(c, all) - flat;
  const split = (d) => { const v = Math.abs(perSplit(d)); return v < 0.05 ? null : `${v.toFixed(1)} s/500 ${d < 0 ? 'faster' : 'slower'}`; };
  const monthLong = dayLabel(key, { month: 'long' }), monthShort = dayLabel(key, { month: 'short' });
  const hasCurrent = c.sense !== 0;

  const helps = parts.filter(p => p.s < 0).map(p => p.text);
  const hurts = parts.filter(p => p.s > 0).map(p => p.text).concat(spill ? ['possible dam spill'] : []);
  const why = [
    helps.length ? cap(helps.join(', ')) + ' help' + (helps.length === 1 ? 's' : '') : '',
    hurts.length ? (helps.length ? hurts.join(', ') : cap(hurts.join(', '))) + ' slow' + (hurts.length === 1 ? 's' : '') + ' it' : ''
  ].filter(Boolean).join('; ') || 'Close to normal conditions';

  // Day boxes: one sentence. With no current, "typical" is flatwater.
  const vs = split(diff)
    ? `${split(diff)} than ${hasCurrent ? `a typical ${monthLong} day` : 'flatwater, calm'}`
    : (hasCurrent ? 'About the same as a typical day' : 'About the same as flatwater, calm');

  return {
    label, cls: label.toLowerCase(), vs, why, hasCurrent,
    kind: c.sense > 0 ? 'Downstream 2K' : c.sense < 0 ? 'Upstream 2K' : '2K',
    short: {
      month: monthShort,
      vsTypical: split(diff) || 'Even',
      vsFlat: split(flatDiff) || 'Even',
      helping: helps.map(cap).join('<br>'),
      slowing: hurts.map(cap).join('<br>')
    }
  };
}


// ---------- Putting a location's data together ----------

// Everything one location needs, fetched in parallel; a failed source is null
function loadRaw(loc, todayKey) {
  return Promise.allSettled([
    loadWeather(loc), loadTides(loc, todayKey), loadRiverNow(loc), loadRiverForecast(loc), loadNws(loc)
  ]).then(results => {
    results.forEach(r => { if (r.status === 'rejected') console.error(r.reason); });
    const val = (r) => r.status === 'fulfilled' ? r.value : null;
    return { wx: val(results[0]), tides: val(results[1]), riverNow: val(results[2]), riverFc: val(results[3]) || [], nws: val(results[4]) };
  });
}

// Today plus the next FORECAST_DAYS days for one location and practice window
function buildDays(loc, timeKey, raw, todayKey) {
  const T = TIMES[timeKey];
  const { wx, tides, riverNow, riverFc, nws } = raw;
  const tideList = tides && tides.predictions ? tides.predictions : null;
  const keys = Array.from({ length: FORECAST_DAYS + 1 }, (_, i) => addDays(todayKey, i));
  const midHours = (T.start + T.end) / 2;
  return keys.map((key, i) => {
    const w = wx ? summarizeWeather(wx, key, T) : null;
    const river = loc.flow ? riverAt(riverFc, etToMs(key, midHours)) : null;
    // Course flow: today's reading, else the forecast, else hold today's reading
    let courseFlow = river, riverHeld = null;
    if (i === 0 && riverNow) courseFlow = riverNow.cfs;
    else if (courseFlow == null && riverNow) { courseFlow = riverNow.cfs; riverHeld = riverNow.cfs; }
    return {
      key, w, river, riverHeld,
      light: lightFor(key, loc, T, timeKey),
      tide: tideList ? summarizeTide(tideList, key, T) : null,
      course: coursePrediction(loc, w, tideList ? tideFactor(tideList, key, T) : null, courseFlow, key),
      flags: flagsFor(key, w, nws, T, loc)
    };
  });
}

// ---------- Notification text ----------

const plain = (html) => String(html)
  .replace(/<[^>]*>/g, '')
  .replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '\u2014').replace(/&middot;/g, '\u00b7')
  .replace(/&deg;/g, '\u00b0').replace(/&amp;/g, '&').replace(/&rsquo;/g, '\u2019')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// One practice's forecast as a short push notification
function notificationText(locKey, timeKey, day, whenWord) {
  const loc = LOCATIONS[locKey], T = TIMES[timeKey];
  const { w, tide, course, flags, light } = day;
  const title = `${loc.label} \u00b7 ${whenWord} ${plain(T.text)}`;
  const bits = [];
  if (flags.length) bits.push('\u26a0\ufe0f ' + flags.map(plain).join('; ') + '.');
  if (w) {
    bits.push(`${Math.round(w.temp)}\u00b0F, ${Math.round(w.precipChance)}% rain`
      + (w.dir != null ? `, ${compass(w.dir)} ${Math.round(w.wind)} mph gusting ${Math.round(w.gust)}.` : '.'));
  }
  if (course) bits.push(`Course ${course.label}.`);
  if (tide) bits.push(`${plain(tide.short)}.`);
  if (light && timeKey !== 'afternoon') bits.push(`${light.label} ${light.time}.`);
  if (!w) return { title, body: 'Forecast unavailable right now. Open the app for details.' };
  return { title, body: bits.join(' ') };
}

export {
  ANACOSTIA_MEDIAN,
  COMPASS,
  COURSE_METERS,
  FORECAST_DAYS,
  LITTLE_FALLS_MEDIAN,
  LOCATIONS,
  MODEL,
  REFRESH_MINUTES,
  SPILL_RAIN_INCHES,
  TIMES,
  TZ,
  addDays,
  angleDiff,
  avg,
  avgDirection,
  bearing,
  boatSpeed,
  buildDays,
  cap,
  clean,
  clock,
  compass,
  coursePrediction,
  courseSeconds,
  dayLabel,
  esc,
  etKey,
  etParts,
  etStamp,
  etToMs,
  flagsFor,
  fmtInt,
  getJSON,
  hhmm,
  hourIndex,
  hourLabel,
  lightFor,
  loadNws,
  loadRaw,
  loadRiverForecast,
  loadRiverNow,
  loadTides,
  loadWeather,
  max,
  notificationText,
  plain,
  riverAt,
  summarizeTide,
  summarizeWeather,
  sunTimes,
  tideFactor,
  toRad,
  uvLabel,
  valueAt
};
