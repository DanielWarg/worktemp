# Modul 1 — Teamstruktur & Visuell Arbetsyta

## A. Tolkning av Modul 1

Modul 1 är **grundplattan** för en SaaS-produkt riktad mot chefer och teamledare som vill skapa tydlig struktur i sina team. Kärnan är en visuell canvas där användaren bygger sin teamorganisation genom att skapa team, lägga till personer och organisera dem rumsligt. Varje person har ett klickbart kort som öppnar en detaljpanel med strukturerad information, fritext och filuppladdning.

**Produktens identitet:** Inte ett mätverktyg, inte HR-tech i traditionell mening. Det är ett *strukturverktyg* — ett sätt att se, organisera och dokumentera sitt team. Värdet i Modul 1 är överblick, tydlighet och ett levande dokument över teamet.

**Min tolkning av scope:**
- Login → Workspace-väljare (om flera team) → Canvas med team och personkort
- Personkort → Detaljpanel (sidopanel, inte ny sida) med info, anteckningar, filer
- Canvasen är fri visuellt men datamodellen är strikt hierarkisk
- AI-hooks förbereds i datamodellen men exponeras inte

---

## B. Kritik och Risker

### Reella risker jag ser:

**1. Canvas-komplexitet vs. värde**
En fri canvas (à la Miro/FigJam) är tekniskt komplex. Frågan är: behöver användaren verkligen fri positionering, eller räcker det med en smart layoutad vy som *känns* fri? Min rekommendation: **semi-strukturerad canvas** — användaren kan dra och ordna kort inom definierade zoner (team-containrar), men inte helt fritt på en oändlig yta. Detta ger 80% av känslan med 20% av komplexiteten.

**2. "Filuppladdning med kommentarer" är scope creep-risk**
Filuppladdning låter enkelt men kräver: lagring (S3/liknande), filtypsvalidering, preview, versionshantering, GDPR-hantering av persondata i filer. **Rekommendation:** I Modul 1, bygg UI-ytan för filer men begränsa till enkel uppladdning + en kommentar per fil. Ingen preview, ingen versionshantering.

**3. Otydlig avgränsning mellan "person" och "användare"**
Är personerna på korten *användare av systemet* eller bara *poster som chefen skapar*? Detta påverkar datamodellen fundamentalt. **Antagande:** I Modul 1 är personkort *poster skapade av chefen*. De är inte inloggade användare. De har ingen koppling till auth. Detta förenklar enormt och är rätt för denna fas.

**4. Multi-team: vad innebär det exakt?**
Kan en person tillhöra flera team? Kan ett team ha sub-team? **Antagande:** En person kan tillhöra flera team (many-to-many). Inga sub-team i Modul 1 — det öppnar för trädstrukturer som komplicerar canvas-UX. Hierarkin är: Workspace → Team → Person.

**5. Risk för "tom upplevelse"**
Om Modul 1 bara är struktur utan analys, kan den kännas tunn. **Motgift:** Gör upplevelsen av att bygga teamet riktigt bra. Onboarding-flow, tydliga tomma tillstånd, snabb feedback, visuell tillfredsställelse. Produkten måste kännas värdefull *redan vid första sessionen*.

**6. GDPR / persondata**
Personkort med namn, roll, anteckningar och filer = personuppgiftsbehandling. Behöver tänkas in i datamodellen från dag 1 (radering, export, rättslig grund).

---

## C. Produktdefinition för Modul 1

### Produktnamn (arbetsnamn behövs)
Antagande: Produkten har inget namn ännu. Jag refererar till den som **"produkten"**.

### Kärnlöfte
> "Se ditt team. Förstå din struktur. Bygg grunden."

### Målgrupp Modul 1
- Chefer med 5–30 direkta/indirekta medarbetare
- Teamledare som ansvarar för 1–3 team
- Ingen IT-kompetens krävs

