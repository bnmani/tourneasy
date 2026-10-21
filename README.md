# Tourneasy

Badminton tournament management and registration platform for the Netherlands (nl/en, iDEAL, GDPR).

- Architecture, folder structure and data model: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Decisions and open questions: [DECISIONS.md](DECISIONS.md)
- API conventions: [docs/api.md](docs/api.md)

## Prerequisites

| Tool    | Version             | Install (macOS)                                           |
| ------- | ------------------- | --------------------------------------------------------- |
| Node.js | 22 LTS              | <https://nodejs.org> installer, or `brew install node@22` |
| pnpm    | 11                  | `corepack enable` (ships with Node)                       |
| Docker  | Desktop or OrbStack | <https://www.docker.com/products/docker-desktop>          |
| Git     | any                 | `xcode-select --install`                                  |

## Getting started

```bash
cp .env.example .env
docker compose up -d          # Postgres 16 on :5432, Mailpit on :1025 / http://localhost:8025
pnpm install
pnpm db:migrate               # applies migrations
pnpm db:seed                  # 1 admin, 20 players, 3 venues, 2 tournaments
pnpm dev                      # http://localhost:3000 → redirects to /nl
```

Seed logins use the `SEED_*` values from `.env` (admin: `admin@tourneasy.test`; players:
`<first>.<last>@tourneasy.test`, e.g. `daan.jansen@tourneasy.test`, or their member number
`TE100001`…). Emails (verification, password reset) land in Mailpit at http://localhost:8025.
Set `AUTH_SECRET` in `.env` (`openssl rand -base64 48`) for the mobile token endpoints.

## Scripts

| Command                                      | What it does                                           |
| -------------------------------------------- | ------------------------------------------------------ |
| `pnpm dev`                                   | Run the web app with hot reload                        |
| `pnpm build`                                 | Production build of all packages                       |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Quality checks (also run in CI)                        |
| `pnpm format`                                | Format with Prettier                                   |
| `pnpm db:migrate`                            | Create/apply a migration after editing `schema.prisma` |
| `pnpm db:reset`                              | Drop, re-migrate and re-seed the local database        |
| `pnpm db:studio`                             | Browse the database in Prisma Studio                   |

## Repository layout

```
apps/web          Next.js 15 app (pages, REST API, server actions)
apps/mobile       reserved for the Expo app (Phase 9)
packages/db       Prisma schema, migrations, seed, client
packages/shared   translations (nl/en), formatting, Zod schemas, business rules
```

## Verifying Phase 5 (payments)

Needs the Stripe **test** keys and webhook secret (docs/deploy-test.md); without them entries behave as in Phase 4.

1. Admin → tournament → _Betaling en korting_: set e.g. €15 / €25 / €32 for 1 / 2 / 3 categories, the
   doubles payment mode and the refund policy.
2. As a player, enter two paid categories: the dashboard opens the payment window straight away and shows
   the hold time and the discounted total. Pay with iDEAL (Stripe's test bank) or test card 4242 4242 4242 4242.
3. After paying you land on the result page; the entries are _Bevestigd_ / _Betaald_ and a receipt email is sent.
4. Enter and don't pay: after 30 minutes the place is released and the next on the waiting list gets 48 hours.
5. Withdraw a paid entry: the refund follows the policy (automatic, or a request under Admin → _Betalingen_).
6. Admin → _Betalingen_: received / refunded / outstanding, refund requests, orders and Excel export.
   On the participants list an organiser can mark a share _Betaald aan de balie_.
7. Admin → tournament → _Deelnemers bekijken_ → _Importeren_ (admins only): download the template, fill in
   member numbers, upload; the result lists entered / waitlisted / skipped rows with the reason per line.

## Verifying Phase 4 (registration flow)

1. Log out, open a tournament with open entries and click _Inloggen om in te schrijven_: after logging in
   (or signing up) you land on the entry form.
2. The form shows every event with your eligibility (gender, age, level), places taken and the fee.
   Pick a singles event and a doubles event, enter a partner's member number or email (or tick
   _Ik zoek nog een partner_), accept the terms and confirm.
3. _Mijn dashboard → Mijn inschrijvingen_ shows the entries, partner status and _Nog te betalen_.
   The partner gets an email (test site: Runtime logs) with a link to accept or decline; they can also
   answer from their own dashboard.
4. Set an event's maximum to 1 and enter twice: the second entry goes on the waiting list and moves up
   when the first withdraws (both get an email).
5. Admin → tournament → _Deelnemers bekijken_: all entries with contact details, filters, cancel, and
   Excel export.

## Verifying Phase 3 (public pages)

1. Home: the carousel shows current and upcoming published tournaments; the menu links to every public page.
2. **Toernooien**: tabs _Komend / Inschrijving open / Afgelopen_; search and filters update while typing.
   Unpublished tournaments never appear. A tournament page shows events, fees, formats, key dates, venue
   and contact, plus _Zet in je agenda_ (.ics) and _Route_.
3. **Kalender**: tournaments grouped by month for twelve months.
4. **Locaties / Clubs**: list with search and province filter; detail pages link to each other.
5. **Spelers**: only adults with a public profile. Logged in, open a player and click _Volgen_; the player
   appears under _Mijn dashboard → Volgend_.
6. `/sitemap.xml`, `/robots.txt` and `/api/openapi.json`; e.g. `curl -i /api/v1/tournaments` shows the
   `ETag`, and repeating it with `If-None-Match` returns `304`.

## Verifying Phase 2 (admin core)

1. Log in as admin → **Beheer**: overview with counts, tournaments per status, upcoming tournaments and recent changes.
2. **Toernooien → Nieuw toernooi**: choose _Externe organisator_ and enter an email. An existing account becomes
   organiser of that tournament only; an unknown email becomes an invite that activates at sign-up/login.
3. On the tournament page: add events (category, age, level, fee, max entries, match format incl. hybrid groups),
   then _Inschrijving open_ (refused without an open event), publish/unpublish.
4. **Spelers**: filter (gender, preferred event, club, with/without account), add a player without account,
   export to Excel, import Excel or CSV (template on the import page), merge a duplicate by member number.
5. **Locaties / Clubs**: create, edit, archive (a venue with upcoming tournaments can't be archived).
6. **Auditlog**: every action above is listed.
7. Log in as the organiser: the portal shows only their tournament(s).

## Verifying Phase 1 (auth & profiles)

1. `pnpm test` — shared rules/schemas plus service tests against a `tourneasy_test` database
   (created and migrated automatically; Docker Postgres must be running).
2. Register at <http://localhost:3000/nl/register> → you land on the dashboard; the confirmation
   email (with member number) is in Mailpit; its link confirms the address.
3. Log out, log in with the member number; try 5 wrong passwords → account locked for 15 minutes.
4. Profile, Security (change password, devices) and Privacy (download data, delete account) under
   “Mijn account”.
5. Log in as admin → admin portal → “Gebruikers en rollen”: grant/revoke Admin or Organiser; removing
   the last admin is refused.
6. Mobile API: see `docs/api.md` (`POST /api/v1/auth/token`, `GET /api/v1/me`, …).

## Verifying Phase 0

1. `pnpm test` — translation key parity, Dutch/English formatting, env validation, routing.
2. Open <http://localhost:3000> → redirected to `/nl`; switch to EN in the header → `/en`.
3. <http://localhost:3000/api/health> → `{"status":"ok","db":"up"}`.
4. Unknown page, e.g. `/en/does-not-exist` → localized 404.
