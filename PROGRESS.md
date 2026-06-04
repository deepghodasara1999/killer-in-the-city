# Killer In The City — Development Progress

> Last updated: 2025-06 | Branch: main

---

## ✅ Done (Iteration 1 — Core Bug Fixes)

### Backend (server.js) — Complete Rewrite
- [x] **Role privacy** — `broadcastRoom()` now sends each player only what they are allowed to see. Other players' roles are `null` during active play; roles are only revealed when the game ends (`WINNER` state).
- [x] **Reconnect logic** — Players who refresh or lose connection can reconnect using their saved `roomId` + `playerId` (stored in `sessionStorage`). Their socket reference is updated server-side.
- [x] **Persistent player ID** — Each player gets a stable `playerId` (`p_<socketId>`) distinct from the socket ID, so reconnects work even with a new socket.
- [x] **Night phase timer** — Night actions now have a configurable timeout (`questionTime`, default 20s). When it expires, missing actions are auto-filled (random target for Killer/Angel, "Not Sure" for Detective).
- [x] **Early resolution** — Night phase ends immediately once all active roles submit, without waiting for the timer.
- [x] **Voting early resolution** — Voting ends immediately once all alive players vote.
- [x] **Angel saves Detective** — Fixed: detective wrong-guess death cannot be prevented by Angel (PRD rule correctly implemented).
- [x] **Tie handling** — Tie vote → no one dies, game continues.
- [x] **Win condition check** — Properly checked after night resolution AND after voting elimination.
- [x] **Score distribution** — Killer +2, Detective ID +2, City vote win +1 to alive non-killers.
- [x] **Host disconnect** — Emits `hostLeft` event to all clients; room is deleted.
- [x] **Non-host disconnect** — Player marked `connected: false`; game continues (grace period).
- [x] **Player removal by host** — Cancels current session, resets to LOBBY.
- [x] **Host controls** — Pause, Resume, Restart Session, End Game, Remove Player.
- [x] **`startNextSession`** — Keeps scores, resets alive status and roles, starts new session.
- [x] **Health endpoint** — `GET /health` for uptime monitoring.

### Frontend (App.js) — Complete Rewrite
- [x] **Loading spinner on join/host** — Button shows spinner while waiting for server response.
- [x] **Error messages** — All server errors (`joinError`) displayed inline, not as alerts.
- [x] **Session persistence** — `sessionStorage` saves `roomId` + `playerId`. On page refresh, the app auto-reconnects to the existing game.
- [x] **Proper "waiting" screen** — After joining, players see a lobby screen instead of being stuck on the join page.
- [x] **Lobby screen** — Shows game code prominently, lists all players, live updates as people join.
- [x] **Role reveal screen** — Private reveal: tap to see role, auto-hides after 5s, countdown shown.
- [x] **Night phase UI** — Role-specific action screen (Killer target, Angel protect, Detective inspect or "Not Sure"), Citizen gets distraction question with options.
- [x] **"Submitted" state** — After submitting night action or vote, player sees confirmation instead of action buttons (prevents double submission).
- [x] **Spectator screen** — Dead players see a spectator message instead of action screens.
- [x] **Discussion screen** — Shows circular board + night result message.
- [x] **Voting screen** — One-vote enforcement with visual confirmation.
- [x] **Voting result screen** — Shows who voted for whom before next round starts.
- [x] **Winner screen** — Shows winner, killer reveal, scores. Host can start next session or end game.
- [x] **Game ended screen** — Final leaderboard shown after host ends the game.
- [x] **Circular SVG board** — Visual seating layout using SVG, dead players shown with cross + greyed out.
- [x] **Timer progress bar** — Visual bar under header showing time remaining.
- [x] **Host control panel** — Pause, Resume, Restart, End Game overlay for host only.
- [x] **Dark theme + consistent design** — Tailwind-based dark UI with role-colour coding.
- [x] **Avatar system** — 25 emoji/colour avatars, unique per player.
- [x] **`socket.on` cleanup** — Socket created once in `useEffect`, handlers not duplicated.
- [x] **`me` null safety** — Loading screen shown if player not yet found in room state.

---

## 🔧 In Progress / Pending

### Phase 2 — PRD Features Not Yet Built
- [ ] **Seating arrangement screen** — PRD requires host to manually assign physical seats via circular drag UI before game starts (currently players are auto-positioned).
- [ ] **Game configuration screen** — UI for host to adjust `discussionTime`, `votingTime`, `questionTime`, `sleepDuration`, `resultDuration`, `detectiveMode` before starting.
- [ ] **"City Sleeps" sleep phase** — PRD calls for a dedicated sleep screen with audio cue after answers submitted.
- [ ] **Detective mode config** — Toggle between Always/Random detective; currently always included for 6+ players.
- [ ] **25 avatars** — Currently emoji set, should be expanded to full 25 distinct avatars.
- [ ] **100+ citizen questions** — Currently only 15 distraction questions. PRD requires 100+.
- [ ] **Leaderboard / statistics screen** — Sessions played, sessions won, killer assignments, detective saves, survival count, votes cast/received.
- [ ] **Rules & Scoring screen** — Accessible from main menu and during game.
- [ ] **"About" screen** — Informational page.
- [ ] **Splash screen** — Logo screen on launch (2–3 seconds).
- [ ] **Sound effects** — City sleeps announcement, wake-up alarm, phase transition sounds.
- [ ] **Duplicate name disambiguation** — PRD allows duplicate names but recommends internal `playerId` — already using `playerId` internally ✅, but UI could show avatar to differentiate.
- [ ] **Transfer Host** — PRD marks as future/optional; not built.

### Phase 3 — Polish & QA
- [ ] **Android APK** — PRD targets Android native (Kotlin + Jetpack Compose + MVVM). Current implementation is a web app. Options: wrap in a WebView APK, or rebuild natively.
- [ ] **Offline / hotspot mode** — PRD requires fully offline via local Wi-Fi hotspot. Current deployment uses Render (internet). To go fully offline, backend must be bundled or run on the host device.
- [ ] **Portrait-only enforcement** — CSS media query or manifest.
- [ ] **Battery optimisation** — Reduce socket polling frequency during idle states.
- [ ] **25-player stress test** — Verify no lag with max players.
- [ ] **Edge case: player removes mid-night** — Currently restarts session; UX could be smoother.
- [ ] **Reconnect timeout** — If disconnected player doesn't reconnect within X seconds, auto-remove.
- [ ] **Input validation hardening** — Name length limits, code injection prevention.

---

## 🐛 Known Issues (Post Iteration 1)
- Night phase phrase for DETECTIVE not yet scoped to the correct player — `room.phrase` is sent per-player from backend ✅ but frontend reads `room.phrase?.text` which only works correctly now with server-side scoping.
- If host pauses during NIGHT, the resume restarts DISCUSSION timer (correct), but remaining night timer is lost — acceptable for V1.
- `startNextSession` currently re-uses socket emit path which may have a timing issue; needs QA.

---

## 🚀 Deployment
| Service  | Platform | URL |
|----------|----------|-----|
| Frontend | Vercel   | Auto-deployed from `/frontend` |
| Backend  | Render   | `https://killer-in-the-city-ihef.onrender.com` |

> **Render cold start**: Render free tier spins down after inactivity (~15 min). First connection may take 30–60s. Consider adding a cron ping or upgrading to Render Starter ($7/mo) for always-on.
>
> **Better free options**: [Railway](https://railway.app) (500 free hours/mo, no cold start sleep) or [Fly.io](https://fly.io) (3 free VMs) are better than Render free for WebSocket backends.

