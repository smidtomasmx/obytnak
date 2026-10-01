/**
 * REZERVAČNÍ BACKEND – Obytňák Vysočina
 * ---------------------------------------------------------------------------
 * Google Apps Script Web App. Běží pod VAŠÍM Google účtem, web na GitHub Pages
 * s ním komunikuje jen přes jeho adresu (URL) – žádné přístupové údaje ve webu nejsou.
 *
 * Co skript dělá:
 *  1) GET  ?action=busy&from=YYYY-MM-DD&to=YYYY-MM-DD  → vrátí POUZE obsazená období
 *     (žádná jména, e-maily ani telefony) – z toho web ukáže VOLNO / OBSAZENO.
 *  2) POST {action:"inquiry", …} → zkontroluje kalendář, uloží POPTÁVKU do Google
 *     Tabulky a pošle e-mail správci s odkazy POTVRDIT / ZAMÍTNOUT.
 *     Poptávka termín NEBLOKUJE, obsazený je až po potvrzení.
 *  3) Odkaz v e-mailu otevře stránku s tlačítkem. Po kliknutí se termín ZNOVU ověří
 *     (pod zámkem LockService) a teprve potom se vytvoří událost v Google Kalendáři.
 *
 * Tajný klíč pro podpis odkazů se vytvoří při spuštění funkce setup() a je uložený
 * jen ve "Vlastnostech skriptu" (Script Properties) – nikdy ne v tomto souboru.
 *
 * Postup nasazení je v souboru NAVOD-REZERVACE.md.
 */

/* =========================== NASTAVENÍ (jediné místo) =========================== */
const CONFIG = {
  OWNER_EMAIL: 'obytnakvysocina@icloud.com',   // kam chodí poptávky a potvrzení (správce)
  OWNER_PHONE: '+420 732 574 782',             // uvádí se v e-mailech pro zákazníka
  CALENDAR_ID: '5990ff64f3e5f5f05869d3d0b27516a105001076221c4289f92f6b5cc70f2b26@group.calendar.google.com',
  BRAND: 'Obytňák Vysočina',
  VEHICLE: 'Carado A 464',
  SHEET_NAME: 'Poptávky',                      // název listu v Google Tabulce
  TIMEZONE: 'Europe/Prague',

  // Minimální délka pronájmu. Platí podle data PŘEVZETÍ (stejně jako ve webu) a backend ji vynucuje
  // i při přímém POST požadavku. Vymezení hlavní sezóny musí být STEJNÉ jako v rezervace.html
  // (tabulka Sazby, řádek "Hlavní sezóna": data-ranges="07-01/08-31") – při změně upravte OBĚ místa.
  HIGH_SEASON: [['07-01', '08-31']],           // hlavní sezóna: MM-DD od – do (včetně)
  MIN_DAYS_HIGH_SEASON: 5,                     // v hlavní sezóně nejméně 5 dní
  MIN_DAYS_OFF_SEASON: 2,                      // mimo sezónu nejméně 2 dny
  MAX_DAYS: 60,                                // nejdelší povolený pronájem (ve dnech)
  MAX_GUESTS: 6,                               // počet míst k spaní/jízdě
  MAX_ADVANCE_DAYS: 730,                       // jak daleko dopředu lze rezervovat

  MIN_FORM_SECONDS: 3,                         // kratší vyplnění formuláře = robot
  MAX_PER_EMAIL_PER_HOUR: 3,                   // limit poptávek jednoho e-mailu za hodinu
  MAX_TOTAL_PER_HOUR: 40,                      // celkový limit poptávek za hodinu
  NOTIFY_CUSTOMER_ON_REJECT: true,             // poslat zákazníkovi e-mail, když poptávku zamítnete
  NOTIFY_CUSTOMER_ON_CANCEL: true,             // poslat zákazníkovi e-mail, když zrušíte POTVRZENOU rezervaci

  SEND_DEPOSIT_INVOICE: true,                  // po POTVRZENÍ rezervace automaticky vygenerovat a poslat zálohovou fakturu (PDF)
  DEPOSIT_PERCENT: 0.30,                       // výše zálohy z celkového nájemného (30 %)
  INVOICE_DUE_BUSINESS_DAYS: 5,                // splatnost zálohové faktury v pracovních dnech od vystavení

  SEND_FINAL_INVOICE: true,                    // automaticky poslat konečnou fakturu (doplatek) před termínem převzetí
  FINAL_INVOICE_DAYS_BEFORE: 40,               // kolik dní před převzetím pronajímatel konečnou fakturu posílá
  FINAL_INVOICE_DUE_DAYS_BEFORE: 14,           // do kdy (dní před převzetím) má nájemce doplatek uhradit
};

/**
 * Fakturační údaje pronajímatele – jediné místo pro tyto údaje (používá se v zálohové faktuře).
 * Při změně sídla, IČ, DIČ nebo čísla účtu upravte JEN tady.
 */
const SUPPLIER = {
  name: 'Tomáš Šmíd',
  addressLine1: 'Nad Cihelnou 663',
  addressLine2: '582 91 Světlá nad Sázavou',
  country: 'Česká republika',
  ic: '87323001',
  dic: 'CZ9009272129',
  bankAccount: '1481320017/3030',
};

/**
 * Ceník pro výpočet zálohové faktury – MUSÍ být stejný jako tabulka #priceTable v rezervace.html
 * a tabulka Sazby v cenik.html. Při změně ceny upravte VŠECHNA tři místa.
 * ranges: pole [MM-DD, MM-DD] období, ve kterých sazba platí (poslední řádek bez "ranges" = výchozí sezóna).
 */
const SEASONS = [
  { name: 'Hlavní sezóna', price: 3900, ranges: [['07-01', '08-31']] },
  { name: 'Vedlejší sezóna', price: 3300, ranges: [['06-01', '06-30'], ['09-01', '09-30']] },
  { name: 'Ostatní', price: 2600, ranges: null },               // výchozí sezóna (leden–květen, říjen–prosinec)
];
const PRICE_TIERS = [{ from: 11, discount: 0.10 }, { from: 21, discount: 0.15 }];  // sleva za délku pronájmu
const SERVICE_FEE = 1500;                                       // jednorázový servisní poplatek (Kč, vč. DPH)

const STATUS = { INQUIRY: 'POPTÁVKA', CONFIRMED: 'POTVRZENO', CANCELLED: 'ZRUŠENO' };
const COLS = ['ID', 'Vytvořeno', 'Stav', 'Jméno', 'Telefon', 'E-mail', 'Osob', 'Převzetí', 'Vrácení',
              'Dní', 'Poznámka', 'ID události v kalendáři', 'Aktualizováno', 'RequestId', 'Konečná faktura'];
const COL = COLS.reduce((o, n, i) => { o[n] = i; return o; }, {});

/* ================================ POMOCNÉ FUNKCE ================================ */
function props_() { return PropertiesService.getScriptProperties(); }
function calendar_() {
  const cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!cal) throw new Error('Kalendář nebyl nalezen nebo k němu nemáte přístup (CALENDAR_ID).');
  return cal;
}
function tz_() { return CONFIG.TIMEZONE; }

