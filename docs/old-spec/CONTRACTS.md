# OLD production contracts

Wire contracts NEW must match as **outcomes**. Do not copy OLD handlers.  
**This file is the JSON/shape pack.** Hard architecture rules and per-page ownership live in [`docs/OLD-REBUILD-LEDGER.md`](../OLD-REBUILD-LEDGER.md).

Hard rules (also in the master ledger): IAP-only in-app coins; Stripe-only shop; FIFO paid lots; creator 60% / platform 40% of net pence; test coins never money; 8+1 co-host with Valkey lock; server battle clock 300s; independent spectators; REST gift settlement before WS `gift_sent` fan-out; host 20s WS grace; no Google login.

---

---

## Auth HTTP

**POST `/api/auth/login`**  
Body: `{ email: string, password: string }` — `email` may be username.  
Success 200:

```
{
  user: { id, email, user_metadata: { username, full_name, avatar_url }, email_confirmed_at, created_at },
  session: { access_token, accessToken },
  profile_meta: { is_admin, is_creator, banned_until, starter_coin_balance, total_xp, level }
}
```

Also sets auth cookie. Session row upserted.  
401 `{ error: "Invalid login credentials." }` (same for missing user — decoy hash, no enumeration).  
403 confirm-email if mail configured and unconfirmed.  
403 suspended.  
429 lockout (Valkey per account).  
503 DB missing.  
405 wrong method.

**POST `/api/auth/register`**  
Body: `{ email, password, username?, displayName }` password ≥ 8.  
201 with session if no email-confirm required, plus `welcome_message` 50,000 starter coins, `needsEmailConfirmation: false`.  
201 with `session: null`, `needsEmailConfirmation: true`, `confirmation_email_sent` boolean if confirm required.  
409 email exists / username taken.

**POST `/api/auth/consent`** `{ consent_type: "terms_privacy_and_age_13_plus", version: "2026-07-21", age_confirmed_13_plus: true }`

**GET `/api/auth/me`** 200 user+session shape or 401.

**POST `/api/auth/logout`** revokes session, 200 `{ ok: true }`.

**POST `/api/auth/delete`** authenticated cascade (OLD path `/delete`).

**POST `/api/auth/guest`** 403 in production.

**POST `/api/auth/apple/native`** (+ `/apple/start` web if used). Identity token verified against Apple JWKS.

**2FA:** GET `/2fa/status` POST enroll/verify/disable. Login page in OLD does **not** collect TOTP; 2FA is Security settings. If NEW requires TOTP at login it must not change first-paint Login UI.

**Forgot/reset/verify-email:** purpose JWT; reset invalidates all sessions; forgot always 200 (no enumeration).

---

## Wallet / gifts / IAP

**GET `/api/wallet`**  
`{ user_id, coin_balance, starter_balance, starter_coins, promotional_balance, promotional_coins }`  
Never one merged coin number. 503 DATABASE_UNAVAILABLE.

**GET `/api/coin-packages`** `{ packages: [...] }` from `elix_coin_packages`.

**GET `/api/gifts/catalog`** catalog rows (prices, animation URLs). Fail closed if catalog unreadable.

**POST `/api/gifts/send`**  
Body: `room_id|streamKey`, `gift_id|giftId`, optional `recipient_id`, `gift_source: starter_coins|paid_coins`, `transaction_id`.  
Server: auth, velocity, resolve recipient (solo host / cohost / battle seat), debit the **named** source only, credit creator 60/40 **only** for paid lots FIFO, deliver via `deliverVerifiedGift` (not client WS).  
Response must not claim delivered if Valkey dedupe is `unavailable`.  
Promo gifts: 0 Diamonds. Test gifts: test balance only.

**gift_sent payload (server → room):**  
`giftId, giftName, coins, giftSource, transactionId, battleTarget, cohostTargetUserId?, user_id, username, creator_name?, avatar, level, video, animation_url, gift_icon, quantity, streamId, stream_id, timestamp, targetCreatorId?`  
Battle: fan-out to creator audiences of seated creators, not a single global dump that double-counts.

**POST `/api/verify-purchase`** see INVENTORIES §7.

---

## Live REST

**GET `/api/live/streams`** active lives from Valkey+DB+LiveKit publishers. Used by discover and For You live cards.

**POST `/api/live/start`** `{ room, displayName? }` → insert `live_streams`, Valkey `stream:`, notify followers `live_started`, WS presence.

**POST `/api/live/end`** `{ room }` host only → DB end, Valkey delete, `stream_ended`, prune notifications, clear cohost/battle.

**GET `/api/live/status?room=`** `{ room, active }` or 503 LIVE_LOOKUP_UNAVAILABLE.

