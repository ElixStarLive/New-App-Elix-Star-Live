import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGAL_PRIVACY_SECTION_TITLES,
  LEGAL_PRIVACY_TITLE,
  LEGAL_PRIVACY_UPDATED_LABEL,
} from "@/content/legalPrivacy";

const page = readFileSync(resolve(process.cwd(), "src/pages/Privacy.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalPrivacy.ts"), "utf8");
const terms = readFileSync(resolve(process.cwd(), "src/pages/Terms.tsx"), "utf8");
const register = readFileSync(resolve(process.cwd(), "src/pages/Register.tsx"), "utf8");
const login = readFileSync(resolve(process.cwd(), "src/pages/Login.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const legalHub = readFileSync(resolve(process.cwd(), "src/content/legalHub.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-058 Privacy ownership", () => {
  it("has one public /privacy SPA owner and the frozen in-app document", () => {
    expect(app.match(/path="\/privacy"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/privacy" element=\{<Privacy \/>\} \/>/);
    expect(app.indexOf('path="/privacy"')).toBeLessThan(app.indexOf("<Route element={<RequireAuth"));
    expect(app).not.toMatch(/path="\/legal\/privacy"|path="\/privacy-policy"|path="\/privacypolicy"/);
    expect(shell).toMatch(/pathname === "\/privacy"/);
    expect(LEGAL_PRIVACY_TITLE).toBe("Privacy Policy");
    expect(LEGAL_PRIVACY_UPDATED_LABEL).toBe("Last updated: February 20, 2026");
    expect(LEGAL_PRIVACY_SECTION_TITLES).toHaveLength(14);
    expect(LEGAL_PRIVACY_SECTION_TITLES[0]).toBe("1. Information We Collect");
    expect(LEGAL_PRIVACY_SECTION_TITLES[13]).toBe("14. Contact Us");
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_PRIVACY_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).toMatch(/LEGAL_PRIVACY_SECTIONS/);
    expect(page).not.toMatch(/LegalDocPage|privacy\.html|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/PrivacyV2|PrivacyFixed|lorem ipsum|coming soon/);
    expect(content).not.toMatch(/new Date\(/);
    expect(content).toMatch(/February 20, 2026/);
    expect(content).not.toMatch(/July 21, 2026/);
  });

  it("does not invent APIs and keeps handoffs + Terms separation", () => {
    expect(page).not.toMatch(/\/api\/privacy|acceptPrivacy|mailto:/);
    expect(content).not.toMatch(/\/api\/privacy|POST \/api\/legal/);
    expect(register).toMatch(/to="\/privacy"/);
    expect(register).toMatch(/containerReturnState\("\/register"\)/);
    expect(login).not.toMatch(/to="\/privacy"|navigate\("\/privacy"/);
    expect(settings).toMatch(/go\("\/privacy"\)/);
    expect(legalHub).toMatch(/path: "\/privacy"/);
    expect(terms).not.toMatch(/LEGAL_PRIVACY_TITLE|LEGAL_PRIVACY_SECTIONS/);
    expect(nav).toMatch(/path === "\/privacy"/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
