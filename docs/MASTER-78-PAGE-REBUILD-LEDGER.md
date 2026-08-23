# 78-PAGE MASTER REBUILD LEDGER

**Authority:** Owner master order 2026-08-23 — sequential PAGE-001→078, one page at a time.  
**Spec:** Frozen OLD production UI/behaviour/contracts. OLD source = reference only.  
**Rule:** NEW clean code, same contracts, zero shims/patches/duplicates. Coolify cutover deferred (INFRA-001).

| Page | Name | Status | CODE PARITY | FULL VERIFIED 1:1 | Commit | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Login `/login` | CODE-CLOSED | PASS | FAIL / BLOCKED | `ee124a5` | HTTP IT env; iOS; Android |
| 002 | Register `/register` | CODE-CLOSED | PASS | FAIL / BLOCKED | `2fd6c47` | HTTP IT env; iOS; Android |
| 003 | Auth callback `/auth/callback` | CODE-CLOSED | PASS | FAIL / BLOCKED | `505bd4c` | HTTP IT env; iOS; Android |
| 004 | Forgot password `/forgot-password` | CODE-CLOSED | PASS | FAIL / BLOCKED | `5ff60b4` | HTTP IT env; iOS; Android |
| 005 | Reset password `/reset-password` | CODE-CLOSED | PASS | FAIL / BLOCKED | `5ff60b4` | HTTP IT env; iOS; Android |
| 006 | App shell | ACTIVE | — | — | — | — |
| 007 | For You `/feed` | QUEUED (prior `8e85ae3`) | — | — | — | — |
| 008–078 | (see OLD-REBUILD-LEDGER) | QUEUED | — | — | — | — |

## Shared dependency changes
- PAGE-001–003: auth login/consent/verify purpose JWT session.
- PAGE-004/005: password reset purpose JWT (`purpose=password_reset` + `pv` hash binding); forgot/reset bodies `{ success: true }`; live Neon `elix_auth_users` / session delete.

## Regression log
- PAGE-004/005 Forgot+Reset page tests: 18/18 PASS with passwordReset unit tests.
- PAGE-001–003 auth paths share `signPurposeToken` / `verifyPurposeToken`.

---

## PAGE-001 — Login
Commit: `ee124a5` · CODE PARITY PASS · FULL VERIFIED FAIL/BLOCKED

## PAGE-002 — Register
Commit: `2fd6c47` · CODE PARITY PASS · FULL VERIFIED FAIL/BLOCKED

## PAGE-003 — Auth Callback
Commit: `505bd4c` · CODE PARITY PASS · FULL VERIFIED FAIL/BLOCKED

---

## PAGE-004 — Forgot Password

OLD inspected: YES · NEW inspected: YES  
Copied OLD / patches / workarounds / shims / duplicates / dead: ZERO  

UI parity: PASS · Navigation: PASS · Behaviour: PASS  
REST: 1/1 PASS (`POST /api/auth/forgot-password` → always `{ success: true }` when processed; 501 mail off)  
WebSocket/LiveKit: N/A · Valkey: request throttle retained · DB: N/A (JWT issued, not table)  

Client/Server typecheck: PASS · Lint: PASS · Tests: ForgotPassword suite PASS · Build: prior PASS  
Android/iOS: UNVERIFIED  

**PAGE-004 CODE PARITY: PASS** · FULL VERIFIED: FAIL/BLOCKED  
**PAGE-005 CODE PARITY: PASS** · FULL VERIFIED: FAIL/BLOCKED  
Commit: `5ff60b478b0d3c9fcdd6d8c233683fb3546fc974`