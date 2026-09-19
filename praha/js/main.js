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
const nightsWord = n => (n === 1 ? "noc" : n < 5 ? "noci" : "nocí");

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
    km: num(($("#pdKm") || {}).textContent),
  };
}

function seasonFor(P, date) {
  const md = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  for (const s of P.seasons) {
    if (s.ranges.some(([a, b]) => md >= a && md <= b)) return s;
  }
  return P.base;
}
const minNightsFor = (P, date) => seasonFor(P, date).min || 1;

function calcPrice(P, { from, to }) {
  const nights = Math.round((to - from) / 86400000);
  let rent = 0;
  const bySeason = new Map();
  for (let i = 0; i < nights; i++) {
    const s = seasonFor(P, addDays(from, i));
    rent += s.price;
    bySeason.set(s, (bySeason.get(s) || 0) + 1);
  }
  const tier = P.tiers.filter(t => nights >= t.from).sort((a, b) => b.discount - a.discount)[0];
  const discount = tier ? Math.round(rent * tier.discount) : 0;
  const lines = [];
  bySeason.forEach((n, s) => lines.push({ label: `${s.name} (${n} ${nightsWord(n)} × ${kc(s.price)})`, value: n * s.price }));
  if (discount) lines.push({ label: `Sleva ${Math.round(tier.discount * 100)} % (od ${tier.from} nocí)`, value: -discount });
  return { nights, lines, total: rent - discount };
}

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
/* ---------- Rezervace ---------- */
function initReservation() {
  const form = $("#resForm");
  if (!form) return;
  const d = form.dataset;
  const OWNER = { brand: d.brand, vehicle: d.vehicle, email: d.ownerEmail, phone: d.ownerPhone };
  const P = readPrices();

  // Google Kalendář (ID je v atributu data-calendar-id)
  const calBox = $("#calBox");
  const calId = (calBox.dataset.calendarId || "").trim();
  if (calId) {
    calBox.innerHTML = `<iframe class="cal-frame" title="Kalendář obsazenosti" loading="lazy"
      src="https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calId)}&ctz=Europe%2FPrague&hl=cs&mode=MONTH&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0&wkst=2"></iframe>`;
  } else {
    calBox.innerHTML = `<div class="cal-empty"><div><strong>Google Kalendář zatím není propojen.</strong><br>
      ID kalendáře doplňte v souboru <code>rezervace.html</code> do atributu <code>data-calendar-id</code>.</div></div>`;
  }

  const f = form.elements;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  f.dateFrom.min = iso(today);
  f.dateTo.min = iso(addDays(today, P ? minNightsFor(P, today) : 1));

  const state = () => ({
    from: f.dateFrom.value ? fromIso(f.dateFrom.value) : null,
    to: f.dateTo.value ? fromIso(f.dateTo.value) : null,
    guests: +f.guests.value || 1,
  });

  const validate = s => {
    if (!s.from || !s.to) return "Vyberte prosím datum převzetí a vrácení.";
    if (s.from < today) return "Datum převzetí nemůže být v minulosti.";
    if (s.to <= s.from) return "Vrácení musí být po převzetí.";
    const n = Math.round((s.to - s.from) / 86400000);
    const min = P ? minNightsFor(P, s.from) : 1;
    if (n < min) return `Minimální délka pronájmu pro tento termín je ${min} ${nightsWord(min)}.`;
    return "";
  };

  const sumBox = $("#summary"), errBox = $("#dateErr");
  const update = () => {
    const s = state();
    if (P && s.from && (!s.to || s.to <= s.from)) f.dateTo.min = iso(addDays(s.from, minNightsFor(P, s.from)));
    const err = s.from && s.to ? validate(s) : "";
    errBox.textContent = err;
    if (!P || !s.from || !s.to || err) {
      sumBox.innerHTML = `<h3>Orientační cena</h3><p style="margin:0;opacity:.8">Vyberte termín a uvidíte cenu pronájmu.</p>`;
      return;
    }
    const r = calcPrice(P, s);
    sumBox.innerHTML = `<h3>Orientační cena · ${r.nights} ${nightsWord(r.nights)}</h3>
      <ul>${r.lines.map(l => `<li><span>${l.label}</span><span>${l.value < 0 ? "−" : ""}${kc(Math.abs(l.value))}</span></li>`).join("")}</ul>
      <div class="total"><span>Celkem</span><span>${kc(r.total)}</span></div>
      <small>Vratná kauce ${kc(P.deposit)} se hradí při převzetí. V ceně je ${P.km} km/den.</small>`;
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();

  form.addEventListener("submit", e => {
    e.preventDefault();
    const s = state();
    const err = validate(s);
    if (err) { errBox.textContent = err; f.dateFrom.focus(); return; }
    if (!f.name.value.trim() || !f.phone.value.trim() || !f.email.value.trim()) {
      $("#formErr").textContent = "Vyplňte prosím jméno, telefon i e-mail.";
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) {
      $("#formErr").textContent = "Zadejte prosím platný e-mail.";
      return;
    }
    $("#formErr").textContent = "";
    if (f.website && f.website.value) return; // past na roboty (skryté pole)
    const r = P ? calcPrice(P, s) : { nights: Math.round((s.to - s.from) / 86400000), total: 0 };
    const calUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + "&text=" + encodeURIComponent("Rezervace: " + f.name.value.trim())
      + "&dates=" + iso(s.from).replace(/-/g, "") + "/" + iso(s.to).replace(/-/g, "")
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
      "Počet nocí": r.nights,
      "Počet osob": s.guests,
      "Orientační cena": kc(r.total),
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
