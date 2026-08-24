# OLD production master specification (frozen)

**Master ledger status: COMPLETE**  
**NEW rebuild has not started. Do not inspect or modify NEW product code. Do not open PAGE-001 until the owner orders it.**  
**Do not classify NEW screens as reusable in this audit. That is a NEW-stage decision after this specification is frozen.**

**Source (read-only):** `C:\Users\Absm Construction\Desktop\Elix Star Live`
**Frozen OLD commit:** `a1c9b11ed3cc47c8a858430076864ac9e7ebbc84`
**Write target later:** `C:\Users\Absm Construction\Desktop\New App Elix Star Live` only  
**Date:** 2026-08-20

OLD is **what must exist and how it must look and behave**. OLD source is **not** an implementation to paste. **Do not copy OLD files, components, hooks, handlers, services, architecture, or implementations into NEW.**

Numbered HTTP/WS/table proof: [docs/old-spec/PROOF-INVENTORIES.md](./old-spec/PROOF-INVENTORIES.md). JSON contracts: [docs/old-spec/CONTRACTS.md](./old-spec/CONTRACTS.md).

Visual pixel CSS for huge screens (Live Host, feed player, locked pages) is **not** class-copied here. The named OLD file is the visual authority when that ID is rebuilt. Every **action, route, API, WS event, table, money rule, and parity test** required to rebuild without guessing is in this file.

---

## Proven counts (enumerated from OLD)

| Item | Count | Proof |
| --- | ---: | --- |
| Pages/screens (PAGE-001–078) | 78 | this file |
| Overlays/modals (MODAL-001–036) | 36 | this file |
| Cross-page flows (FLOW-001–032) | 32 | this file |
| REST endpoints (method + path) | 262 | PROOF-INVENTORIES |
| WebSocket contracts (directional) | 97 | 41 in + 54 out + 2 client-local |
| LiveKit flows | 12 | PROOF-INVENTORIES |
| DB/migration dependencies | 196 | 65 SQL files + 131 tables |
| Valkey contracts | 62 | PROOF-INVENTORIES |
| Webhooks + background jobs | 15 | 4 webhooks + 11 jobs/timers |

Unresolved OLD behaviour: **NONE** (UI pixels = named OLD file).  
Missing references: **NONE**.

---

## Hard architecture contracts (must hold on every related page)

These are production rules, not style preferences.

### Stack
- React 18 + Vite + Tailwind + Zustand + Capacitor 8.
- Express + pg (Neon in production; NEW local Postgres is **not** OLD Neon) + Valkey + LiveKit + Bunny.
- Do not introduce Supabase, Appwrite, Railway, Netlify, Ghost, DigitalOcean, Firebase.

### Money (never mix)
- **In-app coins:** Apple IAP and Google Play Billing only (`POST /api/verify-purchase` + store webhooks). Not Stripe.
- **Shop / web merchandise checkout:** Stripe only. Stripe Connect for creator GBP payouts. Not IAP.
- **Paid gifts:** REST `POST /api/gifts/send` **settles first**, then WS `gift_sent` fans out. Client WS `gift_sent` is not paid settlement.
- **FIFO lots:** debit `elix_paid_coin_lots` oldest first. Creator **60%** / platform **40%** of **net pence**. Integer pence; floor to creator, remainder platform (`giftCreatorPct: 60`).
- **Test coins:** login + `TEST_COINS_ISSUE_PASSWORD`; Valkey `test_coins:balances`; animation + battle score only; never IAP, Stripe, GBP, lots, 60/40, payouts, or Neon money tables. Debit fail-closed if Valkey unavailable.
- **Promotional / starter coins:** separate balances. Server must not return one merged coin number as truth.
- **LIVE LIKE TAP:** +1 `live_likes`, unlimited, £0, no battle score.
- **BATTLE SCREEN TAP:** +5 once per unique viewer per battle, £0, source `tap`.
- **TEST-COIN GIFT:** animation + battle score, £0.
- **PAID-COIN GIFT:** animation + battle score + 60/40.
- **Promote Video IAP:** platform keeps 100% of net.
- **Membership IAP:** SKU `com.elixstarlive.membership`; Play auto product `elix.creator.<hex>`.
- **Refunds/reversals:** Apple/Google webhooks + admin `POST /api/admin/monetisation/settlements/reverse`. Fail closed. Unwind lots and earnings.
- **Withdrawals:** available vs locked vs pending; Connect; admin rails; reserved amounts stay reserved until honest terminal state.
- Register grants 50,000 starter coins — not paid lots.

### Live / realtime
- **Co-host:** **8 seats + host**. Valkey seat table with per-room lock `cohost:lock:{room}`. Layout/featured is presentation only, not membership.
- **Battle:** types `1x1` / `2x2`. Seats host / opponent / player3 / player4. Teams host+player3 vs opponent+player4. Duration **300s server clock** (`battle:tick:{roomId}`). Scores: paid_gift | promotional_gift | test_gift | tap. Boosters multiply a gift, not a score source.
- **Spectators:** independent subscribe. Identity `{userId}__v_{12hex}`. Host publishes as `userId`. Feed live cards from **server**, not local leftover presence.
- **Host WS drop:** 20s grace then end live. Spectator leave never ends stream. Battle participant same grace; reconnect cancels grace.
- **WS URL:** `{VITE_WS_URL}/live/{roomId}?token=&audienceCreatorId?`. Ping 25s. Reconnect max 15. Join order: connected → room_state → cohost_layout_sync → queued cohost_request → battle_state_sync → gift_goal_sync → engagement_sync.
- **LiveKit:** server AccessToken only. Publish only if `resolveLivePublishAuthority` (or `call_*`). TTL 6h. Webhook is idempotent authority for room end, not a process-local timer.
- **Bunny:** `videos|stories|avatars|shop|thumbnails/<userId>/`. Copyright scan can reject (`AUDIO_BLOCKED`).
- Stories expire 24h.

### Auth / session
- Email or username + password. Apple when enabled. **No Google login.**
- Guest exists on server (`POST /api/auth/guest`) and is **403 in production**; **not on Login UI**.
- Session JWT bound to live session row. Logout revokes. `GET /api/auth/me` restores. 401 anywhere → login with `from` (FLOW-028).
- Consent version `2026-07-21`.
- 2FA is Security settings, not Login first paint.
- Admin: `profiles.is_admin` only. One gate.

### Permissions / process
- Camera/mic/notifications: deny is a real error.
- Foreground: `/me`, WS reconnect, IAP reconcile.
- Production without Valkey: rate limits and locks fail closed.
- Jobs via Valkey queue, not memory as multi-instance authority.

---

## Recording contract (every PAGE / FLOW / MODAL)

Each ID records: what happens; buttons/actions; navigation; who owns state (client UI vs Neon vs Valkey vs LiveKit vs WS); contracts; loading/empty/error/session-expiry; permissions/fg-bg/disconnect; money and moderation notes; how parity will be tested. Visual match = named OLD file.

Statuses for later NEW work (not used in this audit): `LEDGER` | `INSPECTING` | `REBUILDING` | `GATED` | `DONE`. All IDs are **LEDGER**. PAGE-001 is **not open**.

---

# PAGE specifications

### PAGE-001 Login
- **Route:** `/login` public. Bottom nav hidden.
- **OLD visual authority:** `src/pages/Login.tsx`, `src/components/AuthPasswordField.tsx`, `src/store/useAuthStore.ts`, `src/lib/authFeatures.ts` (do not copy).
- **What happens:** User submits email-or-username + password. Server authenticates, issues JWT + session row + cookie. Client stores session, hydrates `GET /api/auth/me`, navigates `from` (default `/`, App sends authed users to `/feed`). Remember-email writes `login_saved_email` / `login_save_details` only. Never persist password. Delete legacy `login_saved_password`. Double-submit blocked. Abort ignored if unmounted. Apple Sign-In only when `isAppleSignInEnabled()`: iOS native `POST /api/auth/apple/native`; web `POST /api/auth/apple/start` if used. **No Google login. Guest is not on this UI.** Login does **not** collect TOTP (2FA is PAGE-042).
- **Buttons/actions:** Sign in; Remember email; Sign up; Sign in with Apple (if enabled); Forgot your password? (if reset enabled).
- **Navigation:** Sign up → `/register` with `{ from }`. Forgot → `/forgot-password`. Success → `from` replace. Authed visit → App redirects `/feed`.
- **State owner:** Client owns form/UI. Neon owns users/sessions/profiles. Valkey owns lockout `auth:login:fail:{hash}` (unreadable → refuse). JWT is session-bound.
- **Contracts:** `POST /api/auth/login` body `{ email, password }` (`email` may be username). 200 `{ user, session: { access_token, accessToken }, profile_meta }` + cookie. 401 same copy (decoy hash). 403 unconfirmed if mail configured. 403 suspended. 429 lockout. 503 DB missing.
- **Loading/empty/error/auth-expiry:** submitting disables button; rose inline error; no empty state; unauthenticated is the page.
- **Permissions / fg-bg:** none. Unmount abort ignored.
- **Parity tests:** email login; username login; wrong password same 401 copy; lockout 429; unconfirmed 403; remember email only; Apple only when flag on; no password in storage; redirect `from`; authed bounce to feed; no Google; no guest button.

### PAGE-002 Register
- **PAGE-002 status:** CODE-CLOSED / FROZEN at `c8a819b9a015b775c0fa79a374dcdfe9084eb65f`. Do **not** modify PAGE-002 unless a remaining future verification gate exposes a real defect.
- **PAGE-002 — REGISTER `/register`**
  * OLD reference inspected: YES
  * NEW implementation inspected: YES
  * CODE PARITY: **PASS**
  * SERVER CONTRACT PARITY: **PASS**
  * Patches remaining: **ZERO**
  * Workarounds remaining: **ZERO**
  * Copied OLD code remaining: **ZERO**
  * Duplicate PAGE-002 implementations remaining: **ZERO**
  * Dead replaced PAGE-002 code remaining: **ZERO**
  * Runnable PAGE-002 tests: **32/32 PASS**
  * Typecheck: **PASS**
  * Server typecheck: **PASS**
  * Lint: **PASS**
  * Production build: **PASS**
  * REST contracts: **2/2 PASS**
  * WebSocket: **N/A**
  * LiveKit: **N/A**
  * Valkey: **N/A**
  * DB/migration ownership: **PASS**
  * PAGE-001 modified: **NO**
  * PAGE-003 opened: **NO**
- Remaining verification blockers only (do **not** turn these UNVERIFIED gates into PASS; do **not** create temporary code, fake test environments, bypass auth, clear production data, or use production Neon for destructive integration testing just to make the report green):
  1. HTTP integration success path is still **UNVERIFIED / ENVIRONMENT BLOCKED** because embedded PostgreSQL cannot run under this Windows Administrator session and there is no disposable `TEST_DATABASE_URL`.
  2. iOS physical device is **UNVERIFIED / ENVIRONMENT BLOCKED**.
  3. Android PAGE-002 Register UI/runtime itself was not exercised because the device already had an authenticated session and PAGE-006 redirected `/register` to `/feed`.
  4. Valid/duplicate registration against live Neon was intentionally not run to avoid unnecessary production-account creation.
- **PAGE-002 CODE PARITY: PASS**
- **PAGE-002 FULL VERIFIED 1:1 OLD PRODUCTION PARITY: FAIL / BLOCKED**
- This FAIL is verification-only, not an outstanding known PAGE-002 code defect.
- **Route:** `/register` public.
- **OLD visual authority:** `src/pages/Register.tsx`.
- **What happens:** Create account with email, password ≥8, matching confirm, optional username, required 13+/ToS/Privacy checkbox. `POST /api/auth/register` then `POST /api/auth/consent` type `terms_privacy_and_age_13_plus` version `2026-07-21`. Grants **50,000 starter coins** (not paid lots, not IAP). If email confirm required, stay on page with check-email info (`session: null`, `confirmation_email_sent` honest). Else session + welcome toast + navigate `from`.
- **Buttons:** Create account; password eyes; terms checkbox; Login link; Terms/Privacy links.
- **Navigation:** success → `from`; Login → `/login`; terms/privacy public routes.
- **State owner:** Client form. Neon: `elix_auth_users`, profiles, `user_consents`, `starter_coin_balances`. Email job `email_send` if confirm required.
- **Contracts:** register 201 shapes in CONTRACTS.md. 409 email/username taken.
- **Parity tests:** terms gate; mismatch; short password; starter coins not in `elix_paid_coin_lots`; consent version; confirmation path visible not faked.

### PAGE-003 Verification
- **Route:** `/auth/callback` public (email links hit this; no `/verify-email` App route).
- **OLD visual authority:** `src/pages/AuthCallback.tsx`.
- **What happens:** Read verify token from URL; `POST /api/auth/verify-email` `{ token }`. Success confirms email; then login. Invalid/expired shown honestly.
- **State owner:** Neon `email_confirmed_at`. Valkey `email_confirm_sent:{email}` for resend throttle.
- **Contracts:** verify-email; optional resend-confirmation.
- **Parity tests:** valid token; expired; missing token; already confirmed.

### PAGE-004 Forgot password
- **Route:** `/forgot-password` public. Linked from Login only if `isPasswordResetEnabled()`.
- **OLD visual authority:** `src/pages/ForgotPassword.tsx`.
- **What happens:** Submit email. `POST /api/auth/forgot-password` **always 200** (no enumeration). Job `email_send` with purpose JWT.
- **Navigation:** back Login.
- **State owner:** server mail + purpose token. Client form only.
- **Parity tests:** always 200; enabled flag; empty email validation.

### PAGE-005 Reset password
- **Route:** `/reset-password` public.
- **OLD visual authority:** `src/pages/ResetPassword.tsx`.
- **What happens:** token + new password → `POST /api/auth/reset-password`. **Invalidates all sessions** (`sess:*` + `sessidx:{userId}`).
- **Parity tests:** login with new password; old JWT 401; invalid token.

### PAGE-006 App shell
- **Route:** chrome for all routes (`src/App.tsx`).
- **OLD visual authority:** `App.tsx`, `TopNav.tsx`, `BottomNav.tsx`, `ErrorBoundary`, `OfflineBanner`, `IncomingCallModal`, `LiveNotifyBanner`, `NativeDialogProvider`.
- **What happens:** Cosmic fundal; ~480px column. Public vs `RequireAuth` vs `RequireAdmin`. Unauth protected → `/login` `{ from: pathname }`. Authed on login/register → `/feed`. `/` → feed or login. `*` → `/feed`. Bottom nav Home/Friends/Create/Inbox/Profile icons 26px silver→white. Hide bottom nav on live, watch, create, upload, ai-studio, login, register, inbox thread, call. Top nav on For You: LIVE `#FF2D55`, STEM, Explore, Following, Shop, For You + Search. Hidden while `data-user-profile-open`. Named exits via `settingsNav`; Inbox `returnTo: /inbox`; no `history.back()` for Inbox contract. Edge swipe named back. Auth spinner 40px ring. Hydrate `GET /api/auth/me`. Foreground: checkUser, WS reconnect, IAP reconcile. Global overlays always mounted.
- **State owner:** auth store (session). App owns chrome visibility. Server owns session validity.
- **Contracts:** FLOW-001, FLOW-028, FLOW-018, FLOW-019, FLOW-027.
- **Parity tests:** public list; unauth redirect; nav hide matrix; admin 403; offline banner; incoming call global.

### PAGE-007 For You
- **PAGE-007 status:** IMPLEMENTATION COMPLETE / deferred to PAGE-018 device LiveKit. Do **not** mark PAGE-007 PRODUCTION COMPLETE until a genuine NEW-server host start is visible on For You.
- **BLOCKER:** PAGE-018 LIVE HOST device/LiveKit runtime. NEW start contract is locked: server owns `roomId = host user id`; client sends `{ title }` only. Do not send a client-generated `room` to appease OLD production. Native origin is still OLD until cutover, so device Go LIVE against `www.elixstarlive.co.uk` still fails visibly. HTTP IT without LiveKit correctly returns 503 on `POST /api/live/start`. Return-gate identity/list/end tests are implemented; genuine published-host cards still need LiveKit.
- **MANDATORY RETURN GATE:** AFTER PAGE-018 PRODUCTION COMPLETE → RETURN TO PAGE-007 **BEFORE PAGE-019** AND RUN THE 5 LIVE-CARD RUNTIME CLOSURE TESTS: (1) genuine live card from active stream, (2) tap uses authoritative `roomId` → `/watch/{roomId}`, (3) feed/card unmount does not end live, (4) ended live removed from For You, (5) no ghost/duplicate card on leave/return. Do not forget or remove this blocker.
- **Route:** `/feed` authenticated. Bottom + Top nav.
- **OLD visual authority:** `src/pages/VideoFeed.tsx`, `EnhancedVideoPlayer.tsx`, `FeedStoryCirclesOverlay`, `InlineLiveViewer`, `useVideoStore.ts`. Pixel CSS is that file, not copied here.
- **What happens:** Vertical snap For You from `GET /api/feed/foryou` (ranked public videos). IntersectionObserver play/pause. Right rail: like count, comments, save, share, sound disc, more. Caption + author. Story rings. Live cards from **`GET /api/live/streams` + WS presence** — tap to join, never auto-navigate. Track view/interaction. Soundtrack on separate audio so scroll-away stops. Blocked creators stripped.
- **Buttons:** like/unlike; comments; save; share; sound; more (copy link, voice-only download, duet, QR, share, save, follow, promote IAP, report); author → profile; hashtag; live card → `/watch/:id`; stories.
- **Navigation:** TopNav tabs; Search; video → `/video/:id`; named exits.
- **State owner:** Neon videos/likes/saves/comments/views/foryou state. Valkey feed cache epoch. Live presence: Valkey `stream:` + LiveKit publishers + WS `stream_started`/`stream_ended` on **every** authenticated socket (`feed:global`). Client is display only.
- **Contracts:** GET `/api/feed/foryou`; POST track-view (one qualified view/viewer); track-interaction; video like/save/comments; GET stories; GET live/streams. FLOW-003, FLOW-004, FLOW-030, FLOW-024.
- **Loading/empty/error:** spinner; empty feed; error visible; ended lives removed.
- **Parity tests:** like toggle; comment; live card only if server live; tap live no auto-loop; pagination; private videos absent; blocked creators absent.

