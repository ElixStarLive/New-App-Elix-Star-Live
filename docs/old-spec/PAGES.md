# OLD page / feature specifications

**Canonical complete specification is [`docs/OLD-REBUILD-LEDGER.md`](../OLD-REBUILD-LEDGER.md).** This pack file is an index pointer only. Do not use it as the frozen master. Do not classify NEW code as reusable here.

Proven counts, hard contracts, every PAGE/FLOW/MODAL/SYS, and parity tests live in the master ledger. Numbered REST/WS/tables: [`PROOF-INVENTORIES.md`](./PROOF-INVENTORIES.md).

---

## PAGE-001 Login

- **Route:** `/login` public. Bottom nav hidden.
- **OLD files:** `src/pages/Login.tsx`, `AuthPasswordField.tsx`, `useAuthStore`, `authFeatures.ts`
- **UI/layout:** Centered `elix-auth-form` max-w 420 (xs 320 / sm 380), `bg-white/5 border-white/10 rounded-2xl p-6`. Logo `/elix-logo.png` 96×96. Title **Login**. Label **Email or Username** + Mail icon input. Password field with eye toggle. Checkbox row **Remember email** (checked: fill `#E6E9EE` + black Check). Error: rose text, `border-rose-500/20` rounded-xl. Submit: transparent, `border-[#D8D9DD]/40`, **Sign in** / **Signing in...**. **New here?** + **Sign up** (`bg-white/8`, User icon). Optional **or** divider + Apple button. Optional **Forgot your password?** Footer 11px: Created by Andrei Ionut Berica · © 2026 · Owner & Developer.
- **States:** idle; submitting (button disabled); error; Apple submitting; remembered email prefilled.
- **Buttons/actions:** Sign in → login API; Remember email toggle; Sign up; Apple if `isAppleSignInEnabled()`; Forgot if `isPasswordResetEnabled()`.
- **Navigation:** success → `location.state.from` replace (default `/` then App sends authed users to `/feed`); Sign up `/register` `{ from }`; Forgot `/forgot-password`; authed visit `/login` → `/feed`.
- **Components:** AuthPasswordField, lucide Mail/Check/User, Apple SVG.
- **API:** POST `/api/auth/login` body `{ email, password }` (`email` may be a username). Success `{ user, session: { access_token, accessToken }, profile_meta }`. Cookie set. 401 same copy for bad user/password. See CONTRACTS.
- **WS / LiveKit:** none. After auth, App may open WS later.
- **Server:** lockout Valkey; decoy hash; email confirm gate; ban check; JWT + `elix_auth_sessions`.
- **DB:** auth_users, sessions, profiles (profile_meta).
- **Valkey:** `lockout:*`
- **Uploads:** none
- **Permissions:** none
- **Loading/empty/error:** spinner on submit; inline error; no empty state
- **Reconnect/bg:** abort ignored if unmounted
- **Deps:** PAGE-002, PAGE-004/005, PAGE-006, FLOW-001
- **Edge:** never store password (delete `login_saved_password`); remember email only; no Google; guest not on UI; double-submit blocked
- **Tests:** email login; username login; wrong password same 401 copy; lockout 429; unconfirmed 403; remember email; Apple gated; redirect `from`; authed bounce

## PAGE-002 Register

- **Route:** `/register`
- **OLD:** `Register.tsx`
- **UI:** Same card. Logo 80×80. Title **Create Account**. Username optional, Email, Password, Confirm. Terms checkbox 13+ / ToS / Privacy (large hit target). Links to `/terms` `/privacy`.
- **States:** submitting; error; info (check email); toast welcome 50k starter coins
- **Actions:** submit; show passwords; accept terms; go login
- **Nav:** success → `from`; needs confirm stays on page with info; Login link `/login`
- **API:** POST `/api/auth/register`; POST `/api/auth/consent`; optional resend-confirmation
- **DB:** users, profiles, consents, starter_coin_balances (50,000)
- **Edge:** terms required; password ≥8; match confirm; 409 email/username; consent fail-visible; confirmation_email_sent honest
- **Tests:** terms gate; mismatch; starter coins not in paid lots; consent version `2026-07-21`

