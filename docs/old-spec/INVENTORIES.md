# OLD production inventories

**Source (read-only):** `C:\Users\Absm Construction\Desktop\Elix Star Live`  
**Frozen commit:** `a1c9b11ed3cc47c8a858430076864ac9e7ebbc84`  
**Do not copy OLD source into NEW.** These lists are *what exists*. NEW must re-implement outcomes.

**Master specification:** [`docs/OLD-REBUILD-LEDGER.md`](../OLD-REBUILD-LEDGER.md)  
**Numbered proof (262 REST, 97 WS, 131 tables, 62 Valkey, 15 jobs):** [`PROOF-INVENTORIES.md`](./PROOF-INVENTORIES.md)

This audit does **not** classify NEW Login or any NEW screen as reusable.

---

## 1. Screens (routed)

| Route | Screen | Auth | Bottom nav | Top nav |
| --- | --- | --- | --- | --- |
| `/login` | Login | public | hidden | no |
| `/register` | Register | public | hidden | no |
| `/auth/callback` | AuthCallback | public | — | — |
| `/forgot-password` | ForgotPassword | public | — | — |
| `/reset-password` | ResetPassword | public | — | — |
| `/terms` | Terms | public | — | — |
| `/privacy` | Privacy | public | — | — |
| `/copyright` | Copyright | public | — | — |
| `/legal` | Legal | public | — | — |
| `/legal/audio` | LegalAudio | public | — | — |
| `/legal/ugc` | LegalUGC | public | — | — |
| `/legal/affiliate` | LegalAffiliate | public | — | — |
| `/legal/dmca` | LegalDMCA | public | — | — |
| `/legal/safety` | LegalSafety | public | — | — |
| `/legal/supplier` | LegalSupplier | public | — | — |
| `/guidelines` | Guidelines | public | — | — |
| `/how-it-works` | HowItWorks | public | — | — |
| `/support` | Support | public | — | — |
| `/` | redirect feed or login | — | — | — |
| `/feed` | VideoFeed (For You) | yes | yes | yes |
| `/stem` | StemFeed | yes | yes | no |
| `/following` | FollowingFeed | yes | yes | no |
| `/friends` | FriendsFeed | yes | yes | no |
| `/discover` | Discover | yes | yes | no |
| `/search` | SearchPage | yes | yes | no |
| `/hashtag/:tag` | Hashtag | yes | yes | no |
| `/video/:videoId` | VideoView | yes | yes* | no |
| `/saved` | SavedVideos | yes | yes | no |
| `/music` `/music/:songId` | MusicFeed | yes | yes | no |
| `/rising-stars` | RisingStars | yes | yes | no |
| `/rising-stars/challenge/:challengeId` | RisingStarsChallenge | yes | yes | no |
| `/engagement` + 7 children | Engagement sheets | yes | yes | no |
| `/report` | Report | yes | yes | no |
| `/live` | LiveDiscover | yes | hidden | no |
| `/live/broadcast` | Live Host | yes | hidden | no |
| `/live/:streamId` | LiveStreamGuard (host or redirect watch) | yes | hidden | no |
| `/live/start` | → `/live` | yes | — | — |
| `/live/watch/:id` | → `/watch/:id` | yes | — | — |
| `/watch/:streamId` | Live Spectator | yes | hidden | no |
| `/watch/:id/profile/:userId` | Profile overlay on live | yes | hidden | no |
| `/profile` `/profile/:userId` | Profile | yes | yes | no |
| `/profile/:id/followers` `/following` | FollowList | yes | yes | no |
| `/edit-profile` | EditProfile | yes | yes | no |
| `/creator/login-details` | CreatorLoginDetails | yes | yes | no |
| `/create` | Create camera | yes | hidden | no |
| `/upload` | Upload | yes | hidden | no |
| `/ai-studio` | AIStudio | yes | hidden | no |
| `/inbox` | Inbox | yes | yes | no |
| `/alerts` | Alerts | yes | yes | no |
| `/inbox/:threadId` | ChatThread | yes | hidden | no |
| `/call` | VideoCall | yes | hidden | no |
| `/shop` `/shop/:itemId` | Shop | yes | yes | no (Shop is a For You top tab) |
| `/purchase-coins` | PurchaseCoins | yes | yes | no |
| `/settings` + children | Settings family | yes | yes | no |
| `/admin` + 8 children | Admin | admin | yes | no |
| `*` | → `/feed` | — | — | — |

