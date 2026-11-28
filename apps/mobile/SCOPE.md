# Tourneasy mobile app: scope (draft for review)

Status: DRAFT. Nothing is built yet. Each phase needs your approval (with mock-ups) before work starts.

## 0. Version naming (agreed)

- **App Store version 1.0** = the first public release. It is what the scope calls "1.0" below.
- **App Store version 1.1 and later** = updates after 1.0. Nothing in 1.1 is needed for the first release.
- **Apple review** is a step before any release, for every version. It is not a version of its own.
- **TestFlight** = testing with your team, and with outside testers after Apple's beta review. It is not public.
- **Early review check:** a 1.0 build can be submitted to Apple with **manual release**, so it is reviewed but nobody can download it until you release it.
- Phase numbers (0 to 5) are build phases. They are not version numbers.
- The API paths `/api/v1/...` are the website API version, unrelated to the app version.

## 1. Purpose and users

- **Players** (main users): find tournaments, enter, see their own schedule and results, follow players, get push messages.
- **Organisers and admins**: stay on the website in 1.0. Only a read-only "today" view is considered for later (see section 9).
- **Spectators** (not logged in): public tournaments, schedule and live scores.

## 2. Platforms and release

- iPhone first (App Store), Android later (Google Play, one-time fee).
- Min iOS version: iOS 16 (to confirm). Tablet layout: phone only in 1.0.
- Languages: English and Dutch, switchable in the app, following the website translations.
- Store listing: nl and en. Bundle ID `com.tourneasy.app` (to confirm).
- Environments: test (test.tourneasy.app) and live (tourneasy.com). Test build for TestFlight; live build for the store.

## 3. Features in 1.0

### 3.1 Accounts and sign-in

- Sign in with email or member number and password.
- Two-step login: authenticator-app code. Passkeys are not supported in the app (D88); a player with only a passkey must add the authenticator app on the website first. Recovery code accepted.
- Sign up in the app (name, date of birth, email, consent to terms and privacy). Email verification link opens the app.
- Forgot password: sends the reset link; the link opens the website reset page (or the app via universal link later).
- Sign out; sign out everywhere (revokes all sessions).
- Account deletion inside the app (Apple requirement): calls `DELETE /me`, explains what is kept (match history anonymised).
- Session: short access token plus refresh token, stored in the device's secure storage. Automatic refresh. Staff sessions limited (12 h).

### 3.2 Home

- "Your next match" card (time, court, opponent, countdown).
- Tournaments you are in today (live).
- Shortcut to the tournaments list and to notifications.

### 3.3 Tournaments

- List: upcoming, running, past; filter by month and location; search by name.
- Tournament detail: date, venue (address, map link), entry deadline, fee and categories, status, organiser contact, logo, description, terms link.
- Categories list with fees and level info.
- Entry itself: **not in 1.0**. The app shows "Enter on the website" with a link.

### 3.4 My entries

- Entries per tournament: categories, partner, payment status (paid / to pay), waiting-list position.
- Withdraw: **not in 1.0** (website); the app links to the website.

### 3.5 My schedule

- Matches per day, each with time, court, category, round, both sides, and status (waiting, on court, finished).
- Changes flagged ("new" / "changed") as on the website.
- Pull to refresh and automatic refresh while a tournament is running.

### 3.6 Live scores and results

- Live matches of a tournament (on court now) and the next matches.
- Scores as they are entered (games, final result, walkover, retirement).
- Draw view: bracket, groups and standings (read-only), tap a match for details.
- Expected knockout rounds (D121) shown as "expected", same wording as the website.

### 3.7 Players

- Search players by name or member number.
- Player profile: name, club, member number, results history.
- Follow / unfollow a player; followed players' matches appear in My schedule.

### 3.8 Notifications

- Push messages (APNs via Expo): match called, match time changed, result entered, tournament news, entry confirmed, payment reminder.
- Per-type on/off in the app, same settings as the website (email preferences apply to email only).
- Notification centre: list of the last 60 days, read / unread.
- Permission asked at the moment it is useful (after entering a tournament or following a player), not on first launch.

### 3.9 Profile and settings

