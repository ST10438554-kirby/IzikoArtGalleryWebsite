/* Iziko Museum web app: single-page, hash-routed, talks to the Python API on the same origin. */
(function () {
  "use strict";
  const $app = document.getElementById("app");
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const IMG_EXT = { artist_azaria_mbatha: "webp", street_scene: "png" };
  const imgUrl = (name) => (name ? "/images/" + name + "." + (IMG_EXT[name] || "jpg") : "");
  const initialsOf = (n) => n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
  const LOGO = "/images/iziko_logo.jpg";
  const $ = (sel, root) => (root || document).querySelector(sel);
  const go = (hash) => { location.hash = hash; };

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    const saved = LS.get("darkMode", null);
    const dark = saved === null ? matchMedia("(prefers-color-scheme: dark)").matches : saved === "1";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? "#1B1714" : "#FAF9F6";
    return dark;
  }
  applyTheme();

  /* ---------- API ---------- */
  const api = {
    base: () => LS.get("serverUrl", "").replace(/\/$/, ""),
    token: () => LS.get("token", ""),
    async call(path, opts) {
      opts = opts || {};
      const headers = { Accept: "application/json" };
      if (opts.body) headers["Content-Type"] = "application/json";
      if (opts.auth && api.token()) headers.Authorization = "Bearer " + api.token();
      let res;
      try {
        res = await fetch(api.base() + path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
      } catch (e) { throw new Error("Can't reach the server. Check your connection and try again."); }
      let data = null; try { data = await res.json(); } catch (e) {}
      if (!res.ok) throw new Error((data && data.error) || "Something went wrong (" + res.status + ").");
      return data;
    },
  };

  /* ---------- auth ---------- */
  const auth = {
    user: (() => { try { return JSON.parse(LS.get("user", "null")); } catch (e) { return null; } })(),
    isIn: () => !!api.token(),
    async login(email, password) {
      const r = await api.call("/api/auth/login", { method: "POST", body: { email, password } });
      LS.set("token", r.token); LS.set("user", JSON.stringify(r.user)); auth.user = r.user;
    },
    async register(fullName, email, password) {
      await api.call("/api/auth/register", { method: "POST", body: { fullName, email, password } });
    },
    async logout() {
      try { await api.call("/api/auth/logout", { method: "POST", auth: true, body: {} }); } catch (e) {}
      LS.del("token"); LS.del("user"); auth.user = null;
    },
  };

  /* ---------- museum data (loaded once, filtered in the browser, offline fallback) ---------- */
  const museum = {
    loaded: false, offline: false, artists: [], artworks: [], exhibitions: [], promise: null,
    ensure() {
      if (museum.loaded) {
        if (museum.offline && Date.now() - museum.last > 15000) museum.load(); // quietly retry
        return Promise.resolve();
      }
      return museum.load();
    },
    load() {
      if (museum.promise) return museum.promise;
      museum.last = Date.now();
      museum.promise = (async () => {
        try {
          const [artists, artworks, exhibitions] = await Promise.all([
            api.call("/api/artists"), api.call("/api/artworks"), api.call("/api/exhibitions")]);
          Object.assign(museum, { artists, artworks, exhibitions, offline: false });
        } catch (e) {
          if (!museum.loaded) {
            try {
              const seed = await (await fetch("/museum_seed.json")).json();
              const byId = {}; seed.artists.forEach((a) => (byId[a.id] = a));
              seed.artworks.forEach((w) => { w.artistName = w.artistName || (byId[w.artistId] || {}).name || ""; });
              Object.assign(museum, { artists: seed.artists, artworks: seed.artworks, exhibitions: seed.exhibitions });
            } catch (e2) {}
          }
          museum.offline = true;
        }
        museum.loaded = true; museum.promise = null;
      })();
      return museum.promise;
    },
    invalidate() { museum.loaded = false; },
    categories: () => [...new Set(museum.artworks.map((w) => w.category))].sort(),
    featured: () => museum.artworks.filter((w) => w.featured),
    artwork: (id) => museum.artworks.find((w) => w.id === id),
    artist: (id) => museum.artists.find((a) => a.id === id),
    worksBy: (id) => museum.artworks.filter((w) => w.artistId === id),
    search(q, cat) {
      q = (q || "").trim().toLowerCase();
      return museum.artworks.filter((w) =>
        (!cat || w.category.toLowerCase() === cat.toLowerCase()) &&
        (!q || w.title.toLowerCase().includes(q) || (w.artistName || "").toLowerCase().includes(q)));
    },
  };

  /* ---------- view templates ---------- */
  const back = (label) => `<button class="back" data-back>‹ ${esc(label || "Back")}</button>`;
  const loading = () => `<div class="loading">Loading…</div>`;

  function artworkCard(w) {
    const img = w.image ? `<div class="thumb"><img src="${imgUrl(w.image)}" alt="${esc(w.title)}" loading="lazy"></div>` : "";
    return `<div class="card item clickable" data-go="#/artwork/${w.id}"><div class="row">${img}
      <div class="info"><div class="cat">${esc(w.category)}</div><div class="title19">${esc(w.title)}</div>
      <div class="meta">${esc(w.artistName)}, ${esc(w.date)}</div>
      ${w.medium ? `<div class="medium">${esc(w.medium)}</div>` : ""}</div></div></div>`;
  }

  function avatar(a, cls) {
    return `<div class="avatar ${cls}">${esc(initialsOf(a.name))}${a.image ? `<img src="${imgUrl(a.image)}" alt="${esc(a.name)}" onerror="this.remove()">` : ""}</div>`;
  }

  /* ---------- screens ---------- */
  const screens = {
    welcome() {
      $app.innerHTML = `<div class="welcome center">
        <img src="${LOGO}" width="180" height="180" alt="Iziko Museum logo" style="object-fit:contain">
        <h1>Discover Iziko</h1>
        <p class="sub">Explore South African art, artists and cultural heritage.</p>
        <button class="btn orange stack" data-go="#/login">Log in</button>
        <button class="btn red stack mt10" data-go="#/register">Create an account</button></div>`;
    },

    login() {
      $app.innerHTML = `<div class="auth center">
        <img src="${LOGO}" width="120" height="120" alt="Iziko Museum logo" style="object-fit:contain">
        <h1 style="font-size:28px;margin:14px 0 20px">Welcome back</h1>
        <input class="field stack" id="email" type="email" placeholder="Email address" autocomplete="email">
        <input class="field stack mt8" id="pw" type="password" placeholder="Password" autocomplete="current-password">
        <div class="err" id="err" hidden></div>
        <button class="btn orange mt16" id="go">Log in</button>
        <button class="btn grey mt8" id="google">Continue with Google (coming soon)</button>
        <button class="link" data-go="#/register">Don't have an account? Register</button></div>`;
      const err = $("#err"), btn = $("#go");
      const submit = async () => {
        const email = $("#email").value.trim(), pw = $("#pw").value;
        if (!email || !pw) { err.hidden = false; err.textContent = "Please enter your email and password."; return; }
        btn.disabled = true; err.hidden = true;
        try { await auth.login(email, pw); go("#/home"); }
        catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
      };
      btn.onclick = submit;
      $("#pw").onkeydown = (e) => { if (e.key === "Enter") submit(); };
      $("#google").onclick = () => toast("Google sign-in is coming soon.");
    },

    register() {
      $app.innerHTML = `<div class="auth center">
        <img src="${LOGO}" width="110" height="110" alt="Iziko Museum logo" style="object-fit:contain">
        <h1 style="font-size:27px;margin:12px 0 18px">Create your account</h1>
        <input class="field stack" id="name" type="text" placeholder="Full name" autocomplete="name">
        <input class="field stack mt8" id="email" type="email" placeholder="Email address" autocomplete="email">
        <input class="field stack mt8" id="pw" type="password" placeholder="Password (at least 8 characters)" autocomplete="new-password">
        <input class="field stack mt8" id="pw2" type="password" placeholder="Confirm password" autocomplete="new-password">
        <div class="err" id="err" hidden></div>
        <button class="btn orange mt16" id="go">Create account</button>
        <button class="link" data-go="#/login">Already have an account? Log in</button></div>`;
      const err = $("#err"), btn = $("#go");
      const fail = (m) => { err.textContent = m; err.hidden = false; btn.disabled = false; };
      btn.onclick = async () => {
        const name = $("#name").value.trim(), email = $("#email").value.trim(), pw = $("#pw").value, pw2 = $("#pw2").value;
        err.hidden = true;
        if (!name) return fail("Please enter your full name.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Please enter a valid email address.");
        if (pw.length < 8) return fail("Use a password with at least 8 characters.");
        if (pw !== pw2) return fail("The passwords do not match.");
        btn.disabled = true;
        try { await auth.register(name, email, pw); await auth.login(email, pw); go("#/home"); }
        catch (e) { fail(e.message); }
      };
    },

    async home() {
      $app.innerHTML = loading();
      await museum.ensure();
      const first = ((auth.user && auth.user.fullName) || "").trim().split(" ")[0];
      const ex = museum.exhibitions[0];
      const feat = museum.featured();
      $app.innerHTML = `
      <div class="hero"><img class="bg" src="/images/museum_hero.jpg" alt="The Iziko South African National Gallery building">
        <div class="scrim"></div>
        <button class="btn outline set" data-go="#/settings">Settings</button>
        <div class="txt"><div class="eyebrow">IZIKO SOUTH AFRICAN NATIONAL GALLERY</div>
          <h1>${first ? "Welcome, " + esc(first) : "Welcome"}</h1>
          <p>Explore South African art, artists and cultural heritage.</p></div></div>
      ${museum.offline ? `<div class="notice">Can't reach the server, so you are seeing saved data. You can change the server address in Settings.</div>` : ""}
      <div class="pad">
        <div class="eyebrow sm">EXPLORE</div>
        ${tile("#/artworks", "revelation_of_st_john", "Explore Artwork", "Browse and search the collection", true)}
        ${tile("#/artists", "the_kraal", "Discover Artists", "The people behind the work")}
        ${tile("#/exhibitions", "gallery_event", "Exhibitions", "What is on at the gallery")}
        ${ex ? `<div class="eyebrow sm" style="margin-top:32px">NOW SHOWING</div>
          <div class="card clickable mt10" data-go="#/exhibitions"><div class="row">
            <div class="thumb">${ex.image ? `<img src="${imgUrl(ex.image)}" alt="${esc(ex.title)}">` : ""}</div>
            <div class="info"><div class="status">${esc(ex.status)}</div>
              <div style="font-size:17px;font-weight:700;margin-top:2px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(ex.title)}</div>
              <div style="color:var(--red);font-size:14px;margin-top:2px">${esc(ex.dates)}</div></div></div></div>` : ""}
        ${feat.length ? `<div class="eyebrow sm" style="margin-top:32px">FEATURED WORKS</div>
          <div class="featured-row">${feat.map((w) => `<div class="card fcard clickable" data-go="#/artwork/${w.id}">
            <div class="im">${w.image ? `<img src="${imgUrl(w.image)}" alt="${esc(w.title)}" loading="lazy">` : ""}</div>
            <div class="b"><div class="ft">${esc(w.title)}</div><div class="fa">${esc(w.artistName)}</div></div></div>`).join("")}</div>` : ""}
        <button class="btn text" style="margin-top:28px" id="logout">Log out</button></div>`;
      $("#logout").onclick = async () => { await auth.logout(); go("#/"); };
      function tile(href, img, t, s, first) {
        return `<button class="tile ${first ? "first" : ""}" data-go="${href}"><img src="${imgUrl(img)}" alt="">
          <div class="scrim"></div><div class="t"><h3>${t}</h3><span>${s}</span></div></button>`;
      }
    },

    async artworks() {
      $app.innerHTML = loading();
      await museum.ensure();
      let cat = null;
      $app.innerHTML = `<div class="sticky">${back("Home")}
        <h1 class="h28">Explore Artwork</h1>
        <p class="sub16">Works linked to the Iziko South African National Gallery. Tap an artwork to read more.</p>
        <div class="search"><label for="q">Search by title or artist</label><input id="q" type="text" autocomplete="off"></div>
        <div class="chips" id="chips"></div></div>
        <div class="list" id="list"></div><div class="empty" id="empty" hidden>No artworks match your search. Try a different title, artist or category.</div>`;
      const chips = $("#chips"), list = $("#list"), empty = $("#empty"), q = $("#q");
      const names = ["All"].concat(museum.categories());
      const drawChips = () => { chips.innerHTML = names.map((n) => `<button class="chip ${(cat || "All") === n ? "on" : ""}" data-c="${esc(n)}">${esc(n)}</button>`).join(""); };
      const render = () => {
        const r = museum.search(q.value, cat);
        list.innerHTML = r.map(artworkCard).join("");
        empty.hidden = r.length > 0;
      };
      chips.onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; cat = b.dataset.c === "All" ? null : b.dataset.c; drawChips(); render(); };
      q.oninput = render; drawChips(); render();
    },

    async artwork(id) {
      $app.innerHTML = loading();
      await museum.ensure();
      const w = museum.artwork(id);
      if (!w) { toast("Sorry, that artwork could not be found."); return history.back(); }
      const facts = [["Date", w.date], ["Medium", w.medium], ["Size", w.dimensions], ["Collection", w.acquisition]].filter((f) => f[1]);
      $app.innerHTML = `<div class="pad">${back()}
        ${w.image ? `<div class="dimg"><img src="${imgUrl(w.image)}" alt="${esc(w.title)} by ${esc(w.artistName)}"></div>` : `<div class="banner"></div>`}
        <div class="d-cat">${esc(w.category)}</div>
        <h1 class="d-title">${esc(w.title)}</h1>
        <button class="d-artist" data-go="#/artist/${w.artistId}">${esc(w.artistName)}</button>
        <div class="card facts">${facts.map((f) => `<div class="fact"><div class="l">${f[0]}</div><div class="v">${esc(f[1])}</div></div>`).join("")}</div>
        <h2 class="h20" style="margin-top:24px">About this work</h2>
        <p class="desc">${esc(w.description)}</p></div>`;
    },

    async artists() {
      $app.innerHTML = loading();
      await museum.ensure();
      $app.innerHTML = `<div class="pad">${back("Home")}<h1 class="h28">Discover Artists</h1>
        <p class="sub16">Learn about the artists represented in the collection. Tap an artist to read more.</p>
        <div style="margin-top:8px">${museum.artists.map((a) => {
          const n = museum.worksBy(a.id).length;
          const det = [a.lifespan, a.origin].filter(Boolean).join(" · ");
          return `<div class="card clickable" style="margin-top:10px" data-go="#/artist/${a.id}"><div class="row pad14" style="padding:14px">
            ${avatar(a, "s64")}<div class="info"><div class="title19" style="margin-top:0">${esc(a.name)}</div>
            <div class="meta">${esc(det)}</div>
            ${n ? `<div class="works">${n} ${n === 1 ? "ARTWORK" : "ARTWORKS"} IN THE COLLECTION</div>` : ""}</div></div></div>`;
        }).join("")}</div></div>`;
    },

    async artist(id) {
      $app.innerHTML = loading();
      await museum.ensure();
      const a = museum.artist(id);
      if (!a) { toast("Sorry, that artist could not be found."); return history.back(); }
      const works = museum.worksBy(a.id);
      const info = [a.lifespan, a.origin].filter(Boolean).join(" · ");
      $app.innerHTML = `<div class="pad">${back()}
        <div style="display:flex;align-items:center">${avatar(a, "s96")}
          <div style="flex:1;min-width:0"><h1 class="d-name">${esc(a.name)}</h1><div class="d-info">${esc(info)}</div></div></div>
        <p class="bio">${esc(a.biography)}</p>
        ${works.length ? `<h2 class="h20" style="margin-top:28px">Artworks</h2><div>${works.map(artworkCard).join("")}</div>` : ""}</div>`;
    },

    async exhibitions() {
      $app.innerHTML = loading();
      await museum.ensure();
      $app.innerHTML = `<div class="pad">${back("Home")}<h1 class="h28">Exhibitions</h1>
        <p class="sub16">What is on at the Iziko South African National Gallery.</p>
        ${museum.exhibitions.map((e) => `<div class="card ex"><div class="top">
          <div class="im">${e.image ? `<img src="${imgUrl(e.image)}" alt="${esc(e.title)}">` : ""}</div>
          <div style="flex:1;min-width:0"><div class="status">${esc(e.status)}</div>
            <div class="title19">${esc(e.title)}</div><div class="dates">${esc(e.dates)}</div></div></div>
          ${e.curator ? `<div class="cur">Curated by ${esc(e.curator)}</div>` : ""}
          <p class="sum">${esc(e.summary)}</p></div>`).join("")}
        <div class="card visit"><h3>Plan your visit</h3>
          <p>Government Avenue, Company Garden, Cape Town 8001
Free entry on Fridays for South African students and pensioners with valid cards.
For current opening hours and ticket prices visit www.iziko.org.za or email info@iziko.org.za.</p></div></div>`;
    },

    settings() {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      const notif = LS.get("notifications", "1") === "1";
      $app.innerHTML = `<div class="pad">${back("Home")}<h1 class="h28">Settings</h1>
        <div class="sec">Account</div>
        <div class="card panel"><div class="n">${esc((auth.user && auth.user.fullName) || "Guest")}</div>
          <div class="e">${esc((auth.user && auth.user.email) || "Not signed in")}</div></div>
        <div class="sec">Preferences</div>
        <div class="card panel">
          <div class="sw"><span>Dark mode</span><button class="switch ${dark ? "on" : ""}" id="dark" role="switch" aria-checked="${dark}" aria-label="Dark mode"></button></div>
          <div class="sw"><span>News about exhibitions and events</span><button class="switch ${notif ? "on" : ""}" id="notif" role="switch" aria-checked="${notif}" aria-label="Notifications"></button></div></div>
        <div class="sec">About</div>
        <div class="card panel about"><div style="font-size:16px;font-weight:700">Iziko South African National Gallery</div>
          <p>Government Avenue, Company Garden, Cape Town 8001
The national collection was founded in 1872 and the current building opened to the public on 3 November 1930.
www.iziko.org.za | info@iziko.org.za</p>
          <p style="font-size:14px;color:var(--grey)">Version 1.0</p></div>
        <button class="btn text" style="margin-top:20px" id="logout">Log out</button></div>`;
      const flip = (el, on) => { el.classList.toggle("on", on); el.setAttribute("aria-checked", on); };
      $("#dark").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); LS.set("darkMode", on ? "1" : "0"); applyTheme(); flip(e.currentTarget, on); };
      $("#notif").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); LS.set("notifications", on ? "1" : "0"); flip(e.currentTarget, on); };
      $("#logout").onclick = async () => { await auth.logout(); go("#/"); };
    },
  };

  /* ---------- router ---------- */
  const PUBLIC = ["", "login", "register"];
  async function route() {
    const parts = (location.hash.replace(/^#\/?/, "") || "").split("/");
    const name = parts[0], id = parseInt(parts[1], 10);
    if (auth.isIn() && PUBLIC.includes(name)) return go("#/home");
    if (!auth.isIn() && !PUBLIC.includes(name)) return go("#/");
    window.scrollTo(0, 0);
    const fn0 = { "": "welcome", login: "login", register: "register", home: "home", artworks: "artworks", artwork: "artwork",
      artists: "artists", artist: "artist", exhibitions: "exhibitions", settings: "settings" }[name];
    const run = fn0 ? screens[fn0] : (window.Iziko.extra || {})[name];
    if (!run) return go(auth.isIn() ? "#/home" : "#/");
    document.title = "Iziko Museum";
    await run(id);
    if (window.Iziko.after) window.Iziko.after(name);
  }
  window.addEventListener("hashchange", route);

  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); go(g.dataset.go); return; }
    if (e.target.closest("[data-back]")) { history.length > 1 ? history.back() : go("#/home"); }
  });
  window.Iziko = { screens, api, auth, museum, LS, esc, imgUrl, go, toast, $, $app, back, route, LOGO };
})();
