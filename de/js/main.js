/* ==========================================================
   Obytňák – Skript für das Seitenverhalten (Menü, Galerie, Rechner, Formulare).
   Deutsche Kopie von js/main.js: übersetzte Texte + Preise in EUR
   (ungefähre Umrechnung; maßgeblich ist der Betrag in CZK, siehe rezervace.html).
   ========================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const kc = n => "€" + Math.round(n).toLocaleString("de-DE");
const num = s => parseInt(String(s).replace(/\D/g, ""), 10) || 0;
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDate = d => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
const daysWord = n => (n === 1 ? "Tag" : "Tage");
const rentalDays = (from, to) => Math.round((to - from) / 86400000) + 1;

/* ---------- Mobiles Menü ---------- */
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

function initYear() {
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
}

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

function initLightbox() {
  const links = $$("a[data-lb]");
  if (!links.length) return;
  const box = document.createElement("div");
  box.className = "lb";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Vergrößertes Foto");
  box.innerHTML = `<button class="x" aria-label="Schließen">✕</button>
    <button class="prev" aria-label="Vorheriges">‹</button><img alt="">
    <button class="next" aria-label="Nächstes">›</button><div class="cap"></div>`;
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
  let sx = 0;
  box.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

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
  bySeason.forEach((n, s) => lines.push({ label: `Miete – ${s.name} (${n} ${daysWord(n)} × ${kc(s.price)})`, value: n * s.price }));
  if (discount) lines.push({ label: `Rabatt ${Math.round(tier.discount * 100)}% (ab ${tier.from} Tagen)`, value: -discount });
  if (P.service) lines.push({ label: "Servicepauschale", value: P.service });
  extras.forEach(x => lines.push({ label: x.name, value: x.price }));
  return { days, lines, total: lines.reduce((sum, l) => sum + l.value, 0) };
}

const checkName = v => (v.trim().length < 2 ? "Bitte geben Sie Vor- und Nachnamen ein." : "");
const checkEmail = v => {
  v = v.trim();
  if (!v) return "Bitte geben Sie eine E-Mail-Adresse ein.";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "Das sieht nicht wie eine gültige E-Mail-Adresse aus (z. B. name@example.com).";
};
const checkPhone = v => {
  v = v.trim();
  if (!v) return "Bitte geben Sie eine Telefonnummer ein.";
  const digits = v.replace(/\D/g, "");
  if (!/^\+?[0-9 ()\-]{9,25}$/.test(v) || digits.length < 9 || digits.length > 15) return "Das sieht nicht wie eine gültige Telefonnummer aus (z. B. +420 123 456 789).";
  const cz = /^(?:\+|00)420/.test(v.replace(/[ ()\-]/g, "")) ? digits.replace(/^(00)?420/, "") : null;
  if (cz !== null && cz.length !== 9) return "Eine tschechische Nummer muss nach der Vorwahl +420 neun Ziffern haben.";
  return "";
};

function sendInquiry(ownerEmail, fields) {
  return fetch("https://formsubmit.co/ajax/" + ownerEmail, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(fields),
  }).then(res => res.json().catch(() => ({})).then(data => {
    if (!res.ok || data.success === "false" || data.success === false) throw new Error((data && data.message) || "Senden fehlgeschlagen");
    return data;
  }));
}
const escHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

