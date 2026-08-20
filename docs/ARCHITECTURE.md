# NEW application architecture

Writable tree only: `C:\Users\Absm Construction\Desktop\New App Elix Star Live`.

## Ownership

| Layer | Authority |
| --- | --- |
| PostgreSQL / Neon | Permanent records. Wallet totals change only in the same transaction as the justifying ledger row. |
| Valkey | Ephemeral coordination: presence, seats, battle runtime, locks, pub/sub, rate limits, job queue. |
| LiveKit | Realtime media transport and publish permissions. Not seat/score/gift authority. |
| Bunny | Object storage / CDN. Credentials never on the client. |
| Backend | Business rules, validation, IAP verify, entitlements, moderation. |
| Client | UI, local presentation, input. One API client, one WS owner, one LiveKit session owner. |

No Node.js process-local Map/array/object is authoritative for cross-instance state. Local Maps may hold WebSocket objects for this process only.

## Process layout

```
HTTP (Express) ── REST routers (modules)
               ── WebSocket owner (one attach)
               ── Job worker (Valkey leader lease)
Cluster primary applies migrations, then forks workers.
Workers refuse to serve if migrations are not applied.
Production exits if Valkey is missing. No memory fallbacks.
```

## Module map

```
shared/contracts     Zod REST + WS contracts (single names)
server/infra         postgres, valkey, livekit, bunny, jobs, logger, env
server/middleware    auth, rbac, rateLimit (Valkey), validate, errors
server/modules/auth
server/modules/profile
server/modules/feed
server/modules/live
server/modules/cohost
server/modules/battle
server/modules/gifts
server/modules/wallet
server/modules/iap
server/modules/payout
server/modules/notify
server/modules/media
server/modules/moderation
server/modules/chat
server/modules/shop
server/websocket     single owner; handlers dispatch to modules
src/app              shell, routes, theme
src/features/*       screen orchestration (not 5k-line controllers)
src/lib              apiClient, wsClient, livekitSession
```

## Realtime

- One client `WsClient` singleton. Live screens take the room; otherwise `__feed__`.
- Server fans out via Valkey pub/sub so every instance delivers.
- Battle timer ticks only on the Valkey lock holder.
- Co-host writes use Valkey NX locks.

## Money

- Coin movements: append-only `wallet_ledger` then update balance in the same TX.
- GBP: append-only `financial_ledger` (pence) then wallet columns.
- IAP: server verifies Apple/Google; client confirmation is never enough.
- Idempotency keys on purchases, gifts, payouts, webhooks.
- Never return HTTP/WS success after a partial financial failure.

## Frontend boundaries

- Presentation state in Zustand (auth token, settings, wallet display cache).
- Server is source of truth; caches are invalidated on WS events.
- Theme tokens match the reference CSS variables exactly.

## Background jobs

`push_notify`, `email_send`, `iap_consume`, `retention_cleanup`, `reconcile_wallets`.  
Leader election: Valkey lease. No `setInterval` cron on every worker without a lock.

## Mobile

Capacitor 8, `com.elixstarlive.app`, scheme `elixstar`. IAP via native purchases plugin. Push via Capacitor PushNotifications.
