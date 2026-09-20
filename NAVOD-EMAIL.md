# Automatické odesílání poptávek e-mailem

> **Poznámka:** Toto je popis ZÁLOŽNÍHO odesílání přes FormSubmit. Používá se jen tehdy, když je ve formuláři prázdný atribut `data-api-url`.
> Po nasazení rezervačního systému s Google Kalendářem (viz `NAVOD-REZERVACE.md`) poptávky chodí přes něj a FormSubmit se nepoužije.

Po kliknutí na „Odeslat poptávku“ na stránce Rezervace se **e-mail odešle sám** na adresu majitele
a **zákazník dostane automatické potvrzení** (poptávka byla doručena, do 24 hodin bude potvrzena).
Nic se neotevírá a zákazník nemusí nic dalšího klikat.

Odesílání zajišťuje bezplatná služba **FormSubmit** (formsubmit.co). Nepotřebujete žádný účet ani registraci.

## Kam poptávky chodí
V souboru `rezervace.html` u formuláře (`<form id="resForm" …>`):

| Atribut | Co znamená |
|---|---|
| `data-owner-email` | e-mail, kam se poptávka odešle (Vysočina: obytnakvysocina@icloud.com) |
| `data-owner-phone` | telefon, který se ukáže při chybě odeslání a v potvrzení pro zákazníka |
| `data-autoresponse` | text automatického potvrzení, které dostane zákazník |

Totéž je v `praha/rezervace.html` (pražská verze má vlastní e-mail).

## Jednorázová aktivace (nutné, bez ní e-maily nechodí)
FormSubmit z bezpečnostních důvodů vyžaduje, aby majitel adresu jednou potvrdil:

1. Web musí být zveřejněný na internetu (GitHub Pages). Ze souboru na disku to nemusí fungovat.
2. Otevřete zveřejněnou stránku Rezervace a odešlete **jednu zkušební poptávku** (klidně se svým jménem).
3. Do schránky `data-owner-email` přijde e-mail od **FormSubmit** s tlačítkem **Activate Form**. Klikněte na něj.
   (Když e-mail nevidíte, zkontrolujte složku Spam / Nevyžádaná pošta.)
4. Od té chvíle chodí všechny poptávky automaticky. Zkušební poptávku, která aktivaci spustila, FormSubmit doručí až po potvrzení, případně ji pošlete znovu.

Pokud později změníte `data-owner-email` na jinou adresu, je potřeba aktivaci zopakovat.

## Co dostanete v e-mailu
Tabulka s termínem převzetí a vrácení, počtem nocí a osob, orientační cenou, jménem, telefonem, e-mailem,
poznámkou a odkazem „Přidat do Google Kalendáře“ (jedním klikem si termín vložíte do kalendáře).
Odpověď zákazníkovi napíšete rovnou tlačítkem Odpovědět, protože jeho e-mail je nastavený jako adresa pro odpověď.

## Poznámky
- Údaje zákazníka (jméno, telefon, e-mail) putují přes server služby FormSubmit. Doporučuji je zmínit
  ve zpracování osobních údajů, až budete web zveřejňovat.
- Kontaktní formulář na stránce Kontakt zatím používá původní způsob (otevře se e-mailový program zákazníka).
- Kdyby se odeslání nepovedlo (např. zákazník je offline), zobrazí se hláška s vaším telefonem a e-mailem.
- Pokud chcete vlastní vzhled e-mailů nebo víc kontroly, dá se místo FormSubmit použít služba EmailJS
  (vyžaduje účet a šablony). Napište a přepnu to.
