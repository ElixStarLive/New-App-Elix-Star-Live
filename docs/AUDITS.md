# Workaround / dead-code / security audit (NEW repo)

Searched: TODO, FIXME, HACK, ts-ignore, any, eslint-disable.

## Classification

| Match | Class |
| --- | --- |
| Process-local socket / battle / cohost maps | legitimate only when Valkey is absent (development). Production requires Valkey; room fanout and battle/cohost state use Valkey. |
| `setTimeout` splash in `index.html` | legitimate UI |
| `catch` in IAP/LiveKit | fail closed, not silent success |
| `localhost` in `.env.example` | operational example |
| Test-coin mint | disabled in production unless `ALLOW_TEST_COINS=true` and password match |

No TODO/FIXME/HACK/`any`/`ts-ignore`/`eslint-disable` in application source.

## Remaining production blockers

1. Store IAP credentials and a real device purchase have not been proven; verification code is fail-closed.
2. Migrations were not applied to a running non-production database in this session (`embedded-postgres` init crashed on Windows).
3. Android project exists; release assemble failed because the Android SDK is missing. iOS is not generated on Windows.
4. Multi-device LiveKit/cohost/battle stress was not run on physical devices.
5. Epidemic Sound is wired when `EPIDEMIC_SOUND_API_KEY` is set; otherwise local `sounds` + honest `configured: false`. PEX audio scan and OpenAI moderation are not in NEW (optional old extras). Push **tokens** register on native; push **send** needs FCM/APNs credentials not present here.

## Security notes already in the NEW design

- Passwords: scrypt N=16384
- Sessions: JWT bound to `auth_sessions` row, revocation supported
- Login lockout via Valkey after repeated failures
- TOTP secrets stored AES-256-GCM
- IAP: no credit without provider verification (Apple JWS + Apple Root CA G3; Google Play API)
- Wallet: ledger row + balance in one transaction
- Production: Valkey required
- Rate limit: Valkey; production fails closed without it
- Webhooks: Stripe signature, LiveKit receiver, Apple/Google secrets required in production
- Admin routes use `requireAdmin`
- Live host token only for the stream owner
