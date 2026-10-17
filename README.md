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
`<first>.<last>@tourneasy.test`, e.g. `daan.jansen@tourneasy.test`). Logging in arrives in Phase 1.

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

## Verifying Phase 0

1. `pnpm test` — translation key parity, Dutch/English formatting, env validation, routing.
2. Open <http://localhost:3000> → redirected to `/nl`; switch to EN in the header → `/en`.
3. <http://localhost:3000/api/health> → `{"status":"ok","db":"up"}`.
4. Unknown page, e.g. `/en/does-not-exist` → localized 404.