\* `/video/:id` is full-screen chrome (`isFullScreen`) but bottom nav still shows unless a hide rule matches; OLD: full-screen feed-like, bottom nav visible.

Page files under `src/pages/` (72). Live UI: `src/features/live/host/LiveHostScreen.tsx`, `src/features/live/spectator/SpectatorLiveScreen.tsx`.

---

## 2. Modals / sheets / global overlays

| ID | Component | Trigger |
| --- | --- | --- |
| IncomingCallModal | global App | WS `call_invite` |
| OfflineBanner | global App | navigator offline |
| LiveNotifyBanner | global App | live notifications |
| EnhancedCommentsModal | feed / video | comment rail |
| EnhancedLikesModal | feed / video | like list |
| ShareModal | feed / live / profile | share |
| ReportModal | more / report | report |
| UserProfileModal | live / feed | avatar tap |
| BuyCoinsModal | gifts / coins | buy coins |
| GiftPanel | live | gift button |
| GiftOverlay | live | gift video |
| GiftAnimationOverlay | live | top red banner |
| LiveGiftFeedStack | live | above-chat capsule |
| GiftGoalGallery | live | gift goal |
| RankingPanel | live | rankings |
| ChatOverlay | live | chat |
| PromotePanel | more | promote IAP |
| SettingsOptionSheet | settings / engagement | sheet chrome |
| LanguagePickerSheet | settings | language |
| SoundPickerPanel / SoundLibraryView / SoundMixPanel | create | sound |
| MediaEditorPanel | create | edit |
| AIToolsPanel | create / AI studio | AI |
| BattleVfxOverlays / BattleTauntOverlays / BattleEnergyBoostControls | live battle | battle |
| LiveEngagementOverlay / LiveSideMissionStack | live | engagement |
| FeedStoryCirclesOverlay | For You | stories |
| InlineLiveViewer | For You live card | preview (no auto-join) |
| LiveHostProfileHeader (Follow on Join) | live host+spectator | header |
| More options sheet | EnhancedVideoPlayer | more |
| Inbox Activity portal | Inbox | Activity |
| New followers hub | Inbox | New followers |
| Gift received hub | Inbox | gifts |

---

## 3. Client routes vs server routes

Client routes: section 1.  
HTTP API: `docs/old-spec/CONTRACTS.md` §API.  
WebSocket: `wss://<host>/live/<roomId>?token=<jwt>[&audienceCreatorId=]`  
Static: `GET /health` `GET /api/health` `GET /gifts/*`  
Webhooks (raw body, before JSON parser):  
`POST /api/stripe-webhook`  
`POST /api/livekit/webhook`  
`POST /api/webhooks/google-play`  
`POST /api/webhooks/apple-iap`

---

## 4. Database tables (Neon) — behaviour domains

**Auth / identity:** `auth_users` / `elix_auth_users`, `elix_auth_sessions`, `user_consents`, `user_two_factor`, Apple `apple_sub` on users, email confirmation columns.

**Social:** `profiles`, `follows`, `profile_unique_views`, `elix_blocked_users`, `elix_reports`, `elix_reposts`.

**VOD:** `videos`, `likes`, `saves`, `comments`, `comment_likes`, `video_views`, `video_view_counters`, `video_scores`, `elix_video_foryou_state`, `elix_video_not_interested`, `elix_video_feed_signals`, `elix_foryou_config`, `elix_qualified_video_views`, `elix_video_view_metrics`.

**Stories:** `stories` (24h `expires_at`).

**Live:** `live_streams`, `live_stream_moderators`, `live_moderation_log`, `live_share_inbox`, `battle_creator_buckets`, `battle_results`, `battle_result_participants`.

**Chat:** `chat_threads`, `messages`.

**Gifts / coins:** `elix_gifts`, `elix_gift_transactions`, `gift_logs`, `elix_coin_packages`, `elix_wallet_balances`, `elix_wallet_ledger`, `elix_paid_coin_lots`, `elix_processed_purchases`, `elix_processed_webhook_events`.

**Creator money:** `elix_creator_balances`, `elix_creator_earnings`, `elix_creator_wallet_gbp`, `elix_financial_ledger`, `elix_platform_wallet_gbp`, `elix_payout_requests`, `elix_payout_methods`, `elix_payout_audit`, `elix_creator_payout_accounts`, `elix_payout_provider_events`, `elix_creator_withdrawals_gbp`, `elix_creator_withdrawal_status_history`, `elix_monetisation_config` + audit, `elix_creator_reward_periods/results/milestones`.

