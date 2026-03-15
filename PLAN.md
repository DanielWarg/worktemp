# Produktplan: Mönster

## Kontext

Appen är idag ett teamregister med canvas, personkort och anteckningar. Den faktiska visionen är en **problemradar** -- ett verktyg som används i teammöten för att fånga utmaningar, matcha dem mot hård data (CRM), och över tid avslöja mönster som teamet "bara hanterar" utan att adressera grundorsaken.

Det som saknas är inte features -- det är en tydlig produktloop: **fånga -> strukturera -> se mönster -> agera**.

---

## Produktposition

**One-liner:** "Se vad ditt team hanterar men aldrig adresserar."

**Köparen:** Ops-chef, teamledare eller Customer Success-ansvarig på medelstora bolag (50-500 anställda) som kör veckomöten och tänker "vi pratar om samma saker varje gång."

**Kategorin:** Meeting-driven problem intelligence. Ingen befintlig produkt kopplar ihop mötesupplevelse med CRM-data.

---

## Fas 1 -- Mötesredo capture (bygger på det som finns)

**Mål:** Appen ska gå att använda i ett riktigt teammöte. En facilitator startar ett möte, klickar på en person, skriver vad de säger, trycker Enter. Klart.

### Datamodell -- nya tabeller

```
MeetingSession    -- id, workspaceId, teamId?, title?, status (PLANNED/ACTIVE/COMPLETED),
                     scheduledFor?, startedAt?, endedAt?, facilitatorId, timestamps
MeetingParticipant -- id, sessionId, personId, joinedAt  (unique: session+person)
Challenge         -- id, sessionId?, personId, workspaceId, contentRaw,
                     sourceType (MEETING/HISTORICAL/IMPORT/BETWEEN_MEETINGS),
                     status (OPEN/ACKNOWLEDGED/RESOLVED), timestamps
```

### Ändringar i befintliga tabeller
- `Person`: lägg till `lastActiveAt DateTime?` -- uppdateras vid ny Challenge/Note

### API-routes (nya)
- `POST /api/meetings` -- skapa session
- `GET /api/meetings/:id` -- hämta session med challenges
- `PATCH /api/meetings/:id` -- starta/avsluta
- `POST /api/meetings/:id/challenges` -- snabb capture (person + text + enter)
- `GET /api/persons/:id/challenges` -- alla challenges per person

### UI-ändringar

**Nytt: Meeting capture view**
- Vänster: deltagarlista (personkort, vertikalt)
- Center: stort capture-fält -- klicka person, skriv, Enter
- Höger: löpande lista över fångade challenges denna session
- Design: mörk bakgrund, stort typsnitt, minimalt UI -- optimerat för hastighet

**Befintligt: Workspace header**
- Ny knapp: "Starta möte" som byter till capture-vyn

**Befintligt: Sidopanel**
- Ny flik: "Utmaningar" bredvid befintlig profil-info

**Befintligt: Personkort på canvas**
- Visa antal öppna challenges som subtil badge
- Visa staleness: "3v sedan senaste input" via `lastActiveAt`

### Komponentuppbrytning
Nuvarande `workspace-shell.tsx` (650 rader) bryts ut till:
- `CanvasView` -- teamcontainrar och personkort
- `MeetingCaptureView` -- den snabba mötesytan
- `PersonDetailPanel` -- sidopanelen
- `TeamCard` / `PersonCard` -- enskilda kort
- `ChallengeInput` -- capture-inputen (återanvänds i möte och sidopanel)

### Vad fas 1 ger användaren
Strukturerad möteslogg per person och session. Idag lever detta i anteckningsblock eller delade docs som ingen återbesöker. Även utan analys är "vad sa varje person i varje möte" värdefullt.

---

## Fas 2 -- Struktur och minne (det som gör att man kommer tillbaka)

**Mål:** Datan blir användbar mellan möten. Facilitatorn har anledning att öppna appen igen.

### Datamodell -- nya tabeller

```
Tag               -- id, workspaceId, name, color?, source (MANUAL/AI_SUGGESTED)
                     (unique: workspace+name)
ChallengeTag      -- id, challengeId, tagId (unique: challenge+tag)
HistoricalImport  -- id, workspaceId, importedById, sourceLabel, rawContent,
                     parsedCount, status (PENDING/PROCESSING/COMPLETED/FAILED)
Pattern           -- id, workspaceId, title, description?, patternType
                     (RECURRING/ESCALATING/CROSS_PERSON/CROSS_TEAM),
                     source (MANUAL/AI_DETECTED), status (EMERGING/CONFIRMED/ADDRESSED/DISMISSED),
                     firstSeenAt, lastSeenAt, occurrenceCount, timestamps
PatternChallenge  -- id, patternId, challengeId (unique: pattern+challenge)
```