## PAGE-003 Verification

- **Route:** `/auth/callback` (verify token query). No `/verify-email` in OLD App routes (email links may hit callback).
- **OLD:** `AuthCallback.tsx` → `authVerifyEmail`
- **API:** POST `/api/auth/verify-email` `{ token }`
- **States:** loading, success, invalid/expired
- **Nav:** then login
- **Tests:** valid; expired; missing token

## PAGE-004 Forgot password

- **OLD:** `ForgotPassword.tsx`
- **API:** POST `/api/auth/forgot-password` `{ email }` always 200
- **Job:** `email_send`
- **Nav:** back login
- **Tests:** enabled flag; no enumeration

## PAGE-005 Reset password

- **OLD:** `ResetPassword.tsx`
- **API:** POST `/api/auth/reset-password` `{ token, password }` invalidates all sessions
- **Tests:** success login with new password; old session 401

## PAGE-006 App shell

- **OLD:** `App.tsx`, `TopNav`, `BottomNav`, `ErrorBoundary`, `OfflineBanner`, `IncomingCallModal`, `LiveNotifyBanner`
- **UI:** `elix-app-shell` 100dvh; TopNav tabs LIVE `#FF2D55`, STEM, Explore, Following, Shop, For You + Search; Bottom Home/Friends/Create/Inbox/Profile icons 26px silver→white; hide matrix in INVENTORIES; auth spinner 40px `#E6E9EE`
- **Actions:** each tab named navigate; edge swipe named exit
- **API:** `/api/auth/me` hydrate/foreground; IAP reconcile
- **WS:** connect after auth; `force_disconnect`; incoming calls
- **Foreground:** reconnect WS, checkUser, reconcile IAP
- **Admin:** `profiles.is_admin`
- **Tests:** public list; unauth redirect; nav hide on live/create/inbox thread/call; admin 403

---

## PAGE-007 For You (`/feed`)

- **OLD:** `VideoFeed.tsx`, `EnhancedVideoPlayer.tsx`, `FeedStoryCirclesOverlay`, `InlineLiveViewer`, `useVideoStore`
- **UI:** Vertical snap. Right rail: like (count), comment, save, share, sound disc, more. Caption + author left. Story rings top. Live cards from **GET /api/live/streams** + presence WS — **tap to join, never auto-navigate** (auto-join caused X→feed infinite loop). TopNav visible. Video under transparent chrome.
- **More sheet:** Copy link, Download (voice-only), Duet, QR, Share, Save/Unsave, Follow, Promote, Report.
- **Actions:** like POST `/api/videos/:id/like|unlike`; comments modal; save; share modal; profile; hashtag; music; live → `/watch/:id`; track-view / track-interaction; stories
- **API:** GET `/api/feed/foryou`, stories, live streams, video mutations
- **WS:** feed presence `stream_started` / `stream_ended` — reconcile cards; prune ended
- **LiveKit:** InlineLiveViewer subscribe-only preview; full join on tap
- **States:** loading spinner; empty feed; error visible; ended live removed
- **Permissions:** none for VOD; live preview may request none until join
- **Edge:** generic live names/avatars enriched from profile; no local leftover lives; IntersectionObserver play/pause; soundtrack on separate audio so scroll-away stops
- **Deps:** comments, likes, share, report, promote, gifts none, PAGE-017/019, PAGE-024
- **Tests:** like toggle; comment; live card only if server live; tap live not auto-loop; empty; pagination

## PAGE-008 STEM `/stem` — same overlay grammar; STEM feed source; no TopNav

## PAGE-009 Following `/following` — GET `/api/feed/following`; empty = no followed videos

## PAGE-010 Friends `/friends` — GET `/api/feed/friends`; bottom Friends tab

## PAGE-011 Discover `/discover` — Explore grid; Top tab Explore; close named

## PAGE-012 Search `/search` — users/videos; swipe-down close as OLD

