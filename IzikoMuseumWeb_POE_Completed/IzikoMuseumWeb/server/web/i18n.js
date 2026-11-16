/* Language switcher: English, Afrikaans, isiXhosa. Static interface text is translated in the page after every render. */
(function () {
  "use strict";
  const I = window.Iziko, LS = I.LS;
  const LANGS = [["en", "English"], ["af", "Afrikaans"], ["xh", "isiXhosa"]];
  // English -> [Afrikaans, isiXhosa]
  const D = {
    "Home": ["Tuis", "Ikhaya"], "Explore": ["Verken", "Phonononga"], "Artists": ["Kunstenaars", "Amagcisa"], "Tickets": ["Kaartjies", "Amatikiti"],
    "Settings": ["Instellings", "Useto"], "Explore Artwork": ["Verken Kunswerke", "Phonononga Ubugcisa"], "Artworks": ["Kunswerke", "Imisebenzi yobugcisa"],
    "Discover Artists": ["Ontdek Kunstenaars", "Fumanisa Amagcisa"], "Exhibitions": ["Uitstallings", "Imiboniso"], "Discover Iziko": ["Ontdek Iziko", "Fumanisa i-Iziko"],
    "Log in": ["Meld aan", "Ngena"], "Log out": ["Meld af", "Phuma"], "Create an account": ["Skep 'n rekening", "Yenza i-akhawunti"], "Create account": ["Skep rekening", "Yenza i-akhawunti"],
    "Create your account": ["Skep jou rekening", "Yenza i-akhawunti yakho"], "Welcome": ["Welkom", "Wamkelekile"], "Welcome back": ["Welkom terug", "Wamkelekile kwakhona"],
    "Already have an account? Log in": ["Het jy reeds 'n rekening? Meld aan", "Sele unayo i-akhawunti? Ngena"], "Don't have an account? Register": ["Het jy nie 'n rekening nie? Registreer", "Awunayo i-akhawunti? Bhalisa"],
    "Continue with Google": ["Gaan voort met Google", "Qhubeka ne-Google"], "Sign up with Google": ["Registreer met Google", "Bhalisa nge-Google"],
    "Account": ["Rekening", "I-akhawunti"], "Preferences": ["Voorkeure", "Izinto ozikhethayo"], "About": ["Oor", "Malunga"], "Language": ["Taal", "Ulwimi"], "Dark mode": ["Donker modus", "Imowudi emnyama"],
    "News about exhibitions and events": ["Nuus oor uitstallings en geleenthede", "Iindaba ngemiboniso nemisitho"], "Version 1.0": ["Weergawe 1.0", "Uguqulelo 1.0"], "Guest": ["Gas", "Undwendwe"], "Not signed in": ["Nie aangemeld nie", "Awungenanga"],
    "Email address": ["E-posadres", "Idilesi ye-imeyile"], "Password": ["Wagwoord", "Iphasiwedi"], "Confirm password": ["Bevestig wagwoord", "Qinisekisa iphasiwedi"], "Full name": ["Volle naam", "Igama elipheleleyo"],
    "Password (at least 8 characters)": ["Wagwoord (minstens 8 karakters)", "Iphasiwedi (ubuncinane oonobumba abi-8)"], "Search by title or artist": ["Soek volgens titel of kunstenaar", "Khangela ngesihloko okanye ngegcisa"],
    "Loading…": ["Laai…", "Iyalayisha…"], "Book tickets": ["Bespreek kaartjies", "Bhukisha amatikiti"], "Book tickets online": ["Bespreek kaartjies aanlyn", "Bhukisha amatikiti kwi-intanethi"],
    "Prices": ["Pryse", "Amaxabiso"], "Directions": ["Aanwysings", "Indlela"], "Museums": ["Museums", "Iimyuziyam"], "Tickets and prices": ["Kaartjies en pryse", "Amatikiti namaxabiso"],
    "Plan your visit": ["Beplan jou besoek", "Cwangcisa utyelelo lwakho"], "FIND US": ["VIND ONS", "SIFUNE"], "OTHER IZIKO MUSEUMS": ["ANDER IZIKO-MUSEUMS", "EZINYE IIMYUZIYAM ZE-IZIKO"],
    "OUR HISTORY": ["ONS GESKIEDENIS", "BUSIKO LETHU"], "NOW SHOWING": ["NOU VERTOON", "IBONISWA NGOKU"], "FEATURED WORKS": ["UITGESTALDE WERKE", "IMISEBENZI EKHETHIWEYO"], "EXPLORE": ["VERKEN", "PHONONONGA"],
    "Open in Google Maps": ["Maak oop in Google Maps", "Vula kwi-Google Maps"], "Get directions": ["Kry aanwysings", "Fumana indlela"], "Map": ["Kaart", "Imaphu"], "Website": ["Webwerf", "Iwebhusayithi"],
    "Near the Gallery": ["Naby die Galery", "Kufutshane neGalari"], "Other Iziko museums": ["Ander Iziko-museums", "Ezinye iimyuziyam ze-Iziko"], "Free entry": ["Gratis toegang", "Ukungena simahla"],
    "Groups and schools": ["Groepe en skole", "Amaqela neesikolo"], "Standard": ["Standaard", "Eqhelekileyo"], "About this work": ["Oor hierdie werk", "Ngalo msebenzi"],
    "Browse and search the collection": ["Blaai deur en soek die versameling", "Khangela uphonononge ingqokelela"], "The people behind the work": ["Die mense agter die werk", "Abantu abangasemva komsebenzi"],
    "What is on at the gallery": ["Wat is aan die gang by die galery", "Okwenzekayo kwigalari"], "Book online and see entrance fees": ["Bespreek aanlyn en sien toegangsfooie", "Bhukisha kwi-intanethi ubone amaxabiso okungena"],
    "Explore South African art, artists and cultural heritage.": ["Verken Suid-Afrikaanse kuns, kunstenaars en kultuurerfenis.", "Phonononga ubugcisa baseMzantsi Afrika, amagcisa nelifa lenkcubeko."],
    "Please enter your email and password.": ["Voer asseblief jou e-pos en wagwoord in.", "Nceda ufake i-imeyile neophasiwedi yakho."],
    "No artworks match your search. Try a different title, artist or category.": ["Geen kunswerke pas by jou soektog nie. Probeer 'n ander titel, kunstenaar of kategorie.", "Akukho misebenzi ehambelanayo. Zama esinye isihloko, igcisa okanye udidi."]
  };
  const i = () => ({ af: 0, xh: 1 })[lang()];
  const lang = () => LS.get("lang", "en");
  const tr = (s) => {
    const k = i(); if (k === undefined) return s;
    if (D[s]) return D[s][k];
    if (s.startsWith("‹ ")) return "‹ " + tr(s.slice(2));
    if (s.startsWith("Welcome, ")) return D["Welcome"][k] + ", " + s.slice(9);
    return s;
  };
  let obs;
  function run() {
    if (i() === undefined) return;
    obs.disconnect();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; const list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach((n) => { const raw = n.nodeValue, t = raw.trim(); if (t && !n.parentNode.closest("script,style")) { const o = tr(t); if (o !== t) n.nodeValue = raw.replace(t, o); } });
    document.querySelectorAll("[placeholder],[aria-label]").forEach((e) => ["placeholder", "aria-label"].forEach((a) => { const v = e.getAttribute(a); if (v && D[v]) e.setAttribute(a, tr(v)); }));
    watch();
  }
  const watch = () => obs.observe(document.body, { childList: true, subtree: true });
  obs = new MutationObserver(run);
  document.documentElement.lang = lang();
  watch();
  // language chooser shown on the Settings screen (called from extra.js after each render)
  I.i18n = {
    settingsUI() {
      const about = [...document.querySelectorAll(".sec")].find((x) => x.textContent.trim() === "About");
      if (!about || document.getElementById("langbox")) return;
      about.insertAdjacentHTML("beforebegin", `<div class="sec">Language</div><div class="card panel" id="langbox"><div class="chips wrap">${LANGS.map((l) => `<button class="chip ${lang() === l[0] ? "on" : ""}" data-lang="${l[0]}">${l[1]}</button>`).join("")}</div></div>`);
      document.querySelectorAll("[data-lang]").forEach((b) => (b.onclick = () => { LS.set("lang", b.dataset.lang); document.documentElement.lang = b.dataset.lang; console.log("[Iziko] language:", b.dataset.lang); I.route(); }));
    },
  };
})();