### Funktioner
- **Taggning:** chip-baserad snabbtaggning på challenges (skapa tags inline)
- **Historisk import:** klistra in gammal data (supportloggar, e-posttrådar) som bulk-text, systemet skapar challenges med `sourceType=HISTORICAL`
- **Enkel mönsterdetektering (utan AI):** gruppera challenges per tag, räkna förekomster per session och person, flagga tags som dyker upp i 3+ möten eller från 3+ personer
- **Mönstervy:** workspace-nivå, lista över identifierade mönster med koppling till underliggande challenges
- **Manuell mönsterkoppling:** markera challenges och gruppera till ett mönster
- **Staleness-signaler:** personkort tonas visuellt baserat på `lastActiveAt`

### Vad fas 2 ger användaren
Facilitatorn öppnar appen innan nästa möte och ser: "Förra mötet lyfte 4 personer fakturaproblem. Anna har nämnt det 3 gånger i rad." Det gör nästa möte progressivt istället för repetitivt.

---

## Fas 3 -- AI-analys

**Mål:** AI hittar mönster som människor missar.

### Funktioner
- **Normalisering:** AI rensar och standardiserar `contentRaw` -> `contentNormalized`
- **Semantisk likhet:** embeddings-baserad clustering av challenges (samma problem, olika ord)
- **Auto-taggning:** AI föreslår tags för otaggade challenges
- **Mönsterdetektion:** AI föreslår nya mönster baserat på semantiska kluster
- **Förslag:** AI genererar actionable suggestions per mönster

### Datamodell -- nya tabeller
```
Suggestion        -- id, patternId, content, source (MANUAL/AI_GENERATED),
                     status (PENDING/ACCEPTED/DISMISSED)
```

### Arkitektur
- AI körs som background jobs, inte i request path
- Triggas efter möte avslutas eller manuellt
- Resultat lagras i DB och visas vid nästa sidladdning
- Anthropic Claude API eller OpenAI som backend

### Vad fas 3 ger användaren
"3 personer beskrev samma flaskhals från olika håll med olika ord. AI:n identifierade det som ett systemproblem." Det är aha-momentet.

---

## Fas 4 -- CRM-integration

**Mål:** Koppla ihop subjektiv mötesupplevelse med objektiv ärendedata.

### Datamodell -- nya tabeller
```
CrmConnection     -- id, workspaceId, provider (FRESHDESK/ZENDESK/HUBSPOT),
                     displayName, apiKeyEncrypted, baseUrl?, lastSyncAt?,
                     syncStatus (IDLE/SYNCING/ERROR), isActive
CrmSnapshot       -- id, connectionId, snapshotDate, category, ticketCount,
                     avgResolutionHours?, metadata (JSON)
PatternCrmEvidence -- id, patternId, snapshotId, narrative
```

### Funktioner
- Settings-sida: välj CRM-provider, ange API-nyckel, test-sync
- Daglig sync via Vercel Cron: hämta ärendetal per kategori
- Mönster-vyn berikas: "Teamet nämnde fakturaproblem 12 gånger. Freshdesk visar 347 ärenden denna månad, upp 40% från Q3."
- Trendjämförelse: denna månad vs förra

### Vad fas 4 ger användaren
Teamet säger "vi får jättemånga samtal om fakturor." Systemet svarar med hård data. Gapet mellan upplevelse och verklighet blir synligt. DET är det som säljer.

---

## Fas 5 -- Polish och säljbarhet

- Riktig auth (NextAuth.js)
- Workspace-roller (Owner, Facilitator, Viewer)
- Onboarding-flöde
- Export (PDF/markdown-sammanfattning för ledningspresentationer)
- Möteshistorik-tidslinje
- Tangentbordsgenvägar för power users
- Drag-and-drop (personkort, teamcontainrar)
- Filuppladdning
- Prestanda (paginering, lazy loading)

---

## Prissättning

Per workspace, inte per användare (facilitatorn är ofta en person):
- **Free:** 1 workspace, 1 team, 5 personer, obegränsade möten. Ingen AI, ingen CRM.
- **Team ($29/mån):** Obegränsat. Tags, mönster, historisk import.
- **Pro ($79/mån):** AI-analys och mönsterdetektion.
- **Enterprise ($199/mån):** CRM-integration, export, prioriterad support.

---

## Demo-ögonblick som säljer

1. **90-sekunds capture:** Starta möte, fånga 5 challenges på under 90 sekunder. Snabbare än anteckningsblock -- och redan strukturerat.
2. **Mönsteravslöjandet:** Visa workspace med 4 mötens data. "Tre personer nämnde samma problem utan att veta om varandra."
3. **CRM-bryggan:** Mönster säger "billing complaints x12". CRM visar "347 ärenden, +40%". Upplevelse möter data.
4. **Staleness-signalen:** Personkort tonar -- "Denna person lyfte 3 kritiska problem i oktober och har inte hörts av sedan dess."

---

## Varför det slår alternativen

