# Master parity ledger

**Superseded as rebuild control document.** Use [`docs/OLD-REBUILD-LEDGER.md`](./OLD-REBUILD-LEDGER.md).

**2026-08-20:** The OLD master specification is frozen. NEW product code was **not** inspected or classified in that audit. Do not treat rows below as PAGE-001 progress.

This file is a historical ID map only.

Template per item: ID, Feature, Reference files, Reference behaviour, Reference UI, Required backend, Dependencies, NEW files, Tests, Status.

---

## AUTH

| ID | Feature | Reference | Backend | Status |
| --- | --- | --- | --- | --- |
| AUTH-001 | Register | `src/pages/Register.tsx`, `server/routes/auth.ts` | POST `/api/auth/register`, confirmation email if configured | PAGE-002 CODE-CLOSED / FROZEN `c8a819b9a015b775c0fa79a374dcdfe9084eb65f`. CODE PARITY PASS. FULL VERIFIED 1:1 FAIL / BLOCKED (verification-only). Do not modify unless a future verification gate exposes a real defect |
| AUTH-002 | Login email/username | `src/pages/Login.tsx` | POST `/api/auth/login`, lockout via Valkey | NOT STARTED |
| AUTH-003 | Logout | Settings | POST `/api/auth/logout`, revoke session, disconnect WS | NOT STARTED |
| AUTH-004 | Session restore | `useAuthStore` persist + `/me` after hydrate | GET `/api/auth/me`, session row live | NOT STARTED |
| AUTH-005 | Refresh / foreground check | App visibility handler | `/me` without fake success | NOT STARTED |
| AUTH-006 | Forgot password | ForgotPassword | purpose-bound JWT email | NOT STARTED |
| AUTH-007 | Reset password | ResetPassword | invalidates all sessions | NOT STARTED |
| AUTH-008 | Email verification | Register / verify | POST verify-email | NOT STARTED |
| AUTH-009 | Apple Sign-In | Login + native | POST `/api/auth/apple/native` | NOT STARTED |
| AUTH-010 | Account deletion | Settings NativeDialog | transactional cascade | NOT STARTED |
| AUTH-011 | Auth-required routes | App.tsx public list | 401 on protected API | NOT STARTED |
| AUTH-012 | Expired / invalid credentials | Login errors | 401, no user enumeration where reference hides it | NOT STARTED |
| AUTH-013 | 2FA | SecuritySettings | TOTP enroll/verify/disable | NOT STARTED |
| AUTH-014 | Guest login | auth `/guest` | guest account | NOT STARTED |
| AUTH-015 | Consent | authConsent | POST consent | NOT STARTED |

## SHELL

| ID | Feature | Status |
| --- | --- | --- |
| SHELL-001 | Routing table 1:1 with App.tsx | NOT STARTED |
| SHELL-002 | Bottom nav Home/Friends/Create/Inbox/Profile | NOT STARTED |
| SHELL-003 | Top nav LIVE/STEM/Explore/Following/Shop/For You | NOT STARTED |
| SHELL-004 | Theme tokens, 480px column, cosmic fundal | NOT STARTED |
| SHELL-005 | Single API client | NOT STARTED |
| SHELL-006 | Single WebSocket owner | NOT STARTED |
| SHELL-007 | Query/cache layer | NOT STARTED |
| SHELL-008 | Error boundary, offline banner, loaders | NOT STARTED |
| SHELL-009 | Lifecycle visibility reconnect | NOT STARTED |
| SHELL-010 | Named back / edge swipe | NOT STARTED |
| SHELL-011 | Protected + admin routes | NOT STARTED |

## PROFILE

| ID | Feature | Status |
| --- | --- | --- |
| PROFILE-001 | Own profile | NOT STARTED |
| PROFILE-002 | Public profile | NOT STARTED |
| PROFILE-003 | Edit profile | NOT STARTED |
| PROFILE-004 | Avatar upload | NOT STARTED |
| PROFILE-005 | Bio / username | NOT STARTED |
| PROFILE-006 | Follow | NOT STARTED |
| PROFILE-007 | Unfollow | NOT STARTED |
| PROFILE-008 | Followers list | NOT STARTED |
| PROFILE-009 | Following list | NOT STARTED |
| PROFILE-010 | Block | NOT STARTED |
| PROFILE-011 | Unblock | NOT STARTED |
| PROFILE-012 | Report | NOT STARTED |
| PROFILE-013 | User search | NOT STARTED |
| PROFILE-014 | Counters | NOT STARTED |
| PROFILE-015 | Profile tabs videos/shop/private/reposts/saved/liked | NOT STARTED |

## FEED

