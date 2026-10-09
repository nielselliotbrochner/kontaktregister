# PONTIFEX

Personlig kontaktbase og projektpipeline. Ren HTML og JavaScript uden byggetrin. Data ligger i Supabase (Supabase-projektet, Stockholm), og siden kan hostes gratis på GitHub Pages.

## Filer

| Fil | Indhold |
|---|---|
| `index.html` | Siden og layout |
| `app.js` | Hele appen, inklusiv login, indlæsning, automatisk gem, CSV-import og redigering |
| `config.js` | Supabase-URL og publishable key |
| `manifest.webmanifest`, `sw.js`, `icon*` | Gør siden installerbar som app på telefon og computer |
| `.nojekyll` | Fortæller GitHub Pages at filerne skal serveres som de er |

`config.js` indeholder kun den publishable key. Den er lavet til at ligge i frontend-kode. Beskyttelsen ligger i login og row level security i databasen: hver bruger kan kun se rækker, hvor `owner_id` er brugerens eget id. Opslagslister (typer, faser, titler m.m.) kan alle logge ind læse, men kun ejeren kan rette dem.

## 1. Læg siden på GitHub Pages

1. Opret et repository på github.com, fx `kontaktregister`.
2. Upload alle filer fra denne mappe til rodniveau i repository (Add file, Upload files). Tag også `.nojekyll` med.
3. Gå til Settings, Pages. Vælg Source: Deploy from a branch, Branch: `main`, mappe `/ (root)`. Gem.
4. Efter et minut er siden live på `https://<dit-brugernavn>.github.io/kontaktregister/`.

Gratis GitHub Pages kræver et offentligt repository. Offentligt betyder, at andre kan læse koden og den publishable key, men ikke dine data. Hvis repository skal være privat, kan Cloudflare Pages eller Netlify (begge gratis) hoste de samme filer fra et privat repository.

## 2. Indstil Supabase (en gang)

I Supabase-projektet:

1. Authentication, URL Configuration: sæt Site URL til sidens adresse fra trin 1. Tilføj samme adresse under Redirect URLs. Det bruges af "Glemt adgangskode".
2. Authentication, Sign In / Providers, Email: slå "Allow new users to sign up" fra. Den publishable key er offentlig, så uden denne indstilling kan fremmede oprette sig selv. Brugere oprettes i stedet manuelt under Authentication, Users, Add user.
3. Din egen bruger findes allerede.

Første gang en bruger logger ind, oprettes brugerens række i tabellen `app_user` automatisk.
4. Authentication, Providers, Email: slå beskyttelse mod lækkede adgangskoder til (Password security). Det kan kun gøres i dashboardet.

## 3. Ryd dummydata, før rigtige data kommer ind

Databasen indeholder opfundne personer, virksomheder, projekter, rammeaftaler og aktiviteter. Kør dette i Supabase, SQL Editor. Det sletter alt i tabellerne for alle brugere. Rækkefølgen betyder noget:

```sql
delete from followup;
delete from intel;
delete from activity;      -- fjerner også deltagere og projektkoblinger
delete from framework;
delete from project;       -- fjerner også roller og projekt_log
delete from contact;       -- fjerner også tilknytninger
delete from company;       -- fjerner også kerneområde-scores
delete from label;         -- fjerner også mærker og invitationslister
```

Kolleger (tabellen `employee`) ligger tilbage. Ret eller slet dem i appen, eller med `delete from employee;`, hvis du vil starte forfra. Vedhæftede filer og PDF'er til intel fjernes ikke af dette. Slet dem i appen først, eller under Storage, bucket `vedhaeftninger`, i Supabase.

## 4. Importér rigtige data

**Kontakter** (fanen Personer, knappen "Importér kontakter"): vælg en CSV-fil. Kolonner genkendes på navn, og du kan rette koblingen i dialogen, før du importerer. Kendte kolonnenavne: Fornavn, Efternavn eller Navn, Titel, E-mail, Telefon, LinkedIn, Virksomhed (eller Firma), CVR, Adresse, Postnr, By, Hjemmeside, Type, Mærker, Noter. Fuldt navn deles i fornavn, mellemnavn og efternavn. Dobbelte fornavne som Anne Marie og efternavne med von, van eller de genkendes. Er navnet tvetydigt, kan du rette det i redigering bagefter. Skilletegn (semikolon, komma, tabulator) og tegnsæt (UTF-8 eller Excel) findes automatisk.

- Virksomheder matches på CVR eller navn. Personer matches på e-mail eller navn og virksomhed.
- Eksisterende poster overskrives ikke. Manglende felter udfyldes.
- Dialogen viser, hvor mange nye personer og virksomheder der oprettes, før noget gemmes.

**Markedsdata** (fanen Projekter, knappen "Importér markedsdata"): CSV fra fx Byggefakta eller HUBEXO. Kolonner: RSM-nummer, Projektnavn, Bygherre, Honorar, Anlægssum, Start (kvartal eller dato), Adresse, Postnr, By. Vælg beløbsenhed og kilde i dialogen. Projekter matches på RSM-nummer. Nye projekter starter i fasen Rygte, og eksisterende får opdateret honorar, start og anlægssum. Ændringer logges.