### PAGE-008 STEM
- **PAGE-008 status:** IMPLEMENTATION COMPLETE / deferred runtime media + release deployment gate. Own STEM contract is locked. Device playback/view qualification waits on playable NEW-server media (Helmet `Cross-Origin-Resource-Policy: same-origin` vs Capacitor `https://localhost`; placeholder `cdn.example` URLs). Same media gate as PAGE-009. Do **not** manufacture test media or rebuild STEM to paper over it.
- **Route:** `/stem`. Bottom nav. No TopNav (`isFeedNoTopBar`). STEM chrome overlay: Search · title STEM · back to For You. Stories strip initially visible.
- **OLD visual authority:** `src/pages/StemFeed.tsx` + same player overlay as For You (`EnhancedVideoPlayer` / NEW `ForYouPlayer`). Empty: 🔥 “Most viewed” / “Nothing in the global list yet. STEM uses trending views plus caption-tagged clips.” + Refresh.
- **What happens:** NEW server-authoritative feed `GET /api/feed/stem` implements the OLD qualification rule (do not invent science/technology keywords; do not use `videos.is_stem`): public + media URL + not deleted/banned/blocked; sort by views; top 40 trending; then up to 20 extra caption matches (suggestive/indecentish keyword list from OLD `suggestiveCaption`); cap 55; paginate that ranked set with `off:` cursor. Same snap/rail/engagement/views as PAGE-007. Close → For You. Search with `returnTo: /stem`. **No live cards** (STEM live content: N/A).
- **State owner:** Neon videos. Eligibility/ranking owned by the STEM feed query, not client filter of `GET /api/videos`.
- **Contracts:** GET `/api/feed/stem`; same like/comment/save/view as For You. Playback owner: `ForYouPlayer`. WS: existing `app-feed-presence` only (no second socket).
- **Parity tests:** eligible STEM only; non-STEM extras excluded except caption slots; blocked/private/deleted absent; pagination; empty/error; overlay search/back; one active video.

### PAGE-009 Following feed
- **PAGE-009 status:** IMPLEMENTATION COMPLETE / RUNTIME MEDIA DEPENDENCY DEFERRED. Not a PAGE-009 code defect. Remaining playback/view checks share PAGE-008’s test-media/environment block.
- **MANDATORY RETURN GATE:** When valid playable media is available through the NEW server, return to **PAGE-008 and PAGE-009** together and close: (1) real video playback, (2) single active-video ownership, (3) no simultaneous audio, (4) background/foreground playback, (5) qualifying 3-second view tracking.
- **Locked complete:** server-authoritative following eligibility; newest-first order; self exclusion; blocks; moderation; pagination; engagement persistence; unfollow reconciliation; PAGE-006 shell/navigation; singleton WebSocket ownership.
- **Route:** `/following`.
- **OLD visual authority:** `src/pages/FollowingFeed.tsx`.
- **What happens:** `GET /api/feed/following` relation feed. Empty when no followed videos. Stories overlay title Following. Same snap grammar.
- **State owner:** Neon follows + videos.
- **Parity tests:** only followed creators; empty; unfollow removes.

### PAGE-010 Friends feed
- **PAGE-010 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own Friends contract is locked (follow ∪ follower, not mutual-only; newest first; overlay title Friends; OLD empty copy). Shared playback/view qualification waits on the same PAGE-008/PAGE-009 NEW-server media gate. Overlay live rings wait on PAGE-018. Full story runtime waits on FLOW-004.
- **Route:** `/friends` (bottom Friends tab).
- **OLD visual authority:** `src/pages/FriendsFeed.tsx`.
- **What happens:** `GET /api/feed/friends`. Same snap + stories. Empty when no friends videos.
- **State owner:** Neon friend graph + videos.
- **Parity tests:** friends only; empty; bottom tab active.

### PAGE-011 Discover
- **PAGE-011 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own Explore contract is locked. Destination runtime waits on later pages: hashtag PAGE-013, video playback PAGE-014, music catalog PAGE-016, overlay live rings PAGE-018, public profile PAGE-025, stories FLOW-004. Shared unplayable test-media gate with PAGE-008/009. Overlay Search stays in-page (does not open PAGE-012).
- **Route:** `/discover` (Top tab Explore). Named close → `/feed`.
- **OLD visual authority:** `src/pages/Discover.tsx`.
- **What happens:** `GET /api/discover` aggregate (not For You, not `/api/feed`). Trending: public videos whose caption/hashtags match indecent-style keywords only, views desc, limit 30, full-bleed snap. Tags: server hashtag counts top 50. Top 99: weekly paid-gift coins (exclude test coins), limit 50. In-page search (`GET /api/discover/search?q=`) for users+videos; overlay Search focuses the field (does not open PAGE-012). Rising → `/rising-stars`. Music/Comedy/Gaming/Dance are in-page search shortcuts. No LIVE Discover section. No dedicated music catalog section.
- **State owner:** Neon videos + users + gift_transactions. Server ranking/eligibility/blocks.
- **Parity tests:** chrome; trending eligibility; tags order; weekly ranking; in-page search; follow; empty; error retry; handoffs.

### PAGE-012 Search
- **PAGE-012 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own Search overlay contract is locked. Destination runtime waits on PAGE-013 (not used as a Search result type; categories stay in-page), PAGE-014 video, PAGE-025 profile. Shared media gate with PAGE-008/009. Do **not** start PAGE-013 from this page.
- **Route:** `/search` (optional `?q=`). Named close honours `returnTo` (STEM → Search → STEM) else `/feed`.
- **OLD visual authority:** `src/pages/SearchPage.tsx`.
- **What happens:** Overlay sheet. Empty query: category chips (All / For You / Trending / named topics) + 3-column browse grid from `GET /api/search?category=`. Query: `GET /api/search?q=` users (20, contains username/display) + videos (30, caption/hashtags). Server blocks/privacy/moderation. Swipe or back closes. No hashtag/live/music result types. No follow on rows. Recent-search UI N/A (OLD stored but never rendered).
- **State owner:** Neon users + videos. Server ranking/eligibility.
- **Parity tests:** empty chrome; category browse not hashtag nav; 1-char query; stale race; STEM return; blocks; no-videos copy.

### PAGE-013 Hashtag
- **PAGE-013 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own hashtag grid contract is locked. Grid tap already hands `/video/:id` with `returnTo` hashtag path. Full playback/chrome on that destination is PAGE-014 (implementation complete; device/playable-media runtime still deferred with PAGE-008/009). Shared media thumbs with PAGE-008/009.
- **Route:** `/hashtag/:tag`. Named close honours `returnTo` else Discover (`/discover`).
- **OLD visual authority:** `src/pages/Hashtag.tsx`.
- **What happens:** One `GET /api/hashtags/:tag` → `{ tag, useCount, videos }`. Exact tag match after strip-one-`#` + lowercase (`car` ≠ `carpet`). Views desc then newest. Limit 100. 3-column 9:16 thumbnail grid. Empty: “No videos found for this hashtag”. Loading: “Loading...”. Error toast keeps prior videos. No follow/share/related. No snap player.
- **State owner:** Neon `videos.hashtags` text[]. Server eligibility/blocks.
- **Parity tests:** normalize; exact match; Discover handoff; video route; empty; stale tag change.

### PAGE-014 Video view
- **PAGE-014 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/video/:videoId` contract is locked: one `GET /api/videos/:id` FeedItem, server access/visibility, shared `ForYouPlayer` rail, shared 3s unique view, shared like/save/follow/share/download. Destinations not yet rebuilt: PAGE-016 Music, PAGE-025 Profile, PAGE-046 Report, FLOW-024 Promote IAP. Shared unplayable test-media + device APK with PAGE-008/009. Do **not** start PAGE-015 from this page.
- **Route:** `/video/:videoId` full-screen chrome; bottom nav still visible unless hide rule.
- **OLD visual authority:** `src/pages/VideoView.tsx` + `EnhancedVideoPlayer` (reference only — not copied).
- **What happens:** One `GET /api/videos/:id` → FeedItem. Private/blocked/deleted/banned/empty media → 404 unless owner of private. Same rail as For You via shared `ForYouPlayer`. Download = voice-only MP4 (licensed soundtrack stripped). Close honours `returnTo` else `/feed`. Loading: “Loading…”. Missing: “Video not found or unavailable.” Network: “Couldn't load this video.”
- **State owner:** Neon videos. Bunny CDN URL. Viewer liked/saved/following hydrated on the detail row.
- **Parity tests:** public play; private 404; owner sees private; blocks; deleted; banned/deleted creator; like/save/follow reload; named back.

### PAGE-015 Saved videos
- **PAGE-015 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/saved` 3-column save-time grid is locked: one `GET /api/videos/saved/list`, `video_saves` membership, same save/unsave as feeds/Video View. Video tap → PAGE-014. Device/playable-media still shared with PAGE-008/009. Do **not** start PAGE-016 from this page.
- **Route:** `/saved`. Named close honours `returnTo` else Settings (`/settings`). Bottom nav visible.
- **OLD visual authority:** `src/pages/SavedVideos.tsx` (reference only — not copied).
- **What happens:** Auth required. `GET /api/videos/saved/list?limit=&offset=` → `{ videos, limit, offset, hasMore }`. Order: `video_saves.created_at DESC`. 3-column `aspect-[3/4]` thumbnails, view count, no inline unsave. Empty: “No saved videos yet. Tap the bookmark icon on any video to save it.” Error keeps prior rows. Tap → `/video/:id` with `returnTo: /saved`.
- **State owner:** Neon `video_saves`. Server eligibility/blocks/privacy/deleted.
- **Parity tests:** empty; error ≠ empty; save-time order; pagination; unauth 401; account isolation; private/block/deleted excluded; handoff.

### PAGE-016 Music
- **NEW status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED (device Epidemic preview). PAGE-021 Create pick uses `Use this sound` / row tap when opened with `pickSound` + `returnTo: /create`, returning canonical `soundId` (not title-as-id).
- **Route:** `/music` catalog and `/music/:songId` same Sound library with featured track. Not a videos snap feed. Missing/invalid `soundId` from For You does **not** open generic `/music`.
- **OLD visual authority:** `src/pages/MusicFeed.tsx` + `SoundLibraryView` browse mode.
- **What happens:** `GET /api/music/playlists` (Epidemic collections, 60s licensed clips). In-page search `GET /api/music/search?term=`. Preview `GET /api/music/tracks/:id/preview` JSON `{ url }`. Empty-term search still returns local `sounds` rows as `items` for Create. Save bookmark is device `localStorage` (`elix_music_saved_v1`). One library `<audio>` preview; stop on leave / background. Browse has no Use-this-sound. PAGE-021 Create pick (`pickSound` + `returnTo: /create`) shows Use this sound and returns canonical `soundId`. No videos-using-sound grid.
- **Parity tests:** browse; preview play/pause; leave stops audio; unknown id keeps library; original/missing soundId no navigation; missing Epidemic key degrades honestly.

### PAGE-017 Live discover
- **PAGE-017 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED to PAGE-018 genuine LiveKit start and PAGE-019 spectator join.
- **Route:** `/live`. Bottom nav hidden. `/live/start` redirects here.
- **OLD visual authority:** `src/pages/LiveDiscover.tsx`.
- **What happens:** Lobby from `GET /api/live/streams` (Valkey stream hash + DB + LiveKit publishers). Stale rooms absent. Tap → `/watch/:streamId`. Own live via guard `/live/:id`.
- **State owner:** server presence, not client leftover.
- **Parity tests:** only publishing hosts; empty; refresh; tap watch.

### PAGE-018 Live Host
- **PAGE-018 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Host start/end/room ownership is NEW and locked. Device LiveKit publish, 20s host-drop grace (FLOW-027), and co-host/battle/gift runtimes are not built here. Spectator join/leave host-survival is owned by PAGE-019 (HTTP IT: spectator `/end` is 404 and stream remains listed).
- **PAGE-007 RETURN GATE:** After a genuine NEW-server host start (LiveKit configured), return to PAGE-007 and run the five live-card runtime closure tests, including card → `/watch/{roomId}` → PAGE-019. API identity/list/end handoff tests exist; device published-host cards are still deferred.
- **Route:** `/live/broadcast` and owner `/live/:streamId` via LiveStreamGuard. Bottom nav hidden.
- **Room owner:** SERVER. Canonical `roomId` = authenticated host user id. Client `room` is never authority; a mismatched `room` is 403.
- **OLD visual authority:** `src/features/live/host/LiveHostScreen.tsx` (~3600 lines UI). Controllers are behaviour oracles, not paste targets.
- **What happens:** `POST /api/live/start` inserts `live_streams`, Valkey `stream:{room}`, follower notify `live_started`, WS presence `stream_started`. LiveKit publish identity=**userId**. WS `stream_start`. Chat, hearts, gifts, co-host 8+1, battle 1x1/2x2, gift goal, boosters, mist, engagement, ranking, share, end. Close/end: `POST /api/live/end` + WS `stream_end` + LiveKit teardown. Host WS drop: **20s grace** then end. Persistent reconnect. Token refresh 6h. Spectator self-watch uses `__v_` identity. Battle gifts fan-out to seated creators' audiences only.
- **Buttons:** end live; mic; cam; flip; gift; share; more; spectators; ranking (all/host/opponent gifters); combo; poll; cohost invite/accept/decline/remove/feature/mute/cam/end; battle find/invite/accept/decline/start 1x1|2x2/rematch/remove slot/mute-cam per seat; gift goal; booster; mist; copy link; mini profile follow/share/watch/moderator/block.
- **State owner:** Neon live_streams + gift txns + earnings + battle_results. Valkey stream, room:*, cohost:* (lock), battle:* (server 300s clock). LiveKit media only. WS fan-out after REST gift settle.
- **Contracts:** live start/end/token/status/moderators; gifts catalog/send; wallet; test-coins; rankings; engagement; follow; block; live-share. All live WS. FLOW-006–009, 016, 017, 021, 025, 027.
- **Loading/error:** connecting; live; reconnecting; ended; battle WAITING/ACTIVE/ENDED; cohost full (9th refused); `battle_error` / failed `gift_ack` visible. Permission deny = real error, not fake video.
- **Parity tests:** start/end; reconnect within 20s keeps live; 9th cohost refused; 300s server clock; paid gift ledger then `gift_sent`; test gift score only; host crash webhook; rematch not killed by previous grace.

### PAGE-019 Live Spectator
- **PAGE-019 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Base spectator architecture is NEW: one `useSpectatorSession` owner; subscribe-only LiveKit token (`{userId}__v_{12hex}`); canonical `roomId` only; spectator leave never ends host. Device LiveKit watch against a genuine PAGE-018 publish, two independent spectator sessions, and PAGE-007/PAGE-017 live-card → watch media still need LiveKit + NEW API origin.
- **Route:** `/watch/:roomId` (`:streamId` param is the canonical PAGE-018 roomId). `/live/watch/:id` redirects here. Nested `/watch/:streamId/profile/:userId` keeps the spectator session mounted (PAGE-020 overlay stub). Bottom nav hidden.
- **Session owner:** `src/features/live/useSpectatorSession.ts`. UI (`LiveRoomScreen` role=spectator) observes it. No second LiveKit Room, no spectator token retry, no co-host republish on ordinary watch.
- **OLD visual authority:** spectator chrome already on `LiveRoomScreen` + locked GiftOverlay / GiftAnimationOverlay / LiveGiftFeedStack / Follow-on-Join. Controllers in OLD are behaviour oracles, not paste targets.
- **What happens:** Server confirms live by `room_id`, authorizes viewer (blocks/banned), issues subscribe-only token, client connects LiveKit + PAGE-006 WS owner `live-spectator`. Host A/V subscribe. Presence via room WS `addViewer` (host excluded). Hearts = `heart_sent`. Comments = `chat_message`. Gift button uses existing gift API (FLOW-006 settlement). Join = `cohost_request_send` handoff (FLOW-007). Close named. `stream_ended` → ended gate. Spectator `/api/live/:id/end` is not called.
- **Deferred:** FLOW-006 gift settlement; FLOW-007 co-host seats/publish; FLOW-008/009 battle; FLOW-017 reconnect; FLOW-025 moderation; FLOW-027 background/disconnect; device LiveKit runtime.

### PAGE-020 Live profile overlay
- **PAGE-020 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Overlay is a dedicated owner over PAGE-019: full-screen `z-[99999] bg-black`, shared `GET /api/profiles/:userId`, shared follow/unfollow, close returns to `/watch/:roomId` without a new LiveKit/token/WS. Device watch-with-overlay runtime still needs LiveKit. Video grids/tabs are PAGE-025. Co-host/battle participant taps are FLOW-007/008/009. Report destination is FLOW-025.
- **Route:** `/watch/:streamId/profile/:userId` (`:streamId` = canonical PAGE-018 `roomId`; `:userId` = selected profile, not derived from room).
- **OLD visual authority:** overlay chrome from OLD `ProfileLiveOverlay` (opaque full-screen over live) + Profile header identity/stats/Follow/Message/share. NEW does **not** mount `Profile.tsx`.
- **What happens:** One profile GET. Follow hydrates from `isFollowing` then shared POST follow/unfollow. Close/hardware back → same watch session. `stream_ended` closes overlay onto PAGE-019 ended gate. Spectator LiveKit/WS stay with PAGE-019.
- **Parity tests:** close returns to live; media does not tear; stale A→B; blocked GET 403; missing 404.

### PAGE-021 Create camera
- **PAGE-021 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. One `createCameraSession` owner on `/create`. Real getUserMedia + MediaRecorder capture; no upload from this page. Next/Post/Story cache the local blob for PAGE-022. PAGE-022 now consumes that cache (`takeCapturedCreateMedia`) and publishes through `/api/uploads/sessions`. LIVE shutter → `/live/broadcast` (PAGE-018 owns live camera). Add sound → PAGE-016 pick (`pickSound` + canonical `soundId`). Device camera/mic runtime on OUKITEL still needs a physical pass. iOS not run.
- **Route:** `/create`. Bottom nav hidden.
- **OLD visual authority:** `Create.tsx`, `ElixCameraLayout.tsx`, `CaptureShutterButton.tsx`, Create-camera CSS lock in `index.css`.
- **What happens:** Camera/mic. Close, Add sound, Upload, POST/CREATE/LIVE modes, shutter, right rail discs, silver-red text. Filters `GET /api/camera-filters`, speed `/api/speed-options`, stickers `/api/sticker-options`. LIVE shutter → PAGE-018. POST tab / Next → `/upload`. Sound pick is PAGE-016 with `soundId` query on return.
- **State owner:** `src/features/camera/createCameraSession.ts` (one stream, one recorder). Config APIs are server lists. Captured blob cache is in-memory for PAGE-022.
- **Permissions:** camera required; microphone optional (continue without mic if denied). Deny honest. Try Again is user-initiated.
- **Parity tests:** permission deny; go live; go upload; sound picker; double start/stop; flip stops previous track; empty recording is not success.