## PAGE-013 Hashtag `/hashtag/:tag` — GET `/api/hashtags/:tag` + `/videos`

## PAGE-014 Video view `/video/:videoId` — GET `/api/videos/:id`; private 404; same rail as feed

## PAGE-015 Saved `/saved` — GET `/api/videos/saved/list`

## PAGE-016 Music `/music` `/music/:songId`

- **API:** `/api/music/status|global|playlists|collections|search|tracks/:id/preview`
- **Optional Epidemic Sound** if `EPIDEMIC_SOUND_API_KEY`
- **Foreground:** library preview stops only when leaving `/music`

---

## PAGE-017 Live discover `/live`

- **OLD:** `LiveDiscover.tsx`
- **UI:** lobby of live rooms; refresh; empty “no lives”
- **API:** GET `/api/live/streams`
- **Nav:** tap → `/watch/:streamId`; own live via guard `/live/:id`
- **Tests:** only publishing hosts; stale rooms absent

## PAGE-018 Live Host `/live/broadcast` and owner `/live/:streamId`

- **OLD:** `LiveHostScreen.tsx` + host controller (**do not copy god-object**)
- **UI:** Full-bleed camera. Host oval + Follow-on-Join lock (own stream: Follow hidden, Join stays). Chat overlay. Gift overlay (solo: `object-cover`, height `calc(70% - 25mm)` from bottom, fade mask). Top red banner `top: calc(env(safe-area-inset-top)+66px+0.5mm)` `bg-red-600/85`. Capsule above chat. Bottom: gift, share, more; spectators; battle chrome; cohost grid 8 cells; mic/cam; combo; poll; find creators; ranking. Battle 1x1 two tiles / 2x2 four. MVP circles. Close ends live.
- **Buttons (complete set):** close/end live; mic; cam; flip; gift; share; more; spectators list; ranking (all / host / opponent gifters); combo; spectator poll; cohost invite/accept/decline/remove/feature/mute-cohost/cam-cohost/end-cohost; battle find creators, invite, accept/decline, start 1x1/2x2, rematch, remove slot, mute/cam per seat, partner mini profile; gift goal; booster; mist; copy link; mini profile follow/share/watch/moderator/block; report N/A on self.
- **Nav:** end → named exit (usually create or feed); mini profile → profile overlay without tearing LiveKit
- **API:** live start/end/token/status/moderators; gifts catalog/send; wallet; test-coins balance; rankings weekly/daily; engagement; follow; block; live-share
- **WS:** all live in/out; host `stream_start` / `stream_end`; persistent reconnect
- **LiveKit:** publish identity=userId; grant/revoke cohost; 6h token refresh as OLD
- **Server:** Valkey stream+seats+battle; 20s host disconnect grace; gift settle+deliver together
- **DB:** live_streams, gift txns, earnings, battle_results, notifications live_started
- **Valkey:** stream, room:*, cohost:*, battle:*
- **Uploads:** none (camera WebRTC)
- **Permissions:** camera+mic required; deny = real error not fake video
- **States:** connecting; live; reconnecting; ended; battle WAITING/ACTIVE/ENDED; cohost full (max 8); `battle_error` / `gift_ack` fail visible
- **Bg:** persistent WS; 20s grace; do not fake live after honest end
- **Deps:** PAGE-019 identical overlays; FLOW-006/007/008/009/016/017/021/025
- **Edge:** spectator self-watch uses `__v_` identity; battle gifts to audience of seated creators; test gift never money; booster not a score source; rematch must not be killed by previous grace
- **Tests:** start/end; reconnect within 20s keeps live; 9th cohost refused; 1x1/2x2 timer 300s server; paid gift ledger+fan-out; test gift score only; host crash webhook

## PAGE-019 Live Spectator `/watch/:streamId`

