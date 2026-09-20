# Rezervační systém s Google Kalendářem – návod k nasazení

Schéma: `rezervace.html` → JavaScript → **Google Apps Script (Web App)** → Google Kalendář + Google Tabulka + e-mail.
Ve veřejném webu nejsou žádné klíče ani hesla, jen adresa Web Appu.

## Jak systém funguje
1. Zákazník vybere převzetí a vrácení. Obsazené termíny web zná z Google Kalendáře (ukazuje jen **volno / obsazeno**).
2. Při odeslání skript znovu zkontroluje kalendář. Když je termín obsazený, odmítne ho
   („Tento termín již není k dispozici. Vyberte prosím jiný termín.“).
3. Volný termín uloží jako **POPTÁVKA** do Google Tabulky a pošle vám e-mail „NOVÁ POPTÁVKA PRONÁJMU OBYTNÉHO VOZU“
   s odkazy **POTVRDIT** a **ZAMÍTNOUT**. Zákazník dostane e-mail, že poptávku přijmete a že není potvrzena.
4. Poptávka **termín neblokuje**. Obsazený je až po vašem potvrzení.
5. Klik na odkaz otevře stránku s tlačítkem. Až po kliknutí na tlačítko skript pod zámkem znovu ověří kalendář
   (kdyby mezitím potvrdil termín někdo jiný) a vytvoří událost **„REZERVACE – Jméno“**. Zákazník dostane potvrzení.
6. Potvrzenou rezervaci můžete zrušit odkazem v e-mailu o potvrzení. Termín se pak uvolní.

Stavy: **POPTÁVKA → POTVRZENO** nebo **ZRUŠENO**.
Vrácení a převzetí v tentýž den je povoleno (10.–17. 7. a 17.–24. 7. se nepřekrývají).

---

## Krok 1: Google Tabulka (interní evidence poptávek)
1. Přihlaste se do Google účtu, kterému patří kalendář „Rezervace obytného vozu“.
2. Otevřete **sheets.google.com** → **Prázdná tabulka**.
3. Pojmenujte ji například **Poptávky obytný vůz** (vlevo nahoře).
4. Tabulku **nesdílejte** – obsahuje osobní údaje zákazníků a vidíte ji jen vy. Do webu se z ní nic nedostane.

## Krok 2: vložení Code.gs do Google Apps Script
1. V Tabulce klikněte na **Rozšíření → Apps Script**. Otevře se editor.
2. V levém sloupci klikněte na soubor **Code.gs**, smažte celý jeho obsah (ukázkovou funkci `myFunction`).
3. Otevřete soubor `backend/google-apps-script/Code.gs` z tohoto projektu, zkopírujte **celý** obsah a vložte ho do Code.gs.
4. Vlevo dole klikněte na ozubené kolo **Nastavení projektu** a zaškrtněte
   **Zobrazit soubor manifestu „appsscript.json“ v editoru**.
5. Vraťte se do **Editoru** (ikona `< >`), otevřete `appsscript.json`, smažte jeho obsah a vložte obsah souboru
   `backend/google-apps-script/appsscript.json` z projektu.
6. Stiskněte **Ctrl+S** (uložit). Pojmenování projektu (nahoře) např. „Rezervace obytného vozu“.
7. V `Code.gs` nahoře zkontrolujte `CONFIG`. Už je předvyplněné: `OWNER_EMAIL`, `OWNER_PHONE` a `CALENDAR_ID`.
   Telefon a e-mail měňte **jen tady** (jediné místo pro e-mail správce).

## Krok 3: spuštění `setup` a schválení oprávnění
1. V horní liště editoru vyberte ve výběru funkcí **setup** a klikněte na **Spustit**.
2. Zobrazí se **Vyžaduje se autorizace** → **Zkontrolovat oprávnění** → vyberte svůj Google účet.
3. Google napíše „Aplikace nebyla ověřena“ (je to váš vlastní skript). Klikněte na **Pokročilé** →
   **Přejít na … (nebezpečné)** → **Povolit** (kalendář, tabulky, odesílání e-mailů).
4. `setup` vytvoří tajný klíč pro podpis odkazů (uloží se jen ve vlastnostech skriptu, ne do kódu), propojí Tabulku
   a otestuje zápis do kalendáře (vytvoří a hned smaže testovací událost 10. 1. 2099).
5. V **Protokolu provádění** dole musí být **`SETUP OK`**. Při chybě:
   - „Kalendář nebyl nalezen“ → ID v `CONFIG` neodpovídá, nebo kalendář nepatří tomuto účtu,
   - „Skript musí být otevřen z Google Tabulky“ → skript nevznikl přes Rozšíření → Apps Script v Tabulce.