### PAGE-022 Upload
- **PAGE-022 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. One `createUploadPublishSession` owner on `/upload`. Server session in Neon `upload_sessions` → scoped Bunny PUT via `/api/uploads/sessions/:id/bytes` (no client storage secret, no client path) → `POST /:id/publish` creates the video/story row. Idempotent on `user_id + idempotency_key`. Progress is XHR bytes when length-computable; otherwise indeterminate. No `/api/videos/upload` multipart. No client FYP call. No local feed injection. Copyright audio scan (`AUDIO_BLOCKED`) is deferred (NEW has no scan pipeline). Duet persist is deferred (no duet columns). Device publish on OUKITEL not run on this binary (signed release must not be overwritten by debug). iOS not run. Background native upload is not in OLD and is deferred (FLOW-027).
- **Route:** `/upload` (`?type=story` for stories). Bottom nav hidden. Named close → `/feed`. Story success → `/friends`. Video success → `/feed`.
- **OLD visual authority:** `src/pages/Upload.tsx` compose fields (caption, hashtags, Post / Your Story, progress). Camera chrome stays PAGE-021. AI Studio stays PAGE-023.
- **What happens:** PAGE-021 cache or gallery file → caption + hashtags → server-owned upload session → Bunny object → Neon video/story. Hashtags merged server-side (caption + field, lowercase, max 20, Unicode). Privacy `public` from UI (server also accepts `private`). `soundId` preserved when canonical. Comments/download/location/mentions: not in OLD Upload. Cover: server leaves `thumbnail_url` null (no fake cover). Processing: published row is `ready` (original stored; PAGE-014 still shows “Video processing…” on real media error).
- **State owner:** `src/features/upload/uploadSession.ts` (client) + `server/modules/uploads/session.ts` (Neon + Bunny). Orphan `uploaded` sessions aborted after 24h by the job loop.
- **Parity tests:** empty/invalid mime; one session/one row; idempotent publish retry; PAGE-013 hashtag; PAGE-014 `GET /api/videos/:id`; no video_saves row; private excluded from hashtag; story 24h row.

### PAGE-023 AI Studio
- **Route:** `/ai-studio`. Bottom nav hidden (PAGE-006). Exit named `AI_STUDIO_EXIT_TO` (`/feed`) or `returnTo`.
- **OLD visual authority:** `src/pages/AIStudio.tsx`, `AIToolsPanel.tsx` (read-only). Dedicated studio page — not a cloud generator.
- **What happens:** Local `video/*` import + `image/*` background. CSS filter catalog + enhance sliders. Tools sheet tabs: Filters, Enhance, Captions (local heuristic suggestions), Thumbnail (canvas frame extract), Voice FX (toast only — export is still the filtered frame), Subtitles (device SpeechRecognition when present), Background (color/gradient/blur overlay). Export composites current video frame (+ background image) to a JPEG download. **No server AI job. No provider. No coins. No PAGE-022 publish from this page.**
- **State owner:** `src/features/aiStudio/aiStudioSession.ts` (one owner). Temp media = blob URLs, revoked on dispose / account change / unmount. No Neon job table.
- **Parity tests:** empty chrome; tools tabs; export without video; named close; local captions deterministic; invalid mime; no `fetch` on open tools.

### PAGE-024 Own profile
- **Route:** `/profile`. BottomNav Profile lands here. `/profile/:userId` matching the session user redirects here. Hardware back on `/profile` is a named root (stay). Close → `/feed` (`PROFILE_EXIT_TO`) or `returnTo`.
- **OLD visual authority:** `src/pages/Profile.tsx` (read-only). NEW page: `src/pages/OwnProfile.tsx`.
- **What happens:** Session-derived `GET /api/profiles/me` (server uses JWT user id; client does not choose whose private own-profile data is returned). Avatar + story plus (`/upload?type=story`), stats following/followers/likes/views, share, title Profile, close, action chips AI Studio / Elix Studio / Shop / Showcase / Settings. Icon tabs videos / shop / private / reposts / saved / liked. Grids from dedicated user/saved/liked/repost/shop queries. Unique **profile** views (not video view totals). Likes = likes received on the owner’s undeleted videos.
- **Navigation:** settings (`/settings`), edit via Settings (PAGE-026), follow lists (PAGE-027/028), video (PAGE-014), shop, creator login details (PAGE-029). No in-page Edit Profile form.
- **State owner:** `src/features/profile/ownProfileSession.ts` (one client owner) + `server/modules/profile` (`GET /me`, unique views) + `GET /api/videos/user/:id` (privacy public vs private, private is owner-only 403).
- **Parity tests:** `/me` unauth 401; counts from SQL; private 403 for others; tab race; account dispose; empty tabs.
- **PAGE-024 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/profile` contract is locked. Device runtime on signed 1.0.7 not overwritten. Edit Profile PAGE-026, follow lists PAGE-027/028, public profile PAGE-025, Settings body, PAGE-022 device publish → grid, LiveKit live-ring (own profile does not treat `users.isLive` as authority; live existence stays PAGE-017/018). In-app follower share-to-DM contacts are not rebuilt (external share + copy). Drafts N/A. Pinned N/A.

### PAGE-025 Public profile
- **Route:** `/profile/:userId`. Route param is a user UUID **or** username; server canonical identity is user UUID. `/profile/:userId` matching the session user redirects to PAGE-024 `/profile`.
- **OLD visual authority:** `src/pages/Profile.tsx` public branch (read-only). NEW page: `src/pages/Profile.tsx` (public-only; own profile is `OwnProfile.tsx`).
- **What happens:** `GET /api/profiles/:userId` or `GET /api/profiles/by-username/:username`. Follow/Unfollow via shared `POST/DELETE` follow APIs; Message (`POST /api/inbox/threads` → `/inbox/:id`); share report+block. `POST /api/profiles/:id/view` unique views (not self). No private tab, no Edit/Settings/story plus. Public tabs: videos / shop / reposts / saved / liked. Videos from `GET /api/videos/user/:id` (public). Live ring from `live_streams.status='live'` on the public DTO; tap → `/watch/:userId` (roomId = host UUID).
- **State owner:** `src/features/profile/publicProfileSession.ts` (one client owner) + `server/modules/profile` public GET / by-username / view / follow + `GET /api/videos/user/:id`.
- **Parity tests:** username resolve; follow persist + count refetch; unique view; block 403 on profile and public videos; self-route redirect; A→B stale drop.
- **PAGE-025 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Device runtime on signed 1.0.7 not overwritten. Follow lists PAGE-027/028, Inbox/thread look locked, Report destination, LiveKit LIVE→watch on device, PAGE-022 media thumbs. No PAGE-026.

### PAGE-026 Edit profile
- **Route:** `/edit-profile`. RequireAuth. Settings → Edit profile. Close/Save named exit `EDIT_PROFILE_EXIT_TO` = `/settings` (`returnTo` honored). Hardware back `/edit-profile` → Settings. No unsaved-change prompt (OLD left immediately).
- **OLD visual authority:** `src/pages/EditProfile.tsx` (read-only). NEW page: `src/pages/EditProfile.tsx` (session consumer).
- **What happens:** Hydrate `GET /api/profiles/me` (session user). Save `PATCH /api/profiles/me` (JWT identity; whitelist displayName/username/bio/website/instagram/youtube/tiktok). Avatar `POST /api/profiles/me/avatar` (one uploader, `avatars/<userId>/<uuid>.ext`, MIME+magic, 5 MB). Username uniqueness `users.username_normalized` unique + 409. No `PATCH /:userId`. No client avatar URL. No crop. No remove photo. No availability-while-typing.
- **State owner:** `src/features/profile/editProfileSession.ts` + `server/modules/profile` PATCH `/me` + `handleAvatarUpload`.
- **Parity tests:** hydrate; save; username 3–30 `[A-Za-z0-9._]`; taken 409; mass-assignment 400; avatar MIME; A→B dispose; PAGE-024/025 metadata via same user row.
- **PAGE-026 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Device runtime on signed 1.0.7 not overwritten. PAGE-027 not started. Mentions historical rewrite N/A. Crop N/A. Remove photo N/A. Availability-while-typing N/A.

### PAGE-027 Followers
- **Route:** `/profile/:userId/followers`. Param UUID or username; canonical identity is user UUID. RequireAuth. PAGE-024/025 Followers count → this route with `returnTo`. Close/hardware back → `/profile/:userId` or Inbox `returnTo`.
- **OLD visual authority:** `src/pages/FollowList.tsx` followers mode (read-only). NEW page: `src/pages/Followers.tsx`.
- **What happens:** `GET /api/profiles/:id/followers` after `publicProfile` access (block 403, banned/deleted 404). Rows = users who follow the target, newest follow first (`created_at DESC`, `id` tie-break). Follow/Following uses shared `POST follow/unfollow`. Empty `No followers yet.` No pagination (OLD full list). No WS.
- **State owner:** `src/features/profile/followersSession.ts` + `server/modules/profile` GET `/:userId/followers`.
- **Parity tests:** list; empty; follow back; block 403; stale A→B; A→B dispose.
- **PAGE-027 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Device runtime on signed 1.0.7 not overwritten. PAGE-028 Following list is a separate owner (`FollowingList.tsx`). Inbox returnTo runtime. PAGE-025 row tap.

### PAGE-028 Following list
- **Route:** `/profile/:userId/following`. Param UUID or username; canonical identity is user UUID. RequireAuth. PAGE-024/025 Following count → this route with `returnTo`. Close/hardware back → `/profile/:userId` or Inbox `returnTo`.
- **OLD visual authority:** `src/pages/FollowList.tsx` following mode (read-only). NEW page: `src/pages/FollowingList.tsx`.
- **What happens:** `GET /api/profiles/:id/following` after `publicProfile` access (block 403, banned/deleted 404). Rows = accounts the target follows, newest follow first (`created_at DESC`, `id` tie-break). Follow/Following uses shared `POST follow/unfollow`. Empty `Not following anyone yet.` Unfollow does not remove the row until reload. No pagination (OLD full list). No WS.
- **State owner:** `src/features/profile/followingSession.ts` + `server/modules/profile` GET `/:userId/following`.
- **Parity tests:** list; empty; unfollow; block 403; stale A→B; A→B dispose.
- **PAGE-028 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Device runtime on signed 1.0.7 not overwritten. PAGE-029 Creator login details is a separate owner. Inbox returnTo runtime. PAGE-024/025 row tap.

### PAGE-029 Creator login details
- **Route:** `/creator/login-details`. Reachable signed-in and signed-out (switch/add). RequireAuth does not wrap this route. Close/hardware back → Settings or `returnTo` (profile).
- **OLD visual authority:** `src/pages/CreatorLoginDetails.tsx` (read-only). NEW page: `src/pages/CreatorLoginDetails.tsx`.
- **What happens:** Switch/add saved creator identifiers (email/username/avatar only, max 5) in `localStorage` `creator_saved_accounts`. Sign in via shared `signInWithPassword`. **Never store password.** Migrates/deletes legacy password keys. Sign-in only (Create account hidden). Forgot/reset → PAGE-003 `/forgot-password`. Successful login → `/profile`. Sign out stays on this page.
- **State owner:** `src/features/creatorLogin/creatorLoginSession.ts` + `creatorSavedAccounts.ts`. Auth still Neon.
- **Parity tests:** save identifier not password; login; corrupt storage recovered; forgot password; switch/add after sign-out.
- **PAGE-029 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Device runtime on signed 1.0.7 not overwritten. PAGE-030 Inbox implemented separately.

### PAGE-030 Inbox
- **PAGE-030 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Device runtime on signed 1.0.7 not overwritten. PAGE-031 Activity overlay is a separate owner. PAGE-032 Alerts destination runtime. PAGE-033 chat-thread close runtime. Signed 1.0.7 device pass not run.
- **Route:** `/inbox`. Close → `/feed` (hub X). Opened children return to Inbox.
- **OLD visual authority:** `src/pages/Inbox.tsx` (locked look).
- **What happens:** Filters Main / Unread / Activity. Hubs: New followers, Activity, Gift received, Alerts → `/alerts`. Threads `GET /api/chat/threads`. Delete = server `DELETE /api/chat/threads/:id` shared Main+Unread. Activity `GET /api/activity` only. No localStorage tombstones. No fabricated `username: 'user'`. Likes not duplicated as Archive. Live-share requests `GET /api/inbox/live-share-requests`. Navigate with `inboxReturnState()`.
- **State owner:** Neon chat_threads/messages, activity, notifications, live_share_inbox. WS `dm_message` / `dm_thread_updated`.
- **Parity tests:** open thread return Inbox; delete gone both filters; empty Main/Unread; alerts close Inbox.

### PAGE-031 Inbox Activity overlay
- **PAGE-031 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Overlay owner is `InboxActivityOverlay` on `/inbox` (not a router path). Device runtime on signed 1.0.7 not overwritten. PAGE-014 video-close runtime from an activity row; PAGE-032 Alerts is a separate owner.
- **Route:** overlay on Inbox (not a router path).
- **OLD visual authority:** Activity portal inside `Inbox.tsx`.
- **What happens:** Likes/comments with real actors from `/api/activity`. Close stays Inbox.
- **Parity tests:** real names; close Inbox; no fake stubs.

### PAGE-032 Alerts
- **PAGE-032 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Device runtime on signed 1.0.7 not overwritten. PAGE-019 watch destination from a live_started row; PAGE-043 push registration is a separate owner. PAGE-033 chat thread is a separate owner.
- **Route:** `/alerts`. Close → Inbox.
- **OLD visual authority:** `src/pages/alerts/AlertsPage.tsx`.
- **What happens:** `GET /api/notifications`; mark read `POST /api/notifications/read`. Push registration is PAGE-043.
- **Parity tests:** list; empty; read; close Inbox.

### PAGE-033 Chat thread
- **PAGE-033 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Device runtime on signed 1.0.7 not overwritten. Two-user WS runtime and PAGE-034 call completion are separate. Android keyboard/device pass not run.
- **Route:** `/inbox/:threadId`. Bottom nav hidden.
- **OLD visual authority:** `src/pages/ChatThread.tsx` (locked).
- **What happens:** Handle pill; video call left; avatar 48 centered; back right; username under; no header level; messages left; ring→level→name then body; LevelBadge 30/16; composer. `GET/POST` messages, read. WS `dm_message`. Call: `startOutgoingCall` with canonical `threadId` then `/call` (PAGE-034). Close Inbox named.
- **State owner:** Neon messages. WS delivery.
- **Parity tests:** send; blocked cannot; call; close Inbox; layout lock.
- **NEW owner:** `src/pages/ChatThread.tsx` + `createChatThreadSession`. Metadata `GET /api/inbox/threads/:threadId`. History `GET /api/inbox/threads/:threadId/messages`. Send `POST /api/inbox/threads/:threadId/messages`. Mark-read `POST /api/inbox/threads/:threadId/read`. Fanout after Neon insert via PAGE-006 `sendToUserGlobal` (`dm_message`, `dm_thread_updated`). No second socket.

### PAGE-034 Video call
- **PAGE-034 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. PAGE-035 incoming modal → Accept → `/call` handoff is implemented. Device runtime on signed 1.0.7 not overwritten. Two-user LiveKit media runtime requires production NEW deploy or an explicit LAN install order.
- **Route:** `/call`. Bottom nav hidden.
- **OLD visual authority:** `src/pages/VideoCall.tsx` (locked). Do not edit unless owner names it.
- **What happens:** WS `call_invite|accepted|rejected|ended`. LiveKit room `call_*` both publish. PiP local top-right. Green Accept only `incoming`. Red End `#EF4444`. Close ends → that DM. Blocked → `call_rejected` reason `blocked`.
- **State owner:** WS signaling. LiveKit media. No REST start.
- **Parity tests:** invite; accept; decline; blocked; end to thread.
- **NEW owner:** `src/pages/VideoCall.tsx` + `src/features/calls/videoCallSession.ts`. PAGE-033 hands `threadId` + `calleeId` into `startOutgoingCall`. Server `handleCallSignal` mints Neon `calls.id` and `call_<id>` room. Token `POST /api/calls/:callId/token` (not start). PAGE-006 `wsClient` + `sendToUserGlobal` only. Incoming modal is PAGE-035.

### PAGE-035 Incoming call modal
- **PAGE-035 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Two-user LiveKit media and Android signed 1.0.7 overwrite remain external. Incoming modal → Accept → `/call` handoff is implemented.
- **Route:** global App mount.
- **OLD visual authority:** `src/components/IncomingCallModal.tsx` (locked).
- **What happens:** WS `call_invite`. Red decline / green accept → `/call`.
- **Parity tests:** accept; decline; appears over other pages.
- **NEW owner:** `src/components/IncomingCallModal.tsx`. One App mount. Invite state stays on PAGE-034 session (`incoming`). Accept `call_accepted` then `/call`. Decline `call_rejected`, stay. Caller cancel `call_ended` clears invite. No ringtone/vibration in OLD. No LiveKit in modal. PAGE-006 `bindVideoCallSignals` on `user.id` only.

### PAGE-036 Shop
- **PAGE-036 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Stripe test-mode checkout, webhook delivery, and Android signed 1.0.7 overwrite remain external. PAGE-037 `/shop/:itemId` handoff is now implemented on the same Shop page.
- **Route:** `/shop`. Top tab Shop from For You.
- **OLD visual authority:** `src/pages/Shop.tsx`.
- **What happens:** `GET /api/shop/items`. Own items CRUD. Checkout **Stripe only** `POST /api/shop/checkout` `{ itemId|items[], idempotencyKey? }`. Basket max 10 lines qty 1–99. Success/cancel URLs from CLIENT_URL. Webhook SYS-001. **Not IAP. Not coins.**
- **State owner:** Neon `shop_items` / `shop_purchases` (NEW durable purchase table; same role as ledger `elix_shop_purchases`). Stripe session server-side.
- **Parity tests:** list; checkout session; cancel; idempotency; creator own CRUD.
- **NEW owner:** `src/pages/Shop.tsx` + `src/features/shop/shopApi.ts` + `src/store/useShopBasketStore.ts` + `server/modules/shop/*`. One `/shop` page. Basket display cache is not purchase authority. Checkout ignores client price/total/URLs. Card tap hands off to PAGE-037 `/shop/:itemId` without a second Shop system.

