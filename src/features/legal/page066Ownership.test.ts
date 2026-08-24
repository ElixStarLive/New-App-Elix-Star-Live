import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGAL_SUPPLIER_BUSINESS,
  LEGAL_SUPPLIER_COMPANY,
  LEGAL_SUPPLIER_SECTION_TITLES,
  LEGAL_SUPPLIER_SUPPORT,
  LEGAL_SUPPLIER_TITLE,
  LEGAL_SUPPLIER_UPDATED,
} from "@/content/legalSupplier";

const page = readFileSync(resolve(process.cwd(), "src/pages/LegalSupplier.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalSupplier.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const affiliate = readFileSync(resolve(process.cwd(), "src/pages/LegalAffiliate.tsx"), "utf8");
const safety = readFileSync(resolve(process.cwd(), "src/pages/LegalSafety.tsx"), "utf8");
const guidelines = readFileSync(resolve(process.cwd(), "src/pages/Guidelines.tsx"), "utf8");
const support = readFileSync(resolve(process.cwd(), "src/pages/Support.tsx"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "src/pages/CreatorPayout.tsx"), "utf8");
const shop = readFileSync(resolve(process.cwd(), "src/pages/Shop.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-066 Legal Supplier ownership", () => {
  it("has one public /legal/supplier owner and the frozen in-app document", () => {
    expect(app.match(/path="\/legal\/supplier"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/legal\/supplier" element=\{<LegalSupplier \/>\} \/>/);
    expect(app).not.toMatch(/path="\/supplier"|path="\/supplier-terms"|path="\/legal\/vendor"/);
    expect(shell).toMatch(/pathname\.startsWith\("\/legal\/"\)/);
    expect(LEGAL_SUPPLIER_TITLE).toBe("Supplier Agreement");
    expect(LEGAL_SUPPLIER_UPDATED).toBe("Last updated: July 15, 2026");
    expect(LEGAL_SUPPLIER_COMPANY).toBe("Elix Star Live Ltd");
    expect(LEGAL_SUPPLIER_BUSINESS).toBe("info@elixstarlive.co.uk");
    expect(LEGAL_SUPPLIER_SUPPORT).toBe("support@elixstarlive.co.uk");
    expect(LEGAL_SUPPLIER_SECTION_TITLES).toEqual([
      "1. Parties",
      "2. Supply of Goods",
      "3. Compliance & Product Safety",
      "4. Intellectual Property",
      "5. Pricing, Invoices & Payment",
      "6. Title, Risk & Returns",
      "7. Confidentiality",
      "8. Liability & Indemnity",
      "9. Term & Termination",
      "10. Governing Law",
      "11. Contact",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_SUPPLIER_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).not.toMatch(/LegalDocPage|supplier-agreement\.html|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/LegalSupplierV2|SupplierFixed|coming soon|lorem ipsum|supplier-agreement\.html/);
    expect(content).not.toMatch(/new Date\(/);
  });

  it("does not invent APIs, Affiliate merge, Guidelines, or admin payments", () => {
    expect(page).not.toMatch(/\/api\/supplier|signupSupplier|Stripe|I Agree|mailto:/);
    expect(content).not.toMatch(/\/api\/supplier|POST \/api\/legal|GET \/api\/supplier/);
    expect(page).not.toMatch(/<form|type="file"|input type/);
    expect(hub).toMatch(/LEGAL_HUB_ITEMS/);
    expect(hub).not.toMatch(/LEGAL_SUPPLIER_SECTIONS/);
    expect(affiliate).not.toMatch(/LEGAL_SUPPLIER_SECTIONS|\/legal\/supplier/);
    expect(safety).not.toMatch(/LEGAL_SUPPLIER_SECTIONS|\/legal\/supplier/);
    expect(guidelines).toMatch(/GUIDELINES_TITLE/);
    expect(guidelines).not.toMatch(/LEGAL_SUPPLIER_SECTIONS|PageScaffold/);
    expect(guidelines).not.toMatch(/LEGAL_SUPPLIER_SECTIONS/);
    expect(support).toMatch(/SUPPORT_TITLE/);
    expect(support).not.toMatch(/LEGAL_SUPPLIER_SECTIONS|LegalDocPage/);
    expect(payout).not.toMatch(/LEGAL_SUPPLIER_SECTIONS|\/legal\/supplier/);
    expect(shop).not.toMatch(/LEGAL_SUPPLIER_SECTIONS|\/legal\/supplier/);
    expect(nav).toMatch(/path\.startsWith\(`\$\{LEGAL_HOME\}\/`\)/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
