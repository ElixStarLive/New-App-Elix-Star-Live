import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/settings/BlockedAccounts.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/blocks/blockedUsersApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/blocks/blockedUsersSession.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "server/modules/blocks/service.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/blocks/router.ts"), "utf8");
const moderation = readFileSync(resolve(process.cwd(), "server/modules/misc/routers.ts"), "utf8");
const index = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const safety = readFileSync(resolve(process.cwd(), "src/pages/settings/SafetyCenter.tsx"), "utf8");
const profileApi = readFileSync(resolve(process.cwd(), "src/features/profile/publicProfileApi.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const signaling = readFileSync(resolve(process.cwd(), "server/modules/calls/signaling.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("PAGE-044 Blocked Accounts ownership", () => {
  it("has one /settings/blocked option-sheet owner", () => {
    expect(app.match(/path="\/settings\/blocked"/g)?.length).toBe(1);
    expect(app).not.toMatch(/path="\/blocked"|path="\/settings\/blocked-users"|path="\/privacy\/blocked"/);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/title="Blocked Accounts"/);
    expect(page).not.toMatch(/SettingsSubpage|BlockedAccountsV2|BlockedAccountsFixed/);
    expect(page).not.toMatch(/history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket/);
    expect(page).not.toMatch(/\/api\/safety\/blocked|localStorage|sessionStorage/);
    expect(settings).toMatch(/go\("\/settings\/blocked"\)/);
    expect(safety).toMatch(/go\("\/settings\/blocked"\)/);
    expect(nav).toMatch(/if \(path === SETTINGS_HOME\) return SETTINGS_EXIT_TO/);
  });

  it("uses one list endpoint and one unblock endpoint on the shared blocks table", () => {
    expect(api).toMatch(/\/api\/blocked-users/);
    expect(api).toMatch(/\/api\/unblock-user/);
    expect(api).not.toMatch(/\/api\/safety\/blocked|\/api\/block-user|viewerId|blockerId/);
    expect(api.match(/\/api\/blocked-users/g)?.length).toBe(1);
    expect(api.match(/\/api\/unblock-user/g)?.length).toBe(1);
    expect(session).toMatch(/createBlockedUsersSession/);
    expect(session).not.toMatch(/localStorage|sessionStorage|location\.reload|setTimeout\(/);
    expect(router).toMatch(/router\.get\("\/blocked-users"/);
    expect(router).toMatch(/router\.post\("\/unblock-user"/);
    expect(router).toMatch(/req\.userId/);
    expect(router).not.toMatch(/req\.body\?\.(viewerId|blockerId)|req\.query\?\.(viewerId|blockerId)/);
    expect(service).toMatch(/FROM blocks/);
    expect(service).toMatch(/INSERT INTO blocks/);
    expect(service).toMatch(/DELETE FROM blocks/);
    expect(service).not.toMatch(/\bnew Map\b|module\.exports\.blocks/);
    expect(moderation).toMatch(/insertBlock/);
    expect(moderation).not.toMatch(/moderationRouter\.delete\("\/block\/:userId"/);
    expect(index).toMatch(/blocksRouter/);
    expect(index).not.toMatch(/safetyRouter|\/api\/safety/);
    expect(profileApi).toMatch(/\/api\/block\/\$\{encodeURIComponent\(userId\)\}/);
    expect(profileApi).not.toMatch(/\/api\/unblock-user|\/api\/blocked-users/);
  });

  it("keeps PAGE-006 as the only global socket and PAGE-034 as the call block owner", () => {
    expect(ws).toMatch(/ownerId: "app-feed-presence"/);
    expect(ws.match(/new WebSocket/g) ?? []).toHaveLength(0);
    expect(signaling).toMatch(/isBlockedEitherWay/);
    expect(signaling).toMatch(/reason: "blocked"/);
    expect(page).not.toMatch(/call_rejected|handleCallSignal/);
  });
});
