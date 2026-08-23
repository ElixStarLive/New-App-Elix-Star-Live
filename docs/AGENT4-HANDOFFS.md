# Agent 4 — Core + Integration Handoffs

**Owner:** Agent 4 (`agent4/core-integration`)  
**Updated:** 2026-08-23  
**Phase:** A (shared-core fixes while Agents 1–3 work pages)

Merge-back: `/apply-worktree` · Cleanup: `/delete-worktree`

---

## Phase A commits (this branch)

Shared contracts that `index.ts` already exported but were missing from git tip are now on-branch. Shell/call/session infra required by `App.tsx` / auth store is committed. See git log on `agent4/core-integration`.

---

## Fixed on Agent 4 (do not re-implement)

| Area | Fix |
| --- | --- |
| `shared/contracts` | Added missing modules: `inbox`, `alerts`, `calls`, `hearts`, `promote`, `risingStars` (index already exported them → tip was broken) |
| `shared/contracts/money.ts` | Wallet wire shape without test coins; separate `testCoinBalanceSchema`; creator withdraw/payout schemas |
| `shared/contracts/realtime.ts` | Dropped duplicate `stream_start` / `stream_end`; keep `stream_started` / `stream_ended` |
| `shared/contracts/live.ts` | Optional `displayName` / `room` on live start body |
| `shared/*` helpers | `hashtag`, `stemEligibility`, `uploadContract`, `searchCategories`, `cameraOptions` |
| PAGE-006 `settingsNav` | Named exits for legal, shop item→shop, purchase-coins, creator-login, music, live discover, report, admin |
| `livekitSession` | `switchCamera` + `publishFromStream` |
| Call signals stack | `callSignals`, `callToken`, `videoCallSession` + aligned `useCallStore` (App shell bind) |
| Auth isolation | `accountIsolation`, `useTestCoinsStore`, device token API/session |

---

## Incoming blockers for Agents 1–3 (page owners)

### Agent 1 (PAGE-001–026)

| ID | Blocker | Owner action |
| --- | --- | --- |
| H1 | Tip `App.tsx` lazy-imports `@/pages/OwnProfile`, `Followers`, `FollowingList` but those files are **not on git tip** (exist only as untracked in main WT). | Commit page modules on `agent1/pages-001-026` |
| H2 | `FeedScreen` still used by Following/Friends/STEM/Saved/Hashtag pages but expects missing `FeedPage` type and `items/nextCursor` shape; `feedApi` correctly uses OLD `videos` / relation feed contracts and **rejects** items/nextCursor. Main WT deletes `FeedScreen`. | Finish feed page rewrite to ForYou/relation owners — do **not** invent parallel `FeedPage` in contracts |
| H3 | Shared components still imported by feed/live pages but missing from tip: `StoryGoldRingAvatar`, `royce`, `ReportModal`, `ShareModal`, `PromotePanel` | Commit or stop importing; Agent 4 will not invent UI |

### Agent 2 (PAGE-027–052)

| ID | Blocker | Owner action |
| --- | --- | --- |
| H4 | Call **UI** pages (`VideoCall`, `IncomingCallModal`) remain locked; Agent 4 committed signal/session store only. Verify page wiring against new `useCallStore` statuses (`connected` not `active`). | Align locked pages only if owner explicitly orders; otherwise verify tests |
| H5 | Inbox/Alerts/Chat consume `shared/contracts/inbox` + `alerts` + `calls` now on Agent 4 branch — merge Agent 4 first or cherry-pick contracts | Prefer merge Agent 4 contracts before page commits |

### Agent 3 (PAGE-053–078)

| ID | Blocker | Owner action |
| --- | --- | --- |
| H6 | Rising Stars / promote / hearts contracts now on Agent 4 — use these schemas; do not fork duplicates | Import from `@shared/contracts` |
| H7 | Admin / engagement pages may need content modules still untracked on tip | Commit page content under Agent 3 branch |

---

## Shared-core known state (Agent 4)

| System | Status |
| --- | --- |
| `wsClient` singleton | PASS unit tests (owner handoff, room switch, pending flush, reconnect token) |
| `appShell` | PASS unit tests |
| `settingsNav` / hardware back | PASS unit tests (extended exits) |
| `authSession` login/register | PASS unit tests |
| Call signals / videoCallSession | PASS unit tests |
| Device token API/session | PASS unit tests |
| Contracts suite | PASS unit tests |
| Feed presence in `App.tsx` | Owner `app-feed-presence` on `__feed__`; releases on live session paths; leaves non-`__feed__` preview rooms alone |
| Client-local WS events `ws_error` / `ws_reconnect_exhausted` | Dispatched by `wsClient` only; **not** wire events — intentionally absent from `wsEventNameSchema` |
| FIND-001 duplicate `/creator/login-details` | Already single route on tip — no fix needed |
| Full `tsc -b` | **NOT PASS** until Agents 1–3 commit missing page modules (expected Phase B) |
| Neon/Valkey/LiveKit runtime gates | Phase B — not claimed ready |
| Android/iOS device | NOT VERIFIED |

---

## Phase B (Agent 4 only)

1. Merge `agent1/pages-001-026`, `agent2/pages-027-052`, `agent3/pages-053-078` into this branch by **ownership** (not “make compile green”).
2. Resolve H1–H7 with page owners’ commits.
3. Gates: typecheck, lint, full vitest, production build, migration check if needed, server health, WS/auth/session smoke.
4. Only then declare **APP READY FOR RELEASE — PROVEN** or **NOT READY** with remaining blockers.

Do not invent readiness.
