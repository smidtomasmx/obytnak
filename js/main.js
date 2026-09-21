/* ==========================================================
   Obytňák – skript pro CHOVÁNÍ stránek (menu, galerie, kalkulačka, formuláře).
   Žádné texty, kontakty ani ceny tu nejsou – všechno je přímo v HTML souborech.
   Skript je pro celý web (i pražskou verzi) stejný.
   ========================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const kc = n => Math.round(n).toLocaleString("cs-CZ").replace(/ /g, " ") + " Kč";
const num = s => parseInt(String(s).replace(/\D/g, ""), 10) || 0;
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDate = d => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
const daysWord = n => (n === 1 ? "den" : n < 5 ? "dny" : "dní");
// Pronájem se počítá na DNY: den převzetí i den vrácení se počítají (25. 9. – 28. 9. = 4 dny).
const rentalDays = (from, to) => Math.round((to - from) / 86400000) + 1;

/* ---------- Menu na telefonu ---------- */
function initNav() {
  const burger = $(".burger"), nav = $(".nav");
  if (!burger || !nav) return;
  const close = () => { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); };
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", e => { if (e.target.closest("a")) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
}

/* ---------- Aktuální rok v patičce ---------- */
function initYear() {
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
}

/* ---------- Filtry (fotogalerie, blog) ---------- */
function initFilters() {
  $$(".filters[data-target]").forEach(bar => {
    const grid = $(bar.dataset.target);
    if (!grid) return;
    bar.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      $$("button", bar).forEach(x => x.classList.toggle("on", x === b));
      const cat = b.dataset.cat;
      [...grid.children].forEach(item => { item.hidden = cat !== "all" && item.dataset.cat !== cat; });
    });
  });
}

