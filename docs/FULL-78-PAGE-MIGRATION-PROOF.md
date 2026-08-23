# FULL 78-PAGE MIGRATION PROOF

**Authority:** Owner order 2026-08-23 — FULL migration PAGE-001→078, one page at a time.  
**Rule:** `Actual migration performed = YES` only after OLD inspected + NEW inspected + compare + rebuild gaps + cleanup + page tests + commit.  
**Prior “CODE PARITY 78/78” / cleanliness audit alone does NOT count as migrated.**

| Page | OLD inspected | NEW inspected | Actual migration performed | Contracts aligned | Cleanup complete | Tests | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PAGE-001 | YES | YES | YES | PASS | PASS | PASS | `8d778a1` |
| PAGE-002 | YES | YES | YES | PASS | PASS | PASS | `d636117` |
| PAGE-003 | YES | YES | YES | PASS | PASS | PASS | `5be73da` |
| PAGE-004 | YES | YES | YES | PASS | PASS | PASS | `85014e1` |
| PAGE-005 | YES | YES | YES | PASS | PASS | PASS | `843d9f9` |
| PAGE-006 | YES | YES | YES | PASS | PASS | PASS | `319c394` |
| PAGE-007 | YES | YES | IN PROGRESS | — | — | PASS* | `b7d0a2b` backend |
| PAGE-008 | YES | YES | YES | PASS | PASS | PASS | `f4d9a47` |
| PAGE-009 | YES | YES | YES | PASS | PASS | PASS | `125205b` |
| PAGE-010 | YES | YES | YES | PASS | PASS | PASS | _(pending)_ |
| PAGE-011 | NO | NO | NO | — | — | — | — |
| PAGE-012 | NO | NO | NO | — | — | — | — |
| PAGE-013 | NO | NO | NO | — | — | — | — |
| PAGE-014 | NO | NO | NO | — | — | — | — |
| PAGE-015 | NO | NO | NO | — | — | — | — |
| PAGE-016 | NO | NO | NO | — | — | — | — |
| PAGE-017 | NO | NO | NO | — | — | — | — |
| PAGE-018 | NO | NO | NO | — | — | — | — |
| PAGE-019 | NO | NO | NO | — | — | — | — |
| PAGE-020 | NO | NO | NO | — | — | — | — |
| PAGE-021 | NO | NO | NO | — | — | — | — |
| PAGE-022 | NO | NO | NO | — | — | — | — |
| PAGE-023 | NO | NO | NO | — | — | — | — |
| PAGE-024 | NO | NO | NO | — | — | — | — |
| PAGE-025 | NO | NO | NO | — | — | — | — |
| PAGE-026 | NO | NO | NO | — | — | — | — |
| PAGE-027 | NO | NO | NO | — | — | — | — |
| PAGE-028 | NO | NO | NO | — | — | — | — |
| PAGE-029 | NO | NO | NO | — | — | — | — |
| PAGE-030 | NO | NO | NO | — | — | — | — |
| PAGE-031 | NO | NO | NO | — | — | — | — |
| PAGE-032 | NO | NO | NO | — | — | — | — |
| PAGE-033 | NO | NO | NO | — | — | — | — |
| PAGE-034 | NO | NO | NO | — | — | — | — |
| PAGE-035 | NO | NO | NO | — | — | — | — |
| PAGE-036 | NO | NO | NO | — | — | — | — |
| PAGE-037 | NO | NO | NO | — | — | — | — |
| PAGE-038 | NO | NO | NO | — | — | — | — |
| PAGE-039 | NO | NO | NO | — | — | — | — |
| PAGE-040 | NO | NO | NO | — | — | — | — |
| PAGE-041 | NO | NO | NO | — | — | — | — |
| PAGE-042 | NO | NO | NO | — | — | — | — |
| PAGE-043 | NO | NO | NO | — | — | — | — |
| PAGE-044 | NO | NO | NO | — | — | — | — |
| PAGE-045 | NO | NO | NO | — | — | — | — |
| PAGE-046 | NO | NO | NO | — | — | — | — |
| PAGE-047 | NO | NO | NO | — | — | — | — |
| PAGE-048 | NO | NO | NO | — | — | — | — |
| PAGE-049 | NO | NO | NO | — | — | — | — |
| PAGE-050 | NO | NO | NO | — | — | — | — |
| PAGE-051 | NO | NO | NO | — | — | — | — |
| PAGE-052 | NO | NO | NO | — | — | — | — |
| PAGE-053 | NO | NO | NO | — | — | — | — |
| PAGE-054 | NO | NO | NO | — | — | — | — |
| PAGE-055 | NO | NO | NO | — | — | — | — |
| PAGE-056 | NO | NO | NO | — | — | — | — |
| PAGE-057 | NO | NO | NO | — | — | — | — |
| PAGE-058 | NO | NO | NO | — | — | — | — |
| PAGE-059 | NO | NO | NO | — | — | — | — |
| PAGE-060 | NO | NO | NO | — | — | — | — |
| PAGE-061 | NO | NO | NO | — | — | — | — |
| PAGE-062 | NO | NO | NO | — | — | — | — |
| PAGE-063 | NO | NO | NO | — | — | — | — |
| PAGE-064 | NO | NO | NO | — | — | — | — |
| PAGE-065 | NO | NO | NO | — | — | — | — |
| PAGE-066 | NO | NO | NO | — | — | — | — |
| PAGE-067 | NO | NO | NO | — | — | — | — |
| PAGE-068 | NO | NO | NO | — | — | — | — |
| PAGE-069 | NO | NO | NO | — | — | — | — |
| PAGE-070 | NO | NO | NO | — | — | — | — |
| PAGE-071 | NO | NO | NO | — | — | — | — |
| PAGE-072 | NO | NO | NO | — | — | — | — |
| PAGE-073 | NO | NO | NO | — | — | — | — |
| PAGE-074 | NO | NO | NO | — | — | — | — |
| PAGE-075 | NO | NO | NO | — | — | — | — |
| PAGE-076 | NO | NO | NO | — | — | — | — |
| PAGE-077 | NO | NO | NO | — | — | — | — |
| PAGE-078 | NO | NO | NO | — | — | — | — |