function initAvailability(box, api, onData, onPick) {
  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastView = new Date(first.getFullYear(), first.getMonth() + 24, 1);
  const todayIso = iso(now);
  let view = new Date(first), busy = [], state = "loading", sel = null;

  function render() {
    const y = view.getFullYear(), m = view.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < offset; i++) cells += '<span class="av-day av-empty"></span>';
    for (let d = 1; d <= days; d++) {
      const day = `${y}-${pad(m + 1)}-${pad(d)}`;
      let cls = "av-free", label = "frei";
      if (day < todayIso) { cls = "av-past"; label = "vergangen"; }
      else if (isBusyDay(day, busy)) { cls = "av-busy"; label = "gebucht"; }
      else if (sel && day >= sel.from && day <= (sel.to || sel.from)) { cls += " av-sel"; label = "ausgewählt"; }
      const text = `${d}. ${m + 1}. ${y} – ${label}`;
      cells += cls.startsWith("av-free")
        ? `<button type="button" class="av-day ${cls}" data-day="${day}" aria-label="${text}"${sel && day === sel.from ? ' aria-pressed="true"' : ""}>${d}</button>`
        : `<span class="av-day ${cls}" role="img" aria-label="${text}">${d}</span>`;
    }
    const msg = state === "loading" ? "Verfügbarkeit wird geladen…"
      : state === "error" ? "Verfügbarkeit konnte nicht geladen werden. Wir prüfen den Termin nach dem Senden Ihrer Anfrage."
      : !sel ? "Klicken Sie den Abholtag."
      : !sel.to ? "Klicken Sie nun den Rückgabetag." : "";
    box.innerHTML = `<div class="avail">
      <div class="av-head">
        <button type="button" class="av-nav" data-d="-1" aria-label="Vorheriger Monat"${view <= first ? " disabled" : ""}>‹</button>
        <strong class="av-title">${MONTHS[m]} ${y}</strong>
        <button type="button" class="av-nav" data-d="1" aria-label="Nächster Monat"${view >= lastView ? " disabled" : ""}>›</button>
      </div>
      <div class="av-grid">${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(x => `<span class="av-dow">${x}</span>`).join("")}${cells}</div>
      <p class="av-note" aria-live="polite">${msg}</p></div>`;
  }
  box.addEventListener("click", e => {
    const dayBtn = e.target.closest("button[data-day]");
    if (dayBtn) {
      const day = dayBtn.dataset.day;
      onPick(day);
      const again = $(`button[data-day="${day}"]`, box);
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
        if (!r || !r.ok || !Array.isArray(r.busy)) throw new Error("Ungültige Antwort");
        busy = r.busy; state = "ok"; render(); onData(busy);
      })
      .catch(() => { state = "error"; render(); onData([]); });
  }
  load();
  return { reload: load, select(from, to) { sel = from ? { from, to: to || "" } : null; render(); } };
}

