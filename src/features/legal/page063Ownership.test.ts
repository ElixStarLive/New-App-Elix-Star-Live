import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGAL_AFFILIATE_CONTACT,
  LEGAL_AFFILIATE_SECTION_TITLES,
  LEGAL_AFFILIATE_TITLE,
} from "@/content/legalAffiliate";

const page = readFileSync(resolve(process.cwd(), "src/pages/LegalAffiliate.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalAffiliate.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const ugc = readFileSync(resolve(process.cwd(), "src/pages/LegalUGC.tsx"), "utf8");
const dmca = readFileSync(resolve(process.cwd(), "src/pages/LegalDMCA.tsx"), "utf8");
const safety = readFileSync(resolve(process.cwd(), "src/pages/LegalSafety.tsx"), "utf8");
const supplier = readFileSync(resolve(process.cwd(), "src/pages/LegalSupplier.tsx"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "src/pages/CreatorPayout.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-063 Legal Affiliate ownership", () => {
  it("has one public /legal/affiliate owner and the frozen in-app document", () => {
    expect(app.match(/path="\/legal\/affiliate"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/legal\/affiliate" element=\{<LegalAffiliate \/>\} \/>/);
    expect(app).not.toMatch(/path="\/affiliate"|path="\/affiliate-terms"|path="\/legal\/referrals"/);
    expect(shell).toMatch(/pathname\.startsWith\("\/legal\/"\)/);
    expect(LEGAL_AFFILIATE_TITLE).toBe("Affiliate & Sponsored Content");
    expect(LEGAL_AFFILIATE_CONTACT).toBe("legal@elixstarlive.com");
    expect(LEGAL_AFFILIATE_SECTION_TITLES).toEqual([
      "Disclosure",
      "Creator Responsibilities",
      "Platform Partnerships",
      "User Protection",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_AFFILIATE_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).not.toMatch(/LegalDocPage|terms\.html|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/LegalAffiliateV2|AffiliateFixed|coming soon|lorem ipsum|terms\.html|referral code|commission rate/);
    expect(content).not.toMatch(/new Date\(/);
  });

  it("does not invent APIs, payouts, or later legal pages", () => {
    expect(page).not.toMatch(/\/api\/affiliate|signupAffiliate|Stripe|I Agree|mailto:/);
    expect(content).not.toMatch(/\/api\/affiliate|POST \/api\/legal|GET \/api\/affiliate/);
    expect(hub).toMatch(/LEGAL_HUB_ITEMS/);
    expect(hub).not.toMatch(/LEGAL_AFFILIATE_SECTIONS/);
    expect(ugc).not.toMatch(/LEGAL_AFFILIATE_SECTIONS/);
    expect(dmca).toMatch(/LEGAL_DMCA_TITLE/);
    expect(dmca).not.toMatch(/LEGAL_AFFILIATE_SECTIONS|LegalDocPage/);
    expect(safety).toMatch(/LEGAL_SAFETY_TITLE/);
    expect(safety).not.toMatch(/LEGAL_AFFILIATE_SECTIONS|LegalDocPage/);
    expect(supplier).toMatch(/LEGAL_SUPPLIER_TITLE/);
    expect(supplier).not.toMatch(/LEGAL_AFFILIATE_SECTIONS|LegalDocPage/);
    expect(payout).not.toMatch(/LEGAL_AFFILIATE_SECTIONS|\/legal\/affiliate/);
    expect(nav).toMatch(/path\.startsWith\(`\$\{LEGAL_HOME\}\/`\)/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
