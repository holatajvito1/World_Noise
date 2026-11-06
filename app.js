/* World Noise — listen to live radio from anywhere on the map.
 * Station data comes from the free, community-run Radio Browser directory
 * (https://www.radio-browser.info). No API key needed. */
(() => {
  "use strict";

  // ---------- Config ----------
  const API_MIRRORS = [
    "https://de1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
    "https://fi1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
  ];
  const WORLD_LIMIT = 2500;   // top stations shown when "Whole world" is selected
  const COUNTRY_LIMIT = 3000; // max stations loaded for a single country
  const NEARBY_KM = 150;      // radius used when clicking the map
  const LS = { favs: "wn.favorites", settings: "wn.settings", volume: "wn.volume" };

  // ---------- Small helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const flag = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "🌐");
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const hasGeo = (s) => Number.isFinite(s.geo_lat) && Number.isFinite(s.geo_long) && !(s.geo_lat === 0 && s.geo_long === 0);
  const km = (lat1, lon1, lat2, lon2) => {
    const r = Math.PI / 180, a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  };
  const place = (s) => [s.state, s.country].filter(Boolean).join(", ");
  const describe = (s) => {
    const bits = [`${flag(s.countrycode)} ${place(s) || "Unknown location"}`];
    const tags = (s.tags || "").split(",").filter(Boolean).slice(0, 2).join(", ");
    if (tags) bits.push(tags);
    if (s.bitrate) bits.push(`${s.bitrate} kbps`);
    return bits.join(" · ");
  };

  // ---------- Radio Browser API (with mirror failover) ----------
  let mirrorIdx = 0;
  async function api(path, params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null)).toString();
    let lastErr;
    for (let i = 0; i < API_MIRRORS.length; i++) {
      const base = API_MIRRORS[(mirrorIdx + i) % API_MIRRORS.length];
      try {
        const res = await fetch(`${base}${path}${qs ? "?" + qs : ""}`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        mirrorIdx = (mirrorIdx + i) % API_MIRRORS.length; // stick with a mirror that works
        return await res.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("All radio directory servers are unreachable");
  }

  // ---------- State ----------
  const settings = Object.assign({ httpsOnly: location.protocol === "https:", country: "", tag: "" }, store.get(LS.settings, {}));
  let favorites = store.get(LS.favs, {}); // uuid -> station
  let results = [];                       // stations matching current filters
  let view = "results";                   // "results" | "favorites"
  let current = null;                     // station currently loaded in player
  let countries = [];
  let queryId = 0;

  // ---------- Map ----------
  const map = L.map("map", { worldCopyJump: true, zoomControl: true, minZoom: 2 }).setView([25, 0], 2);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Stations: <a href="https://www.radio-browser.info">Radio Browser</a>',
    subdomains: "abcd", maxZoom: 19,
  }).addTo(map);
  const cluster = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 45 });
  map.addLayer(cluster);
  const markers = new Map(); // uuid -> marker
  const dotIcon = (playing) => L.divIcon({ className: "", html: `<div class="dot-marker${playing ? " playing" : ""}"></div>`, iconSize: [12, 12] });

  function popupHtml(s) {
    return `<div class="popup-name">${esc(s.name)}</div>
      <div class="popup-meta">${esc(describe(s))}</div>
      <button class="popup-play" data-uuid="${esc(s.stationuuid)}">▶ Listen</button>`;
  }

  function renderMarkers(stations) {
    cluster.clearLayers();
    markers.clear();
    const layer = [];
    for (const s of stations) {
      if (!hasGeo(s) || markers.has(s.stationuuid)) continue;
      const m = L.marker([s.geo_lat, s.geo_long], { icon: dotIcon(current?.stationuuid === s.stationuuid), title: s.name });
      m.station = s;
      m.bindPopup(() => popupHtml(s));
      markers.set(s.stationuuid, m);
      layer.push(m);
    }
    cluster.addLayers(layer);
  }

  map.on("popupopen", (e) => {
    const btn = e.popup.getElement().querySelector(".popup-play");
    if (btn) btn.addEventListener("click", () => {
      const s = lookup(btn.dataset.uuid);
      if (s) play(s);
    });
  });

  // Click empty map → find stations near that point
  map.on("click", (e) => findNearby(e.latlng.lat, e.latlng.lng));

  function fitTo(stations) {
    const pts = stations.filter(hasGeo).map((s) => [s.geo_lat, s.geo_long]);
    if (!pts.length) return;
    // Ignore far outliers (e.g. mis-geotagged stations) by using the middle 90% of points
    const sortBy = (i) => pts.map((p) => p[i]).sort((a, b) => a - b);
    const lats = sortBy(0), lons = sortBy(1);
    const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
    const lo = pts.length > 20 ? 0.05 : 0, hi = pts.length > 20 ? 0.95 : 1;
    map.flyToBounds([[q(lats, lo), q(lons, lo)], [q(lats, hi), q(lons, hi)]], { padding: [30, 30], maxZoom: 10, duration: 0.8 });
  }

  // ---------- UI references ----------
  const el = {
    search: $("#search"), country: $("#country"), state: $("#state"), tag: $("#tag"), https: $("#https-only"),
    list: $("#list"), status: $("#status"), panel: $("#panel"), toggle: $("#toggle-panel"),
    player: $("#player"), audio: $("#audio"), play: $("#play-btn"), fav: $("#fav-btn"), locate: $("#locate-btn"),
    volume: $("#volume"), npName: $("#np-name"), npMeta: $("#np-meta"), npLogo: $("#np-logo"), random: $("#random-btn"),
  };

  function setStatus(text, isError = false) {
    el.status.textContent = text;
    el.status.classList.toggle("error", isError);
  }

  function lookup(uuid) {
    return results.find((s) => s.stationuuid === uuid) || favorites[uuid] || (current?.stationuuid === uuid ? current : null);
  }

  // ---------- Station list ----------
  function renderList() {
    const stations = view === "favorites" ? Object.values(favorites) : results;
    el.list.textContent = "";
    if (view === "favorites" && !stations.length) {
      setStatus("No favorites yet — tap ☆ on any station to save it here.");
      return;
    }
    const frag = document.createDocumentFragment();
    for (const s of stations.slice(0, 500)) {
      const li = document.createElement("li");
      li.className = "station" + (current?.stationuuid === s.stationuuid ? " playing" : "");
      li.dataset.uuid = s.stationuuid;
      li.innerHTML = `
        <span class="logo"><img alt="" loading="lazy" referrerpolicy="no-referrer" /></span>
        <div class="info"><div class="name">${esc(s.name.trim() || "Unnamed station")}</div><div class="meta">${esc(describe(s))}</div></div>
        <button class="icon-btn fav${favorites[s.stationuuid] ? " on" : ""}" aria-label="Toggle favorite">${favorites[s.stationuuid] ? "★" : "☆"}</button>`;
      setLogo(li.querySelector(".logo img"), s.favicon);
      frag.appendChild(li);
    }
    el.list.appendChild(frag);
    if (view === "favorites") setStatus(`${stations.length} favorite station${stations.length === 1 ? "" : "s"}`);
  }

  function setLogo(img, src) {
    img.hidden = true;
    img.removeAttribute("src");
    if (!src || (location.protocol === "https:" && src.startsWith("http:"))) return;
    img.onload = () => { img.hidden = false; };
    img.onerror = () => { img.hidden = true; img.removeAttribute("src"); };
    img.src = src;
  }

  el.list.addEventListener("click", (e) => {
    const li = e.target.closest(".station");
    if (!li) return;
    const s = lookup(li.dataset.uuid);
    if (!s) return;
    if (e.target.closest(".fav")) { toggleFavorite(s); return; }
    play(s);
    focusStation(s);
    closePanelOnMobile();
  });

  // ---------- Filters / queries ----------
  async function loadCountries() {
    countries = await api("/json/countries", { order: "stationcount", reverse: "true", hidebroken: "true" });
    countries = countries.filter((c) => c.iso_3166_1 && c.stationcount > 0);
    const frag = document.createDocumentFragment();
    for (const c of countries) {
      const o = document.createElement("option");
      o.value = c.iso_3166_1;
      o.textContent = `${flag(c.iso_3166_1)} ${c.name} (${c.stationcount})`;
      frag.appendChild(o);
    }
    el.country.appendChild(frag);
    el.country.value = settings.country;
    if (el.country.value !== settings.country) settings.country = "";
  }

  async function loadStates(countryCode) {
    el.state.innerHTML = '<option value="">All regions</option>';
    el.state.disabled = true;
    if (!countryCode) return;
    const c = countries.find((x) => x.iso_3166_1 === countryCode);
    let states = [];
    try {
      states = await api(`/json/states/${encodeURIComponent(c ? c.name : countryCode)}/`, { order: "name", hidebroken: "true" });
    } catch { /* fall back to regions found in results */ }
    let names = states.filter((s) => s.name && s.stationcount > 0).map((s) => s.name);
    if (!names.length) names = [...new Set(results.map((s) => s.state).filter(Boolean))];
    names = [...new Set(names.map((n) => n.trim()))].sort((a, b) => a.localeCompare(b));
    for (const n of names) el.state.add(new Option(n, n));
    el.state.disabled = names.length === 0;
  }

  async function query({ fit = false } = {}) {
    const id = ++queryId;
    const country = el.country.value, state = el.state.value, name = el.search.value.trim(), tag = el.tag.value;
    const params = {
      hidebroken: "true", order: "clickcount", reverse: "true",
      limit: country ? COUNTRY_LIMIT : WORLD_LIMIT,
      countrycode: country, state, name, tag,
      tagExact: tag ? "false" : "",
      is_https: el.https.checked ? "true" : "",
    };
    // When browsing the whole world with no search, only fetch stations we can place on the map
    if (!country && !name) params.has_geo_info = "true";
    setStatus("Loading stations…");
    try {
      const data = await api("/json/stations/search", params);
      if (id !== queryId) return; // a newer query superseded this one
      results = data;
      renderMarkers(results);
      if (view === "results") renderList();
      const mapped = results.filter(hasGeo).length;
      const where = state || (country ? el.country.selectedOptions[0].textContent.replace(/\s\(\d+\)$/, "") : "the world");
      if (view === "results") {
        setStatus(results.length
          ? `${results.length} station${results.length === 1 ? "" : "s"} in ${where}` + (mapped < results.length ? ` (${mapped} on the map)` : "")
          : `No stations found in ${where}. Try loosening the filters.`);
      }
      if (fit && (country || state)) fitTo(results);
    } catch (e) {
      if (id !== queryId) return;
      setStatus("Couldn't reach the radio directory. Check your connection and try again.", true);
      console.error(e);
    }
  }

  function saveSettings() {
    settings.httpsOnly = el.https.checked;
    settings.country = el.country.value;
    settings.tag = el.tag.value;
    store.set(LS.settings, settings);
  }

  el.country.addEventListener("change", async () => {
    saveSettings();
    el.state.value = "";
    await query({ fit: true });
    await loadStates(el.country.value);
    if (!el.country.value) map.flyTo([25, 0], 2, { duration: 0.8 });
  });
  el.state.addEventListener("change", () => query({ fit: true }));
  el.tag.addEventListener("change", () => { saveSettings(); query(); });
  el.https.addEventListener("change", () => { saveSettings(); query(); });
  el.search.addEventListener("input", debounce(() => query(), 400));

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    view = t.dataset.view;
    document.querySelectorAll(".tab").forEach((x) => {
      x.classList.toggle("active", x === t);
      x.setAttribute("aria-selected", String(x === t));
    });
    renderList();
    if (view === "results") query();
  }));

  // ---------- Nearby search (map click) ----------
  async function findNearby(lat, lon) {
    const id = ++queryId;
    setStatus("Looking for stations near that spot…");
    switchToResultsTab();
    let found = [];
    try {
      const data = await api("/json/stations/search", {
        geo_lat: lat.toFixed(4), geo_long: lon.toFixed(4), geo_distance: NEARBY_KM * 1000,
        has_geo_info: "true", hidebroken: "true", order: "clickcount", reverse: "true", limit: 300,
        is_https: el.https.checked ? "true" : "",
      });
      found = data.filter((s) => hasGeo(s) && km(lat, lon, s.geo_lat, s.geo_long) <= NEARBY_KM);
    } catch { /* fall through to local search */ }
    if (id !== queryId) return;
    if (!found.length) {
      // Fallback: closest stations we already have loaded
      found = [...markers.values()].map((m) => m.station)
        .filter((s) => km(lat, lon, s.geo_lat, s.geo_long) <= NEARBY_KM * 2);
    }
    found.sort((a, b) => km(lat, lon, a.geo_lat, a.geo_long) - km(lat, lon, b.geo_lat, b.geo_long));
    if (!found.length) {
      setStatus("No stations close to that spot. Try clicking nearer to a town or city.");
      return;
    }
    results = found;
    renderMarkers(results);
    renderList();
    const nearest = found[0];
    setStatus(`${found.length} station${found.length === 1 ? "" : "s"} within ~${NEARBY_KM} km of ${place(nearest) || "that spot"}`);
    fitTo(found);
    openPanelOnMobile();
  }

  function switchToResultsTab() {
    if (view === "results") return;
    document.querySelector('.tab[data-view="results"]').click();
  }

  // ---------- Favorites ----------
  function toggleFavorite(s) {
    if (favorites[s.stationuuid]) delete favorites[s.stationuuid];
    else favorites[s.stationuuid] = s;
    store.set(LS.favs, favorites);
    updatePlayerUi();
    renderList();
  }
  el.fav.addEventListener("click", () => current && toggleFavorite(current));

  // ---------- Player ----------
  let hls = null;
  el.audio.volume = store.get(LS.volume, 0.8);
  el.volume.value = el.audio.volume;
  el.volume.addEventListener("input", () => { el.audio.volume = +el.volume.value; store.set(LS.volume, el.audio.volume); });

  function stopHls() { if (hls) { hls.destroy(); hls = null; } }

  function play(s) {
    const prev = current;
    current = s;
    const url = s.url_resolved || s.url;
    stopHls();
    el.audio.pause();
    el.player.classList.remove("idle");
    el.player.classList.add("loading");
    showMeta(describe(s));
    updatePlayerUi();
    refreshMarker(prev);
    refreshMarker(s);
    renderListHighlight();

    if (location.protocol === "https:" && url.startsWith("http:")) {
      fail("This station only streams over insecure HTTP, which browsers block here. Tick “Secure streams only” to hide these.");
      return;
    }

    const isHls = s.hls === 1 || /\.m3u8(\?|$)/i.test(url);
    if (isHls && window.Hls && Hls.isSupported() && !el.audio.canPlayType("application/vnd.apple.mpegurl")) {
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail("This stream couldn't be played."); });
      hls.loadSource(url);
      hls.attachMedia(el.audio);
    } else {
      el.audio.src = url;
    }
    el.audio.play().catch((e) => { if (e.name !== "AbortError") fail("This stream couldn't be played. It may be offline."); });

    // Tell Radio Browser someone listened — helps keep popularity rankings useful
    api(`/json/url/${encodeURIComponent(s.stationuuid)}`).catch(() => {});

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.name, artist: place(s),
        artwork: s.favicon && s.favicon.startsWith("https:") ? [{ src: s.favicon }] : [],
      });
    }
  }

  function fail(msg) {
    el.player.classList.remove("loading");
    showMeta(msg, true);
    el.play.textContent = "▶";
  }
  function showMeta(text, isError = false) {
    el.npMeta.textContent = text;
    el.npMeta.classList.toggle("error", isError);
  }

  function updatePlayerUi() {
    const s = current;
    el.play.disabled = el.fav.disabled = !s;
    el.locate.disabled = !s || !hasGeo(s);
    if (!s) return;
    el.npName.textContent = s.name.trim() || "Unnamed station";
    setLogo(el.npLogo.querySelector("img"), s.favicon);
    const fav = !!favorites[s.stationuuid];
    el.fav.textContent = fav ? "★" : "☆";
    el.fav.style.color = fav ? "var(--accent-2)" : "";
    el.fav.setAttribute("aria-label", fav ? "Remove from favorites" : "Add to favorites");
    document.title = `${s.name.trim()} · World Noise`;
  }

  function refreshMarker(s) {
    const m = s && markers.get(s.stationuuid);
    if (m) m.setIcon(dotIcon(current?.stationuuid === s.stationuuid));
  }
  function renderListHighlight() {
    el.list.querySelectorAll(".station").forEach((li) => li.classList.toggle("playing", li.dataset.uuid === current?.stationuuid));
  }

  function focusStation(s) {
    if (!hasGeo(s)) return;
    const m = markers.get(s.stationuuid);
    if (m) cluster.zoomToShowLayer(m, () => m.openPopup());
    else map.flyTo([s.geo_lat, s.geo_long], Math.max(map.getZoom(), 8), { duration: 0.8 });
  }

  el.audio.addEventListener("playing", () => {
    el.player.classList.remove("loading");
    el.play.textContent = "❚❚";
    el.play.setAttribute("aria-label", "Pause");
    if (current) showMeta("Live · " + describe(current));
  });
  el.audio.addEventListener("pause", () => {
    el.play.textContent = "▶";
    el.play.setAttribute("aria-label", "Play");
  });
  el.audio.addEventListener("waiting", () => el.player.classList.add("loading"));
  el.audio.addEventListener("error", () => { if (!hls && current) fail("This stream couldn't be played. It may be offline."); });

  el.play.addEventListener("click", () => {
    if (!current) return;
    if (el.audio.paused) play(current); // reconnect to the live edge rather than resuming stale audio
    else { el.audio.pause(); stopHls(); el.player.classList.remove("loading"); }
  });
  el.locate.addEventListener("click", () => current && focusStation(current));

  el.random.addEventListener("click", () => {
    const pool = view === "favorites" ? Object.values(favorites) : results;
    if (!pool.length) { setStatus("Nothing to pick from — load some stations first."); return; }
    const playable = pool.filter((s) => !(location.protocol === "https:" && (s.url_resolved || s.url).startsWith("http:")));
    const list = playable.length ? playable : pool;
    const s = list[Math.floor(Math.random() * list.length)];
    play(s);
    focusStation(s);
  });

  // Keyboard: space toggles play when not typing
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName) && current) {
      e.preventDefault();
      el.play.click();
    }
  });

  // ---------- Mobile panel ----------
  const isMobile = () => matchMedia("(max-width: 760px)").matches;
  function setPanel(open) {
    el.panel.classList.toggle("open", open);
    el.toggle.setAttribute("aria-expanded", String(open));
    el.toggle.textContent = open ? "🗺" : "☰";
    el.toggle.setAttribute("aria-label", open ? "Show map" : "Show station list");
    if (!open) setTimeout(() => map.invalidateSize(), 250);
  }
  el.toggle.addEventListener("click", () => setPanel(!el.panel.classList.contains("open")));
  function closePanelOnMobile() { if (isMobile()) setPanel(false); }
  function openPanelOnMobile() { if (isMobile()) setPanel(true); }

  // ---------- Boot ----------
  (async function init() {
    el.https.checked = settings.httpsOnly;
    el.tag.value = settings.tag;
    try { await loadCountries(); } catch (e) { console.error(e); }
    await query({ fit: !!el.country.value });
    if (el.country.value) await loadStates(el.country.value);
  })();
})();
