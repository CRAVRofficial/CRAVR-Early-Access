# Bridge, Formular zu Brevo

Hierher migriert am 2026-09-14 aus dem alten, mittlerweile geloeschten Ordner `CRAVR-Warteliste` (Repo-Tippfehler `CRAVR-Early-Acces`). Der Worker selbst lief seit dem Domain-Umzug auf `early.cravr.de` unveraendert weiter, nur der lokale Quellcode lag bis dahin im falschen/alten Repo. Diese Datei ist jetzt die einzige lokale Quelle dafuer.

Kleine Cloudflare-Worker-Funktion, die die Warteliste-Anmeldung (E-Mail plus optionale Preis-Angabe) von `index.html` entgegennimmt und sicher in Brevo einträgt (Liste "CRAVR Early Access", ID 5). Der Brevo-API-Schlüssel steht dabei nie im Website-Code, sondern nur in dieser Funktion, als geschütztes "Secret".

## Stand: vollständig eingerichtet (2026-08-26)

Alles läuft, per Selbsttest bestätigt. Der Worker antwortet unter `https://cravr-warteliste.cravr-official.workers.dev` mit:

```json
{"version":"2026-08-26-secure6","has_brevo_key":true,"doi_template":"11","has_rate_limit":true}
```

Erledigt:

- Brevo-Schlüssel als Secret hinterlegt, Liste 5 und Attribut `PRICE_SIGNAL` vorhanden
- KV-Speicher `cravr-rate-limit` angelegt und als `RATE_LIMIT` verknüpft
- `BREVO_DOI_TEMPLATE_ID` = 11, `BREVO_DOI_REDIRECT_URL` auf die Dankeseite
- Domain `cravr.de` ist bei Brevo vollständig beglaubigt (DKIM 1 und 2, DMARC, Marken-Eintrag), im DNS geprüft
- End-to-End getestet: Anmeldung ausgelöst, Bestätigungsmail kam an, fremde Herkunft wird mit 403 abgewiesen, Honeypot verwirft Bot-Versuche still

## Erfahrungen aus dem Aufbau (2026-08-26), damit sie nicht erneut Zeit kosten

**Die erste Bestaetigungsvorlage landete im Spam und wurde ausserdem unlesbar dargestellt.** Zwei getrennte Ursachen, die zusammen auftraten:

1. **Spam-Signale im HTML.** Die Vorlage baute das Sanduhr-Logo aus Elementen mit `width:0; height:0` und Rahmen-Tricks. Elemente ohne echte Groesse gelten als Tarnmuster, weil Spammer so Inhalte verstecken. Dazu kam sehr wenig echter Text bei viel Gestaltung und keine Absenderangabe im Fuss.
2. **Gmail kehrt im Dunkelmodus Farben um.** Die Vorlage war durchgehend dunkel gebaut. Gmail invertierte sie, wodurch goldene Schrift auf weissem Grund stand und teils nur ein leerer weisser Block ankam. Auch ein dunkelgruener Kopfbereich wurde zu Mintgruen.

**Was die aktuelle Vorlage anders macht:** keine Elemente ohne Groesse, ausformulierter Text, vollstaendige Absenderangabe und Antwortadresse, `color-scheme`-Angabe plus eigene Regeln fuer den Dunkelmodus. Der Kopfbereich ist ein **Bild** (`assets/mail-header-v2.png`, CRAVR in echtem Cinzel, gold in goldener Umrandung auf schwarz). Das loest zwei Probleme auf einmal: Gmail unterstuetzt keine eigenen Schriftarten in E-Mails, und Bilder werden im Dunkelmodus nicht umgefaerbt. Der schwarze Hintergrund bleibt dadurch garantiert schwarz.

**Wenn das Header-Bild geaendert wird:** immer unter neuem Dateinamen speichern. Mailprogramme und GitHub Pages halten Bilder im Zwischenspeicher, unter gleichem Namen sieht der Empfaenger sonst die alte Fassung. Danach eine neue Brevo-Vorlage anlegen, Vorlagen lassen sich ueber die Schnittstelle nicht aendern.

**Weitere Stolpersteine:**

- **Der Mailversand kann mehrere Minuten dauern.** Ein Test gilt nicht als gescheitert, nur weil nach zwei Minuten nichts da ist.
- **Gmails Suche `newer_than:1d` rundet auf Kalendertage** und uebersieht frische Mails. Besser `newer_than:3d`.
- **Die Gmail-Schnittstelle findet den Spam-Ordner nicht zuverlaessig**, auch nicht mit `in:anywhere`. Wenn eine Mail nicht auffindbar ist, im Postfach selbst im Spam nachsehen lassen, statt auf fehlenden Versand zu schliessen.
- **Brevo nutzt `brevo1._domainkey` und `brevo2._domainkey`**, nicht das uebliche `mail._domainkey`. Die Abfrage des falschen Namens fuehrte faelschlich zu dem Schluss, die Domain sei nicht beglaubigt. Sie ist es.
- **Eine neue Domain hat bei Google keinen Ruf.** In den ersten Tagen entscheidet der Filter schwankend. Das legt sich, wenn Mails ankommen und als "Kein Spam" markiert werden.

