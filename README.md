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

## Put it on your iPhone
1. Host it on GitHub Pages (see above). You'll get a link like `https://<you>.github.io/world_noise/`.
2. Open that link in **Safari** on your iPhone.
3. Tap **Share** (the square with an arrow) → **Add to Home Screen** → **Add**.

It shows up with its own icon and opens full-screen, without Safari's address bar. Audio keeps playing when you lock the phone, and the lock screen shows play/pause.

## Notes
- Station data comes from the free, community-run [Radio Browser](https://www.radio-browser.info) directory. No API key is needed.
- On an `https://` site (like GitHub Pages), browsers block `http://` audio streams. **Secure streams only** is on by default there. When you run it locally over `http://`, you can turn it off to see more stations.
- Map © OpenStreetMap contributors, © CARTO.
