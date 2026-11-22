# Staff accounts in the mobile app: decision

**Decided for 1.0:** players only. A staff member who signs in is treated as a player: they see only their player profile, entries and matches. There is no admin button and no redirect to the website from the app. Staff use the website in the browser, as they do today.

**1.1 (not decided):** staff tools inside the app. Planned after 1.0 is released.

---

# Staff accounts in the mobile app: options for decision

Staff means organisers, admins and owners. Today they manage tournaments on the website only.
The question is what, if anything, they can do in the app in version 1.

## Current rules (from the decisions log)

- Organisers and admins must use two-step login (D78, D84). Passkeys alone are not enough for staff on the app (D88): the app needs an authenticator app code.
- Staff sessions last at most 12 hours (D84).
- Owners can do everything admins can, plus Stripe and mail settings, and reset two-step login for others (D78, D80).
- Staff can enter and change scores, check players in, take payments at the desk and cancel entries (D57, D74, D96, D119).

## Option A: staff are not allowed in the app (recommended for version 1)

- The app recognises a staff account at sign-in and shows: "Organiser and admin tools are on the website."
- A staff member who is also a player can still use the app as a player, with their player profile.
- **Pros:** the smallest and safest version. No staff permissions to design or test in the app. No risk of a staff member changing scores or money from a phone. Avoids the App Review questions about staff tools. Keeps the 12-hour session and two-step rules on the website only.
- **Cons:** an organiser on court with no laptop cannot check players in or enter scores from the phone. Staff who want the schedule on their phone must use the website on the phone browser.

## Option B: read-only staff view in the app

- Staff see, for the tournaments they manage: the day's schedule, matches on court, draws and the check-in list (names only, no contact details).
- No changes, no scores, no payments, no refunds, no exports.
- Sign-in needs the authenticator app code (passkey alone is not enough in the app).
- **Pros:** useful on the day without any write risk. Simple to explain. Adds little review risk, because it changes no data.
- **Cons:** needs staff-only screens, a permission check on every request, and an audit log entry for each view of personal data. It means more testing. Staff may still expect to enter scores.

## Option C: full staff tools in the app (desk, scores, check-in, payments)

- The full match desk and check-in, as on the website, on a phone.
- **Pros:** the best on-day experience for organisers.
- **Cons:** the largest scope. Every desk action needs the same checks as the website (score rules, undo rules, payment rules). Payments on a phone add store and security review. Not realistic for version 1 given the timeline. Better as version 2, after Option A or B has run on a real tournament.

## Rights by role (proposal for Option B, to confirm)

| Right                                                  | Player | Organiser                   | Admin                            | Owner                            |
| ------------------------------------------------------ | ------ | --------------------------- | -------------------------------- | -------------------------------- |
| Sign in to the app                                     | Yes    | Yes, with authenticator app | Yes, with authenticator app      | Yes, with authenticator app      |
| See their own player profile and matches               | Yes    | Yes                         | Yes                              | Yes                              |
| See the schedule and live matches of their tournaments | No     | Yes (read only)             | Yes (read only, all tournaments) | Yes (read only, all tournaments) |
| See the check-in list (names only)                     | No     | Yes                         | Yes                              | Yes                              |
| Change scores, check-in, payments, refunds             | No     | No (website only)           | No (website only)                | No (website only)                |
| Export personal data                                   | No     | No                          | No (website only)                | No (website only)                |
| Reset two-step login for others                        | No     | No                          | No                               | No (website only)                |
| Session length                                         | Normal | 12 hours                    | 12 hours                         | 12 hours                         |

## Questions to answer

1. Option A, B or C for version 1?
2. If B: should organisers see the check-in list, or only the schedule?
3. Should staff who are also players see their own matches in the same app session?
4. Should staff sessions in the app end when the phone is locked for 5 minutes?

## Note on Apple review

Apple checks the sign-in flow a reviewer can reach. Option A gives the reviewer a player account and nothing else to test. Option B needs a staff test account with an authenticator app set up in the review notes.
