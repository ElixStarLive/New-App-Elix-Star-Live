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
- **Route:** `/stem`. Bottom nav. No TopNav (`isFeedNoTopBar`).
- **OLD visual authority:** `src/pages/StemFeed.tsx` + same player overlay as For You.
- **What happens:** `fetchStemVideos` loads `GET /api/videos`, filters public with URL, sorts by views, takes top trending then extra caption-matched slots (max 55), strips blocked. Same snap/rail grammar. Close → For You. Search with return state to `/stem`.
- **State owner:** Neon videos. Client ranking filter is OLD behaviour to match, not a second feed API.
- **Contracts:** GET `/api/videos`; same like/comment/save as feed.
- **Parity tests:** loads without crash; empty/error; same overlay actions as For You; back to `/feed`.

### PAGE-009 Following feed
- **Route:** `/following`.
- **OLD visual authority:** `src/pages/FollowingFeed.tsx`.
- **What happens:** `GET /api/feed/following` relation feed. Empty when no followed videos. Stories overlay title Following. Same snap grammar.
- **State owner:** Neon follows + videos.
- **Parity tests:** only followed creators; empty; unfollow removes.

### PAGE-010 Friends feed
- **Route:** `/friends` (bottom Friends tab).
- **OLD visual authority:** `src/pages/FriendsFeed.tsx`.
- **What happens:** `GET /api/feed/friends`. Same snap + stories. Empty when no friends videos.
- **State owner:** Neon friend graph + videos.
- **Parity tests:** friends only; empty; bottom tab active.

### PAGE-011 Discover
- **Route:** `/discover` (Top tab Explore).
- **OLD visual authority:** `src/pages/Discover.tsx`.
- **What happens:** Grid of public videos (`GET /api/videos`) + profiles (`GET /api/profiles`). Tap video/profile. Close named exit.
- **State owner:** Neon. Client grid is display.
- **Parity tests:** grid load; tap video; tap profile; empty; error.

### PAGE-012 Search
- **Route:** `/search`.
- **OLD visual authority:** `src/pages/SearchPage.tsx`.
- **What happens:** Users filtered client-side from `GET /api/profiles`. Videos as OLD page implements. Swipe-down close as OLD. ReturnTo from Inbox honored.
- **Parity tests:** find user; empty query; swipe close; inbox return.

### PAGE-013 Hashtag
- **Route:** `/hashtag/:tag`.
- **OLD visual authority:** `src/pages/Hashtag.tsx`.
- **What happens:** `GET /api/hashtags/:tag` + `GET /api/hashtags/:tag/videos`. Grid of tagged videos.
- **Parity tests:** known tag; unknown tag empty; tap video.

### PAGE-014 Video view
- **Route:** `/video/:videoId` full-screen chrome; bottom nav still visible unless hide rule.
- **OLD visual authority:** `src/pages/VideoView.tsx` + `EnhancedVideoPlayer`.
- **What happens:** `GET /api/videos/:id`. Private → 404 unless owner. Same rail as feed. Download = voice-only MP4 (licensed soundtrack stripped).
- **State owner:** Neon videos. Bunny CDN URL.
- **Parity tests:** public play; private 404; owner sees private; like/comment/save.

### PAGE-015 Saved videos
- **Route:** `/saved`.
- **OLD visual authority:** `src/pages/SavedVideos.tsx`.
- **What happens:** `GET /api/videos/saved/list`. Open from Settings/Profile liked-saved paths.
- **Parity tests:** list; empty; unsave.

### PAGE-016 Music
- **Route:** `/music` and `/music/:songId`.
- **OLD visual authority:** `src/pages/MusicFeed.tsx`, sound panels.
- **What happens:** `GET /api/music/status|global|playlists|collections|search` and preview `GET /api/music/tracks/:trackId/preview`. Optional Epidemic Sound if API key. Library preview stops when leaving `/music` (foreground rule). Valkey `elix:music:*`.
- **Parity tests:** browse; preview; leave page stops preview; missing key degrades honestly.

