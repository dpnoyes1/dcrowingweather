# Is Whitman Rowing Today?

Static site for https://iswhitmanrowingtoday.com, hosted on Netlify. No build step: Netlify publishes this folder as-is.

| Path | What it is |
|---|---|
| `index.html` | Today/Tomorrow practice status, driven by the "Is Whitman Rowing Today Website" Google Sheet |
| `weather/index.html` | Unlisted practice-weather page (`/weather`). Not linked from the home page. |

## /weather data sources
All fetched in the browser; no API keys.

- **Weather** (temp, rain, UV, wind, gusts, direction): Open-Meteo hourly forecast for the Georgetown waterfront, averaged over 3–6 PM Eastern (gusts = peak, rain chance = highest hour).
- **Storm / front notes**: NWS active alerts and text forecast (api.weather.gov), plus thunderstorm codes, sharp temperature drops, or big wind shifts in the hourly forecast.
- **Tides**: NOAA CO-OPS station 8594900 (Washington, DC) high/low predictions. Rising = incoming, falling = outgoing.
- **River flow now**: USGS 01646500, Potomac River at Little Falls.
- **River flow forecast**: NWS river forecast point BRKM2 (same gauge), about 3 days out.
- **Race course rating** (Fast / Typical / Slow): estimated 2K time for an eight on the downstream course (start 38.9034, -77.0844 to finish 38.8999, -77.0614), from river flow, tide stage and wind along/across the course. Compared with a typical day for the month (1996–2025 median Little Falls flow, no wind, slack tide); Fast/Slow = 5+ seconds different. Model settings are in `MODEL` in `weather/index.html`.

Settings (location, station IDs, practice window) are at the top of the script in `weather/index.html`.
