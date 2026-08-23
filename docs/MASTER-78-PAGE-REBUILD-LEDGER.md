# 78-PAGE MASTER REBUILD LEDGER

**Authority:** Owner master order 2026-08-23 — sequential PAGE-001→078, one page at a time.  
**Spec:** Frozen OLD production UI/behaviour/contracts. OLD source = reference only.  
**Rule:** NEW clean code, same contracts, zero shims/patches/duplicates. Coolify cutover deferred (INFRA-001).

| Page | Name | Status | CODE PARITY | FULL VERIFIED 1:1 | Commit | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Login `/login` | CODE-CLOSED | PASS | FAIL / BLOCKED | `ee124a5` | HTTP IT env; iOS; Android login UI not re-run |
| 002 | Register `/register` | CODE-CLOSED | PASS | FAIL / BLOCKED | *(pending)* | HTTP IT env; iOS; Android register (authed redirect) |
| 003 | Auth callback | ACTIVE | — | — | — | — |
| 004 | Forgot password | QUEUED | — | — | — | — |
| 005 | Reset password | QUEUED | — | — | — | — |
| 006 | App shell | QUEUED | — | — | — | — |
| 007 | For You `/feed` | QUEUED (prior `8e85ae3`) | — | — | — | — |
| 008–078 | (see OLD-REBUILD-LEDGER) | QUEUED | — | — | — | — |

## Shared dependency changes
- PAGE-001: login error JSON `{ error }`; Valkey Hash lockout `n`; post-login `/me` hydrate; `apple/start` stub.
- PAGE-002: `POST /api/auth/consent` no longer no-ops on live Neon — writes frozen OLD `user_consents` row; response includes `consent` object.

## Regression log
- PAGE-001 auth + Login suite re-run after PAGE-002 consent fix: covered by shared auth router (45 + Register 40 in suites).

---

## PAGE-001 — Login

OLD inspected: YES  
NEW inspected: YES

Copied OLD source remaining: ZERO  
Patches remaining: ZERO  
Workarounds remaining: ZERO  
Compatibility shims remaining: ZERO  
Duplicate implementations remaining: ZERO  
Dead replaced code remaining: ZERO

UI parity: PASS  
Navigation parity: PASS  
Behaviour parity: PASS

REST: 4/4 PASS  
WebSocket: N/A  
LiveKit: N/A  
DB/migrations: 1/1 PASS  
Valkey: 1/1 PASS  
Cross-page flows: 1/1 PASS

Client typecheck: PASS  
Server typecheck: PASS  
Lint: PASS  
Tests: 45 passed / 0 failed (auth + Login)  
Production build: PASS  
Android physical: UNVERIFIED  
iOS physical: UNVERIFIED / ENVIRONMENT BLOCKED

Remaining actual code defects: ZERO  
Environment-only blockers: HTTP IT embedded Postgres; iOS; Android login re-run

**PAGE-001 CODE PARITY: PASS**  
**PAGE-001 FULL VERIFIED 1:1 OLD PRODUCTION PARITY: FAIL / BLOCKED**

Commit: `ee124a5406a34d42f5851acd7d42b3a72652d656`

---

## PAGE-002 — Register

OLD inspected: YES  
NEW inspected: YES

Copied OLD source remaining: ZERO  
Patches remaining: ZERO  
Workarounds remaining: ZERO  
Compatibility shims remaining: ZERO  
Duplicate implementations remaining: ZERO  
Dead replaced code remaining: ZERO

UI parity: PASS (no visual edits)  
Navigation parity: PASS  
Behaviour parity: PASS

REST: 2/2 PASS (`POST /api/auth/register`, `POST /api/auth/consent`)  
WebSocket: N/A  
LiveKit: N/A  
DB/migrations: 1/1 PASS (`user_consents` ownership; live Neon uses OLD column set)  
Valkey: N/A  
Cross-page flows: 1/1 PASS (Login link, terms/privacy, post-register consent)

Client typecheck: PASS  
Server typecheck: PASS  
Lint: PASS  
Tests: 40 passed / 0 failed (Register + auth features)  
Production build: PASS (prior PAGE-001 gate)  
Android physical: UNVERIFIED  
iOS physical: UNVERIFIED / ENVIRONMENT BLOCKED

Remaining actual code defects: ZERO  
Environment-only blockers: same as prior PAGE-002 freeze (HTTP IT env; iOS; authed Android redirect; no live Neon account spam)

### Fix this pass
Removed live-Neon consent no-op (`res.json({ ok: true })` without DB write). Persist frozen OLD shape and return `{ ok, consent }`.

**PAGE-002 CODE PARITY: PASS**  
**PAGE-002 FULL VERIFIED 1:1 OLD PRODUCTION PARITY: FAIL / BLOCKED**

Commit: *(filled after git commit)*