### PAGE-037 Shop item
- **PAGE-037 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Stripe test-mode hosted checkout, webhook delivery, Android signed 1.0.7 overwrite, and web/device deep-link against production host remain external.
- **Route:** `/shop/:itemId` same `src/pages/Shop.tsx`.
- **OLD visual authority:** `src/pages/Shop.tsx`. OLD file does not read `useParams().itemId`; the route still renders the same Shop chrome. NEW keeps that chrome and selects exactly one catalog row by route `itemId` from `GET /api/shop/items`.
- **What happens:** Deep link / refresh / cold start reads canonical route `itemId` only. Unknown or deleted id shows the same Shop empty chrome (`No items for sale yet`). No fallback to another product. Back named `/shop`. Same basket, same `POST /api/shop/checkout`, same Stripe webhook + `shop_purchases`. **Not IAP. Not coins.**
- **Parity tests:** valid item; unknown id empty; A→B stale route; checkout same PAGE-036 contract; PAGE-036 list regression.
- **NEW owner:** same PAGE-036 Shop infrastructure. Selection helpers `canonicalShopRouteItemId` + `selectShopItemByCanonicalId` in `src/features/shop/shopApi.ts`. Named exit `/shop/:itemId` → `/shop` in `src/lib/settingsNav.ts`.

### PAGE-038 Purchase coins
- **PAGE-038 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Android signed 1.0.7 / OLD production host, Google Play test purchase, and iOS sandbox remain external. Stripe test-mode is not used for coins. PAGE-039 return gate: verified IAP now reconciles through `GET /api/wallet` paid/starter/promo only (test coins stay on `GET /api/test-coins/balance`). Device/store purchase runtime still deferred.
- **Route:** `/purchase-coins` + `BuyCoinsModal`.
- **OLD visual authority:** `src/pages/PurchaseCoins.tsx`, `BuyCoinsModal.tsx`.
- **What happens:** `GET /api/coin-packages`. Fail-closed empty catalog. Native StoreKit / Play Billing only. `POST /api/verify-purchase`. Same-user proof replay is idempotent. Foreign replay 403. Credits `processed_purchases` + `paid_coin_lots` (NEW names; same role as ledger `elix_processed_purchases` / `elix_paid_coin_lots`). Wallet reconcile from `GET /api/wallet`. Web shows in-app-only message. **Not Stripe. Not shop. Not test/starter/promo credit.**
- **State owner:** `src/features/iap/iapApi.ts` one purchase lock + one NativePurchases plugin. Server `creditVerifiedIap`. Apple/Google webhooks SYS-002/003 unchanged.
- **Parity tests:** catalog provider SKUs; unauth verify 401; forged userId 403; unknown SKU 400; web no Stripe; PAGE-036/037 shop remains Stripe-only.

### PAGE-039 Wallet display
- **PAGE-039 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Shared contract only — no standalone route. Android physical-device wallet runtime and live IAP/refund device passes remain external. Valkey is required for test-coin read/mint; IT without VALKEY_URL fail-closes 503.
- **Type:** shared wallet surface / contract. Not a router page.
- **What happens:** `GET /api/wallet` returns **separate** `coin_balance`, `starter_balance`/`starter_coins`, `promotional_balance`/`promotional_coins`. Never one merged number. Error/unavailable is not zero. Test coins `GET /api/test-coins/balance` Valkey hash only. Engagement promo display consumes the shared wallet; energy/XP stay engagement-owned (PAGE-052).
- **State owner:** `src/store/useWalletStore.ts` + `src/features/wallet/walletApi.ts`. Test coins: `src/store/useTestCoinsStore.ts` + `src/features/wallet/testCoinsApi.ts`.
- **Parity tests:** fields unmerged; API error ≠ zero; successful zero is zero; account-switch stale drop; test coins not in wallet; PAGE-038 paid-only reconcile; PAGE-036/037 shop does not credit coins.

### PAGE-040 Settings
- **PAGE-040 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/settings` option-sheet contract is locked. Child destination behaviour for PAGE-041/042/043/044/045/047/057/058/067/068/069/070 remains those pages. Android physical-device runtime on `C3U000000005847` and disposable-account delete runtime were not run here.
- **Route:** `/settings`.
- **OLD visual authority:** `src/pages/Settings.tsx` in SettingsOptionSheet.
- **NEW owner:** `src/pages/Settings.tsx` + `src/components/SettingsOptionSheet.tsx`. Navigation `src/lib/settingsNav.ts`. Preferences `src/store/useSettingsStore.ts`. Logout/delete actions `src/features/settings/settingsSession.ts` → `POST /api/auth/logout` and `POST /api/auth/delete`. Admin gate `user.isAdmin` from `users.is_admin`. Engagement row `isEngagementHubEnabled()` / `VITE_ENGAGEMENT_HUB_ENABLED`.
- **What happens:** Rows: Edit Profile, Privacy→safety, Security, Delete Account, Creator payout, Engagement Hub (flag), Admin (`is_admin`), Notifications, Live notifications toggle, Mute all sounds, Dark mode always-on toast, Language picker, Video quality auto toast, Liked → profile liked tab, Saved, Blocked, Safety Center, How the app works, Help & Support, Terms, Privacy, Guidelines, Log Out. Delete uses NativeDialog then `POST /api/auth/delete`. Children `returnTo` settings. Close named Profile.
- **Parity tests:** each row navigates; logout revokes; delete confirm/cancel; admin hidden if not admin; hub flag; mute/dark/language/quality; hardware back Profile; no `history.back`.
- **PAGE-040 PAGE-041 return gate:** Settings Privacy + Safety Center rows → `/settings/safety` with `returnTo: /settings`; Safety Center close/hardware back → `/settings`. Proven in PAGE-040 and PAGE-041 tests.
- **PAGE-040 PAGE-042 return gate:** Settings Security row → `/settings/security` with `returnTo: /settings`; Security close/hardware back → `/settings`. Proven in PAGE-040 and PAGE-042 tests.
- **PAGE-040 PAGE-043 return gate:** Settings Notifications row → `/settings/notifications` with `returnTo: /settings`; Notification Settings close/hardware back → `/settings`. Proven in PAGE-040 and PAGE-043 tests.
- **PAGE-040 PAGE-044 return gate:** Settings Blocked Accounts row → `/settings/blocked` with `returnTo: /settings`; Blocked Accounts close/hardware back → `/settings`. Proven in PAGE-040 and PAGE-044 tests.
- **PAGE-040 PAGE-045 return gate:** Settings Creator payout row → `/settings/payout` with `returnTo: /settings`; Creator Payout close/hardware back → `/settings`. Proven in PAGE-040 and PAGE-045 tests.
- **PAGE-040 PAGE-047 return gate:** When `ENGAGEMENT_HUB_ENABLED` is on, Settings Engagement Hub → `/engagement` with `returnTo: /settings`; Hub close/hardware back → `/settings`. When off, the Settings row is hidden and a direct `/engagement` route redirects to Settings. Proven in PAGE-040 and PAGE-047 tests.
- **PAGE-040 PAGE-069 return gate:** Settings Help & Support → `/support` with `returnTo: /settings`; Support close/hardware back → `/settings`. Proven in PAGE-040 and PAGE-069 tests.
- **PAGE-040 PAGE-070 return gate:** Settings Admin row is visible only when `user.isAdmin === true` (`users.is_admin`). Admin → `/admin` with `returnTo: /settings`. `/admin` hardware back → `/settings`. Non-admin Settings hides Admin; email/id are not admin authority. Proven in PAGE-040 and PAGE-070 tests.
- **MANDATORY RETURN GATES:** PAGE-057/058/067/068/069/070 destinations now exist; Settings Terms / Privacy footer / Guidelines / How the app works / Help & Support / Admin → those routes with `returnTo: /settings`, and child close/hardware back → `/settings`, is proven. After disposable-account + device pass → delete/logout runtime. After Android device pass → Settings → Admin → back on `C3U000000005847`.

### PAGE-041 Safety center
- **PAGE-041 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/settings/safety` option-sheet contract is locked. Destination behaviour for PAGE-044 Blocked, PAGE-046 Report submit, PAGE-067 Guidelines, and PAGE-069 Support remains those pages. Android physical-device runtime on `C3U000000005847` was not run here.
- **Route:** `/settings/safety`.
- **OLD visual authority:** `src/pages/settings/SafetyCenter.tsx`.
- **NEW owner:** `src/pages/settings/SafetyCenter.tsx` on PAGE-040 `SettingsOptionSheet`. Named close `SETTINGS_HOME`. Children `returnTo` = incoming Settings return or `/settings/safety`.
- **What happens:** Static Safety Center. Quick Actions: Blocked Accounts `/settings/blocked`; Report a Problem `/report?type=support&id=support_ticket`. Privacy Controls: Account Privacy `/edit-profile`; Data & Personalization `/privacy`. Resources: Community Guidelines + Safety Tips `/guidelines`. Emergency copy (911 / 999 / 112). Support: Contact Support `/support`. No counts, no report POST, no block API, no WS.
- **Parity tests:** sheet chrome; row order; named back Settings; hardware back Settings; deep link; Blocked/Report/Guidelines handoff; PAGE-040 Privacy + Safety Center rows.
- **PAGE-041 PAGE-044 return gate:** Safety Center Blocked Accounts → `/settings/blocked` with child `returnTo` = incoming Settings return or `/settings/safety`. Blocked Accounts close/hardware back honors that `returnTo`. Proven in PAGE-041 and PAGE-044 tests.
- **PAGE-041 PAGE-046 return gate:** Safety Center Report a Problem → `/report?type=support&id=support_ticket` with child `returnTo` = incoming Settings return or `/settings/safety`. Report close/hardware back honors that `returnTo`. Proven in PAGE-041 and PAGE-046 tests. PAGE-041 still does not submit `POST /api/report`.
- **PAGE-041 PAGE-069 return gate:** Safety Center Contact Support → `/support` with child `returnTo` = incoming Settings return or `/settings/safety`. Support close/hardware back honors that `returnTo`. Proven in PAGE-041 and PAGE-069 tests. PAGE-069 does not invent a ticket POST.
- **MANDATORY RETURN GATES:** PAGE-067 Guidelines now exists as a full document; Safety Center Community Guidelines + Safety Tips → `/guidelines` with child `returnTo` = incoming Settings return or `/settings/safety`. Guidelines close/hardware back honors that `returnTo`. PAGE-069 Support now exists as a full document; Safety Center Contact Support → `/support` with the same child `returnTo`. After device pass → hardware back on `C3U000000005847`.

### PAGE-042 Security
- **PAGE-042 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/settings/security` option-sheet contract is locked. Android physical-device runtime on `C3U000000005847` and a disposable-account authenticator-app pass were not run here. HTTP IT covers server-generated secret + real TOTP enable/disable.
- **Route:** `/settings/security`.
- **OLD visual authority:** `src/pages/settings/SecuritySettings.tsx`.
- **NEW owner:** `src/pages/settings/SecuritySettings.tsx` on PAGE-040 `SettingsOptionSheet`. Status/enrol/verify/disable `src/features/security/securityApi.ts` + `src/features/security/securitySession.ts`. Named close `SETTINGS_HOME`. Children `returnTo` = incoming Settings return or `/settings/security`.
- **What happens:** Rows: Password → `/forgot-password` when `isPasswordResetEnabled()`; else unavailable copy. Blocked accounts → `/settings/blocked`. Two-factor authentication: `GET /api/auth/2fa/status` `{ enabled }` (loading / error / enabled / disabled; error ≠ disabled). Enable: `POST /api/auth/2fa/enroll` server secret + NativeDialog prompts + `POST /api/auth/2fa/verify` `{ code }`. Disable: NativeDialog code + `POST /api/auth/2fa/disable` `{ code }`. No QR. No change-password form. No Login TOTP setup. Neon `user_two_factor` is authority.
- **Parity tests:** sheet chrome; row order; named/hardware back Settings; status loading/error; enroll/verify/disable; duplicate action; stale account switch; Login/Forgot ownership; HTTP IT lifecycle.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → rerun Settings → Security → back, direct `/settings/security`, and disposable-account authenticator enable/disable.

### PAGE-043 Notification settings
- **PAGE-043 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/settings/notifications` option-sheet contract is locked. Android `C3U000000005847` permission/token/push runtime, iOS APNs, and configured FCM/APNs end-to-end delivery were not run here. HTTP IT covers register/delete/isolation and honest `not_configured` push_notify.
- **Route:** `/settings/notifications`.
- **OLD visual authority:** `src/pages/settings/NotificationSettings.tsx`.
- **NEW owner:** `src/pages/settings/NotificationSettings.tsx` on PAGE-040 `SettingsOptionSheet`. Local prefs `useSettingsStore` (`elix_settings_v1`). Shared native register `src/lib/pushRegister.ts`. Token API `src/features/notifications/deviceTokenApi.ts`. Logout unregister `unregisterCurrentDeviceToken` from `useAuthStore.signOut`. Server `POST/DELETE /api/device-tokens` + Neon `device_tokens`. `push_notify` via `server/modules/push/send.ts` + Valkey `elix:jobs`.
- **What happens:** App notifications + Live notifications local toggles. Footer: local storage + device permission. Enable App notifications may request native permission/register. Disable is local only (OLD). Logout deletes current-platform token. No `/api/notifications/prefs`. No QR/registered badge. Missing FCM/APNs does not fake delivery.
- **Parity tests:** sheet chrome; named/hardware back Settings; local prefs; PAGE-040 Live notifications shared store; register/delete IT; duplicate upsert; rotation; foreign userId ignored; push not_configured.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` (and iOS when available) → rerun permission, real token POST/DELETE, and provider-configured push delivery.

### PAGE-044 Blocked accounts
- **PAGE-044 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/settings/blocked` option-sheet contract is locked. Android physical-device two-account runtime on `C3U000000005847` and a process restart/redeploy persistence pass were not run here. HTTP IT covers list ownership, newest-first order, session-derived viewer, unblock idempotency, account isolation, profile/follow/message/feed reconcile, and `isBlockedEitherWay` after unblock. FLOW-002 comment 403 is not implemented on video comment routes; PAGE-044 does not own comments.
- **Route:** `/settings/blocked`.
- **OLD visual authority:** `src/pages/settings/BlockedAccounts.tsx`.
- **NEW owner:** `src/pages/settings/BlockedAccounts.tsx` on PAGE-040 `SettingsOptionSheet`. List/unblock `src/features/blocks/blockedUsersApi.ts` + `src/features/blocks/blockedUsersSession.ts`. Server `GET /api/blocked-users` + `POST /api/unblock-user` in `server/modules/blocks`. Shared Neon `blocks` insert remains `POST /api/block/:userId` for PAGE-025. Named close `SETTINGS_HOME` or incoming `returnTo`.
- **What happens:** Authenticated list from session viewer. Rows: avatar 48, display name, `Blocked {relative date}`, Unblock. Search filters the already-fetched list. Loading ≠ empty ≠ error. Unblock is per-row locked and only removes a row after `{ success: true }`. Soft-deleted targets are omitted. No profile navigation from a row. No PAGE-044 WebSocket.
- **Parity tests:** sheet chrome; loading/empty/error; search; unblock success/failure; named/hardware back Settings; Safety `returnTo`; stale account switch; HTTP IT list/unblock/isolation/reconcile; PAGE-034 `call_rejected` reason `blocked` remains server-owned.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → rerun two-account block/unblock/profile/call/hardware-back. After a server restart/redeploy → rerun list persistence. After comment-route FLOW-002 enforcement → rerun comment eligibility after unblock.

### PAGE-045 Creator payout
- **PAGE-045 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/settings/payout` option-sheet contract is locked. Stripe Connect sandbox onboarding, `payouts_enabled` live capability, admin PAGE-076 approve/mark-paid, real/external payout, Android physical-device runtime on `C3U000000005847`, and server-restart money persistence were not run here. HTTP IT covers balance/ledger/methods, available→held reservation, zero/negative/over/malformed/duplicate/concurrent withdraw, test/starter/promo £0 GBP, paid-gift 60/40 display, Connect forged-account ignore, and `/api/payouts/withdraw` + `/api/wallet/withdraw` removal.
- **Route:** `/settings/payout`.
- **OLD visual authority:** `src/pages/CreatorPayout.tsx`.
- **NEW owner:** `src/pages/CreatorPayout.tsx` on PAGE-040 `SettingsOptionSheet`. Snapshot/withdraw/onboard `src/features/creator/creatorPayoutApi.ts` + `src/features/creator/creatorPayoutSession.ts`. Server money `server/modules/payouts/service.ts`. Stripe Connect `server/modules/payouts/stripeConnect.ts`. Named close `SETTINGS_HOME`.
- **What happens:** `GET /api/creator/balance|ledger|withdrawals-gbp|payout-methods|payout-account`. `POST /api/creator/payout-method`, `/api/creator/payout-account/onboard`, `/api/creator/withdraw-gbp` `{ amount_pence, idempotency_key }`. Available and held stay separate. Withdrawal request status is `pending` (request ≠ paid). **No test-coin withdraw. No starter/promo withdraw as GBP.** Client does not calculate 60/40.
- **State owner:** Neon `creator_wallet_gbp` + `financial_ledger` + `withdrawals_gbp` + `payout_accounts` + `payout_methods`. Stripe Connect retrieve is capability authority. FLOW-013 settlement and FLOW-015 reverse remain server-owned. PAGE-076 owns admin approve/reject/mark-paid.
- **Parity tests:** sheet chrome; loading/error ≠ £0; named/hardware back Settings; PAGE-040 Creator payout row; withdraw lock; Connect return ≠ ready; HTTP IT reservation/isolation/gift regressions.
- **MANDATORY RETURN GATES:** After Stripe Connect sandbox + PAGE-076 admin payout + device pass on `C3U000000005847` → rerun onboarding capability refresh, real/sandbox withdrawal execution, and Settings → Creator Payout → back.

### PAGE-046 Report
- **PAGE-046 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/report` option-sheet + `ReportModal` submit contract is locked. Admin PAGE-072 review/resolve, Android physical-device runtime on `C3U000000005847`, and copyright/audio DMCA tables (absent in NEW migrations) were not run here. HTTP IT covers session reporter, ignored client `reporter_id`, retired `/api/reports`, and support-ticket insert.
- **Route:** `/report` + `ReportModal`.
- **OLD visual authority:** `src/pages/Report.tsx`, `ReportModal.tsx`.
- **NEW owner:** `src/pages/Report.tsx` on PAGE-040 `SettingsOptionSheet`. Modal `src/components/ReportModal.tsx`. Submit `src/features/report/reportApi.ts` + `src/features/report/reportSession.ts`. Server `POST /api/report` in `server/modules/misc/routers.ts` → `server/modules/reports/service.ts`. Named close `FEED_HOME` or incoming `returnTo`.
- **What happens:** Authenticated `POST /api/report` `{ targetType, targetId, reason, details }` → `{ ok: true, id }`. Reporter is session `req.userId` only. Page parses `type`/`id` and leftover `targetKind`/`targetId`. Safety Center keeps `/report?type=support&id=support_ticket`. Specific-target Report actions open `ReportModal` (`videoId`, `contentType`, optional `contentId`). Success is named Close only (no auto-timer). PAGE-072 owns admin list/resolve. No copyright/audio DMCA tables in NEW.
- **State owner:** Neon `reports`. No client report store. No PAGE-046 WebSocket.
- **Parity tests:** sheet/modal chrome; support/video/user query; submit lock; 401 session; named/hardware back For You; Safety `returnTo`; stale account switch; HTTP IT insert/isolation/`/api/reports` 404.
- **MANDATORY RETURN GATES:** After PAGE-072 admin review + device pass on `C3U000000005847` → rerun Safety → Report → back and admin open-report visibility.

