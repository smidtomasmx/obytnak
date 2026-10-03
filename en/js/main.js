/* ==========================================================
   Obytňák – page behaviour script (menu, gallery, calculator, forms).
   English copy of js/main.js: translated UI strings + prices shown in EUR
   (approximate conversion; the binding amount is in CZK, see rezervace.html).
   ========================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const kc = n => "€" + Math.round(n).toLocaleString("en-US");
const num = s => parseInt(String(s).replace(/\D/g, ""), 10) || 0;
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDate = d => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
const daysWord = n => (n === 1 ? "day" : "days");
// Rental length is counted in DAYS: the pick-up day and the return day both count (25. 9. – 28. 9. = 4 days).
const rentalDays = (from, to) => Math.round((to - from) / 86400000) + 1;

/* ---------- Mobile menu ---------- */
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

/* ---------- Current year in the footer ---------- */
function initYear() {
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
}

/* ---------- Filters (gallery, blog) ---------- */
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

/* ---------- Photo lightbox ---------- */
function initLightbox() {
  const links = $$("a[data-lb]");
  if (!links.length) return;
  const box = document.createElement("div");
  box.className = "lb";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Enlarged photo");
  box.innerHTML = `<button class="x" aria-label="Close">✕</button>
    <button class="prev" aria-label="Previous">‹</button><img alt="">
    <button class="next" aria-label="Next">›</button><div class="cap"></div>`;
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
  let sx = 0; // swipe on phones
  box.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

/* ---------- Blog: page title follows the open article (unused on the EN site, kept for parity) ---------- */
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

/* ---------- Calculator rates: read from the #priceTable table in rezervace.html ---------- */
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

// Price = rental fee (days × season rate) − length discount + service fee + extras. All prices include VAT.
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
  bySeason.forEach((n, s) => lines.push({ label: `Rental – ${s.name} (${n} ${daysWord(n)} × ${kc(s.price)})`, value: n * s.price }));
  if (discount) lines.push({ label: `Discount ${Math.round(tier.discount * 100)}% (from ${tier.from} days)`, value: -discount });
  if (P.service) lines.push({ label: "Service fee", value: P.service });
  extras.forEach(x => lines.push({ label: x.name, value: x.price }));
  return { days, lines, total: lines.reduce((sum, l) => sum + l.value, 0) };
}

// Contact-detail checks (same rules as the backend, so a submission can't be rejected there)
const checkName = v => (v.trim().length < 2 ? "Please enter your first and last name." : "");
const checkEmail = v => {
  v = v.trim();
  if (!v) return "Please enter an e-mail address.";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "That doesn't look like a valid e-mail address (e.g. name@example.com).";
};
const checkPhone = v => {
  v = v.trim();
  if (!v) return "Please enter a phone number.";
  const digits = v.replace(/\D/g, "");
  if (!/^\+?[0-9 ()\-]{9,25}$/.test(v) || digits.length < 9 || digits.length > 15) return "That doesn't look like a valid phone number (e.g. +420 123 456 789).";
  const cz = /^(?:\+|00)420/.test(v.replace(/[ ()\-]/g, "")) ? digits.replace(/^(00)?420/, "") : null;
  if (cz !== null && cz.length !== 9) return "A Czech number must have nine digits after the +420 prefix.";
  return "";
};

/* ---------- Sending the request by e-mail via FormSubmit (fallback, no registration needed) ---------- */
function sendInquiry(ownerEmail, fields) {
  return fetch("https://formsubmit.co/ajax/" + ownerEmail, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(fields),
  }).then(res => res.json().catch(() => ({})).then(data => {
    if (!res.ok || data.success === "false" || data.success === false) throw new Error((data && data.message) || "Sending failed");
    return data;
  }));
}
const escHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* ---------- Booking system: talks to the backend (Google Apps Script Web App) ---------- */
// Busy ranges from the backend are [{start, end}], where end is the first FREE day (same convention as an
// all-day event in Google Calendar: 25. 9. – 28. 9. inclusive is stored as start 25. 9., end 29. 9.).
// The selected from–to range (both days inclusive) is converted to [from, to + 1 day) before comparing.
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

/* Availability calendar in the #calBox panel (only FREE / BOOKED, no customer data).
   Free days are clickable: first click = pick-up day, second = return day (passed via onPick). */
