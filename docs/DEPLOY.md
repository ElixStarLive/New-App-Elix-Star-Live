# Production infrastructure

The NEW app is not attached to production Neon until health + migration gates pass.

Required Coolify services (same as the running old app, new process):

- Postgres / Neon (`DATABASE_URL`) — migrations run on the primary before workers (`server/cluster.ts`)
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
