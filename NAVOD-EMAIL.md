# Automatické odesílání poptávek (EmailJS)

Po nastavení se po kliknutí na „Odeslat poptávku“ **hned odešle e-mail vám** a **klientovi přijde potvrzení**
(„poptávka byla doručena, do 24 hodin ji potvrdíme“). Nic se neotevírá, klient nic dalšího neklikne.

Služba je zdarma (200 e-mailů měsíčně). Nastavení trvá asi 10 minut.

## 1. Účet a e-mailová služba
1. Zaregistrujte se na https://www.emailjs.com
2. **Email Services → Add New Service** → vyberte Gmail (nejjednodušší) nebo Outlook a propojte svůj e-mail.
   (iCloud jde přes „Custom SMTP“ s heslem pro aplikace, je to složitější.)
3. Zkopírujte **Service ID** (např. `service_abc123`).

## 2. Šablona pro vás (majitele)
**Email Templates → Create New Template**
- **To Email:** `{{to_email}}`
- **Reply To:** `{{reply_to}}`
- **Subject:** `Nová poptávka: {{date_from}} – {{date_to}} ({{customer_name}})`
- **Content:**

```
Nová poptávka z webu {{brand}}

Termín: {{date_from}} – {{date_to}} ({{nights}} nocí)
Počet osob: {{guests}}
Orientační cena: {{price}}

Jméno: {{customer_name}}
Telefon: {{customer_phone}}
E-mail: {{customer_email}}
Poznámka: {{note}}

Přidat do Google Kalendáře:
{{calendar_link}}
```
Uložte a zkopírujte **Template ID** → to je `ownerTemplate`.

## 3. Šablona pro klienta (potvrzení)
Druhá šablona:
- **To Email:** `{{to_email}}`
- **Reply To:** `{{reply_to}}`
- **Subject:** `Vaše poptávka byla doručena – {{brand}}`
- **Content:**

```
Dobrý den, {{customer_name}},

děkujeme za vaši poptávku, dorazila k nám v pořádku.
Nejpozději do 24 hodin vám ji potvrdíme.

Shrnutí:
Termín: {{date_from}} – {{date_to}} ({{nights}} nocí)
Počet osob: {{guests}}
Orientační cena: {{price}}

Kdyby cokoli, ozvěte se: {{owner_phone}}, {{owner_email}}

S pozdravem
{{brand}}
```
Uložte a zkopírujte **Template ID** → to je `customerTemplate`.

## 4. Vložení do webu
V EmailJS otevřete **Account → General** a zkopírujte **Public Key**.
V souboru `rezervace.html` vyplňte atributy u `<form id="resForm" …>`:

```html
data-emailjs-public-key="…"
data-emailjs-service="service_…"
data-emailjs-owner-template="template_…"
data-emailjs-customer-template="template_…"
```
(Totéž udělejte v `praha/rezervace.html`, pokud chcete e-maily i z pražské verze.)
## 5. Doporučené zabezpečení
Public Key je na webu vidět (to je u EmailJS normální). Aby ho nikdo nezneužil,
zapněte v EmailJS v **Account → Security** omezení na vaši doménu (až budete mít web na internetu).

## Poznámky
- Testujte, až bude web na internetu (nebo aspoň přes místní server). Při otevření ze souboru na disku
  může prohlížeč požadavky blokovat.
- Dokud atributy `data-emailjs-…` nevyplníte, používá formulář záložní řešení (otevře e-mailový program klienta).
- Kontaktní formulář na stránce Kontakt zatím používá stále původní způsob (otevření e-mailu).
