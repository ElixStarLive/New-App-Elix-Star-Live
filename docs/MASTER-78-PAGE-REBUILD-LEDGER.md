# 78-PAGE MASTER REBUILD LEDGER

**Authority:** Owner master order 2026-08-23 — sequential PAGE-001→078, one page at a time.  
**Spec:** Frozen OLD production UI/behaviour/contracts. OLD source = reference only.  
**Rule:** NEW clean code, same contracts, zero shims/patches/duplicates. Coolify cutover deferred (INFRA-001).

| Page | Name | Status | CODE PARITY | FULL VERIFIED 1:1 | Commit | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Login `/login` | CODE-CLOSED | PASS | FAIL / BLOCKED | `ee124a5` | HTTP IT env; iOS; Android login UI not re-run |
| 002 | Register `/register` | CODE-CLOSED | PASS | FAIL / BLOCKED | `2fd6c47` | HTTP IT env; iOS; Android register (authed redirect) |
| 003 | Auth callback `/auth/callback` | CODE-CLOSED | PASS | FAIL / BLOCKED | *(pending)* | HTTP IT env; iOS; Android callback deep-link |
| 004 | Forgot password | QUEUED | — | — | — | — |
| 005 | Reset password | QUEUED | — | — | — | — |
| 006 | App shell | QUEUED | — | — | — | — |
| 007 | For You `/feed` | QUEUED (prior `8e85ae3`) | — | — | — | — |
| 008–078 | (see OLD-REBUILD-LEDGER) | QUEUED | — | — | — | — |

## Shared dependency changes
- PAGE-001: login error JSON `{ error }`; Valkey Hash lockout `n`; post-login `/me` hydrate; `apple/start` stub.
- PAGE-002: `POST /api/auth/consent` persists live Neon OLD `user_consents` shape.
- PAGE-003: email verify uses purpose JWT (`purpose=email_verify` + `pv` binding); success returns production login session + `already_confirmed`; resend uses Valkey `email_confirm_sent:{email}` + `{ success: true }`.

## Regression log
- PAGE-001/002 auth suites covered via shared router after PAGE-003 edits.
- PAGE-003 AuthCallback + verify client tests: 38 passed in auth feature batch; AuthCallback 3/3.

---

## PAGE-001 — Login

Commit: `ee124a5406a34d42f5851acd7d42b3a72652d656`  
**PAGE-001 CODE PARITY: PASS** / FULL VERIFIED: FAIL / BLOCKED

## PAGE-002 — Register

Commit: `2fd6c477eda049433f7254a6415ded654024f602`  
**PAGE-002 CODE PARITY: PASS** / FULL VERIFIED: FAIL / BLOCKED

---

## PAGE-003 — Auth Callback

OLD inspected: YES  
NEW inspected: YES

Copied OLD source remaining: ZERO  
Patches remaining: ZERO  
Workarounds remaining: ZERO  
Compatibility shims remaining: ZERO  
Duplicate implementations remaining: ZERO  
Dead replaced code remaining: ZERO (stopped using `email_verify_tokens` table; baseline table retained — migration not deleted)

UI parity: PASS (matched OLD chrome: transparent page, same copy structure; success redirects `/profile`)  
Navigation parity: PASS  
Behaviour parity: PASS

REST: 2/2 PASS (`POST /api/auth/verify-email` session body; `POST /api/auth/resend-confirmation` `{ success }`)  
WebSocket: N/A  
LiveKit: N/A  
DB/migrations: 1/1 PASS (`email_confirmed_at` on users / elix_auth_users)  
Valkey: 1/1 PASS (resend cooldown `email_confirm_sent:{email}`)  
Cross-page flows: 1/1 PASS (Register confirmation link → callback → profile)

Client typecheck: PASS  
Server typecheck: PASS  
Lint: PASS (touched files)  
Tests: AuthCallback 3/3 PASS; emailVerify + authVerifyEmail included in 38-pass auth batch  
Production build: PASS  
Android physical: UNVERIFIED  
iOS physical: UNVERIFIED / ENVIRONMENT BLOCKED

Remaining actual code defects: ZERO  
Environment-only blockers: HTTP IT env; physical devices; live email send not exercised against production SMTP

**PAGE-003 CODE PARITY: PASS**  
**PAGE-003 FULL VERIFIED 1:1 OLD PRODUCTION PARITY: FAIL / BLOCKED**

Commit: *(filled after git commit)*