### PAGE-017 Live discover
- **Route:** `/live`. Bottom nav hidden. `/live/start` redirects here.
- **OLD visual authority:** `src/pages/LiveDiscover.tsx`.
- **What happens:** Lobby from `GET /api/live/streams` (Valkey stream hash + DB + LiveKit publishers). Stale rooms absent. Tap → `/watch/:streamId`. Own live via guard `/live/:id`.
- **State owner:** server presence, not client leftover.
- **Parity tests:** only publishing hosts; empty; refresh; tap watch.

### PAGE-018 Live Host
- **Route:** `/live/broadcast` and owner `/live/:streamId` via LiveStreamGuard. Bottom nav hidden.
- **OLD visual authority:** `src/features/live/host/LiveHostScreen.tsx` (~3600 lines UI). Controllers are behaviour oracles, not paste targets.
- **What happens:** `POST /api/live/start` inserts `live_streams`, Valkey `stream:{room}`, follower notify `live_started`, WS presence `stream_started`. LiveKit publish identity=**userId**. WS `stream_start`. Chat, hearts, gifts, co-host 8+1, battle 1x1/2x2, gift goal, boosters, mist, engagement, ranking, share, end. Close/end: `POST /api/live/end` + WS `stream_end` + LiveKit teardown. Host WS drop: **20s grace** then end. Persistent reconnect. Token refresh 6h. Spectator self-watch uses `__v_` identity. Battle gifts fan-out to seated creators' audiences only.
- **Buttons:** end live; mic; cam; flip; gift; share; more; spectators; ranking (all/host/opponent gifters); combo; poll; cohost invite/accept/decline/remove/feature/mute/cam/end; battle find/invite/accept/decline/start 1x1|2x2/rematch/remove slot/mute-cam per seat; gift goal; booster; mist; copy link; mini profile follow/share/watch/moderator/block.
- **State owner:** Neon live_streams + gift txns + earnings + battle_results. Valkey stream, room:*, cohost:* (lock), battle:* (server 300s clock). LiveKit media only. WS fan-out after REST gift settle.
- **Contracts:** live start/end/token/status/moderators; gifts catalog/send; wallet; test-coins; rankings; engagement; follow; block; live-share. All live WS. FLOW-006–009, 016, 017, 021, 025, 027.
- **Loading/error:** connecting; live; reconnecting; ended; battle WAITING/ACTIVE/ENDED; cohost full (9th refused); `battle_error` / failed `gift_ack` visible. Permission deny = real error, not fake video.
- **Parity tests:** start/end; reconnect within 20s keeps live; 9th cohost refused; 300s server clock; paid gift ledger then `gift_sent`; test gift score only; host crash webhook; rematch not killed by previous grace.

### PAGE-019 Live Spectator
- **Route:** `/watch/:streamId`. `/live/watch/:id` redirects here. Bottom nav hidden.
- **OLD visual authority:** `src/features/live/spectator/SpectatorLiveScreen.tsx` + shell. **Same** GiftOverlay / GiftAnimationOverlay / LiveGiftFeedStack / Follow-on-Join props as host.
- **What happens:** Join while host already live. LiveKit subscribe, identity `{userId}__v_{12hex}`. Token publish=0 until cohost grant. Follow on Join (70×36 red, locked placement). Hearts unlimited live likes ≠ battle tap +5 once ≠ daily heart REST. Gifts REST then WS. Cohost **request** (not host invite). Battle accept/decline. Profile overlay route without tearing room. Close named. `stream_ended` leaves. Spectator leave never ends stream.
- **State owner:** same server as host. This client is independent.
- **Parity tests:** join without host process; follow; gift; cohost request; stream_ended leaves; like vs battle tap vs daily heart separated.

### PAGE-020 Live profile overlay
- **Route:** `/watch/:streamId/profile/:userId`.
- **OLD visual authority:** `src/features/live/spectator/ProfileLiveOverlay.tsx` (not Follow-on-Join; not `Profile.tsx`).
- **What happens:** Profile sheet over live. LiveKit stays up. Close → watch. Follow/block/report/message as public profile rules.
- **State owner:** Neon profile; LiveKit still host/spectator session.
- **Contracts:** same profile/follow/block APIs as PAGE-025; no live teardown.
- **Parity tests:** close returns to live; media does not tear.

