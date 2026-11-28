# Umpire scoring: manual check (owner)

Run on an iOS simulator against a local API (web dev server with a test database, one tournament with two courts, a doubles match on each, two umpires with PIN and QR). Tick each step and note the result. Record the outcome in the PR description and the TestFlight notes.

## 1. Sign-in
- [ ] Enter a wrong PIN. Expected: the same generic error as any other failure; no hint which part was wrong.
- [ ] Sign in with the PIN. Expected: the court list opens and the umpire name shows.
- [ ] Sign out, then sign in by scanning the QR code. Expected: same result; the token is not visible in the app or the API log.

## 2. Court pick and scoring
- [ ] Open the court list. Expected: courts show free or held; only the current match of each court is shown, with both sides named.
- [ ] Pick a free court and start the match, choose who serves. Expected: you hold the court; the match is IN_PROGRESS.
- [ ] Score points for both sides, then undo one. Expected: game score and server follow every tap; undo removes the last point.
- [ ] Play to the end of the match and send it as final. Expected: the match shows "waiting for the desk"; scoring is locked.

## 3. Desk confirm and public live score
- [ ] On the website, open the desk screen. Expected: the match shows under the awaiting list with the score; confirm it. Expected: the match is COMPLETED and the result is on the draw.
- [ ] During scoring, open the public schedule page in a browser. Expected: the live score and server update within a minute; after confirming, the final result shows.

## 4. Take-over, both ways
- [ ] Umpire B opens a court held by umpire A and asks to take over. Expected: A sees the request on the incoming screen within a few seconds; B sees "waiting".
- [ ] A accepts. Expected: B now holds the court and can continue the same match at the same score; A returns to the court list.
- [ ] Repeat and A declines. Expected: B is told it was declined; A keeps the court.
- [ ] B cancels a pending request. Expected: it disappears for A.
- [ ] B asks and nobody answers for 2 minutes. Expected: the request expires, the desk alert appears once and can be resolved once.

## 5. Offline scoring
- [ ] Turn Wi-Fi off in the middle of a match and score several points. Expected: every tap works; a banner shows the number of points waiting to be sent.
- [ ] Try to send as final while offline. Expected: it waits and is not lost.
- [ ] Turn Wi-Fi on. Expected: the queue empties (banner goes), then the final is sent; score on the website matches the phone. Nothing is counted twice.
- [ ] Force-quit the app while offline and reopen. Expected: the queued points are still there and are sent later.

## 6. Paper fallback
- [ ] In an IN_PROGRESS match choose "scoring on paper". Expected: the desk is told; the audit log has one paper entry.
- [ ] The desk enters the paper score. Expected: the result is marked as entered from paper.
- [ ] Try the same on a match that has not started. Expected: refused (409), nothing is written.

## 7. Themes
- [ ] Repeat sign-in, court list and scoring in light and dark mode. Expected: all screens are readable in both.