- **OLD:** `SpectatorLiveScreen.tsx` + shell
- **UI:** Same gift/chat/Follow-on-Join as host (same overlay props). Follow on Join 70×36px red, `bottom: calc(100% - 12mm)`, wrapper translate. Hearts, gifts, cohost **request** (not invite), battle accept/decline, share, report, profile overlay route.
- **API:** token publish=0 until cohost grant; follow; gifts; hearts daily; report; block; live-share
- **WS:** room + cohost_request_send + battle_invite_accept + hearts/chat/gifts
- **LiveKit:** subscribe; `__v_` identity
- **Nav:** close named; `/watch/:id/profile/:userId` without tearing room
- **Like tap ≠ battle tap ≠ daily heart** (CONTRACTS)
- **Tests:** join while host already live; follow; gift; cohost request; stream_ended leaves; independent of host client process

## PAGE-020 Live profile overlay `/watch/:id/profile/:userId`

- **OLD:** `ProfileLiveOverlay.tsx` — profile sheet; LiveKit stays up; close back to watch

---

## PAGE-021 Create `/create`

- **OLD:** `Create.tsx`, `ElixCameraLayout.tsx`, `CaptureShutterButton.tsx` (locked look)
- **UI:** close, Add sound, Upload, POST/CREATE/LIVE modes, shutter, right rail discs, silver-red text
- **API:** GET `/api/camera-filters` `/speed-options` `/sticker-options`
- **Nav:** LIVE → host start; Upload → `/upload`; sound panels
- **Permissions:** camera/mic
- **Deps:** PAGE-018, PAGE-022, sound library

## PAGE-022 Upload `/upload`

- **API:** POST `/api/media/upload-file?path=videos/<userId>/...` then POST `/api/videos` then POST `/:id/fyp`
- **Errors:** 403 AUDIO_BLOCKED copyright; Bunny 502; path must be own userId
- **Fields:** caption, hashtags, privacy, duetWithVideoId, duetLayout overlay|split

## PAGE-023 AI Studio `/ai-studio` — AIToolsPanel; no fake generation; nav hidden

---

## PAGE-024 Own profile `/profile`

- **OLD:** `Profile.tsx`
- **UI:** avatar + story plus, stats following/followers/likes/views, share, title Profile, close, settings gear, tabs **videos / shop / private / reposts / saved / liked** icon tabs, grid
- **API:** GET profile, videos user/saved/liked, shop by user, reposts, stories
- **Nav:** settings, edit, follow lists, video, shop, coins
- **Empty:** empty grids

## PAGE-025 Public profile `/profile/:userId`

- Follow / Unfollow / Message (`threads/ensure` → `/inbox/:id`) / more block+report
- POST `/:id/view` unique views
- No private tab

## PAGE-026 Edit profile — PATCH profile; avatar `avatars/<userId>/`

## PAGE-027 / 028 Follow lists — GET followers/following; follow/unfollow

## PAGE-029 Creator login details `/creator/login-details`

---

## PAGE-030 Inbox `/inbox`

- **OLD:** `Inbox.tsx` (locked look)
- **UI:** close → `/feed`. Filters **Main / Unread / Activity**. Hubs: New followers, Activity, Gift received, Alerts (bell → `/alerts`). Conversation rows; unread dot.
- **API:** GET `/api/chat/threads`; DELETE thread; GET `/api/activity`; notifications; live-share requests; followers
- **Forbidden leftovers:** no `elix_inbox_deleted_*` localStorage; no fabricated `username: 'user'`; likes not on Main as Archive
- **Nav:** thread `/inbox/:id` with `returnTo: /inbox`; alerts; profiles with inbox return
- **Empty:** no messages / no unread
- **Delete:** server only, shared Main+Unread

## PAGE-031 Activity overlay — portal; likes/comments real actors; close Inbox

## PAGE-032 Alerts `/alerts` — GET/POST notifications; close Inbox

## PAGE-033 Chat thread `/inbox/:threadId`

- **Locked UI:** handle pill; video call left; avatar 48 centered; back right; username under; no header level; messages left, ring→level→name then body; LevelBadge 30/16; composer
- **API:** messages list/post/read
- **Nav:** close Inbox; call `/call` after ensure

