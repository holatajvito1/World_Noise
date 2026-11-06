/* World Noise — listen to live radio from anywhere in the world.
 * Station data comes from the free, community-run Radio Browser directory
 * (https://www.radio-browser.info). No API key or account needed. */
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
  const LIMIT = 300;    // stations per list
  const NEARBY_KM = 150;
  // On a secure (https) site, browsers refuse to play insecure http streams, so don't list them
  const SECURE_ONLY = location.protocol === "https:";
  const LS = { favs: "wn.favorites", settings: "wn.settings" };

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const flag = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "🌐");
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const km = (lat1, lon1, lat2, lon2) => {
    const r = Math.PI / 180, a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  };
  // Radio Browser uses formal names; show the everyday ones
  const SHORT_NAMES = {
    "The United States Of America": "United States", "The United Kingdom Of Great Britain And Northern Ireland": "United Kingdom",
    "The Russian Federation": "Russia", "The Netherlands": "Netherlands", "The Philippines": "Philippines",
    "Korea, Republic Of": "South Korea", "Iran, Islamic Republic Of": "Iran", "Viet Nam": "Vietnam",
    "Bolivia, Plurinational State Of": "Bolivia", "Venezuela, Bolivarian Republic Of": "Venezuela",
    "Taiwan, Republic Of China": "Taiwan", "Tanzania, United Republic Of": "Tanzania", "Moldova, Republic Of": "Moldova",
    "The Dominican Republic": "Dominican Republic", "The United Arab Emirates": "United Arab Emirates",
    "The Czech Republic": "Czechia", "Czech Republic": "Czechia",
  };
  const countryName = (n) => SHORT_NAMES[n] || (n || "").replace(/^The /, "");
  const streamUrl = (s) => s.url_resolved || s.url || "";
  const blocked = (s) => SECURE_ONLY && streamUrl(s).startsWith("http:");
  const stationName = (s) => (s.name || "").trim() || "Unnamed station";
  const describe = (s) => {
    const place = [s.state, countryName(s.country)].filter(Boolean).join(", ") || "Unknown location";
    const tags = (s.tags || "").split(",").filter(Boolean).slice(0, 2).join(", ");
    return [`${flag(s.countrycode)} ${place}`, tags].filter(Boolean).join(" · ");
  };
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // ---------- Radio Browser API (tries each mirror until one answers) ----------
  let mirrorIdx = 0;
  async function api(path, params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null)).toString();
    let lastErr;
    for (let i = 0; i < API_MIRRORS.length; i++) {
      const idx = (mirrorIdx + i) % API_MIRRORS.length;
      try {
        const res = await fetch(`${API_MIRRORS[idx]}${path}${qs ? "?" + qs : ""}`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        mirrorIdx = idx;
        return await res.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("Radio directory unreachable");
  }
  const baseParams = () => ({ hidebroken: "true", order: "clickcount", reverse: "true", is_https: SECURE_ONLY ? "true" : "" });

  // ---------- State ----------
  const settings = store.get(LS.settings, null);
  let favorites = store.get(LS.favs, {}); // uuid -> station
  let results = [];
  let showFavs = false;
  let current = null;
  let countries = [];
  let queryId = 0;

  const el = {
    country: $("#country"), state: $("#state"), search: $("#search"), near: $("#near-btn"), favFilter: $("#fav-filter"),
    status: $("#status"), list: $("#list"), random: $("#random-btn"),
    player: $("#player"), audio: $("#audio"), play: $("#play-btn"), fav: $("#fav-btn"),
    npName: $("#np-name"), npMeta: $("#np-meta"), npLogo: $("#np-logo img"),
  };

  function setStatus(text, isError = false) {
    el.status.textContent = text;
    el.status.classList.toggle("error", isError);
  }
  const lookup = (uuid) => results.find((s) => s.stationuuid === uuid) || favorites[uuid] || (current?.stationuuid === uuid ? current : null);

  function setLogo(img, src) {
    img.hidden = true;
    img.removeAttribute("src");
    if (!src || (SECURE_ONLY && src.startsWith("http:"))) return;
    img.onload = () => { img.hidden = false; };
    img.onerror = () => { img.hidden = true; img.removeAttribute("src"); };
    img.src = src;
  }

  // ---------- Station list ----------
  function renderList() {
    const q = el.search.value.trim().toLowerCase();
    let stations = showFavs ? Object.values(favorites) : results;
    if (showFavs && q) stations = stations.filter((s) => stationName(s).toLowerCase().includes(q));
    el.list.textContent = "";
    const frag = document.createDocumentFragment();
    for (const s of stations) {
      const li = document.createElement("li");
      const fav = !!favorites[s.stationuuid];
      li.className = "station" + (current?.stationuuid === s.stationuuid ? " playing" : "");
      li.dataset.uuid = s.stationuuid;
      li.innerHTML = `
        <span class="logo"><img alt="" loading="lazy" referrerpolicy="no-referrer" hidden /></span>
        <div class="info"><span class="name">${esc(stationName(s))}</span><span class="meta">${esc(describe(s))}</span></div>
        <button class="icon-btn fav${fav ? " on" : ""}" aria-label="${fav ? "Remove from" : "Add to"} favorites">${fav ? "★" : "☆"}</button>`;
      setLogo(li.querySelector("img"), s.favicon);
      frag.appendChild(li);
    }
    el.list.appendChild(frag);
    if (showFavs) {
      setStatus(stations.length ? plural(stations.length, "favorite") : "No favorites yet. Tap ☆ next to a station to save it here.");
    }
  }

  el.list.addEventListener("click", (e) => {
    const li = e.target.closest(".station");
    const s = li && lookup(li.dataset.uuid);
    if (!s) return;
    if (e.target.closest(".fav")) toggleFavorite(s);
    else play(s);
  });

  // ---------- Places ----------
  async function loadCountries() {
    countries = (await api("/json/countries", { order: "name", hidebroken: "true" }))
      .filter((c) => c.iso_3166_1 && c.stationcount > 0)
      .sort((a, b) => countryName(a.name).localeCompare(countryName(b.name)));
    const frag = document.createDocumentFragment();
    for (const c of countries) frag.appendChild(new Option(`${flag(c.iso_3166_1)} ${countryName(c.name)}`, c.iso_3166_1));
    el.country.appendChild(frag);
  }

  async function loadStates(code) {
    el.state.length = 1; // keep "All regions"
    el.state.value = "";
    el.state.hidden = true;
    if (!code) return;
    const c = countries.find((x) => x.iso_3166_1 === code);
    let names = [];
    try {
      const states = await api(`/json/states/${encodeURIComponent(c ? c.name : code)}/`, { hidebroken: "true" });
      names = states.filter((s) => s.name && s.stationcount > 0).map((s) => s.name.trim());
    } catch { /* fall back to regions seen in results */ }
    if (!names.length) names = results.map((s) => (s.state || "").trim()).filter(Boolean);
    names = [...new Set(names)].sort((a, b) => a.localeCompare(b));
    if (el.country.value !== code) return; // user changed country meanwhile
    for (const n of names) el.state.add(new Option(n, n));
    el.state.hidden = names.length < 2;
  }

  function placeLabel() {
    if (el.state.value) return el.state.value;
    if (el.country.value) return el.country.selectedOptions[0].textContent;
    return "the world";
  }

  async function query() {
    const id = ++queryId;
    const params = {
      ...baseParams(), limit: LIMIT,
      countrycode: el.country.value, state: el.state.value, name: el.search.value.trim(),
    };
    if (el.state.value) params.stateExact = "true";
    setStatus("Loading stations…");
    try {
      const data = await api("/json/stations/search", params);
      if (id !== queryId) return; // a newer search replaced this one
      results = data;
      if (!showFavs) {
        renderList();
        const q = el.search.value.trim();
        setStatus(results.length
          ? `${results.length >= LIMIT ? "Top " : ""}${plural(results.length, "station")}${q ? ` matching “${q}”` : ""} in ${placeLabel()}`
          : `No stations found in ${placeLabel()}.`);
      }
    } catch (e) {
      if (id !== queryId) return;
      setStatus("Couldn't reach the radio directory. Check your connection and try again.", true);
      console.error(e);
    }
  }

  function saveSettings() { store.set(LS.settings, { country: el.country.value }); }

  el.country.addEventListener("change", async () => {
    saveSettings();
    el.state.value = "";
    el.state.hidden = true;
    setFavMode(false);
    await query();
    await loadStates(el.country.value);
  });
  el.state.addEventListener("change", () => { setFavMode(false); query(); });
  el.search.addEventListener("input", debounce(() => (showFavs ? renderList() : query()), 400));

  // ---------- Near me ----------
  el.near.addEventListener("click", () => {
    if (!navigator.geolocation) { setStatus("Your browser can't share its location.", true); return; }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => findNearby(pos.coords.latitude, pos.coords.longitude),
      () => setStatus("Location is off. Allow location for this site, or pick a country instead.", true),
      { timeout: 15000, maximumAge: 600000 },
    );
  });

  async function findNearby(lat, lon) {
    const id = ++queryId;
    setFavMode(false);
    setStatus("Looking for stations near you…");
    try {
      const data = await api("/json/stations/search", {
        ...baseParams(), has_geo_info: "true", limit: 500,
        geo_lat: lat.toFixed(4), geo_long: lon.toFixed(4), geo_distance: NEARBY_KM * 1000,
      });
      if (id !== queryId) return;
      const found = data
        .filter((s) => Number.isFinite(s.geo_lat) && Number.isFinite(s.geo_long))
        .map((s) => ({ s, d: km(lat, lon, s.geo_lat, s.geo_long) }))
        .filter((x) => x.d <= NEARBY_KM)
        .sort((a, b) => a.d - b.d)
        .map((x) => x.s);
      results = found;
      el.country.value = "";
      el.state.hidden = true;
      el.search.value = "";
      renderList();
      setStatus(found.length
        ? `${plural(found.length, "station")} within ${NEARBY_KM} km of you`
        : "No mapped stations near you. Try picking your country instead.");
    } catch (e) {
      if (id !== queryId) return;
      setStatus("Couldn't reach the radio directory. Check your connection and try again.", true);
    }
  }

  // ---------- Favorites ----------
  function setFavMode(on) {
    showFavs = on;
    el.favFilter.setAttribute("aria-pressed", String(on));
    el.favFilter.textContent = on ? "★ Favorites" : "★";
    el.search.placeholder = on ? "Search favorites" : "Search stations";
  }
  el.favFilter.addEventListener("click", () => {
    setFavMode(!showFavs);
    el.search.value = "";
    if (showFavs) renderList(); else query();
  });

  function toggleFavorite(s) {
    if (favorites[s.stationuuid]) delete favorites[s.stationuuid];
    else favorites[s.stationuuid] = s;
    store.set(LS.favs, favorites);
    updatePlayer();
    renderList();
  }
  el.fav.addEventListener("click", () => current && toggleFavorite(current));

  // ---------- Player ----------
  let hls = null;
  const stopHls = () => { if (hls) { hls.destroy(); hls = null; } };

  function play(s) {
    current = s;
    stopHls();
    el.audio.pause();
    el.player.classList.remove("idle");
    el.player.classList.add("loading");
    showMeta(describe(s));
    updatePlayer();
    el.list.querySelectorAll(".station").forEach((li) => li.classList.toggle("playing", li.dataset.uuid === s.stationuuid));

    if (blocked(s)) { fail("This station's stream isn't secure, so the browser won't play it."); return; }

    const url = streamUrl(s);
    const isHls = s.hls === 1 || /\.m3u8(\?|$)/i.test(url);
    if (isHls && window.Hls && Hls.isSupported() && !el.audio.canPlayType("application/vnd.apple.mpegurl")) {
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail("This station couldn't be played right now."); });
      hls.loadSource(url);
      hls.attachMedia(el.audio);
    } else {
      el.audio.src = url;
    }
    el.audio.play().catch((e) => { if (e.name !== "AbortError") fail("This station couldn't be played right now."); });

    // Let Radio Browser know someone listened (keeps its popularity ranking useful)
    api(`/json/url/${encodeURIComponent(s.stationuuid)}`).catch(() => {});

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: stationName(s), artist: describe(s).replace(/^\S+\s/, ""),
        artwork: s.favicon && s.favicon.startsWith("https:") ? [{ src: s.favicon }] : [],
      });
    }
  }

  function fail(msg) {
    el.player.classList.remove("loading");
    el.play.textContent = "▶";
    showMeta(msg, true);
  }
  function showMeta(text, isError = false) {
    el.npMeta.textContent = text;
    el.npMeta.classList.toggle("error", isError);
  }

  function updatePlayer() {
    const s = current;
    el.play.disabled = el.fav.disabled = !s;
    if (!s) return;
    el.npName.textContent = stationName(s);
    setLogo(el.npLogo, s.favicon);
    const fav = !!favorites[s.stationuuid];
    el.fav.textContent = fav ? "★" : "☆";
    el.fav.classList.toggle("on", fav);
    el.fav.setAttribute("aria-label", fav ? "Remove from favorites" : "Add to favorites");
    document.title = `${stationName(s)} · World Noise`;
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
  el.audio.addEventListener("error", () => { if (!hls && current && el.audio.getAttribute("src")) fail("This station couldn't be played right now."); });

  el.play.addEventListener("click", () => {
    if (!current) return;
    if (el.audio.paused) play(current); // reconnect to the live stream rather than resuming old audio
    else { el.audio.pause(); stopHls(); el.player.classList.remove("loading"); }
  });

  el.random.addEventListener("click", () => {
    const pool = (showFavs ? Object.values(favorites) : results).filter((s) => !blocked(s));
    if (!pool.length) { setStatus("Nothing to pick from yet."); return; }
    play(pool[Math.floor(Math.random() * pool.length)]);
  });

  // Space bar toggles play (when not typing)
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && current && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) {
      e.preventDefault();
      el.play.click();
    }
  });

  // ---------- Start ----------
  (async function init() {
    try { await loadCountries(); } catch (e) { console.error(e); }
    // First visit: start in the visitor's own country (from their language setting, e.g. en-US → US)
    const guess = (navigator.language || "").split("-")[1]?.toUpperCase();
    const start = settings ? settings.country : guess;
    if (start && countries.some((c) => c.iso_3166_1 === start)) el.country.value = start;
    await query();
    if (el.country.value) await loadStates(el.country.value);
  })();
})();
