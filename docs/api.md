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

- Web: Auth.js session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) + CSRF protection on mutations.
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
