/* SA National Gallery (Iziko): hash-routed single page site. Data comes from the REST API, falling back to museum_seed.json.
 * References (Harvard style):
 *  Firebase (2026) Authenticate using Google with JavaScript. Available at: https://firebase.google.com/docs/auth/web/google-signin (Accessed: 15 November 2026).
 *  MDN Web Docs (2026) Window: localStorage property. Available at: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage (Accessed: 15 November 2026).
 *  MDN Web Docs (2026) Fetch API. Available at: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API (Accessed: 15 November 2026).
 *  MDN Web Docs (2026) Window: hashchange event. Available at: https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event (Accessed: 15 November 2026).
 *  W3C (2026) ARIA Authoring Practices Guide. Available at: https://www.w3.org/WAI/ARIA/apg/ (Accessed: 15 November 2026).
 */
(() => {
"use strict";
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
/* Logging: every key action is written to the browser console (F12) so the program flow can be followed. */
const log = (...a) => console.log("[Iziko]", ...a);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ext = { artist_azaria_mbatha: "webp", street_scene: "png" };
const img = (n) => (n ? `/images/${n}.${ext[n] || "jpg"}` : "");
const BOOK = "https://www.webtickets.co.za/v2/Client.aspx?clientcode=izikomuseum";
const MAPQ = encodeURIComponent("Iziko South African National Gallery, Government Avenue, Cape Town");
/* ---- state: progress is kept in localStorage; try/catch because browsers can block storage (MDN Web Docs, 2026) ---- */
const defs = { saved: [], quiz: {}, daily: { last: "", streak: 0, count: 0 }, pts: 0, lang: "en", dark: null };
let S = JSON.parse(JSON.stringify(defs));
try { Object.assign(S, JSON.parse(localStorage.getItem("izikoState") || "{}")); } catch (e) {}
const save = () => { try { localStorage.setItem("izikoState", JSON.stringify(S)); } catch (e) {} };
const toast = (m) => { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); };
const addPts = (n) => { S.pts += n; save(); log("points +" + n + " -> total", S.pts); };
/* ---- auth: the same /api/auth/firebase endpoint is used by the Android app, so one Google account works on both (Firebase, 2026) ---- */
const AUTH = { token: () => localStorage.getItem("izikoToken") || "", user: () => { try { return JSON.parse(localStorage.getItem("izikoUser") || "null"); } catch (e) { return null; } },
  set(r) { try { localStorage.setItem("izikoToken", r.token); localStorage.setItem("izikoUser", JSON.stringify(r.user)); } catch (e) {} },
  clear() { try { localStorage.removeItem("izikoToken"); localStorage.removeItem("izikoUser"); } catch (e) {} } };
async function post(path, body, auth) {
  log("POST", path);
  let r; try { r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer " + AUTH.token() } : {}) }, body: JSON.stringify(body || {}) }); } catch (e) { throw new Error("Can't reach the server. Check your connection and try again."); }
  let d = null; try { d = await r.json(); } catch (e) {} if (!r.ok) throw new Error((d && d.error) || "Something went wrong (" + r.status + ")."); return d;
}
const loadScript = (src) => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("Couldn't load Google sign-in. Check your connection.")); document.head.appendChild(s); });
async function googleSignIn() {
  const cfg = window.FIREBASE_CONFIG || {}; if (!cfg.apiKey) throw new Error("Google sign-in isn't set up yet. Add your Firebase keys in firebase-config.js.");
  if (!window.firebase) { await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"); await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"); firebase.initializeApp(cfg); }
  const c = await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
  AUTH.set(await post("/api/auth/firebase", { idToken: await c.user.getIdToken() })); log("Google sign-in ok:", c.user.email);
}
/* ---- i18n (navigation + key headings) ---- */
const NAV = [["home", "Home"], ["artworks", "Artworks"], ["artists", "Artists"], ["exhibitions", "Exhibitions"], ["quiz", "Quiz"], ["visit", "Visit"], ["collection", "My Collection"], ["tour", "Virtual Tour"], ["challenge", "Art Challenge"]];
const LANGS = { en: "English", af: "Afrikaans", zu: "isiZulu", xh: "isiXhosa" };
const TR = {
  af: ["Tuis", "Kunswerke", "Kunstenaars", "Uitstallings", "Vasvra", "Besoek", "My Versameling", "Virtuele Toer", "Kunsuitdaging", "Verken Kunswerke", "Beplan Jou Besoek", "Galery-feite"],
  zu: ["Ikhaya", "Imidwebo", "Abadwebi", "Imibukiso", "Imibuzo", "Vakashela", "Iqoqo Lami", "Uhambo Lwangempela", "Inselelo Yobuciko", "Hlola Imidwebo", "Hlela Uhambo Lwakho", "Amaqiniso Egalari"],
  xh: ["Ikhaya", "Imisebenzi yobugcisa", "Amagcisa", "Imiboniso", "Imibuzo", "Utyelelo", "Ingqokelela Yam", "Uhambo lwe-Virtual", "Umceli-mngeni Wobugcisa", "Phonononga Ubugcisa", "Cwangcisa Utyelelo Lwakho", "Iinyani Zegalari"] };