### PAGE-021 Create camera
- **Route:** `/create`. Bottom nav hidden.
- **OLD visual authority:** `Create.tsx`, `ElixCameraLayout.tsx`, `CaptureShutterButton.tsx`, Create-camera CSS lock in `index.css`.
- **What happens:** Camera/mic. Close, Add sound, Upload, POST/CREATE/LIVE modes, shutter, right rail discs, silver-red text. Filters `GET /api/camera-filters`, speed `/api/speed-options`, stickers `/api/sticker-options`. LIVE → host start. Upload → `/upload`. Sound picker/library/mix.
- **State owner:** device camera. Config APIs are server lists.
- **Permissions:** camera+mic; deny honest.
- **Parity tests:** permission deny; go live; go upload; sound picker.

### PAGE-022 Upload
- **Route:** `/upload`. Bottom nav hidden.
- **OLD visual authority:** `src/pages/Upload.tsx`.
- **What happens:** Caption, hashtags, privacy, duetWithVideoId, duetLayout overlay|split. Bunny `POST /api/media/upload-file?path=videos/<ownUserId>/...` then `POST /api/videos` then `POST /:id/fyp`. Story type via query. Copyright audio scan can 403 `AUDIO_BLOCKED`. Path must be own userId.
- **State owner:** Bunny object + Neon videos. Valkey `elix:audiocan:{videoId}`.
- **Parity tests:** success; AUDIO_BLOCKED; 502 Bunny; foreign path rejected; private flag.

### PAGE-023 AI Studio
- **Route:** `/ai-studio`. Bottom nav hidden.
- **OLD visual authority:** `src/pages/AIStudio.tsx`, `AIToolsPanel.tsx`.
- **What happens:** Local file/background pick, CSS filters/enhance, tools panel. Exit named (`AI_STUDIO_EXIT_TO` / returnTo). **No fake generation API success.** No server AI job in OLD.
- **State owner:** client-only media URLs (blob).
- **Parity tests:** pick file; tools; close named; no invented backend success.

### PAGE-024 Own profile
- **Route:** `/profile`.
- **OLD visual authority:** `src/pages/Profile.tsx`.
- **What happens:** Avatar + story plus, stats following/followers/likes/views, share, title Profile, close, settings gear, icon tabs videos/shop/private/reposts/saved/liked, grids. `GET /api/profiles/:id`, videos user/saved/liked, shop items, `GET /api/reposts/list`, stories.
- **Navigation:** settings, edit, follow lists, video, shop, coins, creator login details.
- **State owner:** Neon profiles/videos/shop/reposts.
- **Parity tests:** tabs empty; private only on own; stats; settings.

### PAGE-025 Public profile
- **Route:** `/profile/:userId`.
- **OLD visual authority:** same `Profile.tsx`.
- **What happens:** Follow/Unfollow; Message (`POST /api/chat/threads/ensure` → `/inbox/:id`); more block+report. `POST /api/profiles/:id/view` unique views. No private tab. Live ring if server live.
- **Parity tests:** follow; message; view counted once; block hides; live ring from server.

### PAGE-026 Edit profile
- **Route:** `/edit-profile`.
- **OLD visual authority:** `src/pages/EditProfile.tsx`.
- **What happens:** PATCH `/api/profiles/:userId`. Avatar Bunny `avatars/<userId>/`.
- **Parity tests:** save; avatar; validation; unauthorized other user.

### PAGE-027 Followers
- **Route:** `/profile/:userId/followers`.
- **OLD visual authority:** `src/pages/FollowList.tsx`.
- **What happens:** `GET /api/profiles/:id/followers`. Follow/unfollow rows. Close named. Inbox returnTo.
- **Parity tests:** list; empty; follow back.

### PAGE-028 Following list
- **Route:** `/profile/:userId/following`.
- **OLD visual authority:** same `FollowList.tsx`.
- **What happens:** `GET /api/profiles/:id/following`.
- **Parity tests:** list; empty; unfollow.

### PAGE-029 Creator login details
- **Route:** `/creator/login-details`.
- **OLD visual authority:** `src/pages/CreatorLoginDetails.tsx`.
- **What happens:** Switch/add saved creator identifiers (email/username/avatar only, max 5). Sign in/up via same auth APIs. **Never store password.** Migrates/deletes legacy password keys. Exit settings/profile named.
- **State owner:** localStorage accounts list (not money). Auth still Neon.
- **Parity tests:** save identifier not password; login; corrupt storage recovered; forgot password if enabled.

