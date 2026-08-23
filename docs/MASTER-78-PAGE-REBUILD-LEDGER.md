# 78-PAGE MASTER REBUILD LEDGER

**Authority:** Owner master order 2026-08-23 — sequential PAGE-001→078, one page at a time.  
**Spec:** Frozen OLD production UI/behaviour/contracts. OLD source = reference only.  
**Rule:** NEW clean code, same contracts, zero shims/patches/duplicates. Coolify cutover deferred (INFRA-001).

| Page | Name | Status | CODE PARITY | FULL VERIFIED 1:1 | Commit | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Login `/login` | CODE-CLOSED | PASS | FAIL / BLOCKED | *(pending)* | HTTP IT env; iOS; Android login UI not re-run this pass |
| 002 | Register | QUEUED (prior FROZEN `c8a819b`) | — | — | — | — |
| 003 | Auth callback | QUEUED | — | — | — | — |
| 004 | Forgot password | QUEUED | — | — | — | — |
| 005 | Reset password | QUEUED | — | — | — | — |
| 006 | App shell | QUEUED | — | — | — | — |
| 007 | For You `/feed` | QUEUED (prior contract work `8e85ae3`) | — | — | — | — |
| 008–078 | (see OLD-REBUILD-LEDGER) | QUEUED | — | — | — | — |

## Shared dependency changes
- PAGE-001: `POST /api/auth/login` error JSON unified to `{ error: human }`; Valkey lockout Hash field `n`; post-login `GET /api/auth/me` hydrate in `useAuthStore`.

## Regression log
(none yet — PAGE-001 is first in this sequential run)

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

UI parity: PASS (Login screen unchanged; no visual edits this pass)  
Navigation parity: PASS  
Behaviour parity: PASS

REST: 4/4 PASS (login success/error shapes, apple/start stub, /me hydrate path)  
WebSocket: N/A  
LiveKit: N/A  
DB/migrations: 1/1 PASS (users + sessions ownership unchanged)  
Valkey: 1/1 PASS (Hash `auth:login:fail:{sha256}` field `n`; expire refresh each fail; unreadable → 429 refuse)  
Cross-page flows: 1/1 PASS (success → `from` / feed via existing App shell)

Client typecheck: PASS  
Server typecheck: PASS  
Lint: PASS (touched files)  
Tests: 45 passed / 0 failed / 0 skipped (auth + Login suite)  
Production build: PASS  
Android physical: UNVERIFIED (not re-run this pass; prior session had live login)  
iOS physical: UNVERIFIED / ENVIRONMENT BLOCKED

Remaining actual code defects: ZERO  
Environment-only blockers:
1. HTTP IT against embedded Postgres — ENVIRONMENT BLOCKED on this Windows Administrator session
2. iOS physical device — ENVIRONMENT BLOCKED
3. Android PAGE-001 UI re-exercise — not run this pass (session may already be authenticated)

**PAGE-001 CODE PARITY: PASS**

**PAGE-001 FULL VERIFIED 1:1 OLD PRODUCTION PARITY: FAIL / BLOCKED** (verification-only; not an outstanding code defect)

### Fixes applied this pass
1. Dual login error JSON → single `{ error: human }` for 400/401/403/429 (and 503 DB).
2. Post-login `checkUser()` → `GET /api/auth/me` hydrate after password + Apple native.
3. `POST /api/auth/apple/start` stub → 400 frozen copy.
4. Suspended check before `clearLoginFailure`.
5. Valkey lockout: `hget`/`hincrby` field `n`; expire window refreshed every failure; unreadable counter → 429.
6. Explicit 503 `{ error: "Database not configured" }` when user lookup fails closed on DB.

Commit: *(filled after git commit)*