| ID | Feature | Status |
| --- | --- | --- |
| FEED-001 | For You | PAGE-007 IMPLEMENTATION COMPLETE / deferred to PAGE-018 (five live-card runtime tests). Return to PAGE-007 before PAGE-019 |
| FEED-002 | Following | PAGE-009 IMPLEMENTATION COMPLETE / RUNTIME MEDIA DEPENDENCY DEFERRED. Locked: eligibility, newest-first, self/blocks/moderation, pagination, engagement, unfollow, shell, singleton WS. Return with PAGE-008 when playable NEW-server media exists: playback, one active video, no dual audio, bg/fg, 3s views |
| FEED-003 | Friends | PAGE-010 IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Locked: follow∪follower union, newest-first, overlay, empty copy. Shared media gate with PAGE-008/009; overlay live PAGE-018; stories FLOW-004 |
| FEED-004 | STEM | PAGE-008 IMPLEMENTATION COMPLETE / deferred runtime media + release deployment gate. Device chrome/engagements verified. Playback blocked by local test media CORP/placeholders. Same media return gate as PAGE-009. PAGE-007 live-card runtime still deferred to PAGE-018 |
| FEED-005 | Pagination / refresh | NOT STARTED |
| FEED-006 | Video cards | NOT STARTED |
| FEED-007 | Live cards from server presence | NOT STARTED |
| FEED-008 | Empty / error / loading | NOT STARTED |
| FEED-009 | Stale live cleanup | NOT STARTED |
| FEED-010 | Discover / hashtag / search | PAGE-011 IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. PAGE-012 IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. PAGE-013 IMPLEMENTATION COMPLETE / DEPENDENCY DEFERRED. Hashtag grid locked: `GET /api/hashtags/:tag`. Do not start PAGE-014. Video PAGE-014; profile PAGE-025 |
| FEED-011 | Stories | NOT STARTED |
| FEED-012 | Likes comments saves | NOT STARTED |

## LIVE

| ID | Feature | Status |
| --- | --- | --- |
| LIVE-001 | Host start live / room | NOT STARTED |
| LIVE-002 | LiveKit token host | NOT STARTED |
| LIVE-003 | Camera microphone publish | NOT STARTED |
| LIVE-004 | Host presence | NOT STARTED |
| LIVE-005 | End live | NOT STARTED |
| LIVE-006 | Discover live | NOT STARTED |
| LIVE-007 | Spectator enter | NOT STARTED |
| LIVE-008 | Spectator token subscribe | NOT STARTED |
| LIVE-009 | Exit live | NOT STARTED |
| LIVE-010 | Comments | NOT STARTED |
| LIVE-011 | Viewer count | NOT STARTED |
| LIVE-012 | Hearts | NOT STARTED |
| LIVE-013 | Reconnect WS + LiveKit | NOT STARTED |
| LIVE-014 | Background/foreground | NOT STARTED |
| LIVE-015 | Network change | NOT STARTED |
| LIVE-016 | Stale session cleanup | NOT STARTED |
| LIVE-017 | Creator crash handling | NOT STARTED |
| LIVE-018 | Server restart | NOT STARTED |
| LIVE-019 | Independent spectator join | NOT STARTED |
| LIVE-020 | Inline feed preview | NOT STARTED |

## COHOST

| ID | Feature | Status |
| --- | --- | --- |
| COHOST-001 | 8 seats Valkey authority | NOT STARTED |
| COHOST-002 | Spectator request | NOT STARTED |
| COHOST-003 | Host invitation | NOT STARTED |
| COHOST-004 | Accept / reject / cancel | NOT STARTED |
| COHOST-005 | Seat assign / release / remove | NOT STARTED |
| COHOST-006 | Reconnect restore | NOT STARTED |
| COHOST-007 | Request button UI | NOT STARTED |
| COHOST-008 | Join seat + publish | NOT STARTED |
| COHOST-009 | Leave co-host remain spectator | NOT STARTED |
| COHOST-010 | Creator-controlled layout / big screen | NOT STARTED |
| COHOST-011 | Exact reference layout | NOT STARTED |

## BATTLE

| ID | Feature | Status |
| --- | --- | --- |
| BATTLE-001 | 1x1 server | NOT STARTED |
| BATTLE-002 | 2x2 server | NOT STARTED |
| BATTLE-003 | Invite accept reject | NOT STARTED |
| BATTLE-004 | Teams seats | NOT STARTED |
| BATTLE-005 | Timer authority | NOT STARTED |
| BATTLE-006 | Score no double count | NOT STARTED |
| BATTLE-007 | Cancel complete departure | NOT STARTED |
| BATTLE-008 | Client 1x1 UI | NOT STARTED |
| BATTLE-009 | Client 2x2 UI | NOT STARTED |
| BATTLE-010 | Return to normal live | NOT STARTED |
| BATTLE-011 | Exact setup/battle layout | NOT STARTED |

## GIFT / MONEY

