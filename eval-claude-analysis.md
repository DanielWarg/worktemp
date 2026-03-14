# Claude Opus analys av 265 HPTS-ärenden (2026-03-14)

Samma data och regler som Ministral 14B eval. 265 supportärenden från "Skapade ärenden förra månaden".

## Sammanfattning

| Metrisk | Värde |
|---------|-------|
| Mönster | 21 |
| Täckning | ~175/265 (66%) |
| Dubbletter | 0 |
| Precision | Hög (ingen catch-all) |

## Jämförelse med Ministral

| | Gamla Ministral | Nya Ministral (tunad) | Claude |
|--|----------------|----------------------|--------|
| Mönster | 19 | 46 | 21 |
| Täckning | 62% | 73% | 66% |
| Precision | Låg (mega-mönster) | Hög | Hög |
| Granularitet | För grov | Ibland för fin | Balanserad |
| Dubblettrapportering identifierad | Nej | Nej | Ja |

### Claudes styrkor vs Ministral
- Identifierar dubblettrapportering (samma fel rapporterat flera gånger) vs faktiska mönster
- Regionspecifik gruppering (Movia-infra, Skånetrafikens SQL, SL:s stoppställen)
- Filtrerar bort administrativa ärenden (mötesinbjudningar, rescheduling)

### Ministrals styrkor vs Claude
- Högre täckning (73% vs 66%) — hittar fler lösa kopplingar
- Mer granulär (46 vs 21) — kan fånga nischade mönster

---

## RECURRING — Återkommande problem

### 1. TIMS platsspecifika störningar hos SL (10 ärenden)
**Ärenden:** t9, t12, t18, t20, t27, t28, t31, t34, t35, t36, t38, t40
**Typ:** RECURRING

Systematisk upprepning av TIMS-störningar kopplade till specifika stoppställen (Sickla, T-Centralen, Gullmarsplan, TvB Magneten, Liljevalchs). Alla från SL, alla med REQSETR-referens. Indikerar antingen ett underliggande systemfel i TIMS stoppställehantering eller ett integrationsproblem med SL:s ärendehantering.

**Åtgärd:** Analysera gemensam nämnare för drabbade stoppställen — finns det en gemensam infrastrukturkomponent?

### 2. TIMS grundfunktioner och buggar (6 ärenden)
**Ärenden:** t22, t29, t39, t41, t26, t208
**Typ:** RECURRING

CTRL+A fungerar inte, ärenden kan inte avslutas, uppstartsproblem i acceptansmiljö, bug reports. Grundläggande UX-brister.

**Åtgärd:** Prioriterad buggfix-sprint för TIMS-klienten.

### 3. CAD/AVL-felanmälningar från Nobina via SL (4 ärenden)
**Ärenden:** t8, t11, t15, t33
**Typ:** RECURRING

Samma grundproblem (CAD/AVL) rapporterat via flera kanaler (REQSETR02552487, REQSETR02553605). Dubblettrapportering snarare än fyra separata problem.

**Åtgärd:** Deduplikera ärendeflödet mellan Nobina -> SL -> HPTS.

### 4. Diskutrymme kritiskt på SL-servrar (4 ärenden)
**Ärenden:** t17, t25, t30, t200
**Typ:** RECURRING

tfmsapt021, tfmsapa053, tfmsapp093 — alla SL:s servrar. Diskfull > 95% / > 97%.

**Åtgärd:** Automatiserat alertsystem + schemalagd loggrotation.

### 5. Saknad spårningshistorik i TransitCloud, Region Dalarna (5 ärenden)
**Ärenden:** t110, t111, t113, t115, t119
**Typ:** RECURRING

Fem separata dagar (4/2, 6/2, 10/2, 11/2, 15/2) där historik saknas. Systematiskt.

**Åtgärd:** Utred lagringsprocessen — troligen ett jobb som misslyckas nattvis.

### 6. OverridingWaypoints i TransitCloud (4 ärenden)
**Ärenden:** t102, t125, t139, t146
**Typ:** RECURRING

Två regioner (More og Romsdal, Gävleborg). Upprepad brist i waypoint-uppdatering.

**Åtgärd:** Dokumentera process och skapa valideringsregler.

### 7. MAC-adressbyte i TransitCloud/TCOBS (11 ärenden)
**Ärenden:** t90, t91, t92, t93, t127, t129, t135, t137, t141, t144, t145
**Typ:** RECURRING

Region Gävleborg (250 fordon) + Mohlins Bussar. Samma ärende "Byta MAC adress prio" om och om igen. Indikerar att processen är manuell och repetitiv.

**Åtgärd:** Automatisera MAC-adresshanteringen, eventuellt via self-service-portal.

### 8. SQLJob DbatoolsSyncLogins-fel (10 ärenden)
**Ärenden:** t116, t120, t157, t158, t166, t168, t177, t178, t229, t230
**Typ:** RECURRING

Samma SQLJob misslyckas i Dalarna, Kronoberg, Örebro, Västmanland, Kalmar, Svealandstrafiken — alla INST01-04. Systematiskt problem med sync.

**Åtgärd:** Fixa rotorsaken i DbatoolsSyncLogins-konfigurationen centralt.

### 9. E22/E42 infraändringar Keolis (14 ärenden)
**Ärenden:** t49, t51, t53, t54, t55, t56, t58, t59, t62, t63, t64, t70, t72, t74
**Typ:** RECURRING

Zon- och körlänksjusteringar, hållplatsflyttar, polygonuppdateringar. Alla Keolis, alla akuta.

**Åtgärd:** Standardiserad ändringsprocess med automatiserad validering.

