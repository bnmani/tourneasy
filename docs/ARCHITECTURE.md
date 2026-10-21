# Tourneasy — Architecture

Badminton tournament management and registration platform for the Netherlands.
Bilingual (nl default, en), EUR, iDEAL, Europe/Amsterdam, GDPR/AVG compliant.
Built web-first, API-first, so a React Native (Expo) app can follow without backend rewrites.

## 1. Architecture summary

```
                ┌──────────────────────────┐        ┌──────────────────────────┐
                │  apps/web (Next.js 15)   │        │ apps/mobile (Expo, later)│
                │  RSC pages, server       │        │  typed API client         │
                │  actions (thin), i18n    │        │  Stripe Payment Sheet     │
                └────────────┬─────────────┘        └────────────┬─────────────┘
                             │ calls                              │ HTTPS + bearer token
                             ▼                                    ▼
                ┌──────────────────────────────────────────────────────────────┐
                │ /api/v1/*  REST route handlers (Zod in/out, OpenAPI, ETags,   │
                │ rate limits, consistent error format, auth: cookie OR bearer) │
                └────────────┬─────────────────────────────────────────────────┘
                             ▼
                ┌──────────────────────────────────────────────────────────────┐
                │ Service layer  (apps/web/src/server/services, framework-free) │
                │ auth · players · tournaments · registrations · payments ·     │
                │ draws · scheduling · results · notifications · audit · gdpr   │
                │ every call receives an explicit `Actor` → authorization here  │
                └───┬──────────────┬──────────────┬──────────────┬─────────────┘
                    ▼              ▼              ▼              ▼
               PostgreSQL 16    Stripe        Resend/SMTP     Cloudflare R2
               (Prisma)         (PaymentIntents, (React Email  (photos, logos,
                                 webhooks)       nl/en)         documents)
                    ▲
                    │ pg-boss workers: reminders, deadline closing,
                    │ pending-order expiry (30 min), email/push fan-out
```

**Key principles**

1. **One source of business logic.** Server actions, REST handlers and background jobs all call the
   same service functions. Pure rules (eligibility, scoring, draw generation, fee calculation) live in
   `packages/shared` so they are unit-testable and reusable on mobile for instant UI feedback — the
   server always re-validates.
2. **Authorization in the service layer.** Each service function takes an `Actor`
   (`{ userId, roles, organiserOf[] }`). Roles: `PLAYER`, `ORGANISER`, `ADMIN`. Organiser rights are
   tournament-scoped (`TournamentOrganiser`). Admins can grant/revoke roles, including making other
   users admin (with audit log entry and a guard against removing the last admin).
3. **Auth for web and mobile.** Auth.js v5 (credentials: email _or_ member number + password, argon2id;
   optional magic link). Every login creates a row in `UserSession` so users can list and revoke
   devices. Web: Auth.js JWT cookie carrying the `sessionId`, checked against `UserSession` (so revocation
   is immediate). Mobile: 15-min access JWT + rotating refresh token (hashed, family-based reuse
   detection) on the same `UserSession` row.
4. **Payments.** One `Order` per checkout (cart of one or more event entries). Backend creates a Stripe
   **PaymentIntent** (iDEAL, card, Bancontact); web uses Checkout/Payment Element, mobile uses Payment
   Sheet — same endpoints. Registrations are `PENDING` with a capacity hold until the webhook
   (`payment_intent.succeeded`) confirms them. Webhooks are signature-verified and idempotent
   (`StripeEvent` table). Pending orders expire after 30 minutes via a job.
5. **Capacity safety.** Registration + capacity check run in a `SERIALIZABLE` transaction (or with
   `SELECT … FOR UPDATE` on the event row); overflow goes to waitlist.
6. **Notifications.** `NotificationService` with channels `EMAIL` (implemented), `PUSH` (interface stub,
   `DeviceToken` table ready), `IN_APP` (stored `Notification` rows). Players can **follow** other players
   and get notified when those players' matches are scheduled or results are entered.
7. **i18n.** next-intl, routes `/nl/...` and `/en/...`. All UI strings in
   `packages/shared/src/i18n/messages/{nl,en}.json`. Organiser-written content (descriptions, news) is
   stored as `{ "nl": "...", "en": "..." }` JSON with nl fallback.
8. **Stable deep links.** `/{locale}/invites/{token}`, `/{locale}/registrations/{id}`,
   `/{locale}/tournaments/{slug}/matches/{id}` — later mapped to universal links.
9. **Observability & compliance.** Sentry, pino structured logs, `AuditLog` for every admin/organiser
   mutation, EU-hosted DB/storage, data export + anonymisation flows.

## 2. Folder structure

