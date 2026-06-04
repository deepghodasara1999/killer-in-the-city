# Killer In The City — Progress Tracker

> Updated after Iteration 3

---

## ✅ Done

### Iteration 1 — Core bug fixes
- Role privacy (other players' roles hidden during play)
- Stable `playerId` for reconnect support
- Night phase timer with auto-submit on expiry
- Early resolution when all roles submit
- Voting early resolution
- Win condition checks
- Score distribution
- Host disconnect → room deleted + clients notified
- Health endpoint `GET /health`

### Iteration 2 — MCQ for citizens + timer fixes
- Citizen now gets 4-option MCQ (same UX as role screens)
- 50 citizen questions in bank
- Citizens use per-player key (`CIT_<id>`) so all can submit independently
- `maxTimer` sent from server on every broadcast (not just status change)
- Timer bar always renders correctly on reconnect
- `restartSession` backend handler properly implemented
- Role reveal: starts hidden (tap-to-reveal), not auto-shown

### Iteration 3 — Current
- **Refresh "Game Not Found" fixed** — renamed reconnect event from `reconnect` to `rejoinGame` (avoids collision with socket.io's own internal `reconnect` event). Frontend now emits `rejoinGame`; backend listens on `rejoinGame`. On rejoin failure, `rejoinFailed` event clears session and shows friendly message.
- **Timer progress bar fully fixed** — server now sends `maxTimer` on EVERY `roomUpdate` and in every `tick` event as `{ timer, maxTimer }`. Frontend reads both from every update — no longer depends on status-change detection.
- **Configurable timings** — Host sees a collapsible "Game Settings" panel in the lobby with sliders for:
  - Role reveal time (8–30s)
  - Night action time (10–60s)
  - Discussion time (30s–5min, formatted as "2m 30s")
  - Voting time (15–90s)
  - Result display (4–15s)
  - Settings saved via `updateConfig` and stored in room config
- **Name truncation fixed** — Player bar uses `minWidth: 52` per avatar, names up to 56px wide with proper ellipsis. Name truncation in circular board extended from 8 to 10 chars. Player list uses `truncate` class not fixed `max-w-[40px]`.
- **Avatar consistency** — Complete avatar redesign:
  - Each of 25 avatars has a unique `bg`, `border`, and `emoji`
  - Avatar component uses inline styles (not Tailwind dynamic classes) — always renders correctly
  - Dead state: background → `#3f3f46`, border → `#52525b`, emoji replaced with 💀, grayscale filter, 45% opacity
  - Player bar, lobby list, night action grid, voting grid, winner screen, scores list, circular board — all use the same avatar system
  - Circular board updated: dead players show 💀 with grey circle and desaturated border
- **Citizen action "nothing happens" fixed** — citizens tracked via `CIT_<id>` key on both frontend and backend (matching keys)
- **`restartSession` backend handler** — now properly reassigns roles and starts role reveal (previously tried to re-emit to self which did nothing)

---

## 🔧 Pending

### UX / Features
- [ ] **Seating arrangement** — Host drags players into circular seat positions before game starts (PRD requirement)
- [ ] **100+ citizen questions** — Currently 50; PRD targets 100+
- [ ] **Sound effects** — Night announcement, wake-up alarm, phase transitions
- [ ] **Rules screen** — In-game rules reference accessible from menu
- [ ] **Splash screen** — 2-3s logo on app launch
- [ ] **Reconnect grace period** — Auto-remove disconnected player if they don't reconnect within 60s (currently they stay as "Offline" indefinitely)
- [ ] **Transfer host** — If host leaves mid-game, promote next player instead of ending game

### Technical
- [ ] **Android APK** — PRD targets native Kotlin. Options: WebView wrapper (easy) or full native rebuild
- [ ] **Offline/hotspot mode** — Backend must run on host device for no-internet play
- [ ] **Portrait-only lock** — Add CSS media query or `<meta>` orientation lock
- [ ] **25-player stress test** — Verify no lag/ordering issues at maximum capacity

---

## 🚀 Deployment

| Layer    | Platform | Status |
|----------|----------|--------|
| Frontend | Vercel   | ✅ Live |
| Backend  | Render   | ✅ Live (cold starts on free tier) |

**Recommended upgrade:** Move backend to **Railway** — no cold starts, 500 free hours/month.
See `RAILWAY_DEPLOY.md` for step-by-step instructions.