/* ---------- Zvětšování fotek ---------- */
function initLightbox() {
  const links = $$("a[data-lb]");
  if (!links.length) return;
  const box = document.createElement("div");
  box.className = "lb";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Zvětšená fotografie");
  box.innerHTML = `<button class="x" aria-label="Zavřít">✕</button>
    <button class="prev" aria-label="Předchozí">‹</button><img alt="">
    <button class="next" aria-label="Další">›</button><div class="cap"></div>`;
  document.body.appendChild(box);
  const img = $("img", box), cap = $(".cap", box);
  let list = [], idx = 0, lastFocus = null;

  const show = i => {
    idx = (i + list.length) % list.length;
    const a = list[idx];
    img.src = a.getAttribute("href");
    img.alt = a.dataset.caption || "";
    cap.textContent = a.dataset.caption || "";
  };
  const open = a => {
    lastFocus = document.activeElement;
    list = links.filter(l => !l.hidden);
    show(list.indexOf(a));
    box.classList.add("open");
    document.body.style.overflow = "hidden";
    $(".x", box).focus();
  };
  const close = () => {
    box.classList.remove("open");
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  };

  links.forEach(a => a.addEventListener("click", e => { e.preventDefault(); open(a); }));
  $(".x", box).addEventListener("click", close);
  $(".prev", box).addEventListener("click", () => show(idx - 1));
  $(".next", box).addEventListener("click", () => show(idx + 1));
  box.addEventListener("click", e => { if (e.target === box) close(); });
  document.addEventListener("keydown", e => {
    if (!box.classList.contains("open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(idx - 1);
    if (e.key === "ArrowRight") show(idx + 1);
  });
  let sx = 0; // swipe na telefonu
  box.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

/* ---------- Blog: název stránky podle otevřeného článku ---------- */
function initBlogTitle() {
  if (!$("#blogArticles")) return;
  const base = document.title;
  const brand = ($(".logo img") || {}).alt || "";
  const set = () => {
    const h = $(".article-page:target h1");
    document.title = h ? h.textContent + (brand ? " – " + brand : "") : base;
  };
  window.addEventListener("hashchange", set);
  set();
}

/* ---------- Sazby pro kalkulačku: čtou se z tabulky #priceTable v rezervace.html ---------- */
function readPrices() {
  const table = $("#priceTable");
  if (!table) return null;
  const seasons = [];
  let base = null;
  $$("tbody tr[data-ranges]", table).forEach(tr => {
    const c = tr.cells;
    const s = { name: c[0].textContent.trim(), min: num(c[2].textContent), price: num(c[3].textContent), ranges: [] };
    const r = tr.dataset.ranges.trim();
    if (r === "default") base = s;
    else s.ranges = r.split(",").map(x => x.trim().split("/"));
    seasons.push(s);
  });
  const tiers = $$("tr[data-from]", table).map(tr => ({ from: +tr.dataset.from, discount: num(tr.cells[1].textContent) / 100 }));
  base = base || seasons[seasons.length - 1];
  return {
    seasons, base, tiers,
    deposit: num(($("#pdDeposit") || {}).textContent),
    service: num(($("#pdService") || {}).textContent),
  };
}

function seasonFor(P, date) {
  const md = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  for (const s of P.seasons) {
    if (s.ranges.some(([a, b]) => md >= a && md <= b)) return s;
  }
  return P.base;
}
const minDaysFor = (P, date) => seasonFor(P, date).min || 1;

// Cena = půjčovné (dny × sazba sezóny) − sleva za délku + servisní poplatek + doplňky. Všechny ceny jsou včetně DPH.
function calcPrice(P, { from, to }, extras = []) {
  const days = rentalDays(from, to);
  let rent = 0;
  const bySeason = new Map();
  for (let i = 0; i < days; i++) {
    const s = seasonFor(P, addDays(from, i));
    rent += s.price;
    bySeason.set(s, (bySeason.get(s) || 0) + 1);
  }
  const tier = P.tiers.filter(t => days >= t.from).sort((a, b) => b.discount - a.discount)[0];
  const discount = tier ? Math.round(rent * tier.discount) : 0;
  const lines = [];
  bySeason.forEach((n, s) => lines.push({ label: `Půjčovné – ${s.name} (${n} ${daysWord(n)} × ${kc(s.price)})`, value: n * s.price }));
  if (discount) lines.push({ label: `Sleva ${Math.round(tier.discount * 100)} % (od ${tier.from} dní)`, value: -discount });
  if (P.service) lines.push({ label: "Servisní poplatek", value: P.service });
  extras.forEach(x => lines.push({ label: x.name, value: x.price }));
  return { days, lines, total: lines.reduce((sum, l) => sum + l.value, 0) };
}

// Kontrola kontaktních údajů (stejná pravidla jako na backendu, aby ho odeslání nezamítlo)
const checkName = v => (v.trim().length < 2 ? "Zadejte jméno a příjmení." : "");
const checkEmail = v => {
  v = v.trim();
  if (!v) return "Zadejte e-mail.";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "E-mail nemá správný tvar, zkontrolujte ho prosím (např. jmeno@example.cz).";
};
const checkPhone = v => {
  v = v.trim();
  if (!v) return "Zadejte telefon.";
  const digits = v.replace(/\D/g, "");
  if (!/^\+?[0-9 ()\-]{9,25}$/.test(v) || digits.length < 9 || digits.length > 15) return "Telefon nemá správný tvar (např. +420 123 456 789).";
  const cz = /^(?:\+|00)420/.test(v.replace(/[ ()\-]/g, "")) ? digits.replace(/^(00)?420/, "") : null;
  if (cz !== null && cz.length !== 9) return "České číslo má mít po předvolbě +420 devět číslic.";
  return "";
};

/* ---------- Odeslání poptávky e-mailem přes FormSubmit (bez registrace) ---------- */
function sendInquiry(ownerEmail, fields) {
  return fetch("https://formsubmit.co/ajax/" + ownerEmail, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(fields),
  }).then(res => res.json().catch(() => ({})).then(data => {
    if (!res.ok || data.success === "false" || data.success === false) throw new Error((data && data.message) || "Odeslání se nezdařilo");
    return data;
  }));
}
const escHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* ---------- Rezervační systém: komunikace s backendem (Google Apps Script Web App) ---------- */
// Obsazená období z backendu jsou [{start, end}], kde end je první VOLNÝ den (stejně jako celodenní událost
// v Google Kalendáři: 25. 9. – 28. 9. včetně je uloženo jako start 25. 9., end 29. 9.).
// Vybraný termín od–do (včetně obou dnů) se proto před porovnáním převede na [od, do + 1 den).
const dayAfter = day => iso(addDays(fromIso(day), 1));
const overlapsBusy = (from, to, busy) => busy.some(b => from < b.end && to > b.start);
const isBusyDay = (day, busy) => busy.some(b => day >= b.start && day < b.end);
const nextBusyStart = (from, busy) => busy.map(b => b.start).filter(x => x > from).sort()[0] || "";

function apiRequest(url, payload) {
  const ctrl = "AbortController" in window ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
  const opts = payload
    ? { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }
    : { method: "GET" };
  if (ctrl) opts.signal = ctrl.signal;
  return fetch(url, opts)
    .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .finally(() => { if (timer) clearTimeout(timer); });
}

/* Kalendář obsazenosti v panelu #calBox (jen VOLNO / OBSAZENO, žádné údaje o zákaznících).
   Volné dny jsou klikací: první klik = den převzetí, druhý = den vrácení (předá se přes onPick). */
function initAvailability(box, api, onData, onPick) {
  const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastView = new Date(first.getFullYear(), first.getMonth() + 24, 1);
  const todayIso = iso(now);
  let view = new Date(first), busy = [], state = "loading", sel = null;

  function render() {
    const y = view.getFullYear(), m = view.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;            // týden začíná pondělím
    const days = new Date(y, m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < offset; i++) cells += '<span class="av-day av-empty"></span>';
    for (let d = 1; d <= days; d++) {
      const day = `${y}-${pad(m + 1)}-${pad(d)}`;
      let cls = "av-free", label = "volno";
      if (day < todayIso) { cls = "av-past"; label = "minulost"; }
      else if (isBusyDay(day, busy)) { cls = "av-busy"; label = "obsazeno"; }
      else if (sel && day >= sel.from && day <= (sel.to || sel.from)) { cls += " av-sel"; label = "vybráno"; }
      const text = `${d}. ${m + 1}. ${y} – ${label}`;
      cells += cls.startsWith("av-free")
        ? `<button type="button" class="av-day ${cls}" data-day="${day}" aria-label="${text}"${sel && day === sel.from ? ' aria-pressed="true"' : ""}>${d}</button>`
        : `<span class="av-day ${cls}" role="img" aria-label="${text}">${d}</span>`;
    }
    const msg = state === "loading" ? "Načítám obsazenost…"
      : state === "error" ? "Obsazenost se nepodařilo načíst. Volnost termínu ověříme po odeslání poptávky."
      : !sel ? "Klikněte na den převzetí."
      : !sel.to ? "Nyní klikněte na den vrácení." : "";
    box.innerHTML = `<div class="avail">
      <div class="av-head">
        <button type="button" class="av-nav" data-d="-1" aria-label="Předchozí měsíc"${view <= first ? " disabled" : ""}>‹</button>
        <strong class="av-title">${MONTHS[m]} ${y}</strong>
        <button type="button" class="av-nav" data-d="1" aria-label="Další měsíc"${view >= lastView ? " disabled" : ""}>›</button>
      </div>
      <div class="av-grid">${["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map(x => `<span class="av-dow">${x}</span>`).join("")}${cells}</div>
      <p class="av-note" aria-live="polite">${msg}</p></div>`;
  }
  box.addEventListener("click", e => {
    const dayBtn = e.target.closest("button[data-day]");
    if (dayBtn) {
      const day = dayBtn.dataset.day;
      onPick(day);
      const again = $(`button[data-day="${day}"]`, box);      // po překreslení vrať fokus (ovládání klávesnicí)
      if (again) again.focus();
      return;
    }
    const b = e.target.closest(".av-nav");
    if (!b || b.disabled) return;
    view = new Date(view.getFullYear(), view.getMonth() + Number(b.dataset.d), 1);
    render();
  });
  function load() {
    state = "loading"; render();
    return apiRequest(`${api}?action=busy&from=${iso(now)}&to=${iso(addDays(now, 800))}`)
      .then(r => {
        if (!r || !r.ok || !Array.isArray(r.busy)) throw new Error("Neplatná odpověď");
        busy = r.busy; state = "ok"; render(); onData(busy);
      })
      .catch(() => { state = "error"; render(); onData([]); });
  }
  load();
  return { reload: load, select(from, to) { sel = from ? { from, to: to || "" } : null; render(); } };
}

/* ---------- Rezervace ---------- */
function initReservation() {
  const form = $("#resForm");
  if (!form) return;
  const d = form.dataset;
  const OWNER = { brand: d.brand, vehicle: d.vehicle, email: d.ownerEmail, phone: d.ownerPhone };
  const P = readPrices();

  // Adresa Google Apps Script Web App (data-api-url). Je-li vyplněná, používá se nový rezervační systém
  // s kontrolou obsazenosti a potvrzováním. Prázdná = záložní režim (odeslání přes FormSubmit jako dřív).
  const API = (d.apiUrl || "").trim();
  let BUSY = [];                                  // obsazená období načtená z backendu
  let availability = null;
  let sending = false;                            // právě probíhá odeslání (ochrana proti dvojkliku)
  const openedAt = Date.now();                    // čas otevření formuláře (backend odmítne nereálně rychlé odeslání)
  const requestId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);

  // Google Kalendář (ID je v atributu data-calendar-id)
  const calBox = $("#calBox");
  const calId = (calBox.dataset.calendarId || "").trim();
  if (API) {
    availability = initAvailability(calBox, API, ranges => { BUSY = ranges; update(); }, day => pickDay(day));
  } else if (calId) {
    calBox.innerHTML = `<iframe class="cal-frame" title="Kalendář obsazenosti" loading="lazy"
      src="https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calId)}&ctz=Europe%2FPrague&hl=cs&mode=MONTH&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0&wkst=2"></iframe>`;
  } else {
    calBox.innerHTML = `<div class="cal-empty"><div><strong>Google Kalendář zatím není propojen.</strong><br>
      ID kalendáře doplňte v souboru <code>rezervace.html</code> do atributu <code>data-calendar-id</code>.</div></div>`;
  }

  const f = form.elements;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  f.dateFrom.min = iso(today);
  const minDaysAt = date => (P ? minDaysFor(P, date) : 1);
  f.dateTo.min = iso(addDays(today, minDaysAt(today) - 1));

  const state = () => ({
    from: f.dateFrom.value ? fromIso(f.dateFrom.value) : null,
    to: f.dateTo.value ? fromIso(f.dateTo.value) : null,
    guests: +f.guests.value || 1,
  });
  const chosenExtras = () => $$("input[name=extra]:checked", form).map(c => ({ name: c.value, price: num(c.dataset.price) }));

  const validate = s => {
    if (!s.from || !s.to) return "Vyberte prosím datum převzetí a vrácení.";
    if (s.from < today) return "Datum převzetí nemůže být v minulosti.";
    if (s.to < s.from) return "Vrácení nemůže být před převzetím.";
    if (API && overlapsBusy(iso(s.from), dayAfter(iso(s.to)), BUSY)) return "V tomto termínu je vůz už obsazený.";
    const n = rentalDays(s.from, s.to);
    const min = minDaysAt(s.from);
    if (n < min) return `Minimální délka pronájmu pro tento termín je ${min} ${daysWord(min)}.`;
    return "";
  };

  // Výběr dnů přímo v kalendáři: 1. klik = převzetí, 2. klik = vrácení (poslední den pronájmu)
  let pickMsg = "";
  const pickDay = day => {
    const from = f.dateFrom.value;
    const start = () => { f.dateFrom.value = day; f.dateTo.value = ""; };
    pickMsg = "";
    if (from && !f.dateTo.value && day >= from) {
      if (overlapsBusy(from, dayAfter(day), BUSY)) start();        // mezi dny je obsazený termín → začít znovu od kliknutého dne
      else {
        const min = minDaysAt(fromIso(from));
        if (rentalDays(fromIso(from), fromIso(day)) < min) pickMsg = `Minimální délka pronájmu pro tento termín je ${min} ${daysWord(min)}. Vyberte pozdější den vrácení.`;
        else f.dateTo.value = day;
      }
    } else start();
    update();
  };

  const sumBox = $("#summary"), errBox = $("#dateErr");
  const update = () => {
    const s = state();
    if (P && s.from) f.dateTo.min = iso(addDays(s.from, minDaysAt(s.from) - 1));
    if (API) {
      // vrátit lze nejpozději v poslední volný den před nejbližším obsazeným termínem
      const nb = s.from && !isBusyDay(iso(s.from), BUSY) ? nextBusyStart(iso(s.from), BUSY) : "";
      f.dateTo.max = nb ? iso(addDays(fromIso(nb), -1)) : "";
      if (availability) availability.select(s.from ? iso(s.from) : "", s.from && s.to && s.to >= s.from ? iso(s.to) : "");
    }
    const err = s.from && s.to ? validate(s) : "";
    if (API && s.from && !s.to && isBusyDay(iso(s.from), BUSY)) errBox.textContent = "Tento den je už obsazený.";
    else errBox.textContent = err || (s.to ? "" : pickMsg);
    if (!P || !s.from || !s.to || err) {
      sumBox.innerHTML = `<h3>Orientační cena</h3><p style="margin:0;opacity:.8">Vyberte termín a uvidíte cenu pronájmu.</p>`;
      return;
    }
    const r = calcPrice(P, s, chosenExtras());
    sumBox.innerHTML = `<h3>Orientační cena · ${r.days} ${daysWord(r.days)}</h3>
      <ul>${r.lines.map(l => `<li><span>${l.label}</span><span>${l.value < 0 ? "−" : ""}${kc(Math.abs(l.value))}</span></li>`).join("")}</ul>
      <div class="total"><span>Celkem včetně DPH</span><span>${kc(r.total)}</span></div>
      <small>Všechny ceny jsou včetně DPH. Vratná kauce ${kc(P.deposit)} se hradí při převzetí a do ceny se nezapočítává. V ceně je neomezený nájezd.</small>`;
  };
  form.addEventListener("input", e => { if (e.target.type === "date") pickMsg = ""; });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();

  // Kontrola jména, telefonu a e-mailu: při opuštění pole, průběžně po chybě a znovu při odeslání
  const fieldChecks = { name: checkName, phone: checkPhone, email: checkEmail };
  const checkField = name => {
    const msg = fieldChecks[name](f[name].value);
    $("#err-" + name).textContent = msg;
    f[name].setAttribute("aria-invalid", msg ? "true" : "false");
    return msg;
  };
  form.addEventListener("focusout", e => { if (fieldChecks[e.target.name] && e.target.value.trim()) checkField(e.target.name); });
  form.addEventListener("input", e => { if (fieldChecks[e.target.name] && $("#err-" + e.target.name).textContent) checkField(e.target.name); });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const s = state();
    const err = validate(s);
    errBox.textContent = err;
    const badFields = Object.keys(fieldChecks).filter(checkField);
    if (err || badFields.length) {
      $("#formErr").textContent = badFields.length ? "Opravte prosím zvýrazněné údaje ve formuláři." : "";
      (err ? f.dateFrom : f[badFields[0]]).focus();
      return;
    }
    $("#formErr").textContent = "";
    if (f.website && f.website.value) return; // past na roboty (skryté pole)
    const extras = chosenExtras();
    const r = P ? calcPrice(P, s, extras) : { days: rentalDays(s.from, s.to), total: 0 };
    const extrasText = extras.map(x => x.name).join(", ");

    // ---- NOVÝ SYSTÉM: poptávku přijme backend (kontrola kalendáře, tabulka, e-mail správci) ----
    if (API) {
      if (sending) return;                                           // ochrana proti dvojímu kliknutí
      const custEmail = f.email.value.trim();
      const sig = [custEmail.toLowerCase(), iso(s.from), iso(s.to)].join("|");
      const done = $("#sent"), btn = $("button[type=submit]", form), btnText = btn.textContent;
      const showSent = () => {
        done.className = "info-box";
        done.innerHTML = "<strong>Děkujeme za Vaši poptávku.</strong> Termín nyní prověříme a ozveme se Vám.";
        done.hidden = false; form.hidden = true;
        done.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      try {                                                          // stejnou poptávku nelze odeslat znovu (např. po obnovení stránky)
        const last = JSON.parse(sessionStorage.getItem("resSent") || "null");
        if (last && last.sig === sig && Date.now() - last.t < 600000) { showSent(); return; }
      } catch (e) { /* úložiště nemusí být dostupné */ }
      sending = true; btn.disabled = true; btn.textContent = "Odesílám…";
      const fail = msg => { $("#formErr").textContent = msg; };
      apiRequest(API, {
        action: "inquiry", requestId, elapsed: Date.now() - openedAt, website: f.website ? f.website.value : "",
        name: f.name.value.trim(), phone: f.phone.value.trim(), email: custEmail, guests: s.guests,
        from: iso(s.from), to: iso(s.to), note: f.note.value.trim(), extras: extrasText, estimate: kc(r.total) + " (vč. DPH)",
      }).then(res => {
        if (res && res.ok) {
          try { sessionStorage.setItem("resSent", JSON.stringify({ sig, t: Date.now() })); } catch (e) { /* nevadí */ }
          showSent();
        } else if (res && res.code === "BUSY") {
          fail("Tento termín již není k dispozici. Vyberte prosím jiný termín.");
          if (availability) availability.reload();
        } else if (res && res.code === "INVALID") {
          fail(Object.values(res.fields || {})[0] || res.message || "Zkontrolujte prosím údaje ve formuláři.");
        } else if (res && res.code === "RATE_LIMIT") {
          fail(res.message);
        } else {
          throw new Error((res && res.message) || "Chyba odeslání");
        }
      }).catch(() => {
        fail(`Rezervaci se nepodařilo odeslat. Zkuste to prosím znovu nebo nás kontaktujte telefonicky. Tel.: ${OWNER.phone}.`);
      }).finally(() => {
        sending = false; btn.disabled = false; btn.textContent = btnText;
      });
      return;
    }
    const calUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + "&text=" + encodeURIComponent("Rezervace: " + f.name.value.trim())
      + "&dates=" + iso(s.from).replace(/-/g, "") + "/" + dayAfter(iso(s.to)).replace(/-/g, "")
      + "&details=" + encodeURIComponent(`Tel: ${f.phone.value.trim()}\nE-mail: ${f.email.value.trim()}\nOsob: ${s.guests}`);
    const subject = `Poptávka: ${fmtDate(s.from)} – ${fmtDate(s.to)} (${f.name.value.trim()})`;
    const custEmail = f.email.value.trim();

    // Poptávka se odešle sama na e-mail majitele, zákazník dostane automatické potvrzení
    const fields = {
      _subject: subject,
      _template: "table",
      _captcha: "false",
      name: f.name.value.trim(),
      email: custEmail,
      "Telefon": f.phone.value.trim(),
      "Převzetí": fmtDate(s.from),
      "Vrácení": fmtDate(s.to),
      "Počet dní": r.days,
      "Počet osob": s.guests,
      "Doplňky": extrasText || "–",
      "Orientační cena (vč. DPH)": kc(r.total),
      "Poznámka": f.note.value.trim() || "–",
      "Přidat do Google Kalendáře": calUrl,
    };
    if (d.autoresponse) fields._autoresponse = d.autoresponse;

    const btn = $("button[type=submit]", form), btnText = btn.textContent;
    btn.disabled = true; btn.textContent = "Odesílám…";
    sendInquiry(OWNER.email, fields)
      .then(() => {
        const done = $("#sent");
        done.className = "info-box";
        done.innerHTML = `<strong>Děkujeme, poptávka byla odeslána.</strong><br>Potvrzení jsme poslali na ${escHtml(custEmail)}. Ozveme se vám nejpozději do 24 hodin.`;
        done.hidden = false;
        form.hidden = true;
        done.scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(() => {
        btn.disabled = false; btn.textContent = btnText;
        $("#formErr").textContent = `Poptávku se nepodařilo odeslat. Zkuste to prosím znovu, nebo nám zavolejte na ${OWNER.phone}, případně napište na ${OWNER.email}.`;
      });
  });
}
/* ---------- Kontaktní formulář ---------- */
function initContactForm() {
  const form = $("#contactForm");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const f = form.elements;
    const body = `${f.message.value.trim()}\n\n${f.name.value.trim()}\n${f.email.value.trim()}${f.phone.value.trim() ? "\n" + f.phone.value.trim() : ""}`;
    window.location.href = `mailto:${form.dataset.ownerEmail}?subject=${encodeURIComponent("Dotaz z webu od " + f.name.value.trim())}&body=${encodeURIComponent(body)}`;
  });
}

/* ---------- Jemné zobrazení prvků při scrollu ---------- */
function initReveal() {
  const els = $$(".section-head, .card, .post, .benefit, .step, .pillar, .featured, .equip, .spec, .panel, .contact-card");
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: .12 });
  els.forEach(el => { el.classList.add("reveal"); io.observe(el); });
}

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initYear();
  initFilters();
  initLightbox();
  initBlogTitle();
  initReservation();
  initContactForm();
  initReveal();
});
