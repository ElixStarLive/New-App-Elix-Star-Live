import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/settings/SafetyCenter.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");

describe("PAGE-041 Safety Center ownership", () => {
  it("has one /settings/safety owner on the Settings option sheet", () => {
    expect(app.match(/path="\/settings\/safety"/g)?.length).toBe(1);
    expect(app).not.toMatch(/path="\/safety"/);
    expect(app).not.toMatch(/path="\/privacy\/safety"/);
    expect(app).not.toMatch(/path="\/settings\/privacy-safety"/);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).not.toMatch(/SettingsSubpage|SafetyCenterV2|SafetyCenterFixed|page-above-bottom-nav/);
    expect(page).not.toMatch(/history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket/);
    expect(page).not.toMatch(/\/api\/report|apiCreateReport|blocked users|safety score/);
  });

  it("hands off Blocked, Report, and Guidelines without owning those pages", () => {
    expect(page).toMatch(/\/settings\/blocked/);
    expect(page).toMatch(/\/report\?type=support&id=support_ticket/);
    expect(page).toMatch(/\/guidelines/);
    expect(page).toMatch(/\/edit-profile/);
    expect(page).toMatch(/\/privacy/);
    expect(page).toMatch(/\/support/);
    expect(page).not.toMatch(/POST \/api\/report|unblock|blocked-users/);
    expect(settings).toMatch(/go\("\/settings\/safety"\)/);
    expect(nav).toMatch(/if \(path === SETTINGS_HOME\) return SETTINGS_EXIT_TO/);
  });
});