### Kärnfunktioner Modul 1 (MoSCoW)

**Must have:**
- Autentisering (login/registrering)
- Workspace med canvas-vy
- Skapa, namnge och ta bort team
- Skapa, redigera och ta bort personkort inom team
- Dra och organisera personkort inom team-containrar
- Klickbar detaljpanel (sidopanel) per person: namn, roll, fritext/anteckningar
- Stöd för flera team i samma workspace
- Responsiv nog för laptop/desktop (inte mobil i Modul 1)

**Should have:**
- Filuppladdning på personkort (enkel, max 5 filer, med en kommentar per fil)
- Flytta person mellan team (drag eller meny)
- Tomma tillstånd med onboarding-guidning
- Workspace-inställningar (namn, grundinfo)

**Could have (förberedda ytor, ej funktionella):**
- Taggar/etiketter på personkort (UI-yta finns, funktion begränsad)
- Statusindikator på personkort (visuell plats reserverad)
- Anteckningshistorik (senaste anteckningen visas, historik sparas men ingen UI för historik ännu)

**Won't have (explicit exkluderat):**
- AI-analys, kategorisering eller insikter
- Dashboard med KPIer eller grafer
- Pulsmätning eller enkäter
- Användarinbjudningar (personer på kort ≠ användare)
- Mobilapp eller mobilanpassning
- Avancerad dokumenthantering
- Integrationer med andra system
- Delning eller samarbete i realtid

---

## D. Användarflöde Steg för Steg

```
1. LANDING / MARKETING PAGE
   └── CTA: "Kom igång" → Registrering

2. REGISTRERING
   └── Email + lösenord (eller OAuth)
   └── Steg 2: "Vad heter du?" + "Vilken roll har du?"
   └── → Skapar automatiskt första workspace + placerar användaren som "ledare"

3. FÖRSTA INLOGGNING — ONBOARDING
   └── Tom canvas med välkomstmeddelande
   └── Guide: "Skapa ditt första team"
   └── Användaren namnger sitt team → Team-container dyker upp på canvas
   └── Guide: "Lägg till din första teammedlem"
   └── Användaren skapar ett personkort → Kort dyker upp i teamet
   └── Guide: "Klicka på kortet för att lägga till mer info"
   └── Detaljpanelen öppnas → Användaren ser fält för roll, anteckningar
   └── Onboarding klar → Full canvas tillgänglig

4. ÅTERKOMMANDE INLOGGNING
   └── Login → Direkt till canvas (senaste workspace)
   └── Om flera workspaces: workspace-väljare först

5. DAGLIG ANVÄNDNING
   └── Canvas: överblick, organisera, dra kort
   └── Klick på kort: detaljpanel öppnas (slide-in från höger)
   └── Detaljpanel: redigera info, lägg till anteckning, ladda upp fil
   └── Stäng panel: tillbaka till canvas
   └── Skapa nytt team: knapp på canvas
   └── Flytta person: dra mellan team-containrar
```

---

## E. Informationsarkitektur

### Hierarki
```
Account (autentiserad användare)
  └── Workspace (1:N — en användare kan ha flera workspaces)
        ├── Metadata: namn, skapad datum
        └── Team (1:N — en workspace har flera team)
              ├── Metadata: namn, färg/ikon, skapad datum, position på canvas
              └── TeamMembership (N:M — kopplingstabell)
                    └── Person (personkort)
                          ├── Grundinfo: namn, roll/funktion, avatar/initialer
                          ├── Anteckningar (1:N — lista av anteckningar med tidsstämpel)
                          ├── Filer (1:N — uppladdade filer med kommentar)
                          ├── Taggar (framtida, M:N)
                          ├── Canvas-position inom team (x, y offset)
                          └── Metadata: skapad, uppdaterad, skapad_av
```