**Shop:** `shop_items`, `elix_shop_purchases`.

**IAP extras:** `elix_promote_purchases`, `elix_membership_purchases`, `elix_creator_membership_products`, Google consume columns (refund recoverable migration).

**Notifications / devices / analytics:** `elix_notifications`, `elix_device_tokens`, `elix_analytics_events`.

**Engagement:** `promotional_coin_balances/ledger`, `battle_energy_balances/ledger/daily_caps`, `engagement_missions`, `user_mission_progress`, `engagement_achievements`, `user_achievements`, `daily_reward_claims/config`, `mvp_scores`, `battle_fan_energy`, `engagement_settings`, `engagement_admin_audit`, treasure/sticker/creator-card tables, unique creator visits.

**Progression:** `starter_coin_balances/transactions`, `user_progression`, `xp_activity_config`, `xp_level_requirements`, `xp_transactions`, `level_history`.

**Rising Stars:** `rs_seasons`, `rs_categories`, `rs_regions`, `rs_challenges`, `rs_teams`, `rs_team_members`, `rs_entries`, `rs_votes`, `rs_phase_results`, `rs_badges`, `rs_user_badges`, `rs_reward_definitions`, `rs_reward_grants`, `rs_admin_audit`.

**Boosters / copyright / sounds:** `booster_config`, `booster_catch_logs`, `sounds`, `sound_rights_confirmations`, `sound_reuse_events`, `copyright_reports/appeals/moderation_actions`.

**Stickers / hearts:** `creator_stickers`, `daily_hearts`.

**Fraud / ops:** `elix_fraud_decisions`, `elix_fraud_reviews`, `elix_reconciliation_runs`, `elix_test_coin_issue_audit`, `elix_runtime_config`, `elix_store_financial_reports` + lines.

**Migrations:** 65 SQL files under `server/migrations/` (20260326 through 20260818). NEW may use a **clean schema** that still supports these outcomes. Do not copy the patch-ladder gift-price migrations as-is.

---

## 5. Valkey / realtime keys

| Key | Role |
| --- | --- |
| `stream:{roomId}` | HASH live stream (userId, startedAt, displayName), TTL 86400s |
| `room:members:{roomId}` | SET userIds (viewer count = SCARD) |
| `room:meta:{roomId}` | HASH live_likes |
| `room:audience:{roomId}` | HASH userId → audienceCreatorId |
| `room:{roomId}` | pub/sub fan-out |
| `cohost:{roomId}` | JSON layout |
| `cohost:lock:{room}` | seat write lock |
| `cohost:req:{roomId}` | HASH pending join requests |
| `battle:{roomId}` | session JSON |
| `battle:scores:{roomId}` | scores |
| `battle:seat_lock:` / `battle:tick:{roomId}` | locks |
| `battle:pending_invites:` | invites |
| `battle:final:{battleId}` | finalize NX |
| `battles:result_outbox` + `battle:result_pending:` | persist outbox |
| `engage:room:{roomId}` | engagement state |
| `lockout:{ip:login}` | login lockout |
| `elix:jobs` / `elix:jobs:dlq` | job queue |
| test-coin mint lockout / request ids | Valkey required (fail closed) |
| audio scan cache | Valkey |
| job leader lease | Valkey election |

Process-local Maps are **not** multi-instance authority. Production requires Valkey.

---

## 6. LiveKit flows

1. **Solo live host:** `POST /api/live/start` → room name → `GET /api/live/token?room=&publish=1` (only if `resolveLivePublishAuthority` = authorized) → client publishes camera/mic. Identity = `userId`. TTL 6h.
2. **Spectator:** token `publish=0`. Identity = `{userId}__v_{12hex}` so host+self-watch / two devices do not DUPLICATE_IDENTITY-kick. Subscribe only.
3. **Co-host accept:** server grants publish; client re-fetches publish token; identity becomes stable `userId`.
4. **Co-host leave/release/clear:** revoke publish; spectator identity again.
5. **Battle:** participants publish in mapped rooms; gifts score via battle seats not LiveKit.
6. **1:1 call:** room `call_<uuid>`; both may publish without live-host registry.
7. **Presence:** `listActiveRoomsFromLiveKit` + publishing tracks = actually live. Feed cards from **server**, not local leftover.
8. **Webhook:** LiveKit webhook ends stale rooms; must be idempotent (not process-local 20s timers as authority).
9. **Token never from client secret.** Client uses `VITE_LIVEKIT_URL` + server JWT.

---

## 7. Payment / IAP flows