/** Date -> 'YYYY-MM-DD' (v časové zóně skriptu) */
function ymd_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
/** 'YYYY-MM-DD' -> Date (půlnoc v časové zóně skriptu) nebo null při chybě */
function parseYmd_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}
function addDays_(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function addDaysYmd_(s, n) { return ymd_(addDays_(parseYmd_(s), n)); }
function daysBetween_(a, b) { return Math.round((parseYmd_(b).getTime() - parseYmd_(a).getTime()) / 86400000); }
function todayYmd_() { return ymd_(new Date()); }
/** 'YYYY-MM-DD' -> 'DD.MM.YYYY' */
function czDate_(s) { const p = String(s).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }

/** Správné překrytí: nový_začátek < existující_konec  A  nový_konec > existující_začátek */
function overlaps_(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && aEnd > bStart; }

/** 'den' / 'dny' / 'dní' (stejně jako ve webu) */
function daysWord_(n) { return n === 1 ? 'den' : n < 5 ? 'dny' : 'dní'; }
/** Minimální počet dní podle data převzetí ('YYYY-MM-DD'): hlavní sezóna 5, mimo sezónu 2. */
function minDaysFor_(fromYmd) {
  const md = String(fromYmd).slice(5);                       // 'MM-DD'
  const inHigh = CONFIG.HIGH_SEASON.some(function (r) { return md >= r[0] && md <= r[1]; });
  return inHigh ? CONFIG.MIN_DAYS_HIGH_SEASON : CONFIG.MIN_DAYS_OFF_SEASON;
}

/** Kč -> '3 990 Kč' (stejný formát jako kc() v js/main.js) */
function czMoney_(n) {
  return Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ') + ' Kč';
}
/** Přičte n PRACOVNÍCH dnů (bez svátků, ty se v tomto jednoduchém výpočtu nezohledňují). */
function addBusinessDays_(d, n) {
  const x = new Date(d.getTime());
  let added = 0;
  while (added < n) {
    x.setDate(x.getDate() + 1);
    const dow = x.getDay();                    // 0 = neděle, 6 = sobota
    if (dow !== 0 && dow !== 6) added++;
  }
  return x;
}

/* ------------------------------ Výpočet ceny pronájmu (pro fakturu) ------------------------------ */
/** Sezóna platná pro dané datum ('YYYY-MM-DD'). */
function seasonForDate_(ymd) {
  const md = String(ymd).slice(5);              // 'MM-DD'
  for (let i = 0; i < SEASONS.length; i++) {
    const s = SEASONS[i];
    if (s.ranges && s.ranges.some(function (r) { return md >= r[0] && md <= r[1]; })) return s;
  }
  return SEASONS[SEASONS.length - 1];           // výchozí (bez "ranges")
}
/**
 * Cena pronájmu = půjčovné (dny × sazba sezóny) − sleva za délku + servisní poplatek. Bez DPH navíc,
 * všechny ceny v SEASONS/SERVICE_FEE jsou už vč. DPH (stejně jako na webu).
 */
function calcRentalTotal_(fromYmd, toYmd) {
  const days = daysBetween_(fromYmd, toYmd) + 1;         // den převzetí i den vrácení se počítají
  const bySeason = {};                                    // name -> {season, count}
  let rent = 0;
  for (let i = 0; i < days; i++) {
    const s = seasonForDate_(addDaysYmd_(fromYmd, i));
    rent += s.price;
    if (!bySeason[s.name]) bySeason[s.name] = { season: s, count: 0 };
    bySeason[s.name].count++;
  }
  const tier = PRICE_TIERS.filter(function (t) { return days >= t.from; }).sort(function (a, b) { return b.discount - a.discount; })[0];
  const discount = tier ? Math.round(rent * tier.discount) : 0;
  const lines = [];
  Object.keys(bySeason).forEach(function (name) {
    const b = bySeason[name];
    lines.push({ label: 'Půjčovné – ' + name + ' (' + b.count + ' ' + daysWord_(b.count) + ' × ' + czMoney_(b.season.price) + ')', value: b.count * b.season.price });
  });
  if (discount) lines.push({ label: 'Sleva ' + Math.round(tier.discount * 100) + ' % (od ' + tier.from + ' dní)', value: -discount });
  lines.push({ label: 'Servisní poplatek', value: SERVICE_FEE });
  const total = lines.reduce(function (sum, l) { return sum + l.value; }, 0);
  return { days: days, lines: lines, total: total };
}

/* ==================================== ZÁLOHOVÁ FAKTURA (PDF) ==================================== */
/** Číslo zálohové faktury odvozené z ID poptávky (jedinečné, bez nutnosti samostatné číselné řady). */
function invoiceNumber_(id) { return 'ZF' + String(id).replace(/^P/, ''); }
/** Variabilní symbol pro platbu – české banky přijímají jen ČÍSLO o max. 10 číslicích. */
function invoiceVs_(id) { return String(id).replace(/\D/g, '').slice(0, 10); }

/**
 * Vytvoří PDF zálohové faktury přes dočasný Google Dokument (vytvoří ho, naplní, exportuje do PDF
 * a dokument smaže – v Disku po sobě nenechává žádné trvalé soubory, jen e-mailovou přílohu).
 */
function buildDepositInvoicePdf_(o, calc) {
  const invNo = invoiceNumber_(o.id);
  const today = new Date();
  const due = addBusinessDays_(today, CONFIG.INVOICE_DUE_BUSINESS_DAYS);
  const deposit = Math.round(calc.total * CONFIG.DEPOSIT_PERCENT);

  const doc = DocumentApp.create('TMP-' + invNo);
  try {
    const body = doc.getBody();
    body.setMarginTop(46).setMarginBottom(46).setMarginLeft(56).setMarginRight(56);

    body.appendParagraph('ZÁLOHOVÁ FAKTURA č. ' + invNo).setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph('(daňový doklad o přijetí zálohy bude vystaven po úhradě)').setItalic(true).setSpacingAfter(14);

    const partiesTable = body.appendTable([
      ['Dodavatel', 'Odběratel'],
      [
        SUPPLIER.name + '\n' + SUPPLIER.addressLine1 + '\n' + SUPPLIER.addressLine2 + '\n' + SUPPLIER.country +
        '\nIČ: ' + SUPPLIER.ic + '\nDIČ: ' + SUPPLIER.dic,
        o.name + '\n' + o.phone + '\n' + o.email,
      ],
    ]);
    partiesTable.getRow(0).getCell(0).setBold(true);
    partiesTable.getRow(0).getCell(1).setBold(true);
    body.appendParagraph('').setSpacingAfter(6);

    body.appendTable([
      ['Datum vystavení', Utilities.formatDate(today, tz_(), 'dd.MM.yyyy')],
      ['Datum splatnosti', Utilities.formatDate(due, tz_(), 'dd.MM.yyyy')],
      ['Variabilní symbol', invoiceVs_(o.id)],
      ['Bankovní spojení', SUPPLIER.bankAccount],
      ['Předmět', 'Záloha na pronájem obytného vozu ' + CONFIG.VEHICLE],
      ['Termín pronájmu', czDate_(o.from) + ' – ' + czDate_(o.to) + ' (' + calc.days + ' ' + daysWord_(calc.days) + ')'],
    ]);
    body.appendParagraph('').setSpacingAfter(10);

    const itemRows = [['Položka', 'Částka']];
    calc.lines.forEach(function (l) { itemRows.push([l.label, czMoney_(l.value)]); });
    itemRows.push(['Celkové nájemné (vč. DPH)', czMoney_(calc.total)]);
    const itemsTable = body.appendTable(itemRows);
    itemsTable.getRow(0).getCell(0).setBold(true);
    itemsTable.getRow(0).getCell(1).setBold(true);
    const lastRow = itemsTable.getRow(itemsTable.getNumRows() - 1);
    lastRow.getCell(0).setBold(true);
    lastRow.getCell(1).setBold(true);

    const depPar = body.appendParagraph('K ÚHRADĚ – ZÁLOHA ' + Math.round(CONFIG.DEPOSIT_PERCENT * 100) + ' %: ' + czMoney_(deposit));
    depPar.setBold(true).setFontSize(14).setSpacingBefore(16);

    body.appendParagraph(
      'Zálohu prosím uhraďte do data splatnosti na výše uvedený bankovní účet pod uvedeným variabilním symbolem. ' +
      'Termín pronájmu je pevně rezervovaný až po připsání zálohy na účet a po vrácení jednoho podepsaného výtisku smlouvy o nájmu. ' +
      'Doplatek nájemného (' + czMoney_(calc.total - deposit) + ') zašleme formou konečné faktury nejpozději ' + CONFIG.FINAL_INVOICE_DAYS_BEFORE +
      ' dnů před termínem převzetí vozidla; uhraďte ho prosím nejpozději ' + CONFIG.FINAL_INVOICE_DUE_DAYS_BEFORE + ' dnů před termínem převzetí vozidla.'
    ).setSpacingBefore(14);

    body.appendParagraph('Vratná kauce 25 000 Kč se hradí v hotovosti při předání vozidla a není součástí této zálohy.').setSpacingBefore(8);

    doc.saveAndClose();
    const file = DriveApp.getFileById(doc.getId());
    const pdf = file.getAs('application/pdf').setName('Zalohova-faktura-' + invNo + '.pdf');
    file.setTrashed(true);
    return { blob: pdf, invNo: invNo, vs: invoiceVs_(o.id), deposit: deposit, due: due };
  } catch (err) {
    try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (e2) { /* ignore */ }
    throw err;
  }
}

/** Sestaví a e-mailem pošle zálohovou fakturu zákazníkovi (PDF příloha), po úspěšném POTVRZENÍ rezervace. */
function sendDepositInvoice_(o) {
  const calc = calcRentalTotal_(o.from, o.to);
  const inv = buildDepositInvoicePdf_(o, calc);
  const attachments = [inv.blob];
  // Náhled smlouvy o nájmu – chyba při jeho generování nesmí zablokovat odeslání faktury.
  try { attachments.push(buildContractPreviewPdf_(o, calc)); } catch (e) { console.error('Náhled smlouvy: ' + e); }
  const text = 'Dobrý den,\n\nv příloze zasíláme zálohovou fakturu č. ' + inv.invNo + ' a náhled smlouvy o nájmu k Vaší rezervaci obytného vozu ' + CONFIG.VEHICLE +
    ' (' + czDate_(o.from) + ' – ' + czDate_(o.to) + ').\n\nK úhradě: ' + czMoney_(inv.deposit) +
    '\nSplatnost: ' + Utilities.formatDate(inv.due, tz_(), 'dd.MM.yyyy') +
    '\nBankovní spojení: ' + SUPPLIER.bankAccount + '\nVariabilní symbol: ' + inv.vs +
    '\n\nTermín je pevně rezervovaný až po připsání zálohy na účet a po vrácení jednoho podepsaného výtisku smlouvy. Kdyby cokoli, volejte ' + CONFIG.OWNER_PHONE +
    '.\n\nS pozdravem\n' + CONFIG.BRAND;
  MailApp.sendEmail({
    to: o.email, subject: 'Zálohová faktura ' + inv.invNo + ' – ' + CONFIG.BRAND, body: text,
    replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.BRAND, attachments: attachments,
  });
}

/* ==================================== KONEČNÁ FAKTURA (DOPLATEK, PDF) ==================================== */
/** Číslo konečné faktury odvozené z ID poptávky (KF = konečná faktura, ZF = zálohová). */
function invoiceNumberFinal_(id) { return 'KF' + String(id).replace(/^P/, ''); }

/** Stejná stavba jako zálohová faktura, ale ukazuje už zaplacenou zálohu a doplatek (zbývajících 70 %). */
function buildFinalInvoicePdf_(o, calc) {
  const invNo = invoiceNumberFinal_(o.id);
  const today = new Date();
  const due = addDays_(parseYmd_(o.from), -CONFIG.FINAL_INVOICE_DUE_DAYS_BEFORE);
  const deposit = Math.round(calc.total * CONFIG.DEPOSIT_PERCENT);
  const rest = calc.total - deposit;

  const doc = DocumentApp.create('TMP-' + invNo);
  try {
    const body = doc.getBody();
    body.setMarginTop(46).setMarginBottom(46).setMarginLeft(56).setMarginRight(56);

    body.appendParagraph('KONEČNÁ FAKTURA č. ' + invNo).setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph('(doplatek nájemného – záloha 30 % byla uhrazena samostatnou zálohovou fakturou)').setItalic(true).setSpacingAfter(14);

    const partiesTable = body.appendTable([
      ['Dodavatel', 'Odběratel'],
      [
        SUPPLIER.name + '\n' + SUPPLIER.addressLine1 + '\n' + SUPPLIER.addressLine2 + '\n' + SUPPLIER.country +
        '\nIČ: ' + SUPPLIER.ic + '\nDIČ: ' + SUPPLIER.dic,
        o.name + '\n' + o.phone + '\n' + o.email,
      ],
    ]);
    partiesTable.getRow(0).getCell(0).setBold(true);
    partiesTable.getRow(0).getCell(1).setBold(true);
    body.appendParagraph('').setSpacingAfter(6);

    body.appendTable([
      ['Datum vystavení', Utilities.formatDate(today, tz_(), 'dd.MM.yyyy')],
      ['Datum splatnosti', Utilities.formatDate(due, tz_(), 'dd.MM.yyyy')],
      ['Variabilní symbol', invoiceVs_(o.id)],
      ['Bankovní spojení', SUPPLIER.bankAccount],
      ['Předmět', 'Doplatek nájemného za pronájem obytného vozu ' + CONFIG.VEHICLE],
      ['Termín pronájmu', czDate_(o.from) + ' – ' + czDate_(o.to) + ' (' + calc.days + ' ' + daysWord_(calc.days) + ')'],
    ]);
    body.appendParagraph('').setSpacingAfter(10);

    const itemRows = [['Položka', 'Částka']];
    calc.lines.forEach(function (l) { itemRows.push([l.label, czMoney_(l.value)]); });
    itemRows.push(['Celkové nájemné (vč. DPH)', czMoney_(calc.total)]);
    itemRows.push(['Uhrazená záloha (30 %)', '– ' + czMoney_(deposit)]);
    const itemsTable = body.appendTable(itemRows);
    itemsTable.getRow(0).getCell(0).setBold(true);
    itemsTable.getRow(0).getCell(1).setBold(true);

    const depPar = body.appendParagraph('K ÚHRADĚ – DOPLATEK: ' + czMoney_(rest));
    depPar.setBold(true).setFontSize(14).setSpacingBefore(16);

    body.appendParagraph(
      'Doplatek prosím uhraďte do data splatnosti na výše uvedený bankovní účet pod uvedeným variabilním symbolem, nejpozději však při předání vozidla.'
    ).setSpacingBefore(14);
    body.appendParagraph('Servisní poplatek 1 500 Kč (účtuje se při pronájmu do 7 dnů) a vratná kauce 25 000 Kč se hradí v hotovosti při předání vozidla a nejsou součástí této faktury.').setSpacingBefore(8);

    doc.saveAndClose();
    const file = DriveApp.getFileById(doc.getId());
    const pdf = file.getAs('application/pdf').setName('Konecna-faktura-' + invNo + '.pdf');
    file.setTrashed(true);
    return { blob: pdf, invNo: invNo, vs: invoiceVs_(o.id), rest: rest, due: due };
  } catch (err) {
    try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (e2) { /* ignore */ }
    throw err;
  }
}

/** Sestaví a e-mailem pošle konečnou fakturu (doplatek) zákazníkovi, PDF příloha. */
function sendFinalInvoice_(o) {
  const calc = calcRentalTotal_(o.from, o.to);
  const inv = buildFinalInvoicePdf_(o, calc);
  const text = 'Dobrý den,\n\nv příloze zasíláme konečnou fakturu č. ' + inv.invNo + ' k Vaší rezervaci obytného vozu ' + CONFIG.VEHICLE +
    ' (' + czDate_(o.from) + ' – ' + czDate_(o.to) + ').\n\nK úhradě (doplatek): ' + czMoney_(inv.rest) +
    '\nSplatnost: ' + Utilities.formatDate(inv.due, tz_(), 'dd.MM.yyyy') +
    '\nBankovní spojení: ' + SUPPLIER.bankAccount + '\nVariabilní symbol: ' + inv.vs +
    '\n\nServisní poplatek a vratnou kauci hradíte v hotovosti až při předání vozidla. Kdyby cokoli, volejte ' + CONFIG.OWNER_PHONE +
    '.\n\nS pozdravem\n' + CONFIG.BRAND;
  MailApp.sendEmail({
    to: o.email, subject: 'Konečná faktura ' + inv.invNo + ' – ' + CONFIG.BRAND, body: text,
    replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.BRAND, attachments: [inv.blob],
  });
}

/**
 * Denní úloha (spouští ji časový spouštěč vytvořený funkcí setup()). Najde POTVRZENÉ rezervace,
 * jejichž den převzetí je přesně za CONFIG.FINAL_INVOICE_DAYS_BEFORE dní, a pokud jim ještě nebyla
 * poslána konečná faktura, pošle ji a řádek označí (sloupec "Konečná faktura"), aby se neposlala dvakrát.
 */
function sendDueFinalInvoices_() {
  if (!CONFIG.SEND_FINAL_INVOICE) return;
  const targetYmd = addDaysYmd_(todayYmd_(), CONFIG.FINAL_INVOICE_DAYS_BEFORE);
  readRows_().forEach(function (r) {
    const o = rowToObj_(r);
    if (o.status !== STATUS.CONFIRMED) return;
    if (o.from !== targetYmd) return;
    if (String(r.v[COL['Konečná faktura']] || '')) return;   // už poslána
    try {
      sendFinalInvoice_(o);
      setRowFields_(r.rowIndex, { 'Konečná faktura': Utilities.formatDate(new Date(), tz_(), 'dd.MM.yyyy HH:mm:ss') });
    } catch (err) {
      console.error('Konečná faktura (' + o.id + '): ' + err);
    }
  });
}

/* ================================ NÁHLED SMLOUVY O NÁJMU (PDF) ================================ */
/**
 * Text smlouvy MUSÍ zůstat stejný jako dokumenty v dokumenty/Smlouva-o-najmu-obytneho-vozu.docx/.pdf
 * (ty jsou určené k tisku a podpisu). Tohle je jen automaticky generovaný NÁHLED přiložený k zálohové
 * faktuře – jméno, telefon, e-mail, termín a cenu nájemce zná už z rezervace, tak jsou předvyplněné.
 * Datum narození, doklady a adresu nájemce doplní ručně do podepisovaného vyhotovení.
 */
function ct_(body, text) { const p = body.appendParagraph(text); p.setFontSize(10).setSpacingAfter(6); return p; }
function ctH_(body, text) { const p = body.appendParagraph(text); p.setBold(true).setFontSize(12).setForegroundColor('#237A34').setSpacingBefore(14).setSpacingAfter(4); return p; }
function ctB_(body, text) { const p = body.appendParagraph('•  ' + text); p.setFontSize(10).setIndentStart(18).setSpacingAfter(4); return p; }

function buildContractPreviewPdf_(o, calc) {
  const deposit = Math.round(calc.total * CONFIG.DEPOSIT_PERCENT);
  const doc = DocumentApp.create('TMP-SMLOUVA-' + o.id);
  try {
    const body = doc.getBody();
    body.setMarginTop(46).setMarginBottom(46).setMarginLeft(56).setMarginRight(56);

    const title = body.appendParagraph('SMLOUVA O NÁJMU DOPRAVNÍHO PROSTŘEDKU');
    title.setHeading(DocumentApp.ParagraphHeading.TITLE).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    const sub = body.appendParagraph('NÁHLED – pronájem obytného vozu ' + CONFIG.VEHICLE);
    sub.setItalic(true).setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingAfter(4);
    const sub2 = body.appendParagraph('Toto je informativní náhled smlouvy k rezervaci ' + o.id + '. Konečné znění k podpisu s doplněnými osobními údaji obdržíte od pronajímatele.');
    sub2.setItalic(true).setFontSize(9).setForegroundColor('#4A5A51').setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingAfter(14);

    ctH_(body, 'Smluvní strany');
    ct_(body, 'Pronajímatel: ' + SUPPLIER.name + ', ' + SUPPLIER.addressLine1 + ', ' + SUPPLIER.addressLine2 + ', ' + SUPPLIER.country +
      ', IČ: ' + SUPPLIER.ic + ', DIČ: ' + SUPPLIER.dic + ', tel. ' + CONFIG.OWNER_PHONE + ', e-mail ' + CONFIG.OWNER_EMAIL + '.');
    ct_(body, 'Nájemce: ' + o.name + ', tel. ' + o.phone + ', e-mail ' + o.email + ' (datum narození, číslo dokladu a adresu nájemce doplní pronajímatel do vyhotovení k podpisu).');

    ctH_(body, 'I. Předmět nájmu');
    ct_(body, 'Pronajímatel je vlastníkem a provozovatelem obytného vozu ' + CONFIG.VEHICLE + ' (dále jen „vozidlo“), včetně standardní výbavy uvedené v předávacím protokolu.');

    ctH_(body, 'II. Doba a místo nájmu');
    ct_(body, 'Doba nájmu: ' + czDate_(o.from) + ' 7:00 hod – ' + czDate_(o.to) + ' 17:00 hod (' + calc.days + ' ' + daysWord_(calc.days) + ').');
    ct_(body, 'Místo předání a vrácení: ' + SUPPLIER.addressLine1 + ', ' + SUPPLIER.addressLine2 + ', nebo jiné dohodnuté místo. Předání a seznámení s vozidlem trvá přibližně 60 minut.');

    ctH_(body, 'III. Řidič a podmínky užívání');
    ctB_(body, 'Vozidlo smí řídit nájemce nebo jím určená osoba starší 21 let s řidičským oprávněním skupiny B po dobu nejméně 2 let.');
    ctB_(body, 'Při převzetí vozidla je nutné předložit 2 platné doklady totožnosti (OP, ŘP, PAS).');
    ctB_(body, 'Nájemce plně odpovídá za přepravované osoby i náklad.');

    ctH_(body, 'IV. Nájemné a platební podmínky');
    ct_(body, 'Nájemné za sjednanou dobu činí celkem ' + czMoney_(calc.total) + ' vč. DPH (servisní poplatek a případné doplňky jsou součástí).');
    ct_(body, 'Záloha ve výši 30 % (' + czMoney_(deposit) + ') se hradí na základě přiložené zálohové faktury do 5 pracovních dnů od jejího vystavení; termín je závazně rezervován až po připsání zálohy a doručení jednoho podepsaného vyhotovení této smlouvy.');
    ct_(body, 'Doplatek nájemného (' + czMoney_(calc.total - deposit) + ') zašle pronajímatel formou konečné faktury nejpozději ' + CONFIG.FINAL_INVOICE_DAYS_BEFORE + ' dnů před převzetím; nájemce jej uhradí nejpozději ' + CONFIG.FINAL_INVOICE_DUE_DAYS_BEFORE + ' dnů před převzetím vozidla.');
    ct_(body, 'Servisní poplatek 1 500 Kč vč. DPH (jen při pronájmu do 7 dnů) se hradí v hotovosti při předání vozidla.');

    ctH_(body, 'V. Kauce');
    ct_(body, 'Při předání vozidla skládá nájemce vratnou kauci 25 000 Kč v hotovosti, určenou na škody nekryté pojištěním, neodstranitelné znečištění a poškození vozidla. Přesáhne-li škoda výši kauce, bude částka přesahující kauci na nájemci vymáhána v plné výši.');

    ctH_(body, 'VI. Pojištění');
    ct_(body, 'Vozidlo je pojištěno povinným ručením a havarijním pojištěním se spoluúčastí 10 %, min. 10 000 Kč, kterou hradí nájemce při zaviněné pojistné události.');

    ctH_(body, 'VII. Povinnosti nájemce při užívání vozidla');
    ctB_(body, 'Zakázány jsou jakékoliv úpravy vozidla, kouření (i el. cigaret), otevřený oheň a přeprava PHM v nádobách.');
    ctB_(body, 'Mimo určená místa je zakázáno převážet kola, lyže a předměty ohrožující vnitřní vybavení.');
    ctB_(body, 'Do chemického WC patří jen toaletní papír pro eko WC; WC se nesmí používat bez chemie.');
    ctB_(body, 'Přeprava domácích zvířat ve vozidle je zakázána.');
    ctB_(body, 'Opravy a náhradní díly jen se souhlasem pronajímatele; poškození pneumatiky/disku hradí nájemce v plné výši.');

    ctH_(body, 'VIII. Předání a vrácení vozidla');
    ct_(body, 'Vozidlo se předává i vrací uklizené, s vyprázdněnou kazetou WC a plnou nádrží nafty (bionafta zakázána). Neuklizené vrácení: pokuta 2 000 Kč, při znečištění olejem/barvou/krví 5 000 Kč.');
    ct_(body, 'Škody či opotřebení během cesty se hlásí neprodleně na tel. 605 357 011, 732 574 782, i pokud brání dalšímu pronájmu.');

    ctH_(body, 'IX. Servisní poplatek zahrnuje');
    ctB_(body, 'vyčištění interiéru a umytí exteriéru;');
    ctB_(body, '2 plynové lahve (jedna plná, druhá zůstatková) – další spotřebu si nájemce doplňuje sám; ztráta redukce na plyn se účtuje zvlášť;');
    ctB_(body, 'čistá prostěradla, chemii do WC a na nádobí, doplnění provozních kapalin, přípravu vozidla a asistenční službu.');

    ctH_(body, 'X. Porucha, nehoda a škodní událost');
    ct_(body, 'Poruchu i škodní událost je nutné neprodleně nahlásit pronajímateli; při nehodě přivolat i Policii ČR a pořídit fotodokumentaci.');

    ctH_(body, 'XI. Sankce');
    ctB_(body, 'Ztráta klíčů, OTP nebo zelené karty: 10 000 Kč.');
    ctB_(body, 'Hrubě znečištěné vozidlo: 5 000 Kč.');
    ctB_(body, 'Pozdní vrácení: 10 000 Kč za každých započatých 24 hodin.');

    ctH_(body, 'XII. Odstoupení od smlouvy a storno podmínky');
    ct_(body, 'Storno poplatek z ceny nájemného: 20 % (60+ dní předem), 50 % (30+ dní), 80 % (15+ dní), 90 % (14 a méně dní), 100 % (7 a méně dní nebo nepřevzetí vozidla). Nespotřebovaná část nájemného se při předčasném ukončení nevrací.');

    ctH_(body, 'XIII. Ochrana osobních údajů');
    ct_(body, 'Osobní údaje nájemce zpracovává pronajímatel jen za účelem plnění této smlouvy a zákonných povinností, v souladu s GDPR.');

    ctH_(body, 'XIV. Závěrečná ustanovení');
    ct_(body, 'Smlouva se řídí občanským zákoníkem (§ 2321 a násl.). Nedílnou součástí je obchodní podmínky pronajímatele, se kterými nájemce podpisem vyjadřuje souhlas. Neplatnost jednotlivého ustanovení nemá vliv na platnost ostatních (salvátorská klauzule). Spory řeší obecné soudy ČR dle sídla pronajímatele.');

    doc.saveAndClose();
    const file = DriveApp.getFileById(doc.getId());
    const pdf = file.getAs('application/pdf').setName('Smlouva-nahled-' + o.id + '.pdf');
    file.setTrashed(true);
    return pdf;
  } catch (err) {
    try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (e2) { /* ignore */ }
    throw err;
  }
}

function escHtml_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function clean_(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function hash_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s))).slice(0, 22);
}