## Krok 4: nasazení jako Web App
1. Vpravo nahoře **Nasadit → Nové nasazení**.
2. U ozubeného kola vyberte typ **Webová aplikace**.
3. Nastavte:
   - Popis: `Rezervace v1`
   - **Spustit jako: Já** (váš účet)
   - **Kdo má přístup: Kdokoli** (aby web mohl volat skript i bez přihlášení zákazníka; kalendář ani Tabulka přesto zůstávají soukromé)
4. Klikněte na **Nasadit** (případně znovu povolte oprávnění).
5. Zkopírujte **URL webové aplikace**. Končí na `/exec` a vypadá takto:
   `https://script.google.com/macros/s/AKfy…/exec`
6. Rychlý test: otevřete v prohlížeči tuto adresu s `?action=busy` na konci. Musí vrátit něco jako
   `{"ok":true,"busy":[]}` (obsazená období, žádná jména).

## Krok 5: vložení URL do webu
1. Otevřete `rezervace.html` a najděte formulář `<form id="resForm" …>`.
2. Do atributu vložte adresu z kroku 4:
   ```html
   data-api-url="https://script.google.com/macros/s/AKfy…/exec"
   ```
3. Uložte, potvrďte (commit) a odešlete na GitHub (ve VS Code **Potvrdit → Synchronizovat změny**).
   Za 1–2 minuty se web aktualizuje (obnovte Ctrl+F5).

Dokud je `data-api-url` prázdné, web funguje po starém (odeslání přes FormSubmit, bez kontroly obsazenosti).
Jakmile ho vyplníte, poptávky chodí **jen** přes nový systém (FormSubmit se nepoužije, takže nehrozí dvojí odeslání).

## Krok 6: první testovací rezervace
1. Otevřete zveřejněnou stránku Rezervace. V panelu „1. Kalendář obsazenosti“ se objeví kalendář.
2. Vyplňte formulář (klidně svým jménem a e-mailem) s termínem za několik měsíců a klikněte na **Odeslat poptávku e-mailem**.
   Zobrazí se: „Děkujeme za Vaši poptávku. Termín nyní prověříme a ozveme se Vám.“
3. Zkontrolujte:
   - do schránky správce přišel e-mail **Nová poptávka pronájmu obytného vozu** s větou „Rezervace zatím není potvrzena.“,
   - v Google Tabulce na listu **Poptávky** je nový řádek se stavem **POPTÁVKA**,
   - v Google Kalendáři zatím **nic** není a termín na webu je stále volný.
4. V e-mailu klikněte na **POTVRDIT REZERVACI** → otevře se stránka → klikněte na tlačítko **POTVRDIT REZERVACI**.
   Zobrazí se „Hotovo. Rezervace je POTVRZENA…“.
5. Zkontrolujte, že:
   - v Google Kalendáři je událost **REZERVACE – Jméno** s podrobnostmi v popisu,
   - Tabulka má stav **POTVRZENO**,
   - po obnovení webu je termín **obsazený** (modře) a nelze na něj poslat další poptávku,
   - zákazník dostal e-mail o potvrzení.
6. Test uklidíte odkazem **zrušit** v e-mailu „Rezervace POTVRZENA“ (nebo událost smažete v kalendáři).

## Změna kódu později
Po každé úpravě `Code.gs`: **Nasadit → Spravovat nasazení →** ikona tužky **→ Verze: Nová verze → Nasadit**.
URL zůstane stejná, `rezervace.html` se měnit nemusí.

## Bezpečnost a soukromí
- Web (veřejný JavaScript) obsahuje jen adresu Web Appu. Žádné tokeny, hesla ani klíče.
- Veřejně dostupné je jen **obsazeno / volno** (období bez jmen, e-mailů, telefonů a poznámek).
- Odkazy Potvrdit / Zamítnout / Zrušit jsou podepsané tajným klíčem uloženým jen ve skriptu. Nejdou zfalšovat.
  Samotné otevření odkazu nic nepotvrdí, potvrzuje se až tlačítkem na stránce (e-mailové skenery nic nespustí).
- Ochrana proti spamu: skryté pole, nereálně rychlé odeslání, limit 3 poptávek za hodinu na jeden e-mail
  a 40 celkem za hodinu, ignorování opakovaného odeslání téhož formuláře.
- Google Tabulku ani kalendář veřejně nesdílejte.

## Poznámky
- E-maily odcházejí z vašeho Google účtu (bezplatný účet má denní limit kolem 100 zpráv, pro tento provoz stačí).
- Pražská verze (`praha/`) zůstala beze změny a funguje jako dříve. Napojení na vlastní kalendář se řeší později.
- Kalendář používá celodenní události. Konec události je **den vrácení** (ten už není obsazený),
  proto lze převzít vůz v den vrácení předchozího zákazníka. Termíny, které si do kalendáře zapíšete ručně
  (např. servis), web také bere jako obsazené.