const KEYS = NAV.map((n) => n[1]).concat(["Explore Artworks", "Plan Your Visit", "Gallery Facts"]);
const t = (k) => { const i = KEYS.indexOf(k); return i >= 0 && TR[S.lang] ? TR[S.lang][i] : k; };
/* ---- data ---- */
const M = { artists: [], artworks: [], exhibitions: [] };
/* Load data from the API; if the server is unreachable use the bundled seed file (offline fallback, MDN Web Docs, 2026). */
async function load() {
  try {
    const g = async (p) => { const r = await fetch(p); if (!r.ok) throw 0; return r.json(); };
    [M.artists, M.artworks, M.exhibitions] = await Promise.all([g("/api/artists"), g("/api/artworks"), g("/api/exhibitions")]); log("data loaded from API");
  } catch (e) { log("API unreachable, using museum_seed.json"); const s = await (await fetch("/museum_seed.json")).json(); Object.assign(M, s); }
  const by = {}; M.artists.forEach((a) => (by[a.id] = a)); M.artworks.forEach((w) => (w.artistName = w.artistName || (by[w.artistId] || {}).name || ""));
}
const art = (id) => M.artworks.find((w) => w.id === +id);
/* ---- content ---- */
const FACTS = ["The gallery officially opened to the public on 3 November 1930.", "It is South Africa's national art gallery, part of Iziko Museums of South Africa.", "The collection includes over 10,000 artworks spanning five centuries.", "The gallery holds South African, African and international works side by side.", "It is in Company's Garden, Cape Town, one of South Africa's oldest gardens, established in 1652.", "Its origins trace to the South African Fine Arts Association, founded in 1850.", "The national collection began in 1872 with a donation from Thomas Butterworth Bayley.", "The Sir Abe Bailey Bequest (1940) is the largest in the gallery's history, with over 400 works.", "It holds one of the largest collections of British sporting art in any public museum.", "Educational programmes serve thousands of school learners across South Africa each year."];
const QUIZ = {
  Beginner: { e: "🎨", d: "Gallery basics and opening facts", q: [
    ["When did the gallery officially open?", ["1872", "1930", "1950", "2001"], 1], ["Where is the gallery?", ["Company's Garden, Cape Town", "Sandton, Johannesburg", "Durban beachfront", "Stellenbosch"], 0],
    ["Which group is the gallery part of?", ["Iziko Museums of South Africa", "Robben Island Museum", "Apartheid Museum", "Zeitz MOCAA"], 0], ["The collection spans how many centuries?", ["Five", "One", "Two", "Ten"], 0], ["Who made The Butcher Boys?", ["Jane Alexander", "Irma Stern", "Gerard Sekoto", "Pieter Wenning"], 0]] },
  Explorer: { e: "🌟", d: "Artists, artworks and key dates", q: [
    ["Who made the linocut The Revelation of St John?", ["Azaria Mbatha", "William Kentridge", "Thomas Baines", "Anton van Wouw"], 0], ["Who made African Head, bought in 1926?", ["Anton van Wouw", "Neville Lewis", "Irma Stern", "Alexis Preller"], 0],
    ["What medium are Kentridge's Soho Eckstein works?", ["Animated film", "Bronze", "Tapestry", "Photography"], 0], ["In which year did Irma Stern first travel to Zanzibar?", ["1939", "1925", "1951", "1966"], 0], ["Who gave the donation that began the national collection in 1872?", ["Thomas Butterworth Bayley", "Abe Bailey", "Cecil Rhodes", "Thomas Baines"], 0]] },
  Curator: { e: "🏆", d: "Deep history and provenance", q: [
    ["When was the South African Fine Arts Association founded?", ["1850", "1872", "1914", "1930"], 0], ["In which year was the Sir Abe Bailey Bequest made?", ["1940", "1926", "1972", "2001"], 0],
    ["How many items did the Sekoto Study Collection add in 2000?", ["More than 2 500", "About 40", "About 300", "About 800"], 0], ["In which year did the gallery become part of Iziko?", ["2001", "1930", "1950", "1990"], 0], ["Construction of the current building began in?", ["1914", "1872", "1926", "1930"], 0]] } };