/* ============================ PODPIS ODKAZŮ (TOKENY) ============================ */
function secret_() {
  const s = props_().getProperty('SECRET');
  if (!s) throw new Error('Chybí tajný klíč. Spusťte funkci setup().');
  return s;
}
function sign_(id, action) {
  const bytes = Utilities.computeHmacSha256Signature(id + '|' + action, secret_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '').slice(0, 40);
}
function verifyToken_(id, action, token) {
  const expected = sign_(id, action);
  const given = String(token || '');
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
function webAppUrl_() { return ScriptApp.getService().getUrl(); }
function actionLink_(id, action) {
  return webAppUrl_() + '?action=' + action + '&id=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(sign_(id, action));
}

/* ============================== GOOGLE TABULKA ============================== */
function spreadsheet_() {
  const id = props_().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Není nastavena Google Tabulka. Spusťte funkci setup().');
  return active;
}
function sheet_() {
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) sh = ensureSheet_(ss);
  return sh;
}
function ensureSheet_(ss) {
  ss = ss || spreadsheet_();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < COLS.length) {
    // existující tabulka z dřívější verze skriptu – doplní chybějící sloupce (např. "Konečná faktura") na konec záhlaví
    const have = sh.getLastColumn();
    sh.getRange(1, have + 1, 1, COLS.length - have).setValues([COLS.slice(have)]).setFontWeight('bold');
  }
  // telefon a data ukládat jako čistý text (bez převodu na čísla/data)
  [COL['Telefon'], COL['Převzetí'], COL['Vrácení'], COL['ID'], COL['RequestId']].forEach(function (c) {
    sh.getRange(2, c + 1, 1000, 1).setNumberFormat('@');
  });
  return sh;
}
function readRows_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, COLS.length).getValues();
  return values.map(function (r, i) { return { rowIndex: i + 2, v: r }; });
}
function findRow_(id) {
  const rows = readRows_();
  for (let i = 0; i < rows.length; i++) if (String(rows[i].v[COL['ID']]) === String(id)) return rows[i];
  return null;
}
/** Buňka s datem -> 'YYYY-MM-DD' (kdyby ji Tabulka sama převedla na datum) */
function cellYmd_(v) { return v instanceof Date ? ymd_(v) : String(v); }
/**
 * Přidá řádek na konec listu. Celý řádek se nejdřív nastaví jako ČISTÝ TEXT, takže Tabulka nic
 * nevyhodnotí jako vzorec (ochrana proti vložení "=…") a telefon zůstane beze změny (+420…).
 */
