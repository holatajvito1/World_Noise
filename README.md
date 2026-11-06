# World Noise

Listen to live radio from anywhere in the world.

## How it works
- **Pick a place:** choose a country, then a state or region (e.g. United States → Texas)
- **📍 Near me:** lists stations close to where you are
- **Search** stations by name
- **☆ Favorites:** tap the star to save a station; tap ★ at the top to see your saved ones
- **🎲 Surprise me:** plays a random station from the current list
- Works great on iPhone: add it to your Home Screen and it behaves like an app (lock-screen controls included)

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
