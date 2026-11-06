/* World Noise — listen to live radio from anywhere in the world.
 * Station data comes from the free, community-run Radio Browser directory
 * (https://www.radio-browser.info). No API key or account needed. */
(() => {
  "use strict";

  // ================= Config =================
  const API_MIRRORS = [
    "https://de1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
    "https://fi1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
  ];
  const NEARBY_KM = 150;
  const SECURE_ONLY = location.protocol === "https:"; // https pages can't play http streams
  const LS = { favs: "wn.favorites", recent: "wn.recent", settings: "wn.settings", volume: "wn.volume", logos: "wn.logos" };
  const GENRES = [
    ["Pop", "pop"], ["Rock", "rock"], ["News", "news"], ["Talk", "talk"], ["Hip-Hop", "hip hop"],
    ["Country", "country"], ["Jazz", "jazz"], ["Classical", "classical"], ["Dance", "dance"],
    ["Electronic", "electronic"], ["Oldies", "oldies"], ["80s", "80s"], ["Latin", "latin"],
    ["R&B", "rnb"], ["Reggae", "reggae"], ["Blues", "blues"], ["Chill", "chillout"],
    ["Ambient", "ambient"], ["Sports", "sports"], ["Christian", "christian"], ["Indie", "indie"], ["Metal", "metal"],
  ];
  // Radio Browser uses formal names; show the everyday ones
  const SHORT_NAMES = {
    "The United States Of America": "United States", "The United Kingdom Of Great Britain And Northern Ireland": "United Kingdom",
    "The Russian Federation": "Russia", "Korea, Republic Of": "South Korea", "Iran, Islamic Republic Of": "Iran",
    "Viet Nam": "Vietnam", "Bolivia, Plurinational State Of": "Bolivia", "Venezuela, Bolivarian Republic Of": "Venezuela",
    "Taiwan, Republic Of China": "Taiwan", "Tanzania, United Republic Of": "Tanzania", "Moldova, Republic Of": "Moldova",
    "The Czech Republic": "Czechia", "Czech Republic": "Czechia",
  };

  // ================= Helpers =================
  const $ = (s) => document.querySelector(s);
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
  const countryName = (n) => SHORT_NAMES[n] || (n || "").replace(/^The /, "");
  const streamUrl = (s) => s.url_resolved || s.url || "";
  const blocked = (s) => SECURE_ONLY && streamUrl(s).startsWith("http:");
  const stationName = (s) => (s.name || "").replace(/\s+/g, " ").trim() || "Unnamed Station";
  const place = (s) => [s.state, countryName(s.country)].filter(Boolean).join(", ") || "Live Radio";
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const dedupe = (list) => { const seen = new Set(); return list.filter((s) => !seen.has(s.stationuuid) && seen.add(s.stationuuid)); };
  const hueOf = (str) => { let h = 0; for (const c of str || "") h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
  const gradient = (str) => { const h = hueOf(str); return `linear-gradient(140deg, hsl(${h} 72% 58%), hsl(${(h + 35) % 360} 70% 38%))`; };
  const deep = (str) => { const h = hueOf(str); return `linear-gradient(180deg, hsl(${h} 40% 36%), hsl(${(h + 25) % 360} 45% 14%))`; };
  const solid = (str) => { const h = hueOf(str); return `hsl(${h} 38% 30%)`; };

  // ================= Radio Browser API (tries each mirror until one answers) =================
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
  const search = (params) => api("/json/stations/search", {
    hidebroken: "true", order: "clickcount", reverse: "true", is_https: SECURE_ONLY ? "true" : "", ...params,
  });
  const OFFLINE = "Can't reach the radio directory right now. Check your connection.";

  // ================= State =================
  let favorites = store.get(LS.favs, {});   // uuid -> station (+ _added)
  let recent = store.get(LS.recent, []);    // most recent first
  let countries = [];
  let country = "";                         // ISO code, "" = whole world
  let current = null, queue = [], qIndex = -1;
  const lists = new Map();                  // list key -> stations (so cards/rows know their queue)
  let listSeq = 0;
  const registerList = (stations) => { const k = "l" + ++listSeq; lists.set(k, stations); return k; };

  // ================= Artwork =================
  // Logos come from (1) the logo listed in Radio Browser, then (2) the icon of the station's
  // own website. The first one that loads at a usable size wins and is remembered.
  const LOGO_MIN = 48;
  const logoCache = new Map(Object.entries(store.get(LS.logos, {}))); // uuid -> {src,w,h} | null
  const logoJobs = new Map();
  const saveLogos = debounce(() => {
    const entries = [...logoCache].slice(-800); // keep the stored list small
    store.set(LS.logos, Object.fromEntries(entries));
  }, 1500);
  const hostOf = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname : ""; } catch { return ""; } };

  function logoCandidates(s) {
    const list = [];
    const fav = (s.favicon || "").trim();
    if (/^https?:\/\//i.test(fav)) {
      if (fav.startsWith("https:")) list.push(fav);
      else { list.push(fav.replace(/^http:/i, "https:")); if (!SECURE_ONLY) list.push(fav); }
    }
    const host = hostOf(s.homepage) || hostOf(fav);
    if (host) list.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`);
    return [...new Set(list)];
  }
  const loadImage = (src) => new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img.naturalWidth >= LOGO_MIN && img.naturalHeight >= LOGO_MIN / 2 ? { src, w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 8000);
    img.src = src;
  });
  function findLogo(s) {
    const id = s.stationuuid;
    if (logoCache.has(id)) return Promise.resolve(logoCache.get(id));
    if (logoJobs.has(id)) return logoJobs.get(id);
    const job = (async () => {
      let found = null;
      for (const src of logoCandidates(s)) { found = await loadImage(src); if (found) break; }
      logoCache.set(id, found);
      logoJobs.delete(id);
      saveLogos();
      return found;
    })();
    logoJobs.set(id, job);
    return job;
  }

  // Colour tile with the station name, replaced by the station's logo once it's found.
  function art(el, s, title, small) {
    const label = s ? stationName(s) : title;
    el.style.setProperty("--art-bg", gradient(label));
    el.classList.remove("has-logo", "full");
    // Small artwork shows just the first word (e.g. "KEXP"); big artwork shows the full name
    const text = small ? label.split(" ")[0].slice(0, 6) : label.split(" ").slice(0, 4).join(" ");
    el.innerHTML = `<span class="art-text">${esc(text)}</span>`;
    if (!s) return el;
    const token = (el._artToken = (el._artToken || 0) + 1);
    findLogo(s).then((logo) => {
      if (!logo || el._artToken !== token) return;
      // Big square logos fill the tile; anything else sits in the middle on a blurred copy of itself
      const full = logo.w >= 300 && Math.abs(logo.w / logo.h - 1) < 0.08;
      el.classList.add("has-logo");
      el.classList.toggle("full", full);
      el.innerHTML = `<img class="logo-bg" alt="" src="${esc(logo.src)}" referrerpolicy="no-referrer" />
        <img class="logo-fg" alt="" src="${esc(logo.src)}" referrerpolicy="no-referrer" style="--logo-max:${Math.round(logo.w * 2.5)}px" />`;
      el.dispatchEvent(new CustomEvent("logo", { detail: logo }));
    });
    return el;
  }
  const artSpan = (s, title, small) => art(Object.assign(document.createElement("span"), { className: "art" }), s, title, small);

  // ================= Building blocks =================
  function card(s, key, i) {
    const b = document.createElement("button");
    b.className = "card";
    b.dataset.list = key; b.dataset.i = i;
    b.append(artSpan(s));
    b.insertAdjacentHTML("beforeend", `<div class="card-title">${esc(stationName(s))}</div><div class="card-sub">${esc(place(s))}</div>`);
    return b;
  }
  function hero(s, key, i, kicker) {
    const b = document.createElement("button");
    b.className = "hero";
    b.dataset.list = key; b.dataset.i = i;
    b.style.setProperty("--hero-bg", solid(stationName(s)));
    b.append(artSpan(s));
    b.insertAdjacentHTML("beforeend", `<div class="hero-text"><div class="hero-kicker">${esc(kicker)}</div>
      <div class="hero-title">${esc(stationName(s))}</div><div class="hero-sub">${esc(place(s))}</div></div>`);
    return b;
  }
  function tile(label, onClick) {
    const b = document.createElement("button");
    b.className = "tile";
    b.style.setProperty("--tile-bg", gradient(label + "!"));
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }
  function sectionTitle(text, onMore) {
    const h = document.createElement("h2");
    h.className = "section-title";
    if (onMore) {
      const b = document.createElement("button");
      b.innerHTML = `${esc(text)}<svg class="chev"><use href="#i-chev"/></svg>`;
      b.addEventListener("click", onMore);
      h.append(b);
    } else h.textContent = text;
    return h;
  }
  function shelf(items) { const d = document.createElement("div"); d.className = "shelf"; d.append(...items); return d; }

  function renderTracks(ul, stations) {
    const key = registerList(stations);
    ul.textContent = "";
    stations.forEach((s, i) => {
      const li = document.createElement("li");
      li.className = "track" + (current?.stationuuid === s.stationuuid ? " playing" : "");
      li.dataset.list = key; li.dataset.i = i; li.dataset.uuid = s.stationuuid;
      li.append(artSpan(s, null, true));
      const fav = !!favorites[s.stationuuid];
      li.insertAdjacentHTML("beforeend", `<div class="track-text"><span class="track-title">${esc(stationName(s))}</span>
        <span class="track-sub">${esc(flag(s.countrycode) + " " + place(s))}</span></div>
        <button class="track-fav${fav ? " on" : ""}" aria-label="${fav ? "Remove from" : "Add to"} favorites"><svg><use href="#i-star${fav ? "-fill" : ""}"/></svg></button>`);
      ul.append(li);
    });
  }

  // One click handler for every card / row that plays a station
  document.addEventListener("click", (e) => {
    const favBtn = e.target.closest(".track-fav");
    const item = e.target.closest("[data-list]");
    if (!item) return;
    const stations = lists.get(item.dataset.list);
    const s = stations && stations[+item.dataset.i];
    if (!s) return;
    if (favBtn) { toggleFavorite(s); favBtn.classList.toggle("on", !!favorites[s.stationuuid]); favBtn.innerHTML = `<svg><use href="#i-star${favorites[s.stationuuid] ? "-fill" : ""}"/></svg>`; return; }
    play(s, stations, +item.dataset.i);
  });

  // ================= Tabs & navigation =================
  const views = { home: $("#view-home"), places: $("#view-places"), search: $("#view-search"), library: $("#view-library") };
  let activeTab = "home";
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    const tab = t.dataset.tab;
    if (tab === activeTab && !detail.classList.contains("open")) { views[tab].scrollTo({ top: 0, behavior: "smooth" }); return; }
    closeDetail(true);
    activeTab = tab;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
    Object.entries(views).forEach(([k, v]) => v.classList.toggle("active", k === tab));
    if (tab === "library") renderLibrary();
    if (tab === "search" && !$("#search").value) renderSearchHome();
  }));

  // ---- Detail page (station list) ----
  const detail = $("#detail");
  const navbar = detail.querySelector(".navbar");
  let detailToken = 0;
  async function openList({ title, sub, load, artStation }) {
    const token = ++detailToken;
    $("#back-label").textContent = views[activeTab].dataset.name;
    $("#nav-title").textContent = title;
    $("#detail-title").textContent = title;
    $("#detail-sub").textContent = sub || "";
    art($("#detail-art"), artStation || null, title);
    $("#detail-list").textContent = "";
    $("#detail-status").textContent = "Loading…";
    detail.scrollTop = 0;
    navbar.classList.remove("solid");
    detail.classList.add("open");
    detail.setAttribute("aria-hidden", "false");
    let stations = [];
    try { stations = await load(); } catch { if (token === detailToken) $("#detail-status").textContent = OFFLINE; return; }
    if (token !== detailToken) return;
    detail.stations = stations;
    $("#detail-status").textContent = stations.length ? "" : "No stations here yet.";
    renderTracks($("#detail-list"), stations);
  }
  function closeDetail(instant) {
    detailToken++;
    if (instant) { detail.style.transition = "none"; requestAnimationFrame(() => (detail.style.transition = "")); }
    detail.classList.remove("open");
    detail.setAttribute("aria-hidden", "true");
  }
  $("#back-btn").addEventListener("click", () => closeDetail());
  detail.addEventListener("scroll", () => navbar.classList.toggle("solid", detail.scrollTop > 200));
  $("#play-all").addEventListener("click", () => { const l = detail.stations || []; const i = l.findIndex((s) => !blocked(s)); if (i >= 0) play(l[i], l, i); });
  $("#shuffle-all").addEventListener("click", () => playRandom(detail.stations || []));

  // ================= Home =================
  const countryLabel = () => {
    const c = countries.find((x) => x.iso_3166_1 === country);
    return c ? countryName(c.name) : "the World";
  };
  async function renderHome() {
    const root = $("#home-content");
    root.innerHTML = `<p class="empty">Loading…</p>`;
    const where = countryLabel();
    let top = [], world = [], regions = [];
    try {
      [top, world, regions] = await Promise.all([
        search({ countrycode: country, limit: 40, has_extended_info: "" }),
        country ? search({ limit: 24, order: "votes" }) : Promise.resolve([]),
        country ? loadRegions(country) : Promise.resolve([]),
      ]);
    } catch { root.innerHTML = `<p class="empty">${OFFLINE}</p>`; return; }
    root.textContent = "";

    // Top Picks: big cards
    if (top.length) {
      const picks = top.slice(0, 8), key = registerList(picks);
      root.append(sectionTitle(`Top Picks in ${where}`, () => openList({ title: `Top in ${where}`, sub: "Most listened", load: async () => top })),
        shelf(picks.map((s, i) => hero(s, key, i, i === 0 ? "Most Popular" : "Live Radio"))));
    }
    // Recently Played
    if (recent.length) {
      const key = registerList(recent);
      root.append(sectionTitle("Recently Played", () => openList({ title: "Recently Played", load: async () => recent })),
        shelf(recent.slice(0, 15).map((s, i) => card(s, key, i))));
    }
    // Regions in this country
    if (regions.length > 1) {
      root.append(sectionTitle(`Regions in ${where}`, () => $('.tab[data-tab="places"]').click()),
        shelf(regions.slice(0, 16).map((r) => tile(r, () => openRegion(r)))));
    }
    // More from this country
    if (top.length > 8) {
      const more = top.slice(8), key = registerList(more);
      root.append(sectionTitle(`More from ${where}`), shelf(more.map((s, i) => card(s, key, i))));
    }
    // Around the world
    if (world.length) {
      const key = registerList(world);
      root.append(sectionTitle("Around the World", () => openList({ title: "Around the World", sub: "Fan favorites", load: async () => world })),
        shelf(world.map((s, i) => card(s, key, i))));
    }
    // Genres
    root.append(sectionTitle("Browse by Genre", () => $('.tab[data-tab="search"]').click()),
      shelf(GENRES.slice(0, 10).map(([label, tag]) => tile(label, () => openGenre(label, tag)))));
  }
  $("#shuffle-home").addEventListener("click", () => {
    const pool = [...$("#home-content").querySelectorAll("[data-list]")].map((b) => lists.get(b.dataset.list)[+b.dataset.i]);
    playRandom(dedupe(pool));
  });

  // ================= Places =================
  async function loadCountries() {
    countries = (await api("/json/countries", { hidebroken: "true" }))
      .filter((c) => c.iso_3166_1 && c.stationcount > 0)
      .sort((a, b) => countryName(a.name).localeCompare(countryName(b.name)));
    const sel = $("#country");
    for (const c of countries) sel.add(new Option(`${flag(c.iso_3166_1)} ${countryName(c.name)}`, c.iso_3166_1));
  }
  const regionCache = new Map();
  async function loadRegions(code) {
    if (regionCache.has(code)) return regionCache.get(code);
    const c = countries.find((x) => x.iso_3166_1 === code);
    let names = [];
    try {
      const states = await api(`/json/states/${encodeURIComponent(c ? c.name : code)}/`, { hidebroken: "true" });
      names = [...new Set(states.filter((s) => s.name && s.stationcount > 0).map((s) => s.name.trim()))].sort((a, b) => a.localeCompare(b));
    } catch { /* no regions */ }
    regionCache.set(code, names);
    return names;
  }
  function row(label, value, onClick, icon) {
    const b = document.createElement("button");
    b.className = "row";
    b.innerHTML = `${icon ? `<span class="row-icon accent">${icon}</span>` : ""}<span class="row-label">${esc(label)}</span>
      ${value ? `<span class="row-value">${esc(value)}</span>` : ""}<svg class="chev"><use href="#i-chev"/></svg>`;
    b.addEventListener("click", onClick);
    return b;
  }
  async function renderPlaces() {
    $("#country-label").textContent = country ? `${flag(country)} ${countryLabel()}` : "Whole world";
    const box = $("#regions");
    box.textContent = "";
    if (!country) {
      $("#regions-title").textContent = "Popular Countries";
      [...countries].sort((a, b) => b.stationcount - a.stationcount).slice(0, 40).forEach((c) =>
        box.append(row(`${flag(c.iso_3166_1)}  ${countryName(c.name)}`, "", () => openCountry(c.iso_3166_1))));
      return;
    }
    $("#regions-title").textContent = "Regions";
    box.append(row(`All of ${countryLabel()}`, "", () => openCountry(country)));
    const code = country, regions = await loadRegions(code);
    if (code !== country) return;
    regions.forEach((r) => box.append(row(r, "", () => openRegion(r))));
  }
  const openCountry = (code) => {
    const c = countries.find((x) => x.iso_3166_1 === code);
    const name = c ? countryName(c.name) : code;
    openList({ title: `${name}`, sub: `${flag(code)} Live Radio`, load: () => search({ countrycode: code, limit: 300 }) });
  };
  const openRegion = (r) => openList({
    title: r, sub: `${flag(country)} ${countryLabel()}`,
    load: () => search({ countrycode: country, state: r, stateExact: "true", limit: 300 }),
  });
  $("#country").addEventListener("change", (e) => {
    country = e.target.value;
    store.set(LS.settings, { country });
    renderPlaces();
    renderHome();
  });
  $("#near-row").addEventListener("click", () => {
    openList({ title: "Near Me", sub: "Within " + NEARBY_KM + " km", load: nearMe });
  });
  function nearMe() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { $("#detail-status").textContent = "Location isn't available in this browser."; return resolve([]); }
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const data = await search({ has_geo_info: "true", limit: 500, geo_lat: lat.toFixed(4), geo_long: lon.toFixed(4), geo_distance: NEARBY_KM * 1000 });
          resolve(data.filter((s) => Number.isFinite(s.geo_lat) && km(lat, lon, s.geo_lat, s.geo_long) <= NEARBY_KM)
            .sort((a, b) => km(lat, lon, a.geo_lat, a.geo_long) - km(lat, lon, b.geo_lat, b.geo_long)));
        } catch (e) { reject(e); }
      }, () => {
        resolve([]);
        setTimeout(() => ($("#detail-status").textContent = "Turn on Location for this site to see stations near you."), 0);
      }, { timeout: 15000, maximumAge: 600000 });
    });
  }

  // ================= Search =================
  const openGenre = (label, tag) => openList({ title: label, sub: "Around the World", load: () => search({ tag, limit: 200 }) });
  function renderSearchHome() {
    const root = $("#search-content");
    root.textContent = "";
    const grid = document.createElement("div");
    grid.className = "tiles";
    GENRES.forEach(([label, tag]) => grid.append(tile(label, () => openGenre(label, tag))));
    root.append(sectionTitle("Browse Categories"), grid);
  }
  let searchToken = 0;
  const runSearch = debounce(async () => {
    const q = $("#search").value.trim(), token = ++searchToken, root = $("#search-content");
    if (!q) { renderSearchHome(); return; }
    root.innerHTML = `<p class="empty">Searching…</p>`;
    try {
      const [byName, byPlace] = await Promise.all([search({ name: q, limit: 60 }), search({ state: q, limit: 30 })]);
      if (token !== searchToken) return;
      const found = dedupe([...byName, ...byPlace]);
      root.textContent = "";
      if (!found.length) { root.innerHTML = `<p class="empty">No results for “${esc(q)}”.</p>`; return; }
      const ul = document.createElement("ul");
      ul.className = "tracks";
      renderTracks(ul, found);
      root.append(ul);
    } catch { if (token === searchToken) root.innerHTML = `<p class="empty">${OFFLINE}</p>`; }
  }, 350);
  $("#search").addEventListener("input", runSearch);
  $("#search").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });

  // ================= Library =================
  const favList = () => Object.values(favorites).sort((a, b) => (b._added || 0) - (a._added || 0));
  function renderLibrary() {
    const favs = favList();
    $("#fav-count").textContent = favs.length || "";
    const grid = $("#library-grid");
    grid.textContent = "";
    if (!favs.length) { grid.innerHTML = `<p class="empty" style="grid-column:1/-1;padding:0">Tap the star on any station to add it to your Library.</p>`; return; }
    const key = registerList(favs);
    favs.slice(0, 30).forEach((s, i) => grid.append(card(s, key, i)));
  }
  document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.open === "favorites") openList({ title: "Favorites", sub: "Your stations", load: async () => favList() });
    else openList({ title: "Recently Played", load: async () => recent });
  }));

  function toggleFavorite(s) {
    if (favorites[s.stationuuid]) delete favorites[s.stationuuid];
    else favorites[s.stationuuid] = { ...s, _added: Date.now() };
    store.set(LS.favs, favorites);
    updateFavButtons();
    if (activeTab === "library") renderLibrary();
  }

  // ================= Player =================
  const audio = $("#audio");
  const mini = $("#mini"), now = $("#now");
  let hls = null;
  const stopHls = () => { if (hls) { hls.destroy(); hls = null; } };

  function play(s, list, index) {
    if (list) { queue = list; qIndex = index ?? list.indexOf(s); }
    current = s;
    stopHls();
    audio.pause();
    setLoading(true);
    setNowSub(place(s));
    updatePlayerUi();
    addRecent(s);

    if (blocked(s)) { fail("This station's stream isn't secure, so it can't play here."); return; }
    const url = streamUrl(s);
    const isHls = s.hls === 1 || /\.m3u8(\?|$)/i.test(url);
    if (isHls && window.Hls && Hls.isSupported() && !audio.canPlayType("application/vnd.apple.mpegurl")) {
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail("This station isn't available right now."); });
      hls.loadSource(url);
      hls.attachMedia(audio);
    } else {
      audio.src = url;
    }
    audio.play().catch((e) => { if (e.name !== "AbortError") fail("This station isn't available right now."); });
    api(`/json/url/${encodeURIComponent(s.stationuuid)}`).catch(() => {}); // counts the listen on Radio Browser

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: stationName(s), artist: place(s), album: "World Noise",
        artwork: [{ src: "icons/icon-512.png", sizes: "512x512" }],
      });
      // Swap in the station's logo for the lock screen once we have it
      findLogo(s).then((logo) => {
        if (logo && current === s) navigator.mediaSession.metadata.artwork = [{ src: logo.src, sizes: `${logo.w}x${logo.h}` }];
      });
    }
  }
  function playRandom(pool) {
    const ok = pool.filter((s) => !blocked(s));
    if (!ok.length) return;
    const i = Math.floor(Math.random() * ok.length);
    play(ok[i], ok, i);
  }
  function step(dir) {
    if (!queue.length) return;
    for (let n = 1; n <= queue.length; n++) {
      const i = (qIndex + dir * n + queue.length * n) % queue.length;
      if (!blocked(queue[i])) { qIndex = i; play(queue[i]); return; }
    }
  }
  function addRecent(s) {
    recent = [s, ...recent.filter((x) => x.stationuuid !== s.stationuuid)].slice(0, 30);
    store.set(LS.recent, recent);
  }

  function setLoading(on) { mini.classList.toggle("loading", on); now.classList.toggle("loading", on); }
  function setPlayingUi(on) {
    const icon = `<svg><use href="#i-${on ? "pause" : "play"}"/></svg>`;
    $("#mini-play").innerHTML = icon; $("#now-play").innerHTML = icon;
    $("#mini-play").setAttribute("aria-label", on ? "Pause" : "Play");
    $("#now-play").setAttribute("aria-label", on ? "Pause" : "Play");
    now.classList.toggle("playing", on);
  }
  function fail(msg) { setLoading(false); setPlayingUi(false); setNowSub(msg, true); $("#mini-sub").textContent = "Not available"; }
  function setNowSub(text, err = false) { const el = $("#now-sub"); el.textContent = text; el.classList.toggle("error", err); }

  function updatePlayerUi() {
    const s = current;
    if (!s) return;
    mini.hidden = false;
    document.body.classList.add("has-mini");
    $("#mini-title").textContent = stationName(s);
    $("#mini-sub").textContent = place(s);
    art($("#mini-art"), s, null, true);
    art($("#now-art"), s);
    $("#now-title").textContent = stationName(s);
    now.style.setProperty("--now-bg", deep(stationName(s)));
    // Now Playing background: a big blurred copy of the logo (falls back to the colour gradient)
    const bg = $("#now-bg");
    bg.removeAttribute("src");
    bg.hidden = true;
    findLogo(s).then((logo) => { if (logo && current === s) { bg.src = logo.src; bg.hidden = false; } });
    const site = $("#now-site");
    if (s.homepage && /^https?:/.test(s.homepage)) site.href = s.homepage; else site.removeAttribute("href");
    updateFavButtons();
    document.querySelectorAll(".track").forEach((li) => li.classList.toggle("playing", li.dataset.uuid === s.stationuuid));
    document.title = `${stationName(s)} · World Noise`;
  }
  function updateFavButtons() {
    if (!current) return;
    const on = !!favorites[current.stationuuid];
    const b = $("#now-fav");
    b.innerHTML = `<svg><use href="#i-star${on ? "-fill" : ""}"/></svg>`;
    b.classList.toggle("on", on);
    b.setAttribute("aria-label", on ? "Remove from favorites" : "Add to favorites");
  }

  function togglePlay() {
    if (!current) return;
    if (audio.paused) play(current); // rejoin the live broadcast instead of resuming old audio
    else { audio.pause(); stopHls(); setLoading(false); }
  }
  audio.addEventListener("playing", () => { setLoading(false); setPlayingUi(true); if (current) { setNowSub(place(current)); $("#mini-sub").textContent = place(current); } });
  audio.addEventListener("pause", () => setPlayingUi(false));
  audio.addEventListener("waiting", () => setLoading(true));
  audio.addEventListener("error", () => { if (!hls && current && audio.getAttribute("src")) fail("This station isn't available right now."); });

  $("#mini-play").addEventListener("click", togglePlay);
  $("#now-play").addEventListener("click", togglePlay);
  $("#mini-next").addEventListener("click", () => step(1));
  $("#now-next").addEventListener("click", () => step(1));
  $("#now-prev").addEventListener("click", () => step(-1));
  $("#now-fav").addEventListener("click", () => current && toggleFavorite(current));
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", togglePlay);
    ms.setActionHandler("pause", togglePlay);
    ms.setActionHandler("nexttrack", () => step(1));
    ms.setActionHandler("previoustrack", () => step(-1));
  }

  // Volume (iPhone controls volume with its hardware buttons only, so hide the slider there)
  const vol = $("#volume");
  audio.volume = store.get(LS.volume, 1);
  vol.value = audio.volume;
  vol.addEventListener("input", () => { audio.volume = +vol.value; store.set(LS.volume, audio.volume); });
  { const t = new Audio(); t.volume = 0.5; if (t.volume !== 0.5) $("#vol-row").hidden = true; }

  // Now Playing open / close (tap grabber, or swipe down)
  function openNow() { now.classList.add("open"); now.setAttribute("aria-hidden", "false"); }
  function closeNow() { now.classList.remove("open"); now.setAttribute("aria-hidden", "true"); now.style.transform = ""; }
  $("#mini-open").addEventListener("click", openNow);
  $("#now-close").addEventListener("click", closeNow);
  let dragY = null;
  now.addEventListener("touchstart", (e) => { if (now.scrollTop <= 0 && !e.target.closest("input")) dragY = e.touches[0].clientY; }, { passive: true });
  now.addEventListener("touchmove", (e) => {
    if (dragY == null) return;
    const dy = e.touches[0].clientY - dragY;
    if (dy > 0) { now.style.transition = "none"; now.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  now.addEventListener("touchend", (e) => {
    if (dragY == null) return;
    const dy = e.changedTouches[0].clientY - dragY;
    dragY = null;
    now.style.transition = "";
    if (dy > 120) closeNow(); else now.style.transform = "";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && now.classList.contains("open")) closeNow();
    if (e.code === "Space" && current && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); togglePlay(); }
  });

  // ================= Start =================
  (async function init() {
    try { await loadCountries(); } catch (e) { console.error(e); }
    // First visit: start in the visitor's own country (from their language setting, e.g. en-US → US)
    const saved = store.get(LS.settings, null);
    const guess = (navigator.language || "").split("-")[1]?.toUpperCase();
    const start = saved ? saved.country : guess;
    if (start && countries.some((c) => c.iso_3166_1 === start)) country = start;
    $("#country").value = country;
    renderHome();
    renderPlaces();
    renderSearchHome();
    renderLibrary();
  })();
})();