**Aufraeumen offen:** In Brevo liegen die Testvorlagen 6 bis 10 als Karteileichen. Aktiv ist 11. Loeschen muss Bennett selbst, die Schnittstelle darf Vorlagen nur anlegen und lesen.

## Was der Worker prüft, bevor er etwas einträgt

Vier Stufen, absichtlich hintereinander:

1. **Herkunftsprüfung.** Nur Anfragen von den in `ALLOWED_ORIGINS` eingetragenen Adressen werden angenommen. Wichtig zu verstehen: Die früher allein vorhandene CORS-Regel ist kein Schutz, denn CORS ist nur eine Regel, an die sich Browser halten. Ein Skript umgeht sie. Deshalb wird die Herkunft jetzt zusätzlich im Worker selbst geprüft.
2. **Honeypot.** Das Formular enthält ein Feld, das für Menschen unsichtbar ist. Füllt es jemand aus, war es ein Bot. Der Worker antwortet dann trotzdem freundlich, damit der Bot nicht merkt, dass er erkannt wurde.
3. **Begrenzung pro Absender.** Höchstens 5 Versuche je IP-Adresse in 5 Minuten. Verhindert, dass jemand die Liste per Skript mit tausenden Adressen flutet.
4. **Doppelte Bestätigung (Double Opt-in).** Der Kontakt landet erst nach einem Klick in der Bestätigungsmail auf der Liste. Das verhindert, dass jemand fremde Adressen einträgt, und ist gleichzeitig der Einwilligungsnachweis nach Art. 7 DSGVO.

## Wie es eingerichtet wurde (zum Nachvollziehen)

Diese Schritte sind bereits erledigt, hier nur dokumentiert, falls etwas neu aufgesetzt werden muss.

**KV-Speicher fuer die Anfragebegrenzung.** KV ist ein einfacher Speicher bei Cloudflare, in dem sich der Worker merkt, wie oft eine IP-Adresse es schon versucht hat, wie ein Strichlisten-Zettel neben der Tuer. Angelegt als `cravr-rate-limit`, im Worker unter Settings, Bindings als KV Namespace mit dem Variablennamen `RATE_LIMIT` verknuepft.

**Bestaetigungsmail.** Vorlage "CRAVR Early Access - Anmeldung bestaetigen v6", Nummer 11, Absender `info@cravr.de`. Im Worker als zwei normale Variablen hinterlegt (keine Secrets noetig, das sind keine Geheimnisse):

- `BREVO_DOI_TEMPLATE_ID`, Wert `11`
- `BREVO_DOI_REDIRECT_URL`, Wert `https://cravrofficial.github.io/CRAVR-Early-Acces/danke.html`, nach dem Domain-Umzug `https://early.cravr.de/danke.html`

Fehlen diese beiden Werte, traegt der Worker Kontakte direkt ein, ohne Bestaetigungsschritt. Das ist der Rueckfallweg und fuer den Livegang nicht ausreichend.

## Selbsttest

Ein einfacher Aufruf der Worker-Adresse im Browser zeigt den Zustand:

```
https://cravr-warteliste.cravr-official.workers.dev
```

Antwort bei vollständiger Einrichtung:

```json
{
  "version": "2026-08-26-secure6",
  "has_brevo_key": true,
  "doi_template": "11",
  "has_rate_limit": true
}
```

Steht `has_brevo_key` oder `has_rate_limit` auf `false`, oder ist `doi_template` leer, fehlt der zugehörige Schritt oben.

## Bei Umzug auf die eigene Domain

Wechselt die Seite auf `early.cravr.de`, ist im Worker nichts mehr zu ändern. Diese Adresse steht bereits in `ALLOWED_ORIGINS`, die alte GitHub-Adresse bleibt zusätzlich erlaubt.

## Warum Cloudflare Workers statt GitHub Pages

GitHub Pages liefert nur fertige Dateien aus, kann aber keinen eigenen Code ausführen. Cloudflare Workers ist kostenlos und genau dafür gemacht: ein winziges Stück Code, das im Hintergrund läuft und den Brevo-Schlüssel sicher verwahrt. Die eigentliche Seite bleibt unverändert auf GitHub Pages.