## PAGE-034 Video call `/call`

- **Locked:** PiP local top-right; remote; Calling…; green Accept only incoming; red End `#EF4444`; close ends → that DM
- **WS:** call_*; LiveKit `call_*` both publish
- **Blocked callee:** `call_rejected` blocked

## PAGE-035 IncomingCallModal — red decline green accept → `/call`

---

## PAGE-036/037 Shop `/shop` `/shop/:itemId`

- **API:** items CRUD own; Stripe checkout `{ itemId|items[], idempotencyKey? }`; GET checkout-session
- **Money:** Stripe only. Success/cancel URLs from CLIENT_URL
- **Basket:** max 10 lines qty 1–99

## PAGE-038 Purchase coins `/purchase-coins` + BuyCoinsModal

- GET packages; native IAP; POST verify-purchase; loading/cancel/fail; no double tap; no fake success
- Web: must not charge coins via Stripe

## PAGE-039 Wallet display — GET wallet + engagement wallet; test-coins GET separate

---

## PAGE-040 Settings `/settings`

- **OLD:** Settings.tsx in SettingsOptionSheet
- **Rows:** Edit profile, Privacy→safety, Security, Delete account, Creator payout, Engagement Hub (flag), Admin (is_admin), Notifications, Live notifications toggle, Mute all sounds, Dark mode always-on toast, Language, Video quality auto toast, Liked → `profile?tab=liked`, Saved, Blocked, Safety, How it works, Support, Terms, Privacy, Guidelines, Log out
- **API:** logout; delete with confirm
- **Nav:** children `returnTo` settings; close named (profile)

## PAGE-041 Safety `/settings/safety`

## PAGE-042 Security — 2FA status/enroll/verify/disable

## PAGE-043 Notification settings — device-tokens POST/DELETE; local notificationsEnabled

## PAGE-044 Blocked — GET blocked-users; unblock

## PAGE-045 Creator payout `/settings/payout`

- GET balance, ledger, withdrawals-gbp, payout-methods, payout-account
- POST withdraw-gbp, payout-method, payout-account/onboard (Stripe Connect)
- Locked vs available coins; no test-coin withdraw

## PAGE-046 Report `/report` + ReportModal — POST `/api/report` `{ targetType, targetId, reason, details }`

---

## PAGE-047 Engagement Hub `/engagement`

- Flag `ENGAGEMENT_HUB_ENABLED`; else 404
- Sheet: fan tier · level; Promo / Energy / XP; claim daily if can_claim; links missions, fan-level, mvp, achievements, rewards, daily-login, collections
- Copy: promo/energy ≠ purchased coins
- GET `/api/engagement/hub`
- Close → Settings

## PAGE-048–054 Engagement children

| ID | Route | API |
| --- | --- | --- |
| 048 Missions | `/engagement/missions` | GET missions, POST claim, POST progress |
| 049 Fan level | `/fan-level` | GET fan-level + progression |
| 050 MVP | `/mvp` | GET mvp + earn |
| 051 Achievements | `/achievements` | GET achievements |
| 052 Rewards | `/rewards` | GET engagement/wallet — separate purchased/promo/starter/energy/XP |
| 053 Daily login | `/daily-login` | GET + POST claim 7-day |
| 054 Collections | `/collections` | treasure/stickers/creator-cards spawn/open |

Promo gifts 0 Diamonds. Battle energy never Diamonds.

## PAGE-055/056 Rising Stars

- GET `/api/rising-stars` challenges/entries/leaderboard/live/teams/rewards/badges
- POST enter (limiter), vote, teams, attach live; DELETE withdraw entry
- DB `rs_*` tables

---

## PAGE-057–069 Legal / support (public)

Terms, Privacy, Copyright, Legal hub + audio/ugc/affiliate/dmca/safety/supplier, Guidelines, How it works, Support. Readable documents; named back; no fake ticket API unless OLD page posts (Support is content). Register and Settings link Terms/Privacy/Guidelines.

---

## PAGE-070–078 Admin (`profiles.is_admin`)