**GET `/api/live/token?room=&publish=`**  
200 `{ room, token, url }`. Publish only if authorized host/cohost/battle or `call_*`. Spectator token if room available. 403 not authorized to publish. 503 LiveKit unconfigured.

**Moderators:** GET/POST/DELETE `/api/live/:streamKey/moderators`.

---

## Feed / videos

**GET `/api/feed/foryou|friends|following`** ranked public videos + live presence from server.

**POST `/api/feed/track-view`** `{ videoId, watchTime?, videoDuration?, completed? }` — one qualified view per viewer rules.

**POST `/api/feed/track-interaction`** `{ videoId, type: like|comment|share|save }`.

Videos: see ledger API catalog. Private videos 404 to non-owners. Download = voice-only MP4 (licensed soundtrack stripped). Comment max 2000 chars; blocked users cannot comment. Likes/comments do not insert anonymous Inbox Main rows.

---

## Chat / calls

**POST `/api/chat/threads/ensure`**  
**GET `/api/chat/threads`**  
**GET `/api/chat/threads/:id/messages`**  
**POST messages / read / DELETE thread**

Calls are **WS only** (no REST start): `call_invite` `{ calleeId, callId, roomName: call_<uuid> }` → callee `call_invite`; blocked → `call_rejected` reason `blocked`; accept/reject/end. Then LiveKit `call_*` publish tokens.

---

## WebSocket

URL: `{VITE_WS_URL}/live/{roomId}?token={jwt}&audienceCreatorId?=`

On join, server sends in order:

1. `connected` `{ room_id, user_count, viewer_count, count }` (spectator count)
2. `room_state` `{ viewers, live_likes }`
3. `cohost_layout_sync` if layout exists
4. queued `cohost_request` to host
5. `battle_state_sync` if battle
6. `gift_goal_sync`
7. `engagement_sync`

Client ping every 25s → `pong`.  
Reconnect: max 15 attempts, backoff from 1s; host `persistentReconnect`; foreground `reconnectOnForeground`. Exhausted → `ws_reconnect_exhausted`. Transport fail → `ws_error` (not stream end).

Host WS drop: **20s grace** then end stream. Battle participant same grace; reconnect cancels grace. Spectator leave never ends stream.

**Inbound types:** see master ledger Catalog C.  
**Outbound types:** Catalog C + `gift_ack`, `chat_ack`, `battle_vote_ack`, `battle_invite_ack`, `stream_start_ack`, `dm_message`, `dm_thread_updated`, `live_share`, `force_disconnect`.

Paid gift: REST first. WS `gift_sent` from client is not the settlement path.

---

## Hearts / likes (must not mix)

| Gesture | Effect | Money | Battle score |
| --- | --- | --- | --- |
| Live like tap | +1 live_likes (unlimited) | £0 | no |
| Battle screen tap | +5 once per unique viewer per battle | £0 | yes (`tap`) |
| Daily heart REST | `/api/hearts/daily` once/day | £0 | no |
| Test gift | animation + score | £0 | yes (`test_gift`) |
| Promo gift | animation + score | £0 Diamonds | yes (`promotional_gift`) |
| Paid gift | animation + score + 60/40 | paid lots | yes (`paid_gift`) |

Booster multiplies the **gift** that caught it; booster is not a score source.

---

## Co-host

Max **8** seats + host. Invite send/ack/accept/decline; request send/accept/decline; layoutId + featuredUserId presentation only; seat_release (host); seat_leave (self remains spectator); seats_clear. Valkey lock; contended → not success. Layout restore on reconnect from server.

---

## Battle

Types `1x1` | `2x2`. Seats host, opponent, player3, player4. Teams host+player3 vs opponent+player4. Status WAITING | ACTIVE | ENDED. Duration **300s** server clock (`battle_tick` timeLeft). Scores per seat. Invite roster, accept/decline/expire, remove participant. End → persist `battle_results`, broadcast `battle_ended`, return to solo live. Rematch is a new session (old grace must not kill new match).

---

## Permissions (device)

| Feature | Permission |
| --- | --- |
| Create / Live / Call | camera, microphone |
| Upload / avatar | photos / files |
| Push | notifications |
| Denied | real empty/error — no fake preview |

---

## Background / foreground (app)

`visibilitychange` visible: `websocket.reconnectOnForeground()`, `checkUser()` session, `reconcileOwnedCoinPurchases()`. Sound library preview stops only when leaving `/music`, not on every route. Host live persists reconnect through blips (20s server grace).

---

## Error vocabulary (typical)

401 unauthenticated / invalid session  
403 forbidden / unpublished / confirm email / guest disabled  
404 private video as not found  
409 conflict (email, username, IAP product)  
429 rate / lockout / fraud  
503 DATABASE_UNAVAILABLE / LiveKit / Bunny  
502 upload/download failed  

Fail visible on money/live. No fake success.