### PAGE-030 Inbox
- **Route:** `/inbox`. Close → `/feed` (hub X). Opened children return to Inbox.
- **OLD visual authority:** `src/pages/Inbox.tsx` (locked look).
- **What happens:** Filters Main / Unread / Activity. Hubs: New followers, Activity, Gift received, Alerts → `/alerts`. Threads `GET /api/chat/threads`. Delete = server `DELETE /api/chat/threads/:id` shared Main+Unread. Activity `GET /api/activity` only. No localStorage tombstones. No fabricated `username: 'user'`. Likes not duplicated as Archive. Live-share requests `GET /api/inbox/live-share-requests`. Navigate with `inboxReturnState()`.
- **State owner:** Neon chat_threads/messages, activity, notifications, live_share_inbox. WS `dm_message` / `dm_thread_updated`.
- **Parity tests:** open thread return Inbox; delete gone both filters; empty Main/Unread; alerts close Inbox.

### PAGE-031 Inbox Activity overlay
- **Route:** overlay on Inbox (not a router path).
- **OLD visual authority:** Activity portal inside `Inbox.tsx`.
- **What happens:** Likes/comments with real actors from `/api/activity`. Close stays Inbox.
- **Parity tests:** real names; close Inbox; no fake stubs.

### PAGE-032 Alerts
- **Route:** `/alerts`. Close → Inbox.
- **OLD visual authority:** `src/pages/alerts/AlertsPage.tsx`.
- **What happens:** `GET /api/notifications`; mark read `POST /api/notifications/read`. Push registration is PAGE-043.
- **Parity tests:** list; empty; read; close Inbox.

### PAGE-033 Chat thread
- **Route:** `/inbox/:threadId`. Bottom nav hidden.
- **OLD visual authority:** `src/pages/ChatThread.tsx` (locked).
- **What happens:** Handle pill; video call left; avatar 48 centered; back right; username under; no header level; messages left; ring→level→name then body; LevelBadge 30/16; composer. `GET/POST` messages, read. WS `dm_message`. Call: ensure then `/call`. Close Inbox named.
- **State owner:** Neon messages. WS delivery.
- **Parity tests:** send; blocked cannot; call; close Inbox; layout lock.

### PAGE-034 Video call
- **Route:** `/call`. Bottom nav hidden.
- **OLD visual authority:** `src/pages/VideoCall.tsx` (locked). Do not edit unless owner names it.
- **What happens:** WS `call_invite|accepted|rejected|ended`. LiveKit room `call_*` both publish. PiP local top-right. Green Accept only `incoming`. Red End `#EF4444`. Close ends → that DM. Blocked → `call_rejected` reason `blocked`.
- **State owner:** WS signaling. LiveKit media. No REST start.
- **Parity tests:** invite; accept; decline; blocked; end to thread.

### PAGE-035 Incoming call modal
- **Route:** global App mount.
- **OLD visual authority:** `src/components/IncomingCallModal.tsx` (locked).
- **What happens:** WS `call_invite`. Red decline / green accept → `/call`.
- **Parity tests:** accept; decline; appears over other pages.

### PAGE-036 Shop
- **Route:** `/shop`. Top tab Shop from For You.
- **OLD visual authority:** `src/pages/Shop.tsx`.
- **What happens:** `GET /api/shop/items`. Own items CRUD. Checkout **Stripe only** `POST /api/shop/checkout` `{ itemId|items[], idempotencyKey? }`. Basket max 10 lines qty 1–99. Success/cancel URLs from CLIENT_URL. Webhook SYS-001. **Not IAP. Not coins.**
- **State owner:** Neon shop_items / elix_shop_purchases. Stripe session server-side.
- **Parity tests:** list; checkout session; cancel; idempotency; creator own CRUD.

### PAGE-037 Shop item
- **Route:** `/shop/:itemId` same Shop.tsx.
- **What happens:** Deep link into item; same Stripe checkout.
- **Parity tests:** unknown id empty/error; checkout.

