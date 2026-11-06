# World Noise

Listen to live radio from anywhere in the world.

## How it works
Styled like a modern iPhone music app, and it follows your phone's light/dark setting.

- **Home:** Top Picks in your country, Recently Played, Regions, stations from Around the World, and genres
- **Places:** Near Me (uses your location), pick any country, then drill into a state or region (e.g. United States → Texas)
- **Search:** colourful genre categories, or search stations and cities by name
- **Library:** your Favorites and Recently Played
- **Mini player → Now Playing:** tap the mini player for the full-screen player; skip ⏭ jumps to the next station in the list; swipe down to close
- Add it to your iPhone Home Screen and it behaves like an app (lock-screen controls included)

Station data comes from the free, community-run [Radio Browser](https://www.radio-browser.info) directory. No API key or account is needed.

## Put it online (free)
**GitHub Pages:** free GitHub accounts can use Pages on **public** repositories only.
1. Repo **Settings → General → Danger Zone → Change visibility → Public**
2. **Settings → Pages → Deploy from a branch**, then pick your branch and `/ (root)`, and click **Save**
3. After a couple of minutes your site is at `https://<username>.github.io/World_Noise/`

**Want to keep the repo private?** Use [Netlify](https://app.netlify.com) instead: sign in with GitHub → *Add new site → Import an existing project* → pick this repo, leave the build command empty, set the publish directory to `/`.

## Put it on your iPhone
Open your site link in **Safari** → tap **Share** → **Add to Home Screen** → **Add**.

## Run it on your computer
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Notes
On an `https://` site, browsers block stations that only stream over plain `http://`, so those are hidden automatically. When you run it locally over `http://`, they show up too.