### Navigationsstruktur
```
Topbar (global)
  ├── Logo/produktnamn
  ├── Workspace-namn (klickbart → byt workspace)
  ├── [framtida: notifikationer]
  └── Profilmeny (inställningar, logga ut)

Main area
  └── Canvas (tar hela ytan under topbar)
        ├── Team-containrar (visuella grupper)
        │     └── Personkort (drag-bara inom och mellan team)
        ├── "Lägg till team"-kontroll
        └── Canvas-kontroller (zoom, centrera — minimalt)

Sidopanel (slide-in, höger)
  └── Persondetalj
        ├── Header: namn, roll, avatar
        ├── Sektion: Grundinfo (redigerbar)
        ├── Sektion: Anteckningar (lista + lägg till ny)
        ├── Sektion: Filer (lista + ladda upp)
        └── Footer: metadata, ta bort person
```

---

## F. Objekt och Relationer

### Datamodell (konceptuell)

```
Account
  id: UUID
  email: string
  name: string
  role_title: string (användarens egen roll)
  created_at: timestamp

Workspace
  id: UUID
  name: string
  owner_id: FK → Account
  created_at: timestamp
  updated_at: timestamp

Team
  id: UUID
  workspace_id: FK → Workspace
  name: string
  color: string (hex, för visuell identifikation)
  canvas_x: float (teamets position på canvas)
  canvas_y: float
  canvas_width: float (kan expanderas)
  canvas_height: float
  sort_order: int
  created_at: timestamp
  updated_at: timestamp

Person
  id: UUID
  workspace_id: FK → Workspace (person tillhör workspace, inte direkt team)
  name: string
  role_title: string (nullable)
  avatar_url: string (nullable, framtida)
  created_at: timestamp
  updated_at: timestamp
  created_by: FK → Account

TeamMembership
  id: UUID
  team_id: FK → Team
  person_id: FK → Person
  position_x: float (inom teamet)
  position_y: float
  sort_order: int
  joined_at: timestamp

Note
  id: UUID
  person_id: FK → Person
  content: text
  created_at: timestamp
  created_by: FK → Account

Attachment
  id: UUID
  person_id: FK → Person
  file_name: string
  file_url: string
  file_size: int
  file_type: string (mime)
  comment: text (nullable)
  created_at: timestamp
  created_by: FK → Account
```

### Framtida kopplingspunkter (byggs INTE, men designas för):

| Framtida modul | Kopplingspunkt i Modul 1 |
|---|---|
| AI-analys | `Note.content` och `Attachment` blir input. Person-id som nyckel. |
| Taggar/kategorier | `Tag`-tabell + `PersonTag`-koppling (M:N). UI-plats reserverad på kortet. |
| Statusar/indikatorer | `PersonStatus`-fält (enum). Visuell plats på kortet. |
| Tidslinje/historik | Alla entiteter har `created_at`. Notes har tidsstämplar. Event-log kan läggas till. |
| Teammedlem som användare | `Person.account_id` (nullable FK) — kopplar personkort till inloggad användare i framtiden. |
| Delning/samarbete | `WorkspaceMember`-tabell (roller, permissions). |
| Sub-team/hierarki | `Team.parent_team_id` (nullable self-reference). |

---

## G. UX-beskrivning

### Canvas

**Typ:** Semi-strukturerad canvas (inte fri oändlig yta)
- Canvasen har en definierad arbetsyta som scrollar vertikalt och horisontellt vid behov
- Team visas som **containrar** (avrundade rektanglar med mjuk bakgrund) som auto-layoutas i ett grid men kan dras till nya positioner
- Inom varje team-container layoutas personkort i ett responsivt grid (2–4 kolumner beroende på containerns bredd)
- Personkort kan dras och släppas för att byta ordning inom teamet eller flyttas till annat team
- **Zoom:** Enkel zoom (scroll + Ctrl/Cmd) med snap till 75%, 100%, 125%
- **Bakgrund:** Subtil dot-grid (mörkgrön ton) som ger djupkänsla