### PAGE-038 Purchase coins
- **Route:** `/purchase-coins` + BuyCoinsModal.
- **OLD visual authority:** `src/pages/PurchaseCoins.tsx`, `BuyCoinsModal.tsx`.
- **What happens:** `GET /api/coin-packages`. **Apple/Google IAP only.** `POST /api/verify-purchase`. Duplicate tap blocked. Cancel/fail visible. No fake success. Web must not charge coins via Stripe. SKU mapping per provider. Idempotent `elix_processed_purchases`. Credits `elix_paid_coin_lots` FIFO. Webhooks SYS-002/003. Rate + fraud velocity. Fail closed if catalog missing. Foreign-account replay 403.
- **State owner:** stores + Neon lots + wallet ledger. Client shows packages/loading.
- **Parity tests:** Android product; iOS product; cancel; 409 conflict; web no Stripe coins.

### PAGE-039 Wallet display
- **Route:** not a page; GET wallet surfaces (gifts, coins, engagement).
- **What happens:** `GET /api/wallet` returns **separate** `coin_balance`, `starter_balance`/`starter_coins`, `promotional_balance`/`promotional_coins`. Never one merged number. Test coins `GET /api/test-coins/balance` Valkey hash only. Engagement wallet separate (promo/energy/XP).
- **Parity tests:** fields unmerged; 503 DB; test coins not in wallet.

### PAGE-040 Settings
- **Route:** `/settings`.
- **OLD visual authority:** `src/pages/Settings.tsx` in SettingsOptionSheet.
- **What happens:** Rows: Edit profile, Privacy→safety, Security, Delete account, Creator payout, Engagement Hub (flag), Admin (`is_admin`), Notifications, Live notifications toggle, Mute all sounds, Dark mode always-on toast, Language, Video quality auto toast, Liked → profile liked tab, Saved, Blocked, Safety, How it works, Support, Terms, Privacy, Guidelines, Log out (`POST /api/auth/logout`). Delete `POST /api/auth/delete` with confirm (NativeDialog). Children `returnTo` settings. Close named (profile).
- **Parity tests:** each row navigates; logout revokes; delete confirm; admin hidden if not admin.

### PAGE-041 Safety center
- **Route:** `/settings/safety`.
- **OLD visual authority:** `src/pages/settings/SafetyCenter.tsx`.
- **What happens:** Safety content + links to blocked/report/guidelines as OLD. Named back settings.
- **Parity tests:** back settings; report path.

### PAGE-042 Security
- **Route:** `/settings/security`.
- **OLD visual authority:** `src/pages/settings/SecuritySettings.tsx`.
- **What happens:** 2FA `GET /api/auth/2fa/status`; enroll/verify/disable. Password reset link if enabled.
- **State owner:** Neon `user_two_factor`.
- **Parity tests:** enroll; verify; disable; status.

### PAGE-043 Notification settings
- **Route:** `/settings/notifications`.
- **OLD visual authority:** `src/pages/settings/NotificationSettings.tsx`.
- **What happens:** Local notificationsEnabled. `POST/DELETE /api/device-tokens`. Push jobs `push_notify` FCM/APNs when configured.
- **Parity tests:** register; delete token; flag off.

### PAGE-044 Blocked accounts
- **Route:** `/settings/blocked`.
- **OLD visual authority:** `src/pages/settings/BlockedAccounts.tsx`.
- **What happens:** `GET /api/blocked-users`; unblock `POST /api/unblock-user`. Block either-way affects comments, calls, follow.
- **Parity tests:** list; unblock; empty.

### PAGE-045 Creator payout
- **Route:** `/settings/payout`.
- **OLD visual authority:** `src/pages/CreatorPayout.tsx`.
- **What happens:** `GET /api/creator/balance|ledger|withdrawals-gbp|payout-methods|payout-account`. `POST withdraw-gbp`, payout-method, payout-account/onboard (Stripe Connect). Locked vs available. **No test-coin withdraw. No starter/promo withdraw as GBP.**
- **State owner:** Neon GBP wallet + payout accounts. Stripe Connect.
- **Parity tests:** onboard; withdraw available only; locked held; error visible.