function appendInquiryRow_(row) {
  const sh = sheet_();
  const r = sh.getLastRow() + 1;
  const range = sh.getRange(r, 1, 1, COLS.length);
  range.setNumberFormat('@');
  range.setValues([row]);
  return r;
}
function rowToObj_(r) {
  const v = r.v;
  return {
    id: String(v[COL['ID']]), status: String(v[COL['Stav']]), name: String(v[COL['Jméno']]),
    phone: String(v[COL['Telefon']]), email: String(v[COL['E-mail']]), guests: v[COL['Osob']],
    from: cellYmd_(v[COL['Převzetí']]), to: cellYmd_(v[COL['Vrácení']]), days: v[COL['Dní']],
    note: String(v[COL['Poznámka']]), eventId: String(v[COL['ID události v kalendáři']] || ''),
  };
}
function setRowFields_(rowIndex, fields) {
  const sh = sheet_();
  Object.keys(fields).forEach(function (name) {
    sh.getRange(rowIndex, COL[name] + 1).setValue(fields[name]);
  });
  sh.getRange(rowIndex, COL['Aktualizováno'] + 1).setValue(Utilities.formatDate(new Date(), tz_(), 'dd.MM.yyyy HH:mm:ss'));
}

/* =============================== GOOGLE KALENDÁŘ =============================== */
/** Převede událost na období [start, end) v 'YYYY-MM-DD'. Konec je "vyloučený" (den vrácení). */
function eventToRange_(ev) {
  let start, end;
  if (ev.isAllDayEvent()) {
    start = ymd_(ev.getAllDayStartDate());
    end = ymd_(ev.getAllDayEndDate());
  } else {
    const s = ev.getStartTime(), e = ev.getEndTime();
    start = ymd_(s);
    const midnight = e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0;
    end = midnight ? ymd_(e) : ymd_(addDays_(e, 1));
  }
  if (end <= start) end = addDaysYmd_(start, 1);
  return { start: start, end: end };
}
/** Všechna obsazená období, která zasahují do intervalu <from, to>. Bez jakýchkoli osobních údajů. */
function getBusyRanges_(fromYmd, toYmd) {
  const from = addDays_(parseYmd_(fromYmd), -1), to = addDays_(parseYmd_(toYmd), 2);
  return calendar_().getEvents(from, to).map(eventToRange_).sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
}
/** Je období [startYmd, endYmd) volné? endYmd je první volný den, tedy den vrácení + 1. */
function isRangeFree_(startYmd, endYmd) {
  const busy = getBusyRanges_(startYmd, endYmd);
  for (let i = 0; i < busy.length; i++) if (overlaps_(startYmd, endYmd, busy[i].start, busy[i].end)) return false;
  return true;
}

