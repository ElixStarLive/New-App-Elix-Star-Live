# Reference application inventory

**Source (READ-ONLY):** `C:\Users\Absm Construction\Desktop\Elix Star Live`  
**Frozen commit:** `a1c9b11ed3cc47c8a858430076864ac9e7ebbc84`  
**Purpose:** establish 1:1 UI, navigation, features, API, database, LiveKit, WebSocket, and money behaviour for the NEW app. This file does not implement anything.

---

## Screens and routes

### Auth

| Route | Page | Actions |
| --- | --- | --- |
| `/login` | Login | Email/username + password, remember email, Apple Sign-In (if enabled), forgot password, sign up |
| `/register` | Register | Email, username, password, resend confirmation |
| `/auth/callback` | AuthCallback | OAuth/callback |
| `/forgot-password` | ForgotPassword | Request reset email |
| `/reset-password` | ResetPassword | Set new password |
| `/creator/login-details` | CreatorLoginDetails | Creator login details |

### Feed and discovery

| Route | Page | Actions |
| --- | --- | --- |
| `/` | redirect | → `/feed` if authed else `/login` |
| `/feed` | VideoFeed | Vertical snap, like/comment/share, story circles, tap live card |
| `/stem` | StemFeed | STEM vertical feed |
| `/following` | FollowingFeed | Following-only videos |
| `/friends` | FriendsFeed | Friends tab feed |
| `/discover` | Discover | Explore grid |
| `/search` | SearchPage | Search users/videos, swipe-down close |
| `/hashtag/:tag` | Hashtag | Hashtag videos |
| `/video/:videoId` | VideoView | Single video |
| `/saved` | SavedVideos | Saved list |
| `/music`, `/music/:songId` | MusicFeed | Sound library |
| `/rising-stars` | RisingStars | Hub |
| `/rising-stars/challenge/:id` | RisingStarsChallenge | Challenge |

### Live

| Route | Page | Actions |
| --- | --- | --- |
| `/live` | LiveDiscover | Lobby, tap to watch, refresh |
| `/live/broadcast` | Live host | Go live, cam/mic, chat, gifts, co-host, battle, end |
| `/live/:streamId` | LiveStreamGuard | Owner stays host; others → `/watch/:id`; `?battle=1` battle join |
| `/live/start` | redirect | → `/live` |
| `/live/watch/:id` | redirect | → `/watch/:id` |
| `/watch/:streamId` | Spectator | Watch, follow, gifts, hearts, co-host request, battle accept, share, report |
| `/watch/:id/profile/:userId` | Profile overlay | Profile without tearing LiveKit |

Co-host: 8 seats. Invite, request, accept, decline, cancel, seat assign/release, remove, big-screen layout.  
Battle: `1x1` and `2x2`. Seats `host | opponent | player3 | player4`. Teams host+player3 vs opponent+player4.

### Profile and social

| Route | Actions |
| --- | --- |
| `/profile`, `/profile/:userId` | Tabs videos/shop/private/reposts/saved/liked; follow; DM; share; avatar; settings |
| `/profile/:id/followers`, `/following` | Lists |
| `/edit-profile` | Name, bio, username, avatar |

### Create / upload

| Route | Actions |
| --- | --- |
| `/create` | Camera, record, filters, sound, AI, go live |
| `/upload` | Caption, hashtags, post, duet |
| `/ai-studio` | AI tools (no bottom nav) |

### Inbox / calls

| Route | Actions |
| --- | --- |
| `/inbox` | Messages / Activity / Followers / Suggested |
| `/inbox/:threadId` | DM send, video call button |
| `/alerts` | Notification archive |
| `/call` | 1:1 LiveKit call |
| IncomingCallModal | Global incoming call |

### Settings / wallet / shop / legal

| Route | Actions |
| --- | --- |
| `/settings` | Profile, safety, security, payout, engagement, notifications, blocked, language, dark mode, mute, logout, delete account |
| `/settings/payout` | Stripe Connect, GBP withdraw, ledger |
| `/settings/blocked` | Unblock |
| `/settings/safety` | Safety center |
| `/settings/security` | 2FA / password |
| `/settings/notifications` | Prefs |
| `/purchase-coins` | Apple/Google coin packs, restore |
| `/shop`, `/shop/:itemId` | Listings, cart, Stripe checkout |
| `/engagement/*` | Missions, fan level, MVP, achievements, rewards, daily login, collections |
| `/admin/*` | Dashboard, users, reports, economy, monetisation, purchases, withdrawals, rising stars, progression |
| `/report` | Report form |
| `/support`, `/terms`, `/privacy`, `/copyright`, `/legal/*`, `/guidelines`, `/how-it-works` | Legal/support |

### Navigation chrome

