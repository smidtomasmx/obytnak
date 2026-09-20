# Kde upravit texty, kontakty a ceny

Všechny hodnoty jsou přímo v HTML souborech (otevřete je v editoru a přepište text).
Pražská verze je ve složce `praha/`, má stejné soubory, upravujte je tam stejným způsobem.

## Nejrychlejší způsob: Najít a nahradit ve všech souborech
V editoru VS Code stiskněte **Ctrl+Shift+H** (Nahradit v souborech), zadejte původní hodnotu
a novou hodnotu a dejte „Nahradit vše“. Takto změníte třeba telefon na všech stránkách najednou.
Vyhledávání provádějte zvlášť ve složce `praha/`, pokud se tam údaje liší.

## Kontakty
| Co | Kde |
|---|---|
| Telefon, e-mail, adresa, otevírací doba | patička každé stránky (`<footer>`) a `kontakt.html` (čtyři karty nahoře) |
| E-mail, kam chodí poptávky | `rezervace.html` → atribut `data-owner-email` u `<form id="resForm">` |
| Telefon při chybě odeslání | `rezervace.html` → atribut `data-owner-phone` |
| E-mail kontaktního formuláře | `kontakt.html` → atribut `data-owner-email` u `<form id="contactForm">` |
| Mapa | `kontakt.html` → v adrese iframe za `q=` (ulice a město) |
| Instagram, Facebook | patička každé stránky (odkazy `href="#"` u ikon) |

## Ceny
Sazby jsou na **dvou místech**, upravte obě:
1. `cenik.html` → tabulka „Cena pronájmu za den“ (co vidí zákazník).
2. `rezervace.html` → rozbalovací „Sazby a údaje pro výpočet ceny“ (podle toho počítá kalkulačka).
   - Číslo v posledních dvou sloupcích (Min. nocí, Cena / den) stačí přepsat.
   - Atribut `data-ranges` určuje data sezóny (`MM-DD/MM-DD`, více období oddělte čárkou).
   - Řádek `data-ranges="default"` platí pro všechny dny mimo ostatní sezóny.
   - Slevy za délku pobytu jsou v druhé části tabulky (řádky `data-from`).

Ostatní hodnoty:
| Co | Kde |
|---|---|
| Kauce, kilometry v ceně | `cenik.html` (sekce Podmínky) a `rezervace.html` (`id="pdDeposit"`, `id="pdKm"`) |
| Koloběžka, pes | `cenik.html` → tabulka „Doplňkové položky“ |
| Text „od X Kč / den“ na úvodní stránce | `index.html` (dvě místa, hledejte `od 2 290 Kč`) |

## Blog
Všechno je v `blog.html`. Každý článek je tam dvakrát: jako **karta v přehledu** a jako **celý článek** dole
(sekce „ČLÁNEK …“, adresa je její `id`). Nový článek přidáte zkopírováním jedné karty i jednoho článku
a změnou `id` (adresa článku, malá písmena a pomlčky) a odkazů `href="#…"`.

## Google Kalendář a e-maily
- ID kalendáře: `rezervace.html` → atribut `data-calendar-id` u `<div id="calBox">`.
- **Rezervace s kontrolou obsazenosti a potvrzováním** (Google Kalendář): adresa Web Appu je v `rezervace.html` v atributu `data-api-url`, e-mail správce a další nastavení jsou v `backend/google-apps-script/Code.gs` (`CONFIG`). Postup: `NAVOD-REZERVACE.md`.
- Záložní odesílání (FormSubmit, když je `data-api-url` prázdné): e-mail majitele a text potvrzení pro zákazníka jsou v atributech `data-owner-email` a `data-autoresponse` u `<form id="resForm">`. Jednorázová aktivace je popsaná v `NAVOD-EMAIL.md`.

## Co je v JavaScriptu
`js/main.js` obsahuje jen chování (menu, galerie, kalkulačka, odesílání). Žádné texty ani ceny v něm nejsou
a v pražské složce je úplně stejný.