const DAILY = [[1, "The Butcher Boys represents which of the following themes?", ["Beauty and nature", "Dehumanisation and apartheid", "Celebration of sport", "Colonial exploration"], 1], [2, "The Revelation of St John was made using which technique?", ["Linocut", "Oil on canvas", "Bronze casting", "Watercolour"], 0], [4, "Who made African Head?", ["Anton van Wouw", "Gerard Sekoto", "Thomas Baines", "Neville Lewis"], 0], [11, "How many Soho Eckstein films does the gallery hold?", ["Two", "Five", "Nine", "Twelve"], 1], [6, "Who painted Two Arabs, Dakar?", ["Irma Stern", "Pieter Wenning", "Alexis Preller", "Neville Lewis"], 0]];
const LEVELS = [["Curious Visitor", 0, "You've started exploring the gallery."], ["Art Enthusiast", 100, "You know the key artworks and artists."], ["Art Explorer", 300, "You're diving into history and context."], ["Junior Curator", 600, "You understand provenance and technique."], ["Gallery Master", 1000, "The collection holds no secrets from you."]];
/* Explorer level = the highest level whose point threshold has been reached. */
const lvlOf = () => LEVELS.reduce((a, l, i) => (S.pts >= l[1] ? i : a), 0);
const BADGES = [["🎨", "Gallery Visitor", "Complete your first quiz", () => Object.keys(S.quiz).length > 0], ["🌟", "Art Explorer", "Score 70%+ on any quiz", () => Object.values(S.quiz).some((v) => v >= 70)], ["🏆", "Junior Curator", "Complete all three difficulty levels", () => Object.keys(QUIZ).every((k) => k in S.quiz)], ["💎", "Art Master", "Score 100% on the hard quiz", () => S.quiz.Curator === 100], ["⚡", "Daily Challenger", "Complete 5 daily challenges", () => S.daily.count >= 5], ["❤️", "Collector", "Save 5 artworks to My Collection", () => S.saved.length >= 5]];
const today = () => new Date().toISOString().slice(0, 10);
/* ---- chrome ---- */
function chrome() {
  $("#top").innerHTML = `<div class="bar"><a class="brand" href="#/home"><img src="/images/iziko_logo.jpg" alt=""><span>SA National Gallery</span></a>
  <button class="ib burger" id="bg" aria-label="Menu" aria-expanded="false">☰</button>
  <nav id="nav" aria-label="Main">${NAV.map((n) => `<a href="#/${n[0]}" data-r="${n[0]}">${esc(t(n[1]))}</a>`).join("")}</nav>
  <div class="tools">${AUTH.token() ? `<button class="ib" id="lo" title="Log out">${esc(((AUTH.user() || {}).fullName || "Account").split(" ")[0])} · Log out</button>` : `<a class="ib" href="#/login" id="li">Log in</a>`}<button class="ib" id="lg" aria-haspopup="true" aria-label="Language">🌐 ${S.lang.toUpperCase()}</button><button class="ib" id="dk" aria-label="Toggle dark mode">${document.documentElement.dataset.theme === "dark" ? "☀" : "☾"}</button>
  <div class="menu" id="lm" hidden>${Object.entries(LANGS).map(([k, v]) => `<button data-l="${k}" class="${k === S.lang ? "on" : ""}"><small>ZA</small> ${v}</button>`).join("")}</div></div></div>`;
  $("#bg").onclick = () => { const o = $("#nav").classList.toggle("open"); $("#bg").setAttribute("aria-expanded", o); };
  if ($("#lo")) $("#lo").onclick = async () => { try { await post("/api/auth/logout", {}, true); } catch (e) {} AUTH.clear(); try { window.firebase && firebase.auth().signOut(); } catch (e) {} chrome(); toast("You are logged out"); location.hash = "#/home"; };
  $("#lg").onclick = () => ($("#lm").hidden = !$("#lm").hidden);
  $$("#lm button").forEach((b) => (b.onclick = () => { S.lang = b.dataset.l; save(); log("language:", S.lang); document.documentElement.lang = S.lang; chrome(); route(); }));
  $("#dk").onclick = () => { S.dark = document.documentElement.dataset.theme !== "dark"; save(); log("dark mode:", S.dark); theme(); chrome(); markNav(); };
  $("#foot").innerHTML = `<div class="wrap"><div class="fg"><div><img src="/images/iziko_logo.jpg" alt="Iziko"><small>Part of Iziko Museums of South Africa. Government Avenue, Company's Garden, Cape Town.</small></div>
  <div><h4>EXPLORE</h4>${["artworks", "artists", "exhibitions", "quiz", "visit", "collection"].map((r) => `<a href="#/${r}">${esc(t(NAV.find((n) => n[0] === r)[1]))}</a>`).join("")}</div>
  <div><h4>CONTACT</h4><a href="tel:+27214674660">+27 21 467 4660</a><a href="mailto:isang@iziko.org.za">isang@iziko.org.za</a><small>Mon–Sun: 09:00 – 17:00</small></div></div>
  <div class="copy"><small>© 2026 Iziko South African National Gallery</small><span><a href="#/info/about">About</a><a href="#/info/faq">FAQ</a><a href="#/info/accessibility">Accessibility</a></span></div></div>`;
}
const markNav = () => { const r = (location.hash.split("/")[1] || "home"); $$("#nav a").forEach((a) => { const on = a.dataset.r === r || (r === "artwork" && a.dataset.r === "artworks") || (r === "artist" && a.dataset.r === "artists"); a.classList.toggle("on", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); }); };
function theme() { const d = S.dark === null ? matchMedia("(prefers-color-scheme: dark)").matches : S.dark; document.documentElement.dataset.theme = d ? "dark" : "light"; }
/* ---- components ---- */
const heart = (id) => `<button class="heart ${S.saved.includes(id) ? "on" : ""}" data-h="${id}" aria-pressed="${S.saved.includes(id)}" aria-label="Save to My Collection">${S.saved.includes(id) ? "♥" : "♡"}</button>`;
const card = (w) => `<article class="art">${heart(w.id)}<div class="im">${w.image ? `<img src="${img(w.image)}" alt="${esc(w.title)}" loading="lazy">` : "Image not available"}</div><div class="b"><div class="c">${esc(w.category)}</div><h3>${esc(w.title)}</h3><div class="m">${esc(w.artistName)}${w.date ? ", " + esc(w.date) : ""}</div></div><a class="s" href="#/artwork/${w.id}" aria-label="${esc(w.title)}"></a></article>`;
const head = (e, h, p) => `<div class="eyebrow">${e}</div><h1 class="t">${esc(h)}</h1>${p ? `<p class="lead">${p}</p>` : ""}`;
const hours = `<div class="hr"><span>Monday – Sunday</span><b>09:00 – 17:00</b></div>`;
/* ---- pages ---- */
const P = {
  home() {
    const ex = M.exhibitions.slice(0, 2), feat = M.artworks.filter((w) => w.featured && w.image).slice(0, 4);
    return `<section class="hero"><div class="wrap"><span class="tag">EST. 1930 · CAPE TOWN</span><h1>Iziko South African <em>National Gallery</em></h1><p>South Africa's premier public art museum. Over 10,000 artworks spanning five centuries, in the heart of Company's Garden, Cape Town.</p><div class="btns"><a class="btn" href="#/artworks">${esc(t("Explore Artworks"))} ›</a><a class="btn ghost" href="#/visit">${esc(t("Plan Your Visit"))}</a></div></div></section>
    <div class="quick"><div class="in">${[["🖼️", "artworks", "Artworks"], ["🎨", "artists", "Artists"], ["🗓️", "exhibitions", "Exhibitions"], ["🏆", "quiz", "Quiz"]].map((q) => `<a href="#/${q[1]}"><span>${q[0]}</span>${esc(t(q[2]))}<span>›</span></a>`).join("")}</div></div>
    <section class="sec"><div class="wrap two"><div class="hist"><div class="eyebrow">Our history</div><h2 class="t">Over a century of South African art</h2>
    <p>The origins of the gallery trace to the South African Fine Arts Association, founded in <b>1850</b>. The national collection began in <b>1872</b> through a donation from Thomas Butterworth Bayley.</p><p>Construction of the current building began in <b>1914</b>. The gallery officially opened on <b>3 November 1930</b>.</p><p>In <b>2001</b> it became part of Iziko Museums of South Africa. Today the collection spans paintings, sculpture, photography, beadwork, textiles and architecture from South African, African and international artists.</p></div>
    <div><div class="box red"><h3>🕘 Opening Hours</h3>${hours}<p style="font-size:13px;margin-top:12px;opacity:.85">Closed on Christmas Day and Workers Day (1 May).</p></div><div class="box"><h3>📍 Location</h3><p style="color:var(--mute)">Government Avenue<br>Company's Garden<br>Cape Town, South Africa</p><a class="lk" href="https://www.google.com/maps/dir/?api=1&destination=${MAPQ}" target="_blank" rel="noopener">Get directions ›</a></div></div></div></section>
    <section class="sec alt"><div class="wrap"><div class="eyebrow">Featured</div><h2 class="t">Highlights from the collection</h2><div class="grid">${feat.map(card).join("")}</div></div></section>
    <section class="sec"><div class="wrap"><div class="eyebrow">Now showing</div><h2 class="t">Exhibitions</h2>${ex.map(exCard).join("")}</div></section>
    <section class="sec alt"><div class="wrap"><div class="eyebrow">Did you know?</div><h2 class="t">${esc(t("Gallery Facts"))}</h2><div class="facts">${FACTS.map((f, i) => `<div><b>${String(i + 1).padStart(2, "0")}</b><span>${f}</span></div>`).join("")}</div></div></section>`;
  },
  artworks() {
    return `<section class="sec"><div class="wrap">${head("Collection", t("Explore Artworks"), "Search by title or artist, then tap the heart to save a work to My Collection.")}<div class="bar2"><input id="q" type="search" placeholder="Search by title or artist" aria-label="Search artworks"><div id="chips" style="display:flex;gap:8px;flex-wrap:wrap"></div></div><div class="grid" id="list"></div><div class="empty" id="none" hidden><h3>No artworks match your search</h3><p>Try a different title, artist or category.</p></div></div></section>`;
  },
  artworksInit() {
    let cat = ""; const cats = ["", ...new Set(M.artworks.map((w) => w.category))];
    const go = () => { const q = $("#q").value.trim().toLowerCase(), r = M.artworks.filter((w) => (!cat || w.category === cat) && (!q || (w.title + w.artistName).toLowerCase().includes(q))); $("#list").innerHTML = r.map(card).join(""); $("#none").hidden = r.length > 0;
      $("#chips").innerHTML = cats.map((c) => `<button class="chip ${c === cat ? "on" : ""}" data-c="${esc(c)}">${c || "All"}</button>`).join(""); };
    $("#q").oninput = go; $("#chips").onclick = (e) => { const b = e.target.closest("[data-c]"); if (b) { cat = b.dataset.c; go(); } }; go();
  },
  artwork(id) {
    const w = art(id); if (!w) return `<section class="sec"><div class="wrap"><div class="empty"><h3>Artwork not found</h3><a class="btn" href="#/artworks">Back to artworks</a></div></div></section>`;
    const f = [["Date", w.date], ["Medium", w.medium], ["Size", w.dimensions], ["Collection", w.acquisition]].filter((x) => x[1]);
    return `<section class="sec"><div class="wrap"><button class="back" onclick="history.back()">‹ Back</button><div class="detail"><div style="position:relative">${w.image ? `<img src="${img(w.image)}" alt="${esc(w.title)} by ${esc(w.artistName)}">` : ""}${heart(w.id)}</div><div><div class="eyebrow">${esc(w.category)}</div><h1 class="t">${esc(w.title)}</h1><a href="#/artist/${w.artistId}" style="color:var(--amber)">${esc(w.artistName)}</a><dl>${f.map((x) => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join("")}</dl><p class="lead">${esc(w.description)}</p></div></div></div></section>`;
  },
  artists() { return `<section class="sec"><div class="wrap">${head("People", "Artists", "The artists represented in the collection.")}<div class="grid">${M.artists.map((a) => `<article class="art"><div class="im">${a.image ? `<img src="${img(a.image)}" alt="${esc(a.name)}" loading="lazy">` : esc(a.name)}</div><div class="b"><div class="c">${esc([a.lifespan, a.origin].filter(Boolean).join(" · "))}</div><h3>${esc(a.name)}</h3><div class="m">${M.artworks.filter((w) => w.artistId === a.id).length} artwork(s) in the collection</div></div><a class="s" href="#/artist/${a.id}" aria-label="${esc(a.name)}"></a></article>`).join("")}</div></div></section>`; },
  artist(id) { const a = M.artists.find((x) => x.id === +id); if (!a) return P.artwork(0); return `<section class="sec"><div class="wrap"><button class="back" onclick="history.back()">‹ Back</button><div class="detail"><div>${a.image ? `<img src="${img(a.image)}" alt="${esc(a.name)}">` : ""}</div><div><div class="eyebrow">${esc([a.lifespan, a.origin].filter(Boolean).join(" · "))}</div><h1 class="t">${esc(a.name)}</h1><p class="lead">${esc(a.biography)}</p></div></div><div class="grid">${M.artworks.filter((w) => w.artistId === a.id).map(card).join("")}</div></div></section>`; },
  exhibitions() { return `<section class="sec"><div class="wrap">${head("What's on", "Exhibitions", "Current and recent exhibitions at the gallery.")}${M.exhibitions.map(exCard).join("")}</div></section>`; },
  quiz() { return `<section class="sec"><div class="wrap" id="qz">${head("Test your knowledge", "Art Quiz", "Choose a difficulty level and earn your badge. Share your score with friends!")}<div class="levels">${Object.entries(QUIZ).map(([k, v]) => `<button class="lv" data-lv="${k}"><div class="e">${v.e}</div><h3>${k}</h3><p>${v.d}</p>${k in S.quiz ? `<small>Best: ${S.quiz[k]}%</small>` : ""}</button>`).join("")}</div></div></section>`; },
  quizInit() { $$("[data-lv]").forEach((b) => (b.onclick = () => runQuiz(b.dataset.lv))); },
  visit() {
    return `<section class="vh"><div class="wrap"><div class="eyebrow">Plan ahead</div><h1 style="font-size:clamp(34px,5vw,56px)">Visit the Gallery</h1></div></section><section class="sec"><div class="wrap"><div class="cols">
    <div class="box"><h3>🎟️ Ticket Prices</h3>${[["Adults", 60], ["Children (5–17)", 40], ["Students", 40], ["Pensioners", 40]].map((r) => `<div class="hr"><span>${r[0]}</span><b style="color:var(--rust)">R${r[1]}</b></div>`).join("")}<p style="font-size:13px;color:var(--mute);margin-top:14px">Free entry for SA pensioners and students on Fridays with valid ID.</p><a class="btn" style="margin-top:14px" href="${BOOK}" target="_blank" rel="noopener">Book tickets online</a></div>
    <div class="box"><h3>🕘 Opening Hours</h3>${hours}<div class="hr"><span>Christmas Day</span><span class="cl">Closed</span></div><div class="hr"><span>Workers Day (1 May)</span><span class="cl">Closed</span></div></div>
    <div class="box"><h3>📍 Location</h3><p style="color:var(--mute)">Government Avenue<br>Company's Garden<br>Cape Town<br>South Africa</p><a class="lk" href="https://www.google.com/maps/search/?api=1&query=${MAPQ}" target="_blank" rel="noopener">Open in Google Maps ›</a></div></div>
    <iframe title="Map of the gallery" loading="lazy" src="https://www.google.com/maps?q=${MAPQ}&z=16&output=embed"></iframe>
    <h2 class="t" style="margin-top:48px;font-size:28px">Gallery Floor Map</h2><div class="floors">${[["GROUND FLOOR", ["Entrance Hall", "Sir Abe Bailey", "Sculpture Court", "Shop"]], ["FIRST FLOOR", ["South African Art", "Contemporary", "Photography", "Café"]], ["SECOND FLOOR", ["Temp. Exhibitions", "Education Suite", "Storage / Study"]]].map((f) => `<div class="fl"><h4>${f[0]}</h4>${f[1].map((r) => `<div>${r}</div>`).join("")}</div>`).join("")}</div><p style="text-align:center;font-size:13px;color:var(--mute);margin-top:8px">Schematic only, not to scale.</p>
    <h2 class="t" style="margin-top:48px;font-size:28px">Nearby Attractions</h2><div class="cols">${[["Company's Garden", "Park / Garden · Adjacent"], ["Iziko South African Museum", "Natural History · 100m"], ["South African Jewish Museum", "Museum · 200m"], ["District Six Museum", "Heritage Museum · 1.2km"], ["Zeitz MOCAA", "Contemporary Art · 2.4km"]].map((n) => `<div class="near"><span>📍</span><div>${n[0]}<small>${n[1]}</small></div></div>`).join("")}</div></div></section>`;
  },
  collection() { const l = S.saved.map(art).filter(Boolean); return `<section class="sec"><div class="wrap">${head("Personal", "My Collection", `${l.length} saved artworks`)}${l.length ? `<div class="grid">${l.map(card).join("")}</div>` : `<div class="empty"><div class="h">♡</div><h3>No saved artworks yet</h3><p>Tap the heart icon on any artwork to save it here.</p><a class="btn" style="margin-top:16px" href="#/artworks">Browse artworks</a></div>`}</div></section>`; },
  tour() { return `<section class="sec"><div class="wrap">${head("Explore from anywhere", "Virtual Tour", "Walk through the gallery room by room.")}<div id="tr"></div></div></section>`; },
  tourInit() {
    const stops = [["Entrance Hall", 1, "Begin your visit with sculpture that confronts the viewer from the first step."], ["Sculpture Court", 4, "Bronze and plaster figures, including early works bought for the national collection in 1926."], ["South African Art", 3, "Painters who shaped modern South African art, including Gerard Sekoto."], ["Contemporary", 11, "Animated film and drawing from William Kentridge's Soho Eckstein series."], ["Prints Room", 2, "Linocuts from the Rorke's Drift Art Centre tradition."], ["Sir Abe Bailey", 8, "Landscapes and expeditions, part of the gallery's largest bequest era."]]; let i = 0;
    const draw = () => { const [r, id, d] = stops[i], w = art(id) || M.artworks[0];
      $("#tr").innerHTML = `<div class="tour"><div class="pic">${w.image ? `<img src="${img(w.image)}" alt="${esc(w.title)}">` : `<span>${esc(w.title)}</span>`}</div><div class="txt"><div class="dots">${stops.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div><div class="eyebrow">Room ${i + 1} of ${stops.length}</div><h2>${r}</h2><p>${d}</p><p><b>${esc(w.title)}</b><br>${esc(w.artistName)}</p><button class="btn ghost" id="pv" ${i ? "" : "disabled"}>‹ Previous</button> <button class="btn" id="nx">${i < stops.length - 1 ? "Next room ›" : "Start again"}</button></div></div>`;
      $("#pv").onclick = () => { i--; draw(); }; $("#nx").onclick = () => { i = (i + 1) % stops.length; draw(); }; };
    draw();
  },
  challenge() {
    const L = lvlOf(), d = DAILY[Math.floor(Date.now() / 864e5) % DAILY.length], w = art(d[0]) || {}, done = S.daily.last === today(), nxt = LEVELS[L + 1];
    const dt = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase();
    return `<section class="sec"><div class="wrap">${head("Gamification", "Art Challenge", "Daily challenges, badges and Art Explorer levels. Come back every day to grow your collection.")}
    <div class="stats"><div class="st3"><i>⚡</i><div><small>Day streak</small><b>${S.daily.streak} days</b></div></div><div class="st3"><i style="background:var(--rust)">🏆</i><div><small>Total points</small><b>${S.pts}</b></div></div><div class="st3"><i style="background:#1E1410">★</i><div><small>Explorer level</small><b>Level ${L + 1}</b></div></div></div>
    ${nxt ? `<p class="lead" style="margin-top:12px">${nxt[1] - S.pts} points to reach ${nxt[0]}.</p>` : ""}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:40px"><h2 style="font-size:28px">Daily Challenge</h2><span class="date">TODAY · ${dt}</span></div>
    <div class="daily">${w.image ? `<img src="${img(w.image)}" alt="${esc(w.title)}">` : "<div></div>"}<div><div class="eyebrow">Artwork: ${esc(w.title)} · ${esc(w.artistName)}</div><h2 style="font-size:24px;margin-bottom:12px">${d[1]}</h2><div id="dq">${d[2].map((o, k) => `<button class="opt" data-k="${k}"><b>${"ABCD"[k]}</b>${o}</button>`).join("")}</div><p class="fb" id="dfb">${done ? "You've completed today's challenge. Come back tomorrow!" : "Answer correctly to earn 20 points and extend your streak."}</p></div></div>
    <h2 style="font-size:28px;margin-top:56px">Art Explorer Levels</h2><p class="lead">Earn points through quizzes (10 per correct answer), daily challenges (20) and saving artworks (5).</p>
    ${LEVELS.map((l, i) => `<div class="lvl ${i < L ? "done" : i === L ? "here" : ""}"><b>${i + 1}</b><div><strong>${l[0]}</strong>${i === L ? ` <em style="color:var(--amber);font-style:normal;font-size:13px">← You are here</em>` : ""}<small>${l[1]}${i < 4 ? "–" + LEVELS[i + 1][1] : "+"} pts · ${l[2]}</small></div>${i <= L ? '<span class="ck">✓</span>' : ""}</div>`).join("")}
    <h2 style="font-size:28px;margin-top:56px">Badge Collection</h2><p class="lead">Complete challenges and activities to earn all 6 badges.</p><div class="badges">${BADGES.map((b) => { const g = b[3](); return `<div class="bd ${g ? "got" : ""}"><div class="e">${b[0]}</div><h3>${b[1]}</h3><p>${b[2]}</p>${g ? "<em>EARNED</em>" : ""}</div>`; }).join("")}</div></div></section>`;
  },
  challengeInit() {
    const d = DAILY[Math.floor(Date.now() / 864e5) % DAILY.length]; if (S.daily.last === today()) return $$("#dq .opt").forEach((b) => (b.disabled = true));
    $$("#dq .opt").forEach((b) => (b.onclick = () => { const ok = +b.dataset.k === d[3]; $$("#dq .opt").forEach((o) => { o.disabled = true; if (+o.dataset.k === d[3]) o.classList.add("ok"); else if (o === b) o.classList.add("no"); });
      log("daily challenge answered, correct:", ok); if (ok) { const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10); S.daily.streak = S.daily.last === y ? S.daily.streak + 1 : 1; S.daily.last = today(); S.daily.count++; addPts(20); $("#dfb").textContent = "Correct! +20 points."; setTimeout(route, 1400); }
      else { $("#dfb").textContent = "Not quite. The right answer is highlighted. Try again tomorrow."; } }));
  },
  login() { return authPage(false); }, register() { return authPage(true); },
  loginInit() { authInit(false); }, registerInit() { authInit(true); },
  info(k) { const T = { about: ["About the gallery", "The Iziko South African National Gallery is South Africa's national art gallery in Company's Garden, Cape Town."], faq: ["FAQ", "Opening hours: daily 09:00–17:00, closed on Christmas Day and 1 May. Tickets: adults R60, children, students and pensioners R40. Free entry for SA pensioners and students on Fridays with valid ID. Progress, points and saved artworks are stored only in your browser."], accessibility: ["Accessibility", "This site supports keyboard navigation, visible focus, a dark mode, reduced-motion preferences and four languages for menus. Tell us about any barrier: isang@iziko.org.za."] }[k] || ["Not found", ""]; return `<section class="sec"><div class="wrap"><h1 class="t">${T[0]}</h1><p class="lead">${T[1]}</p></div></section>`; },
};
const authPage = (reg) => `<section class="sec"><div class="wrap"><form class="auth" id="af" novalidate><img src="/images/iziko_logo.jpg" alt="Iziko" width="72"><h1 class="t" style="font-size:32px">${reg ? "Create your account" : "Welcome back"}</h1><p class="lead" style="margin-bottom:18px">${reg ? "Save your progress and artworks to your account." : "Log in to save your progress and artworks."}</p>
${reg ? '<label>Full name<input id="nm" autocomplete="name"></label>' : ""}<label>Email address<input id="em" type="email" autocomplete="email"></label><label>Password<input id="pw" type="password" autocomplete="${reg ? "new-password" : "current-password"}"></label>${reg ? '<label>Confirm password<input id="p2" type="password" autocomplete="new-password"></label>' : ""}
<div class="err" id="er" role="alert" hidden></div><button class="btn" id="go" style="width:100%;justify-content:center">${reg ? "Create account" : "Log in"}</button><div class="or">or</div><button type="button" class="btn line" id="gg" style="width:100%;justify-content:center"><b style="color:#4285f4">G</b> Continue with Google</button>
<a class="lk" style="text-align:center;display:block" href="#/${reg ? "login" : "register"}">${reg ? "Already have an account? Log in" : "Don't have an account? Register"}</a></form></div></section>`;
function authInit(reg) {
  const er = $("#er"), go = $("#go"), fail = (m) => { er.textContent = m; er.hidden = false; go.disabled = false; }, done = () => { chrome(); toast("Welcome!"); location.hash = "#/home"; };
  $("#af").onsubmit = async (e) => { e.preventDefault(); er.hidden = true; const em = $("#em").value.trim(), pw = $("#pw").value;
    if (reg) { if (!$("#nm").value.trim()) return fail("Please enter your full name."); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return fail("Please enter a valid email address."); if (pw.length < 8) return fail("Use a password with at least 8 characters."); if (pw !== $("#p2").value) return fail("The passwords do not match."); }
    else if (!em || !pw) return fail("Please enter your email and password.");
    go.disabled = true; try { if (reg) await post("/api/auth/register", { fullName: $("#nm").value.trim(), email: em, password: pw }); AUTH.set(await post("/api/auth/login", { email: em, password: pw })); done(); } catch (x) { fail(x.message); } };
  $("#gg").onclick = async () => { er.hidden = true; try { await googleSignIn(); done(); } catch (x) { fail(x.message || "Google sign-in failed."); } };
}
const exCard = (e) => `<article class="ex"><img src="${img(e.image)}" alt="${esc(e.title)}" loading="lazy"><div><span class="st">${esc(e.status)}</span><h3>${esc(e.title)}</h3><p style="color:var(--rust);font-weight:500">${esc(e.dates)}</p>${e.curator ? `<p style="color:var(--mute);font-size:14px">Curated by ${esc(e.curator)}</p>` : ""}<p style="margin-top:10px;color:var(--mute)">${esc(e.summary)}</p></div></article>`;
/* ---- quiz runner: one question at a time, 10 points per correct answer, best score per level is kept ---- */
function runQuiz(level) {
  const qs = QUIZ[level].q; let i = 0, right = 0; const box = $("#qz");
  const show = () => { const [q, o, a] = qs[i];
    box.innerHTML = `<div class="q"><div class="eyebrow">${level} · Question ${i + 1} of ${qs.length}</div><div class="prog"><i style="width:${(i / qs.length) * 100}%"></i></div><h2>${q}</h2><div>${o.map((x, k) => `<button class="opt" data-k="${k}"><b>${"ABCD"[k]}</b>${x}</button>`).join("")}</div><p class="fb" id="fb" aria-live="polite"></p></div>`;
    $$(".opt").forEach((b) => (b.onclick = () => { const k = +b.dataset.k; $$(".opt").forEach((x) => { x.disabled = true; if (+x.dataset.k === a) x.classList.add("ok"); else if (x === b) x.classList.add("no"); }); if (k === a) right++; $("#fb").innerHTML = (k === a ? "Correct!" : "Not quite.") + ` <button class="btn" id="nq" style="margin-left:8px">${i < qs.length - 1 ? "Next ›" : "See score"}</button>`; $("#nq").focus(); $("#nq").onclick = () => (++i < qs.length ? show() : end()); })); };
  const end = () => { const pct = Math.round((right / qs.length) * 100), had = BADGES.map((b) => b[3]()); S.quiz[level] = Math.max(S.quiz[level] || 0, pct); log("quiz finished:", level, pct + "%"); addPts(right * 10); save();
    const gained = BADGES.filter((b, k) => b[3]() && !had[k]).map((b) => b[1]);
    box.innerHTML = `<div class="score"><div class="eyebrow">${level} quiz complete</div><div class="n">${pct}%</div><h2>${right} of ${qs.length} correct · +${right * 10} points</h2><p class="lead" style="margin:12px auto">${pct >= 70 ? "Great work!" : "Keep exploring and try again."}${gained.length ? " New badge: " + gained.join(", ") + "." : ""}</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn" id="sh">Share score</button><button class="btn line" id="ag">Play again</button><a class="btn line" href="#/challenge">View badges</a></div></div>`;
    $("#ag").onclick = () => runQuiz(level);
    $("#sh").onclick = async () => { const m = `I scored ${pct}% on the ${level} quiz at the Iziko SA National Gallery!`; try { if (navigator.share) await navigator.share({ title: "Art Quiz", text: m, url: location.href }); else { await navigator.clipboard.writeText(m + " " + location.href); toast("Score copied to clipboard"); } } catch (e) {} }; };
  show();
}
/* ---- chat assistant: keyword matching, answers locally with no server needed ---- */
const FAQ = [[/hour|open|close|time/, "We're open Monday to Sunday, 09:00–17:00. Closed on Christmas Day and Workers Day (1 May)."], [/price|ticket|cost|fee|book/, "Adults R60; children (5–17), students and pensioners R40. SA students and pensioners enter free on Fridays with valid ID. Book at webtickets.co.za."], [/where|locat|address|direction|park/, "We're on Government Avenue in Company's Garden, Cape Town. See the Visit page for a map and directions."], [/quiz|badge|point|level|streak/, "Take a quiz on the Quiz page or answer the Daily Challenge to earn points and badges. See Art Challenge for your progress."], [/artist|sekoto|stern|kentridge/, "Our Artists page lists everyone in the collection, with biographies and their works."], [/butcher|alexander/, "The Butcher Boys is a sculpture by Jane Alexander. Open it from the Artworks page."], [/hello|hi|hey/, "Hello! Ask me about opening hours, tickets, location, quizzes or artworks."]];
function chat() {
  $("#chat").innerHTML = `<button id="cb" aria-label="Open gallery assistant" aria-expanded="false">💬</button><section class="cp" id="cp" hidden aria-label="Gallery assistant"><header>Gallery assistant</header><div class="msgs" id="ms" aria-live="polite"><p>Hi! How can I help you plan your visit?</p></div><div class="sug">${["Opening hours", "Ticket prices", "Where are you?", "Quiz and badges"].map((s) => `<button>${s}</button>`).join("")}</div><form id="cf"><input id="ci" placeholder="Type a question" aria-label="Your question" autocomplete="off"><button>Send</button></form></section>`;
  const ask = (q) => { log("chat question:", q); const m = $("#ms"); m.insertAdjacentHTML("beforeend", `<p class="me">${esc(q)}</p>`); const a = (FAQ.find((f) => f[0].test(q.toLowerCase())) || [0, "I'm not sure about that. Try the Visit or FAQ pages, or email isang@iziko.org.za."])[1]; m.insertAdjacentHTML("beforeend", `<p>${esc(a)}</p>`); m.scrollTop = m.scrollHeight; };
  $("#cb").onclick = () => { const h = $("#cp").hidden = !$("#cp").hidden; $("#cb").setAttribute("aria-expanded", !h); if (!h) $("#ci").focus(); };
  $("#cf").onsubmit = (e) => { e.preventDefault(); const v = $("#ci").value.trim(); if (v) { ask(v); $("#ci").value = ""; } };
  $$(".sug button").forEach((b) => (b.onclick = () => ask(b.textContent)));
}
/* ---- router: reads the #/page/id part of the URL and renders the matching page (MDN Web Docs, 2026) ---- */
function route() {
  const [, name = "home", arg] = location.hash.split("/"), key = P[name] ? name : "home";
  $("#app").innerHTML = P[key](arg); if (P[key + "Init"]) P[key + "Init"](); markNav(); $("#nav").classList.remove("open"); log("page:", key, arg || "");
  document.title = (key === "home" ? "" : t(NAV.find((n) => n[0] === key) ? NAV.find((n) => n[0] === key)[1] : "Gallery") + " · ") + "SA National Gallery";
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const h = e.target.closest("[data-h]"); if (h) { e.preventDefault(); const id = +h.dataset.h, on = S.saved.includes(id); S.saved = on ? S.saved.filter((x) => x !== id) : [...S.saved, id]; log(on ? "unsaved artwork" : "saved artwork", id); if (!on) addPts(5); save(); toast(on ? "Removed from My Collection" : "Saved to My Collection"); if (location.hash.startsWith("#/collection")) route(); else { h.classList.toggle("on", !on); h.textContent = on ? "♡" : "♥"; h.setAttribute("aria-pressed", !on); } }
  if (!e.target.closest(".tools")) { const m = $("#lm"); if (m) m.hidden = true; }
});
theme(); document.documentElement.lang = S.lang; chrome(); chat();
load().then(() => { route(); window.addEventListener("hashchange", route); }).catch(() => ($("#app").innerHTML = `<div class="wrap sec"><div class="empty"><h3>Couldn't load the collection</h3><p>Check your connection and refresh the page.</p></div></div>`));
})();