| ID | Route | APIs |
| --- | --- | --- |
| 070 Dashboard | `/admin` | stats/dau |
| 071 Users | `/admin/users` | GET users; POST/DELETE ban |
| 072 Reports | `/admin/reports` | GET reports (join reporter names, all statuses); PATCH |
| 073 Economy | `/admin/economy` | wallet/economy views |
| 074 Monetisation | `/admin/monetisation` | config, settlements coin-lot/promote/subscription, **reverse**, rewards periods, audit, reconciliation, withdrawals-gbp, fraud-reviews, foryou-config, foryou-sweep |
| 075 Purchases | `/admin/purchases` | purchases + iap-purchases |
| 076 Withdrawals | `/admin/withdrawals` | payouts approve/reject/mark-paid/cancel/review; chargeback; unfreeze (must keep reserved locks) |
| 077 RS admin | `/admin/rising-stars` | nested admin RS |
| 078 Progression | `/admin/progression` | nested admin progression |

One admin gate. Fail closed. No dual auth.

---

## FLOW specs (cross-page)

**FLOW-001 Session:** persist token; GET `/me`; invalid → login; foreground check; cookie+bearer as OLD client.

**FLOW-002 Follow/block:** POST follow/unfollow; block either-way; calls rejected blocked; comments 403.

**FLOW-003 Comments/likes/saves:** sort newest (default) / oldest / most liked; comment likes; Activity API.

**FLOW-004 Stories:** GET grouped; POST; 24h TTL; gold ring; add-story.

**FLOW-005 Bunny:** path `videos|stories|avatars|shop|thumbnails/<userId>/`; audio scan PEX; cdnUrl; delete own.

**FLOW-006 Gifts:** catalog; REST send; WS gift_sent payload; overlays locked; goals; booster_caught.

**FLOW-007 Co-host 8+1:** see CONTRACTS.

**FLOW-008/009 Battle 1x1/2x2:** see CONTRACTS.

**FLOW-010 IAP coins:** packages SKU mapping Apple/Google; verify; webhooks; lots; reconcile launch.

**FLOW-011 Membership IAP:** membership/iap-complete; status; Play auto product `elix.creator.<hex>`.

**FLOW-012 Shop Stripe:** checkout session server-side; webhook; idempotencyKey.

**FLOW-013 60/40:** integer pence; floor creator remainder platform; FIFO lots.

**FLOW-014 Withdrawals:** pending/available/locked; Connect; admin.

**FLOW-015 Refunds:** store webhook + admin reverse; unwind all.

**FLOW-016 LiveKit:** identities, publish authority, webhook.

**FLOW-017 WS reconnect:** 15 tries; persistent host; exhausted event.

**FLOW-018 Push:** device-tokens; FCM/APNs optional.

**FLOW-019 Calls:** WS + call_ rooms.

**FLOW-020 Live share inbox.**

**FLOW-021 Test coins:** mint password Valkey fail-closed; giftSource test_coins.

**FLOW-022 Daily hearts.**

**FLOW-023 Rankings weekly/daily from gift earnings.

**FLOW-024 Promote IAP platform 100%.

**FLOW-025 Live moderation check + warning + moderator CRUD + bans.

**FLOW-026 Permissions denied honest.

**FLOW-027 Bg/fg + 20s host grace.

---

## MODAL specs (behaviour)

Comments: handle pill; Newest left; title Comments center; Oldest + Most Liked right; one split line; no marquee.  
Gifts: overlay/banner/capsule locked positions (see PAGE-018).  
Buy coins: IAP.  
Incoming call: red/green.  
Follow on Join: exact mm (INVENTORIES + PAGE-019).

---

## Honesty

Pixel-perfect Tailwind for LiveHostScreen (~3600 lines) and EnhancedVideoPlayer is **not** duplicated here. When rebuilding those IDs, open the OLD file as the visual spec and implement **new** markup that matches. Every **action, route, API, WS event, table, and money rule** required to rebuild without guessing is listed above or in CONTRACTS/INVENTORIES.
