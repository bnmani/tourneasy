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

## Verifying Phase 2 (admin core)

1. Log in as admin → **Beheer**: overview with counts, tournaments per status, upcoming tournaments and recent changes.
2. **Toernooien → Nieuw toernooi**: choose _Externe organisator_ and enter an email. An existing account becomes
   organiser of that tournament only; an unknown email becomes an invite that activates at sign-up/login.
3. On the tournament page: add events (category, age, level, fee, max entries, match format incl. hybrid groups),
   then _Inschrijving open_ (refused without an open event), publish/unpublish.
4. **Spelers**: filter (gender, preferred event, club, with/without account), add a player without account,
   export CSV, import CSV (template on the import page), merge a duplicate by member number.
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