```
tourneasy/
├── apps/
│   ├── web/                              # Next.js 15 App Router
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── [locale]/
│   │   │   │   │   ├── (public)/         # home, tournaments, venues, clubs, players, news, faq, legal
│   │   │   │   │   ├── (auth)/           # login, register, verify, forgot/reset password
│   │   │   │   │   ├── (player)/account/ # profile, registrations, payments, schedule, follows, sessions, privacy
│   │   │   │   │   ├── (admin)/admin/    # dashboard, tournaments, events, venues, clubs, players,
│   │   │   │   │   │                     # registrations, draws, schedule, results, refunds, users/roles, audit
│   │   │   │   │   └── layout.tsx
│   │   │   │   └── api/
│   │   │   │       ├── auth/[...nextauth]/route.ts
│   │   │   │       ├── v1/…              # versioned REST API (thin handlers → services)
│   │   │   │       ├── webhooks/stripe/route.ts
│   │   │   │       └── openapi.json/route.ts
│   │   │   ├── components/               # ui/ (shadcn), layout/, forms/, tournament/, draw/
│   │   │   ├── server/
│   │   │   │   ├── services/             # business logic (no Next.js imports)
│   │   │   │   ├── auth/                 # Auth.js config, actor resolution, token handling
│   │   │   │   ├── payments/             # Stripe client + webhook handlers
│   │   │   │   ├── notifications/        # channels: email, push (stub), in-app
│   │   │   │   ├── jobs/                 # pg-boss workers + schedules
│   │   │   │   ├── storage/              # R2 (S3) client, signed upload URLs
│   │   │   │   └── lib/                  # errors, logger, rate limit, audit, http helpers
│   │   │   ├── emails/                   # React Email templates (nl/en)
│   │   │   ├── i18n/                     # next-intl routing/request config
│   │   │   └── middleware.ts             # locale routing + auth gate
│   │   ├── e2e/                          # Playwright
│   │   └── next.config.ts
│   └── mobile/                           # reserved (Phase 9, Expo)
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── schemas/                  # Zod schemas (API contracts, forms)
│   │       ├── rules/                    # eligibility, fees, scoring, draws, standings (pure TS)
│   │       ├── api-client/               # generated typed client from OpenAPI
│   │       ├── i18n/messages/{nl,en}.json
│   │       └── types/
│   ├── db/
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/
│   │   ├── prisma/seed.ts                # 1 admin, 20 players, 3 venues, 2 tournaments
│   │   └── src/index.ts                  # PrismaClient singleton export
├── docker/Dockerfile.dev                 # optional containerised dev app
├── docs/
│   ├── ARCHITECTURE.md
│   └── api.md                            # API versioning, errors, pagination, caching
├── docker-compose.yml                    # postgres:16, mailpit, (stripe-cli profile)
├── .github/workflows/ci.yml              # lint, typecheck, test, build
├── .env.example
├── DECISIONS.md
├── tsconfig.base.json                    # shared strict TS settings
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## 3. Data model

Full schema: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma).

Main groups:

| Area            | Models                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Identity & auth | `User`, `UserRole`, `Account`, `UserSession`, `RefreshToken`, `VerificationToken`, `PasswordResetToken`, `Consent`, `DeviceToken`   |
| People & clubs  | `PlayerProfile`, `PlayerFollow`, `Club`, `Team`, `TeamMember`                                                                       |
| Configuration   | `AgeCategory`, `LevelClass` (Badminton Nederland values are data, not code)                                                         |
| Tournaments     | `Venue`, `Tournament`, `TournamentOrganiser`, `TournamentDocument`, `TournamentEvent`, `Announcement`                               |
| Registration    | `Registration` (one entry in an event), `RegistrationParticipant` (1 for singles, 2 for doubles), `PartnerInvite`, `PartnerRequest` |
| Payments        | `Order`, `OrderItem`, `Payment`, `Refund`, `Invoice`, `StripeEvent`, `IdempotencyKey`                                               |
| Competition     | `Court`, `Draw`, `DrawEntry`, `Match`, `MatchSet`, `CourtSlot`                                                                      |
| Platform        | `Notification`, `NotificationPreference`, `AuditLog`                                                                                |

## 4. Phases

0 Foundation · 1 Auth & profiles · 2 Admin core · **2.5 Design & theming** · 3 Public pages ·
4 Registration flow · 5 Payments · 6 Draws, schedule & results · 7 Notifications & polish ·
8 Hardening & launch · 9 Mobile app (Expo): auth, browsing, registration + partner invites, Stripe
Payment Sheet, push notifications, my schedule/results, QR check-in, TestFlight / Play internal
testing.

Additions from the front-end brief (gap analysis, Oct 2026; see DECISIONS.md D44):

| Phase | Added scope                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5   | Four site themes with an admin switch, logo, hero artwork, hide-on-scroll menu, mobile menu, restyled pages, "clear filters" in admin lists.                                                                                                                                                      |
| 3     | Home: carousel of current and upcoming tournaments; menu links to tournaments/live/results/players; public player page (opted-in players only, D30); tournament images (needs the storage decision, D39).                                                                                         |
| 4     | Entry form with pre-fill for signed-in players; partner by name for partners without an account; terms acceptance stored with version and time; tournament members tab for admins and delegated organisers (with export). Open decision: guest entry or account required (D45).                   |
| 6     | Schedule workflow: proposed automatically → adjusted by hand → finalised and published; home-page "live now / next on court"; "categories played" column in the players list; player history on the player page; live updates by polling (Hostinger-friendly) unless the host supports streaming. |