- **vs Spreadsheets:** Kopplar inte input till personer, möten eller mönster
- **vs Notion:** Lagrar text men analyserar inte. Man kan klistra mötesanteckningar i Notion i åratal utan att se mönster
- **vs Survey-verktyg:** Anonymt, abstrakt, periodiskt. Inte konkreta problem i kontext av faktiskt arbete
- **vs CRM-dashboards:** Visar vad som hände i systemet, inte vad teamet säger om det

---

## Kritiska filer att modifiera

- `prisma/schema.prisma` -- alla nya modeller
- `components/workspace/workspace-shell.tsx` -- bryts upp i mindre komponenter
- `app/workspace/page.tsx` -- routing mellan canvas och mötesvy
- `lib/auth.ts` -- ersätts med riktig auth (fas 5, men demo-auth räcker för fas 1-4)
- `app/api/` -- nya routes för meetings, challenges, patterns, CRM

## Verifiering

Per fas:
- **Fas 1:** Starta möte -> fånga 5 challenges -> avsluta möte -> se challenges i sidopanel. Mät tid: ska ta <2 min.
- **Fas 2:** Tagga challenges -> se automatisk mönsterdetektering -> verifiera staleness på kort.
- **Fas 3:** Kör AI-jobb -> verifiera att mönster skapas korrekt -> kontrollera suggestions.
- **Fas 4:** Koppla test-CRM -> verifiera sync -> se CRM-data i mönstervy.

---

## Tidigare Modul 1-spec (referens)

Den ursprungliga specen för Modul 1 finns bevarad nedan som referens. Datamodellen, canvas-reglerna och designriktningen gäller fortfarande -- men produktvisionen ovan ersätter den gamla avgränsningen.

### Datamodell (redan implementerad)

#### Account
- `id`, `email`, `name`, `created_at`

#### Workspace
- `id`, `name`, `owner_id -> Account`, `created_at`, `updated_at`

#### Team
- `id`, `workspace_id -> Workspace`, `name`, `color`, `canvas_x`, `canvas_y`, `sort_order`, `created_at`, `updated_at`

#### Person
- `id`, `workspace_id -> Workspace`, `name`, `role_title`, `summary_text`, `created_by -> Account`, `account_id -> Account nullable`, `created_at`, `updated_at`

#### TeamMembership
- `id`, `team_id -> Team`, `person_id -> Person`, `position_x`, `position_y`, `sort_order`, `created_at`

#### Note
- `id`, `person_id -> Person`, `author_account_id -> Account`, `content_raw`, `created_at`

#### Attachment
- `id`, `person_id -> Person`, `file_name`, `file_url`, `file_size`, `mime_type`, `uploaded_by -> Account`, `created_at`

#### AttachmentComment
- `id`, `attachment_id -> Attachment`, `author_account_id -> Account`, `content_raw`, `created_at`

### Canvas-regler

#### Vad användaren får göra
- skapa flera team
- flytta teamcontainrar på canvas
- skapa personer i team
- flytta personkort inom team
- flytta personkort mellan team
- klicka på kort för att öppna sidopanel

#### Vad användaren inte får göra
- skapa fria linjer eller relationer
- rita på canvas
- skapa godtyckliga objekt
- lägga objekt utanför teamlogik
- bygga subnoder eller mindmap-strukturer
- skapa oändlig fri layout utan regler

#### Hur frihet vs struktur ska lösas
- canvasen känns fri genom att teamcontainrar kan placeras visuellt
- personkort lever inom teamcontainrar
- teamcontainrar är de primära visuella byggblocken
- personkort använder grid eller soft layout inom containern
- användaren får omorganisera, men alltid inom definierad modell

### Designriktning

#### Mörkgrön premium
- djup mörkgrön canvas
- varma ljusa ytor i sidopanel och kort
- koppar- eller guldaccent sparsamt
- tydlig kontrast
- lugn, inte aggressiv

#### UX-principer
- överblick först
- detalj på begäran
- få starka komponenter
- tydlig hierarki
- autosave
- låg kognitiv belastning
- canvasen ska kännas levande men kontrollerad

#### Känsla
- modern, varm, exklusiv, professionell, lugn, trygg
- inte tech-demo

#### Vad som ska undvikas
- blå generisk SaaS-look
- dashboards med kort överallt
- KPI-liknande badges utan verklig betydelse
- för mycket text på korten
- för mycket motion
- hård org chart-estetik
- Miro-kopia
- glassmorphism överallt
- AI-first-signaler i UI

### Hårda produktbeslut (gäller fortfarande)
- `Person` och `Account` hålls separata -- inte förhandlingsbart
- Anteckningar och filkommentarer är riktiga tabeller, inte blob-fält
- Semi-fri canvas, inte fri whiteboard
- Modul 1 ska vara meningsfull utan AI
- Filhantering: upload + metadata + kommentar, inget mer
- Detalj i panel, inte på kort
- Canvaskortet ska vara lättskannat
