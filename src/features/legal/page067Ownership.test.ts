import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GUIDELINES_REPORT_PATH,
  GUIDELINES_SECTION_TITLES,
  GUIDELINES_TITLE,
  GUIDELINES_UPDATED,
} from "@/content/guidelines";

const page = readFileSync(resolve(process.cwd(), "src/pages/Guidelines.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/guidelines.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const ugc = readFileSync(resolve(process.cwd(), "src/pages/LegalUGC.tsx"), "utf8");
const safety = readFileSync(resolve(process.cwd(), "src/pages/LegalSafety.tsx"), "utf8");
const supplier = readFileSync(resolve(process.cwd(), "src/pages/LegalSupplier.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const center = readFileSync(resolve(process.cwd(), "src/pages/settings/SafetyCenter.tsx"), "utf8");
const report = readFileSync(resolve(process.cwd(), "src/pages/Report.tsx"), "utf8");
const how = readFileSync(resolve(process.cwd(), "src/pages/HowItWorks.tsx"), "utf8");
const support = readFileSync(resolve(process.cwd(), "src/pages/Support.tsx"), "utf8");
const adminReports = readFileSync(resolve(process.cwd(), "src/pages/admin/Reports.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-067 Guidelines ownership", () => {
  it("has one public /guidelines owner and the frozen in-app document", () => {
    expect(app.match(/path="\/guidelines"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/guidelines" element=\{<Guidelines \/>\} \/>/);
    expect(app).not.toMatch(/path="\/community-guidelines"|path="\/rules"|path="\/legal\/guidelines"/);
    expect(shell).toMatch(/pathname === "\/guidelines"/);
    expect(GUIDELINES_TITLE).toBe("Community Guidelines");
    expect(GUIDELINES_UPDATED).toBe("Last updated: February 4, 2026");
    expect(GUIDELINES_REPORT_PATH).toBe("/report");
    expect(GUIDELINES_SECTION_TITLES).toEqual([
      "Be Kind and Respectful",
      "Keep Content Safe",
      "Be Authentic",
      "Respect Intellectual Property",
      "No Illegal Activities",
      "Consequences",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/GUIDELINES_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).toMatch(/GUIDELINES_REPORT_PATH/);
    expect(page).not.toMatch(/LegalDocPage|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/GuidelinesV2|GuidelinesFixed|coming soon|lorem ipsum|community-guidelines\.html/);
    expect(content).not.toMatch(/new Date\(/);
  });

  it("does not invent APIs, How It Works, Support, or admin moderation", () => {
    expect(page).not.toMatch(/\/api\/guidelines|\/api\/report|apiCreateReport|strike|content.?scan|I Agree/);
    expect(content).not.toMatch(/\/api\/guidelines|POST \/api\/legal|GET \/api\/guidelines|strike/);
    expect(page).not.toMatch(/<form|type="file"|input type|aria-expanded/);
    expect(hub).toMatch(/LEGAL_HUB_ITEMS/);
    expect(hub).not.toMatch(/GUIDELINES_SECTIONS|\/guidelines/);
    expect(ugc).not.toMatch(/GUIDELINES_SECTIONS|\/guidelines/);
    expect(safety).not.toMatch(/GUIDELINES_SECTIONS|\/guidelines/);
    expect(supplier).not.toMatch(/GUIDELINES_SECTIONS|\/guidelines/);
    expect(settings).toMatch(/go\("\/guidelines"\)/);
    expect(settings).not.toMatch(/GUIDELINES_SECTIONS/);
    expect(center).toMatch(/go\("\/guidelines"\)/);
    expect(center).not.toMatch(/GUIDELINES_SECTIONS/);
    expect(report).toMatch(/export const REPORT_HOME = "\/report"/);
    expect(report).not.toMatch(/GUIDELINES_SECTIONS/);
    expect(how).toMatch(/HOW_IT_WORKS_TITLE/);
    expect(how).not.toMatch(/GUIDELINES_SECTIONS|PageScaffold/);
    expect(support).toMatch(/SUPPORT_TITLE/);
    expect(support).not.toMatch(/GUIDELINES_SECTIONS|LegalDocPage/);
    expect(adminReports).not.toMatch(/GUIDELINES_SECTIONS|\/guidelines/);
    expect(nav).toMatch(/path === "\/guidelines"/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