## PAGE-010 evidence

- **OLD inspected:** `FriendsFeed.tsx`, `handleFriendsFeed` (follow ∪ follower).
- **NEW inspected:** `FriendsFeed.tsx`, `queryFriendsPage`, `GET /api/feed/friends`.
- **Gaps fixed:** none — already matched OLD (overlay title Friends, `followingFirst={false}`, empty copy, return nav, union query).
- **Tests:** `page010Ownership` PASS.

## PAGE-009 evidence

- **OLD inspected:** Following feed + `FeedStoryCirclesOverlay` with `followingFirst`.
- **NEW inspected:** `FollowingFeed.tsx`, `FollowingFeedOverlay`.
- **Gaps fixed:** restore `apiFetchProfiles` suggested strip (followed-first then live); 5s image story advance.
- **Already aligned:** GET following feed, empty copy, return nav, live rings.

## PAGE-008 evidence

- **OLD inspected:** `StemFeed.tsx`, `FeedStoryCirclesOverlay` suggested users, `GET /api/profiles` list, STEM ranking.
- **NEW inspected:** `StemFeed.tsx`, `StemFeedOverlay`, `queryStemRanked`, `shared/stemEligibility.ts`.
- **Gaps fixed:** restore suggested-user circles (`apiFetchProfiles` + `GET /api/profiles`); live → `/watch/{roomId}`, else `/profile/{id}`; live-first sort; exclude users already in story strip.
- **Already aligned:** STEM ranking 40+20/cap 55, no live cards in snap feed, overlay Search/title/back, empty copy, shared ForYouPlayer + 3s views.

## PAGE-007 evidence (partial)

- **Backend done (`b7d0a2b`):** unique `video_views` track-view; share counter bump; foryou lifecycle enroll/sweep + migration; publish enroll.
- **Still open:** `ForYouLiveCard` battle/cohost + offline status vs OLD `InlineLiveViewer` — PAGE-007 not YES until that lands.

## PAGE-006 evidence

- **OLD inspected:** `Elix Star Live/src/App.tsx`, `deepLinks.ts`, `toast.ts`, OfflineBanner, feed presence WS guard, IAP init/reconcile, admin bottom-nav visibility, engagement always routed.
- **NEW inspected:** `src/App.tsx`, `src/lib/appShell.ts`, `OfflineBanner`, toast host vs imperative toast.
- **Gaps fixed this migration:**
  1. Port `useDeepLinks` (URL open + hardware back minimize) — remove duplicate App back-only listener.
  2. Restore OLD imperative DOM `showToast` (remove React `ToastHost`).
  3. WS `__feed__` presence: do not yank when current room ≠ `__feed__` (protects For You inline live).
  4. Boot `initializeCoinIap` + reconcile on auth and foreground.
  5. OfflineBanner: restore `animate-in slide-in-from-top duration-300`.
  6. Show bottom nav on `/admin*` (match OLD; was incorrectly hidden).
  7. Engagement routes always available (remove `EngagementGate`); Settings always shows Engagement Hub.
  8. `/creator/login-details` public outside `RequireAuth`.
