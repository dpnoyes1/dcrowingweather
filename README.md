# DC Rowing Weather

Site and installable web app at https://dcrowingweather.netlify.app, hosted on Netlify (project `dcrowingweather`). No build command: Netlify publishes `site/` as-is and bundles the functions in `netlify/functions/`.

`site/index.html` shows practice weather for four locations (Upper Potomac, Lower Potomac, Anacostia, Occoquan) and three windows (Morning 5:30–7:30 AM, Afternoon 3–6 PM, Evening 5:30–7:30 PM). Links can pick both: `?loc=upper|lower|anacostia|occoquan&time=morning|afternoon|evening`. The chosen location loads first; the others' data and map tiles load in the background so switching is instant.

## Data sources
All fetched in the browser; no API keys.

- **Weather** (temp, rain, UV, wind, gusts, direction, sunrise/sunset): Open-Meteo, averaged over the selected window (gusts = peak, rain chance = highest).
- **Storm / front notes**: NWS alerts and text forecast (api.weather.gov), plus thunderstorm codes, sharp temperature drops, or big wind shifts.
- **Tides**: NOAA CO-OPS high/low predictions: 8594900 Washington, DC (Upper Potomac), 8634214 Alexandria (Lower Potomac), 8593005 Washington Navy Yard (Anacostia). None for the Occoquan.
- **River flow**: USGS 01646500 Little Falls (Potomac); 01649500 NE Branch + 01651003 NW Branch (Anacostia). Forecast: NWS point BRKM2.
- **Occoquan dam spill flag**: 3-day rain of 1 inch or more (no live dam gauge).
- **First / last light**: civil twilight, calculated in the page.

## Race course rating (Fast / Typical / Slow)
Estimated 2000 m time for an eight from flow, tide stage and wind along/across each course, shown as seconds per 500 m against a typical day for the month (median flow, no wind, slack tide). Lower Potomac and Anacostia are tide-dominated; the Occoquan is rated on wind only. Course points and model settings are in `LOCATIONS` and `MODEL` near the top of `site/forecast.js`.

## Files
| Path | What it is |
|---|---|
| `site/index.html` | The page: layout, map, toggles, notification settings |
| `site/forecast.js` | Data loading, summaries and the course model, shared by the page and the functions |
| `site/sw.js`, `site/manifest.webmanifest`, `site/icons/` | What makes it installable (Add to Home Screen) and able to show notifications |
| `netlify/functions/` | `subscription` (save/remove a phone's settings), `test` (send a sample), `alert` (one-off alerts), `daily` (scheduled sends) |
| `netlify/lib/push.js` | Shared helpers for the functions |

## Notifications
People add the app to their Home Screen, tap **Notifications**, and pick practices (location, window, days). Settings are stored per phone in Netlify Blobs; no accounts.

- **7 PM Eastern:** tomorrow's forecast for morning practices.
- **6 AM Eastern:** today's forecast for afternoon and evening practices.
- Nothing is sent on days a person didn't pick.

The `daily` function is scheduled at 0, 10, 11 and 23 UTC (covers both daylight and standard time) and exits unless it's 6 AM or 7 PM Eastern.

**One-off alert:**

```
curl -X POST https://dcrowingweather.netlify.app/api/alert \
  -H "x-alert-key: $ALERT_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Upper Potomac closed","body":"Harbor patrol has closed the river this afternoon.","loc":"upper"}'
```

Leave out `loc` to send to everyone.

**Netlify environment variables:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (push signing keys; the public key is also in `site/index.html`), `ALERT_KEY` (secret for one-off alerts), optional `VAPID_SUBJECT`.