function initReservation() {
  const form = $("#resForm");
  if (!form) return;
  const d = form.dataset;
  const OWNER = { brand: d.brand, vehicle: d.vehicle, email: d.ownerEmail, phone: d.ownerPhone };
  const P = readPrices();

  const API = (d.apiUrl || "").trim();
  let BUSY = [];
  let availability = null;
  let sending = false;
  const openedAt = Date.now();
  const requestId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);

  const calBox = $("#calBox");
  const calId = (calBox.dataset.calendarId || "").trim();
  if (API) {
    availability = initAvailability(calBox, API, ranges => { BUSY = ranges; update(); }, day => pickDay(day));
  } else if (calId) {
    calBox.innerHTML = `<iframe class="cal-frame" title="Verfügbarkeitskalender" loading="lazy"
      src="https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calId)}&ctz=Europe%2FPrague&hl=de&mode=MONTH&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0&wkst=2"></iframe>`;
  } else {
    calBox.innerHTML = `<div class="cal-empty"><div><strong>Der Google Kalender ist noch nicht verbunden.</strong><br>
      Fügen Sie die Kalender-ID in <code>rezervace.html</code> im Attribut <code>data-calendar-id</code> hinzu.</div></div>`;
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
  const chosenExtras = () => $$("input[name=extra]:checked", form).map(c => {
    if (c.value === "Bettwäsche" && f.lozniQty) return { name: `Bettwäsche (${f.lozniQty.value}×)`, price: num(c.dataset.price) };
    return { name: c.value, price: num(c.dataset.price) };
  });
  if (f.extraLozni && f.lozniQty) {
    const lozniRow = $("#lozniQtyRow", form);
    f.extraLozni.addEventListener("change", () => {
      if (f.extraLozni.checked) { f.lozniQty.value = f.guests.value; lozniRow.hidden = false; }
      else lozniRow.hidden = true;
    });
  }

  const validate = s => {
    if (!s.from || !s.to) return "Bitte wählen Sie Abhol- und Rückgabedatum.";
    if (s.from < today) return "Das Abholdatum darf nicht in der Vergangenheit liegen.";
    if (s.to < s.from) return "Die Rückgabe kann nicht vor der Abholung liegen.";
    if (API && overlapsBusy(iso(s.from), dayAfter(iso(s.to)), BUSY)) return "Das Fahrzeug ist für diesen Zeitraum bereits gebucht.";
    const n = rentalDays(s.from, s.to);
    const min = minDaysAt(s.from);
    if (n < min) return `Die Mindestmietdauer für diesen Zeitraum beträgt ${min} ${daysWord(min)}.`;
    return "";
  };

  let pickMsg = "";
  const pickDay = day => {
    const from = f.dateFrom.value;
    const start = () => { f.dateFrom.value = day; f.dateTo.value = ""; };
    pickMsg = "";
    if (from && !f.dateTo.value && day >= from) {
      if (overlapsBusy(from, dayAfter(day), BUSY)) start();
      else {
        const min = minDaysAt(fromIso(from));
        if (rentalDays(fromIso(from), fromIso(day)) < min) pickMsg = `Die Mindestmietdauer für diesen Zeitraum beträgt ${min} ${daysWord(min)}. Bitte wählen Sie einen späteren Rückgabetag.`;
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
      const nb = s.from && !isBusyDay(iso(s.from), BUSY) ? nextBusyStart(iso(s.from), BUSY) : "";
      f.dateTo.max = nb ? iso(addDays(fromIso(nb), -1)) : "";
      if (availability) availability.select(s.from ? iso(s.from) : "", s.from && s.to && s.to >= s.from ? iso(s.to) : "");
    }
    const err = s.from && s.to ? validate(s) : "";
    if (API && s.from && !s.to && isBusyDay(iso(s.from), BUSY)) errBox.textContent = "Dieser Tag ist bereits gebucht.";
    else errBox.textContent = err || (s.to ? "" : pickMsg);
    if (!P || !s.from || !s.to || err) {
      sumBox.innerHTML = `<h3>Geschätzter Preis</h3><p style="margin:0;opacity:.8">Wählen Sie Ihren Zeitraum, um den Mietpreis zu sehen.</p>`;
      return;
    }
    const r = calcPrice(P, s, chosenExtras());
    sumBox.innerHTML = `<h3>Geschätzter Preis · ${r.days} ${daysWord(r.days)}</h3>
      <ul>${r.lines.map(l => `<li><span>${l.label}</span><span>${l.value < 0 ? "−" : ""}${kc(Math.abs(l.value))}</span></li>`).join("")}</ul>
      <div class="total"><span>Gesamt inkl. MwSt.</span><span>${kc(r.total)}</span></div>
      <small>Alle Preise inkl. MwSt. Die rückzahlbare Kaution von ${kc(P.deposit)} wird bei Übergabe bezahlt und ist nicht im Preis enthalten. Kilometer unbegrenzt. Beträge in Euro sind eine ungefähre Umrechnung – maßgeblich ist der Betrag in tschechischen Kronen.</small>`;
  };
  form.addEventListener("input", e => { if (e.target.type === "date") pickMsg = ""; });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();

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
      $("#formErr").textContent = badFields.length ? "Bitte korrigieren Sie die markierten Felder." : "";
      (err ? f.dateFrom : f[badFields[0]]).focus();
      return;
    }
    $("#formErr").textContent = "";
    if (f.website && f.website.value) return;
    const extras = chosenExtras();
    const r = P ? calcPrice(P, s, extras) : { days: rentalDays(s.from, s.to), total: 0 };
    const extrasText = extras.map(x => x.name).join(", ");

    if (API) {
      if (sending) return;
      const custEmail = f.email.value.trim();
      const sig = [custEmail.toLowerCase(), iso(s.from), iso(s.to)].join("|");
      const done = $("#sent"), btn = $("button[type=submit]", form), btnText = btn.textContent;
      const showSent = () => {
        done.className = "info-box";
        done.innerHTML = "<strong>Vielen Dank für Ihre Anfrage.</strong> Wir prüfen den Termin und melden uns bei Ihnen.";
        done.hidden = false; form.hidden = true;
        done.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      try {
        const last = JSON.parse(sessionStorage.getItem("resSent") || "null");
        if (last && last.sig === sig && Date.now() - last.t < 600000) { showSent(); return; }
      } catch (e) { /* Speicher evtl. nicht verfügbar */ }
      sending = true; btn.disabled = true; btn.textContent = "Wird gesendet…";
      const fail = msg => { $("#formErr").textContent = msg; };
      apiRequest(API, {
        action: "inquiry", requestId, elapsed: Date.now() - openedAt, website: f.website ? f.website.value : "",
        name: f.name.value.trim(), phone: f.phone.value.trim(), email: custEmail, guests: s.guests,
        from: iso(s.from), to: iso(s.to), note: f.note.value.trim(), extras: extrasText, estimate: kc(r.total) + " (inkl. MwSt., ca.)",
      }).then(res => {
        if (res && res.ok) {
          try { sessionStorage.setItem("resSent", JSON.stringify({ sig, t: Date.now() })); } catch (e) { /* nicht kritisch */ }
          showSent();
        } else if (res && res.code === "BUSY") {
          fail("Dieser Zeitraum ist nicht mehr verfügbar. Bitte wählen Sie einen anderen Termin.");
          if (availability) availability.reload();
        } else if (res && res.code === "INVALID") {
          fail(Object.values(res.fields || {})[0] || res.message || "Bitte überprüfen Sie Ihre Angaben.");
        } else if (res && res.code === "RATE_LIMIT") {
          fail(res.message);
        } else {
          throw new Error((res && res.message) || "Fehler beim Senden");
        }
      }).catch(() => {
        fail(`Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder rufen Sie uns an: ${OWNER.phone}.`);
      }).finally(() => {
        sending = false; btn.disabled = false; btn.textContent = btnText;
      });
      return;
    }
    const calUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + "&text=" + encodeURIComponent("Buchung: " + f.name.value.trim())
      + "&dates=" + iso(s.from).replace(/-/g, "") + "/" + dayAfter(iso(s.to)).replace(/-/g, "")
      + "&details=" + encodeURIComponent(`Telefon: ${f.phone.value.trim()}\nE-Mail: ${f.email.value.trim()}\nPersonen: ${s.guests}`);
    const subject = `Buchungsanfrage: ${fmtDate(s.from)} – ${fmtDate(s.to)} (${f.name.value.trim()})`;
    const custEmail = f.email.value.trim();

    const fields = {
      _subject: subject,
      _template: "table",
      _captcha: "false",
      name: f.name.value.trim(),
      email: custEmail,
      "Telefon": f.phone.value.trim(),
      "Abholung": fmtDate(s.from),
      "Rückgabe": fmtDate(s.to),
      "Anzahl Tage": r.days,
      "Personen": s.guests,
      "Extras": extrasText || "–",
      "Geschätzter Preis (inkl. MwSt., ca.)": kc(r.total),
      "Anmerkung": f.note.value.trim() || "–",
      "Zu Google Kalender hinzufügen": calUrl,
    };
    if (d.autoresponse) fields._autoresponse = d.autoresponse;

    const btn = $("button[type=submit]", form), btnText = btn.textContent;
    btn.disabled = true; btn.textContent = "Wird gesendet…";
    sendInquiry(OWNER.email, fields)
      .then(() => {
        const done = $("#sent");
        done.className = "info-box";
        done.innerHTML = `<strong>Vielen Dank, Ihre Anfrage wurde gesendet.</strong><br>Wir haben eine Bestätigung an ${escHtml(custEmail)} gesendet. Wir melden uns spätestens innerhalb von 24 Stunden.`;
        done.hidden = false;
        form.hidden = true;
        done.scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(() => {
        btn.disabled = false; btn.textContent = btnText;
        $("#formErr").textContent = `Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut, rufen Sie uns an (${OWNER.phone}) oder schreiben Sie an ${OWNER.email}.`;
      });
  });
}

function initContactForm() {
  const form = $("#contactForm");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const f = form.elements;
    const body = `${f.message.value.trim()}\n\n${f.name.value.trim()}\n${f.email.value.trim()}${f.phone.value.trim() ? "\n" + f.phone.value.trim() : ""}`;
    window.location.href = `mailto:${form.dataset.ownerEmail}?subject=${encodeURIComponent("Website-Anfrage von " + f.name.value.trim())}&body=${encodeURIComponent(body)}`;
  });
}

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
