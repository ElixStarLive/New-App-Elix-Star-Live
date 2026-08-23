import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/settings/settingsSession.ts"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "src/features/auth/authSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/auth/router.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const store = readFileSync(resolve(process.cwd(), "src/store/useSettingsStore.ts"), "utf8");

describe("PAGE-040 Settings ownership", () => {
  it("has one /settings route and one Settings page owner", () => {
    expect(app.match(/path="\/settings"/g)?.length).toBe(1);
    expect(app).not.toMatch(/path="\/setting"/);
    expect(app).not.toMatch(/path="\/preferences"/);
    expect(app).not.toMatch(/path="\/account\/settings"/);
    expect(app).toMatch(/element=\{<Settings \/>\}/);
    expect(settings).toMatch(/SettingsOptionSheet/);
    expect(settings).not.toMatch(/SettingsV2|SettingsFixed|page-above-bottom-nav/);
  });

  it("uses named Settings navigation and the shared preference store", () => {
    expect(settings).toMatch(/SETTINGS_EXIT_TO/);
    expect(settings).toMatch(/containerReturnState/);
    expect(settings).not.toMatch(/history\.back|navigate\(-1\)|location\.reload|window\.confirm|setTimeout\(/);
    expect(nav).toMatch(/if \(path === SETTINGS_HOME\) return SETTINGS_EXIT_TO/);
    expect(store).toMatch(/name: "elix_settings_v1"/);
    expect(store).toMatch(/liveNotifications/);
    expect(store).toMatch(/muteAllSounds/);
  });

  it("gates admin from authority and always exposes Engagement Hub like OLD", () => {
    expect(settings).toMatch(/user\?\.isAdmin === true/);
    expect(settings).not.toMatch(/admin@|is_admin\s*=\s*true|hardcoded admin/i);
    expect(settings).toMatch(/Engagement Hub/);
    expect(settings).not.toMatch(/isEngagementHubEnabled/);
  });

  it("has one logout owner and one delete owner", () => {
    expect(session).toMatch(/requestSettingsLogout/);
    expect(session).toMatch(/requestSettingsDeleteAccount/);
    expect(session).toMatch(/nativeConfirm/);
    expect(auth).toMatch(/\/api\/auth\/logout/);
    expect(auth).toMatch(/\/api\/auth\/delete/);
    expect(auth).not.toMatch(/\/api\/auth\/delete-account/);
    expect(router).toMatch(/router\.post\("\/logout"/);
    expect(router).toMatch(/router\.post\("\/delete"/);
    expect(router).not.toMatch(/router\.post\("\/delete-account"/);
    expect(settings).toMatch(/requestSettingsLogout\(signOut\)/);
    expect(settings).toMatch(/requestSettingsDeleteAccount\(signOut\)/);
    expect(settings.match(/requestSettingsLogout\(signOut\)/g)?.length).toBe(1);
    expect(settings.match(/requestSettingsDeleteAccount\(signOut\)/g)?.length).toBe(1);
  });
});