- Profile: name, date of birth (read-only after sign-up), contact details, preferred events.
- Language: English / Nederlands.
- Two-step login management: shows status; links to the website for setup changes.
- Privacy: export my data (link to website), delete account, privacy policy, terms.
- About: version, support contact (info@tourneasy.com), help guide link.

### 3.10 Help and support

- In-app help: the same guide as the website, readable offline (cached text), with a link to the full help.
- Contact support (opens email with device and app version filled in).

## 4. Explicitly out of scope for 1.0

- Entering a tournament, paying, refunds (Stripe Payment Sheet is planned for v2).
- Organiser and admin tools, check-in, match desk, scoring by staff.
- QR check-in (parked on the website too).
- Chat, photos, social feed.
- Offline entry of scores.
- Android (phase 2).
- Tablet-specific layout.

## 5. Screens (list for the mock-ups)

Each screen gets a mock-up for approval in the phase that builds it.

1. Splash / launch
2. Welcome (sign in, sign up, browse without an account)
3. Sign in (email or member number, password)
4. Two-step code
5. Sign up (step 1: name and date of birth; step 2: contact and password; step 3: terms and consent)
6. Email verification waiting screen
7. Forgot password
8. Home
9. Tournaments list (with filter and search)
10. Tournament detail (tabs: About, Categories, Draws, Schedule)
11. Categories (list), category detail
12. Draws (bracket, groups, standings)
13. Live now (matches on court)
14. My schedule (per day)
15. Match detail (both sides, games, time, court, status, history of changes)
16. My entries (list), entry detail
17. Players search
18. Player profile (results, follow button)
19. Followed players
20. Notifications centre
21. Notification settings
22. Profile
23. Settings (language, security status, privacy, delete account)
24. Delete account (confirmation and what happens)
25. Help (guide list and article)
26. Contact support
27. Empty states: no tournaments, no matches today, offline, not found
28. Error states: no connection, server error, session expired
29. Maintenance banner (when the site is down for updates)

## 6. Non-functional requirements

### 6.1 Speed (loading time)

- Start to first screen: under 2 seconds on a mid-range phone with 4G (target).
- Lists paginated (20 items per page), images resized and cached.
- Schedule and live data: short cache (30 seconds), refresh in the background, no spinners that block the screen when cached data exists.
- Skeleton loaders on every list; no blank screens.
- API responses under 300 ms at the 95th percentile for the schedule endpoint (to measure before release).

### 6.2 Security

- Tokens in the device's secure storage (iOS Keychain); never in logs or plain storage.
- HTTPS only; certificate checks on; no cleartext.
- Refresh token rotation with reuse detection (already on the server).
- Session expiry and forced sign-out on password change.
- No personal data in push message text (only "Your match is on court 3").
- Logs: no emails, phone numbers or tokens.
- Screen capture / app switcher: hide sensitive screens (sign-in, two-step code) in the app switcher.
- Deep links validated before use; no open redirects.
- Dependency audit in CI; pinned versions.
- Privacy manifest (iOS) and App Store privacy answers match what the app does.

### 6.3 UI experience

- Matches the website's look (teal, same typography) with mobile-native patterns: bottom tabs, large titles, pull to refresh, native back gesture.
- Dark mode supported.
- Text can scale (Dynamic Type), with layouts that still fit.
- Touch targets at least 44 pt. Screen reader labels on every control (VoiceOver).
- Haptic feedback on confirm actions only.
- Motion respects "reduce motion".

### 6.4 Quality and code

- TypeScript strict; shared types and translations from `packages/shared`.
- One API client; no screen calls the network directly.
- Tests: unit (logic), component (key screens), end-to-end on the simulator for sign-in, schedule and push.
- Crash reporting and performance monitoring from day one (choice to confirm).
- Lint and formatting in CI, same as the website.

### 6.5 Accessibility

- WCAG AA contrast; VoiceOver and Dynamic Type tested.

## 7. Backend changes needed (API)

