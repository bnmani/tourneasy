# Umpire scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umpires sign in with a PIN or QR code, pick a court, score the match the desk put there (online or offline), and the match desk checks and confirms every final score. Version 1.0.

**Architecture:** Website API (`apps/web`, Next.js route handlers over `apps/web/src/server/services`) owns all rules: court holds, take-over, score validation and the desk confirmation. The mobile app (`apps/mobile`, Expo) is a thin client: it saves each tap to the phone first, then sends events in order to an idempotent endpoint. Shared score rules come from `packages/shared/src/rules/scoring.ts`.

**Tech Stack:** Next.js route handlers, Prisma (`packages/db`), TypeScript, Expo / React Native, Vitest (existing `*.test.ts` files), Sentry (existing).

**Spec:** `docs/superpowers/specs/2026-11-27-umpire-scoring-design.md` (decisions), `apps/mobile/SCOPE.md` section 20 (1.0 scope). Mock-ups: https://claude.ai/artifact/PwT4scv6CCrTM8cfAuSQyt

## Global Constraints

- Version 1.0 includes umpire scoring. The players-only rule in `SCOPE.md` sections 17–18 does not apply to umpires.
- Max score, games and points come only from the category's scoring settings (`bestOf`, `pointsToWin`, `pointsCap`, and the knockout override via `rulesForMatch`). Nothing hard-coded.
- Take-over: 2 minutes to answer. No answer: the desk alert is raised.
- A final score cannot be changed by an umpire after it is sent. Only the desk changes it, and every change is logged with a reason.
- Every point, undo, take-over step, final send, desk correction and desk confirmation writes an audit entry with the actor, match and time.
- Umpire PINs and QR tokens are stored as hashes only. The plain values are shown once, when the admin creates the profile.
- The app is an Expo app with iOS 16.4 as the minimum (`apps/mobile/app.json`).

## Review Focus

1. Two devices tap points on the same court at the same time: the second umpire must be refused, not merged. Test: `second umpire on a held court gets 409` (Task 4).
2. Reconnect after offline taps sends the same points twice: duplicates must be ignored by event id. Test: `re-sent events are not applied twice` (Task 4).
3. App is killed or the phone restarts mid-match: unsent taps must still be there. Test: `queued events survive a restart` (Task 9).
4. A PIN or QR token is reused after the tournament day, or scanned by someone else: sign-in must fail. Test: `expired or revoked umpire token is refused` (Task 3).
5. Take-over accepted at the same moment as the 2-minute timeout: exactly one outcome. Test: `answer after timeout is refused and the desk alert is not duplicated` (Task 5).

## File Map

- Database: `packages/db/prisma/schema.prisma` (new `Umpire`, `UmpireEvent`, `CourtHold`, `TakeoverRequest`, `DeskAlert` models; new match status), new migration under `packages/db/prisma/migrations/`.
- Shared: `packages/shared/src/rules/umpire.ts` (sync and serve rules), `packages/shared/src/schemas/umpire.ts` (request schemas).
- Website services (new): `apps/web/src/server/services/umpire-service.ts` (profiles, PIN, QR, sign-in), `umpire-court-service.ts` (holds, take-over, timeout), `umpire-scoring-service.ts` (events, finish, desk correction and confirmation).
- Website routes (new): `apps/web/src/app/api/v1/umpire/…` (see Task 6).
- Website admin UI (modified): `apps/web/src/app/[locale]/admin/tournaments/[id]/matches` (desk alerts, correction, confirmation) and the umpire profiles page under the tournament admin.
- Mobile (new): `apps/mobile/src/lib/api.ts` (API client), `apps/mobile/src/lib/score-queue.ts` (on-phone queue), `apps/mobile/src/app/umpire/` (screens: sign-in, courts, match, serve, scoring, take-over, finish, waiting, paper).

---

### Task 0: Mobile API client (prerequisite)

