/* Iziko Museum: app-style tab bar, welcome history, booking, Google sign-in (Firebase). Loads after app.js. */
(function () {
  "use strict";
  const I = window.Iziko, { screens, api, auth, museum, LS, esc, imgUrl, go, toast, $, $app } = I;
  const extra = (I.extra = {});
  const SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
  const TYPES = ["General entry", "Guided tour", "Exhibition visit"];
  const IZIKO_SITE = "https://www.iziko.org.za"; // official Iziko website
  const BOOK_URL = "https://www.webtickets.co.za/v2/Client.aspx?clientcode=izikomuseum&utm_source=Iziko_Website&utm_medium=Website&utm_campaign=Iziko_Website_CTA&utm_id=001"; // official Iziko booking page
  const MAP_Q = encodeURIComponent("Iziko South African National Gallery, Government Avenue, Cape Town");
  const mapCard = () => `<div class="eyebrow sm" style="margin-top:28px">FIND US</div><div class="card mapcard mt10"><iframe title="Map showing the Iziko South African National Gallery" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${MAP_Q}&z=16&output=embed"></iframe>
    <div class="mapbtns"><a class="btn orange" href="https://www.google.com/maps/search/?api=1&query=${MAP_Q}" target="_blank" rel="noopener">Open in Google Maps</a>
    <a class="btn grey" href="https://www.google.com/maps/dir/?api=1&destination=${MAP_Q}" target="_blank" rel="noopener">Get directions</a></div></div>`;
  const log = (...a) => console.log("[Iziko]", ...a); // logging for the assessment

  /* ----- welcome page with the museum's history ----- */
  screens.welcome = function () {
    const story = [["1872", "The national collection is founded."],
      ["1926", "Anton van Wouw's African Head and Neville Lewis's Adderley Street Flower-sellers become the first works by South African artists bought for it."],
      ["3 Nov 1930", "The current gallery building opens to the public."],
      ["2000", "The gallery receives more than 2 500 items from Gerard Sekoto's estate, the Sekoto Study Collection."]];
    $app.innerHTML = `<div class="welcome-hero"><img src="/images/museum_hero.jpg" alt="The Iziko South African National Gallery building"><div class="scrim"></div>
      <div class="wtxt"><img src="${I.LOGO}" width="84" height="84" alt="Iziko Museum logo" class="wlogo"><h1>Discover Iziko</h1>
      <p>Explore South African art, artists and cultural heritage.</p>
      <button class="btn orange" data-go="#/login">Log in</button><button class="btn red mt10" data-go="#/register">Create an account</button></div></div>
      <div class="pad"><div class="eyebrow sm">OUR HISTORY</div><h2 class="h28" style="margin-top:6px">A national collection in the Company's Garden</h2>
      <div class="timeline">${story.map((s) => `<div class="tl"><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join("")}</div>
      <div class="card visit"><h3>Visit</h3><p>Government Avenue, Company Garden, Cape Town 8001\nwww.iziko.org.za | info@iziko.org.za</p></div></div>`;
  };

  /* ----- Google single sign-on (Firebase Auth -> same API as the Android app) ----- */
  const loadScript = (src) => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  async function googleSignIn() {
    const cfg = window.FIREBASE_CONFIG || {};
    if (!cfg.apiKey) return toast("Add your Firebase keys in firebase-config.js to turn on Google sign-in.");
    try {
      if (!window.firebase) {
        await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
        await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js");
        firebase.initializeApp(cfg);
      }
      const cred = await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
      const r = await api.call("/api/auth/firebase", { method: "POST", body: { idToken: await cred.user.getIdToken() } });
      LS.set("token", r.token); LS.set("user", JSON.stringify(r.user)); auth.user = r.user;
      log("Google sign-in ok"); go("#/home");
    } catch (e) { log("Google sign-in failed", e); toast(e.message || "Google sign-in failed."); }
  }
  const loginOrig = screens.login;
  screens.login = function () {
    loginOrig(); const g = $("#google");
    if (g) { g.textContent = "Continue with Google"; g.onclick = googleSignIn; }
  };
  const regOrig = screens.register;
  screens.register = function () {
    regOrig(); const b = document.createElement("button");
    b.className = "btn grey mt8"; b.textContent = "Sign up with Google"; b.onclick = googleSignIn;
    $("#go").after(b);
  };

  /* ----- tickets, prices and other Iziko museums (booking happens on Iziko's Webtickets page) ----- */
  const FEES = [["Adults", 40, 60], ["Children (5–18)", 20, 60], ["SA students and pensioners", 20, 60], ["Family (2 adults + 2 children 5+)", 100, 240]];
  const DOME = [["Adults", 70, 100], ["Children (5–18)", 40, 100], ["SA students and pensioners", 40, 100], ["Family (2 adults + 2 children 5+)", 180, 300]];
  const table = (rows) => `<div class="tbl"><table><thead><tr><th></th><th>SA ID or SADC passport</th><th>Standard</th></tr></thead><tbody>${rows.map((r) => `<tr><th>${r[0]}</th><td>R${r[1]}</td><td>R${r[2]}</td></tr>`).join("")}</tbody></table></div>`;
  const bookBtn = (cls) => `<a class="btn orange ${cls || ""}" href="${BOOK_URL}" target="_blank" rel="noopener">Book tickets online</a>`;
  extra.book = function () {
    $app.innerHTML = `<div class="pad"><h1 class="h28">Tickets and prices</h1><p class="sub16">Book online through Iziko's official ticket partner, Webtickets. The page opens in a new tab.</p>${bookBtn("mt16")}
      <div class="sec">Entrance fees: Gallery and most Iziko museums</div><div class="card panel">${table(FEES)}</div>
      <div class="sec">Planetarium and Digital Dome</div><div class="card panel">${table(DOME)}</div>
      <div class="sec">Free entry</div><div class="card panel notes"><ul>
        <li>Children aged 5 and under (not the Planetarium).</li><li>South African students and pensioners on Fridays, with a valid ID and student card.</li>
        <li>Selected museums on commemorative days: 21 Mar, 27 Apr, 18 May, 25 May, 16 Jun, 9 Aug, 24 Sep, 1 Dec and 16 Dec.</li></ul></div>
      <div class="sec">Groups and schools</div><div class="card panel notes"><p>Email bookings@iziko.org.za or call 021 481 3832.</p></div>
      <p class="hint">Fees are from Iziko's published schedule (effective 1 April 2023) and may have changed. Check the booking page for today's prices.</p>${bookBtn("mt16")}</div>`;
  };
  const MUSEUMS = [
    ["South African Museum", "Natural and cultural heritage, a short walk from the Gallery.", "25 Queen Victoria Street", "Daily 09:00–17:00", "south-african-museum", 1],
    ["Planetarium and Digital Dome", "Space and science shows in a digital dome. Tickets are sold separately.", "25 Queen Victoria Street", "Tuesday to Sunday (see show times)", "planetarium", 1],
    ["Slave Lodge", "The history of slavery and its legacy in Cape Town.", "", "Monday to Saturday 09:00–17:00", "", 1],
    ["Bo-Kaap Museum", "Heritage and culture of the Bo-Kaap.", "", "Monday to Saturday 09:00–17:00", "bo-kaap-museum"],
    ["Old Town House", "Historic building on Green Market Square.", "Green Market Square", "Check iziko.org.za for hours", ""],
    ["Bertram House", "Historic house museum.", "", "Thursday and Friday 09:00–16:00", ""],
    ["Koopmans-de Wet House", "Historic house museum.", "", "Thursday and Friday 09:00–16:00", ""],
    ["Rust en Vreugd", "Historic house museum.", "", "Thursday and Friday 09:00–16:00", ""]];
  // Museum photos: local file in /images/museums/ first, then an Iziko web image, then a coloured placeholder.
  const REMOTE = { "south-african-museum": "https://www.iziko.org.za/wp-content/uploads/2023/10/Humanity-Press-Release-300x200.jpg",
    "bo-kaap-museum": "https://www.iziko.org.za/wp-content/uploads/2023/10/Bo-kaap-Museum-300x195.jpg" };
  const mimg = (m, i) => { const slug = m[0].toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "");
    return `<div class="mimg" style="--h:${(i * 41 + 20) % 360}" data-i="${esc(m[0].charAt(0))}"><img src="/images/museums/${slug}.jpg" alt="${esc(m[0])}" loading="lazy" data-alt="${REMOTE[slug] || ""}" onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=''}else{this.remove()}"></div>`; };
  const maps = (n) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Iziko " + n + ", Cape Town");
  extra.museums = function () {
    $app.innerHTML = `<div class="pad">${I.back("Home")}<h1 class="h28">Other Iziko museums</h1><p class="sub16">More places to visit in Cape Town. Hours can change, so check iziko.org.za before you go.</p>
      <div class="mgrid">${MUSEUMS.map((m, i) => `<div class="card mcard2">${mimg(m, i)}<div class="mb">${m[5] ? `<div class="status">Near the Gallery</div>` : ""}<div class="title19">${esc(m[0])}</div><p class="msum">${esc(m[1])}</p>
        ${m[2] ? `<div class="meta">${esc(m[2])}</div>` : ""}<div class="meta">${esc(m[3])}</div>
        <div class="mlinks"><a href="${maps(m[0])}" target="_blank" rel="noopener">Map</a><a href="${IZIKO_SITE}/museums/${m[4] ? m[4] + "/" : ""}" target="_blank" rel="noopener">Website</a></div></div></div>`).join("")}</div><p class="hint">Photos © Iziko Museums of South Africa where shown.</p></div>`;
  };

  /* ----- app chrome: bottom tab bar + extra entry points ----- */
  const TABS = [["home", "⌂", "Home"], ["artworks", "▦", "Explore"], ["artists", "☺", "Artists"], ["book", "▣", "Tickets"], ["settings", "⚙", "Settings"]];
  const GROUP = { artwork: "artworks", artist: "artists", exhibitions: "home", museums: "home" };
  I.after = function (name) {
    if (name === "settings" && I.i18n) I.i18n.settingsUI();
    if (!$(".mapcard")) {
      if (name === "") { const p = $app.querySelector(".pad"); if (p) p.insertAdjacentHTML("beforeend", mapCard()); }
      else if (name === "home" && $("#logout")) $("#logout").insertAdjacentHTML("beforebegin", mapCard());
      else if (name === "exhibitions" && $(".visit")) $(".visit").insertAdjacentHTML("afterend", mapCard());
    }
    let bar = $("#tabs");
    if (!auth.isIn() || ["", "login", "register"].includes(name)) { if (bar) bar.remove(); document.body.classList.remove("has-tabs"); return; }
    if (!bar) { bar = document.createElement("nav"); bar.id = "tabs"; bar.className = "tabs"; document.body.appendChild(bar); }
    const on = GROUP[name] || name;
    bar.innerHTML = TABS.map((t) => `<button data-go="#/${t[0]}" class="${t[0] === on ? "on" : ""}" aria-label="${t[2]}"><i>${t[1]}</i><span>${t[2]}</span></button>`).join("");
    document.body.classList.add("has-tabs");
    if (name === "home" && !$(".book-tile")) {
      const tiles = document.querySelectorAll(".tile"), last = tiles[tiles.length - 1];
      if (last) last.insertAdjacentHTML("afterend", `<button class="tile book-tile" data-go="#/book"><img src="/images/museum_hero.jpg" alt=""><div class="scrim"></div><div class="t"><h3>Tickets and prices</h3><span>Book online and see entrance fees</span></div></button>`);
    }
    if (name === "home" && !$(".quick")) {
      const tiles = [...document.querySelectorAll(".tile")];
      const wrap = document.createElement("div"); wrap.className = "tiles";
      if (tiles.length) { tiles[0].before(wrap); tiles.forEach((t) => wrap.appendChild(t)); }
      const hero = $(".hero");
      if (hero) hero.insertAdjacentHTML("afterend", `<div class="quick"><a href="${BOOK_URL}" target="_blank" rel="noopener"><i>▣</i>Book tickets</a>
        <button data-go="#/book"><i>R</i>Prices</button><a href="https://www.google.com/maps/dir/?api=1&destination=${MAP_Q}" target="_blank" rel="noopener"><i>➤</i>Directions</a>
        <button data-go="#/museums"><i>⌂</i>Museums</button></div>`);
      const feat = [...document.querySelectorAll(".eyebrow.sm")].find((x) => x.textContent.trim() === "FEATURED WORKS");
      const html = `<div class="eyebrow sm" style="margin-top:32px">OTHER IZIKO MUSEUMS</div><div class="featured-row mrow">${MUSEUMS.map((m, i) => `<button class="card mcard clickable" data-go="#/museums">${mimg(m, i)}<div class="mb"><div class="ft">${esc(m[0])}</div><div class="fa">${esc(m[3])}</div></div></button>`).join("")}</div>`;
      (feat || $("#logout")).insertAdjacentHTML("beforebegin", html);
      const info = `<div class="card visit"><h3>Plan your visit</h3><p>1 Government Avenue, Company Garden, Cape Town\nFree entry on Fridays for South African students and pensioners.\nSee Tickets and prices for entrance fees.</p></div>`;
      const ex = [...document.querySelectorAll(".eyebrow.sm")].find((x) => x.textContent.trim() === "NOW SHOWING");
      (ex || feat || $("#logout")).insertAdjacentHTML("beforebegin", info);
    }
    if (name === "exhibitions") document.querySelectorAll(".card.ex").forEach((c, i) => {
      const e = museum.exhibitions[i]; if (e && !c.querySelector(".bk")) c.insertAdjacentHTML("beforeend", `<a class="btn orange mt16 bk" href="${BOOK_URL}" target="_blank" rel="noopener">Book tickets online</a>`); });
  };
  I.route();
})();
