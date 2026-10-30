# Going live on tourneasy.com

The live site runs the same app as the test site, from its own branch and database:

|                | Test                                                                  | Live                                |
| -------------- | --------------------------------------------------------------------- | ----------------------------------- |
| Address        | https://test.tourneasy.app                                            | https://tourneasy.com               |
| Branch         | `main` (every push)                                                   | `production` (only on a release)    |
| Database       | Neon project (test)                                                   | Neon project `tourneasy-production` |
| Search engines | noindex on every page (`X-Robots-Tag`), crawlable so old results drop | indexed                             |
| Stripe         | test keys                                                             | live keys                           |

A release: test on the test site, then fast-forward `production` to `main` and push. Hostinger
rebuilds the live site from `production`.

## 1. Web app in Hostinger (you)

hPanel → Websites → **Add website** → **Node.js Web App** → connect GitHub `bnmani/tourneasy`.

| Setting          | Value                                 |
| ---------------- | ------------------------------------- |
| Domain           | `tourneasy.com` (now parked)          |
| Framework preset | **Other**                             |
| Branch           | `production`                          |
| Node version     | 22.x                                  |
| Root directory   | `apps/web`                            |
| Build command    | `pnpm run build`                      |
| Package manager  | pnpm                                  |
| Entry file       | `.next/standalone/apps/web/server.js` |

Environment variables: **Import .env** with the local file `.env.production-server` (made by
Claude, git-ignored). It holds `APP_URL`, `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `AUTH_SECRET`,
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `EMAIL_FROM`, `EMAIL_TRANSPORT` and
`NEXT_TELEMETRY_DISABLED`. All secrets are new: none is shared with the test site.

Then: SSL → **Let's Encrypt** on `tourneasy.com` and `www.tourneasy.com`, force HTTPS, and send
`www` to `tourneasy.com`.

Check: `https://tourneasy.com/api/health` shows `{"status":"ok","db":"up"}`.

## 2. Your owner account (you, then Claude)

1. Register at `https://tourneasy.com/nl/register` with your own email address.
2. Tell Claude; Claude makes the account owner on the production database.
3. Log in again and set up two-step login (a passkey, or the app). Passkeys from the test site
   don't work here: they belong to the test domain.

## 3. Email (you)

1. hPanel → Emails → `tourneasy.com` → create the mailbox `no-reply@tourneasy.com`.
2. Check that DNS has the SPF, DKIM and DMARC records Hostinger proposes for `tourneasy.com`.
3. On the site: Admin → E-mail → server `smtp.hostinger.com`, port 465, that mailbox and its
   password. Send the test email.

## 4. Payments (you)

1. Stripe: finish the account activation for live payments.
2. Stripe → Developers → Webhooks → add `https://tourneasy.com/api/v1/payments/webhook` with the
   events `payment_intent.*` and `refund.*`.
3. On the site: Admin → Payments → Stripe settings → the **live** keys (`sk_live_…`, `pk_live_…`)
   and the webhook's `whsec_…`.

Note: entry fees are collected on Tourneasy's Stripe account for the organisers. Before real
organisers take real money, check with an accountant whether this needs Stripe Connect (PSD2).

## 5. Before announcing (you)

- Privacy policy and terms: the pages still show the draft notice; give Claude the final texts.
- Pricing stays off until you switch it on under Owner → Pricing.
- Neon: the free plan suspends the database when idle (slow first page) and keeps little history
  for restores. A paid plan is advised for the live site.

## Database (done by Claude)

The Neon project `tourneasy-production` has all migrations, the reference lists
(`prisma/reference-data.ts`: adds what is missing, never deletes) and the scheduler key's hash.
Never run `prisma db seed` there: it wipes everything and adds demo players.

## Scheduled jobs

GitHub Actions **Housekeeping** calls both sites every 15 minutes. The live site's key is the
repository secret `CRON_KEY_PROD`; its SHA-256 is in the live database (`SiteSetting
cron.keyHash`). The live site joins once the repository variable `PROD_SITE_URL` is set to
`https://tourneasy.com` (after launch). A site without a key or URL is skipped.