Today `apps/mobile/src/lib/session.tsx` uses `demoAuth` and `demoProfile` stubs (its comment says "wired to the website API later"). Every umpire task calls the website API, so this comes first.

**Files:**
- Create: `apps/mobile/src/lib/api.ts`
- Modify: `apps/mobile/src/lib/session.tsx` (use the client for the existing sign-in only where it is already in scope; players' stubs stay as they are for 1.0 sign-in until Phase 1 lands)
- Test: `apps/mobile/src/__tests__/api.test.ts`

**Interfaces:**
- Produces: `apiPost<T>(path: string, body: unknown, token?: string): Promise<T>`, `apiGet<T>(path: string, token?: string): Promise<T>`, `ApiError` with `status: number` and `code: string`.

- [ ] **Step 1: Write the failing test.** `apiPost` sends JSON and throws `ApiError` with `status` 409 when the server returns 409 and body `{ "code": "COURT_HELD" }`.
- [ ] **Step 2: Run it.** `pnpm --filter mobile test api` → FAIL, module missing.
- [ ] **Step 3: Implement `apiPost`, `apiGet`, `ApiError` in `api.ts`.** Base URL from `app.json` `extra`. Token passed as `Authorization: Bearer`.
- [ ] **Step 4: Run it.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(mobile): api client for website API"`

---

### Task 1: Database models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_umpire_scoring/migration.sql` (generated)
- Test: `packages/db/src/__tests__/umpire-schema.test.ts` (checks the models and the unique keys exist after migrate)

**Interfaces:**
- Produces: `Umpire { id, tournamentId, displayName, pinHash, qrTokenHash, expiresAt, revokedAt?, deviceId? }`; `UmpireEvent { id (client uuid, unique), matchId, courtId, umpireId, seq, kind (POINT | UNDO), side (A | B)?, createdAt }`; `CourtHold { courtId (unique), umpireId, since }`; `TakeoverRequest { id, courtId, fromUmpireId, toUmpireId, status (PENDING | ACCEPTED | DECLINED | TIMED_OUT), expiresAt }`; `DeskAlert { id, courtId, takeoverRequestId, status (OPEN | RESOLVED), createdAt }`. Match gets a status value `AWAITING_DESK` (umpire has sent the final score; not yet confirmed).

- [ ] **Step 1: Write the failing test.** The test asserts `UmpireEvent.id` is unique, `CourtHold.courtId` is unique, and `Match.status` accepts `AWAITING_DESK`.
- [ ] **Step 2: Run it.** `pnpm --filter @tourneasy/db test` → FAIL.
- [ ] **Step 3: Add the models and the enum value; run `pnpm db:generate` and `pnpm db:migrate`.**
- [ ] **Step 4: Run it.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): umpire, court hold and take-over models"`

---

### Task 2: Shared sync and serve rules

**Files:**
- Create: `packages/shared/src/rules/umpire.ts`, `packages/shared/src/schemas/umpire.ts`
- Test: `packages/shared/src/rules/umpire.test.ts`

**Interfaces:**
- Produces: `applyEvents(current: Game[], events: ScoreEvent[], rules: ScoringRules): { games: Game[]; serving: 'A' | 'B'; finished: boolean; rejected?: string }`, where `ScoreEvent = { id: string; kind: 'POINT' | 'UNDO'; side?: 'A' | 'B' }`. Reuses `gameWinner` and `checkMatchScore` from `scoring.ts`.
- Produces: `umpireEventSchema` (zod, same style as `packages/shared/src/schemas/*.ts`).

- [ ] **Step 1: Write the failing tests.** Points to 21 with cap 30 end a game; undo after a game is won returns to the previous score; a point after the match is finished is rejected; the serving side follows the rally winner.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement `applyEvents` by calling `gameWinner` and `checkMatchScore`.**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(shared): umpire score event rules"`

---

### Task 3: Umpire profiles, PIN and QR sign-in

