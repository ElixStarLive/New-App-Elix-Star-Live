import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOW_IT_WORKS_ENGAGEMENT_PATH,
  HOW_IT_WORKS_GUIDELINES_PATH,
  HOW_IT_WORKS_SECTION_TITLES,
  HOW_IT_WORKS_SUPPORT_PATH,
  HOW_IT_WORKS_TITLE,
  HOW_IT_WORKS_UPDATED,
} from "@/content/howItWorks";

const page = readFileSync(resolve(process.cwd(), "src/pages/HowItWorks.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/howItWorks.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const guidelines = readFileSync(resolve(process.cwd(), "src/pages/Guidelines.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const support = readFileSync(resolve(process.cwd(), "src/pages/Support.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-068 How It Works ownership", () => {
  it("has one public /how-it-works owner and the frozen in-app document", () => {
    expect(app.match(/path="\/how-it-works"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/how-it-works" element=\{<HowItWorks \/>\} \/>/);
    expect(app.indexOf('path="/how-it-works"')).toBeLessThan(app.indexOf("<Route element={<RequireAuth"));
    expect(app).not.toMatch(/path="\/how"|path="\/help\/how-it-works"|path="\/getting-started"/);
    expect(shell).toMatch(/pathname === "\/how-it-works"/);
    expect(HOW_IT_WORKS_TITLE).toBe("How the app works");
    expect(HOW_IT_WORKS_UPDATED).toBe("Full guide for fans and creators. Last updated: August 5, 2026");
    expect(HOW_IT_WORKS_ENGAGEMENT_PATH).toBe("/engagement");
    expect(HOW_IT_WORKS_SUPPORT_PATH).toBe("/support");
    expect(HOW_IT_WORKS_GUIDELINES_PATH).toBe("/guidelines");
    expect(HOW_IT_WORKS_SECTION_TITLES).toEqual([
      "Main tabs",
      "Videos, sound & duets",
      "Going LIVE & watching",
      "Battles (PK)",
      "Gifts, coins & shop",
      "Creator monetisation (how you earn)",
      "Engagement Hub",
      "Ranking & membership",
      "Social & inbox",
      "Safety & account",
      "Quick tips",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/HOW_IT_WORKS_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).not.toMatch(/LegalDocPage|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/HowItWorksV2|HowItWorksFixed|coming soon|lorem ipsum|tutorial progress/);
    expect(content).not.toMatch(/new Date\(/);
  });

  it("does not invent APIs, Support, or product mutation", () => {
    expect(page).not.toMatch(/\/api\/how-it-works|\/api\/tutorial|getUserMedia|LiveKit|Stripe\(|I Agree/);
    expect(content).not.toMatch(/\/api\/how-it-works|POST \/api\/tutorial|GET \/api\/how-it-works/);
    expect(page).not.toMatch(/<form|type="file"|input type|aria-expanded/);
    expect(hub).not.toMatch(/HOW_IT_WORKS_SECTIONS|\/how-it-works/);
    expect(guidelines).toMatch(/GUIDELINES_TITLE/);
    expect(guidelines).not.toMatch(/HOW_IT_WORKS_SECTIONS/);
    expect(settings).toMatch(/go\("\/how-it-works"\)/);
    expect(settings).not.toMatch(/HOW_IT_WORKS_SECTIONS/);
    expect(support).toMatch(/SUPPORT_TITLE/);
    expect(support).not.toMatch(/HOW_IT_WORKS_SECTIONS|LegalDocPage/);
    expect(support).not.toMatch(/HOW_IT_WORKS_SECTIONS/);
    expect(nav).toMatch(/path === "\/how-it-works"/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
