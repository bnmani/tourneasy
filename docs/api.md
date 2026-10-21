# API conventions (`/api/v1`)

Draft policy. Endpoints are added from Phase 1 onwards; the OpenAPI document is generated
from the Zod schemas in `packages/shared` and served at `/api/openapi.json`.

## Versioning

- The major version is in the path: `/api/v1/...`.
- Within v1, changes are additive only (new endpoints, new optional fields, new enum values
  that clients must tolerate).
- A breaking change ships as `/api/v2`; v1 stays available for at least 6 months after v2 launches
  (mobile apps in the field update slowly). Deprecated endpoints send a `Deprecation` and `Sunset` header.

## Authentication

- Web: opaque session cookie `__Host-te_session` (`HttpOnly`, `Secure`, `SameSite=Lax`) + same-origin check on mutations.
- Mobile: `Authorization: Bearer <access token>` (15 min) obtained via `/api/v1/auth/token`,
  renewed with a rotating refresh token.

## Error format

All errors return JSON:

```json
{
  "error": {
    "code": "REGISTRATION_EVENT_FULL",
    "message": "This event is full.",
    "details": { "eventId": "…" },
    "requestId": "…"
  }
}
```

`code` is stable and machine-readable; `message` is localized from `Accept-Language` (nl/en).
Validation errors use `VALIDATION_FAILED` with per-field issues in `details.fields`.

## Pagination

Cursor-based: `?limit=20&cursor=<opaque>` → `{ "data": [...], "nextCursor": "…" | null }`.
Maximum `limit` is 100.

## Caching

Public read endpoints send `ETag` and `Cache-Control` (e.g. `public, max-age=60, stale-while-revalidate=300`)
and answer `304 Not Modified` for a matching `If-None-Match`. Authenticated responses use `private, no-store`
unless stated otherwise.

## Idempotency

Mutating payment and registration endpoints accept an `Idempotency-Key` header. Repeating a request
with the same key returns the original response.

## Rate limiting

Auth endpoints and mutations are rate limited per IP and per user. Exceeding the limit returns `429`
with a `Retry-After` header.

## Endpoints (Phase 1)

All bodies are JSON. Validation errors return `422 VALIDATION` with `details.fields`
(`{ field: errorKey }`, keys under `Errors.*` in the shared translations).

| Method   | Path                           | Auth          | Purpose                                                                   |
| -------- | ------------------------------ | ------------- | ------------------------------------------------------------------------- |
| `POST`   | `/api/v1/auth/register`        | —             | Create account → `201 { userId, memberNumber }`; sends verification email |
| `POST`   | `/api/v1/auth/token`           | —             | Log in (`identifier` = email or member number) → token pair               |
| `POST`   | `/api/v1/auth/refresh`         | —             | `{ refreshToken }` → new token pair (old refresh token is invalidated)    |
| `POST`   | `/api/v1/auth/logout`          | Bearer/cookie | End the current session → `204`                                           |
| `POST`   | `/api/v1/auth/verify-email`    | —             | `{ token }` from the email → `204`                                        |
| `POST`   | `/api/v1/auth/forgot-password` | —             | `{ email }` → always `202`                                                |
| `POST`   | `/api/v1/auth/reset-password`  | —             | `{ token, password }` → `204`; logs out all devices                       |
| `GET`    | `/api/v1/me`                   | Bearer/cookie | My account and player profile                                             |
| `PATCH`  | `/api/v1/me`                   | Bearer/cookie | Update my profile (same fields as the web form)                           |
| `DELETE` | `/api/v1/me`                   | Bearer/cookie | `{ password, confirm: true }` → anonymise account (GDPR) → `204`          |
| `GET`    | `/api/v1/me/sessions`          | Bearer/cookie | My logged-in devices (`current` marks this one)                           |
| `DELETE` | `/api/v1/me/sessions/{id}`     | Bearer/cookie | Log out one device → `204`                                                |
| `GET`    | `/api/v1/me/export`            | Bearer/cookie | All my data as a JSON download (GDPR art. 15/20)                          |

Token pair: `{ "tokenType": "Bearer", "accessToken": "…", "expiresIn": 900, "refreshToken": "…" }`.
Access tokens live 15 minutes; refresh tokens rotate on every use and reusing an old one
revokes the whole session (token theft protection). Cookie-authenticated mutations must send
an `Origin` header matching the site (CSRF protection); Bearer requests don't need it.

Rate limits (per window): login 30 per IP and 10 per identifier / 15 min, sign-up 10 per IP / hour,
password reset 10 per IP and 3 per email / hour. Five wrong passwords lock an account for 15 minutes
(`423 ACCOUNT_LOCKED`).

## Public endpoints (Phase 3)

No login needed. Responses are cacheable (`ETag`, `Cache-Control: public, max-age=60`; venues
and clubs 300) and answer `304` to a matching `If-None-Match`. Lists take `limit` (1–100, default 20)
and an opaque `cursor`, and return `{ "data": [...], "nextCursor": "…" | null }`. The full schema is
generated from the shared Zod schemas at **`/api/openapi.json`**.

| Method   | Path                                                | Auth          | Purpose                                                                                       |
| -------- | --------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/tournaments`                               | —             | Published tournaments; `q`, `province`, `discipline`, `when` (`upcoming` \| `open` \| `past`) |
| `GET`    | `/api/v1/tournaments/{slug}`                        | —             | Details: venue, events (fee, format, scoring), dates, contact                                 |
| `GET`    | `/api/v1/tournaments/{slug}/calendar.ics`           | —             | The tournament days as an iCalendar event                                                     |
| `GET`    | `/api/v1/venues`, `/api/v1/venues/{slug}`           | —             | Venues; a venue with its upcoming tournaments and home clubs                                  |
| `GET`    | `/api/v1/clubs`, `/api/v1/clubs/{slug}`             | —             | Clubs; a club with its public players                                                         |
| `GET`    | `/api/v1/players`, `/api/v1/players/{memberNumber}` | — / optional  | Players with a public profile; signed in adds `following`, `isSelf`                           |
| `PUT`    | `/api/v1/players/{memberNumber}/follow`             | Bearer/cookie | Follow → `204`                                                                                |
| `DELETE` | `/api/v1/players/{memberNumber}/follow`             | Bearer/cookie | Unfollow → `204`                                                                              |

Only published, non-deleted tournaments are returned. Players appear only when they opted in, have an
account and are 16 or older (D30); responses never contain email addresses, phone numbers or dates of birth.