**Files:**
- Create: `apps/web/src/server/services/umpire-service.ts`
- Test: `apps/web/src/server/services/umpire-service.test.ts`

**Interfaces:**
- Produces: `createUmpire(actor, { tournamentId, displayName }, meta) → { pin: string; qrUrl: string }` (plain values returned once); `signInUmpire({ pin } | { qrToken }, deviceId) → { umpireId, sessionToken, expiresAt }`; `revokeUmpire(actor, umpireId, meta)`; `resetUmpireAccess(actor, umpireId, meta) → { pin, qrUrl }`.
- Session expires at the end of the tournament day (the venue's local day).

- [ ] **Step 1: Write the failing tests.** `expired or revoked umpire token is refused`; `PIN and QR are stored only as hashes`; `a second device is refused while the first device holds the profile` (only one device per profile).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement with `crypto` hashing (no plain values in the table).**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): umpire profiles with PIN and QR sign-in"`

---

### Task 3b: Admin umpire page on the website

**Files:**
- Create: `apps/web/src/app/[locale]/admin/tournaments/[id]/umpires/page.tsx` (list, add, reset, revoke)
- Create: `apps/web/src/app/[locale]/admin/tournaments/[id]/umpires/actions.ts` (server actions that call `umpire-service.ts`)
- Test: `apps/web/src/app/[locale]/admin/tournaments/[id]/umpires/umpires-page.test.tsx`

**Interfaces:**
- Consumes: `createUmpire`, `resetUmpireAccess`, `revokeUmpire` (Task 3).
- Produces: a list of umpires with status (active, expired, revoked) and the "Umpires" tab in the tournament admin navigation.
- Shows the new PIN and QR code once, after create or reset. It is never shown again; the list shows only the name and status.

- [ ] **Step 1: Write the failing tests.** `new PIN is shown once after create and not on the list`; `revoked umpire shows as revoked and cannot sign in`; `only organisers and admins of the tournament can open the page`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement the page and actions, and add the tab to the tournament admin navigation.**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): admin page for umpire profiles"`

---

### Task 4: Court holds and scoring events

**Files:**
- Create: `apps/web/src/server/services/umpire-court-service.ts` (holds), `apps/web/src/server/services/umpire-scoring-service.ts` (events and finish)
- Test: `apps/web/src/server/services/umpire-scoring-service.test.ts`

**Interfaces:**
- Produces: `claimCourt(umpireId, courtId)` (throws `COURT_HELD`, HTTP 409, if another umpire holds it); `releaseCourt(umpireId, courtId)`; `listCourts(tournamentId, umpireId)` (court number, status, holder display name, match summary only for the court's current match).
- Produces: `postEvents(umpireId, matchId, events: ScoreEvent[]) → { applied: number; duplicates: number; serving; games; version }`. Events are applied in `seq` order; events whose `id` already exists are counted as duplicates and not applied; the Match `version` is checked (optimistic locking).
- Produces: `finishMatch(umpireId, matchId)` → status `AWAITING_DESK`; refused if the match is not finished under `checkMatchScore`.

- [ ] **Step 1: Write the failing tests.** `second umpire on a held court gets 409`; `re-sent events are not applied twice`; `point after finish is refused`; `finish is refused while the match is not decided`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement with a transaction per `postEvents` call.**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): court holds, scoring events and finish"`

---

### Task 5: Take-over with a 2-minute window

**Files:**
- Modify: `apps/web/src/server/services/umpire-court-service.ts`
- Create: `apps/web/src/server/jobs/takeover-timeout.ts` (uses the existing jobs runner in `apps/web/src/server/services/jobs-service.ts`)
- Test: `apps/web/src/server/services/umpire-takeover.test.ts`

**Interfaces:**
- Produces: `requestTakeover(reserveUmpireId, courtId) → TakeoverRequest` (`expiresAt = now + 2 minutes`); `answerTakeover(currentUmpireId, requestId, 'ACCEPT' | 'DECLINE')`; `cancelTakeover(reserveUmpireId, requestId)`.
- Timeout job: marks PENDING requests past `expiresAt` as TIMED_OUT and opens one `DeskAlert`.