| Flow | Mechanism | Not allowed |
| --- | --- | --- |
| Coin packages | Apple / Google IAP → `POST /api/verify-purchase` + store webhooks | Stripe |
| Promote video | IAP `POST /api/promote-iap-complete` — platform 100% net | creator share |
| Creator membership | IAP SKU `com.elixstarlive.membership` / Play `elix.creator.<24-hex>` | Stripe coins |
| Shop physical | Stripe Checkout `POST /api/shop/checkout` + webhook | IAP |
| Creator GBP payout | Stripe Connect onboard + withdraw-gbp + admin | test coins |
| Test coins | mint password + Valkey balance; giftSource test; battle/animation only | lots, GBP, IAP, Stripe |
| Starter / promo coins | separate balances; promo gifts 0 Diamonds | merge with paid |

Verify-purchase: auth required; `userId` must equal token sub; provider apple|google; product gated per provider; Google receipt required; idempotent `elix_processed_purchases`; foreign-account replay → 403 `transaction_owned_by_another_user`; product conflict 409. Rate limit + fraud velocity. Fail closed if catalog/config missing.

Refunds: Apple ASSN V2 + Google RTDN + admin `POST /api/admin/monetisation/settlements/reverse`. Unwind lots + earnings. Recoverable flags from migration `20260817010000`.

---

## 8. Notification flows

| Type | Writer | Surface |
| --- | --- | --- |
| `live_started` | live start → followers | Inbox / LiveNotifyBanner; pruned when stream ends |
| Gift received | gift send | Inbox Gift hub (named sender, not “Someone”) |
| Live share | `POST /api/live-share` | Inbox live-share requests |
| Follow | follow API | New followers hub (not Archive duplicate) |
| Like/comment | **not** anonymous Main rows | Inbox Activity via `GET /api/activity` |
| Rising Stars | first writer into `elix_notifications` | Alerts |
| Push | `elix_device_tokens` + job `push_notify` | FCM/APNs if env set |

`GET /api/notifications` (limit 50) prunes ended-live and legacy anonymous gifts. `POST /api/notifications/read`. Retention job deletes old rows (default 60 days).

---

## 9. Background jobs (Valkey leader)

Leader elected via Valkey lease (`ELIX_JOB_WORKER=0` opts out). Jobs:

| Job | When |
| --- | --- |
| `cleanup_retention` | start + every 24h — analytics (default 90d) + notifications (default 60d) + enqueue unconsumed Google Play consumes |
| `push_notify` | on notification insert |
| `email_send` | confirmation / reset |
| `google_play_consume` | after Android credit |

Recurring leader timers: creator reward period open/close (hourly), wallet ledger reconciliation (6h), For You lifecycle sweep (15m), mature creator GBP pending earnings, neon mature earnings.

Battle tick: 1s distributed lock `battle:tick:{roomId}`. Host disconnect grace **20s** before end live. WS ping 25s client / server heartbeat.

---

## 10. Environment / infrastructure (production boot)

Required: `DATABASE_URL`, `JWT_SECRET` (≥32 chars, 256-bit hex recommended), `VALKEY_URL` or `REDIS_URL`, Bunny zone+key, LiveKit URL+key+secret (wss, not localhost), Stripe live `sk_live_` + `whsec_`, `CLIENT_URL` public https, Google service account JSON (parseable, email+private_key), `GOOGLE_PLAY_PACKAGE_NAME=com.elixstarlive.app`, Apple issuer/key/private PKCS8 EC, `APPLE_BUNDLE_ID=com.elixstarlive.app`, `APPLE_IAP_NOTIFICATION_SECRET`. No `ELIX_SKIP_MIGRATION_CHECK`. No `ELIX_STRIPE_CONNECT_MODE=test`.

Optional: Epidemic Sound, PEX audio scan, OpenAI moderation, FCM/APNs, SMTP/SendGrid, test-coin issue password.

Client Vite: `VITE_API_URL`, `VITE_WS_URL`, `VITE_LIVEKIT_URL`, `VITE_BUNNY_CDN_HOSTNAME`, `VITE_STRIPE_PUBLISHABLE_KEY` (shop only), `VITE_ALLOW_TEST_COINS`, Apple sign-in flag via `/env.js`.

Stack: Hetzner + Coolify, Neon, Valkey, LiveKit, Bunny. Forbidden: Supabase, Appwrite, Railway, Netlify, Ghost, DigitalOcean, Firebase as backend.

Package id: `com.elixstarlive.app`.
