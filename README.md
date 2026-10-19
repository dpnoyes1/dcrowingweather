# DC Rowing Weather

Static site for https://dcrowingweather.netlify.app, hosted on Netlify (project `dcrowingweather`). No build step: Netlify publishes this folder as-is. The practice status site (iswhitmanrowingtoday.com) lives in its own repo and redirects its old `/weather` links here.

`index.html` shows practice weather for four locations (Upper Potomac, Lower Potomac, Anacostia, Occoquan) and three windows (Morning 5:30–7:30 AM, Afternoon 3–6 PM, Evening 5:30–7:30 PM). Links can pick both: `?loc=upper|lower|anacostia|occoquan&time=morning|afternoon|evening`. The chosen location loads first; the others' data and map tiles load in the background so switching is instant.

## Data sources
All fetched in the browser; no API keys.

- **Weather** (temp, rain, UV, wind, gusts, direction, sunrise/sunset): Open-Meteo, averaged over the selected window (gusts = peak, rain chance = highest).
- **Storm / front notes**: NWS alerts and text forecast (api.weather.gov), plus thunderstorm codes, sharp temperature drops, or big wind shifts.
- **Tides**: NOAA CO-OPS high/low predictions: 8594900 Washington, DC (Upper Potomac), 8634214 Alexandria (Lower Potomac), 8593005 Washington Navy Yard (Anacostia). None for the Occoquan.
- **River flow**: USGS 01646500 Little Falls (Potomac); 01649500 NE Branch + 01651003 NW Branch (Anacostia). Forecast: NWS point BRKM2.
- **Occoquan dam spill flag**: 3-day rain of 1 inch or more (no live dam gauge).
- **First / last light**: civil twilight, calculated in the page.

## Race course rating (Fast / Typical / Slow)
Estimated 2000 m time for an eight from flow, tide stage and wind along/across each course, shown as seconds per 500 m against a typical day for the month (median flow, no wind, slack tide). Lower Potomac and Anacostia are tide-dominated; the Occoquan is rated on wind only. Course points and model settings are in `LOCATIONS` and `MODEL` near the top of the script.
