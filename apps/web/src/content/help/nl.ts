import type { HelpGuide, HelpGuideKey } from './types';

export const nl: Record<HelpGuideKey, HelpGuide> = {
  players: {
    title: 'Handleiding voor spelers',
    summary: 'Maak een account, schrijf je in, betaal en volg je wedstrijden.',
    intro:
      'Met Tourneasy vind je badmintontoernooien, schrijf je je in voor enkel, dubbel of gemengd dubbel, betaal je online en volg je je wedstrijden op de dag zelf. Deze handleiding volgt die volgorde, van je account aanmaken tot je lunch ophalen.',
    facts: [
      { title: 'Wat je nodig hebt', text: 'Een e-mailadres en een telefoonnummer.' },
      {
        title: 'Hoe je betaalt',
        text: 'Online met iDEAL, of aan de balie als de organisator dat toestaat.',
      },
      { title: 'Op je telefoon', text: 'Elke pagina werkt in de browser van je telefoon.' },
    ],
    sections: [
      {
        id: 'account',
        title: 'Maak je account aan',
        blocks: [
          {
            p: 'Klik bovenaan een pagina op **Registreren** en vul je gegevens in. Je geboortedatum en geslacht bepalen voor welke onderdelen je mag spelen, dus controleer ze goed. Bevestig daarna je e-mailadres met de link die we je sturen.',
          },
          {
            p: 'Je krijgt een lidnummer, zoals **TE100006**. Partners kunnen je daarmee uitnodigen voor een dubbel, en je kunt er ook mee inloggen in plaats van met je e-mailadres.',
          },
          {
            img: {
              src: 'p-register',
              alt: 'Formulier om een account aan te maken',
              caption:
                'Account aanmaken. Spelers jonger dan 16 hebben toestemming van een ouder of voogd nodig; het formulier vraagt daarom.',
            },
          },
        ],
      },
      {
        id: 'find',
        title: 'Zoek een toernooi',
        blocks: [
          {
            p: 'Open **Toernooien** en kies **Komend**, **Inschrijving open** of **Afgelopen**. Zoek op naam, plaats of locatie, of filter op provincie en onderdeel. Elke kaart toont de datum, de locatie, de onderdelen en de prijzen. De **Kalender** toont dezelfde toernooien per maand.',
          },
          {
            img: {
              src: 'p-tournaments',
              alt: 'Toernooilijst met zoekveld, filters en toernooikaarten',
              caption:
                'Toernooien. HE en DE zijn herenenkel en damesenkel, HD en DD dubbels, GD gemengd dubbel.',
            },
          },
        ],
      },
      {
        id: 'tournament-page',
        title: 'Lees de toernooipagina',
        blocks: [
          { p: 'Op de toernooipagina staat alles wat je moet weten voordat je je inschrijft:' },
          {
            ul: [
              '**Onderdelen** met de speelwijze en het inschrijfgeld',
              '**Belangrijke data**: wanneer de inschrijving opent en sluit, en tot wanneer je je kunt afmelden',
              '**Terugbetaling bij afmelden**: hoeveel je terugkrijgt als je niet kunt spelen',
              'Knoppen om het toernooi in je agenda te zetten, de schema’s en planning te bekijken en de route te openen',
            ],
          },
          {
            pair: {
              desktop: {
                src: 'p-tournament',
                alt: 'Toernooipagina met onderdelen en belangrijke data',
                caption: 'Toernooipagina op een computer.',
              },
              phone: {
                src: 'm-tournament',
                alt: 'Dezelfde toernooipagina op een telefoon',
                caption: 'Dezelfde pagina op een telefoon.',
              },
            },
          },
        ],
      },
      {
        id: 'enter',
        title: 'Inschrijven en betalen',
        blocks: [
          { p: 'Klik op de toernooipagina op **Inschrijven**:' },
          {
            ol: [
              'Vink de onderdelen aan die je wilt spelen. Onderdelen waarvoor je niet in aanmerking komt (geslacht, leeftijd of niveau) zijn grijs, met de reden erbij.',
              'Nodig voor een dubbel je partner uit met lidnummer of e-mailadres. Je partner krijgt een e-mail en moet accepteren. Nog geen partner? Kies **Ik zoek nog een partner**.',
              'Betaal online met iDEAL. Je plek wordt 30 minuten voor je vastgehouden terwijl je betaalt.',
            ],
          },
          {
            p: 'Sommige toernooien geven korting als je meer dan één onderdeel speelt; het formulier laat dat zien. Je krijgt een bevestiging en een betaalbewijs per e-mail.',
          },
          {
            img: {
              src: 'p-enter',
              alt: 'Inschrijfformulier met onderdelen, prijzen en je gegevens',
              caption:
                'Inschrijfformulier. Je gegevens staan rechts; klopt er iets niet, pas het dan eerst aan in je profiel.',
            },
          },
        ],
      },
      {
        id: 'dashboard',
        title: 'Je dashboard',
        blocks: [
          { p: 'Je dashboard bundelt alles over je toernooien in vijf tabbladen:' },
          {
            ul: [
              '**Mijn inschrijvingen**: elk onderdeel met status en betaling, en **Afmelden** tot de deadline',
              '**Mijn planning**: je wedstrijden met tijd en baan, zodra de planning is gepubliceerd',
              '**Gespeelde toernooien**: je uitslagen',
              '**Volgend**: spelers die je volgt; je hoort wanneer zij spelen',
              '**Profiel**: een snelkoppeling naar je gegevens',
            ],
          },
          {
            pair: {
              desktop: {
                src: 'p-dashboard',
                alt: 'Dashboard met inschrijvingen, status en Afmelden',
                caption:
                  'Dashboard op een computer. “Te betalen” betekent dat er nog een betaling openstaat.',
              },
              phone: {
                src: 'm-dashboard',
                alt: 'Dashboard op een telefoon',
                caption: 'Op een telefoon schuiven de tabbladen opzij.',
              },
            },
          },
          {
            note: '**Afmelden:** klik op **Afmelden** naast het onderdeel. Of je geld terugkrijgt, hangt af van de terugbetalingsregel van het toernooi. Een iDEAL-terugbetaling kan één tot vijf werkdagen duren.',
          },
        ],
      },
      {
        id: 'draws',
        title: 'Schema’s, speeltijden en uitslagen',
        blocks: [
          {
            p: 'Na het sluiten van de inschrijving publiceert de organisator de schema’s en daarna de planning. Je krijgt een e-mail zodra je speeltijden bekend zijn, en opnieuw als ze veranderen. Op de dag zelf worden schema’s en uitslagen live bijgewerkt zodra de wedstrijdtafel scores invoert, dus je ziet langs de baan wie je volgende tegenstander is.',
          },
          {
            img: {
              src: 'p-draws',
              alt: 'Openbaar knock-outschema met plaatsingen, scores en rondes',
              caption:
                'Schema’s. Getallen tussen haakjes zijn plaatsingen; wissel van onderdeel met de knoppen bovenaan.',
            },
          },
        ],
      },
      {
        id: 'food',
        title: 'Eten bestellen',
        blocks: [
          {
            p: 'Bij sommige toernooien kun je vooraf eten bestellen. Open de toernooipagina, kies **Eten & drinken**, kies wat je wilt en betaal online. Bij elk gerecht staan de allergenen.',
          },
          {
            p: 'Je krijgt een bestelcode met een QR-code. Laat die op de dag zien bij het ophaalpunt; de organisator scant hem. Bestel vóór de deadline op de pagina.',
          },
          {
            pair: {
              desktop: {
                src: 'p-food',
                alt: 'Menu met prijzen en allergenen',
                caption: 'Menu van Eten & drinken.',
              },
              phone: {
                src: 'm-food',
                alt: 'Menu op een telefoon',
                caption: 'Houd op je telefoon de QR-code bij de hand.',
              },
            },
          },
        ],
      },
      {
        id: 'settings',
        title: 'Profiel, e-mails en privacy',
        blocks: [
          { p: 'Onder **Mijn account** beheer je je eigen gegevens:' },
          {
            ul: [
              '**Profiel**: naam, telefoon, speelniveaus, club en een contactpersoon voor noodgevallen',
              '**Beveiliging**: je wachtwoord, en eventueel een passkey of authenticator-app voor extra veiligheid',
              '**E-mailvoorkeuren**: herinneringen, uitslagen en nieuws van organisatoren aan of uit',
              '**Privacy**: al je gegevens downloaden, of je account verwijderen',
            ],
          },
          {
            img: {
              src: 'p-profile',
              alt: 'Mijn profiel met persoonlijke gegevens',
              caption:
                'Mijn profiel. Houd je telefoonnummer actueel; organisatoren gebruiken het op de toernooidag.',
            },
          },
          {
            img: {
              src: 'p-notifications',
              alt: 'E-mailvoorkeuren met e-mails die je kunt uitzetten',
              caption:
                'E-mailvoorkeuren. Bevestigingen, betaalbewijzen en je speeltijden krijg je altijd.',
            },
          },
        ],
      },
    ],
  },

  organisers: {
    title: 'Handleiding voor organisatoren',
    summary:
      'Organiseer een toernooi, van inschrijvingen en schema’s tot wedstrijdtafel en betalingen.',
    intro:
      'Als organisator regel je je eigen toernooien van begin tot eind: onderdelen en inschrijvingen, schema’s, de planning, de wedstrijdtafel op de dag en de betalingen. Je ziet alleen de toernooien die een beheerder aan je heeft gekoppeld.',
    facts: [
      { title: 'Waar je werkt', text: 'In het beheer, via de tabbladen van je toernooi.' },
      {
        title: 'De volgorde',
        text: 'Instellen, inschrijving openen, schema’s, planning, toernooidag, afronden.',
      },
      { title: 'Wat je nodig hebt', text: 'Inloggen in twee stappen, net als beheerders.' },
    ],
    sections: [
      {
        id: 'overview',
        title: 'Het overzicht van je toernooi',
        blocks: [
          {
            p: 'Elk toernooi heeft één rij tabbladen: **Overzicht**, **Instellingen**, **Deelnemers**, **Schema’s**, **Planning**, **Wedstrijdtafel**, **Betalingen**, **Eten & drinken**, **Nieuws** en **Logboek**. Je begint op het overzicht:',
          },
          {
            ul: [
              '**Klaarzetten**: een checklist die de volgende stap noemt, tot alles klaar is',
              '**Status**: de huidige fase en de knoppen om verder te gaan',
              '**Onderdelen**: elke categorie met inschrijfgeld, speelwijze en aantal inschrijvingen; **Onderdeel toevoegen** maakt een nieuwe',
            ],
          },
          {
            img: {
              src: 'o-overview',
              alt: 'Toernooioverzicht met checklist, status en onderdelen',
              caption:
                'Toernooioverzicht. De statuskaart zegt ook vanaf welke datum je kunt archiveren.',
            },
          },
        ],
      },
      {
        id: 'status',
        title: 'Inschrijving openen en publiceren',
        blocks: [
          {
            p: 'Twee aparte knoppen bepalen wat spelers kunnen. **Status** is de fase van het toernooi. **Publiceren** bepaalt of het publiek het toernooi ziet. Je kunt het even offline halen om iets te herstellen, zonder dat inschrijvingen of betalingen veranderen.',
          },
          {
            table: {
              head: ['Status', 'Betekenis'],
              rows: [
                ['Concept', 'Je bent het aan het inrichten. Niemand kan zich inschrijven.'],
                [
                  'Inschrijving open',
                  'Spelers kunnen zich inschrijven en betalen. Er moet minstens één onderdeel open zijn.',
                ],
                [
                  'Inschrijving gesloten',
                  'Geen nieuwe inschrijvingen. Tijd voor schema’s en planning.',
                ],
                ['Bezig', 'Het toernooi wordt gespeeld.'],
                ['Afgelopen', 'Alle uitslagen zijn binnen.'],
                [
                  'Gearchiveerd',
                  'Uit je lijsten, bewaard als geschiedenis. Mogelijk vanaf de dag na de laatste toernooidag.',
                ],
              ],
            },
          },
          {
            note: '**Let op:** een toernooi met open inschrijving dat niet gepubliceerd is, is alleen te vinden via een directe link. Het overzicht waarschuwt je hiervoor.',
          },
        ],
      },
      {
        id: 'settings',
        title: 'Instellingen en logo',
        blocks: [
          {
            p: 'Onder **Instellingen** staan de gegevens van het toernooi: data, deadlines, capaciteit, wedstrijdduur, contactgegevens en de terugbetalingsregel. Kies die regel bewust, want spelers zien hem op de toernooipagina voordat ze zich inschrijven:',
          },
          {
            ul: [
              '**Automatisch, vóór de afmelddeadline**: de terugbetaling gaat vanzelf',
              '**Na goedkeuring door de organisatie**: je keurt elke terugbetaling goed onder Betalingen',
              '**Geen terugbetaling**',
            ],
          },
          {
            p: 'Met **Percentage terug** houd je een deel van het inschrijfgeld voor kosten, bijvoorbeeld 90% terug om 10% te houden. Hier upload je ook het logo van het toernooi; dat staat op de openbare pagina en bovenaan elke e-mail over het toernooi.',
          },
          {
            img: {
              src: 'o-settings',
              alt: 'Toernooi-instellingen met logo en organisatoren',
              caption:
                'Instellingen. Een liggend logo op een witte of transparante achtergrond werkt het best.',
            },
          },
        ],
      },
      {
        id: 'participants',
        title: 'Deelnemers beheren',
        blocks: [
          {
            p: '**Deelnemers** toont alle inschrijvingen per onderdeel, met status en betaling. Hier kun je:',
          },
          {
            ul: [
              '**Inschrijving toevoegen** voor een speler die zich telefonisch of bij de club aanmeldt',
              'Inschrijvingen **Importeren** uit Excel, of **Exporteren (Excel)** voor je eigen lijsten',
              'Een inschrijving markeren als **Betaald aan de balie** bij contante betaling',
              'Een inschrijving **Annuleren** om de plek vrij te maken',
            ],
          },
          {
            p: 'Is een onderdeel vol, dan komen nieuwe inschrijvingen op de wachtlijst. Bij een annulering schuift de eerste op de wachtlijst automatisch door en krijgt een e-mail.',
          },
          {
            img: {
              src: 'o-entries',
              alt: 'Deelnemerslijst met status en betaling per inschrijving',
              caption: 'Deelnemers. Filter op onderdeel, of toon alleen de wachtlijst.',
            },
          },
        ],
      },
      {
        id: 'draws',
        title: 'Schema’s maken',
        blocks: [
          { p: 'Open na het sluiten van de inschrijving **Schema’s** en werk elk onderdeel af:' },
          {
            ol: [
              'Controleer de **plaatsingen**. Tourneasy stelt ze voor op speelniveau, sterkste eerst, en je kunt ze aanpassen.',
              'Klik op **Schema maken** voor een concept. Alleen jij ziet het.',
              'Controleer het en **publiceer** het. Spelers zien het meteen op de toernooipagina.',
            ],
          },
          {
            p: 'Dubbelinschrijvingen zonder partner blijven buiten het schema; de pagina zegt hoeveel. Speelwijzen zijn onder meer knock-out, poule, poules met knock-out en Zwitsers systeem.',
          },
          {
            img: {
              src: 'o-draws',
              alt: 'Schema’s per onderdeel met de status van het schema',
              caption:
                'Schema’s. Elk onderdeel toont de speelwijze, het aantal inschrijvingen en of het schema gepubliceerd is.',
            },
          },
        ],
      },
      {
        id: 'schedule',
        title: 'De planning maken',
        blocks: [
          {
            p: 'Open met gepubliceerde schema’s de **Planning** en klik op **Planning voorstellen**. Tourneasy verdeelt de wedstrijden over de banen en dagen, met jouw wedstrijdduur en rusttijd, zodat niemand op twee banen tegelijk staat.',
          },
          {
            p: 'Pas wedstrijden met de hand aan en publiceer. Spelers krijgen een e-mail met hun tijden en banen, en latere wijzigingen worden voor hen gemarkeerd. Met **Exporteren** maak je een pdf of Excel per dag of per baan, voor het mededelingenbord in de hal.',
          },
          {
            img: {
              src: 'o-schedule',
              alt: 'Planning met banen, tijden en wedstrijdkaarten',
              caption:
                'Planning. Elke kaart toont baan, onderdeel, ronde en spelers; scores verschijnen zodra wedstrijden klaar zijn.',
            },
          },
        ],
      },
      {
        id: 'match-desk',
        title: 'De wedstrijdtafel',
        blocks: [
          {
            p: 'De **Wedstrijdtafel** is je scherm op de toernooidag. Het werkt op een laptop of tablet aan de tafel:',
          },
          {
            ol: [
              '**Aanmelden**: vink spelers af als ze binnenkomen en ontvang betalingen aan de balie.',
              '**Volgende**: wedstrijden die kunnen beginnen. Klik op **Op de baan** zodra ze starten.',
              'Vul de gamescores in en klik op **Uitslag opslaan**. Schema en standen werken zichzelf bij.',
              'Gebruik **Walk-over of opgave** als een wedstrijd niet wordt uitgespeeld.',
            ],
          },
          {
            p: 'Is een speler een ingesteld aantal minuten na de begintijd nog niet aangemeld, dan waarschuwt de tafel je, zodat je een walk-over kunt geven. Een uitslag kun je achteraf nog corrigeren.',
          },
          {
            img: {
              src: 'o-matches',
              alt: 'Wedstrijdtafel met aanmeldstatus, Op de baan en scorevelden',
              caption:
                'Wedstrijdtafel. Groene vinkjes tonen wie er is; “Iedereen aanwezig” betekent dat de wedstrijd kan beginnen.',
            },
          },
        ],
      },
      {
        id: 'payments',
        title: 'Betalingen en terugbetalingen',
        blocks: [
          {
            p: '**Betalingen** toont wat er voor je toernooi is ontvangen, terugbetaald en nog openstaat, met alle bestellingen eronder. Meldt een speler zich af en is je regel **Na goedkeuring door de organisatie**, dan wacht de terugbetaling hier op jouw goedkeuring of afwijzing.',
          },
          {
            p: 'Online terugbetalingen gaan automatisch terug naar de bank van de speler. Betaalde de speler aan de balie, dan betaal je zelf terug; dat staat bij de regel.',
          },
          {
            img: {
              src: 'o-payments',
              alt: 'Betalingen van het toernooi met totalen en bestellingen',
              caption:
                'Betalingen. **Exporteren (Excel)** geeft je penningmeester de volledige lijst.',
            },
          },
        ],
      },
      {
        id: 'food',
        title: 'Eten en drinken',
        blocks: [
          {
            p: 'Heeft de eigenaar van de site eten aangezet voor je toernooi, dan kunnen spelers vooraf eten bestellen en betalen. Onder **Eten & drinken**:',
          },
          {
            ol: [
              'Vink **Bestellen open voor spelers** aan, stel een besteldeadline in en vermeld waar spelers het ophalen.',
              'Stel het menu samen met prijzen en allergenen. Spelers zien de allergenen voordat ze bestellen.',
              'Klik op de dag op **Ophaalcode scannen** en scan de code van elke speler. Het scherm bevestigt de bestelling, markeert hem als uitgegeven en waarschuwt als hij al is opgehaald.',
            ],
          },
          {
            img: {
              src: 'o-food',
              alt: 'Instellingen voor eten en drinken met bestellen, deadline en menu',
              caption: 'Eten & drinken. **Bekijk als speler** toont precies wat spelers zien.',
            },
          },
        ],
      },
      {
        id: 'news',
        title: 'Nieuws versturen',
        blocks: [
          {
            p: 'Gebruik **Nieuws** voor alles wat spelers moeten weten: parkeren, een andere begintijd, een herinnering om shuttles mee te nemen. Schrijf het bericht in het Nederlands (en eventueel in het Engels) en kies of het op de toernooipagina komt, per e-mail naar alle deelnemers gaat, of allebei.',
          },
          {
            img: {
              src: 'o-news',
              alt: 'Nieuwsformulier met Nederlandse en Engelse velden en e-mailoptie',
              caption:
                'Nieuws. Spelers die nieuws van organisatoren hebben uitgezet in hun e-mailvoorkeuren krijgen geen e-mail.',
            },
          },
        ],
      },
      {
        id: 'after',
        title: 'Na het toernooi',
        blocks: [
          {
            p: 'Zet de status op **Afgelopen** als de laatste uitslag binnen is. In de dagen na het toernooi krijgt elke speler een e-mail met zijn wedstrijden en eindklasseringen.',
          },
          {
            p: 'Vanaf de dag na de laatste toernooidag kun je het toernooi **Archiveren**. Het verdwijnt uit je lijsten maar blijft compleet: uitslagen blijven op de openbare pagina zolang het gepubliceerd is, en betalingen en lopende terugbetalingen werken gewoon door. In het **Logboek** zie je wie wat heeft veranderd.',
          },
        ],
      },
    ],
  },

  admins: {
    title: 'Handleiding voor beheerders',
    summary: 'Beheer het platform: toernooien, organisatoren, spelers, locaties en betalingen.',
    intro:
      'Als beheerder ben je verantwoordelijk voor het hele platform. Je maakt toernooien aan, bepaalt wie ze organiseert en houdt de gedeelde lijsten van spelers, locaties en clubs op orde. Het dagelijkse werk aan één toernooi staat in de handleiding voor organisatoren.',
    facts: [
      { title: 'Waar je werkt', text: 'In het beheer, via het schildpictogram in de bovenbalk.' },
      { title: 'Wat je ziet', text: 'Elk toernooi, elke speler, elke betaling.' },
      {
        title: 'Wat je nodig hebt',
        text: 'Inloggen in twee stappen. Zonder blijft het beheer dicht.',
      },
    ],
    sections: [
      {
        id: 'two-step',
        title: 'Inloggen in twee stappen instellen',
        blocks: [
          {
            p: 'Inloggen in twee stappen beschermt het platform; beheerders en organisatoren komen zonder niet in het beheer. Je stelt het één keer in:',
          },
          {
            ol: [
              'Open **Mijn account → Beveiliging**.',
              'Kies **Passkey toevoegen op dit apparaat** (Face ID, Touch ID, Windows Hello) of **App instellen** (Google Authenticator, Microsoft Authenticator, 1Password).',
              'Bewaar de 10 herstelcodes op een veilige plek, zoals een wachtwoordmanager. Elke code werkt één keer, voor als je je telefoon kwijt bent.',
            ],
          },
          {
            p: 'Je kunt voor elk apparaat dat je gebruikt een passkey toevoegen. De pagina toont hoeveel herstelcodes je nog hebt, en met **Nieuwe herstelcodes maken** vervang je ze.',
          },
          {
            img: {
              src: 'a-security',
              alt: 'De pagina Beveiliging met passkey en authenticator-app',
              caption:
                'Beveiliging. Een passkey is het snelst; de authenticator-app werkt ook in de mobiele app van Tourneasy.',
            },
          },
        ],
      },
      {
        id: 'overview',
        title: 'Het overzicht lezen',
        blocks: [
          {
            p: 'Het overzicht is je dagelijkse controle. Het beantwoordt drie vragen: wat aandacht nodig heeft, hoe groot het platform is en wat eraan komt.',
          },
          {
            ul: [
              '**Vraagt aandacht**: zaken om op te klikken, zoals een toernooi met open inschrijving dat nog verborgen is, of inschrijvingen die niet betaald zijn',
              '**Tellers**: spelers, accounts, locaties en clubs',
              '**Toernooien per status**: één klik filtert de toernooilijst',
              '**Komende toernooien**: de eerstvolgende toernooien op datum',
            ],
          },
          {
            img: {
              src: 'a-overview',
              alt: 'Overzicht van het beheer met meldingen, tellers en komende toernooien',
              caption:
                'Overzicht. De oranje regels brengen je direct naar de plek waar je het oplost.',
            },
          },
        ],
      },
      {
        id: 'create',
        title: 'Een toernooi aanmaken',
        blocks: [
          {
            p: 'Klik op het overzicht of de toernooilijst op **Nieuw toernooi** en vul het formulier in:',
          },
          {
            ol: [
              '**Algemeen**: naam, type en locatie. Kies **Eigen toernooi** als je het zelf organiseert, of **Externe organisator** als een club het via Tourneasy regelt.',
              '**Data en inschrijving**: de toernooidagen, wanneer de inschrijving opent en sluit, en tot wanneer spelers zich kunnen afmelden.',
              '**Wedstrijdduur**: minuten per wedstrijd, rust tussen wedstrijden en de begintijd. De planning gebruikt deze later; de standaardwaarden passen bij de meeste clubtoernooien.',
            ],
          },
          {
            p: 'Na het opslaan kom je op het toernooioverzicht. Voeg daar de onderdelen toe (bijvoorbeeld Herenenkel Senioren A) met inschrijfgeld, maximaal aantal inschrijvingen en speelwijze.',
          },
          {
            img: {
              src: 'a-new',
              alt: 'Formulier voor een nieuw toernooi',
              caption:
                'Nieuw toernooi. Velden met een i-pictogram geven uitleg als je erop wijst of tikt.',
            },
          },
          {
            note: '**Tip:** een nieuw toernooi begint als verborgen concept. Spelers zien niets tot iemand het op **Inschrijving open** zet en op **Publiceren** klikt.',
          },
        ],
      },
      {
        id: 'tournaments',
        title: 'Alle toernooien beheren',
        blocks: [
          {
            p: 'De toernooilijst toont elk toernooi met data, locatie, inschrijvingen en twee labels: de status en of het gepubliceerd is. Onder elk toernooi staan snelkoppelingen naar **Deelnemers**, de **Wedstrijdtafel** en de openbare pagina.',
          },
          {
            p: 'Gearchiveerde toernooien verdwijnen uit deze lijst. Kies **Gearchiveerd** in het statusfilter om ze terug te zien. Archiveren kan vanaf de dag na de laatste toernooidag.',
          },
          {
            img: {
              src: 'a-tournaments',
              alt: 'Toernooilijst met status- en publicatielabels',
              caption:
                'Toernooien. Het waarschuwingslabel markeert een toernooi met open inschrijving dat niet gepubliceerd is.',
            },
          },
        ],
      },
      {
        id: 'roles',
        title: 'Organisatorrechten geven',
        blocks: [
          {
            p: 'Een organisator beheert alleen de toernooien die je aan hem of haar koppelt. Dat gaat in twee stappen:',
          },
          {
            ol: [
              'Open **Gebruikers en rollen**, zoek de persoon op naam, e-mailadres of lidnummer en klik in de kolom voor organisator op **Toekennen**.',
              'Open het toernooi, ga naar **Instellingen → Organisatoren** en voeg de persoon toe.',
            ],
          },
          {
            p: 'De kolom **2FA** toont wie inloggen in twee stappen heeft. Nieuwe organisatoren stellen het in zodra ze het beheer voor het eerst openen. Elke rolwijziging komt in de auditlog.',
          },
          {
            img: {
              src: 'a-users',
              alt: 'Gebruikers en rollen met rollen, 2FA-status en Toekennen',
              caption: 'Gebruikers en rollen. Zoek eerst; de lijst kan lang zijn.',
            },
          },
        ],
      },
      {
        id: 'players',
        title: 'Spelers beheren',
        blocks: [
          {
            p: '**Spelers** toont iedereen op het platform, met of zonder account. Gebruik het om:',
          },
          {
            ul: [
              '**Nieuwe speler**: iemand zonder account toe te voegen, bijvoorbeeld voor een inschrijving aan de balie',
              '**Importeren**: de ledenlijst van een club uit Excel in te laden',
              '**Samenvoegen**: een dubbel profiel in het juiste profiel op te nemen; inschrijvingen en teams gaan mee',
              'te filteren op geslacht, voorkeursonderdeel, club of account',
            ],
          },
          {
            p: 'Spelers jonger dan 16 hebben het label **Jonger dan 16**. Ze staan nooit in de openbare spelerszoeker.',
          },
          {
            img: {
              src: 'a-players',
              alt: 'Spelerslijst met filters en labels voor spelers jonger dan 16',
              caption:
                'Spelers. Klik op een naam om het profiel te bewerken, de geschiedenis te zien of een dubbel profiel samen te voegen.',
            },
          },
        ],
      },
      {
        id: 'venues',
        title: 'Locaties en clubs op orde',
        blocks: [
          {
            p: 'Locaties en clubs zijn gedeelde lijsten waaruit elk toernooi en elk profiel kiest. Voeg een locatie één keer toe, met adres en aantal banen, en organisatoren kunnen hem daarna kiezen. Het aantal banen is belangrijk: de planning verdeelt de wedstrijden over precies zoveel banen.',
          },
          {
            p: 'Sluit een locatie of fuseert een club, archiveer dan in plaats van te verwijderen. Oude toernooien houden hun geschiedenis en nieuwe kunnen hem niet meer kiezen.',
          },
          {
            img: {
              src: 'a-venues',
              alt: 'Locatielijst met plaats, provincie en aantal banen',
              caption:
                'Locaties. Vink **Toon gearchiveerde** aan om gearchiveerde locaties weer te zien.',
            },
          },
        ],
      },
      {
        id: 'payments',
        title: 'Het geld volgen',
        blocks: [
          {
            p: '**Betalingen** toont alle bestellingen van alle toernooien: wat er binnenkwam, wat terugging en wat nog openstaat. Filter op toernooi of status om vragen van organisatoren of spelers te beantwoorden.',
          },
          {
            p: 'Online betalingen komen binnen via Stripe, meestal met iDEAL. Betalingen aan de balie staan er als **Aan de balie**. Een iDEAL-terugbetaling gaat via een bankoverschrijving en kan één tot vijf werkdagen in behandeling blijven voordat hij als terugbetaald verschijnt.',
          },
          {
            img: {
              src: 'a-payments',
              alt: 'Betalingsoverzicht met ontvangen, terugbetaald en openstaand',
              caption:
                'Betalingen. Elke organisator ziet hetzelfde overzicht voor het eigen toernooi.',
            },
          },
        ],
      },
      {
        id: 'owner',
        ownerOnly: true,
        title: 'Instellingen voor de eigenaar',
        blocks: [
          {
            p: 'De eigenaar is de beheerder met het laatste woord. Een paar instellingen ziet alleen de eigenaar, omdat ze over geld, e-mail en het uiterlijk van de hele site gaan:',
          },
          {
            table: {
              head: ['Instelling', 'Wat het regelt'],
              rows: [
                ['Weergave', 'Het kleurenthema van de site.'],
                [
                  'E-mail',
                  'De mailserver, een testmail, alle mail pauzeren en de teksten van de e-mails.',
                ],
                [
                  'Stripe-instellingen',
                  'De betaalsleutels en de webhook. Telkens 10 minuten ontgrendeld met het wachtwoord van de eigenaar.',
                ],
                [
                  'Prijzen',
                  'Betaalde pakketten voor organisatoren, clubkortingen en facturen. Uit tot de eigenaar het aanzet.',
                ],
                [
                  'Eten toestaan',
                  'Welke toernooien eten mogen aanbieden: een schakelaar op elk toernooioverzicht.',
                ],
                ['Auditlog', 'Elke belangrijke wijziging op de site: wie, wat en wanneer.'],
                [
                  'Inloggen in twee stappen resetten',
                  'Verwijdert de passkeys en app van iemand die al zijn apparaten en codes kwijt is.',
                ],
              ],
            },
          },
        ],
      },
    ],
  },
};