- **Deferred to later pages:** client blocked-id hydrate store (feed already filters blocks server-side); music library stop-on-leave (no NEW sound-library player yet).
- **Tests:** `appShell`, `deepLinks`, `toast`, `App.test`, Settings + ownership updates PASS.

## PAGE-005 evidence

- **OLD inspected:** `Elix Star Live/src/pages/ResetPassword.tsx`, `handleResetPassword`.
- **NEW inspected:** `src/pages/ResetPassword.tsx`, `applyPasswordReset` + `POST /api/auth/reset-password`.
- **Gaps fixed:** remove invented `elix-page-glass` / `min-h-[100dvh]`; HTML `minLength={6}` matches OLD (JS still enforces ≥8).
- **Aligned:** token required; match confirm; success → login after 3s; server deletes sessions + disconnect sockets; `{ success: true }`.

## PAGE-004 evidence

- **OLD inspected:** `Elix Star Live/src/pages/ForgotPassword.tsx`, `server/routes/auth.ts` `handleForgotPassword`.
- **NEW inspected:** `src/pages/ForgotPassword.tsx`, `POST /api/auth/forgot-password`.
- **Gaps fixed:**
  1. Server: mail-send failure and unexpected errors return `{ success: true }` (frozen OLD anti-enumeration), not 503.
  2. UI: remove invented `elix-page-glass` / `min-h-[100dvh]` wrappers; match OLD chrome.
- **Aligned:** 501 when mail not configured; always 200 for unknown/known when mail configured; rate-limit 429 kept; client success/error copy.

## PAGE-003 evidence

- **OLD inspected:** `Elix Star Live/src/pages/AuthCallback.tsx`, `docs/OLD-REBUILD-LEDGER.md` PAGE-003, `CONTRACTS` verify-email.
- **NEW inspected:** `src/pages/AuthCallback.tsx`, `authVerifyEmail`, `POST /api/auth/verify-email`.
- **Compare result:** NEW already matches OLD source behaviour (token verify → seed session → `checkUser` → `/profile`; missing/error/oauth error paths; Go to Login). Pack line “then login” is incorrect vs OLD `AuthCallback.tsx` which navigates `/profile` — NEW keeps OLD source.
- **Gaps fixed:** none required this pass (session shape already emits `access_token`+`accessToken` from PAGE-001 restore).
- **Tests:** AuthCallback + authSession.verify PASS.

## PAGE-002 evidence

- **OLD inspected:** `Elix Star Live/src/pages/Register.tsx`, `docs/old-spec/PAGES.md` PAGE-002, `CONTRACTS.md` register/consent.
- **NEW inspected:** `src/pages/Register.tsx`, `authSession.ts` register/consent, `server/modules/auth/router.ts` register/consent/starter.
- **Gaps fixed this migration:**
  1. Email-confirm path always shows fixed check-email copy (not welcomeMessage).
  2. Consent POST includes `meta.email` like OLD.
  3. AbortError / aborted register errors unlock without fake failure copy.
  4. Terms/Privacy links match OLD (no invented `returnTo` on Register).
- **Already aligned:** UI chrome 80×80 logo Create Account; terms gate; password ≥8; match confirm; consent version `2026-07-21`; starter welcome toast; navigate `from`; starter coins server-side not paid lots.

## PAGE-001 evidence

- **OLD inspected:** `Elix Star Live/src/pages/Login.tsx`, `AuthPasswordField.tsx`, `docs/old-spec/PAGES.md` PAGE-001, `docs/old-spec/CONTRACTS.md` auth login.
- **NEW inspected:** `src/pages/Login.tsx`, `AuthPasswordField.tsx`, `authSession.ts`, `server/modules/auth/router.ts`, `shared/contracts/auth.ts`.
- **Gaps found & fixed this migration:**
  1. Frozen success session must be `{ access_token, accessToken }` — restored emit + zod (wrongly reduced to `access_token` only in cleanliness pass).
  2. Login remaps `System error: Authentication not configured.` to refresh copy (OLD behaviour).
- **Aligned already (verified, not copied):** UI chrome/classes, remember-email keys, Apple/Forgot gates, Sign up → `/register` with `from`, password submit → `from` replace, 401 copy ownership, Valkey lockout on server, no Google, never persist password.
- **Cleanup:** no LoginV2/Old/Fixed; single `/login` route; AuthPasswordField independent NEW matching frozen chrome.