### 10. Linje 340 saknas i InGrid (4 ärenden)
**Ärenden:** t255, t256, t258, t265
**Typ:** RECURRING

VR Sverige rapporterar exakt samma fel (SESD-20857) fyra gånger. Ren dubblettrapportering.

**Åtgärd:** Länka till ett ärende, lösa rotorsaken.

### 11. Skånetrafikens databas/SQLJob-fel (5 ärenden)
**Ärenden:** t188, t189, t193, t197, t201
**Typ:** RECURRING

DatabaseBackup, IndexOptimize, DatabaseIntegrityCheck — alla på HOGIA-CL2102/CL2141. Systematisk databasinstabilitet hos Skånetrafiken.

**Åtgärd:** Gemensam databasgranskning av Skånetrafikens SQL-instanser.

### 12. Movia replikerings-/databasfel (8 ärenden)
**Ärenden:** t238, t239, t241, t242, t243, t244, t246, t247
**Typ:** RECURRING

Replikeringsköer, filstorlekar, RDA_TIMS-uppdateringar, disk för transaktionslog. Alla Movia, alla databasrelaterade.

**Åtgärd:** Dedikerad Movia-infrastrukturöversyn.

### 13. Rakel-kommunikationsfel (4 ärenden)
**Ärenden:** t114, t217, t67, t118
**Typ:** RECURRING

RakelResponse Error i CloudServices + Rakel-köer. Region Dalarna och Västmanland.

**Åtgärd:** Analys av Rakel-integrationen i CloudServices.

### 14. TIMS-dataproblem i Gävleborg och Movia (5 ärenden)
**Ärenden:** t131, t132, t134, t235, t236
**Typ:** RECURRING

Förlorade linjer, korrupta delegationer, meddelanden som inte publiceras. Datakorruption, inte UI-buggar.

**Åtgärd:** Databasintegritetskontroll + backup-validering.

---

## CROSS_PERSON — Flera aktörer, samma problem

### 15. VJS och fordonsdata — saknad synlighet (5 ärenden)
**Ärenden:** t57, t75, t79, t130, t207
**Typ:** CROSS_PERSON

Keolis, UL, Gävleborg, Värmland — alla har problem med att fordon saknas eller inte syns i VJS/förarplattor.

**Åtgärd:** Gemensam VJS-integrationstestning.

### 16. TQI/Qlik kvalitetsrapporteringsproblem (6 ärenden)
**Ärenden:** t124, t142, t151, t152, t155, t159
**Typ:** CROSS_PERSON

Radbrytningsfel, laddningsfel, justeringsbehov i HTQR-rapporter. Gävleborg, Kalmar, Kronoberg.

**Åtgärd:** Gemensam rapportmallsgranskning.

### 17. Behörigheter och åtkomst i Instant (4 ärenden)
**Ärenden:** t180, t183, t184, t187
**Typ:** CROSS_PERSON

Region Skåne: användarhantering, saknad åtkomst, gömda knappar.

**Åtgärd:** Behörighetsöversyn + UI-granskning.

### 18. PubTrans Base import/selskapsfel (6 ärenden)
**Ärenden:** t24, t95, t104, t106, t133, t173
**Typ:** CROSS_PERSON

Misslyckade importer, selskapsupprettelse, saknade ruter. Flera regioner.

**Åtgärd:** Automatiserad importvalidering.

---

## CROSS_TEAM — Systemövergripande

### 19. HeartBeat- och servicelarm (5 ärenden)
**Ärenden:** t84, t85, t225, t231, t252
**Typ:** CROSS_TEAM

HeartBeat-fel och services som inte körs. UL, Svealandstrafiken, Västtrafik.

**Åtgärd:** Centraliserad tjänsteövervakning med auto-restart.

### 20. Västmanlands Rakel/nöddrift-problem (3 ärenden)
**Ärenden:** t214, t218, t219
**Typ:** CROSS_TEAM

Telefonbok, RabbitMQ-anslutning, OCA tar ej emot anrop. Alla nöddriftsrelaterade.

**Åtgärd:** Testa failover-protokollen.

---

## ESCALATING

### 21. Västtrafik infrastrukturmigreringar (3 ärenden)
**Ärenden:** t248, t250, t251
**Typ:** ESCALATING

Migrering distributörer, replikering tas ner, brandväggsflytt. Tre separata ingrepp som eskalerar i komplexitet.

**Åtgärd:** Pre-migrerings-checklista med obligatorisk flödesövervakningstest.

---

## Observationer som Ministral missar

### Dubblettrapportering
- CAD/AVL (t8, t11, t15, t33): Samma fel rapporterat via flera kanaler, inte 4 separata problem
- Linje 340 (t255, t256, t258, t265): Identiskt ärende (SESD-20857) rapporterat 4 gånger
- MAC-adress (11 ärenden): Troligen ett batch-jobb som borde automatiseras, inte 11 separata problem

### Administrativa ärenden (inte egentliga problem)
- t46: Hogia-Tieto LIJ Production rescheduling
- t103: "Hogia cloud" (oklart ärende)
- t126, t138: Månadsmöten
- t202: Operativt möte
- t220: Ta bort prenumeration (administrativt)

### Regionspecifika kluster
- **Movia** har 10+ ärenden som alla handlar om samma infrastruktur (PTVTIMSDB02, PTVDARTAPP03/04)
- **Skånetrafiken** har 5 SQLJob-fel på samma två servrar
- **SL** har 15+ TIMS-ärenden som kan brytas ner i stoppställefel vs UI-buggar vs integrationsproblem