function initAvailability(box, api, onData, onPick) {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastView = new Date(first.getFullYear(), first.getMonth() + 24, 1);
  const todayIso = iso(now);
  let view = new Date(first), busy = [], state = "loading", sel = null;

  function render() {
    const y = view.getFullYear(), m = view.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;            // week starts on Monday
    const days = new Date(y, m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < offset; i++) cells += '<span class="av-day av-empty"></span>';
    for (let d = 1; d <= days; d++) {
      const day = `${y}-${pad(m + 1)}-${pad(d)}`;
      let cls = "av-free", label = "free";
      if (day < todayIso) { cls = "av-past"; label = "past"; }
      else if (isBusyDay(day, busy)) { cls = "av-busy"; label = "booked"; }
      else if (sel && day >= sel.from && day <= (sel.to || sel.from)) { cls += " av-sel"; label = "selected"; }
      const text = `${d}. ${m + 1}. ${y} – ${label}`;
      cells += cls.startsWith("av-free")
        ? `<button type="button" class="av-day ${cls}" data-day="${day}" aria-label="${text}"${sel && day === sel.from ? ' aria-pressed="true"' : ""}>${d}</button>`
        : `<span class="av-day ${cls}" role="img" aria-label="${text}">${d}</span>`;
    }
    const msg = state === "loading" ? "Loading availability…"
      : state === "error" ? "Couldn't load availability. We'll check the date is free once you send your request."
      : !sel ? "Click the pick-up day."
      : !sel.to ? "Now click the return day." : "";
    box.innerHTML = `<div class="avail">
      <div class="av-head">
        <button type="button" class="av-nav" data-d="-1" aria-label="Previous month"${view <= first ? " disabled" : ""}>‹</button>
        <strong class="av-title">${MONTHS[m]} ${y}</strong>
        <button type="button" class="av-nav" data-d="1" aria-label="Next month"${view >= lastView ? " disabled" : ""}>›</button>
      </div>
      <div class="av-grid">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(x => `<span class="av-dow">${x}</span>`).join("")}${cells}</div>
      <p class="av-note" aria-live="polite">${msg}</p></div>`;
  }
  box.addEventListener("click", e => {
    const dayBtn = e.target.closest("button[data-day]");
    if (dayBtn) {
      const day = dayBtn.dataset.day;
      onPick(day);
      const again = $(`button[data-day="${day}"]`, box);      // return focus after re-render (keyboard users)
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
        if (!r || !r.ok || !Array.isArray(r.busy)) throw new Error("Invalid response");
        busy = r.busy; state = "ok"; render(); onData(busy);
      })
      .catch(() => { state = "error"; render(); onData([]); });
  }
  load();
  return { reload: load, select(from, to) { sel = from ? { from, to: to || "" } : null; render(); } };
}