/* ================================== HTTP: GET ================================== */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'busy') return json_(busyResponse_(p));
    if (p.action === 'confirm' || p.action === 'reject' || p.action === 'cancel') return adminPage_(p);
  } catch (err) {
    console.error('doGet: ' + err);
    if (p.action === 'busy') return json_({ ok: false, message: 'Obsazenost se nepodařilo načíst.' });
    return HtmlService.createHtmlOutput('<p>Došlo k chybě. Zkuste to prosím znovu.</p>');
  }
  return HtmlService.createHtmlOutput('<p>Rezervační služba běží.</p>');
}

function busyResponse_(p) {
  const from = parseYmd_(p.from) ? p.from : todayYmd_();
  let to = parseYmd_(p.to) ? p.to : addDaysYmd_(from, CONFIG.MAX_ADVANCE_DAYS);
  if (daysBetween_(from, to) > CONFIG.MAX_ADVANCE_DAYS + 31) to = addDaysYmd_(from, CONFIG.MAX_ADVANCE_DAYS + 31);
  return { ok: true, busy: getBusyRanges_(from, to) };   // jen start/end – žádné údaje o zákaznících
}

/* ================================== HTTP: POST ================================== */
function doPost(e) {
  let body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, code: 'BAD_REQUEST', message: 'Neplatný požadavek.' }); }
  try {
    if (body.action === 'inquiry') return json_(submitInquiry_(body));
    return json_({ ok: false, code: 'BAD_REQUEST', message: 'Neznámá akce.' });
  } catch (err) {
    console.error('doPost: ' + err + '\n' + (err && err.stack));
    return json_({ ok: false, code: 'SERVER',
      message: 'Rezervaci se nepodařilo odeslat. Zkuste to prosím znovu nebo nás kontaktujte telefonicky.' });
  }
}