### PAGE-047 Engagement Hub
- **PAGE-047 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/engagement` option-sheet + `GET /api/engagement/hub` contract is locked. PAGE-048–054 are now their own owners; PAGE-055 remains later. Android physical-device runtime on `C3U000000005847` was not run here. HTTP IT covers flag-off 404, session-owned zeros, promo/energy/XP isolation from wallet/payout, and User B isolation. Hub → Collections handoff is `/engagement/collections`. Hub has no numeric collection summary.
- **Route:** `/engagement`. Flag `ENGAGEMENT_HUB_ENABLED` else not offered. Client + server fail closed.
- **OLD visual authority:** `src/pages/engagement/EngagementHub.tsx`, `EngagementShell.tsx`.
- **NEW owner:** `src/pages/engagement/EngagementHub.tsx` on PAGE-040 `SettingsOptionSheet`. Gate `src/pages/engagement/EngagementGate.tsx` + `src/config/engagementFlags.ts`. Hub query `src/features/engagement/engagementHubApi.ts` + `src/features/engagement/engagementHubSession.ts`. Server `GET /api/engagement/hub` in `server/modules/engagement/router.ts` → `server/modules/engagement/hub.ts`. Named close `SETTINGS_HOME` or incoming `returnTo`.
- **What happens:** Authenticated `GET /api/engagement/hub` → `{ hub: { promotional_coins, battle_energy, total_xp, fan_level, fan_tier, missions_open, daily_login, starter_coin_balance } }`. Loading ≠ zero. Error ≠ zero. Daily claim button is a handoff to `/engagement/daily-login` (no hub POST). Links to 048–054. Promo/Energy/XP copy ≠ purchased coins. Close Settings.
- **State owner:** Neon `user_engagement` (XP/level/energy) + `wallet_balances.promo_coins` / `starter_coins` + `daily_login_claims` + `engagement_missions` / `user_mission_progress`. No PAGE-047 WebSocket. No client progression store.
- **Parity tests:** sheet chrome; flag on/off; loading/error/zero; named/hardware back Settings; PAGE-040 row; child handoffs; stale account switch; HTTP IT isolation/wallet/payout separation.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → rerun Settings → Hub → each child → back, and flag-off direct route. PAGE-048 Missions handoff + claim → Hub promo/XP/energy reconcile is proven in PAGE-048 tests. PAGE-049 Fan Level handoff + Hub/Fan Level XP/level agreement is proven in PAGE-049 tests. PAGE-050 MVP handoff + gift-board agreement is proven in PAGE-050 tests. PAGE-051 Achievements handoff + Hub XP agreement after auto-grant is proven in PAGE-051 tests. PAGE-052 Reward Wallet handoff + Hub/wallet agreement is proven in PAGE-052 tests. PAGE-053 Daily Login handoff + claim → Hub daily/XP/promo reconcile is proven in PAGE-053 tests. PAGE-054 Collections handoff + inventory load is proven in PAGE-054 tests. Live watch-earned chest/sticker/card Hub summary still waits on later live-flow writers.

### PAGE-048 Missions
- **PAGE-048 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/engagement/missions` + `GET /api/engagement/missions` + `POST /api/engagement/missions/:id/claim` contract is locked. Live watch/comment/share mission metrics (`POST /api/engagement/progress`) are not in NEW and remain later live-flow work. Android physical-device runtime on `C3U000000005847` was not run here. HTTP IT covers flag-off 404, unique like/watch progress, incomplete/duplicate/concurrent claim, promo/XP/energy isolation from paid wallet and creator GBP, and User B isolation.
- **Route:** `/engagement/missions`. Same `ENGAGEMENT_HUB_ENABLED` gate as PAGE-047. Named close `/engagement`.
- **OLD visual authority:** `EngagementMissions.tsx` + `EngagementShell.tsx`.
- **NEW owner:** `src/pages/engagement/EngagementMissions.tsx`. Query `src/features/engagement/engagementMissionsApi.ts` + `src/features/engagement/engagementMissionsSession.ts`. Server `server/modules/engagement/missions.ts`.
- **What happens:** Authenticated `GET /api/engagement/missions` → `{ missions: [{ id, scope, title, description, goal_count, reward_xp, reward_promo_coins, reward_energy, metric_key, period_key, progress, completed, claimed }] }`. Daily/Weekly sections. Claim is `POST /api/engagement/missions/:id/claim` with session user only. Promo via wallet promo bucket; XP/Energy via `user_engagement`. Completion is `progress >= goal_count`. Already-claimed retry is idempotent `{ ok: true, alreadyClaimed: true }`.
- **State owner:** Neon `engagement_missions` + `user_mission_progress` (UTC `period_key`). Progress writers: unique 3s video view (`watch`), first like insert (`like`), successful gift send (`gift`). No PAGE-048 WebSocket.
- **Parity tests:** sheet/chrome; Daily/Weekly; loading/error/empty; partial/complete/claimed; named/hardware back Hub; like/watch progress; claim once; concurrent; wallet/payout isolation; Hub reconcile.
- **MANDATORY RETURN GATES:** After live progress FLOW + device pass on `C3U000000005847` → Hub → Missions → real like/watch/gift → claim → back → Hub.

### PAGE-049 Fan level
- **PAGE-049 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/engagement/fan-level` + `GET /api/engagement/fan-level` contract is locked. Android physical-device runtime on `C3U000000005847` was not run here. Gift/watch XP generators and PAGE-078 admin threshold edits remain later. Daily Login XP is granted by PAGE-053 via `grantEngagementXp`. HTTP IT covers flag-off 404, exact/below/above/multi/max thresholds, mission XP reconcile once, wallet/payout isolation, and User B isolation.
- **Route:** `/engagement/fan-level`. Same `ENGAGEMENT_HUB_ENABLED` gate as PAGE-047. Named close `/engagement`.
- **OLD visual authority:** `EngagementFanLevel.tsx` + `EngagementShell.tsx`.
- **NEW owner:** `src/pages/engagement/EngagementFanLevel.tsx`. Query `src/features/engagement/engagementFanLevelApi.ts` + `src/features/engagement/engagementFanLevelSession.ts`. Server `GET /api/engagement/fan-level` → `server/modules/engagement/progression.ts`. Shared tier labels `shared/engagement/fanTiers.ts`.
- **What happens:** Authenticated `GET /api/engagement/fan-level` → `{ fan_level: { level, tier, total_xp, title, badge_code, next_level_total_xp, xp_to_next_level } }`. Loading ≠ level 0. Error ≠ level 0. Tiers from one shared ladder. Level derived from `user_engagement.total_xp` + `xp_level_requirements`. No claim. No client level mutation.
- **State owner:** Neon `user_engagement.total_xp` + `xp_level_requirements`. Mission claim syncs level via `grantEngagementXp`. No PAGE-049 WebSocket.
- **Parity tests:** sheet/chrome; loading/error/zero; named/hardware back Hub; exact/below/above/multi/max; Hub agrees; mission XP once; wallet/payout isolation.
- **MANDATORY RETURN GATES:** After gift/watch/daily-login XP flows + PAGE-078 admin curve + device pass on `C3U000000005847` → Hub → Fan Level → real XP action → back → Hub.

### PAGE-050 MVP
- **PAGE-050 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/engagement/mvp` + `GET /api/engagement/mvp?period=` contract is locked. Android physical-device runtime on `C3U000000005847` was not run here. Watch/comment/share Energy earn (`POST /battle-energy/earn`) stays on the live FLOW — OLD MVP page does not show those rows. HTTP IT covers flag-off 404, today/week/all boards, paid/promo gift points once, starter/test isolation, XP/Energy unchanged, and User B viewer isolation.
- **Route:** `/engagement/mvp`. Same `ENGAGEMENT_HUB_ENABLED` gate as PAGE-047. Named close `/engagement`.
- **OLD visual authority:** `EngagementMvp.tsx` + `EngagementShell.tsx`.
- **NEW owner:** `src/pages/engagement/EngagementMvp.tsx`. Query `src/features/engagement/engagementMvpApi.ts` + `src/features/engagement/engagementMvpSession.ts`. Server `GET /api/engagement/mvp` → `server/modules/engagement/mvp.ts`. Gift writers `addMvpPoints` from paid/promo gift send only.
- **What happens:** Authenticated `GET /api/engagement/mvp?period=today|week|all` → `{ period, leaderboard: [{ rank, user_id, points }], viewer_id }`. Loading ≠ zero. Error ≠ zero. Empty: “No MVP scores yet.” Energy remains a separate engagement resource and is not displayed as a balance on this page.
- **State owner:** Neon `mvp_scores` (server `CURRENT_DATE` `day_key`). Unique `gift_transaction_id` prevents retry doubles. Test/starter gifts do not write points. No PAGE-050 WebSocket.
- **Parity tests:** sheet/chrome; Today/Week/All; loading/error/empty; named/hardware back Hub; paid/promo gift points; test/starter excluded; wallet/XP/Energy isolation.
- **MANDATORY RETURN GATES:** After live watch/comment/share Energy FLOW + device pass on `C3U000000005847` → Hub → MVP → real paid/promo gift → back → Hub.

### PAGE-051 Achievements
- **PAGE-051 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/engagement/achievements` + `GET /api/engagement/achievements` contract is locked. Android physical-device runtime on `C3U000000005847` was not run here. `first_battle` / `watch_100` / `energy_master` triggers stay on later live flows. `streak_7` (`login_streak_days`) is incremented by PAGE-053 on a successful new daily claim. HTTP IT covers flag-off 404, catalog order, like/watch/starter/test isolation, concurrent `gifts_sent` grant-once, promo-gift `mvp_top10`, wallet/payout isolation, User B isolation, and malformed progress 503.
- **Route:** `/engagement/achievements`. Same `ENGAGEMENT_HUB_ENABLED` gate as PAGE-047. Named close `/engagement`.
- **OLD visual authority:** `EngagementAchievements.tsx` + `EngagementShell.tsx`.
- **NEW owner:** `src/pages/engagement/EngagementAchievements.tsx`. Query `src/features/engagement/engagementAchievementsApi.ts` + `src/features/engagement/engagementAchievementsSession.ts`. Server `GET /api/engagement/achievements` → `server/modules/engagement/achievements.ts`.
- **What happens:** Authenticated `GET /api/engagement/achievements` → `{ achievements: [{ id, name, description, icon, goal_count, reward_xp, reward_promo_coins, rarity, progress, unlocked, unlocked_at, claimed }] }`. Canonical identity is `id`. Order `rarity, id`. Loading ≠ empty. Error ≠ empty. No Claim button — rewards auto-grant once on server unlock. Promo via wallet promo bucket; XP via `grantEngagementXp`. No user mutation POST.
- **State owner:** Neon `engagement_achievements` + `user_achievements`. Writers: paid/promo gift → `gifts_sent`; today top-10 after `addMvpPoints` → `mvp_top10`. Test/starter gifts do not write `gifts_sent`. No PAGE-051 WebSocket.
- **Parity tests:** sheet/chrome; locked/unlocked; progress bar; named/hardware back Hub; gift unlock once; MVP top-10; wallet/payout isolation; Hub XP agrees.
- **MANDATORY RETURN GATES:** After battle-join / live-watch / daily-login / energy-spend flows + device pass on `C3U000000005847` → Hub → Achievements → real qualifying action → back → Hub.

### PAGE-052 Reward wallet
- **PAGE-052 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/engagement/rewards` + `GET /api/engagement/wallet` contract is locked. Android physical-device runtime on `C3U000000005847` was not run here. Real store IAP verify and live Energy earn remain later. Daily Login Promo/XP grants are implemented by PAGE-053 and proven against this wallet GET. HTTP IT covers flag-off 404, PAGE-039 field agreement, mission/achievement domain isolation, User B isolation, and no set-balance POST.
- **Route:** `/engagement/rewards`. Same `ENGAGEMENT_HUB_ENABLED` gate as PAGE-047. Named close `/engagement`.
- **OLD visual authority:** `EngagementRewards.tsx` + `EngagementShell.tsx`.
- **NEW owner:** `src/pages/engagement/EngagementRewards.tsx`. Query `src/features/engagement/engagementRewardWalletApi.ts` + `src/features/engagement/engagementRewardWalletSession.ts`. Server `GET /api/engagement/wallet` → `server/modules/engagement/rewardWallet.ts`.
- **What happens:** Authenticated `GET /api/engagement/wallet` → `{ wallet: { purchasedCoins, starterCoins, promotionalCoins, totalGiftSpendable, battleEnergy, totalXp, fanLevel, fanTier } }`. Paid/starter/promo from `wallet_balances` (PAGE-039). Energy/XP/level from `getProgressionSnapshot` (PAGE-049). `totalGiftSpendable` is display-only. No history. No test coins. No Claim. No POST.
- **State owner:** Neon `wallet_balances` + `user_engagement`. No PAGE-052 WebSocket. No client balance mutation.
- **Parity tests:** sheet/chrome; unmerged cards; loading/error ≠ zero; named/hardware back Hub; wallet agreement; mission/achievement domains; payout isolation.
- **MANDATORY RETURN GATES:** After PAGE-038 live IAP + PAGE-053 daily-login grants + live Energy earn + device pass on `C3U000000005847` → Hub → Reward Wallet → real reward action → back → Hub.

### PAGE-053 Daily login
- **PAGE-053 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/engagement/daily-login` + `GET /api/engagement/daily-login` + `POST /api/engagement/daily-login/claim` contract is locked. Android physical-device runtime on `C3U000000005847` was not run here. A live next-UTC-day claim after a real today-claim still needs a controlled server-clock fixture (missed-day and Day-7 wrap are proven by inserting prior UTC dates). HTTP IT covers flag-off 404, 7-day config, once-per-UTC-day claim, concurrent/idempotent retry, Day-4 promo isolation, Day-7 wrap, missed-day reset, malformed config 503, wallet/payout/test-coin isolation, Hub/Fan Level/Reward Wallet reconcile, and User B isolation.
- **Route:** `/engagement/daily-login`. Same `ENGAGEMENT_HUB_ENABLED` gate as PAGE-047. Named close `/engagement`.
- **OLD visual authority:** `EngagementDailyLogin.tsx` + `EngagementShell.tsx`.
- **NEW owner:** `src/pages/engagement/EngagementDailyLogin.tsx`. Query `src/features/engagement/engagementDailyLoginApi.ts` + `src/features/engagement/engagementDailyLoginSession.ts`. Server `GET /api/engagement/daily-login` + `POST /api/engagement/daily-login/claim` → `server/modules/engagement/dailyLogin.ts`. Config `daily_reward_config`. Claims `daily_login_claims`. Hub summary reuses `getDailyLoginSummary`.
- **What happens:** Authenticated `GET /api/engagement/daily-login` → `{ daily: { can_claim, streak_day, claimed_today, next_reward, days } }`. Claim is `POST /api/engagement/daily-login/claim` with session user only. Server UTC calendar day owns eligibility. Consecutive UTC days continue 1–7; a missed UTC day or Day 7 wraps to Day 1. Already-claimed retry is idempotent `{ ok: true, alreadyClaimed: true, reward: null }`. Promo via wallet promo bucket; XP via `grantEngagementXp`. Cosmetic labels grant 0/0. No client-chosen day/reward. No countdown authority.
- **State owner:** Neon `daily_reward_config` + `daily_login_claims` unique `(user_id, claim_date)`. No PAGE-053 WebSocket. No client claim/streak store.
- **Parity tests:** 7-day card; claimed/current/future; named/hardware back Hub; once-per-day; concurrent; device-clock body ignored; Hub/wallet/fan-level reconcile.
- **MANDATORY RETURN GATES:** After a controlled UTC day-boundary fixture + device pass on `C3U000000005847` → Hub → Daily Login → real claim → next server day → claim → back → Hub.

### PAGE-054 Collections
- **PAGE-054 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/engagement/collections` + `GET /api/engagement/treasure|stickers|creator-cards` + `POST /api/engagement/treasure/:chestId/open` contract is locked. Public `POST /api/engagement/treasure/spawn` stays `403 SPAWN_SERVER_ONLY`. Invented `GET /api/engagement/collections` saved/liked stub was removed. Android physical-device runtime on `C3U000000005847` was not run here. LIVE watch chest spawn, watch sticker drop, and watch-minutes card unlock remain later live-flow work. Server-restart persistence was not run here. HTTP IT covers flag-off 404, empty inventory, spawn 403, cooldown spawn, open once/concurrent/idempotent, forged reward body ignored, foreign chest 404, sticker grant + set-complete once, creator-card bronze/silver, Daily Login Day 5 + mission-claim chest spawn, wallet/payout/test-coin isolation, User B isolation, and malformed catalog 503.
- **Route:** `/engagement/collections`. Same `ENGAGEMENT_HUB_ENABLED` gate as PAGE-047. Named close `/engagement`.
- **OLD visual authority:** `EngagementCollections.tsx` + `EngagementShell.tsx`.
- **NEW owner:** `src/pages/engagement/EngagementCollections.tsx`. Query `src/features/engagement/engagementCollectionsApi.ts` + `src/features/engagement/engagementCollectionsSession.ts`. Server `server/modules/engagement/collections.ts`. Catalog/inventory Neon `treasure_chest_defs` / `user_treasure_chests` / `sticker_sets` / `sticker_defs` / `user_stickers` / `user_sticker_set_completions` / `creator_card_defs` / `user_creator_cards` / `user_creator_collection_progress`. Hub link remains PAGE-047.
- **What happens:** Authenticated parallel GETs for treasure, stickers, creator cards. No tabs: Treasure Hunt, Stickers, Creator Cards stacked. Open is `POST /api/engagement/treasure/:chestId/open` with session user only. Reward is catalog-fixed on the server (`treasure_chest_defs`), never client-chosen. Spawn is server-only (watch later; mission claim → `chest_rare_missions` + `chest_epic_streams` when `metric_key === unique_creators`; Daily Login Day 5 → `chest_rare_missions`, Day 7 → `chest_legendary_streak`). Stickers increment `count` on duplicate; first set complete grants 250 Promo + 100 XP once. Creator cards use canonical `creator_id` UUID; paid/promo gifts progress cards; starter/test do not. `/api/stickers/*` remains camera/creator overlay stickers, not this page.
- **State owner:** Neon collection tables above. Open + grant is one transaction. No PAGE-054 WebSocket. No client inventory store. No localStorage authority.
- **Parity tests:** three sections; loading/error ≠ empty; named/hardware back Hub; open once; Hub handoff; wallet/fan-level/energy reconcile.
- **MANDATORY RETURN GATES:** After LIVE watch spawn/sticker/card writers + device pass on `C3U000000005847` → Hub → Collections → real watch-earned chest/sticker/card → open/reload → back → Hub. After a server restart/redeploy → rerun opened-chest and sticker/card persistence.

