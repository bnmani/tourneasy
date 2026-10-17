# Deploying to the test server (test.tourneasy.app)

## 1. Database

The app needs a PostgreSQL 16 database that the hosting platform can reach.
The Postgres in Docker on your Mac only works locally.

Recommended: [Neon](https://neon.tech) free tier, region **AWS Europe Central (Frankfurt)** (EU data residency).
Copy the connection string (it ends with `?sslmode=require`) into `DATABASE_URL`.

Then create the tables and sample data once, from your Mac:

```bash
DATABASE_URL="<neon connection string>" pnpm --filter @tourneasy/db exec prisma migrate deploy
```

```bash
DATABASE_URL="<neon connection string>" SEED_ADMIN_PASSWORD="<choose one>" SEED_PLAYER_PASSWORD="<choose one>" pnpm --filter @tourneasy/db exec prisma db seed
```

## 2. Environment variables

Use **Import .env** with the local file `.env.test-server` after filling in `DATABASE_URL`.
Delete these rows from the platform form (they are for local development only):
`SMTP_HOST`, `SMTP_PORT`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_PLAYER_PASSWORD`.

| Key                       | Value                                  |
| ------------------------- | -------------------------------------- |
| `APP_URL`                 | `https://test.tourneasy.app`           |
| `NEXT_PUBLIC_APP_URL`     | `https://test.tourneasy.app`           |
| `DATABASE_URL`            | your hosted Postgres connection string |
| `EMAIL_FROM`              | `Tourneasy <no-reply@tourneasy.app>`   |
| `NEXT_TELEMETRY_DISABLED` | `1`                                    |

## 3. Build settings

| Setting          | Value                                     |
| ---------------- | ----------------------------------------- |
| Framework preset | **Next.js** if offered, otherwise Other   |
| Branch           | `main`                                    |
| Node version     | 22.x                                      |
| Root directory   | `./` (repository root — it is a monorepo) |
| Install command  | `pnpm install --frozen-lockfile`          |
| Build command    | `pnpm build`                              |
| Start command    | `pnpm --filter @tourneasy/web start`      |
| Output directory | `apps/web/.next`                          |

The app listens on the `PORT` the platform provides.

## 4. Check it works

- `https://test.tourneasy.app` → redirects to `/nl` or `/en`
- `https://test.tourneasy.app/api/health` → `{"status":"ok","db":"up"}`
  (`"db":"down"` means `DATABASE_URL` is wrong or the database isn't reachable)