/* ------------------------------ Validace poptávky ------------------------------ */
function validateInquiry_(p) {
  const errors = {};
  const d = {};
  d.name = clean_(p.name, 80);
  if (d.name.length < 2) errors.name = 'Zadejte jméno a příjmení.';
  d.phone = clean_(p.phone, 25);
  const digits = d.phone.replace(/\D/g, '');
  if (!/^\+?[0-9 ()\-]{9,25}$/.test(d.phone) || digits.length < 9 || digits.length > 15) errors.phone = 'Zadejte platný telefon.';
  d.email = clean_(p.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = 'Zadejte platný e-mail.';
  d.guests = parseInt(p.guests, 10);
  if (!(d.guests >= 1 && d.guests <= CONFIG.MAX_GUESTS)) errors.guests = 'Počet osob musí být 1 až ' + CONFIG.MAX_GUESTS + '.';
  d.note = clean_(p.note, 1000);
  d.estimate = clean_(p.estimate, 40);
  d.extras = clean_(p.extras, 200);
  d.from = String(p.from || ''); d.to = String(p.to || '');
  const from = parseYmd_(d.from), to = parseYmd_(d.to);
  if (!from || !to) errors.dates = 'Vyberte platné datum převzetí a vrácení.';
  else {
    const today = todayYmd_();
    if (d.from < today) errors.dates = 'Datum převzetí nemůže být v minulosti.';
    else if (d.to < d.from) errors.dates = 'Vrácení nemůže být před převzetím.';
    else if (d.from > addDaysYmd_(today, CONFIG.MAX_ADVANCE_DAYS)) errors.dates = 'Termín je příliš daleko v budoucnosti.';
    else {
      d.days = daysBetween_(d.from, d.to) + 1;             // den převzetí i den vrácení se počítají
      const minN = minDaysFor_(d.from);
      if (d.days < minN) errors.dates = 'Minimální délka pronájmu pro tento termín je ' + minN + ' ' + daysWord_(minN) + '.';
      else if (d.days > CONFIG.MAX_DAYS) errors.dates = 'Nejdelší možný pronájem je ' + CONFIG.MAX_DAYS + ' dní. Kontaktujte nás prosím telefonicky.';
    }
  }
  return { ok: Object.keys(errors).length === 0, data: d, errors: errors };
}

/* ------------------------------ Ochrana proti spamu ------------------------------ */
function hourKey_() { return Utilities.formatDate(new Date(), tz_(), 'yyyyMMddHH'); }
function bumpCounter_(key, limit) {
  const cache = CacheService.getScriptCache();
  const n = parseInt(cache.get(key) || '0', 10) + 1;
  cache.put(key, String(n), 3700);
  return n <= limit;
}

/* ------------------------------- Přijetí poptávky ------------------------------- */
function submitInquiry_(p) {
  const v = validateInquiry_(p);
  if (!v.ok) return { ok: false, code: 'INVALID', message: 'Zkontrolujte prosím údaje ve formuláři.', fields: v.errors };
  const d = v.data;

  // roboti: vyplněné skryté pole nebo nereálně rychlé vyplnění → tiše zahodit
  if (p.website || !(Number(p.elapsed) >= CONFIG.MIN_FORM_SECONDS * 1000)) {
    console.warn('Poptávka zahozena jako spam');
    return { ok: true };
  }
  // opakované odeslání téhož formuláře (dvojklik, obnovení)
  const requestId = clean_(p.requestId, 64);
  const cache = CacheService.getScriptCache();
  if (requestId && cache.get('req_' + requestId)) return { ok: true, duplicate: true };

  // celkový limit poptávek za hodinu (ochrana proti zahlcení)
  const TOO_MANY = { ok: false, code: 'RATE_LIMIT',
    message: 'Odeslali jste příliš mnoho poptávek. Zkuste to prosím později nebo nás kontaktujte telefonicky.' };
  if (!bumpCounter_('rl_all_' + hourKey_(), CONFIG.MAX_TOTAL_PER_HOUR)) return TOO_MANY;

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let id, rowIndex;
  try {
    // 1) termín nesmí kolidovat s potvrzenou rezervací v Google Kalendáři
    if (!isRangeFree_(d.from, addDaysYmd_(d.to, 1))) {
      return { ok: false, code: 'BUSY', message: 'Tento termín již není k dispozici. Vyberte prosím jiný termín.' };
    }
    // 2) stejná otevřená poptávka téhož zákazníka se neukládá dvakrát
    const dup = readRows_().filter(function (r) {
      const o = rowToObj_(r);
      return o.status === STATUS.INQUIRY && o.email === d.email && o.from === d.from && o.to === d.to;
    });
    if (dup.length) { if (requestId) cache.put('req_' + requestId, '1', 900); return { ok: true, duplicate: true }; }
    // limit poptávek jednoho e-mailu za hodinu (počítají se jen přijaté poptávky)
    if (!bumpCounter_('rl_e_' + hash_(d.email) + '_' + hourKey_(), CONFIG.MAX_PER_EMAIL_PER_HOUR)) return TOO_MANY;

    // 3) uložit do tabulky
    id = 'P' + Utilities.formatDate(new Date(), tz_(), 'yyMMddHHmmss') + Utilities.getUuid().slice(0, 4).toUpperCase();
    const row = COLS.map(function () { return ''; });
    row[COL['ID']] = id;
    row[COL['Vytvořeno']] = Utilities.formatDate(new Date(), tz_(), 'dd.MM.yyyy HH:mm:ss');
    row[COL['Stav']] = STATUS.INQUIRY;
    row[COL['Jméno']] = d.name;
    row[COL['Telefon']] = d.phone;
    row[COL['E-mail']] = d.email;
    row[COL['Osob']] = d.guests;
    row[COL['Převzetí']] = d.from;
    row[COL['Vrácení']] = d.to;
    row[COL['Dní']] = d.days;
    row[COL['Poznámka']] = (d.extras ? 'Doplňky: ' + d.extras + (d.note ? '. ' : '') : '') + d.note;   // doplňky se ukládají do poznámky (tabulka nemá vlastní sloupec)
    row[COL['RequestId']] = requestId;
    rowIndex = appendInquiryRow_(row);

    // 4) e-mail správci (když se nepodaří, poptávku nevedeme, ať ji zákazník zkusí znovu)
    try { sendOwnerInquiry_(id, d); }
    catch (err) {
      sheet_().deleteRow(rowIndex);
      throw new Error('Odeslání e-mailu správci selhalo: ' + err);
    }
    if (requestId) cache.put('req_' + requestId, '1', 900);
  } finally {
    lock.releaseLock();
  }
  // potvrzení pro zákazníka (chyba zde poptávku neruší)
  try { sendCustomerAck_(d); } catch (err) { console.error('Potvrzení zákazníkovi: ' + err); }
  return { ok: true };
}

/* ==================================== E-MAILY ==================================== */
function summaryLines_(o) {
  return [
    ['Jméno', o.name], ['Telefon', o.phone], ['E-mail', o.email], ['Počet osob', o.guests],
    ['Převzetí', czDate_(o.from)], ['Vrácení', czDate_(o.to)], ['Počet dní', o.days],
    ['Poznámka', o.note ? o.note : '–'],
  ];
}
function sendOwnerInquiry_(id, d) {
  const confirmUrl = actionLink_(id, 'confirm'), rejectUrl = actionLink_(id, 'reject');
  const lines = summaryLines_(d);
  if (d.extras) lines.push(['Doplňky', d.extras]);
  if (d.estimate) lines.push(['Orientační cena (podle webu)', d.estimate]);
  const text = ['NOVÁ POPTÁVKA PRONÁJMU OBYTNÉHO VOZU', ''].concat(
    lines.map(function (l) { return l[0] + ': ' + l[1]; }),
    ['', 'Stav: POPTÁVKA – čeká na potvrzení', 'Rezervace zatím není potvrzena.', '',
     'POTVRDIT rezervaci: ' + confirmUrl, 'ZAMÍTNOUT poptávku: ' + rejectUrl, '', 'ID poptávky: ' + id]).join('\n');
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#14251b">' +
    '<h2 style="margin:0 0 12px">NOVÁ POPTÁVKA PRONÁJMU OBYTNÉHO VOZU</h2>' +
    '<table style="border-collapse:collapse">' + lines.map(function (l) {
      return '<tr><td style="padding:4px 14px 4px 0;color:#555"><b>' + escHtml_(l[0]) + ':</b></td><td style="padding:4px 0">' + escHtml_(l[1]) + '</td></tr>';
    }).join('') + '</table>' +
    '<p style="margin:16px 0 4px"><b>Stav:</b> POPTÁVKA – čeká na potvrzení</p>' +
    '<p style="margin:0 0 18px"><b>Rezervace zatím není potvrzena.</b></p>' +
    '<p><a href="' + escHtml_(confirmUrl) + '" style="background:#2f9e44;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">POTVRDIT REZERVACI</a>' +
    ' &nbsp; <a href="' + escHtml_(rejectUrl) + '" style="background:#b3261e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">ZAMÍTNOUT</a></p>' +
    '<p style="color:#777;font-size:12px">Po kliknutí se otevře stránka s tlačítkem k potvrzení. ID poptávky: ' + escHtml_(id) + '</p></div>';
  MailApp.sendEmail({
    to: CONFIG.OWNER_EMAIL,
    subject: 'Nová poptávka pronájmu obytného vozu: ' + czDate_(d.from) + ' – ' + czDate_(d.to) + ' (' + d.name + ')',
    body: text, htmlBody: html, replyTo: d.email, name: CONFIG.BRAND,
  });
}
function sendCustomerAck_(d) {
  const lines = summaryLines_(d).filter(function (l) { return l[0] !== 'Telefon' && l[0] !== 'E-mail'; });
  const text = 'Dobrý den,\n\nděkujeme za Vaši poptávku. Termín nyní prověříme a ozveme se Vám, nejpozději do 24 hodin.\n' +
    'Rezervace zatím není potvrzena.\n\n' + lines.map(function (l) { return l[0] + ': ' + l[1]; }).join('\n') +
    '\n\nKdyby cokoli, volejte ' + CONFIG.OWNER_PHONE + '.\n\nS pozdravem\n' + CONFIG.BRAND;
  MailApp.sendEmail({ to: d.email, subject: 'Poptávka přijata – ' + CONFIG.BRAND, body: text, replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.BRAND });
}
function sendCustomerConfirmed_(o) {
  const lines = summaryLines_(o).filter(function (l) { return l[0] !== 'Telefon' && l[0] !== 'E-mail'; });
  const text = 'Dobrý den,\n\nVaše rezervace obytného vozu ' + CONFIG.VEHICLE + ' je POTVRZENA.\n\n' +
    lines.map(function (l) { return l[0] + ': ' + l[1]; }).join('\n') +
    '\n\nPřevzetí a vrácení domluvíme telefonicky, případně nás kontaktujte na ' + CONFIG.OWNER_PHONE + '.\n\nS pozdravem\n' + CONFIG.BRAND;
  MailApp.sendEmail({ to: o.email, subject: 'Rezervace potvrzena – ' + CONFIG.BRAND, body: text, replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.BRAND });
}
function sendCustomerRejected_(o) {
  const text = 'Dobrý den,\n\nbohužel Vám pro požadovaný termín ' + czDate_(o.from) + ' – ' + czDate_(o.to) +
    ' nemůžeme rezervaci potvrdit. Rádi Vám nabídneme jiný termín – stačí odpovědět na tento e-mail nebo zavolat na ' +
    CONFIG.OWNER_PHONE + '.\n\nS pozdravem\n' + CONFIG.BRAND;
  MailApp.sendEmail({ to: o.email, subject: 'K Vaší poptávce – ' + CONFIG.BRAND, body: text, replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.BRAND });
}
/** E-mail zákazníkovi při zrušení už POTVRZENÉ rezervace (jiný text než při zamítnutí poptávky). */
function sendCustomerCancelled_(o) {
  const text = 'Dobrý den,\n\nVaše potvrzená rezervace obytného vozu ' + CONFIG.VEHICLE + ' na termín ' + czDate_(o.from) + ' – ' +
    czDate_(o.to) + ' byla ZRUŠENA. Termín je opět volný.\n\nPokud máte dotaz nebo chcete domluvit jiný termín, odpovězte na tento e-mail ' +
    'nebo nám zavolejte na ' + CONFIG.OWNER_PHONE + '.\n\nS pozdravem\n' + CONFIG.BRAND;
  MailApp.sendEmail({ to: o.email, subject: 'Rezervace zrušena – ' + CONFIG.BRAND, body: text, replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.BRAND });
}
function sendOwnerConfirmed_(o) {
  const cancelUrl = actionLink_(o.id, 'cancel');
  MailApp.sendEmail({
    to: CONFIG.OWNER_EMAIL,
    subject: 'Rezervace POTVRZENA: ' + czDate_(o.from) + ' – ' + czDate_(o.to) + ' (' + o.name + ')',
    body: 'Rezervace byla potvrzena a zapsána do Google Kalendáře.\n\nJméno: ' + o.name + '\nPřevzetí: ' + czDate_(o.from) +
      '\nVrácení: ' + czDate_(o.to) + '\n\nPokud ji potřebujete zrušit: ' + cancelUrl + '\n\nID: ' + o.id,
    name: CONFIG.BRAND,
  });
}

/* ============== POTVRZENÍ / ZAMÍTNUTÍ / ZRUŠENÍ (odkazy z e-mailu) ============== */
const ACTION_TEXT = {
  confirm: { title: 'Potvrdit rezervaci', button: 'POTVRDIT REZERVACI', ask: 'Opravdu chcete tuto rezervaci potvrdit a zapsat do Google Kalendáře?' },
  reject: { title: 'Zamítnout poptávku', button: 'ZAMÍTNOUT POPTÁVKU', ask: 'Opravdu chcete tuto poptávku zamítnout?' },
  cancel: { title: 'Zrušit potvrzenou rezervaci', button: 'ZRUŠIT REZERVACI', ask: 'Opravdu chcete potvrzenou rezervaci zrušit? Termín se uvolní.' },
};
function page_(title, inner) {
  const html = '<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:Arial,sans-serif;background:#f4f6f1;color:#14251b;margin:0;padding:24px}.box{max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:26px;box-shadow:0 4px 18px rgba(0,0,0,.08)}' +
    'h1{font-size:1.3rem;margin:0 0 14px}table{border-collapse:collapse;margin:8px 0 18px}td{padding:4px 14px 4px 0;vertical-align:top}td:first-child{color:#555}' +
    'button{font-size:1rem;font-weight:bold;color:#fff;background:#2f9e44;border:0;border-radius:8px;padding:13px 22px;cursor:pointer}button.red{background:#b3261e}button:disabled{opacity:.5}' +
    '.msg{margin-top:16px;padding:12px 14px;border-radius:8px}.ok{background:#e6f4ea}.err{background:#fdecea;color:#8a1c14}</style></head><body><div class="box">' +
    inner + '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title);
}
function adminPage_(p) {
  const action = p.action, id = String(p.id || ''), token = String(p.t || '');
  const txt = ACTION_TEXT[action];
  if (!id || !verifyToken_(id, action, token)) return page_('Neplatný odkaz', '<h1>Neplatný odkaz</h1><p>Odkaz je neplatný nebo poškozený.</p>');
  const row = findRow_(id);
  if (!row) return page_('Nenalezeno', '<h1>Poptávka nenalezena</h1><p>Záznam neexistuje.</p>');
  const o = rowToObj_(row);
  const rows = summaryLines_(o).map(function (l) { return '<tr><td>' + escHtml_(l[0]) + ':</td><td>' + escHtml_(l[1]) + '</td></tr>'; }).join('');
  const inner = '<h1>' + escHtml_(txt.title) + '</h1><table>' + rows + '<tr><td>Stav:</td><td><b>' + escHtml_(o.status) + '</b></td></tr></table>' +
    '<p>' + escHtml_(txt.ask) + '</p><button id="go" class="' + (action === 'confirm' ? '' : 'red') + '">' + escHtml_(txt.button) + '</button><div id="res"></div>' +
    '<script>var A=' + JSON.stringify({ id: id, action: action, token: token }) + ';' +
    'document.getElementById("go").onclick=function(){var b=this;b.disabled=true;b.textContent="Pracuji…";' +
    'google.script.run.withSuccessHandler(function(r){var d=document.getElementById("res");d.className="msg "+(r&&r.ok?"ok":"err");d.textContent=r&&r.message?r.message:"Hotovo.";if(!(r&&r.ok)){b.disabled=false;b.textContent=' + JSON.stringify(txt.button) + ';}else{b.style.display="none";}})' +
    '.withFailureHandler(function(){var d=document.getElementById("res");d.className="msg err";d.textContent="Nepodařilo se provést akci. Zkuste to prosím znovu.";b.disabled=false;b.textContent=' + JSON.stringify(txt.button) + ';})' +
    '.adminAction(A.id,A.action,A.token);};</script>';
  return page_(txt.title, inner);
}

/** Volá se ze stránky (google.script.run). Ověří podpis, znovu zkontroluje kalendář a provede akci. */
function adminAction(id, action, token) {
  if (!ACTION_TEXT[action] || !verifyToken_(String(id), action, String(token))) return { ok: false, message: 'Neplatný odkaz.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let mail = null;
  try {
    const row = findRow_(id);
    if (!row) return { ok: false, message: 'Poptávka nebyla nalezena.' };
    const o = rowToObj_(row);

    if (action === 'confirm') {
      if (o.status === STATUS.CONFIRMED) return { ok: true, message: 'Tato rezervace je již potvrzená.' };
      if (o.status === STATUS.CANCELLED) return { ok: false, message: 'Tato poptávka byla zamítnuta nebo zrušena, nelze ji potvrdit.' };
      // ZNOVU zkontrolovat kalendář – mezitím mohl termín potvrdit někdo jiný
      if (!isRangeFree_(o.from, addDaysYmd_(o.to, 1))) {
        return { ok: false, message: 'Termín ' + czDate_(o.from) + ' – ' + czDate_(o.to) + ' mezitím obsadila jiná rezervace. Potvrdit ji nelze. Poptávku můžete zamítnout.' };
      }
      const ev = calendar_().createAllDayEvent('REZERVACE – ' + o.name, parseYmd_(o.from), addDays_(parseYmd_(o.to), 1), {   // konec události = den po vrácení
        description: ['Stav: ' + STATUS.CONFIRMED, 'Jméno: ' + o.name, 'Telefon: ' + o.phone, 'E-mail: ' + o.email, 'Počet osob: ' + o.guests,
          'Převzetí: ' + czDate_(o.from), 'Vrácení: ' + czDate_(o.to), 'Poznámka: ' + (o.note || '–'), 'ID: ' + o.id].join('\n'),
      });
      try { ev.setColor(CalendarApp.EventColor.GREEN); } catch (e) { /* barva není nutná */ }
      setRowFields_(row.rowIndex, { 'Stav': STATUS.CONFIRMED, 'ID události v kalendáři': ev.getId() });
      mail = function () {
        try { sendCustomerConfirmed_(o); } catch (e) { console.error(e); }
        try { sendOwnerConfirmed_(o); } catch (e) { console.error(e); }
        // Zálohová faktura (PDF) – selhání nesmí zpochybnit už provedené potvrzení rezervace, jen se zaloguje.
        if (CONFIG.SEND_DEPOSIT_INVOICE) { try { sendDepositInvoice_(o); } catch (e) { console.error('Zálohová faktura: ' + e); } }
      };
      return { ok: true, message: 'Hotovo. Rezervace je POTVRZENA a zapsána do Google Kalendáře. Zákazník dostane e-mail.' };
    }

    if (action === 'reject') {
      if (o.status === STATUS.CANCELLED) return { ok: true, message: 'Tato poptávka je již zamítnutá.' };
      if (o.status === STATUS.CONFIRMED) return { ok: false, message: 'Rezervace je již potvrzená. Pro zrušení použijte odkaz ze zprávy o potvrzení.' };
      setRowFields_(row.rowIndex, { 'Stav': STATUS.CANCELLED });
      if (CONFIG.NOTIFY_CUSTOMER_ON_REJECT) mail = function () { try { sendCustomerRejected_(o); } catch (e) { console.error(e); } };
      return { ok: true, message: 'Poptávka byla zamítnuta.' };
    }

    if (action === 'cancel') {
      if (o.status === STATUS.CANCELLED) return { ok: true, message: 'Tato rezervace je již zrušená.' };
      if (o.status !== STATUS.CONFIRMED) return { ok: false, message: 'Rezervace není potvrzená.' };
      if (o.eventId) {
        try { const ev = calendar_().getEventById(o.eventId); if (ev) ev.deleteEvent(); } catch (e) { console.error('Mazání události: ' + e); }
      }
      setRowFields_(row.rowIndex, { 'Stav': STATUS.CANCELLED });
      if (CONFIG.NOTIFY_CUSTOMER_ON_CANCEL) mail = function () { try { sendCustomerCancelled_(o); } catch (e) { console.error(e); } };
      return { ok: true, message: 'Rezervace byla zrušena a termín je opět volný.' };
    }
    return { ok: false, message: 'Neznámá akce.' };
  } finally {
    lock.releaseLock();
    if (mail) mail();
  }
}

/* ================================ JEDNORÁZOVÉ NASTAVENÍ ================================ */
/**
 * Spusťte jednou ručně z editoru (Spustit → setup). Vytvoří tajný klíč, propojí Google Tabulku,
 * ověří přístup k Google Kalendáři a otestuje zapisování událostí.
 */
function setup() {
  const props = props_();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Skript musí být otevřen z Google Tabulky (v Tabulce: Rozšíření → Apps Script).');
  props.setProperty('SHEET_ID', ss.getId());
  ensureSheet_(ss);
  calendar_();                 // vyhodí chybu, pokud k němu nemáte přístup
  selfTest_();
  ensureDailyTrigger_();
  Logger.log('SETUP OK. Tabulka: ' + ss.getUrl() + ' | Zbývající denní kvóta e-mailů: ' + MailApp.getRemainingDailyQuota());
  return 'SETUP OK';
}

/** Vytvoří (pokud ještě neexistuje) denní časový spouštěč pro odesílání konečných faktur. */
function ensureDailyTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'sendDueFinalInvoices_' && t.getEventType() === ScriptApp.EventType.CLOCK;
  });
  if (!exists) ScriptApp.newTrigger('sendDueFinalInvoices_').timeBased().everyDays(1).atHour(8).create();
}

/** Ověří, že vytvořená celodenní událost se čte zpět jako správné období [začátek, konec). */
function selfTest_() {
  const cal = calendar_();
  const ev = cal.createAllDayEvent('TEST – smazat', new Date(2099, 0, 10), new Date(2099, 0, 12));
  try {
    const r = eventToRange_(ev);
    if (r.start !== '2099-01-10' || r.end !== '2099-01-12') {
      throw new Error('Celodenní události se čtou jinak, než se očekává: ' + JSON.stringify(r));
    }
    if (isRangeFree_('2099-01-12', '2099-01-14') !== true) throw new Error('Navazující termín by měl být volný.');
    if (isRangeFree_('2099-01-11', '2099-01-13') !== false) throw new Error('Překrývající se termín by měl být obsazený.');
  } finally {
    ev.deleteEvent();
  }
}