### PAGE-046 Report
- **Route:** `/report` + ReportModal.
- **OLD visual authority:** `src/pages/Report.tsx`, `ReportModal.tsx`.
- **What happens:** `POST /api/report` `{ targetType, targetId, reason, details }`. Admin PAGE-072. Copyright tables for audio reports exist alongside.
- **Parity tests:** submit; validation; 401.

### PAGE-047 Engagement Hub
- **Route:** `/engagement`. Flag `ENGAGEMENT_HUB_ENABLED` else not offered.
- **OLD visual authority:** `src/pages/engagement/EngagementHub.tsx`, `EngagementShell.tsx`.
- **What happens:** `GET /api/engagement/hub`. Fan tier/level; Promo/Energy/XP copy ≠ purchased coins. Daily claim if can_claim. Links to 048–054. Close Settings.
- **State owner:** Neon engagement_* + promotional + battle_energy. Valkey engage:* for live ticks.
- **Parity tests:** flag off; hub load; daily claim; copy not purchased coins.

### PAGE-048 Missions
- **Route:** `/engagement/missions`.
- **OLD visual authority:** `EngagementMissions.tsx`.
- **What happens:** GET missions; POST claim; POST progress. Promo gifts 0 Diamonds.
- **Parity tests:** claim; already claimed; progress.

### PAGE-049 Fan level
- **Route:** `/engagement/fan-level`.
- **OLD visual authority:** `EngagementFanLevel.tsx`.
- **What happens:** GET fan-level + progression XP/level.
- **Parity tests:** load; other user status if shown.

### PAGE-050 MVP
- **Route:** `/engagement/mvp`.
- **OLD visual authority:** `EngagementMvp.tsx`.
- **What happens:** GET mvp; earn path as OLD (watch/comment/share energy separate).
- **Parity tests:** load; earn skipped if stream not live.

### PAGE-051 Achievements
- **Route:** `/engagement/achievements`.
- **OLD visual authority:** `EngagementAchievements.tsx`.
- **What happens:** GET achievements.
- **Parity tests:** list; empty.

### PAGE-052 Reward wallet
- **Route:** `/engagement/rewards`.
- **OLD visual authority:** `EngagementRewards.tsx`.
- **What happens:** GET engagement/wallet — purchased / promo / starter / energy / XP **unmerged**.
- **Parity tests:** fields separate; not IAP.

### PAGE-053 Daily login
- **Route:** `/engagement/daily-login`.
- **OLD visual authority:** `EngagementDailyLogin.tsx`.
- **What happens:** GET + POST claim 7-day config.
- **Parity tests:** claim once/day; already claimed.

### PAGE-054 Collections
- **Route:** `/engagement/collections`.
- **OLD visual authority:** `EngagementCollections.tsx`.
- **What happens:** treasure/stickers/creator-cards GET; spawn/open chests. Stickers also `/api/stickers/*`.
- **Parity tests:** open chest; spawn; stickers list.

### PAGE-055 Rising Stars
- **Route:** `/rising-stars`.
- **OLD visual authority:** `src/pages/RisingStars.tsx`.
- **What happens:** seasons/categories/regions/challenges/teams/rewards/badges GETs. Enter limiter. Vote limiter + fraud `fraud:rs_vote`.
- **State owner:** Neon rs_* tables.
- **Parity tests:** list challenges; enter; vote once.

### PAGE-056 Rising Stars challenge
- **Route:** `/rising-stars/challenge/:challengeId`.
- **OLD visual authority:** `RisingStarsChallenge.tsx`.
- **What happens:** entries, leaderboard, live attach own live, withdraw entry, teams join.
- **Parity tests:** enter; withdraw; attach live; leaderboard.

Legal/support pages PAGE-057–069 share: public route; readable document (or hub of links); named back; linked from Register and/or Settings as OLD; **no ticket/support POST** unless the named file posts (none of these do). State owner: static content. Session: public, no auth required. Loading: none beyond render. Error: missing asset would be a missing reference — files exist as named below.

### PAGE-057 Terms
- **Route:** `/terms` public.
- **OLD visual authority:** `src/pages/Terms.tsx`.
- **What happens:** Terms of service document. Named back. Required reading via Register checkbox (consent still POST consent API, not this page).
- **Parity tests:** renders; back; Register links here.