- [ ] **Step 1: Write the failing tests.** `answer after timeout is refused and the desk alert is not duplicated`; `accepted take-over moves the hold and keeps the score`; `declined take-over leaves the hold unchanged`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement the state changes in one transaction, guarded by `status = PENDING`.**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): take-over with 2 minute window and desk alert"`

---

### Task 6: Umpire API routes

**Files:**
- Create: `apps/web/src/app/api/v1/umpire/sign-in/route.ts`, `apps/web/src/app/api/v1/umpire/courts/route.ts`, `apps/web/src/app/api/v1/umpire/courts/[courtId]/claim/route.ts`, `apps/web/src/app/api/v1/umpire/matches/[matchId]/events/route.ts`, `apps/web/src/app/api/v1/umpire/matches/[matchId]/finish/route.ts`, `apps/web/src/app/api/v1/umpire/takeovers/route.ts`, `apps/web/src/app/api/v1/umpire/takeovers/[requestId]/answer/route.ts`
- Test: `apps/web/src/app/api/v1/umpire/routes.test.ts`

**Interfaces:**
- Each route returns the service result as JSON and maps `COURT_HELD` to 409, unknown or expired token to 401, and a wrong umpire on a match to 403.

- [ ] **Step 1: Write the failing tests.** One request per route with the expected status code.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement each route as a thin wrapper around the services.**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): umpire API routes"`

---

### Task 7: Desk on the website: check, correct, confirm, alerts

**Files:**
- Modify: `apps/web/src/server/services/umpire-scoring-service.ts` (add `correctMatchScore`, `confirmMatchResult`, `resolveDeskAlert`)
- Modify: `apps/web/src/app/[locale]/admin/tournaments/[id]/matches` (desk screen: umpire entry, change log, correct, confirm; badge and alert panel)
- Test: `apps/web/src/server/services/umpire-desk.test.ts`

**Interfaces:**
- `confirmMatchResult(actor, matchId, meta)` calls the existing `recordResult` in `apps/web/src/server/services/results-service.ts` so draws, standings and results email follow the existing path.
- `correctMatchScore(actor, matchId, games, reason, meta)` logs the old and new score and the reason.
- `resolveDeskAlert(actor, alertId, 'KEEP_CURRENT' | 'ASSIGN_RESERVE', meta)`.

- [ ] **Step 1: Write the failing tests.** `desk confirmation uses recordResult and updates standings`; `correction without a reason is refused`; `desk alert resolves once`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement the three functions and the desk screen states from the mock-ups (DeskReview, DeskTakeoverAlert).**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): match desk checks and confirms umpire scores"`

---

### Task 8: Live score on the public site

**Files:**
- Modify: `apps/web/src/server/services/schedule-service.ts` (the public schedule endpoint `GET /api/v1/tournaments/{slug}/schedule`; there is no separate live route)
- Test: `apps/web/src/server/services/schedule-live.test.ts`

**Interfaces:**
- Adds to each live match: `games` (current scores), `serving` (`A` | `B`), `status` (`IN_PROGRESS` | `AWAITING_DESK` | `COMPLETED`).

- [ ] **Step 1: Write the failing test.** A match with umpire events shows the current game score and the server.
- [ ] **Step 2: Run it.** → FAIL.
- [ ] **Step 3: Read the score from `UmpireEvent` through `applyEvents`.**
- [ ] **Step 4: Run it.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): live endpoint shows umpire score and server"`

---

### Task 9: On-phone queue for offline taps

**Files:**
- Create: `apps/mobile/src/lib/score-queue.ts`
- Test: `apps/mobile/src/__tests__/score-queue.test.ts`

