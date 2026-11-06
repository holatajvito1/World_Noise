# World Noise

Listen to live radio from anywhere in the world: pick a country, state or region, or just click a spot on the map.

## Features
- 🗺 **World map** of tens of thousands of stations, clustered by location
- 📍 **Click anywhere on the map** to find stations near that spot
- 🌍 **Country → state/region** filters (e.g. United States → Texas), plus genre and name search
- ★ **Favorites** saved in your browser
- 🎲 **Surprise me**: plays a random station from your current selection
- Works on phones too, with lock-screen controls via the Media Session API

## Run it
It's a plain static site with no build step:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or host it for free on **GitHub Pages**: repo Settings → Pages → Deploy from branch → `main` / root.

## Notes
- Station data comes from the free, community-run [Radio Browser](https://www.radio-browser.info) directory. No API key is needed.
- On an `https://` site (like GitHub Pages), browsers block `http://` audio streams. **Secure streams only** is on by default there. When you run it locally over `http://`, you can turn it off to see more stations.
- Map © OpenStreetMap contributors, © CARTO.