**Varför semi-strukturerad istället för fri:**
- Fri canvas kräver kollisionshantering, oändlig yta, minimap — stor teknisk kostnad
- Chefer vill ha *ordning*, inte kreativ frihet. Semi-struktur matchar use caset.
- Enklare att rendera, bättre prestanda, lättare att göra responsiv

### Team-container
- Rektangulär yta med rundade hörn
- Header: teamnamn (inline-redigerbar) + färgindikator + "..." meny
- Kropp: grid av personkort
- Footer: "+ Lägg till person"-knapp
- Kan expanderas/kollapsa (chevron i header)
- Subtil skuggning och bakgrundsfärg som skiljer från canvas

### Personkort (card)
- Storlek: ca 180×100px (kompakt men läsbart)
- Innehåll: Initialer/avatar-cirkel + namn + roll (en rad, trunkerad)
- Hover: subtil lift-effekt (box-shadow ökar)
- Klick: öppnar detaljpanelen
- Drag: visuell feedback (opacity, skugga, "lyfts" ur gridet)
- Framtida: liten ikon-rad längst ner för taggar/status (tomt nu, plats reserverad)

### Detaljpanel (sidopanel)
- **Slide-in från höger**, 400–480px bred
- **Overlay:** Canvasen dimmas subtilt bakom (inte helt blockerad)
- **Header:** Stor avatar/initialer + namn (redigerbart) + roll (redigerbart) + stäng-knapp
- **Sektioner (accordion-stil):**
  1. **Grundinfo** — Roll, funktion, fritext "om personen"
  2. **Anteckningar** — Kronologisk lista (senaste först) + "Ny anteckning"-textfält
  3. **Filer** — Lista med filnamn, storlek, datum, kommentar + "Ladda upp"-knapp
- **Footer:** "Skapad [datum]" + "Ta bort person" (röd, med bekräftelse)
- **Beteende:** Escape eller klick utanför stänger. Ändringar sparas automatiskt (autosave med debounce).

### Tomma tillstånd
- **Tom canvas:** Illustration + "Skapa ditt första team" CTA. Varm, inbjudande.
- **Tomt team:** "Lägg till teammedlemmar" med ikon. Inte bara en tom ruta.
- **Tom detaljpanel-sektion:** Hjälptext i ljusgrått, t.ex. "Inga anteckningar ännu"

---

## H. Visuell Designriktning — Mörkgrönt Premium

### Färgpalett

```
PRIMARY (Mörkgrön skala):
  --green-950: #0A1F1A    ← Djupaste (bakgrunder, sidopanel header)
  --green-900: #0F2E25    ← Canvas-bakgrund
  --green-800: #1A4035    ← Team-container bakgrund
  --green-700: #245A4A    ← Hover-states, aktiva element
  --green-600: #2E7A64    ← Primary actions, knappar
  --green-500: #3D9B7E    ← Accenter, ikoner
  --green-400: #5BBFA0    ← Ljusare accenter, badges

NEUTRAL (Varm grå, inte kall):
  --neutral-950: #111110   ← Text primary (på ljus bakgrund)
  --neutral-800: #2C2B28   ← Text secondary
  --neutral-600: #5C5A54   ← Placeholder text
  --neutral-400: #9C9A94   ← Disabled states
  --neutral-200: #D4D2CC   ← Borders
  --neutral-100: #EDECEA   ← Ljus bakgrund (detaljpanel kropp)
  --neutral-50:  #F7F6F4   ← Ljusaste bakgrund

SURFACE (Kort och containrar):
  --surface-card: #FAFAF8       ← Personkort bakgrund
  --surface-card-hover: #F2F1EE ← Personkort hover
  --surface-panel: #F7F6F4      ← Sidopanel bakgrund
  --surface-elevated: #FFFFFF   ← Modaler, dropdowns

ACCENT:
  --accent-warm: #C4956A    ← Varm guld/koppar för premium-accenter
  --accent-error: #C4453A   ← Röd för destruktiva actions
  --accent-success: #3D9B7E ← Grön (samma som green-500)

CANVAS:
  --canvas-bg: #0F2E25         ← Canvas bakgrund
  --canvas-dot: rgba(255,255,255,0.06) ← Dot-grid
  --canvas-team-bg: rgba(255,255,255,0.07) ← Team-container
```