**Interfaces:**
- Produces: `enqueue(matchId, event)` (writes to local storage before returning); `pending(matchId): ScoreEvent[]`; `flush(matchId, token)` (sends in `seq` order via `apiPost`, removes an event only after the server acknowledges it); `canFinish(matchId): boolean` (true only when `pending` is empty).
- Uses local storage from the app's existing dependency list (check `apps/mobile/package.json`; add `@react-native-async-storage/async-storage` with Expo's `npx expo install` if missing).

- [ ] **Step 1: Write the failing tests.** `queued events survive a restart`; `finish is blocked while events are pending`; `flush removes only acknowledged events`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement with one storage key per match.**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(mobile): offline score queue with sync"`

---

### Task 10: Umpire screens in the mobile app

**Files:**
- Create: `apps/mobile/src/app/umpire/sign-in.tsx`, `courts.tsx`, `match/[matchId].tsx` (match with start), `serve.tsx`, `scoring.tsx` (scoring, undo, offline banner, paper link), `takeover.tsx` (request and answer), `finish.tsx` (confirm popup), `waiting.tsx`, `paper.tsx`
- Test: `apps/mobile/src/__tests__/umpire-screens.test.tsx` (render and the key button states from the mock-ups)

**Interfaces:**
- Consumes: `apiGet`, `apiPost` (Task 0), `enqueue`, `flush`, `canFinish` (Task 9).
- Each screen follows the approved mock-ups; the screen names match the artboards in the canvas (Main, Courts, CourtMatch, StartMatch, Scoring, TakeoverRequest, TakeoverPending, ConfirmFinal, Waiting, PaperFallback, Offline).
- QR scan uses the camera permission and the app's existing scanner dependency if one is present; otherwise add `expo-camera` with `npx expo install`.

- [ ] **Step 1: Write the failing tests.** `court picker shows only the umpire's visible states`; `serve choice is sent before scoring starts`; `finish is disabled while events are pending`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement the screens.**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(mobile): umpire screens"`

---

### Task 11: Manual check before TestFlight

- [ ] **Step 1: Run the path on a simulator against a local API:** sign in with PIN, pick a court, score a doubles match to the end, confirm final, desk confirms.
- [ ] **Step 2: Turn Wi-Fi off during scoring.** Points must keep working, the banner must show the count, and the final send must wait until the queue is empty after the connection returns.
- [ ] **Step 3: Take-over with no answer.** The desk alert appears after 2 minutes and resolves once.
- [ ] **Step 4: Paper fallback.** The desk enters a paper score and the result is marked as entered from paper.
- [ ] **Step 5: Record the results in the PR description and the TestFlight notes.**

---

## Self-review

- Spec coverage: sign-in (Task 3), court picker and only-the-allocated-match (Tasks 4, 10), take-over (Tasks 5, 10), scoring and undo (Tasks 2, 4, 10), finish and desk confirm (Tasks 4, 7), audit (Tasks 4, 5, 7), live score (Task 8), offline and paper (Tasks 9, 10, 11), light and dark themes (Task 10 uses the approved palette; both are in the mock-ups).
- Gap to close during Task 10: the light theme screens are drawn for five screens only. The other screens use the same palette tokens.
- Type names are used the same way across tasks: `ScoreEvent`, `COURT_HELD`, `AWAITING_DESK`, `TakeoverRequest`, `DeskAlert`.

## Execution

Plan saved to `docs/superpowers/plans/2026-11-27-umpire-scoring.md`. Tasks depend on each other's interfaces (database, services, routes, then screens), so the order matters.

- **Subagent-driven:** a fresh subagent per task with a reviewer after each. Thorough, and suited to this plan, since the tasks are large and depend on earlier interfaces.
- **Native:** I implement every task in this session, then one review at the end. Cheaper and faster, with review only at the end.

I recommend **subagent-driven**, because the tasks depend on exact interfaces, and a mistake in the database or scoring rules would reach every screen. Which approach do you want, and should Task 0 (the mobile API client) wait for the decision on the existing phase plan?
