import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_TERMS_SECTION_TITLES, LEGAL_TERMS_TITLE, LEGAL_TERMS_UPDATED_LABEL } from "@/content/legalTerms";

const page = readFileSync(resolve(process.cwd(), "src/pages/Terms.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalTerms.ts"), "utf8");
const privacy = readFileSync(resolve(process.cwd(), "src/pages/Privacy.tsx"), "utf8");
const register = readFileSync(resolve(process.cwd(), "src/pages/Register.tsx"), "utf8");
const login = readFileSync(resolve(process.cwd(), "src/pages/Login.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-057 Terms ownership", () => {
  it("has one public /terms owner and the frozen in-app document", () => {
    expect(app.match(/path="\/terms"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/terms" element=\{<Terms \/>\} \/>/);
    expect(app).not.toMatch(/path="\/legal\/terms"|path="\/terms-of-service"|path="\/tos"/);
    expect(shell).toMatch(/pathname === "\/terms"/);
    expect(LEGAL_TERMS_TITLE).toBe("Terms of Service");
    expect(LEGAL_TERMS_UPDATED_LABEL).toBe("Last updated: July 23, 2026");
    expect(LEGAL_TERMS_SECTION_TITLES).toHaveLength(27);
    expect(LEGAL_TERMS_SECTION_TITLES[0]).toBe("1. About the Service");
    expect(LEGAL_TERMS_SECTION_TITLES[26]).toBe("27. Contact");
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_TERMS_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).toMatch(/legalTermsSections\(platform\.isIOS\)/);
    expect(page).not.toMatch(/LegalDocPage|terms\.html|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/terms\.html|TermsV2|TermsFixed|lorem ipsum|coming soon/);
    expect(content).not.toMatch(/new Date\(/);
  });

  it("does not invent APIs, acceptance, or PAGE-058", () => {
    expect(page).not.toMatch(/\/api\/terms|acceptTerms|I Agree|mailto:/);
    expect(content).not.toMatch(/\/api\/terms|POST \/api\/legal/);
    expect(register).toMatch(/to="\/terms"/);
    expect(register).toMatch(/containerReturnState\("\/register"\)/);
    expect(login).not.toMatch(/to="\/terms"|navigate\("\/terms"/);
    expect(settings).toMatch(/go\("\/terms"\)/);
    expect(privacy).not.toMatch(/LEGAL_TERMS_TITLE|legalTermsSections/);
    expect(privacy).toMatch(/LEGAL_PRIVACY_TITLE/);
    expect(nav).toMatch(/path === "\/terms"/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