### Typografi
- **Font:** Inter (eller liknande geometric sans) för UI
- **Headings:** Semi-bold, tight letter-spacing
- **Body:** Regular, 14–15px, bra radavstånd
- **Personnamn på kort:** Medium, 14px
- **Roll på kort:** Regular, 12px, neutral-600

### Designprinciper konkretiserat

| Princip | Konkret implementation |
|---|---|
| Premium, inte flashigt | Djupa gröna toner, subtila gradienter, inga neonfärger |
| Lugn, inte steril | Varma neutrala toner (beige-aktiga grå, inte blågrå) |
| Kontrast | Ljusa kort mot mörk canvas — korten "lyser" |
| Mänskligt | Runda avatarer, mjuka hörn (12–16px radius), generösa marginaler |
| Struktur | Tydlig visuell hierarki, alignment, konsistenta avstånd (8px grid) |

### Visuella signaturer
- **Korten mot canvasen:** Ljusa kort mot mörk grön = primär visuell effekt. Det ska se ut som ljusa kort lagda på ett mörkgrönt bord.
- **Guld/koppar-accent:** Används sparsamt för premium-känsla (t.ex. workspace-namn, dropdown-pilar, aktiv sektions-linje).
- **Inga hårda kanter:** Allt har border-radius. Skuggor är mjuka och varma (inte blå-svarta).
- **Animationer:** Subtila, 200–300ms, ease-out. Kort lyfts vid hover. Panel glider in. Inga studsar eller överdriven motion.

---

## I. Komponentstruktur (Frontend)

### Tech-stack (fastslaget)
- **Framework:** Next.js 14+ (App Router) — deploy till Vercel
- **State:** Zustand (lätt, enkel, bra för canvas-state)
- **Drag & drop:** @dnd-kit (modernt, tillgängligt, flexibelt)
- **Styling:** Tailwind CSS + CSS-variabler för temat
- **Animationer:** Framer Motion (sidopanel, kort-animationer)
- **Filuppladdning:** Presigned URLs till S3-kompatibel lagring
- **Auth:** NextAuth.js
- **Databas:** Neon (serverless PostgreSQL) via Prisma ORM
- **Deploy:** Vercel (webbapp)

### Komponentträd

```
App
├── AuthProvider
├── Layout
│   ├── TopBar
│   │   ├── Logo
│   │   ├── WorkspaceSelector (dropdown)
│   │   ├── [framtida: NotificationBell]
│   │   └── ProfileMenu (dropdown)
│   │
│   └── MainContent
│       ├── CanvasView
│       │   ├── CanvasToolbar (zoom, centrera, "lägg till team")
│       │   ├── CanvasArea (scrollbar, dot-grid bakgrund)
│       │   │   ├── TeamContainer (en per team)
│       │   │   │   ├── TeamHeader (namn, färg, meny, collapse)
│       │   │   │   ├── PersonCardGrid
│       │   │   │   │   └── PersonCard (draggable)
│       │   │   │   │       ├── Avatar (initialer / bild)
│       │   │   │   │       ├── PersonName
│       │   │   │   │       ├── PersonRole
│       │   │   │   │       └── [framtida: TagBar]
│       │   │   │   └── AddPersonButton
│       │   │   └── AddTeamButton (på canvas-nivå)
│       │   └── CanvasOverlay (dim vid öppen panel)
│       │
│       └── DetailPanel (slide-in, conditional render)
│           ├── PanelHeader (avatar, namn, roll, stäng)
│           ├── SectionBasicInfo (redigerbar form)
│           ├── SectionNotes
│           │   ├── NoteList
│           │   │   └── NoteItem (innehåll, datum)
│           │   └── NoteInput (ny anteckning)
│           ├── SectionFiles
│           │   ├── FileList
│           │   │   └── FileItem (namn, storlek, kommentar)
│           │   └── FileUploadButton
│           └── PanelFooter (metadata, ta bort)
│
├── OnboardingOverlay (visas första gången)
│   ├── WelcomeStep
│   ├── CreateTeamStep
│   └── AddPersonStep
│
└── SharedComponents
    ├── Button (primary, secondary, ghost, danger)
    ├── Input (text, textarea)
    ├── Dropdown
    ├── Modal (bekräftelsedialoger)
    ├── Avatar
    ├── Badge
    ├── Tooltip
    └── EmptyState (illustration + CTA)
```