| ID | Feature | Status |
| --- | --- | --- |
| GIFT-001 | Catalog | NOT STARTED |
| GIFT-002 | Send paid gift ledger | NOT STARTED |
| GIFT-003 | Promo / starter / test gift rules | NOT STARTED |
| GIFT-004 | Overlay + animation | NOT STARTED |
| GIFT-005 | Gift goals | NOT STARTED |
| MONEY-001 | Coin packages SKUs | NOT STARTED |
| MONEY-002 | Purchase records | NOT STARTED |
| MONEY-003 | Server verification | NOT STARTED |
| MONEY-004 | Paid balances | NOT STARTED |
| MONEY-005 | Promo/test balances | NOT STARTED |
| MONEY-006 | Creator earnings | NOT STARTED |
| MONEY-007 | Platform share | NOT STARTED |
| MONEY-008 | Append-only ledger | NOT STARTED |
| MONEY-009 | Idempotency | NOT STARTED |
| MONEY-010 | Refund chargeback reversal | NOT STARTED |
| MONEY-011 | Never success after partial fail | NOT STARTED |
| MONEY-012 | Apple IAP | NOT STARTED |
| MONEY-013 | Google Play IAP | NOT STARTED |
| MONEY-014 | Stripe shop only | NOT STARTED |
| MONEY-015 | Stripe Connect payouts | NOT STARTED |
| MONEY-016 | Withdraw pending/available | NOT STARTED |

## SUB / NOTIFY / MEDIA / MOD / MOBILE / INFRA

| ID | Feature | Status |
| --- | --- | --- |
| SUB-001 | Membership purchase | NOT STARTED |
| SUB-002 | Entitlement renewal cancel restore | NOT STARTED |
| SUB-003 | SKU `com.elixstarlive.membership` | NOT STARTED |
| NOTIFY-001 | Push token register | NOT STARTED |
| NOTIFY-002 | Live follow gift cohost battle system | NOT STARTED |
| NOTIFY-003 | Read/unread prefs | NOT STARTED |
| MEDIA-001 | Avatar image video upload Bunny | NOT STARTED |
| MEDIA-002 | Signed access | NOT STARTED |
| MEDIA-003 | Thumbnails retries deletion orphan cleanup | NOT STARTED |
| MOD-001 | Report block unmute live comment bans | NOT STARTED |
| MOD-002 | Admin actions audit | NOT STARTED |
| MOBILE-001 | Android release | NOT STARTED |
| MOBILE-002 | iOS build | NOT STARTED |
| MOBILE-003 | Permissions lifecycle deep links IAP | NOT STARTED |
| INFRA-001 | Coolify Neon Valkey LiveKit Bunny | NOT STARTED |
| INFRA-002 | Secrets migrations-before-app health | NOT STARTED |
| INFRA-003 | No production memory fallback | NOT STARTED |
| INFRA-004 | Multi-instance WS | NOT STARTED |

## Extra 1:1 surfaces

| ID | Feature | Status |
| --- | --- | --- |
| SHOP-001 | Shop browse cart Stripe | NOT STARTED |
| DM-001 | Threads realtime | NOT STARTED |
| CALL-001 | 1:1 LiveKit calls | NOT STARTED |
| CREATE-001 | Create camera upload AI studio | NOT STARTED |
| ENGAGE-001 | Engagement hub missions daily login | NOT STARTED |
| RS-001 | Rising Stars | NOT STARTED |
| ADMIN-001 | Admin dashboard suite | NOT STARTED |
| LEGAL-001 | Legal support pages | NOT STARTED |
| MUSIC-001 | Epidemic Sound library | NOT STARTED |
| PROMOTE-001 | Promote IAP | NOT STARTED |

## Evidence log

Typecheck `tsc -b --noEmit` and `tsc -p tsconfig.server.json --noEmit`: PASS (2026-08-20, re-run after product-complete pass)
Lint: PASS (`eslint .`)
Unit: 33 tests PASS (contracts, schema, env, wallet ledger, cohost, battle, totp, secretBox, IAP fail-closed, gift 60/40, cursor)
HTTP integration: SKIPPED (embedded Postgres init crashed on this Windows host)
Production web build: PASS (`vite build --mode production`)
Android: `npx cap add android` PASS; `assembleRelease` FAIL (no Android SDK)

Items with automated evidence (not full runtime device evidence):

- AUTH contracts + session + 2FA encrypt/login field: TESTING
- SHELL routes/nav/theme exist in NEW `src/`: TESTING
- Client API mounts (inbox, search, admin, shop, payouts, calls, reports): TESTING
- COHOST-001 seat cap 8: VERIFIED (unit)
- BATTLE-001/002 start rules + score: VERIFIED (unit)
- BATTLE-006 gift scoring is server-side via `applyGiftToBattle`: TESTING
- MONEY-008/009 ledger + idempotency: VERIFIED (unit)
- MONEY-012/013 fail-closed without store credentials: VERIFIED (unit)
- MONEY-006/007 paid-gift 60/40: VERIFIED (unit)
- INFRA-003 production Valkey required: VERIFIED (unit)
- MOBILE-001 Android folder generated, release not built: BLOCKED (SDK)
- LIVE viewer_count / cohost request-accept / battle join: TESTING (code complete, device matrix BLOCKED)

Device/LiveKit/IAP live verification: BLOCKED pending credentials, SDK, and native device runs.


