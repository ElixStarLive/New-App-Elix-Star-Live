# Repository map — Elix Star Live clean rebuild

**Frozen:** 2026-08-19  
**Rule:** This file is the authority for which tree may be written. The reference application is READ-ONLY for the remainder of the rebuild.

## REFERENCE (read-only)

| Field | Value |
| --- | --- |
| Role | Old production application. Visual, navigation, feature, API, database, LiveKit, WebSocket, money, and production-behaviour authority. |
| Absolute path | `C:\Users\Absm Construction\Desktop\Elix Star Live` |
| Writability | **FORBIDDEN.** Never modify, clean, refactor, format, delete, rename, migrate, or commit anything in this tree. |
| Branch | `main` |
| Commit | `a1c9b11ed3cc47c8a858430076864ac9e7ebbc84` |
| Remote | `https://github.com/ElixStarLive/-Elix-Star-Live.git` (`origin`) |
| Status at freeze | Dirty working tree (left untouched): modified `docs/evidence/runtime-resource-audit-2026-08-10.json`, modified `server/routes/iapRateLimitFailClosed.test.ts`, untracked `_dev_shots/` |
| Uncommitted work | Exists in the reference. It is **not** imported into the new application. |

Inspected reference instructions (read-only): `README.md`, `docs/FULL_APP_REBUILD.md`, `docs/owner-working-app/DO_NOT_TOUCH.md`, `docs/FULL_REBUILD_LEDGER.md`. No `AGENTS.md`.

## NEW (writable)

| Field | Value |
| --- | --- |
| Role | Only writable application. Clean production code. No copied application source. |
| Absolute path | `C:\Users\Absm Construction\Desktop\New App Elix Star Live` |
| Branch | `master` (empty repository, no commits at freeze) |
| Commit | none |
| Remote | none |
| Status at freeze | Empty working tree except this documentation and git metadata |
| Code that must be preserved | **None.** Folder was empty. |

## Policy

1. All application files, migrations, tests, and documentation for the rebuild live only under the NEW path.
2. Reference files may be **read** by absolute path. They must never be written.
3. Do not clone the reference repository into the new folder.
4. Do not copy TypeScript/JavaScript handlers, controllers, or WebSocket logic from the reference. Recreate behaviour in new modules.
5. Static media, measured CSS tokens, IAP SKUs, legal copy, and third-party webhook shapes may be reproduced because they are product contracts, not architecture.
6. The old application stays installed and running until the new application is connected and production-verified.