/* ---------- Booking form ---------- */
function initReservation() {
  const form = $("#resForm");
  if (!form) return;
  const d = form.dataset;
  const OWNER = { brand: d.brand, vehicle: d.vehicle, email: d.ownerEmail, phone: d.ownerPhone };
  const P = readPrices();

  // Google Apps Script Web App address (data-api-url). When filled in, the new booking system is used
  // (availability check + confirmation). Empty = fallback mode (sent via FormSubmit as before).
  const API = (d.apiUrl || "").trim();
  let BUSY = [];                                  // busy ranges loaded from the backend
  let availability = null;
  let sending = false;                            // a submission is in progress (double-click guard)
  const openedAt = Date.now();                    // time the form was opened (backend rejects unrealistically fast submits)
  const requestId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);

  // Google Calendar (ID is in the data-calendar-id attribute)
  const calBox = $("#calBox");
  const calId = (calBox.dataset.calendarId || "").trim();
  if (API) {
    availability = initAvailability(calBox, API, ranges => { BUSY = ranges; update(); }, day => pickDay(day));
  } else if (calId) {
    calBox.innerHTML = `<iframe class="cal-frame" title="Availability calendar" loading="lazy"
      src="https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calId)}&ctz=Europe%2FPrague&hl=en&mode=MONTH&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0&wkst=2"></iframe>`;
  } else {
    calBox.innerHTML = `<div class="cal-empty"><div><strong>The Google Calendar isn't connected yet.</strong><br>
      Add the calendar ID in <code>rezervace.html</code> to the <code>data-calendar-id</code> attribute.</div></div>`;
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
    if (c.value === "Bed linen" && f.lozniQty) return { name: `Bed linen (${f.lozniQty.value}×)`, price: num(c.dataset.price) };
    return { name: c.value, price: num(c.dataset.price) };
  });
  // The bed-linen quantity selector only shows once checked; default count = current number of guests.
  if (f.extraLozni && f.lozniQty) {
    const lozniRow = $("#lozniQtyRow", form);
    f.extraLozni.addEventListener("change", () => {
      if (f.extraLozni.checked) { f.lozniQty.value = f.guests.value; lozniRow.hidden = false; }
      else lozniRow.hidden = true;
    });
  }

  const validate = s => {
    if (!s.from || !s.to) return "Please choose a pick-up and a return date.";
    if (s.from < today) return "The pick-up date can't be in the past.";
    if (s.to < s.from) return "The return date can't be before the pick-up date.";
    if (API && overlapsBusy(iso(s.from), dayAfter(iso(s.to)), BUSY)) return "The van is already booked for this period.";
    const n = rentalDays(s.from, s.to);
    const min = minDaysAt(s.from);
    if (n < min) return `The minimum rental length for this period is ${min} ${daysWord(min)}.`;
    return "";
  };

  // Picking days directly in the calendar: 1st click = pick-up, 2nd click = return (last rental day)
  let pickMsg = "";
  const pickDay = day => {
    const from = f.dateFrom.value;
    const start = () => { f.dateFrom.value = day; f.dateTo.value = ""; };
    pickMsg = "";
    if (from && !f.dateTo.value && day >= from) {
      if (overlapsBusy(from, dayAfter(day), BUSY)) start();        // a booked period is in between → start again from the clicked day
      else {
        const min = minDaysAt(fromIso(from));
        if (rentalDays(fromIso(from), fromIso(day)) < min) pickMsg = `The minimum rental length for this period is ${min} ${daysWord(min)}. Please choose a later return day.`;
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
      // the latest possible return day is the last free day before the next booked period
      const nb = s.from && !isBusyDay(iso(s.from), BUSY) ? nextBusyStart(iso(s.from), BUSY) : "";
      f.dateTo.max = nb ? iso(addDays(fromIso(nb), -1)) : "";
      if (availability) availability.select(s.from ? iso(s.from) : "", s.from && s.to && s.to >= s.from ? iso(s.to) : "");
    }
    const err = s.from && s.to ? validate(s) : "";
    if (API && s.from && !s.to && isBusyDay(iso(s.from), BUSY)) errBox.textContent = "This day is already booked.";
    else errBox.textContent = err || (s.to ? "" : pickMsg);
    if (!P || !s.from || !s.to || err) {
      sumBox.innerHTML = `<h3>Estimated price</h3><p style="margin:0;opacity:.8">Choose your dates to see the rental price.</p>`;
      return;
    }
    const r = calcPrice(P, s, chosenExtras());
    sumBox.innerHTML = `<h3>Estimated price · ${r.days} ${daysWord(r.days)}</h3>
      <ul>${r.lines.map(l => `<li><span>${l.label}</span><span>${l.value < 0 ? "−" : ""}${kc(Math.abs(l.value))}</span></li>`).join("")}</ul>
      <div class="total"><span>Total incl. VAT</span><span>${kc(r.total)}</span></div>
      <small>All prices include VAT. The refundable deposit of ${kc(P.deposit)} is paid at pick-up and is not included in this price. Mileage is unlimited. Amounts are shown in euros as an approximate conversion – the binding amount is in Czech crowns.</small>`;
  };
  form.addEventListener("input", e => { if (e.target.type === "date") pickMsg = ""; });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();

  // Name/phone/e-mail checks: on leaving a field, continuously after an error, and again on submit
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
      $("#formErr").textContent = badFields.length ? "Please fix the highlighted fields in the form." : "";
      (err ? f.dateFrom : f[badFields[0]]).focus();
      return;
    }
    $("#formErr").textContent = "";
    if (f.website && f.website.value) return; // honeypot for bots (hidden field)
    const extras = chosenExtras();
    const r = P ? calcPrice(P, s, extras) : { days: rentalDays(s.from, s.to), total: 0 };
    const extrasText = extras.map(x => x.name).join(", ");

    // ---- NEW SYSTEM: the backend receives the request (checks the calendar, logs it, e-mails the owner) ----
    if (API) {
      if (sending) return;                                           // double-click guard
      const custEmail = f.email.value.trim();
      const sig = [custEmail.toLowerCase(), iso(s.from), iso(s.to)].join("|");
      const done = $("#sent"), btn = $("button[type=submit]", form), btnText = btn.textContent;
      const showSent = () => {
        done.className = "info-box";
        done.innerHTML = "<strong>Thank you for your request.</strong> We'll check the dates and get back to you.";
        done.hidden = false; form.hidden = true;
        done.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      try {                                                          // the same request can't be sent twice (e.g. after a page reload)
        const last = JSON.parse(sessionStorage.getItem("resSent") || "null");
        if (last && last.sig === sig && Date.now() - last.t < 600000) { showSent(); return; }
      } catch (e) { /* storage may be unavailable */ }
      sending = true; btn.disabled = true; btn.textContent = "Sending…";
      const fail = msg => { $("#formErr").textContent = msg; };
      apiRequest(API, {
        action: "inquiry", requestId, elapsed: Date.now() - openedAt, website: f.website ? f.website.value : "",
        name: f.name.value.trim(), phone: f.phone.value.trim(), email: custEmail, guests: s.guests,
        from: iso(s.from), to: iso(s.to), note: f.note.value.trim(), extras: extrasText, estimate: kc(r.total) + " (incl. VAT, approx.)",
      }).then(res => {
        if (res && res.ok) {
          try { sessionStorage.setItem("resSent", JSON.stringify({ sig, t: Date.now() })); } catch (e) { /* not critical */ }
          showSent();
        } else if (res && res.code === "BUSY") {
          fail("These dates are no longer available. Please choose a different period.");
          if (availability) availability.reload();
        } else if (res && res.code === "INVALID") {
          fail(Object.values(res.fields || {})[0] || res.message || "Please check the details in the form.");
        } else if (res && res.code === "RATE_LIMIT") {
          fail(res.message);
        } else {
          throw new Error((res && res.message) || "Submission error");
        }
      }).catch(() => {
        fail(`We couldn't send your request. Please try again, or contact us by phone on ${OWNER.phone}.`);
      }).finally(() => {
        sending = false; btn.disabled = false; btn.textContent = btnText;
      });
      return;
    }
    const calUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + "&text=" + encodeURIComponent("Booking: " + f.name.value.trim())
      + "&dates=" + iso(s.from).replace(/-/g, "") + "/" + dayAfter(iso(s.to)).replace(/-/g, "")
      + "&details=" + encodeURIComponent(`Phone: ${f.phone.value.trim()}\nE-mail: ${f.email.value.trim()}\nGuests: ${s.guests}`);
    const subject = `Booking request: ${fmtDate(s.from)} – ${fmtDate(s.to)} (${f.name.value.trim()})`;
    const custEmail = f.email.value.trim();

    // The request e-mails itself to the owner; the customer gets an automatic confirmation
    const fields = {
      _subject: subject,
      _template: "table",
      _captcha: "false",
      name: f.name.value.trim(),
      email: custEmail,
      "Phone": f.phone.value.trim(),
      "Pick-up": fmtDate(s.from),
      "Return": fmtDate(s.to),
      "Number of days": r.days,
      "Guests": s.guests,
      "Extras": extrasText || "–",
      "Estimated price (incl. VAT, approx.)": kc(r.total),
      "Note": f.note.value.trim() || "–",
      "Add to Google Calendar": calUrl,
    };
    if (d.autoresponse) fields._autoresponse = d.autoresponse;

    const btn = $("button[type=submit]", form), btnText = btn.textContent;
    btn.disabled = true; btn.textContent = "Sending…";
    sendInquiry(OWNER.email, fields)
      .then(() => {
        const done = $("#sent");
        done.className = "info-box";
        done.innerHTML = `<strong>Thank you, your request has been sent.</strong><br>We've sent a confirmation to ${escHtml(custEmail)}. We'll get back to you within 24 hours at the latest.`;
        done.hidden = false;
        form.hidden = true;
        done.scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(() => {
        btn.disabled = false; btn.textContent = btnText;
        $("#formErr").textContent = `We couldn't send your request. Please try again, call us on ${OWNER.phone}, or e-mail ${OWNER.email}.`;
      });
  });
}
/* ---------- Contact form ---------- */
function initContactForm() {
  const form = $("#contactForm");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const f = form.elements;
    const body = `${f.message.value.trim()}\n\n${f.name.value.trim()}\n${f.email.value.trim()}${f.phone.value.trim() ? "\n" + f.phone.value.trim() : ""}`;
    window.location.href = `mailto:${form.dataset.ownerEmail}?subject=${encodeURIComponent("Website enquiry from " + f.name.value.trim())}&body=${encodeURIComponent(body)}`;
  });
}

/* ---------- Gentle reveal-on-scroll ---------- */
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