### PAGE-055 Rising Stars
- **PAGE-055 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/rising-stars` landing is locked. PAGE-056 challenge-card handoff (`/rising-stars/challenge/${encodeURIComponent(id)}`) is proven; landing still has no Submit/Withdraw/Attach/Join team. Android physical-device runtime on `C3U000000005847` and a server-restart season display remain deferred. PAGE-077 freeze/snapshot/disqualify still later.
- **Route:** `/rising-stars`. Authenticated page (`RequireAuth`). Landing GETs are public. Named back `/feed` unless `returnTo` (Discover uses `containerReturnState(DISCOVER_HOME)`).
- **OLD visual authority:** `src/pages/RisingStars.tsx` + `RisingStarsTopBar` (read-only). NEW owner writes from that spec; no OLD source copied.
- **NEW owner:** `src/pages/RisingStars.tsx`. Query `src/features/risingStars/risingStarsApi.ts` + `src/features/risingStars/risingStarsSession.ts`. Server `server/modules/risingStars/hub.ts` + landing routes in `server/modules/risingStars/router.ts`. Neon established `rs_*` tables (`20260822060000_rising_stars_page055.sql` extends them).
- **What happens:** `GET /api/rising-stars/seasons/current` then categories/regions/standings/teams/challenges. Filters are presentation; challenge list is server-filtered. Challenge card hands off `/rising-stars/challenge/:challengeId` only. No enter/vote/join/live/admin on this page. Rewards/badges endpoints exist; landing does not render award state. Season current = `status = 'active'` (not device clock). Rank/score from server standings only.
- **State owner:** Neon `rs_seasons`, `rs_categories`, `rs_regions`, `rs_challenges`, `rs_entries`, `rs_votes`, `rs_teams`, `rs_team_members`, `rs_phase_results`, `rs_badges`, `rs_user_badges`, `rs_reward_definitions`, `rs_reward_grants`, `rs_admin_audit`. Valkey is the generic request limiter only. Enter/vote/fraud `fraud:rs_vote` are PAGE-056.
- **Parity tests:** loading/error ≠ empty; empty active season copy; season/categories/regions/challenges/standings/teams; named/hardware back; challengeId handoff; filter race; public GETs; no items list on `GET /`.
- **MANDATORY RETURN GATES:** PAGE-056 challenge-card handoff + no landing mutation is proven (PAGE-056 ownership + RisingStars landing tests). After PAGE-077 admin freeze/snapshot/disqualify → rerun frozen/closed season display. After device pass on `C3U000000005847` and a server restart → open `/rising-stars` against a real active season.

### PAGE-056 Rising Stars challenge
- **PAGE-056 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/rising-stars/challenge/:challengeId` contract is locked. HTTP IT covers public detail, eligibility, idempotent/concurrent enter, self-vote, daily vote, leaderboard, team create/join, foreign Live attach, attach, live-end association, withdraw, and wallet/GBP isolation. Android physical-device runtime on `C3U000000005847` was not run here. Real LiveKit host + multi-spectator watch of an attached room remains PAGE-018/019. PAGE-077 freeze/disqualify remains later.
- **Route:** `/rising-stars/challenge/:challengeId`. Authenticated page (`RequireAuth`). Detail/entries/leaderboard/live GETs are public. Mutations require auth.
- **OLD visual authority:** `src/pages/RisingStarsChallenge.tsx` (read-only). NEW owner writes from that spec; no OLD source copied.
- **NEW owner:** `src/pages/RisingStarsChallenge.tsx`. Query `src/features/risingStars/risingStarsApi.ts` + `src/features/risingStars/risingStarsChallengeSession.ts`. Server `server/modules/risingStars/challenge.ts` + challenge/entry/team/live routes in `server/modules/risingStars/router.ts`. Limiters `server/modules/risingStars/limiters.ts`.
- **What happens:** `GET /api/rising-stars/challenges/:id` → `{ challenge, voted_today, my_entry, my_team_ids }`. Entries `GET .../entries`. Leaderboard `GET .../leaderboard` ranks `ORDER BY vote_count DESC, created_at ASC`. Enter `POST .../enter` `{ videoId, teamId? }` session user only, sound match, window `NOW()`. Withdraw `DELETE /api/rising-stars/entries/:id`. Vote `POST /api/rising-stars/entries/:id/vote` one per user per challenge per `CURRENT_DATE`. Teams `POST /api/rising-stars/teams` + `POST /api/rising-stars/teams/:id/join`. Live attach `POST .../live/attach` `{ phase, roomId }` against canonical `live_streams.room_id` (= host user id). Qualifier/Final watch → `/watch/:roomId` (PAGE-019). Named back `/rising-stars` unless `returnTo`.
- **State owner:** Neon `rs_challenges` / `rs_entries` unique `(challenge_id, user_id)` / `rs_votes` unique `(user_id, challenge_id, vote_day)` / `rs_teams` / `rs_team_members`. Valkey `rl:rs_enter`, `rl:rs_vote`, `fraud:rs_vote` only. No PAGE-056 WebSocket. No second LiveKit stack.
- **Parity tests:** loading/error ≠ empty entries; named/hardware back landing; deep link auth; enter eligibility/idempotent/concurrent; withdraw; vote self/daily; leaderboard rank; team join once; foreign attach 403; live-end keeps association; wallet/payout isolation.
- **MANDATORY RETURN GATES:** After PAGE-077 freeze/disqualify → rerun frozen enter/vote/withdraw/attach denied. After a genuine PAGE-018 Live on the participant’s canonical `roomId` + device pass on `C3U000000005847` → Attach live → Qualifier/Final → PAGE-019 watch, then back to the challenge. After a server restart/redeploy → rerun entry/vote/team/attach persistence.

Legal/support pages PAGE-057–069 share: public route; readable document (or hub of links); named back; linked from Register and/or Settings as OLD; **no ticket/support POST** unless the named file posts (none of these do). State owner: static content. Session: public, no auth required. Loading: none beyond render. Error: missing asset would be a missing reference — files exist as named below.

### PAGE-057 Terms
- **PAGE-057 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/terms` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. PAGE-058 Privacy and PAGE-059 Copyright now exist as full documents; Terms still only references Privacy Policy and Copyright / DMCA in prose (no invented `/privacy` or `/copyright` controls). `public/terms.html` is a shorter web static file still used by unfinished later legal stubs and is not this page’s source.
- **CROSS-PAGE FINDING (from PAGE-002, do not fix on PAGE-002):** Terms Close from a Register-opened Terms sheet returns to `/login`. That belongs to PAGE-057 Terms, not PAGE-002. Record and fix here when PAGE-057 is open.
- **Route:** `/terms` public. Logged-out and logged-in both render. Named close Settings unless `returnTo`. Hardware back matches that map.
- **OLD visual authority:** `src/pages/Terms.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Legal text is reproduced.
- **NEW owner:** `src/pages/Terms.tsx` + canonical copy `src/content/legalTerms.ts`. Shared chrome: `SettingsOptionSheet`. No `LegalDocPage` iframe. No `GET/POST /api/terms`. No acceptance checkbox on this page (Register consent remains PAGE-002).
- **What happens:** Static Terms of Service. Title **Terms of Service**. Last updated **July 23, 2026**. Twenty-seven numbered sections in OLD in-app order. iOS uses the App Store coin sentence; other platforms use Apple IAP / Google Play Billing. Contact emails are text, not invented mailto controls. Settings footer and Register `Link to="/terms"` already hand off here. Login has no Terms link.
- **State owner:** compile-time `legalTerms.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 27 headings; date/age/12-month/14-day/contact markers; named/hardware back Settings; Settings + Register handoff; no iframe / terms.html / I Agree.
- **MANDATORY RETURN GATES:** PAGE-058 Privacy and PAGE-059 Copyright now exist as full documents; Terms still only references Privacy and Copyright / DMCA in prose (no extra invented links). PAGE-060 Legal Hub now hands `/terms` with `returnTo: /legal`. After device pass on `C3U000000005847` → logged-out `/terms` scroll first-to-last clause + Settings → Terms → back.

### PAGE-058 Privacy
- **PAGE-058 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/privacy` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. PAGE-059 Copyright now exists as a full document; Privacy still has no invented Copyright control. Terms still has no Privacy control. `public/privacy.html` is a shorter web static file (July 21, 2026) used by other static pages and is not this page’s source.
- **Route:** `/privacy` public. Logged-out and logged-in both render. Named close Settings unless `returnTo`. Hardware back matches that map. In-document **Go to Settings** opens `/settings` and keeps current location state.
- **OLD visual authority:** `src/pages/Privacy.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Legal text is reproduced.
- **NEW owner:** `src/pages/Privacy.tsx` + canonical copy `src/content/legalPrivacy.ts`. Shared chrome: `SettingsOptionSheet`. No `LegalDocPage` iframe. No `GET/POST /api/privacy`. No acceptance checkbox. No cookie banner.
- **What happens:** Static Privacy Policy. Title **Privacy Policy**. Last updated **February 20, 2026**. Intro plus fourteen numbered sections in OLD in-app order. Contact emails are text. Settings footer, Register `Link to="/privacy"`, Safety **Data & Personalization**, and coin-purchase Privacy already hand off here. Login has no Privacy link.
- **State owner:** compile-time `legalPrivacy.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 14 headings; date/13/30-day/7-year/ICO/contact markers; named/hardware back Settings; Settings + Register handoff; Go to Settings; no iframe / privacy.html / I Agree.
- **MANDATORY RETURN GATES:** PAGE-059 Copyright now exists as a full document; Privacy still has no invented Copyright control. PAGE-060 Legal Hub now hands `/privacy` with `returnTo: /legal`. After device pass on `C3U000000005847` → logged-out `/privacy` scroll first-to-last clause + Settings → Privacy → back.

### PAGE-059 Copyright
- **PAGE-059 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/copyright` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. PAGE-064 DMCA now exists as a full document; Copyright only hands `/legal/dmca` with `returnTo: /copyright` (no duplicated DMCA body). PAGE-060 Legal Hub now lists Copyright Notice and hands `/copyright` with `returnTo: /legal`. FLOW-031 audio-block tables are not in NEW.
- **Route:** `/copyright` public. Logged-out and logged-in both render. Named close Settings unless `returnTo`. Hardware back matches that map.
- **OLD visual authority:** `src/pages/Copyright.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Legal text is reproduced.
- **NEW owner:** `src/pages/Copyright.tsx` + canonical copy `src/content/legalCopyright.ts`. Shared chrome: `SettingsOptionSheet`. No `PageScaffold` stub. No report form. No `GET/POST /api/copyright`.
- **What happens:** Static Copyright Notice. Title **Copyright Notice**. Lead line **© 2026 Elix Star Live Ltd. All rights reserved.** Five sections in OLD order: Ownership, User Content, Third-Party Content, Trademarks, Report Copyright Infringement. Report method is DMCA Policy control → `/legal/dmca` plus text email `dmca@elixstarlive.com`. No last-updated date in OLD.
- **State owner:** compile-time `legalCopyright.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 5 headings; © 2026 / licence / DMCA email markers; named/hardware back Settings; DMCA Policy → `/legal/dmca` with `returnTo: /copyright`; no form / iframe / claim-success copy.
- **MANDATORY RETURN GATES:** PAGE-064 DMCA now exists as a full document; Copyright DMCA button → `/legal/dmca` → Close → `/copyright` is proven. PAGE-060 Legal Hub now lists Copyright Notice; hub → `/copyright` → Close → `/legal` is proven. After device pass on `C3U000000005847` → logged-out `/copyright` scroll + Close.

### PAGE-060 Legal hub
- **PAGE-060 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/legal` hub is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. Hub hands every OLD row with `returnTo: /legal`. PAGE-057/058/059, PAGE-061 Audio, PAGE-062 UGC, PAGE-063 Affiliate, PAGE-064 DMCA, PAGE-065 Legal Safety, and PAGE-066 Legal Supplier destinations are already real documents. OLD hub has no Guidelines / How It Works / Support rows.
- **Route:** `/legal` public. Logged-out and logged-in both render. Named close Settings unless `returnTo`. Hardware back matches that map.
- **OLD visual authority:** `src/pages/Legal.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied.
- **NEW owner:** `src/pages/Legal.tsx` + canonical inventory `src/content/legalHub.ts`. Shared chrome: `SettingsOptionSheet`. No `PageScaffold` stub. No `GET /api/legal/pages`. No child-document body on the hub.
- **What happens:** Static Legal Hub. Title **Legal**. Nine rows in OLD order: Terms & Conditions, Privacy Policy, Copyright Notice, Audio & Music Disclaimer, UGC Disclaimer, Affiliate / Sponsored Disclosure, Supplier Agreement, DMCA / Copyright Report, Safety. Footer text contacts `dmca@elixstarlive.com` and `support@elixstarlive.co.uk` (not mailto, not `/support`). Each row opens its canonical route with `{ returnTo: '/legal' }`.
- **State owner:** compile-time `legalHub.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 9 labels/order; footer emails; each handoff + returnTo; named/hardware back Settings; no iframe / form / invented rows.
- **MANDATORY RETURN GATES:** PAGE-061 Audio now exists as a full document; hub → `/legal/audio` → Close → `/legal` is proven. PAGE-063 Affiliate now exists as a full document; hub → `/legal/affiliate` → Close → `/legal` is proven. PAGE-064 DMCA now exists as a full document; hub → `/legal/dmca` → Close → `/legal` is proven. PAGE-065 Legal Safety now exists as a full document; hub → `/legal/safety` → Close → `/legal` is proven. PAGE-066 Legal Supplier now exists as a full document; hub → `/legal/supplier` → Close → `/legal` is proven. After device pass on `C3U000000005847` → logged-out `/legal` + Close + hardware back.

### PAGE-061 Legal audio
- **PAGE-061 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/legal/audio` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. PAGE-064 DMCA now exists as a full document; Audio still only mentions a DMCA takedown notice in prose (no `/legal/dmca` control). FLOW-031 audio-block tables / `AUDIO_BLOCKED` are not in NEW. PAGE-016 Music/Sound was not changed.
- **Route:** `/legal/audio` public. Logged-out and logged-in both render. Named close Settings unless `returnTo` (Legal Hub passes `{ returnTo: '/legal' }`). Hardware back matches that map.
- **OLD visual authority:** `src/pages/LegalAudio.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Legal text is reproduced.
- **NEW owner:** `src/pages/LegalAudio.tsx` + canonical copy `src/content/legalAudio.ts`. Shared chrome: `SettingsOptionSheet`. No `LegalDocPage` iframe of `terms.html`. No `GET/POST /api/audio`.
- **What happens:** Static Audio & Music Disclaimer. Title **Audio & Music Disclaimer**. Five sections in OLD order: Audio Content, User Responsibility, Audio Removal, Live Streaming Audio, Contact. Contact is text `legal@elixstarlive.com`. No last-updated date. No Terms/Privacy/Copyright/UGC/DMCA/Support controls.
- **State owner:** compile-time `legalAudio.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 5 headings; licence / live-mute / legal@ markers; named/hardware back Settings; Legal Hub round-trip; no iframe / form / fake licence status.
- **MANDATORY RETURN GATES:** PAGE-064 DMCA now exists as a full document; Audio still only mentions DMCA in prose (no invented DMCA control). After FLOW-031 exists → compare automatic mute/remove wording to real `AUDIO_BLOCKED` behaviour. After device pass on `C3U000000005847` → logged-out `/legal/audio` scroll + Hub → Audio → back.

### PAGE-062 Legal UGC
- **PAGE-062 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/legal/ugc` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. PAGE-064 DMCA now exists as a full document; UGC only hands `/legal/dmca` with `returnTo: /legal/ugc`. Terms and Guidelines remain prose-only on this page. PAGE-063 Affiliate now exists as a full document (separate owner).
- **Route:** `/legal/ugc` public. Logged-out and logged-in both render. Named close Settings unless `returnTo` (Legal Hub passes `{ returnTo: '/legal' }`). Hardware back matches that map.
- **OLD visual authority:** `src/pages/LegalUGC.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Legal text is reproduced.
- **NEW owner:** `src/pages/LegalUGC.tsx` + canonical copy `src/content/legalUgc.ts`. Shared chrome: `SettingsOptionSheet`. No `LegalDocPage` iframe. No `GET/POST /api/ugc`. No acceptance checkbox.
- **What happens:** Static User-Generated Content Policy. Title **User-Generated Content Policy**. Six sections in OLD order: About UGC, User Responsibility, Content Verification, Licence Grant, Content Removal, Disclaimer. Only in-page control: **DMCA Policy** → `/legal/dmca`. No last-updated date.
- **State owner:** compile-time `legalUgc.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 6 headings; licence / rights / safe-harbour / DMCA markers; named/hardware back Settings; Legal Hub round-trip; DMCA Policy → `/legal/dmca` with `returnTo: /legal/ugc`; no iframe / form / fake rights status.
- **MANDATORY RETURN GATES:** PAGE-064 DMCA now exists as a full document; UGC DMCA button → `/legal/dmca` → Close → `/legal/ugc` is proven. PAGE-067 Guidelines now exists as a full document; UGC still only references Community Guidelines in prose (no `/guidelines` control). After device pass on `C3U000000005847` → logged-out `/legal/ugc` scroll + Hub → UGC → back.

