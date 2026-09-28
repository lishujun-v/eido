---
name: weather
description: Get current weather and forecasts from wttr.in or Open-Meteo without an API key.
---

# Weather

Use `web_fetch` when possible; use `exec` with `curl` only when raw output is useful.

Primary: `https://wttr.in/<url-encoded-location>?format=%l:+%c+%t+%h+%w`

- Add `?m` for metric or `?u` for US units.
- Use `?1` for today and `?0` for current conditions.
- For structured results, use Open-Meteo geocoding followed by its forecast API.

Include the location, units, forecast time, and timezone. Say when a location is ambiguous instead of guessing.