- Bottom: Home `/feed`, Friends `/friends`, Create `/create`, Inbox `/inbox`, Profile `/profile`. 40px icon discs, labels 9px. Hidden on live, create, upload, AI studio, login/register, DM thread, call.
- Top (For You only): LIVE `#FF2D55`, STEM, Explore, Following, Shop, For You. Search icon → `/search`.
- Column width 480px. Cosmic fundal. Edge swipe 24px / 60px threshold.

### Modals / sheets / overlays

BuyCoins, Share, Report, UserProfile, Comments, Likes, SettingsOptionSheet, LanguagePicker, NativeDialog, GiftPanel, GiftOverlay, GiftAnimationOverlay, GiftGoalGallery, ChatOverlay, LiveEngagementOverlay, EngagementDrawer, Battle VFX/taunt/energy, PromotePanel, AI/Media/Sound panels, FeedStoryCircles, LiveGiftFeedStack, RankingPanel, IncomingCall, LiveNotifyBanner, OfflineBanner.

---

## Backend — REST (summary)

Mounted under `/api`:

- **Auth:** POST login, guest, register, logout, delete; GET me; POST consent; 2FA enroll/verify/disable/status; resend-confirmation; verify-email; apple/start, apple/native; forgot-password; reset-password.
- **Live:** GET streams, status, token; POST start, end; stream moderators CRUD.
- **Gifts:** GET catalog; POST send.
- **Feed:** GET foryou, friends, following; POST track-view, track-interaction.
- **Chat:** threads ensure/list/get/messages/read/delete.
- **Profiles:** list, by-username, get/patch, follow/unfollow, view, followers/following.
- **Wallet:** GET balance.
- **Shop / coin-packages:** items CRUD, checkout, checkout-session; packages list.
- **Creator:** balance, withdraw-gbp, withdrawals, ledger, payout methods, Connect onboard.
- **Admin:** users, reports, purchases, IAP, DAU, bans, monetisation, progression, rising-stars, payouts, chargebacks.
- **Videos / stories / media / music / engagement / progression / rising-stars / reposts / misc** (block, report, IAP verify, membership, device-tokens, notifications, hearts, rankings, hashtags, camera options, stickers).
- **Test coins:** balance, authorize, mint (QA only, never money).
- **Webhooks:** Stripe, LiveKit, Google Play RTDN, Apple IAP.
- **Health:** `/health`, `/api/health`. Metrics secret-gated.

No Google OAuth login. Google is Play Billing only.

---

## WebSocket

- Same HTTP server (`ws`). Query `?room=&token=`. Special room `__feed__` for presence.
- Auth: JWT + live session; banned/revoked close 1008. Production requires Valkey.
- Inbound: ping, chat_message, heart_sent, gift_sent, battle_*, cohost_*, stream_start/end, booster/mist, gift_goal, engagement_*, call_*.
- Outbound envelope `{ event, data, timestamp }`.
- Pub/sub: `room:{id}`, `user:{id}`, `feed:global`.

---

## Database (target tables distilled from 65 historical migrations)

Auth/social: users, sessions, profiles, follows, blocks, reports, consents, two_factor, device_tokens, notifications.  
Content: videos, comments, likes, saves, views, stories, reposts, hashtags, sounds.  
Live: live_streams, live_stream_moderators, battle_results.  
Money: wallet_balances, wallet_ledger, gift_transactions, gifts, coin_packages, paid_coin_lots, processed_purchases, processed_webhook_events, starter/promo coin tables, financial_ledger (GBP pence append-only), creator_wallet_gbp, platform_wallet_gbp, payout tables, fraud/reconciliation.  
Chat: threads, messages.  
Shop: items, cart purchases.  
Engagement / Rising Stars / membership / runtime_config / foryou state.

---

## Workers / cron

Valkey queue `elix:jobs` + DLQ + leader lease. Jobs: cleanup, push, email, google_play_consume.  
Timers (leader): earnings mature 5m, rewards 1h, reconcile 6h, For You sweep 15m, retention 24h, battle tick 1s when active.

---

## Integrations

PostgreSQL/Neon, Valkey/Redis, LiveKit, Bunny, Stripe (shop + Connect, never coins), Apple IAP + Sign in with Apple, Google Play Billing, FCM + APNs, SMTP/SendGrid, Sentry, Epidemic Sound, Coolify, CodeMagic, optional OpenAI moderation, PEX audio scan.

---

## Theme tokens (authoritative)

`--elix-bg: #080A0E`, text `#FFFFFF` / `#C8CDD5` / `#8B9099`, accent silver `#E6E9EE` → white, LIVE `#FF2D55`, battle host `#DC143C`, guest `#1E90FF`, `--feed-column-max-width: 480px`, Inter/Roboto, dark class mode.

---

## Capacitor

`appId: com.elixstarlive.app`, scheme `elixstar`, plugins: App, Browser, Keyboard, Preferences, Push, Share, Social Login, Native Purchases. Deep links video/user/live/hashtag/rising-stars.