---

## J. Byggplan — Fasindelning

### Fas 1: Grundläggande infrastruktur
- [ ] Projektsetup: Next.js, Tailwind, Prisma, Neon PostgreSQL
- [ ] Databasschema (alla tabeller från sektion F)
- [ ] Auth-flöde: registrering, login, session (NextAuth.js)
- [ ] Global layout: TopBar + MainContent-area
- [ ] Design tokens: färger, typografi, spacing som CSS-variabler
- [ ] Grundläggande API-routes: CRUD för Workspace, Team, Person
- [ ] Vercel deploy-pipeline

### Fas 2: Canvas och team
- [ ] CanvasArea-komponent med dot-grid bakgrund
- [ ] TeamContainer-komponent (skapa, namnge, visa)
- [ ] PersonCard-komponent (skapa, visa namn + roll)
- [ ] Grid-layout av kort inom team
- [ ] "Lägg till team" och "Lägg till person" flöden
- [ ] Inline-redigering av teamnamn

### Fas 3: Drag & drop + interaktion
- [ ] @dnd-kit integration
- [ ] Drag personkort inom team (omorganisera)
- [ ] Drag personkort mellan team (flytta)
- [ ] Drag team-containrar (omorganisera på canvas)
- [ ] Visuell feedback vid drag (lift, skugga, drop-zoner)

### Fas 4: Detaljpanel
- [ ] Sidopanel slide-in animation (Framer Motion)
- [ ] PersonHeader med redigerbar info
- [ ] SectionBasicInfo med autosave
- [ ] SectionNotes med lista + input
- [ ] SectionFiles med uppladdning + kommentar (S3 presigned URLs)
- [ ] Canvas-dim overlay vid öppen panel

### Fas 5: Polering och onboarding
- [ ] Onboarding-flow för nya användare
- [ ] Tomma tillstånd (alla nivåer)
- [ ] Bekräftelsedialoger (ta bort person, ta bort team)
- [ ] Workspace-väljare i TopBar
- [ ] Responsivitet laptop/desktop
- [ ] Loading states, error states
- [ ] Keyboard shortcuts (Escape stänger panel, etc.)

### Fas 6: Test och stabilisering
- [ ] E2E-tester (Playwright): login → skapa team → lägg till person → öppna detalj
- [ ] API-tester
- [ ] Prestanda: canvas med 5 team, 50 kort
- [ ] Tillgänglighet: grundläggande a11y (fokus, kontrast, ARIA)
- [ ] GDPR: radera person tar bort all relaterad data

---

## K. Gränsdragning

### Ingår i Modul 1
| Funktion | Status |
|---|---|
| Auth (login/registrering) | Full implementation |
| Workspace (skapa, namnge) | Full implementation |
| Team (CRUD, canvas-position) | Full implementation |
| Person (CRUD, position i team) | Full implementation |
| Personkort (namn, roll, avatar-initialer) | Full implementation |
| Detaljpanel (grundinfo, anteckningar) | Full implementation |
| Filuppladdning (enkel, med kommentar) | Full implementation |
| Drag & drop (kort inom/mellan team) | Full implementation |
| Multi-team stöd | Full implementation |
| Onboarding | Full implementation |
| Tomma tillstånd | Full implementation |