### PAGE-058 Privacy
- **Route:** `/privacy` public.
- **OLD visual authority:** `src/pages/Privacy.tsx`.
- **What happens:** Privacy policy document. Named back. Register/Settings link.
- **Parity tests:** renders; back.

### PAGE-059 Copyright
- **Route:** `/copyright` public.
- **OLD visual authority:** `src/pages/Copyright.tsx`.
- **What happens:** Copyright policy. Audio/upload enforcement is FLOW-031 (`AUDIO_BLOCKED`, copyright_* tables), not a form on this page.
- **Parity tests:** renders; back.

### PAGE-060 Legal hub
- **Route:** `/legal` public.
- **OLD visual authority:** `src/pages/Legal.tsx`.
- **What happens:** Hub linking to PAGE-061–066. Named back.
- **Parity tests:** each child link; back.

### PAGE-061 Legal audio
- **Route:** `/legal/audio` public.
- **OLD visual authority:** `src/pages/LegalAudio.tsx`.
- **What happens:** Audio/licensed soundtrack policy (download is voice-only on videos).
- **Parity tests:** renders; hub link.

### PAGE-062 Legal UGC
- **Route:** `/legal/ugc` public.
- **OLD visual authority:** `src/pages/LegalUGC.tsx`.
- **What happens:** User-generated content policy.
- **Parity tests:** renders; hub link.

### PAGE-063 Legal affiliate
- **Route:** `/legal/affiliate` public.
- **OLD visual authority:** `src/pages/LegalAffiliate.tsx`.
- **What happens:** Affiliate disclosure document.
- **Parity tests:** renders; hub link.

### PAGE-064 Legal DMCA
- **Route:** `/legal/dmca` public.
- **OLD visual authority:** `src/pages/LegalDMCA.tsx`.
- **What happens:** DMCA process document (not an in-app takedown form).
- **Parity tests:** renders; hub link.

### PAGE-065 Legal safety
- **Route:** `/legal/safety` public.
- **OLD visual authority:** `src/pages/LegalSafety.tsx`.
- **What happens:** Safety document. In-app safety tools remain PAGE-041 / FLOW-025.
- **Parity tests:** renders; hub link.

### PAGE-066 Legal supplier
- **Route:** `/legal/supplier` public.
- **OLD visual authority:** `src/pages/LegalSupplier.tsx`.
- **What happens:** Supplier/terms document.
- **Parity tests:** renders; hub link.

### PAGE-067 Guidelines
- **Route:** `/guidelines` public.
- **OLD visual authority:** `src/pages/Guidelines.tsx`.
- **What happens:** Community guidelines document. Settings and Register may link here. In-app enforcement is reports/moderation APIs, not this page.
- **Parity tests:** renders; named back.

### PAGE-068 How it works
- **Route:** `/how-it-works` public.
- **OLD visual authority:** `src/pages/HowItWorks.tsx`.
- **What happens:** Product explainer document. Settings row How it works.
- **Parity tests:** renders; named back.

### PAGE-069 Support
- **Route:** `/support` public.
- **OLD visual authority:** `src/pages/Support.tsx`.
- **What happens:** Support content. **No ticket POST** in OLD. Do not invent a fake success submit.
- **Parity tests:** renders; named back; no invented API.

### PAGE-070 Admin dashboard
- **Route:** `/admin`. `profiles.is_admin` via RequireAdmin.
- **OLD visual authority:** `src/pages/admin/Dashboard.tsx`.
- **What happens:** `GET /api/admin/stats/dau` and dashboard source. Fail closed if not admin.
- **Parity tests:** admin 200; non-admin 403; unauth login.

### PAGE-071 Admin users
- **Route:** `/admin/users`. `AdminUsers.tsx`.
- **What happens:** GET users; POST ban; DELETE unban. Ban can `force_disconnect` / 403 login.
- **Parity tests:** ban; unban; search.

### PAGE-072 Admin reports
- **Route:** `/admin/reports`. `admin/Reports.tsx`.
- **What happens:** GET reports with reporter names and all-statuses filter (handler in adminActions, not shadowed by payout router). PATCH status. Moderators warning WS `moderation_warning`.
- **Parity tests:** All filter; reporter names; patch.

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