### PAGE-063 Legal affiliate
- **PAGE-063 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/legal/affiliate` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. This is a disclosure / sponsored-content legal page, not an Elix referral-commission product. PAGE-064 DMCA is not linked from this page. PAGE-045 remains creator payout owner. PAGE-074/076 remain later admin owners.
- **Route:** `/legal/affiliate` public. Logged-out and logged-in both render. Named close Settings unless `returnTo` (Legal Hub passes `{ returnTo: '/legal' }`). Hardware back matches that map.
- **OLD visual authority:** `src/pages/LegalAffiliate.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Legal text is reproduced.
- **NEW owner:** `src/pages/LegalAffiliate.tsx` + canonical copy `src/content/legalAffiliate.ts`. Shared chrome: `SettingsOptionSheet`. No `LegalDocPage` iframe of `terms.html`. No affiliate API, signup, referral code, commission ledger, or payout system.
- **What happens:** Static Affiliate & Sponsored Content. Title **Affiliate & Sponsored Content**. Four sections in OLD order: Disclosure, Creator Responsibilities, Platform Partnerships, User Protection. Contact is text `legal@elixstarlive.com`. No last-updated date. No Terms/Privacy/Copyright/DMCA/Support controls. No commission %, payout threshold, or signup form.
- **State owner:** compile-time `legalAffiliate.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 4 headings; ASA / FTC / legal@ markers; named/hardware back Settings; Legal Hub round-trip; no iframe / form / fake earnings or referral codes.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → logged-out `/legal/affiliate` scroll + Hub → Affiliate → back. PAGE-069 Support now exists; Affiliate still only uses text `legal@elixstarlive.com` (no invented `/support` control). PAGE-064 is not a destination from this page.

### PAGE-064 Legal DMCA
- **PAGE-064 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/legal/dmca` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. Information-only: notices and counter-notices go to `mailto:dmca@elixstarlive.com`. No DMCA API, form, case ID, evidence upload, or takedown backend. PAGE-046 Report, PAGE-072 Admin Reports, FLOW-031 audio block, and PAGE-065 Safety remain separate. PAGE-045/074/076 untouched.
- **Route:** `/legal/dmca` public. Logged-out and logged-in both render. Named close Settings unless `returnTo` (Legal Hub `/legal`, Copyright `/copyright`, UGC `/legal/ugc`). Hardware back matches that map.
- **OLD visual authority:** `src/pages/LegalDMCA.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Legal text is reproduced.
- **NEW owner:** `src/pages/LegalDMCA.tsx` + canonical copy `src/content/legalDmca.ts`. Shared chrome: `SettingsOptionSheet`. No `LegalDocPage` iframe of `terms.html`. No `GET/POST /api/dmca`.
- **What happens:** Static DMCA / Copyright Policy. Title **DMCA / Copyright Policy**. Intro plus four sections in OLD order: Copyright Infringement Notification, Counter-Notification, Repeat Infringers, Contact Our DMCA Agent. Contact is text `dmca@elixstarlive.com` plus **Email DMCA Agent** `mailto` control. No last-updated date. No Terms/Privacy/Support/Safety controls. No in-app claim form.
- **State owner:** compile-time `legalDmca.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 4 headings; perjury / repeat-infringer / mailto markers; named/hardware back Settings; Legal Hub / Copyright / UGC returnTo; no iframe / form / fake case ID.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → logged-out `/legal/dmca` scroll + Hub → DMCA → back + mailto open. After FLOW-029/PAGE-072 exist → compare repeat-infringer wording to actual enforcement. After FLOW-031 exists → keep automatic audio block separate from this notice path. PAGE-065 is not a destination from this page.

### PAGE-065 Legal safety
- **PAGE-065 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/legal/safety` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. Information-only Safety Centre policy. PAGE-041 `/settings/safety` remains the interactive Safety Center and is a separate authenticated route. No Safety API, report form, block controls, or emergency backend. PAGE-046/044/067/069/072 and FLOW-025/029 remain separate owners. PAGE-066 Supplier is a separate legal document and is not a destination from this page.
- **Route:** `/legal/safety` public. Logged-out and logged-in both render. Named close Settings unless `returnTo` (Legal Hub passes `{ returnTo: '/legal' }`). Hardware back matches that map. Does not redirect to `/settings/safety`.
- **OLD visual authority:** `src/pages/LegalSafety.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Legal text is reproduced.
- **NEW owner:** `src/pages/LegalSafety.tsx` + canonical copy `src/content/legalSafety.ts`. Shared chrome: `SettingsOptionSheet`. No `LegalDocPage` iframe of `child-safety.html`. No `GET/POST /api/safety`.
- **What happens:** Static Safety Centre. Title **Safety Centre**. Intro plus seven sections in OLD order: Reporting Content, Blocking Users, Live Stream Safety, Content Moderation, Child Safety, Emergency Resources, Contact Us. Contact is text `safety@elixstarlive.com` (no mailto). Community Guidelines and Settings → Blocked Accounts are prose only. Emergency numbers are informational. No last-updated date.
- **State owner:** compile-time `legalSafety.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 7 headings; under-13 / 999 / 988 / safety@ markers; named/hardware back Settings; Legal Hub round-trip; `/legal/safety` vs `/settings/safety` separation; no iframe / form / fake report success.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → logged-out `/legal/safety` scroll + Hub → Safety → back. PAGE-067 Guidelines now exists as a full document; Legal Safety still only mentions Community Guidelines in prose (no `/guidelines` control). After FLOW-025 creator kick/remove-viewer is proven or documented → compare “remove disruptive viewers” wording. PAGE-066 is not a destination from this page.

### PAGE-066 Legal supplier
- **PAGE-066 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/legal/supplier` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. Information-only Supplier Agreement framework for the buy-only Shop. No supplier portal, onboarding, vendor API, invoice workflow, or supplier payment system. PAGE-045 remains creator payout owner. PAGE-074/075/076 remain later admin owners. PAGE-067 Guidelines is a separate document and is not a destination from this page.
- **Route:** `/legal/supplier` public. Logged-out and logged-in both render. Named close Settings unless `returnTo` (Legal Hub passes `{ returnTo: '/legal' }`). Hardware back matches that map.
- **OLD visual authority:** `src/pages/LegalSupplier.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Legal text is reproduced.
- **NEW owner:** `src/pages/LegalSupplier.tsx` + canonical copy `src/content/legalSupplier.ts`. Shared chrome: `SettingsOptionSheet`. No `LegalDocPage` iframe of `supplier-agreement.html`. No `GET/POST /api/supplier`.
- **What happens:** Static Supplier Agreement. Title **Supplier Agreement**. Last updated **July 15, 2026**. Eleven numbered sections in OLD order: Parties, Supply of Goods, Compliance & Product Safety, Intellectual Property, Pricing, Invoices & Payment, Title, Risk & Returns, Confidentiality, Liability & Indemnity, Term & Termination, Governing Law, Contact. Contacts are text Company / `info@elixstarlive.co.uk` / `support@elixstarlive.co.uk` (no mailto). No Terms/Privacy/Affiliate/Support/Guidelines controls. Footer states a signed PO or commercial schedule is required for a binding relationship.
- **State owner:** compile-time `legalSupplier.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 11 headings; Net 30 / VAT / England and Wales / contact markers; named/hardware back Settings; Legal Hub round-trip; no iframe / form / fake invoice or contract-acceptance state.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → logged-out `/legal/supplier` scroll + Hub → Supplier → back. PAGE-069 Support now exists; Supplier still only uses text `support@elixstarlive.co.uk` (no invented `/support` control). PAGE-067 is not a destination from this page.

### PAGE-067 Guidelines
- **PAGE-067 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/guidelines` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. Information-only Community Guidelines. Report a Violation hands PAGE-046 `/report`. No Guidelines API, strike system, content scanning, or moderation backend. PAGE-041 remains interactive Safety Center. PAGE-062/065 mention Community Guidelines in prose only (no `/guidelines` control). Legal Hub does not list Guidelines. PAGE-068 How It Works now links `/guidelines` and does not own Guidelines content.
- **Route:** `/guidelines` public. Logged-out and logged-in both render. Named close Settings unless `returnTo` (Settings passes `{ returnTo: '/settings' }`; Safety Center passes incoming Settings return or `/settings/safety`). Hardware back matches that map.
- **OLD visual authority:** `src/pages/Guidelines.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Guideline text is reproduced.
- **NEW owner:** `src/pages/Guidelines.tsx` + canonical copy `src/content/guidelines.ts`. Shared chrome: `SettingsOptionSheet`. No `PageScaffold` stub. No `GET/POST /api/guidelines`.
- **What happens:** Static Community Guidelines. Title **Community Guidelines**. Last updated **February 4, 2026**. Intro plus six icon sections in OLD order: Be Kind and Respectful, Keep Content Safe, Be Authentic, Respect Intellectual Property, No Illegal Activities, Consequences. Footer report paragraph plus **Report a Violation** → `/report` with child `returnTo`. **Go to Settings** uses the same named exit as Close. No accordion. No Copyright/Audio/UGC/Legal Safety/Support/How It Works controls.
- **State owner:** compile-time `guidelines.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 6 headings; date / harassment / copyright / ban markers; named/hardware back Settings; Settings + Safety Center returnTo; Report handoff; no iframe / form / accordion / fake strike state.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → logged-out `/guidelines` scroll + Settings → Guidelines → back + Safety Center → Guidelines → back + Report a Violation. PAGE-069 Support now exists; Guidelines still has no `/support` control. PAGE-068 How It Works → Community Guidelines → `/guidelines` with How It Works or Settings `returnTo` is proven.

### PAGE-068 How it works
- **PAGE-068 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/how-it-works` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. Information-only product guide. CTAs: Engagement Hub `/engagement`, Help & Support `/support` (PAGE-069 destination now real), Community Guidelines `/guidelines`. No How It Works API, tutorial progress, camera, LiveKit, or money mutation. Legal Hub does not list How It Works.
- **Route:** `/how-it-works` public. Logged-out and logged-in both render. Named close Settings unless `returnTo` (Settings passes `{ returnTo: '/settings' }`). Hardware back matches that map.
- **OLD visual authority:** `src/pages/HowItWorks.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Explanatory text is reproduced.
- **NEW owner:** `src/pages/HowItWorks.tsx` + canonical copy `src/content/howItWorks.ts`. Shared chrome: `SettingsOptionSheet`. No `PageScaffold` rewrite. No `GET/POST /api/how-it-works`.
- **What happens:** Static How the app works. Title **How the app works**. Lead **Full guide for fans and creators. Last updated: August 5, 2026**. Intro plus eleven icon sections in OLD order: Main tabs; Videos, sound & duets; Going LIVE & watching; Battles (PK); Gifts, coins & shop; Creator monetisation (how you earn); Engagement Hub; Ranking & membership; Social & inbox; Safety & account; Quick tips. Footer CTAs: **Open Engagement Hub**, **Help & Support**, **Community Guidelines**.
- **State owner:** compile-time `howItWorks.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 11 headings; £0 / £1,000 / IAP / Stripe / test-coin markers; named/hardware back Settings; Settings returnTo; CTA handoffs; no iframe / form / tutorial progress.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → logged-out `/how-it-works` scroll + Settings → How the app works → back. PAGE-069 Support now exists; Help & Support → `/support` → back to How It Works or Settings `returnTo` is proven in PAGE-068 and PAGE-069 tests.

