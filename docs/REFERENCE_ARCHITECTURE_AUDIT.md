# Reference architecture audit

Read-only analysis of `C:\Users\Absm Construction\Desktop\Elix Star Live`.  
Do not copy implementation. Preserve behaviour.

## Behaviour that must be preserved

- Email/username login, Apple Sign-In, session JWT bound to a database session row, logout revocation, password reset, email verify, account delete, 2FA.
- Single visual chrome: cosmic fundal, 480px column, silver/white icons, LIVE red `#FF2D55`, locked live/battle layouts.
- Live: host publishes, spectators subscribe independently, comments/hearts/gifts, presence on feed from server not local memory.
- Co-host: eight seats, invite/request/accept/decline, layout including big-screen, leave seat remain spectator.
- Battle: `1x1`/`2x2`, server timer and score, gift points, no double count.
- Money: Apple/Google coins only; Stripe for shop and Connect payouts; append-only ledgers; test coins are QA animation/score only.
- WebSocket reconnect, LiveKit reconnect, foreground restore, creator end-live honesty.
- Admin RBAC via `profiles.is_admin`.
- Production requires Valkey. Migrations before workers.

## Implementation that must not be copied

- `useLiveHostController.tsx` (~5800 lines) and `useLiveSpectatorController.tsx` (~3700 lines) as god-objects.
- Historical 65-migration chain (including price-ladder patches). Target a clean schema.
- Dual admin auth (RBAC middleware vs inline SQL in payout routes).
- Process-local Maps used as cross-instance authority (`pendingRoomFinished` timers, memory job queue, memory rate-limit windows in production).
- Silent catches that swallow ledger/IAP/gift delivery failures.
- Fake success, client shims hiding wrong server contracts, `any` to compile.
- Duplicate API clients, duplicate WS managers, duplicate LiveKit session owners.
- Mixing Stripe into coin IAP.

## Known reference risks (do not reproduce)

| Risk | Where | NEW rule |
| --- | --- | --- |
| Local socket Maps | websocket/index.ts | Allowed only for this process’s sockets; room/battle/cohost state in Valkey |
| Rate-limit Map fallback | middleware/rateLimit.ts | Fail closed in production without Valkey |
| Memory job queue | jobQueue.ts | Production must use Valkey queue |
| LiveKit webhook 20s timers per process | livekit-webhook.ts | Distributed lock + idempotent stream removal |
| Split admin auth | payout.ts vs rbac.ts | One `requireAdmin` |
| Catalog/read → £0 | past money bugs | Fail closed on catalog/config read errors |
| Gift delivered without room fan-out | past WS bugs | Ledger commit and delivery in one success path |

## Ownership in the reference (keep conceptually)

- Postgres: durable records.
- Valkey: `stream:`, `cohost:`, `battle:`, `room:members`, pub/sub, sessions cache, jobs.
- LiveKit: media + publish grants.
- Bunny: bytes.
- Server: gifts, scores, seats, entitlements.
- Client: UI only.
