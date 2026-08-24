import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUPPORT_EMAIL,
  SUPPORT_FAQ_QUESTIONS,
  SUPPORT_LEGAL_LINKS,
  SUPPORT_MAILTO,
  SUPPORT_QUICK_LINKS,
  SUPPORT_TITLE,
} from "@/content/support";

const page = readFileSync(resolve(process.cwd(), "src/pages/Support.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/support.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const terms = readFileSync(resolve(process.cwd(), "src/pages/Terms.tsx"), "utf8");
const privacy = readFileSync(resolve(process.cwd(), "src/pages/Privacy.tsx"), "utf8");
const copyright = readFileSync(resolve(process.cwd(), "src/pages/Copyright.tsx"), "utf8");
const audio = readFileSync(resolve(process.cwd(), "src/pages/LegalAudio.tsx"), "utf8");
const ugc = readFileSync(resolve(process.cwd(), "src/pages/LegalUGC.tsx"), "utf8");
const affiliate = readFileSync(resolve(process.cwd(), "src/pages/LegalAffiliate.tsx"), "utf8");
const dmca = readFileSync(resolve(process.cwd(), "src/pages/LegalDMCA.tsx"), "utf8");
const legalSafety = readFileSync(resolve(process.cwd(), "src/pages/LegalSafety.tsx"), "utf8");
const supplier = readFileSync(resolve(process.cwd(), "src/pages/LegalSupplier.tsx"), "utf8");
const guidelines = readFileSync(resolve(process.cwd(), "src/pages/Guidelines.tsx"), "utf8");
const how = readFileSync(resolve(process.cwd(), "src/pages/HowItWorks.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const center = readFileSync(resolve(process.cwd(), "src/pages/settings/SafetyCenter.tsx"), "utf8");
const report = readFileSync(resolve(process.cwd(), "src/pages/Report.tsx"), "utf8");
const admin = readFileSync(resolve(process.cwd(), "src/pages/admin/Dashboard.tsx"), "utf8");
const adminReports = readFileSync(resolve(process.cwd(), "src/pages/admin/Reports.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-069 Support ownership", () => {
  it("has one public /support owner and the frozen in-app document", () => {
    expect(app.match(/path="\/support"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/support" element=\{<Support \/>\} \/>/);
    expect(app).not.toMatch(/path="\/help"|path="\/contact"|path="\/help-center"|path="\/support-center"/);
    expect(shell).toMatch(/pathname === "\/support"/);
    expect(SUPPORT_TITLE).toBe("Help & Support");
    expect(SUPPORT_EMAIL).toBe("support@elixstarlive.co.uk");
    expect(SUPPORT_MAILTO).toBe("mailto:support@elixstarlive.co.uk");
    expect(SUPPORT_QUICK_LINKS.map((item) => item.label)).toEqual([
      "Contact Support",
      "Safety Center",
      "Community Guidelines",
    ]);
    expect(SUPPORT_LEGAL_LINKS.map((item) => item.label)).toEqual([
      "Terms of Service",
      "Privacy Policy",
      "Copyright Policy",
    ]);
    expect(SUPPORT_FAQ_QUESTIONS).toEqual([
      "How do I earn coins?",
      "Are digital coin purchases refundable?",
      "Can I get a refund on a shop purchase?",
      "What are battles?",
      "How do I start a live stream?",
      "Can I download my videos?",
      "How do I delete my account?",
      "What content is not allowed?",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/SUPPORT_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).toMatch(/SUPPORT_MAILTO/);
    expect(page).not.toMatch(/LegalDocPage|support\.html|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/SupportV2|SupportFixed|coming soon|lorem ipsum|support\.html/);
    expect(content).not.toMatch(/new Date\(/);
  });

  it("does not invent ticket APIs, live chat, or later admin pages", () => {
    expect(page).not.toMatch(/\/api\/support|\/api\/tickets|\/api\/contact|\/api\/help|apiCreateReport|Message Sent|Sending\.\.\./);
    expect(content).not.toMatch(/\/api\/support|POST \/api\/tickets|GET \/api\/support|ticket number|case number/);
    expect(page).not.toMatch(/<form|type="email"|textarea|Chat with us|live agent|24 hours/);
    expect(hub).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(terms).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(privacy).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(copyright).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(audio).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(ugc).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(affiliate).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(dmca).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(legalSafety).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(supplier).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(guidelines).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(how).toMatch(/HOW_IT_WORKS_SUPPORT_PATH/);
    expect(how).not.toMatch(/SUPPORT_FAQ_ITEMS/);
    expect(settings).toMatch(/go\("\/support"\)/);
    expect(settings).not.toMatch(/SUPPORT_FAQ_ITEMS/);
    expect(center).toMatch(/go\("\/support"\)/);
    expect(center).not.toMatch(/SUPPORT_FAQ_ITEMS/);
    expect(report).toMatch(/export const REPORT_HOME = "\/report"/);
    expect(report).not.toMatch(/SUPPORT_FAQ_ITEMS/);
    expect(admin).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(adminReports).not.toMatch(/SUPPORT_FAQ_ITEMS|\/support/);
    expect(nav).toMatch(/path === "\/support"/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