**Kortkoordinater:** importerede adresser har endnu ingen koordinater og vises derfor ikke på kortet. Knappen "Find koordinater" i toppen slår dem op hos OpenStreetMap (Nominatim) med ét opslag pr. sekund. 200 adresser tager derfor cirka 4 minutter, og vinduet skal holdes åbent. Funktionen er ikke afprøvet mod den rigtige tjeneste.

## 5. Daglig brug

- Alle ændringer gemmes automatisk. Pillen øverst til højre viser "Gemt", "Gemmer…" eller en fejl. Ved fejl prøver appen igen, og ændringerne ligger i vinduet, indtil de er gemt. Luk ikke fanen, mens der står "Gemmer…" eller en fejl.
- "Hent data igen" henter det nyeste fra databasen, fx efter ændringer fra en anden enhed.
- Aktiviteter og projekter har sektionen Vedhæftninger nederst i detaljevisningen. Tilføj fil uploader til en privat mappe i Supabase Storage (op til 25 MB pr. fil, 1 GB samlet på gratis-planen). Tryk på filnavnet for at åbne den, og Slet for at fjerne den. Når du redigerer en aktivitet, kan du også tilføje og fjerne omtalte projekter.
- Rediger og slet findes øverst i detaljevisningen for person, virksomhed, aktivitet og projekt. Sletning kan ikke fortrydes.
- Appen kan installeres: i Chrome eller Edge via installationsikonet i adresselinjen, på iPhone via Del, Føj til hjemmeskærm.

## Rammeaftaler, modenhed og intel

- **Rammeaftaler** har egen fane: bygherre, fase, anlægssum, honorar, vores andel, start, slut og forlængelse. Restværdien regnes lineært over tiden. Projekter kan kobles til en rammeaftale med tildelingsform, og detaljen viser hitrate pr. tildelingsform. I tragten kan rammeaftaler vises med restværdi eller skjules.
- **Alarmer** vises 5 dage før en PQ-frist eller tilbudsfrist og 6 måneder før en vundet rammeaftale udløber.
- **Modenhed** foreslås automatisk for hver virksomhed (Ukendt, Kendt, Aktiv dialog, Kunde, Strategisk partner, Sovende) og kan overstyres manuelt. **Relationsstyrke** (0 til 100, Kold til Stærk) regnes ud fra nyhed, hyppighed, bredde, dybde og tendens.
- **Associerede virksomheder** (grupper): forbind virksomheder, der hænger sammen commercielt, også når du ikke kender koncernen. Gruppens navn er valgfrit og vises ellers som "Ikke navngivet: A + B". Hvert medlem kan have en rolle (Medlem, Moderselskab, Datterselskab, Søsterselskab, Joint venture, Ukendt). En virksomhed kan være i flere grupper, og listen kan filtreres på gruppemedlemskab.
- **Intel** på virksomheder og kontakter: dato, titel, link, note og valgfri PDF. Teksten i PDF'en læses ved upload, så den kan bruges i resuméer. Scannede PDF'er har ingen tekst. Læsningen bruger biblioteket pdf.js fra jsDelivr.
- **Opslagslister** (knappen øverst) redigerer aktivitetstyper, titler, funktioner, tilknytningstyper, rollertyper og bygherretyper.
- **Claude-skills**: `kunderesume` og `moedeoplaeg` læser kun fra databasen og laver en PDF. Knapperne "Kopiér prompt" på virksomhed og kontakt giver den færdige prompt.

## Databasen

Tabeller: `company`, `contact`, `contact_company` (tilknytninger), `employee` (kolleger), `activity` med `activity_contact`, `activity_employee` og `activity_project`, `project` med `project_log`, `framework`, `roles` (roller på projekter og rammeaftaler), `followup`, `intel`, `company_group` og `company_group_member`, `attachment`, `label` og `label_link`, `typology` og `company_typology`, samt opslagstabeller til typer og faser. SQL-scripts til hvert trin ligger i repository (`08` til `13`).

## Kendte begrænsninger

- Alarmer for opfølgning vises som stribe og tal i appen. Der sendes ikke mail eller notifikation.
- Appen kræver forbindelse. Der er ingen offline-redigering.
- To enheder, der redigerer samtidigt, overskriver hinanden på felt-niveau. Den sidste gemte ændring vinder.
- En aktivitet, hvor du ikke selv var med, gemmer kun den første kollega i "via".
- Medarbejdere (kolleger) har ikke selvstændig login. Brugere ligger i `app_user`.
- Mærker på personer er fri tekst. Der er ingen separat administration af dem.
- Appen er bygget til én ejer. Flere brugere kan logge ind, men ser hver deres egne data.

## Opdatering

Erstat filerne i repository med nye versioner. Browseren henter dem ved næste besøg.