### Explicit EXKLUDERAT från Modul 1
| Funktion | Varför exkluderat |
|---|---|
| AI-analys/insikter | Modul 2+ |
| Dashboard/KPIer | Modul 2+ |
| Taggar/kategorier (fungerande) | UI-plats reserveras, funktion i Modul 2 |
| Statusar på personkort | UI-plats reserveras |
| Inbjudan av teammedlemmar som användare | Kräver behörighetssystem, Modul 2+ |
| Realtidssamarbete | Kräver websockets, Modul 3+ |
| Mobilanpassning | Modul 2+ |
| Integrationer (Slack, Calendar, etc.) | Modul 3+ |
| Avancerad filhantering (preview, versioner) | Modul 2+ |
| Sök | Modul 2 (bra att ha men inte MVP) |
| Exportera/importera data | Modul 2+ |
| Sub-team/hierarkier | Framtida, datamodellen stödjer det |

---

## L. Rekommendationer för att Undvika Feltänk

### 1. Bygg inte en fri canvas — bygg en smart layout
Fri canvas (Miro-stil) är en teknisk fälla. Semi-strukturerad layout med drag-stöd ger samma upplevda frihet med bråkdelen av komplexiteten. Team-containrar som auto-layoutas i ett grid men kan omordnas ger rätt känsla.

### 2. Person ≠ Användare — håll isär koncepten
Absolut kritiskt. Person-entiteten ska INTE kopplas till auth i Modul 1. Förbered med `account_id: nullable` på Person-tabellen, men använd det inte. Att blanda ihop dessa tidigt skapar en röra som är svår att reda ut.

### 3. Autosave, inte spara-knappar
Modern UX-förväntan. Alla ändringar i detaljpanelen sparas automatiskt med debounce (300ms). Visa en subtil "Sparad"-indikator. Ingen explicit spara-knapp.

### 4. Undvik att bygga ett designsystem — bygg komponenter
Bygg inte ett generellt designsystem i Modul 1. Bygg specifika komponenter som behövs. Extrahera gemensamma mönster *efter* att de upprepats 3+ gånger.

### 5. Canvas-state i frontend, inte i URL
Canvasens zoom-nivå, scroll-position etc. är ephemeral state — lagra i Zustand, inte i URL eller databas. Team- och personpositioner *ska* lagras i databasen.

### 6. Filuppladdning: presigned URLs
Ladda INTE upp filer genom din API-server. Generera presigned S3-URLs och låt klienten ladda upp direkt. Lagra bara metadata i databasen. Sparar bandbredd, snabbare, mer skalbart.

### 7. Testa med realistiska volymer tidigt
En chef med 3 team à 8–12 personer = 24–36 kort. Canvas måste fungera bra med detta. Testa inte bara med 2 kort.

### 8. Onboarding är inte valfritt
Ett tomt verktyg utan onboarding är ett dött verktyg. Onboarding-flödet ska vara lika prioriterat som kärnfunktionerna.

### 9. Design mörkgrönt rätt
Mörkgrönt kan lätt bli murrigt eller se "militärt" ut. Nyckeln: **kontrast**. Ljusa, varma kort mot djupgrön canvas. Koppar/guld-accenter bryter det gröna. Undvik att allt blir grönt — neutrala ytor (sidopanel, modaler) ska vara varma ljusa toner.

### 10. Planera för GDPR från dag 1
Varje Person-entitet ska kunna raderas fullständigt (cascade delete på notes, filer, memberships). Implementera soft-delete med automatisk hard-delete efter 30 dagar, eller hard-delete direkt.
