# Production infrastructure

## Database cutover (binding)

NEW app uses a **NEW empty Neon** database. OLD Neon stays untouched for reference/rollback.

| | App | `DATABASE_URL` |
|---|-----|----------------|
| OLD | OLD production | OLD Neon only |
| NEW staging | NEW codebase | **NEW empty Neon** |
| NEW production | NEW codebase | NEW Neon **only after** schema + data + runtime proven |

**Do not** point live production `DATABASE_URL` at an empty NEW Neon before migrations and verification pass.

Safe sequence:

1. Create NEW empty Neon/PostgreSQL.
2. Configure a **NEW/staging** Coolify deployment with `DATABASE_URL` → NEW Neon (same env var name, new value).
3. Deploy NEW; clean NEW migrations build the schema.
4. Verify required DB contracts, APIs, tests, and runtime behaviour; fix failures against NEW Neon only.
5. Separately migrate required production data OLD → NEW preserving IDs and relationships; verify counts/balances/purchases/subscriptions.
6. Only then switch production NEW app `DATABASE_URL` → proven NEW Neon.
7. Keep OLD Neon for rollback until NEW production is proven.

Boot refuses OLD production schema markers (`elix_auth_users`, `profiles`, etc.) so NEW migrations never run against OLD.

“Same DB contracts” means the same **required observable behaviour**, not recreating every obsolete OLD object.

## Coolify services

- Postgres / Neon (`DATABASE_URL`) — migrations run on boot (`server/cluster.ts`) against the NEW DB only
- Valkey (`VALKEY_URL`) — production exits without it
- LiveKit URL + API key/secret
- Bunny storage + CDN
- Stripe live keys (shop + Connect only)
- Apple IAP key + notification secret
- Google Play service account + RTDN secret
- FCM / APNs
- SMTP or SendGrid
- `JWT_SECRET` ≥ 64 hex chars

Boot order: migrate → assert schema → listen HTTP/WS → job worker leader lease.

Health: `GET /health` and `GET /api/health` (both ping Postgres; 503 if the database is down).

Production web: `createApp` serves `dist/` when present so Coolify can run a single Node process.

Android: `npx cap add android` has been run. Release builds need `ANDROID_HOME` and `npx cap sync` after each web build.

No development memory fallbacks are enabled when `NODE_ENV=production`.

Realtime: Neon = permanent authoritative data; Valkey = realtime/pub-sub/locks/TTL; LiveKit = media.
