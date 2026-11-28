# Umpire scoring in the Tourneasy app: design

Status: approved in principle by the owner; decisions below are final for 1.0. Mockups (dark and light themes): https://claude.ai/artifact/PwT4scv6CCrTM8cfAuSQyt
Scope decision: `apps/mobile/SCOPE.md`, section 20.

## Intent

Umpires score live matches on court from their phone. The public site shows the live score as it is entered. The match desk checks every final score before it counts, so mistakes are caught.

## Who and where

- Umpires are a role inside the existing mobile app, version 1.0.
- Umpires are not tied to a court. With 12 umpires and 9 courts, the umpire signs in first, then picks the court they are standing at.
- The match desk (staff, on the website) allocates matches to courts and confirms results.
- Courts may have no Wi-Fi or mobile signal. Offline scoring with sync and a paper fallback are both in 1.0 (see Offline below).

## Offline

- Every point and undo is saved on the phone as it is tapped, before it is sent. A point is never kept only in memory.
- A banner shows "Offline: N points waiting to sync" while there is no connection. The umpire keeps scoring.
- When the connection returns, saved points are sent in order and the banner clears. The public live score and the desk catch up.
- The umpire cannot send the final score while points are still waiting. The desk therefore never gets an incomplete match.
- Sign-in is kept for the day, so no PIN is needed after the first sign-in on that phone.
- Take-over needs a connection. Offline, the reserve umpire sees "Take-over needs a connection".
- Paper fallback: if a phone or the app fails, the umpire writes the score on the paper sheet, and the desk enters it on the website as it does today. The paper sheet is logged as the source.

## Goals

- An umpire can start, score, undo and finish a match with few taps.
- Only one umpire scores a court at a time.
- Every point, undo, take-over and confirmation is logged with the person who made it.
- A wrong score is caught before it counts.

## Non-goals (1.0)

- Umpires cannot see or change any other court or any future match.
- Umpires cannot change a score after sending it. Only the desk can.
- Payments, check-in and other desk tools stay on the website.

## Sign-in

- The admin creates one umpire profile per person on the website.
- Each profile gets a 6-digit PIN and a QR code. The QR code is a sign-in link for that umpire only.
- Scanning the QR code opens the app on the umpire sign-in screen, already signed in. If the app is not installed, the scan goes to the store first, then the umpire scans again.
- A profile expires at the end of the tournament day. The admin can reset the PIN or QR code.

## Court flow

1. **Pick your court.** Courts 1 to 9 in numeric order, each with its status: waiting for the desk, match ready, being scored by another umpire (with a Take over button), or your court.
2. **Your match.** Only the match the desk has put on that court is shown. Future matches are not shown.
3. **Who serves first.** The umpire picks the serving pair. In doubles, the umpire also picks the serving player. The umpire updates the app; the players do not.
4. **Live scoring.** Tap the side that wins each rally. Undo removes the last point. The score and server update on the public site as they change.
5. **Finish.** When one side has won enough games, a popup asks "Are these scores final?". The umpire confirms or goes back.
6. **Waiting for desk.** The umpire can no longer change the score. The court is free for the next match the desk allocates.

## Take-over

- A reserve umpire taps **Take over** on a court being scored.
- The current umpire gets a request with **Accept** and **Decline**. They have 2 minutes.
- Accepted: the court moves to the reserve umpire, and the score stays as it is.
- Declined, or no answer in 2 minutes: the match desk gets an alert and decides between keeping the current umpire or assigning the reserve umpire.
- The reserve umpire sees a waiting screen with a countdown and can cancel.

## Scoring rules

- Max score and number of games come from the category's settings: best of, points to win, cap. Knockout stages can use different settings (existing D61 rule).
- A score that breaks the rules is blocked, and the umpire is told why.
- Undo removes the last point only while the match is in progress.

## Match desk

- The desk sees each umpire entry, with the game scores and the change log.
- The desk can correct a score directly. Every correction is logged with the reason.
- The desk confirms the result. Only then does it count for draws, standings and the results email.
- A take-over not answered in 2 minutes shows a popup alert and a badge on the desk screen. The alert links to the decision, and the decision screen links back to the desk.

## Audit

Each point, undo, take-over request and answer, confirmation, desk correction and desk confirmation is recorded with the person, the match, and the time.

## Themes

- The app's light and dark themes follow the website's chosen Theme 3: slate background in dark, cream in light, with beige labels and pill-shaped buttons in both.
- The mockups show both themes.

## Open items

- None for 1.0 from the owner's answers. Dark and light screens are drawn for the main umpire screens. Remaining screens follow the same palette when built.
