import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGAL_HUB_DMCA_CONTACT,
  LEGAL_HUB_ITEMS,
  LEGAL_HUB_LABELS,
  LEGAL_HUB_PATHS,
  LEGAL_HUB_SUPPORT_CONTACT,
  LEGAL_HUB_TITLE,
} from "@/content/legalHub";

const page = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalHub.ts"), "utf8");
const terms = readFileSync(resolve(process.cwd(), "src/pages/Terms.tsx"), "utf8");
const privacy = readFileSync(resolve(process.cwd(), "src/pages/Privacy.tsx"), "utf8");
const copyright = readFileSync(resolve(process.cwd(), "src/pages/Copyright.tsx"), "utf8");
const audio = readFileSync(resolve(process.cwd(), "src/pages/LegalAudio.tsx"), "utf8");
const ugc = readFileSync(resolve(process.cwd(), "src/pages/LegalUGC.tsx"), "utf8");
const affiliate = readFileSync(resolve(process.cwd(), "src/pages/LegalAffiliate.tsx"), "utf8");
const dmca = readFileSync(resolve(process.cwd(), "src/pages/LegalDMCA.tsx"), "utf8");
const safety = readFileSync(resolve(process.cwd(), "src/pages/LegalSafety.tsx"), "utf8");
const supplier = readFileSync(resolve(process.cwd(), "src/pages/LegalSupplier.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-060 Legal Hub ownership", () => {
  it("has one public /legal owner and the frozen hub inventory", () => {
    expect(app.match(/path="\/legal"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/legal" element=\{<Legal \/>\} \/>/);
    expect(app.indexOf('path="/legal"')).toBeLessThan(app.indexOf("<Route element={<RequireAuth"));
    expect(app).not.toMatch(/path="\/legal-hub"|path="\/legal-center"|path="\/policies"/);
    expect(shell).toMatch(/pathname === "\/legal"/);
    expect(LEGAL_HUB_TITLE).toBe("Legal");
    expect(LEGAL_HUB_LABELS).toEqual([
      "Terms & Conditions",
      "Privacy Policy",
      "Copyright Notice",
      "Audio & Music Disclaimer",
      "UGC Disclaimer",
      "Affiliate / Sponsored Disclosure",
      "Supplier Agreement",
      "DMCA / Copyright Report",
      "Safety",
    ]);
    expect(LEGAL_HUB_PATHS).toHaveLength(9);
    expect(LEGAL_HUB_ITEMS.every((item) => item.icon != null)).toBe(true);
    expect(LEGAL_HUB_DMCA_CONTACT).toBe("dmca@elixstarlive.com");
    expect(LEGAL_HUB_SUPPORT_CONTACT).toBe("support@elixstarlive.co.uk");
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_HUB_TITLE/);
    expect(page).toMatch(/LEGAL_HUB_ITEMS/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).toMatch(/containerReturnState\(LEGAL_HOME\)/);
    expect(page).not.toMatch(/LegalDocPage|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/LegalHubV2|LegalHubFixed|coming soon|lorem ipsum|\/guidelines|\/how-it-works|\/support"/);
  });

  it("does not invent APIs, child documents, or PAGE-061 content", () => {
    expect(page).not.toMatch(/\/api\/legal|GET \/api\/legal\/pages|I Agree|mailto:/);
    expect(content).not.toMatch(/\/api\/legal|POST \/api\/legal/);
    expect(page).not.toMatch(/LEGAL_TERMS_TITLE|LEGAL_PRIVACY_TITLE|LEGAL_COPYRIGHT_SECTIONS|LEGAL_UGC_SECTIONS/);
    expect(terms).not.toMatch(/LEGAL_HUB_ITEMS/);
    expect(privacy).not.toMatch(/LEGAL_HUB_ITEMS/);
    expect(copyright).not.toMatch(/LEGAL_HUB_ITEMS/);
    expect(ugc).toMatch(/LEGAL_UGC_TITLE/);
    expect(ugc).not.toMatch(/LEGAL_HUB_ITEMS/);
    expect(audio).toMatch(/LEGAL_AUDIO_TITLE/);
    expect(audio).not.toMatch(/LEGAL_HUB_ITEMS|LegalDocPage/);
    expect(page).not.toMatch(/LEGAL_AUDIO_SECTIONS/);
    expect(affiliate).toMatch(/LEGAL_AFFILIATE_TITLE/);
    expect(affiliate).not.toMatch(/LEGAL_HUB_ITEMS|LegalDocPage/);
    expect(page).not.toMatch(/LEGAL_AFFILIATE_SECTIONS/);
    expect(dmca).toMatch(/LEGAL_DMCA_TITLE/);
    expect(dmca).not.toMatch(/LEGAL_HUB_ITEMS|LegalDocPage/);
    expect(page).not.toMatch(/LEGAL_DMCA_SECTIONS/);
    expect(safety).toMatch(/LEGAL_SAFETY_TITLE/);
    expect(safety).not.toMatch(/LEGAL_HUB_ITEMS|LegalDocPage/);
    expect(page).not.toMatch(/LEGAL_SAFETY_SECTIONS/);
    expect(supplier).toMatch(/LEGAL_SUPPLIER_TITLE/);
    expect(supplier).not.toMatch(/LEGAL_HUB_ITEMS|LegalDocPage/);
    expect(page).not.toMatch(/LEGAL_SUPPLIER_SECTIONS/);
    expect(nav).toMatch(/export const LEGAL_HOME = "\/legal"/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