### PAGE-069 Support
- **PAGE-069 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own public `/support` document is locked. Android physical-device runtime on `C3U000000005847` and iOS runtime were not run here. Information/contact only. Contact Support and footer use `mailto:support@elixstarlive.co.uk`. No ticket POST, no invented `/api/support`, no fake Message Sent, no live chat. OLD in-page Contact Support form posted through PAGE-046 `apiCreateReport` and showed fake 24-hour success — that workaround is not reproduced. PAGE-070 Admin Dashboard is a separate authenticated admin page and is not a Support destination.
- **Route:** `/support` public. Logged-out and logged-in both render. Named close Settings unless `returnTo` (Settings, Safety Center, and How It Works pass their return). Hardware back matches that map.
- **OLD visual authority:** `src/pages/Support.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied. Approved Help & Support copy is reproduced.
- **NEW owner:** `src/pages/Support.tsx` + canonical copy `src/content/support.ts`. Shared chrome: `SettingsOptionSheet`. No `LegalDocPage` iframe. No `GET/POST /api/support`.
- **What happens:** Static Help & Support. Title **Help & Support**. Quick Links: Contact Support (mailto), Safety Center `/settings/safety`, Community Guidelines `/guidelines`. Eight FAQ items, default closed, multi-open. Legal rows: Terms `/terms`, Privacy `/privacy`, Copyright `/copyright`. Footer **Email us directly** `support@elixstarlive.co.uk`.
- **State owner:** compile-time `support.ts`. No Neon, Valkey, WS, or LiveKit.
- **Parity tests:** public + authed render; 8 FAQ questions; mailto contact; named/hardware back Settings; Settings / Safety Center / How It Works returnTo; Safety/Guidelines/legal handoffs; no iframe / form / ticket POST / Message Sent.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → logged-out `/support` scroll + Settings → Help & Support → back + Safety Center → Contact Support → back + How It Works → Help & Support → back. After native mail-client pass → Contact Support mailto opens the device mail composer. PAGE-070 is not a destination from this page.

### PAGE-070 Admin dashboard
- **PAGE-070 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/admin` dashboard is locked. Child PAGE-071–078 remain those pages (handoff links only). Android genuine admin/non-admin runtime on `C3U000000005847` and iOS runtime were not run here.
- **Route:** `/admin`. Authenticated admin-only. Client gate `RequireAdmin` (`user.isAdmin === true`). Logged-out → `/login`. Non-admin / unknown admin → `/feed`. No admin-data flash: App blocks unauthenticated non-public routes before the page mounts; `RequireAdmin` does not render the outlet until `isAdmin === true`.
- **Admin authority:** ledger `profiles.is_admin`. NEW has no `profiles` table. Canonical flag is `users.is_admin`, exposed as `user.isAdmin` from `/api/auth/me`. Server `requireAdmin` re-reads `SELECT is_admin FROM users WHERE id = $1 AND deleted_at IS NULL` and denies unless `=== true`. Fail closed on null/unknown/DB error. No email allowlist, hardcoded UUID, localStorage flag, query-param, or debug bypass.
- **OLD visual authority:** `C:\Users\Absm Construction\Desktop\Elix Star Live\src\pages\admin\Dashboard.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied.
- **OLD backend authority:** `GET /api/admin/stats/dau` in OLD `server/routes/adminActions.ts` (`COUNT(DISTINCT user_id)` on `elix_auth_sessions` where `created_at > NOW() - INTERVAL '24 hours'`). NEW equivalent table is `auth_sessions`. Other OLD dashboard numbers were client-aggregated from list dumps; NEW forbids that. Server owns all six aggregates.
- **NEW owner:** `src/pages/admin/Dashboard.tsx` + labels `src/content/adminDashboard.ts` + parse `src/features/admin/adminApi.ts` `parseAdminDashboard` / `apiFetchAdminDashboard`. Shared gate `src/components/RequireAdmin.tsx`. Server `server/modules/admin/dashboard.ts` on `GET /api/admin/dashboard` and `GET /api/admin/stats/dau` via `extraAdminRouter`. Competing unused `GET /api/admin/stats` removed from empty `adminRouter`.
- **What happens:** Loading shows only **Loading...** (no zero cards). Success shows title **Admin Dashboard** and six cards in OLD order: Daily Active Users, Total Users, Total Videos, Live Rooms, Total Revenue (`$` + minor/100), Pending Reports. Quick Actions hand off to future admin routes only. Error shows **Failed to load dashboard data** and does not convert failure into zeros. No refresh button, date range, charts, WebSocket, or LiveKit. Hardware back `/admin` → `/settings`.
- **DAU:** distinct `auth_sessions.user_id` with `created_at > NOW() - INTERVAL '24 hours'`. Server/database `NOW()`, rolling 24 hours, not calendar day, not device clock. No exclusion of banned/admin/test users. Missing/invalid count is error, not 0.
- **Other metrics:** users = `COUNT(*) FROM users WHERE deleted_at IS NULL`; videos = `COUNT(*) FROM videos WHERE deleted_at IS NULL`; live = `COUNT(*) FROM live_streams WHERE status = 'live'`; reports = `COUNT(*) FROM reports WHERE status IN ('open', 'pending')`; revenue = `COALESCE(SUM(amount_pence), 0) FROM shop_purchases WHERE status = 'paid'` (Stripe shop pence only — IAP coins are not GBP).
- **Parity tests:** one `/admin` owner; RequireAdmin logged-out/non-admin/unknown/admin; Settings Admin row; six cards + Quick Actions; parse missing field ≠ 0; server SQL/parse; HTTP IT unauth 401, non-admin 403, admin 200, revoke 403, no metric leak.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → genuine admin Settings → Admin → dashboard metrics + genuine non-admin deep link `/admin` denied. PAGE-071 Users destination now exists: Dashboard Manage Users → `/admin/users`; hardware back `/admin/users` → `/admin`. PAGE-072 Reports destination now exists: Dashboard Review Reports → `/admin/reports`; hardware back `/admin/reports` → `/admin`. After PAGE-073–078 exist → remaining Dashboard links open those pages and back returns to `/admin`.

### PAGE-071 Admin users
- **PAGE-071 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/admin/users` list + ban/unban is locked. Android genuine-admin / target-enforcement / non-admin-attack runtimes on `C3U000000005847`, two-admin concurrency runtime, and iOS runtime were not run here. PAGE-072 Reports is not started here.
- **Route:** `/admin/users`. Authenticated admin-only behind PAGE-070 `RequireAdmin`. Logged-out → `/login`. Non-admin / unknown admin → `/feed`. Hardware back → `/admin`.
- **Admin authority:** ledger `profiles.is_admin`. NEW column `users.is_admin`. Server `requireAdmin` re-reads that column. Fail closed.
- **OLD visual authority:** `C:\Users\Absm Construction\Desktop\Elix Star Live\src\pages\admin\Users.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied.
- **OLD backend authority:** `GET /api/admin/users` (`q` on username/email, `ORDER BY created_at DESC`, `LIMIT 500`), `POST /api/admin/users/:userId/ban` (`until` optional, else ~100 years; `reason` optional), `DELETE /api/admin/users/:userId/ban`. OLD table was `profiles.banned_until`. NEW table is `users.banned_until`.
- **NEW owner:** `src/pages/admin/Users.tsx` + labels `src/content/adminUsers.ts` + parse `src/features/admin/adminApi.ts`. Server `server/modules/admin/users.ts` via `extraAdminRouter`. Shared gate `RequireAdmin` + `requireAdmin`.
- **What happens:** Loading shows only **Loading...**. Title **User Management**. Search is server `q` (username/email LIKE, max 80, parameterized, LIMIT 500). No filters. No pagination controls. Table columns User (avatar + username), Email, Joined (`toLocaleDateString` or N/A), Actions View / Ban / Unban. View → `/profile/:id` with `returnTo: /admin/users`. Ban confirm `Are you sure you want to ban this user? This action cannot be easily undone.` Unban confirm `Unban this user?`. No duration picker. Error does not become an empty table. Ban persists `users.banned_until`, revokes `auth_sessions`, notifies existing WS via PAGE-006 helpers. Fresh login of a banned user is 403. Unban clears `banned_until` and does not restore old tokens.
- **Parity tests:** one `/admin/users` owner; RequireAdmin logged-out/non-admin/admin; table/search/confirm; parse missing field ≠ list; server SQL/search escape; HTTP IT unauth 401, non-admin 403, admin list/search/ban/unban, revoked session 401, banned login 403, unban recovery, admin revocation 403.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → genuine admin Dashboard → Users → ban/unban + refresh + back. After target-device pass → banned target APIs/login denied then unban recovers. After PAGE-072 exists → no Reports actions on this page.

### PAGE-072 Admin reports
- **PAGE-072 status:** IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Own `/admin/reports` queue + status patch + warning is locked. Android genuine-admin / warning-delivery / non-admin-attack runtimes on `C3U000000005847`, two-admin concurrency runtime, and iOS runtime were not run here. PAGE-073 Economy is not started here.
- **Route:** `/admin/reports`. Authenticated admin-only behind PAGE-070 `RequireAdmin`. Logged-out → `/login`. Non-admin / unknown admin → `/feed`. Hardware back → `/admin`.
- **Admin authority:** ledger `profiles.is_admin`. NEW column `users.is_admin`. Server `requireAdmin` re-reads that column. Fail closed.
- **OLD visual authority:** `C:\Users\Absm Construction\Desktop\Elix Star Live\src\pages\admin\Reports.tsx` (read-only). NEW owner writes from that in-app specification; no OLD implementation source copied.
- **OLD backend authority:** `GET /api/admin/reports` (`?status=pending` or all), `PATCH /api/admin/reports/:id` `{ status, action?, admin_note? }`. OLD table `elix_reports`. NEW table `reports` from PAGE-046. OLD statuses pending/reviewed/dismissed/actioned. PAGE-046 inserts `open`; Pending filter is `open` + `pending` to match PAGE-070 dashboard count.
- **NEW owner:** `src/pages/admin/Reports.tsx` + labels `src/content/adminReports.ts` + parse `src/features/admin/adminApi.ts`. Server `server/modules/admin/reports.ts` via `extraAdminRouter`. Shared gate `RequireAdmin` + `requireAdmin`.
- **What happens:** Loading shows only **Loading...**. Title **Reports Queue**. Filters Pending / All. Cards show reason badge, target type, details, reporter username, created `toLocaleString`, status. Pending/open rows have Remove Content / Warn User / No Action / View. Resolve PATCH `status=actioned` plus `removed|warned|no_action`. Warn writes PAGE-032 `notifications.kind=system` and existing PAGE-006 `sendToUserGlobal(..., "moderation_warning")`. Remove soft-deletes video/comment or ends live via existing `endLive`. No Ban. Error does not become **No reports found**.
- **Parity tests:** one `/admin/reports` owner; RequireAdmin logged-out/non-admin/admin; pending/all; parse missing field ≠ list; HTTP IT PAGE-046 create → admin list; warn notification; no second warning; remove video; unauth/non-admin/target/reporter 403; admin revoke 403; dashboard pending count drops.
- **MANDATORY RETURN GATES:** After device pass on `C3U000000005847` → genuine admin Dashboard → Reports → status/warning + refresh + back. After target-device pass → warned user sees PAGE-032 Content warning. After PAGE-073 exists → no Economy actions on this page.

### PAGE-073 Admin economy
- **Route:** `/admin/economy`. `admin/Economy.tsx`.
- **What happens:** Economy/wallet views; gift catalog PATCH `PATCH /api/admin/gifts/catalog/:giftId` invalidates Valkey catalog.
- **Parity tests:** load; patch gift price.

### PAGE-074 Admin monetisation
- **Route:** `/admin/monetisation`. `admin/Monetisation.tsx`.
- **What happens:** config, settlements coin-lot/promote/subscription, **reverse**, rewards periods, audit, reconciliation, withdrawals-gbp status/submit-provider/mark-paid-manual, fraud-reviews, foryou-config, foryou-sweep, financial-reports/import.
- **Parity tests:** reverse unwind lots; reconciliation run; foryou sweep.

### PAGE-075 Admin purchases
- **Route:** `/admin/purchases`. `admin/Purchases.tsx`.
- **What happens:** GET purchases + iap-purchases + shop-purchases.
- **Parity tests:** lists load.

### PAGE-076 Admin withdrawals
- **Route:** `/admin/withdrawals`. `admin/Withdrawals.tsx`.
- **What happens:** payouts approve/reject/mark-paid/cancel/review; chargeback; unfreeze (must keep reserved locks honest).
- **Parity tests:** approve; reject; unfreeze does not drop reserved.

### PAGE-077 Admin rising stars
- **Route:** `/admin/rising-stars`. `admin/RisingStars.tsx`.
- **What happens:** seasons/categories/regions/challenges/freeze/snapshot/disqualify/badges/rewards/audit nested under `/api/admin/rising-stars`.
- **Parity tests:** freeze; disqualify; audit.

### PAGE-078 Admin progression
- **Route:** `/admin/progression`. `admin/Progression.tsx`.
- **What happens:** levels, missions, daily-rewards, battle-energy-caps, feature-flags, xp/starter adjustments, audit-history under `/api/admin/progression`.
- **Parity tests:** patch flags; adjust XP; archive mission.

---

# FLOW specifications (cross-page)

**FLOW-001 Session restore.** Persist token + cookie as OLD client. Foreground `GET /api/auth/me`. Invalid → FLOW-028. IAP reconcile owned purchases. **State:** Neon sessions + Valkey `sess:*`. **Tests:** cold start; killed app; expired JWT.

**FLOW-002 Follow / unfollow / block.** POST follow/unfollow. Block either-way. Calls `call_rejected` blocked. Comments 403. Feed strips blocked. **Tests:** follow; block hides; unblock.

**FLOW-003 Comments / likes / saves.** Comments sheet locked UI (Newest / Comments / Oldest+Most Liked). Comment max 2000. Comment likes. Saves. Activity API real actors. Likes/comments do not invent Inbox Main rows. **Tests:** sort; like comment; blocked cannot comment.

**FLOW-004 Stories.** GET grouped; POST; 24h TTL; gold ring; add-story from profile/feed. Path `stories/<userId>/`. **Tests:** expire; own add.

**FLOW-005 Bunny media.** Upload/delete own paths only. cdnUrl returned. Audio scan PEX; Valkey `elix:audiocan:{videoId}`. **Tests:** own path; foreign path rejected; delete.

**FLOW-006 Gifts.** Catalog GET. Send REST. Overlay video object-cover locked frame; top red banner locked; above-chat capsule locked. Goals; booster_caught. Battle audience fan-out per seated creator. **Tests:** paid settle then WS; promo 0 Diamonds; test no money.

**FLOW-007 Co-host 8+1.** Valkey lock. Invite vs request. Accept grants LiveKit publish. Leave/release/clear revoke. Layout sync presentation only. **Tests:** 8th ok; 9th refused; lock contention.

**FLOW-008 Battle 1x1.** Seats host vs opponent. 300s server clock. Scores sources listed in hard contracts. **Tests:** timer; tap once; gift points; end persist `battle_results`.

**FLOW-009 Battle 2x2.** Seats + teams host+player3 vs opponent+player4. Same clock. **Tests:** four seats; team scores; rematch.

**FLOW-010 Apple + Google coin IAP.** Packages; verify; lots; webhooks; consume job; rate/fraud. **Tests:** idempotent replay; foreign token 403.

**FLOW-011 Membership IAP.** `/membership/iap-complete`; status GETs; Play product mapping. **Tests:** active; expired webhook.

**FLOW-012 Shop Stripe.** Checkout session server-side; webhook; idempotencyKey. **Tests:** success credit shop purchase not coins.

**FLOW-013 60/40 FIFO settlement.** Integer pence; floor creator; paid lots only. **Tests:** split math; empty lots refuse paid gift.

**FLOW-014 Withdrawals.** pending/available/locked; Connect onboard; admin approve/reject/mark-paid/cancel; submit-provider; manual paid. **Tests:** cannot withdraw locked; reserved held.

**FLOW-015 Refunds / reversals.** Store webhook + admin reverse; unwind lots and earnings; fail closed. **Tests:** refund after gift; unmatured vs matured.

**FLOW-016 LiveKit lifecycle.** 12 flows in PROOF-INVENTORIES. **Tests:** publish denied; spectator identity; call room.

**FLOW-017 WS reconnect.** Ping 25s; max 15; host persistentReconnect; foreground reconnectOnForeground; exhausted `ws_reconnect_exhausted`; transport `ws_error` is not stream end. **Tests:** drop/reconnect; exhaust.

**FLOW-018 Push / notifications.** device-tokens; FCM/APNs optional; job `push_notify`; live_started; inbox. **Tests:** register; send when configured; no fake sent:0 hidden config.

**FLOW-019 Video calls.** WS only + LiveKit `call_*`. **Tests:** blocked; accept; end.

**FLOW-020 Live share inbox.** POST live-share; GET requests; WS `live_share`; table `live_share_inbox`. **Tests:** share; list.

**FLOW-021 Test coins.** authorize + mint password; Valkey balances; giftSource test; audit table not money. **Tests:** mint; gift score; Valkey down refuses.

**FLOW-022 Daily hearts.** POST/GET daily hearts; ≠ live like ≠ battle tap. **Tests:** once per day per creator.

**FLOW-023 Rankings.** GET weekly/daily from gift earnings. **Tests:** order; empty.

**FLOW-024 Promote IAP.** promote-iap-complete; platform 100%. **Tests:** not 60/40.

**FLOW-025 Live moderation.** POST live/moderation/check; warning WS; moderator CRUD; bans; reports. **Tests:** warning delivered; moderator add/remove.

**FLOW-026 Permissions.** Camera/mic/notifications denied → visible error, no fake preview. **Tests:** deny camera on Create/Host.

**FLOW-027 Background / disconnect.** Host 20s grace; spectator leave; battle participant grace; LiveKit webhook; fg restore. **Tests:** background host; kill process webhook.

**FLOW-028 Session expiry.** Any protected REST 401 or `/me` fail or WS `force_disconnect` → clear session, `/login` `{ from }`, no fake authed UI. **Tests:** expired JWT mid-feed; force_disconnect.

**FLOW-029 Ban / suspend.** 403 suspended on login; admin ban; existing sockets disconnected; cannot start live. **Tests:** banned login; mid-session ban.

**FLOW-030 Feed live presence.** `stream_started` / `stream_ended` on all authenticated sockets via `feed:global`. Cards reconcile; prune ended. **Tests:** live card appears/disappears without reopening feed.

**FLOW-031 Audio copyright block.** Upload scan; 403 AUDIO_BLOCKED; copyright_* tables; legal audio page. **Tests:** blocked upload not published.

**FLOW-032 Guest (server only).** `POST /api/auth/guest` 403 production; absent from Login. **Tests:** production 403; Login has Sign up not Guest.

---

# MODAL / overlay specifications (36)

Visual locks (match look; do not copy files): Follow on Join, gift overlay framing, top red banner, above-chat capsule, Create camera, Inbox, Chat thread, Video call, Incoming call, Comments sheet.

**MODAL-001 IncomingCallModal** — PAGE-035. Red decline, green accept. Global. WS call_invite.  
**MODAL-002 OfflineBanner** — navigator offline. Global. Not a fake online.  
**MODAL-003 LiveNotifyBanner** — live notifications. Global. Presence from server.  
**MODAL-004 EnhancedCommentsModal** — locked header: handle pill; Newest left; Comments center; Oldest + Most Liked right; one split line; no marquee.  
**MODAL-005 EnhancedLikesModal** — like list for video.  
**MODAL-006 ShareModal** — share/copy; nativeConfirm.  
**MODAL-007 ReportModal** — POST /api/report.  
**MODAL-008 UserProfileModal** — mini profile from live/feed; not Profile page; not Follow-on-Join.  
**MODAL-009 BuyCoinsModal** — IAP only; PAGE-038.  
**MODAL-010 GiftPanel** — catalog + send REST.  
**MODAL-011 GiftOverlay** — locked solo frame object-cover; battle same chat-anchored frame.  
**MODAL-012 GiftAnimationOverlay** — top red Weekly Ranking bar locked.  
**MODAL-013 LiveGiftFeedStack** — above-chat capsule locked.  
**MODAL-014 GiftGoalGallery** — host set/clear; WS gift_goal_sync.  
**MODAL-015 RankingPanel** — weekly/daily APIs; presence tests exist in OLD.  
**MODAL-016 ChatOverlay** — live chat WS chat_message / chat_ack.  
**MODAL-017 PromotePanel** — FLOW-024.  
**MODAL-018 SettingsOptionSheet** — settings/engagement sheet chrome.  
**MODAL-019 LanguagePickerSheet** — language row.  
**MODAL-020 SoundPickerPanel** — create sound pick.  
**MODAL-021 SoundLibraryView** — library.  
**MODAL-022 SoundMixPanel** — mix.  
**MODAL-023 MediaEditorPanel** — create edit.  
**MODAL-024 AIToolsPanel** — PAGE-023.  
**MODAL-025 BattleVfxOverlays** — battle presentation.  
**MODAL-026 BattleTauntOverlays** — battle presentation.  
**MODAL-027 BattleEnergyBoostControls** — energy boost REST; not Diamonds.  
**MODAL-028 LiveEngagementOverlay** — polls/mystery/watch ticks WS.  
**MODAL-029 LiveSideMissionStack** — live missions.  
**MODAL-030 FeedStoryCirclesOverlay** — FLOW-004.  
**MODAL-031 InlineLiveViewer** — subscribe preview; no auto-join.  
**MODAL-032 LiveHostProfileHeader / Follow on Join** — locked mm/size/color; same host+spectator; after follow, Follow hides Join stays; no Co-host on this stack.  
**MODAL-033 More options sheet** — EnhancedVideoPlayer more.  
**MODAL-034 Inbox Activity portal** — PAGE-031.  
**MODAL-035 New followers hub** — Inbox hub; not Archive duplicates.  
**MODAL-036 Gift received hub + NativeDialog** — Inbox gift hub; NativeDialogProvider confirms (delete account, delete thread, etc.).

---

# SYS specifications

**SYS-001 Stripe webhook** — shop purchases + Connect payout events. Raw body. Idempotent `elix_processed_webhook_events`.  
**SYS-002 Apple IAP webhook** — refunds, subs, revokes. Unwind lots.  
**SYS-003 Google Play RTDN** — refunds, subs, consume job.  
**SYS-004 LiveKit webhook** — room/participant end; must not depend on one Node process 20s timer as multi-instance truth.  
**SYS-005 Health** — GET /health and /api/health. Metrics GET /api/metrics secret-gated.  
**SYS-006 Coolify / Hetzner** — do not edit infra files without owner permission.  
**SYS-007 Valkey required in production** — 62 contracts; fail closed.  
**SYS-008 Migrations** — 65 files / 131 tables. NEW may use a clean schema that still supports these outcomes; do not copy the patch chain blindly; do not point at OLD Neon.  
**SYS-009 Rate limits fail closed without Valkey.**  
**SYS-010 Jobs** — elix:jobs + DLQ + leader lock; types cleanup_retention, push_notify, email_send, google_play_consume; leader timers for earnings, rewards, reconcile, foryou, cleanup; battle tick always-on.  
**SYS-011 No forbidden providers.**

---

# Rebuild order (paused until the owner orders PAGE-001)

1. PAGE-001 Login  
2. PAGE-002 Register  
3. PAGE-003 Verification  
4. PAGE-004 Forgot password  
5. PAGE-005 Reset password  
6. PAGE-006 App shell  
7. FLOW-001 Session  
Then feed 007–016, profile 024–029, create 021–023, inbox 030–035, live 017–020 + FLOW-006–009, wallet/IAP/shop, settings, engagement, rising stars, legal, admin.

When ordered: inspect **only** the matching NEW files for that ID, classify, replace if wrong (never patch, never copy OLD source), implement one clean path, test against this spec.

---

# Honesty

- Pixel-level Tailwind for LiveHostScreen and EnhancedVideoPlayer is the named OLD file, not a class dump. That is a **reference**, not unresolved behaviour: every action and contract is specified above.
- OLD `useLiveHostController` / `useLiveSpectatorController` are behaviour oracles. NEW must split ownership (WS, LiveKit, seats, battle, gifts) when those IDs open.
- Guest is server-capable and production-403; absent from Login UI.
- Inbox production filters are **Main / Unread / Activity** plus hubs.
- STEM ranking is `GET /api/videos` then client filter (OLD). Following/Friends use dedicated feed APIs. Discover/Search use videos + profiles lists.
- AI Studio has no generation backend in OLD.
- NEW local DB must never be pointed at OLD production Neon.
