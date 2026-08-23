# 78-PAGE MASTER REBUILD LEDGER

**Authority:** Owner master order 2026-08-23 — sequential PAGE-001→078.  
**Coolify cutover:** NOT done. Live API remains OLD.  
**Rule:** CODE PARITY PASS = zero known code defects. FULL VERIFIED PASS blocked while HTTP IT / devices blocked.

| Page | Name | Status | CODE PARITY | FULL VERIFIED | Commit | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Login | CODE-CLOSED | PASS | FAIL/BLOCKED | `ee124a5` | HTTP IT; devices |
| 002 | Register | CODE-CLOSED | PASS | FAIL/BLOCKED | `2fd6c47` | HTTP IT; devices |
| 003 | Auth callback | CODE-CLOSED | PASS | FAIL/BLOCKED | `505bd4c` | HTTP IT; devices |
| 004 | Forgot password | CODE-CLOSED | PASS | FAIL/BLOCKED | `5ff60b4` | HTTP IT; devices |
| 005 | Reset password | CODE-CLOSED | PASS | FAIL/BLOCKED | `5ff60b4` | HTTP IT; devices |
| 006 | App shell | CODE-CLOSED | PASS | FAIL/BLOCKED | `00ed045` | HTTP IT; devices |
| 007 | For You | CODE-CLOSED | PASS | FAIL/BLOCKED | `8e85ae3` | PAGE-018 LiveKit gate |
| 008 | STEM | CODE-CLOSED | PASS | FAIL/BLOCKED | `e288fd5` | media CORP; devices |
| 009 | Following | CODE-CLOSED | PASS | FAIL/BLOCKED | `e288fd5` | media CORP; devices |
| 010 | Friends | CODE-CLOSED | PASS | FAIL/BLOCKED | `e288fd5` | media CORP; devices |
| 011 | Discover | CODE-CLOSED | PASS | FAIL/BLOCKED | `e288fd5` | media CORP; devices |
| 012 | Search | CODE-CLOSED | PASS | FAIL/BLOCKED | `e288fd5` | media CORP; devices |
| 013 | Hashtag | CODE-CLOSED | PASS | FAIL/BLOCKED | `e288fd5` | media CORP; devices |
| 014 | Video view | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | media CORP; devices |
| 015 | Saved | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | media CORP; devices |
| 016 | Music | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | Epidemic device |
| 017–021 | Live/Create | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | LiveKit / camera device |
| 022 | Upload | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | live Neon url insert |
| 023 | AI Studio | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | — |
| 024–025 | Profiles | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | devices |
| 026 | Edit profile | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | — |
| 027–029 | Follow lists / creator login | CODE-CLOSED | PASS | FAIL/BLOCKED | *(prior)* | — |
| 030–035 | Inbox/calls | ACTIVE | — | — | — | live Neon chat/calls dual-path |
| 036–039 | Shop/IAP/wallet | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | devices |
| 040–041 | Settings/Safety | CODE-CLOSED | PASS | FAIL/BLOCKED | *(prior)* | — |
| 044 | Blocked | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | — |
| 046 | Report | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | — |
| 056 | RS challenge live attach | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | — |
| 057 | Terms returnTo | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | — |
| 070–072 | Admin dash/users/reports | CODE-CLOSED | PASS | FAIL/BLOCKED | *(cluster)* | — |
| 073–078 | Admin money/RS/progression | CODE-CLOSED | PASS | FAIL/BLOCKED | *(prior)* | NEW schema |
| remaining | queued | ACTIVE | — | — | — | see open defects |

## Latest cluster notes
- Saved FeedVideo: `GET /api/videos/saved/feed`; public `…/user/:id/saved|liked`
- Upload live Neon inserts `url` (not `bunny_path`)
- Profile views bump `profiles.unique_profile_views` on live
- Music empty search maps local `items`
- Host gift: no local pill when WS echoes
- IAP/catalog live `elix_*` credit path
- Avatar live updates profiles + elix_auth_users; socials fail-closed on live
- Admin ban/dashboard live dual-path; report action before status commit
- Reposts live: empty GET + 503 toggle until `elix_reposts` columns proven

### Still open (next)
- PAGE-030/031/033 inbox: `messages` / `elix_auth_users` dual-path
- PAGE-032 notifications: `elix_notifications`
- PAGE-034/035 calls table on live Neon
- PAGE-042/043 2FA + device_tokens live
- PAGE-045/047+ engagement live schema fail-closed where missing
- PAGE-036 shop `elix_shop_purchases` purchase write dual-path (dashboard read done)