- `GET /api/v1/tournaments/:slug/schedule` (JSON): matches with times, courts, status and scores.
- `GET /api/v1/tournaments/:slug/draws` (JSON): bracket, groups, standings.
- `GET /api/v1/tournaments/:slug/live` (JSON): matches on court now and next.
- `GET /api/v1/me/matches` (JSON): my matches, upcoming and played.
- `GET /api/v1/notifications` and `POST /api/v1/notifications/:id/read`.
- `POST /api/v1/me/devices` and `DELETE /api/v1/me/devices/:id` (push token register and remove; `DeviceToken` exists, endpoint does not).
- Push sending: a server job that sends Expo push messages for the chosen events, respecting each player's preferences and quiet hours.
- Notification preferences for push (per type).
- Sign-up endpoint for the app (existing `auth/register` to confirm it covers the app's fields).
- Expected knockout rounds and seeds only for organisers (seeds must not appear in public responses, D120).
- OpenAPI updated for every new route.

## 8. Phases (proposed)

- **Phase 0: setup.** Expo project, CI, lint, test runner, shared types, crash reporting, App Store Connect record (after your Apple answers).
- **Phase 1: sign-in and home.** Welcome, sign in, two-step code, sign up, forgot password, home, sign out, delete account, language switch. Mock-ups for screens 1–8, 22–24.
- **Phase 2: tournaments and schedule.** Tournaments list and detail, categories, My entries, My schedule, match detail, live now. Mock-ups for screens 9–16 and 13.
- **Phase 3: draws, players and follow.** Draws, players search and profile, followed players. Mock-ups for screens 12, 17–19.
- **Phase 4: notifications.** Push registration, notification centre, settings, push sending on the server. Mock-ups for screens 20–21.
- **Phase 5: help, polish and release.** Help, support, empty and error states, accessibility pass, speed pass, TestFlight, App Store submission. Mock-ups for screens 25–29.

## 9. Later releases (not in 1.0)

- 1.1: entering a tournament and paying in the app (Stripe Payment Sheet), withdraw.
- 1.1: organiser "today" view (on-court list, check-in list, enter scores with the same rules as the desk).
- 1.1: Android release.
- 1.2 or later: QR check-in, photos, team chat.

## 10. Store and legal

- App Store privacy answers, age rating, support URL, privacy policy URL (website), terms URL.
- Demo account for App Review (a player account; two-step login needs an authenticator app, so the demo account must be set up for it).
- Under-16s: the app must not show their details to strangers (same rule as the website, D83); check the age rating answers.
- GDPR: data export and deletion in the app, matching the website.

## 11. Decisions still needed from you

1. Confirm the 1.0 scope above (anything to add or drop).
2. Apple account: individual or organisation (sets the seller name) and the store name.
3. Minimum iOS version (suggested 16).
4. Crash reporting and performance tool (suggested Sentry, EU region).
5. Whether players may sign up in the app, or only after they register on the website.
6. Push messages in English only, or in the player's language.
7. Whether an organiser who also plays may see the organiser "today" view in 1.0 (suggested: no).

## 12. Decisions from review (round 2)

- **Gap 11, under-16s:** approved. The app follows the website rule (first name and initial only for strangers, also in push text).
- **Gap 12, account deletion:** a deleted account is archived, not erased. The record keeps the history (entries, results, payments, logs) and the name is marked with the suffix **(DA)**, meaning "deleted account". The app and the website both do this. **Open point:** keeping personal details (email, date of birth) after deletion needs a legal basis under GDPR, to be confirmed in the pending legal review. The suggested minimum is to keep only what the law requires (payment records) and the match history under the member number.
- **Gap 13, passkeys:** optional for players. For admins and organisers a pop-up asks them to set up a passkey on their device when they first sign in; it can't be skipped, but the authenticator app also counts (D88). The mobile app can't use passkeys, so staff who sign in on the app need the authenticator app.
- **Gap 14, rate limits:** approved as a plan item (see the explanation given in chat), with the limits set during phase 1.

## 13. Decisions from review (round 3)

- **Gap 12, deleted accounts (final):** the player's account number, first name and last name are kept, with the suffix **(DA)** added to the name. The account balance is deleted. Other personal details (email, date of birth, phone) are removed. History (entries, results, match records) is kept under the account number. Subject to the legal review.
- **Gap 14, rate limits (final):** password reset is limited to **5 requests per internet address per hour** (was 10 on the website). The limit per email address (3 per hour) stays.
- **Skills:** `egm-review` and `egm-draft` (google/elephant-goldfish-model) installed in the project and globally. Scan: no real high or critical issues found; the scanner's own verdict was "do not install" with 91% coverage.

## 14. Passkey setup (replaces the passkey wording in section 12)

- Admins and organisers see one pop-up on sign-in when they have no passkey or authenticator app: **Set up a passkey on this device** (cannot be skipped).
- Options on the pop-up: **Use Face ID on this phone**, **Setup Passkey**, and **Use an authenticator app instead**.
- After **Setup Passkey**, the choice is between the password manager and another device (QR code scanned with the phone).
- Players: passkeys optional, set up under Settings.
- The mobile app can't use passkeys yet (D88); staff use the authenticator app code there.

## 15. Skills for this project

Installed (in the project and globally):

- `egm-review` and `egm-draft` (google/elephant-goldfish-model): review and drafting of this scope and the design documents. `egm-review` can only be started by the owner with `/egm-review`.

Already installed, to use per area:

- Design and screens: `design-taste-frontend`, `impeccable`, `frontend-design`, `apple-design`, `emil-design-eng`, Artifact Design type (mock-ups).
- Expo and React Native: `vercel-react-native-skills`, `mobile-native`, `animate-expo`.
- Animation and speed: `animation-performance`, `vercel-react-best-practices`, `find-animation-opportunities`.
- Accessibility: `frontend-a11y`, `web-design-guidelines`.
- API and data: `api-design`, `typescript-patterns`, `postgres-patterns`, `error-handling`, `react-patterns`.
- Security: `security-review`, `skill-inspector` (vetting any new skill).
- Testing and release: `e2e-testing`, `react-testing`, `browser-qa`, `deployment-patterns`.

Found on GitHub, to vet with skill-inspector before any install (not installed):

- `expo/skills` (4,189 stars, official Expo): EAS build and submit, Expo Router, push notifications.
- `callstackincubator/agent-skills` (1,713 stars): React Native performance and testing.
- `software-mansion-labs/skills` (304 stars): gestures and animation (Reanimated).
- `margelo/react-native-skills` (181 stars): React Native performance patterns.

Not used: astryx (astryx.atmeta.com) is a React and StyleX component library for the web. It cannot be used in the Expo app, so its look is only a reference.

## 16. Decisions from review (round 4)

Blockers:

- **Staff in the app:** to be decided (see apps/mobile/STAFF_ACCOUNTS.md).
- **Player search and profiles:** a player must opt in before anyone can follow them. Draws and overall results show only name, club and score.
- **Under-16 sign-up:** kept in the app. The parent or guardian must give a mobile number too, for verification if needed.

Major:

- **Deleted accounts:** the name is replaced by "Deleted player TE100245" (player number). Records are kept for 5 years.
- **Password reset:** 5 requests per internet address per hour (replaces 10 in the decisions log).
- **Theme:** the user chooses one light theme and one dark theme.
- **Follow rules:** as on the website.
- **Face ID:** offered as an optional second step for all users. For admins and organisers who use the website, two-step login is mandatory.

Not yet mapped to a point: "Expo push" and "early App Store check" (answers 5 and 6 in the second list are unclear; to confirm with the owner).

## 17. Staff decision for 1.0 (agreed)

- **1.0 is for players only.** Staff can sign in to the app, but they are treated as players there: they see only their own player profile, entries and matches.
- The app has an **admin button** for staff. It opens the **website** admin in the phone's browser. The passkey or authenticator check runs there, as it does on the website.
- **1.1** brings staff tools into the app, with Face ID inside the app and native passkey support. It is planned separately, after 1.0 is released. Nothing about 1.1 is decided yet.

## 18. Decisions round 5 (these replace the earlier sections where they conflict)

**Staff in 1.0 (replaces section 17):**

- Version 1.0 is for players only. A staff member who signs in is treated as a player: they see only their player profile, entries and matches.
- There is **no admin button** in the app, and no redirect to the website from the app. Staff use the website in the phone's browser as they do today.

**Login and phone security (replaces the passkey wording in sections 3.1 and 14):**

- Passkeys are not required in the app.
- Optional app lock, chosen by the player in their profile: Face ID, fingerprint or the phone's passcode. This locks the app on the phone; it is not a second login factor on the server.
- Staff still need the authenticator app code on the website (two-step login, D78).

**Other decisions:**

- Under-16 sign-up: the parent or guardian's mobile number receives a confirmation code, and the consent is recorded (PARENTAL_CONSENT, D16).
- Payment records: kept for 7 years. Other deleted-account data: 5 years.
- Deleted players: name replaced by "Deleted player TE100245" in all draws, results and schedules.
- Push notifications are in 1.0. The existing tables are reused: `Notification` (channel PUSH), `NotificationPreference` and `DeviceToken`. Time-critical messages (match called, time changed, result entered) are sent straight away; reminders use the existing queue.
- Push sending through Expo, with a data processing agreement signed with Expo.
- Early Apple submission of 1.0 with manual release: yes.
- Light and dark themes: the website's teal for light, and its dark variant for dark. Players choose one of each in settings.
- Crash reporting (Sentry, EU data) from the start. Performance monitoring after 1.0.
- Minimum iOS version: to confirm once the Expo version is chosen.
- Expo is the app framework and build service.

## 19. Decisions round 6 (these replace section 11 where they conflict)

- **Apple developer account:** individual (the seller name is the owner's own name).
- **Minimum iOS version:** iOS 16.4. Expo SDK 58 (chosen in Phase 0) requires at least iOS 16.4, so the earlier iOS 16.0 suggestion is replaced. The owner chose to keep 16.4. Set as the deployment target in `apps/mobile/app.json`. Reopen only if the Expo SDK is changed to an older version.
- **Crash reporting:** Sentry, on the free Developer plan to start (one user, about 5,000 errors a month). Move to a paid plan when more than one person needs access or error volume exceeds the free limit. The EU data region must be confirmed on the chosen plan. Pricing figures came from third-party sources and must be checked on sentry.io/pricing.
- **Push notification language:** the player's own language (nl or en), as chosen in the app.
- **Sign-up in the app:** yes. Players can create an account inside the app. The sign-up endpoint must be checked for the app's fields (section 7).

## 20. Decision: umpire scoring is in version 1.0 (agreed)

This replaces the "players only" rule in sections 17 and 18 for umpires. Staff and players keep the rules in sections 17 and 18.

- **Umpire role:** a new account role, created by the tournament admin on the website. Umpires are not players and do not need a player profile. Each umpire gets a 6-digit PIN and a QR code for their own sign-in; the QR code opens the app's umpire sign-in.
- **Sign-in:** the umpire signs in first, then picks the court they are standing at. Umpires are not tied to a court.
- **What an umpire sees:** only the courts at the venue, and on the chosen court only the match the match desk has put there. No other court, no future match, no other screens of the app.
- **What an umpire can do:** choose who serves first (in doubles, the umpire picks the serving player as well), score the match with point taps and undo, and send the final score to the match desk. The umpire cannot change a score after sending it.
- **Take-over:** a reserve umpire can request a court that is being scored. The current umpire has 2 minutes to accept or decline. If there is no answer, the match desk is alerted and decides.
- **Match desk:** checks every final score on the website, can correct it directly with the change logged, and confirms the result. Only a confirmed result counts for draws, standings and the results email.
- **Network:** offline scoring with sync is in 1.0. Points are saved on the phone as they are tapped and sent when the connection returns; the final score waits until everything has synced. Take-over needs a connection. A paper scoresheet, entered by the desk, is the fallback.
- **Audit:** every point, undo, take-over request and answer, final score, desk correction and confirmation is logged with the person and the time.
- **Design reference:** `docs/superpowers/specs/2026-11-27-umpire-scoring-design.md`; mock-ups at https://claude.ai/artifact/PwT4scv6CCrTM8cfAuSQyt.
