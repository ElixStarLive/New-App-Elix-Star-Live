import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGAL_DMCA_CONTACT,
  LEGAL_DMCA_MAILTO_HREF,
  LEGAL_DMCA_MAILTO_LABEL,
  LEGAL_DMCA_SECTION_TITLES,
  LEGAL_DMCA_TITLE,
} from "@/content/legalDmca";

const page = readFileSync(resolve(process.cwd(), "src/pages/LegalDMCA.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalDmca.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const copyright = readFileSync(resolve(process.cwd(), "src/pages/Copyright.tsx"), "utf8");
const audio = readFileSync(resolve(process.cwd(), "src/pages/LegalAudio.tsx"), "utf8");
const ugc = readFileSync(resolve(process.cwd(), "src/pages/LegalUGC.tsx"), "utf8");
const safety = readFileSync(resolve(process.cwd(), "src/pages/LegalSafety.tsx"), "utf8");
const supplier = readFileSync(resolve(process.cwd(), "src/pages/LegalSupplier.tsx"), "utf8");
const affiliate = readFileSync(resolve(process.cwd(), "src/pages/LegalAffiliate.tsx"), "utf8");
const report = readFileSync(resolve(process.cwd(), "src/pages/Report.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-064 Legal DMCA ownership", () => {
  it("has one public /legal/dmca owner and the frozen in-app document", () => {
    expect(app.match(/path="\/legal\/dmca"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/legal\/dmca" element=\{<LegalDMCA \/>\} \/>/);
    expect(app).not.toMatch(/path="\/dmca"|path="\/copyright\/dmca"|path="\/legal\/copyright\/dmca"/);
    expect(shell).toMatch(/pathname\.startsWith\("\/legal\/"\)/);
    expect(LEGAL_DMCA_TITLE).toBe("DMCA / Copyright Policy");
    expect(LEGAL_DMCA_CONTACT).toBe("dmca@elixstarlive.com");
    expect(LEGAL_DMCA_MAILTO_LABEL).toBe("Email DMCA Agent");
    expect(LEGAL_DMCA_MAILTO_HREF).toBe("mailto:dmca@elixstarlive.com?subject=DMCA%20Notice%20-%20ElixStarLive");
    expect(LEGAL_DMCA_SECTION_TITLES).toEqual([
      "Copyright Infringement Notification",
      "Counter-Notification",
      "Repeat Infringers",
      "Contact Our DMCA Agent",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_DMCA_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).toMatch(/LEGAL_DMCA_MAILTO_HREF/);
    expect(page).not.toMatch(/LegalDocPage|terms\.html|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/DMCAv2|DMCAFixed|coming soon|lorem ipsum|terms\.html|DMCA-12345/);
    expect(content).not.toMatch(/new Date\(/);
  });

  it("does not invent APIs, forms, Safety, or admin processing", () => {
    expect(page).not.toMatch(/\/api\/dmca|POST \/api\/copyright|submitClaim|caseId|I Agree/);
    expect(content).not.toMatch(/\/api\/dmca|POST \/api\/legal|GET \/api\/dmca/);
    expect(page).not.toMatch(/<form|type="file"|input type/);
    expect(hub).toMatch(/LEGAL_HUB_ITEMS/);
    expect(hub).not.toMatch(/LEGAL_DMCA_SECTIONS/);
    expect(copyright).toMatch(/LEGAL_COPYRIGHT_DMCA_PATH/);
    expect(copyright).not.toMatch(/LEGAL_DMCA_SECTIONS/);
    expect(ugc).toMatch(/LEGAL_UGC_DMCA_PATH/);
    expect(ugc).not.toMatch(/LEGAL_DMCA_SECTIONS/);
    expect(audio).not.toMatch(/LEGAL_DMCA_SECTIONS|LEGAL_UGC_DMCA_PATH|\/legal\/dmca/);
    expect(affiliate).not.toMatch(/LEGAL_DMCA_SECTIONS|\/legal\/dmca/);
    expect(safety).toMatch(/LEGAL_SAFETY_TITLE/);
    expect(safety).not.toMatch(/LEGAL_DMCA_SECTIONS|LegalDocPage/);
    expect(supplier).toMatch(/LEGAL_SUPPLIER_TITLE/);
    expect(supplier).not.toMatch(/LEGAL_DMCA_SECTIONS|LegalDocPage/);
    expect(report).not.toMatch(/LEGAL_DMCA_SECTIONS|\/legal\/dmca/);
    expect(nav).toMatch(/path\.startsWith\(`\$\{LEGAL_HOME\}\/`\)/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
