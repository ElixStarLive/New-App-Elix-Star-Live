# 78-PAGE MASTER REBUILD LEDGER

**Authority:** Owner master order 2026-08-23 — sequential PAGE-001→078, one page at a time.  
**Spec:** Frozen OLD production UI/behaviour/contracts. OLD source = reference only.  
**Rule:** NEW clean code, same contracts, zero shims/patches/duplicates. Coolify cutover deferred (INFRA-001).

| Page | Name | Status | CODE PARITY | FULL VERIFIED 1:1 | Commit | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Login | CODE-CLOSED | PASS | FAIL / BLOCKED | `ee124a5` | HTTP IT; devices |
| 002 | Register | CODE-CLOSED | PASS | FAIL / BLOCKED | `2fd6c47` | HTTP IT; devices |
| 003 | Auth callback | CODE-CLOSED | PASS | FAIL / BLOCKED | `505bd4c` | HTTP IT; devices |
| 004 | Forgot password | CODE-CLOSED | PASS | FAIL / BLOCKED | `5ff60b4` | HTTP IT; devices |
| 005 | Reset password | CODE-CLOSED | PASS | FAIL / BLOCKED | `5ff60b4` | HTTP IT; devices |
| 006 | App shell | CODE-CLOSED | PASS | FAIL / BLOCKED | `00ed045` | HTTP IT; devices |
| 007 | For You | CODE-CLOSED (prior) | PASS | FAIL / BLOCKED | `8e85ae3` | PAGE-018 LiveKit return gate; Coolify OLD |
| 008–078 | (see OLD-REBUILD-LEDGER) | QUEUED / next ACTIVE 008 | — | — | — | — |

## Shared dependency changes this run
- Auth: login `{ error }`, Valkey Hash lockout `n`, `/me` hydrate, apple/start, consent live Neon write, purpose JWT email verify + password reset, `{ success: true }` forgot/reset.
- App shell: feed WS ownership, engagement gate routes, OwnProfile / Followers / FollowingList, call signal bind, forgot flag in tests.

## Commits this run
| Commit | Pages |
| --- | --- |
| `ee124a5` | 001 |
| `2fd6c47` | 002 |
| `505bd4c` | 003 |
| `5ff60b4` | 004–005 |
| `00ed045` | 006 |

**Coolify cutover:** NOT done (INFRA-001). Live API remains OLD `a1c9b11`.

**Environment blockers (all pages so far):** embedded Postgres HTTP IT; iOS physical; Android often UNVERIFIED when session already authed.

Next automatic page: **PAGE-008 STEM** (PAGE-007 already contract-aligned at `8e85ae3`; return gate waits on PAGE-018).
