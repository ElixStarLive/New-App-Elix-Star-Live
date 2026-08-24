import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_SAFETY_CONTACT, LEGAL_SAFETY_SECTION_TITLES, LEGAL_SAFETY_TITLE } from "@/content/legalSafety";

const page = readFileSync(resolve(process.cwd(), "src/pages/LegalSafety.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalSafety.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const center = readFileSync(resolve(process.cwd(), "src/pages/settings/SafetyCenter.tsx"), "utf8");
const blocked = readFileSync(resolve(process.cwd(), "src/pages/settings/BlockedAccounts.tsx"), "utf8");
const report = readFileSync(resolve(process.cwd(), "src/pages/Report.tsx"), "utf8");
const ugc = readFileSync(resolve(process.cwd(), "src/pages/LegalUGC.tsx"), "utf8");
const dmca = readFileSync(resolve(process.cwd(), "src/pages/LegalDMCA.tsx"), "utf8");
const supplier = readFileSync(resolve(process.cwd(), "src/pages/LegalSupplier.tsx"), "utf8");
const guidelines = readFileSync(resolve(process.cwd(), "src/pages/Guidelines.tsx"), "utf8");
const support = readFileSync(resolve(process.cwd(), "src/pages/Support.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-065 Legal Safety ownership", () => {
  it("has one public /legal/safety owner separate from PAGE-041", () => {
    expect(app.match(/path="\/legal\/safety"/g)?.length).toBe(1);
    expect(app.match(/path="\/settings\/safety"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/legal\/safety" element=\{<LegalSafety \/>\} \/>/);
    expect(app).toMatch(/<Route path="\/settings\/safety" element=\{<SafetyCenter \/>\} \/>/);
    expect(app).not.toMatch(/path="\/safety-policy"|path="\/legal\/community-safety"|path="\/legal\/trust-safety"/);
    expect(app).not.toMatch(/<Navigate to="\/settings\/safety"/);
    expect(app).not.toMatch(/<Navigate to="\/legal\/safety"/);
    expect(shell).toMatch(/pathname\.startsWith\("\/legal\/"\)/);
    expect(LEGAL_SAFETY_TITLE).toBe("Safety Centre");
    expect(LEGAL_SAFETY_CONTACT).toBe("safety@elixstarlive.com");
    expect(LEGAL_SAFETY_SECTION_TITLES).toEqual([
      "Reporting Content",
      "Blocking Users",
      "Live Stream Safety",
      "Content Moderation",
      "Child Safety",
      "Emergency Resources",
      "Contact Us",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_SAFETY_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).not.toMatch(/LegalDocPage|child-safety\.html|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(page).not.toMatch(/SAFETY_HOME|\/settings\/safety/);
    expect(content).not.toMatch(/LegalSafetyV2|LegalSafetyFixed|coming soon|lorem ipsum|child-safety\.html/);
    expect(content).not.toMatch(/new Date\(/);
    expect(center).toMatch(/export const SAFETY_HOME = "\/settings\/safety"/);
    expect(center).not.toMatch(/LEGAL_SAFETY_SECTIONS|\/legal\/safety/);
  });

  it("does not invent APIs, tools, Supplier, or later legal pages", () => {
    expect(page).not.toMatch(/\/api\/safety|POST \/api\/report|emergencyApi|I Agree|mailto:/);
    expect(content).not.toMatch(/\/api\/safety|POST \/api\/legal|GET \/api\/safety/);
    expect(page).not.toMatch(/<form|type="file"|input type/);
    expect(hub).toMatch(/LEGAL_HUB_ITEMS/);
    expect(hub).not.toMatch(/LEGAL_SAFETY_SECTIONS/);
    expect(ugc).not.toMatch(/LEGAL_SAFETY_SECTIONS|\/legal\/safety/);
    expect(dmca).not.toMatch(/LEGAL_SAFETY_SECTIONS|\/legal\/safety/);
    expect(blocked).not.toMatch(/LEGAL_SAFETY_SECTIONS|\/legal\/safety/);
    expect(report).not.toMatch(/LEGAL_SAFETY_SECTIONS|\/legal\/safety/);
    expect(supplier).toMatch(/LEGAL_SUPPLIER_TITLE/);
    expect(supplier).not.toMatch(/LEGAL_SAFETY_SECTIONS|LegalDocPage/);
    expect(guidelines).toMatch(/GUIDELINES_TITLE/);
    expect(guidelines).not.toMatch(/LEGAL_SAFETY_SECTIONS|PageScaffold|LegalDocPage/);
    expect(support).toMatch(/SUPPORT_TITLE/);
    expect(support).not.toMatch(/LEGAL_SAFETY_SECTIONS|LegalDocPage/);
    expect(nav).toMatch(/path\.startsWith\(`\$\{LEGAL_HOME\}\/`\)/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
